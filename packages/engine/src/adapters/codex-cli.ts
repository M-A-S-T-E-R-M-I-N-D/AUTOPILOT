// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * A ModelPort over the OpenAI Codex CLI (epic 0036,
 * docs/epics/0036-provider-parity.md), split like `claude-cli.ts` into a pure
 * parse ({@link parseCodexExecOutput}, fixture-tested) and the impure spawn
 * ({@link CodexCliModel}) that feeds it `codex exec --json` stdout.
 *
 * The wire format is the `ThreadEvent` enum in openai/codex
 * `codex-rs/exec/src/exec_events.rs` — one JSON object per line, tagged by
 * `type`: `thread.started` (`thread_id`), `turn.started`, `turn.completed`
 * (`usage`), `turn.failed` (`error.message`), `item.started|updated|completed`
 * (`item.type` e.g. `agent_message` with `text`), and `error` (`message`).
 *
 * What the CLI does NOT report, and so this parse never invents:
 * - Cost. `usage` carries token counts only, never a priced figure, so
 *   `costUsd` is always `null` — no per-token price table lives in this repo
 *   (`ports.ts`, `firing.ts` §3.6: cost is never computed from tokens).
 * - Model, duration, turn count, stop reason. No event carries them, so they
 *   are `null`; `modelUsed` is the model the engine REQUESTED, since nothing
 *   on the wire attests the one that ran. {@link CodexCliModel} times the run
 *   itself and reports that as `observed.elapsedMs`, with no turn count.
 */

import { execFile, type ExecFileOptions } from 'node:child_process';
import type { ModelEnvelope, ModelPort, ModelResponse } from '../ports.js';
import {
  activityFromToolCall,
  WEB_SEARCH_AUDIT_MAX_CHARS,
  type Activity,
  type MessageUsage,
  type WebSearchAudit,
} from '../stream.js';
import {
  reapCliDescendants,
  cliDeathText,
  isCliTimeoutDeath,
  isResumeFailure,
  CLI_STDIN_PROMPT_THRESHOLD,
  DEFAULT_CLI_IDLE_TIMEOUT_MS,
  DEFAULT_CLI_TIMEOUT_MS,
} from './claude-cli.js';
import { GUARD_TIMEOUT_S } from '../guard.js';
import { buildInvocation, CMD_SAFE_ARG } from './gate.js';
import { resolveNpmShim } from './npm-shim.js';

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function recordOrEmpty(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

/** Every line of `stdout` that parses as a JSON object; anything else (a
 *  stray log line, a line torn by a kill) is skipped, never fatal. */
function jsonObjectLines(stdout: string): readonly Record<string, unknown>[] {
  return stdout.split('\n').flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) return [];
    try {
      return [recordOrEmpty(JSON.parse(trimmed))];
    } catch {
      return [];
    }
  });
}

interface CodexTokens {
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly cacheRead: number | null;
  readonly cacheCreate: number | null;
}

const NO_TOKENS: CodexTokens = {
  tokensIn: null,
  tokensOut: null,
  cacheRead: null,
  cacheCreate: null,
};

/**
 * Codex's `input_tokens` INCLUDES the cached ones (its own `TokenUsage::
 * non_cached_input` is `input_tokens - cached_input_tokens`, floored at 0),
 * while `ModelEnvelope.tokensIn` means uncached input as `claude -p` reports
 * it — so the cached share moves to `cacheRead` instead of being counted twice.
 * `cache_write_input_tokens` is absent from older CLIs: absent stays `null`.
 */
function tokensFromUsage(usage: unknown): CodexTokens {
  const u = recordOrEmpty(usage);
  const input = numOrNull(u['input_tokens']);
  const cached = numOrNull(u['cached_input_tokens']);
  return {
    tokensIn: input === null ? null : Math.max(0, input - Math.max(0, cached ?? 0)),
    tokensOut: numOrNull(u['output_tokens']),
    cacheRead: cached,
    cacheCreate: numOrNull(u['cache_write_input_tokens']),
  };
}

/**
 * Parse one `codex exec --json` run. The terminal event decides the envelope:
 * the LAST `turn.completed` is a pass whose `result` is the last
 * `agent_message`; the last `turn.failed` is a failure whose `result` is its
 * error message. With neither — the process was killed, or died before a turn
 * ended — the envelope is `null`, the same "abnormal exit" signal a missing
 * `claude -p` result envelope gives, while the `thread_id` already seen on the
 * wire still rides out as `sessionId` so the attempt stays resumable.
 *
 * A bare `error` event is NOT terminal: Codex emits one for a stream error it
 * may retry, and reports a turn that really failed as `turn.failed`. An
 * `item.completed` of type `error` is a warning (config, deprecation, model
 * reroute), not a failure. Usage is the thread's RUNNING total, so the last
 * `turn.completed` wins rather than a sum.
 */
export function parseCodexExecOutput(
  stdout: string,
  exitCode: number,
  requestedModel: string,
): ModelResponse {
  let sessionId: string | null = null;
  let lastMessage: string | null = null;
  let terminal: Record<string, unknown> | null = null;

  for (const event of jsonObjectLines(stdout)) {
    const type = event['type'];
    if (type === 'thread.started') {
      sessionId ??= strOrNull(event['thread_id']);
    } else if (type === 'item.completed') {
      const item = recordOrEmpty(event['item']);
      if (item['type'] === 'agent_message') lastMessage = strOrNull(item['text']) ?? lastMessage;
    } else if (type === 'turn.completed' || type === 'turn.failed') {
      terminal = event;
    }
  }

  if (terminal === null) return { stdout, exitCode, envelope: null, sessionId };

  const failed = terminal['type'] === 'turn.failed';
  const tokens = failed ? NO_TOKENS : tokensFromUsage(terminal['usage']);
  const envelope: ModelEnvelope = {
    result: failed ? strOrNull(recordOrEmpty(terminal['error'])['message']) : lastMessage,
    isError: failed,
    apiErrorStatus: null,
    costUsd: null,
    numTurns: null,
    durationMs: null,
    stopReason: null,
    modelUsed: requestedModel === '' ? null : requestedModel,
    ...tokens,
    sessionId,
  };
  return { stdout, exitCode, envelope, sessionId };
}

/**
 * The queries one web search ran. A `search` action's own `query` and
 * `queries` come first: the item's `query` is only Codex's display detail
 * (core/src/web_search.rs `web_search_action_detail`), which keeps the first
 * of several queries and elides the rest as " ...". Any other action (a page
 * opened, or searched within) and a CLI that sends no action fall back to
 * that detail, the URL or pattern the tool was sent.
 */
function webSearchQueries(item: Record<string, unknown>): readonly string[] {
  const action = recordOrEmpty(item['action']);
  if (action['type'] === 'search') {
    const listed = Array.isArray(action['queries']) ? action['queries'] : [];
    const queries = [action['query'], ...listed].filter(
      (q): q is string => typeof q === 'string' && q.length > 0,
    );
    if (queries.length > 0) return [...new Set(queries)];
  }
  const detail = strOrNull(item['query']);
  return detail === null || detail.length === 0 ? [] : [detail];
}

/**
 * The web searches one `codex exec --json` event reports, as the audit keeps
 * them (THREAT-MODEL T6): the records `stream.ts`'s `webSearchesFromEvent`
 * lifts off a Claude stream, one per query. Only `item.completed` counts:
 * the started item carries an empty query, since the query is known only once
 * the search ran (ext/web-search/src/tool.rs), so a search is audited once.
 * No action carries a domain filter (`WebSearchAction`,
 * codex-rs/protocol/src/models.rs), so both filter lists are empty.
 */
export function codexWebSearchesFromEvent(
  event: Record<string, unknown>,
): readonly WebSearchAudit[] {
  if (event['type'] !== 'item.completed') return [];
  const item = recordOrEmpty(event['item']);
  if (item['type'] !== 'web_search') return [];
  return webSearchQueries(item).map((query) => ({
    query: query.slice(0, WEB_SEARCH_AUDIT_MAX_CHARS),
    queryLength: query.length,
    allowedDomains: [],
    blockedDomains: [],
  }));
}

/** The `ThreadItemDetails` types that are a tool call (exec_events.rs). */
const CODEX_TOOL_ITEMS: ReadonlySet<unknown> = new Set([
  'command_execution',
  'file_change',
  'mcp_tool_call',
  'web_search',
]);

/** One tool-call item as the steps it took: a step per file a patch
 *  touched, as a Claude Edit is, and one step for any other call. */
function toolItemSteps(
  item: Record<string, unknown>,
  said: string,
  usage: MessageUsage,
): readonly Activity[] {
  switch (item['type']) {
    case 'command_execution':
      return [activityFromToolCall('command_execution', { command: item['command'] }, said, usage)];
    case 'file_change': {
      const changes = Array.isArray(item['changes']) ? item['changes'] : [];
      const paths = changes.flatMap((change) => {
        const path = strOrNull(recordOrEmpty(change)['path']);
        return path === null ? [] : [path];
      });
      const inputs = paths.length === 0 ? [{}] : paths.map((path) => ({ path }));
      return inputs.map((input) => activityFromToolCall('file_change', input, said, usage));
    }
    case 'mcp_tool_call': {
      const server = strOrNull(item['server']);
      const tool = strOrNull(item['tool']);
      const name = server === null || tool === null ? 'mcp_tool_call' : `${server}.${tool}`;
      return [activityFromToolCall(name, recordOrEmpty(item['arguments']), said, usage)];
    }
    default:
      return [activityFromToolCall('web_search', { query: item['query'] }, said, usage)];
  }
}

/**
 * Reads one run's `codex exec --json` events, in wire order, into the live
 * activity timeline `stream.ts`'s `activitiesFromEvent` builds off a Claude
 * stream. Each tool-call item is a step, reported once, on its first line:
 * `item.started` for a command, a patch or an MCP call, whose target is known
 * before it runs (event_processor_with_jsonl_output.rs reuses the started id
 * for its `item.completed`), and `item.completed` for a web search, whose query
 * is empty until it has run (ext/web-search/src/tool.rs). Its reasoning is the
 * `agent_message` text completed since the last tool item did, the preamble
 * the model wrote before acting, so calls made together share it as a Claude
 * message's do; a `reasoning` summary is the model's thinking, which the
 * Claude timeline leaves out too. No event names the model that ran, so each
 * step carries `model`, the one the engine requested, as the envelope's
 * `modelUsed` does; tokens are `null`, since only `turn.completed` carries
 * usage. It keeps state, so each run gets its own reader.
 */
export function codexActivityReader(
  model: string | null,
): (event: Record<string, unknown>) => readonly Activity[] {
  const usage: MessageUsage = { model, tokensIn: null, tokensOut: null };
  const reported = new Set<string>();
  let said = '';
  return (event) => {
    const type = event['type'];
    if (type !== 'item.started' && type !== 'item.completed') return [];
    const item = recordOrEmpty(event['item']);
    if (type === 'item.completed' && item['type'] === 'agent_message') {
      const text = strOrNull(item['text']) ?? '';
      said = said === '' ? text : `${said} ${text}`;
      return [];
    }
    if (!CODEX_TOOL_ITEMS.has(item['type'])) return [];
    const id = strOrNull(item['id']);
    const unread =
      (type === 'item.completed' || item['type'] !== 'web_search') &&
      (id === null || !reported.has(id));
    if (id !== null && unread) reported.add(id);
    const steps = unread ? toolItemSteps(item, said, usage) : [];
    if (type === 'item.completed') said = '';
    return steps;
  };
}

/**
 * True when `codex exec resume <id>` failed at the resume ITSELF — the CLI-level
 * fallback `ClaudeCliModel` already has (docs/epics/0009-warm-sessions.md).
 * `codex-rs/exec/src/lib.rs` takes a UUID as given and asks for that thread; an
 * unknown or moved one fails the run before `thread.started` is ever emitted, so
 * the tell is `isResumeFailure`'s no-envelope non-zero exit PLUS no thread id on
 * the wire. A run that named its thread and then died took the resume, so a cold
 * retry would redo its work. A wall-clock kill is never retried either: that
 * would double the time the cap already spent.
 */
export function isCodexResumeFailure(
  resumeSessionId: string | undefined,
  resp: Pick<ModelResponse, 'envelope' | 'exitCode' | 'sessionId' | 'timedOut'>,
): boolean {
  return (
    isResumeFailure(resumeSessionId, resp) &&
    (resp.sessionId ?? null) === null &&
    resp.timedOut !== true
  );
}

/**
 * `text` as a TOML basic string. JSON's escapes are all TOML's too; DEL is the
 * one control character TOML forbids raw that JSON leaves alone.
 */
function tomlBasicString(text: string): string {
  return JSON.stringify(text).replace(/\u007f/g, '\\u007f');
}

/**
 * The argv that runs `command` as `codex exec`'s PreToolUse hook on every shell
 * call and file patch: the containment guard, as `ClaudeCliModel` gets it from
 * `--settings` and `GeminiCliModel` from its system settings file. Read from
 * openai/codex on 2026-10-02:
 * - `-c key=value` parses the value as TOML onto a session-flags config layer,
 *   and is `global`, so it parses after `exec` (`utils/cli/src/config_override.rs`).
 *   Hooks load from that layer as from any other (`hooks/src/engine/discovery.rs`).
 * - A matcher group's `hooks` take `type`, `command` and `timeout`, in seconds as
 *   Claude's are (`config/src/hook_config.rs`). A matcher of bare names and `|`
 *   is an exact match on any of them (`hooks/src/engine/matcher.rs`).
 * - Every shell call, plain or unified `exec_command`, reaches the hook as `Bash`
 *   with `tool_input.command` (`core/src/tools/hook_names.rs`), the Claude payload
 *   `guard-hook.js` already judges, and a Claude deny is a Codex deny
 *   (`hooks/src/events/pre_tool_use.rs`). A file edit reaches it as `apply_patch`
 *   with the patch as `tool_input.command`, which `codex-guard.ts` reads as a
 *   Claude `Write` or `Edit` of each file the patch names.
 * - A hook from no managed layer runs only once its hash is trusted, or under
 *   `--dangerously-bypass-hook-trust` (`utils/cli/src/shared_options.rs`), which
 *   `exec` takes after the subcommand (`exec/src/cli.rs`, `mark_exec_global_args`).
 * Codex runs the command through `$SHELL -lc`, or `cmd.exe /C` on Windows
 * (`hooks/src/engine/command_runner.rs`), the shells `guardHookCommand` quotes for.
 */
export function codexGuardArgs(command: string): string[] {
  const hook = `{type="command",command=${tomlBasicString(command)},timeout=${GUARD_TIMEOUT_S}}`;
  return [
    '-c',
    `hooks.PreToolUse=[{matcher="Bash|apply_patch",hooks=[${hook}]}]`,
    '--dangerously-bypass-hook-trust',
  ];
}

export interface CodexCliOptions {
  readonly repo: string;
  /** CLI binary — discovered from PATH by default (never a hardcoded personal path). */
  readonly binary?: string;
  /**
   * Base environment to derive the CLI env from (defaults to `process.env`). Codex's own
   * auth (`codex login`'s ChatGPT session, or `CODEX_API_KEY`) rides through unchanged —
   * `auth.ts`'s `AuthConfig`/`AuthMode` work (this epic's Bedrock/Vertex slice) is
   * Claude-CLI-specific env-var routing and does not apply to a different binary.
   */
  readonly env?: NodeJS.ProcessEnv;
  /** Kill the child if it runs longer than this. Defaults to `claude-cli.ts`'s
   *  {@link DEFAULT_CLI_TIMEOUT_MS} — the same wall-clock cap every CLI-spawning
   *  ModelPort in this repo shares, until this adapter earns its own tuned value. */
  readonly timeoutMs?: number;
  /** Kill the child when NOTHING has arrived on its stdout for this long — a
   *  hung login prompt, a stalled model stream — long before the wall clock
   *  would. Defaults to `claude-cli.ts`'s {@link DEFAULT_CLI_IDLE_TIMEOUT_MS},
   *  the same window `ClaudeCliOptions.idleTimeoutMs` gives: `codex exec
   *  --json` prints each event as a line the moment it happens, so a working
   *  run is never silent for longer than its slowest single command. */
  readonly idleTimeoutMs?: number;
  /**
   * `--sandbox` level passed to `codex exec`. Defaults to `workspace-write`: the CLI's
   * own default is `read-only` (per developers.openai.com/codex/noninteractive, verified
   * 2026-09-27), which would leave an agentic coding loop unable to edit any file — the
   * one capability the parity matrix above credits this adapter with.
   */
  readonly sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  /**
   * The containment guard, Codex's counterpart of `GeminiCliOptions.guardSettingsPath`:
   * the command line `guard.ts`'s `guardHookCommand(targetRoot, guardScriptPath)`
   * builds, run as the child's PreToolUse hook on every shell call and file patch
   * ({@link codexGuardArgs}). Empty or absent, the child runs with no guard hook.
   * A run that would have to carry it through cmd.exe is refused, never flown
   * without it.
   */
  readonly guardHookCommand?: string;
  /** Called for each query a web search ran ({@link codexWebSearchesFromEvent}),
   *  as its `item.completed` line arrives: `GeminiCliOptions.onWebSearch`'s
   *  counterpart (THREAT-MODEL T6 — the flight persists it as a `web-search`
   *  audit row). */
  readonly onWebSearch?: (search: WebSearchAudit) => void;
  /** Called for each step a tool call took, as its line arrives
   *  ({@link codexActivityReader}): `GeminiCliOptions.onActivity`'s counterpart. */
  readonly onActivity?: (activity: Activity) => void;
  /** ORPHAN SWEEP crash-path follow-up (board ap-mt2ukjg5-2), containment
   *  parity with `ClaudeCliModel`/`GeminiCliModel` before this adapter is
   *  wired into routing (epic 0036): persists the child's pid for the
   *  duration of the invocation so a crash-path sweep can still reap it if
   *  THIS process dies before the normal settle callback (below) untracks
   *  it. Structurally typed — any `CliDescendantRegistry` satisfies this
   *  without an import cycle, same as `ClaudeCliOptions.pidRegistry`. */
  readonly pidRegistry?: { track: (pid: number) => void; untrack: (pid: number) => void };
  /** ORPHAN SWEEP seam (board web-msu3sv1w-hfj87n), same as
   *  `ClaudeCliOptions.reapDescendants`: defaults to the real cross-platform
   *  {@link reapCliDescendants}; tests inject a spy to prove the reap runs. */
  readonly reapDescendants?: (pid: number | undefined, platform?: NodeJS.Platform) => void;
  /** The OS to build the spawn for. Defaults to `process.platform`; tests pin
   *  it so both spawn shapes are provable on any machine. */
  readonly platform?: NodeJS.Platform;
}

/**
 * ModelPort over the local OpenAI Codex CLI (epic 0036): spawns `codex exec --json
 * --model <model> [--sandbox <level>] [resume <session>] <prompt>` and parses its JSONL
 * stdout via {@link parseCodexExecOutput}. Stdin is always closed: given a prompt
 * argument, `codex exec` still reads a non-TTY stdin to EOF to append it as a
 * `<stdin>` block (codex-rs/exec/src/lib.rs `resolve_root_prompt`), so a pipe left
 * open would hang every cold run until the wall-clock cap. A prompt over
 * {@link CLI_STDIN_PROMPT_THRESHOLD}, or one starting with `-`, goes on stdin behind
 * a `-` argument instead, dodging the Windows command-line ceiling the way
 * `ClaudeCliModel` does. On Windows a bare `codex` is npm's `codex.cmd` shim,
 * so node runs the JS entry it names, attached ({@link resolveNpmShim}), and
 * argv reaches the CLI as given. A shim it cannot read that way runs through
 * `cmd.exe /c` (gate.ts's `buildInvocation`), attached, with every prompt on
 * stdin, where cmd.exe cannot parse it. Mirrors
 * `ClaudeCliModel`'s buffered-execFile transport shape, including `detached:
 * true` (for a binary spawned directly, never the node or cmd.exe route) +
 * {@link reapCliDescendants} so a
 * wall-clock kill still reaps whatever the child spawned (ORPHAN SWEEP, board
 * web-msu3sv1w-hfj87n). It carries `StreamingClaudeCliModel`'s idle cap
 * ({@link CodexCliOptions.idleTimeoutMs}): a child silent on stdout for that
 * long is killed and comes back `timedOut`, so a hung run no longer holds its
 * lane for the whole wall clock. Given {@link CodexCliOptions.onWebSearch}, it
 * reads each stdout line as it lands and reports every query a web search ran,
 * the audit `StreamingClaudeCliModel` keeps for WebSearch (THREAT-MODEL T6).
 * Given {@link CodexCliOptions.onActivity}, it reports every tool call there the
 * same way, as the live activity timeline's steps. Given
 * {@link CodexCliOptions.guardHookCommand}, the child runs the containment guard
 * as its PreToolUse hook on every shell call and file patch ({@link codexGuardArgs});
 * the calls that hook denies are not yet read back as guard denials. It skips the rest of the
 * streaming hardening (partial usage on a kill), which the Claude driver gained
 * after real incidents this adapter has no flight history to have hit yet. It
 * shares the Claude driver's CLI-level resume fallback: a session id the CLI rejects
 * ({@link isCodexResumeFailure}) is retried once, cold, as `resumed: false`.
 * Otherwise a resume is `resumed: true` only when `thread.started` names the
 * requested thread, since a session name Codex cannot find silently starts a
 * fresh thread instead of failing. It DOES carry
 * `ClaudeCliModel`/`GeminiCliModel`'s crash-path
 * {@link CodexCliOptions.pidRegistry} tracking (containment parity, board
 * ap-mt2ukjg5-2), added ahead of this adapter's routing wiring so a lane
 * flown on it is never a containment regression from day one. Its settle
 * path matches `ClaudeCliModel.execOnce`'s too: the reap goes through the
 * injectable {@link CodexCliOptions.reapDescendants} seam, and a kill by the
 * wall-clock cap comes back `timedOut` (THIRD CAP) instead of reading as an
 * ordinary crash. Never rejects — a spawn failure (binary missing) reports
 * the same "no envelope" shape {@link parseCodexExecOutput} already gives an
 * abnormal exit.
 */
export class CodexCliModel implements ModelPort {
  constructor(private readonly opts: CodexCliOptions) {}

  async invoke(model: string, prompt: string, resumeSessionId?: string): Promise<ModelResponse> {
    const first = await this.execOnce(model, prompt, resumeSessionId);
    if (resumeSessionId === undefined || resumeSessionId.length === 0) return first;
    if (isCodexResumeFailure(resumeSessionId, first)) {
      const retry = await this.execOnce(model, prompt, undefined);
      return { ...retry, resumed: false };
    }
    // No thread on the wire (a cap kill before `thread.started`): nothing
    // attests whether the resume took, so no claim either way.
    const wireSession = first.sessionId ?? null;
    return wireSession === null ? first : { ...first, resumed: wireSession === resumeSessionId };
  }

  private execOnce(
    model: string,
    prompt: string,
    resumeSessionId: string | undefined,
  ): Promise<ModelResponse> {
    const args = [
      'exec',
      '--json',
      '--model',
      model,
      '--sandbox',
      this.opts.sandbox ?? 'workspace-write',
    ];
    // Global flags above are placed before the subcommand so they parse
    // correctly whether or not the CLI treats them as clap `global = true`
    // options (verified structure: openai/codex codex-rs/exec/src/cli.rs).
    const guard = this.opts.guardHookCommand;
    if (guard !== undefined && guard.length > 0) args.push(...codexGuardArgs(guard));
    if (resumeSessionId !== undefined && resumeSessionId.length > 0) {
      args.push('resume', resumeSessionId);
    }
    // npm installs `codex` on Windows as a `codex.cmd` shim, which execFile
    // cannot launch itself (ENOENT). The shim only runs node on `codex.js`, so
    // when it reads as npm's own, node runs that entry directly and no cmd.exe
    // parses argv (resolveNpmShim). Any other shape keeps gate.ts's
    // buildInvocation route through `cmd.exe /c`, which finds it by PATHEXT;
    // an explicit path or `.exe` is still spawned directly.
    const binary = this.opts.binary ?? 'codex';
    const platform = this.opts.platform ?? process.platform;
    const env = this.opts.env ?? process.env;
    const shim = platform === 'win32' ? resolveNpmShim(binary, env) : null;
    const viaCmd = shim === null && buildInvocation(binary, [], platform).bin !== binary;
    // `-` makes both `exec` and `exec resume` read the prompt from stdin
    // (codex-rs/exec/src/lib.rs `resolve_prompt`). A leading `-` on argv would
    // parse as a flag, and `-` alone as that same stdin read, so those go on
    // stdin too. So does every prompt behind cmd.exe, which would otherwise
    // read its `&`, `|`, `%VAR%` and quotes as its own syntax.
    const pipePrompt =
      viaCmd || prompt.length > CLI_STDIN_PROMPT_THRESHOLD || prompt.startsWith('-');
    args.push(pipePrompt ? '-' : prompt);
    // The model, a resume id and the guard hook still ride argv. Refused rather
    // than spawned, a bad resume id reads as a resume failure, so invoke()
    // retries it cold. The guard's TOML never passes, so a guarded run is
    // refused rather than flown without its guard.
    if (viaCmd && !args.every((arg) => CMD_SAFE_ARG.test(arg))) {
      return Promise.resolve({
        stdout:
          'codex-cli: refused to pass the model, a resume id or the guard hook through cmd.exe',
        exitCode: 1,
        envelope: null,
        sessionId: null,
      });
    }
    const invocation =
      shim === null
        ? buildInvocation(binary, args, platform)
        : { bin: shim.bin, args: [...shim.args, ...args] };

    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_CLI_TIMEOUT_MS;
    const idleTimeoutMs = this.opts.idleTimeoutMs ?? DEFAULT_CLI_IDLE_TIMEOUT_MS;
    const startedAt = Date.now();
    const execOpts: ExecFileOptions & { detached: boolean; encoding: 'utf8' } = {
      cwd: this.opts.repo,
      env,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      timeout: timeoutMs,
      // A detached cmd.exe or node has no console, so Windows would open a new
      // one for the process it starts (the shim's node, or the native codex
      // `codex.js` spawns). The gate runs its cmd.exe shims attached, and the
      // reap below walks the tree with `taskkill /t` either way.
      detached: !viaCmd && shim === null,
      encoding: 'utf8',
    };
    return new Promise((resolve) => {
      // The idle cap is OUR timer; execFile's `timeout` above stays the
      // wall-clock cap. Every stdout chunk re-arms it, so only a child silent
      // for the whole window is killed (openai/codex
      // codex-rs/exec/src/event_processor_with_jsonl_output.rs `emit` prints
      // each event with `println!` as it happens).
      let idleTimer: NodeJS.Timeout | undefined;
      let idleDeath = false;
      // THREAT-MODEL T6: a search's query has left by the time the run ends,
      // so each is audited as its line lands, not read off the settled stdout.
      // The activity timeline is live for the same reason.
      const onWebSearch = this.opts.onWebSearch;
      const onActivity = this.opts.onActivity;
      const readActivity = codexActivityReader(model === '' ? null : model);
      let unreadLine = '';
      const readLines = (text: string): void => {
        for (const event of jsonObjectLines(text)) {
          if (onActivity !== undefined) {
            for (const activity of readActivity(event)) onActivity(activity);
          }
          if (onWebSearch !== undefined) {
            for (const search of codexWebSearchesFromEvent(event)) onWebSearch(search);
          }
        }
      };
      const child = execFile(
        invocation.bin,
        invocation.args,
        // Same overload-dodging cast ClaudeCliModel.execOnce uses — see its comment.
        execOpts as ExecFileOptions & { encoding: 'utf8' },
        (err, stdout, stderr) => {
          clearTimeout(idleTimer);
          (this.opts.reapDescendants ?? reapCliDescendants)(child.pid);
          if (child.pid !== undefined) this.opts.pidRegistry?.untrack(child.pid);
          // Same derivation as ClaudeCliModel.execOnce: a numeric err.code is the
          // real exit code (e.g. a non-zero `codex exec` run); any other error
          // (spawn failure, timeout kill) has none, so it reads as 1.
          const exitCode =
            err && typeof (err as { code?: unknown }).code === 'number'
              ? (err as { code: number }).code
              : err
                ? 1
                : 0;
          const killedBySignal = err !== null && (err as { killed?: boolean }).killed === true;
          const elapsedMs = Date.now() - startedAt;
          // An idle-cap kill is a cap death too, as in StreamingClaudeCliModel.execOnce.
          const capDeath = idleDeath
            ? 'idle'
            : isCliTimeoutDeath(killedBySignal, elapsedMs, timeoutMs)
              ? 'wall-clock'
              : null;
          const parsed = parseCodexExecOutput(stdout ?? '', exitCode, model);
          resolve({
            ...parsed,
            // With no envelope, the events say nothing about WHY the run died;
            // its stderr (a failed login, a bad config) does, and firing.ts
            // records this stdout as the firing's death tail.
            ...(parsed.envelope === null
              ? {
                  stdout: cliDeathText(
                    stderr ?? '',
                    capDeath,
                    elapsedMs,
                    capDeath === 'idle' ? idleTimeoutMs : timeoutMs,
                  ),
                }
              : {}),
            ...(capDeath !== null ? { timedOut: true } : {}),
            // No event carries a duration, so this clock is the run's only
            // one; no turn count rides with it (ModelResponse.observed).
            observed: { elapsedMs },
          });
          // A last line with no newline is read too. After resolve, so a
          // sink that throws can never leave the run unsettled.
          readLines(unreadLine);
        },
      );
      const armIdle = (): void => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          idleDeath = true;
          // execFile settles only once every pipe has closed. Behind cmd.exe
          // or the shim's node, the processes they started outlive the kill
          // and hold them open, so close our end first, as execFile's own
          // timeout kill does.
          child.stdout?.destroy();
          child.stderr?.destroy();
          try {
            child.kill();
          } catch {
            // already gone — the callback above still settles the call
          }
        }, idleTimeoutMs);
      };
      armIdle();
      child.stdout?.on('data', armIdle);
      if (onWebSearch !== undefined || onActivity !== undefined) {
        // execFile set the stream's encoding, so a chunk is a string. Only
        // the chunk is scanned, so a long command output line is never rescanned.
        child.stdout?.on('data', (chunk: string) => {
          const end = chunk.lastIndexOf('\n');
          if (end < 0) {
            unreadLine += chunk;
            return;
          }
          const complete = unreadLine + chunk.slice(0, end);
          unreadLine = chunk.slice(end + 1);
          readLines(complete);
        });
      }
      if (child.pid !== undefined) this.opts.pidRegistry?.track(child.pid);
      // Same EPIPE guard as GeminiCliModel: a CLI that exits before reading
      // its stdin breaks the pipe, and the callback above already reports it.
      child.stdin?.on('error', () => undefined);
      if (pipePrompt) child.stdin?.end(prompt);
      else child.stdin?.end();
    });
  }
}
