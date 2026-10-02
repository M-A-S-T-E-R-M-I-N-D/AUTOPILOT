// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * A ModelPort over the Google Gemini CLI (epic 0036,
 * docs/epics/0036-provider-parity.md), split like `claude-cli.ts` and
 * `codex-cli.ts` into a pure parse ({@link parseGeminiStreamJsonOutput},
 * fixture-tested) and the impure spawn ({@link GeminiCliModel}) that feeds it
 * `gemini --output-format stream-json` output, one event per line as it
 * happens: the output an idle cap can watch. The one-object `--output-format
 * json` form writes nothing until the run ends, so the adapter never asks for it.
 *
 * What the CLI does NOT report, and so this parse never invents:
 * - Cost. The `result` event's `stats` carry token counts only, never a priced
 *   figure, so `costUsd` is always `null` (`ports.ts`, `firing.ts` §3.6).
 * - Turn count and stop reason. Neither is on the wire (`stats.tool_calls`
 *   counts tool calls, not agent turns), so both are `null`.
 *   {@link GeminiCliModel} times the run itself and reports that as
 *   `observed.elapsedMs`, with no turn count, so a run killed before its
 *   `result` (and its `duration_ms`) still has a duration.
 */

import { execFile, type ExecFileOptions } from 'node:child_process';
import type { ModelEnvelope, ModelPort, ModelResponse } from '../ports.js';
import {
  guardDenialFromText,
  WEB_SEARCH_AUDIT_MAX_CHARS,
  type GuardDenialDetail,
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
import { buildInvocation, CMD_SAFE_ARG } from './gate.js';

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function recordOrNull(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * The one model `stats.models` names; when it names several (the CLI's router
 * adds its own) or none, the model the engine requested, `null` for none.
 */
function modelUsedFrom(modelStats: Record<string, unknown>, requestedModel: string): string | null {
  const requested = requestedModel === '' ? null : requestedModel;
  const names = Object.keys(modelStats);
  return names.length === 1 ? (names[0] ?? requested) : requested;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Every line of `stdout` that parses as an object with a string `type`;
 *  anything else (a stray log line, a line torn by a kill) is skipped. */
function streamEvents(stdout: string): readonly Record<string, unknown>[] {
  return stdout.split('\n').flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) return [];
    try {
      const event = recordOrNull(JSON.parse(trimmed));
      return event !== null && typeof event['type'] === 'string' ? [event] : [];
    } catch {
      return [];
    }
  });
}

/**
 * The guard denial one `tool_result` event reports, or null. A BeforeTool hook
 * deny comes back from gemini-cli `coreToolHookTriggers.ts` as an error whose
 * `message` is the hook's own reason, and `nonInteractiveCli.ts` emits that
 * call as `status: 'error'` with `error.message`. Our hook's reason is the
 * Claude guard's deny text (`gemini-guard.ts`), so it reads the same way.
 * `output` carries it too, behind "Tool execution blocked: ", but a tool that
 * SUCCEEDED can print anything there, so only the error is trusted.
 */
function guardDenialFromToolResult(event: Record<string, unknown>): GuardDenialDetail | null {
  if (event['status'] !== 'error') return null;
  const message = strOrNull(recordOrNull(event['error'])?.['message']);
  return message === null ? null : guardDenialFromText(message);
}

/** `WEB_SEARCH_TOOL_NAME` in gemini-cli
 *  `packages/core/src/tools/definitions/base-declarations.ts`. */
const GEMINI_WEB_SEARCH_TOOL = 'google_web_search';

/**
 * The web search one stream-json event asks for, as the audit keeps it
 * (THREAT-MODEL T6), or null: the record `stream.ts`'s `webSearchesFromEvent`
 * lifts off a Claude stream. `nonInteractiveCli.ts` emits a `tool_use` with the
 * call's name and args before the tool runs. `google_web_search` takes one
 * `query` and no domain filter (`WebSearchToolParams`, `tools/web-search.ts`),
 * so both filter lists are empty.
 */
export function geminiWebSearchFromEvent(event: Record<string, unknown>): WebSearchAudit | null {
  if (event['type'] !== 'tool_use' || event['tool_name'] !== GEMINI_WEB_SEARCH_TOOL) return null;
  const query = strOrNull(recordOrNull(event['parameters'])?.['query']);
  if (query === null) return null;
  return {
    query: query.slice(0, WEB_SEARCH_AUDIT_MAX_CHARS),
    queryLength: query.length,
    allowedDomains: [],
    blockedDomains: [],
  };
}

/**
 * Parse one `gemini --output-format stream-json` run: the `JsonStreamEvent`s in
 * gemini-cli `packages/core/src/output/types.ts`, one compact object per line,
 * all on stdout (`StreamJsonFormatter.emitEvent`). A fatal error comes there too,
 * as a `result` with `status: 'error'` (`packages/cli/src/utils/errors.ts`),
 * where JSON mode writes its error object to stderr. `init` carries
 * `session_id`, `message` streams the assistant's text in deltas,
 * `tool_use`/`tool_result` sit between turns, an `error` event is a warning or
 * the reason the run is about to fail, and one `result` ends the run.
 *
 * The last `result` decides the envelope. Its `result` text is what streamed
 * after the last tool event, the final turn's: JSON mode's `response` restarts
 * every turn too (`responseText` in `nonInteractiveCli.ts`). A failure's text is
 * its `error.message`, or, when it carries none (an invalid stream), the last
 * `severity: 'error'` event's. A `status` other than `success` is a failure.
 * With no `result` (killed mid-run, or dead before it began), the envelope is
 * `null` and the `init` session id still rides out, so the attempt stays
 * resumable, as `codex-cli.ts`'s thread id does.
 *
 * Tokens are the CLI's own `convertToStreamStats` totals: `input` (prompt −
 * cached) to `tokensIn`, `output_tokens` to `tokensOut`, `cached` to
 * `cacheRead`, and `duration_ms` is the CLI's own run time. An error carries
 * only `type` and `message`, so `apiErrorStatus` is `null`; cost, turns and
 * stop reason are never on the wire, so they are `null` too. `modelUsed` is
 * the one model `stats.models` names, else the model the engine requested.
 *
 * Every tool call the containment guard's BeforeTool hook denied rides out as
 * `guardDenials`/`guardDenialDetails`, as `StreamingClaudeCliModel`'s do, with
 * or without a `result`: `0` and `[]` when it denied none, since this driver
 * sees every `tool_result` on the wire.
 */
export function parseGeminiStreamJsonOutput(
  stdout: string,
  exitCode: number,
  requestedModel: string,
): ModelResponse {
  let sessionId: string | null = null;
  let finalTurnText = '';
  let lastErrorMessage: string | null = null;
  let result: Record<string, unknown> | null = null;
  const guardDenialDetails: GuardDenialDetail[] = [];

  for (const event of streamEvents(stdout)) {
    const type = event['type'];
    if (type === 'init') {
      const id = strOrNull(event['session_id']);
      sessionId ??= id === '' ? null : id;
    } else if (type === 'message' && event['role'] === 'assistant') {
      // `nonInteractiveCli.ts` writes every assistant message with `delta:
      // true`, one fragment per content event, so they concatenate.
      finalTurnText += strOrNull(event['content']) ?? '';
    } else if (type === 'tool_use' || type === 'tool_result') {
      finalTurnText = '';
      const denial = type === 'tool_result' ? guardDenialFromToolResult(event) : null;
      if (denial !== null) guardDenialDetails.push(denial);
    } else if (type === 'error' && event['severity'] === 'error') {
      lastErrorMessage = strOrNull(event['message']) ?? lastErrorMessage;
    } else if (type === 'result') {
      result = event;
    }
  }

  // A killed run's denials count too: the guard said no either way.
  const guard = { guardDenials: guardDenialDetails.length, guardDenialDetails };
  if (result === null) return { stdout, exitCode, envelope: null, sessionId, ...guard };

  const failed = result['status'] !== 'success';
  const stats = recordOrNull(result['stats']);
  const envelope: ModelEnvelope = {
    result: failed
      ? (strOrNull(recordOrNull(result['error'])?.['message']) ?? lastErrorMessage)
      : finalTurnText,
    isError: failed,
    apiErrorStatus: null,
    costUsd: null,
    numTurns: null,
    durationMs: numOrNull(stats?.['duration_ms']),
    stopReason: null,
    modelUsed: modelUsedFrom(recordOrNull(stats?.['models']) ?? {}, requestedModel),
    tokensIn: numOrNull(stats?.['input']),
    tokensOut: numOrNull(stats?.['output_tokens']),
    cacheRead: numOrNull(stats?.['cached']),
    cacheCreate: null,
    sessionId,
  };
  return { stdout, exitCode, envelope, sessionId, ...guard };
}

/** `ExitCodes.FATAL_INPUT_ERROR` in google-gemini/gemini-cli
 *  `packages/core/src/utils/exitCodes.ts`. */
const GEMINI_FATAL_INPUT_ERROR = 42;

/**
 * True when `gemini --resume <id>` failed at the resume ITSELF — the CLI-level
 * fallback `ClaudeCliModel` already has (docs/epics/0009-warm-sessions.md).
 * `resolveSessionId` in gemini-cli `packages/cli/src/gemini.tsx` looks the id up
 * before the run starts; an unknown one (`SessionError`, `sessionUtils.ts`) is
 * reported as feedback text and exits FATAL_INPUT_ERROR, so no output object is
 * ever written. The tell is `isResumeFailure`'s no-envelope non-zero exit AT
 * that code: an untrusted folder (55), a failed login (41), or a crash would
 * fail a cold retry the same way, and a wall-clock kill reads as exit 1.
 */
export function isGeminiResumeFailure(
  resumeSessionId: string | undefined,
  resp: Pick<ModelResponse, 'envelope' | 'exitCode'>,
): boolean {
  return isResumeFailure(resumeSessionId, resp) && resp.exitCode === GEMINI_FATAL_INPUT_ERROR;
}

export interface GeminiCliOptions {
  readonly repo: string;
  /** CLI binary — discovered from PATH by default (never a hardcoded personal path). */
  readonly binary?: string;
  /**
   * Base environment for the child (defaults to `process.env`). Gemini's own auth
   * (`GEMINI_API_KEY`, Vertex AI env, or the cached Google login) passes through
   * unchanged: `auth.ts`'s `AuthMode` routing is for the `claude` binary only.
   */
  readonly env?: NodeJS.ProcessEnv;
  /** Kill the child if it runs longer than this. Defaults to `claude-cli.ts`'s
   *  {@link DEFAULT_CLI_TIMEOUT_MS}, the wall-clock cap every CLI-spawning
   *  ModelPort in this repo shares. */
  readonly timeoutMs?: number;
  /** Kill the child when NOTHING has arrived on its stdout for this long, long
   *  before the wall clock would. Defaults to `claude-cli.ts`'s
   *  {@link DEFAULT_CLI_IDLE_TIMEOUT_MS}, the window `CodexCliOptions.idleTimeoutMs`
   *  gives: `--output-format stream-json` prints `init` before the first model
   *  request and each event as it happens (`nonInteractiveCli.ts`), so a working
   *  run is never silent for longer than its slowest single tool call. */
  readonly idleTimeoutMs?: number;
  /**
   * `--approval-mode` for the run. Defaults to `yolo`: headless mode cannot ask,
   * so under `default` every tool that needs a confirmation (file edits, shell)
   * is refused, and under `auto_edit` the shell still is, so the agent could not
   * run the gate or commit. `yolo` is the only mode that gives the full agentic
   * loop the parity matrix credits this adapter with. It is not sandboxed.
   */
  readonly approvalMode?: 'default' | 'auto_edit' | 'yolo' | 'plan';
  /**
   * Pass `--skip-trust` to trust `repo` for this one session. Off by default. The
   * CLI's folder trust is on by default, and headless mode exits with
   * `FatalUntrustedWorkspaceError` in an untrusted folder instead of asking.
   * Trusting a folder also loads its `.gemini/settings.json`, `.env`, and MCP
   * servers, so that stays the caller's decision (or the operator's own
   * `trustedFolders.json`), never a silent default here.
   */
  readonly trustWorkspace?: boolean;
  /**
   * The containment guard, Gemini's counterpart of `ClaudeCliOptions.settingsPath`:
   * a JSON file written from `buildGeminiFlightSettings` (`gemini-guard.ts`),
   * handed to the child as `GEMINI_CLI_SYSTEM_SETTINGS_PATH`. System settings
   * merge last, so no user or workspace file can switch the guard hook off; the
   * cost is that this child never reads the machine's own system settings file.
   * Gemini registers hooks only in a trusted folder, the same condition headless
   * mode needs to run at all. Unset or empty passes the env through unchanged.
   */
  readonly guardSettingsPath?: string;
  /** Called for each `google_web_search` the agent issues, with the query
   *  whole ({@link geminiWebSearchFromEvent}), as its `tool_use` line arrives:
   *  `StreamingClaudeCliOptions.onWebSearch`'s counterpart (THREAT-MODEL T6 —
   *  the flight persists it as a `web-search` audit row). */
  readonly onWebSearch?: (search: WebSearchAudit) => void;
  /** ORPHAN SWEEP crash-path follow-up (board ap-mt2ukjg5-2), containment
   *  parity with `ClaudeCliModel` before this adapter is wired into routing
   *  (epic 0036): persists the child's pid for the duration of the
   *  invocation so a crash-path sweep can still reap it if THIS process dies
   *  before the normal settle callback (below) untracks it. Structurally
   *  typed — any `CliDescendantRegistry` satisfies this without an import
   *  cycle, same as `ClaudeCliOptions.pidRegistry`. */
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
 * ModelPort over the local Google Gemini CLI (epic 0036): spawns `gemini --model
 * <model> --output-format stream-json --approval-mode <mode> [--skip-trust]
 * [--resume <session>] [--prompt <prompt>]` and parses its stdout via
 * {@link parseGeminiStreamJsonOutput}; stream-json writes a fatal error there too.
 *
 * Flags follow google-gemini/gemini-cli `packages/cli/src/config/config.ts`: the
 * positional prompt runs INTERACTIVE, so the prompt rides on `--prompt`, and
 * `--resume` takes the session UUID the `init` event carries. The CLI appends piped
 * stdin to the prompt (`gemini.tsx`), so a prompt over
 * {@link CLI_STDIN_PROMPT_THRESHOLD} goes on stdin alone, dodging the Windows
 * command-line ceiling the way `ClaudeCliModel` does. So does one starting with
 * `-`, which yargs would refuse as the `--prompt` value. The CLI reads stdin whenever
 * it is not a TTY, so it is always closed: an argv prompt gets an empty stdin, not
 * the CLI's 500 ms wait for input that never comes (`readStdin.ts`). On Windows a
 * bare `gemini` is npm's `gemini.cmd` shim, so it runs through `cmd.exe /c`
 * (gate.ts's `buildInvocation`), attached, with every prompt on stdin, where
 * cmd.exe cannot parse it.
 *
 * Transport mirrors `CodexCliModel`'s: buffered `execFile`, `detached: true`
 * (off that cmd.exe route) plus {@link reapCliDescendants} (ORPHAN SWEEP), and
 * its idle cap ({@link GeminiCliOptions.idleTimeoutMs}): a child silent on
 * stdout that long is killed and comes back `timedOut`, so a hung run no longer
 * holds its lane for the whole wall clock. A run killed before its `result`
 * keeps the `init` session id, so it stays resumable. Given
 * {@link GeminiCliOptions.onWebSearch}, it reads each stdout line as it lands
 * and reports every `google_web_search` call there, the audit
 * `StreamingClaudeCliModel` keeps for WebSearch (THREAT-MODEL T6).
 * It shares the Claude driver's CLI-level resume fallback: a session id the CLI
 * rejects ({@link isGeminiResumeFailure}) is retried once, cold, as `resumed:
 * false`. Otherwise a resume is `resumed: true` only when the `init` event's
 * `session_id` is the one requested, since `--resume latest` with no saved
 * session starts a fresh one instead of failing. It DOES carry `ClaudeCliModel`'s crash-path
 * {@link GeminiCliOptions.pidRegistry} tracking (containment parity, board
 * ap-mt2ukjg5-2), added ahead of this adapter's routing wiring so a lane
 * flown on it is never a containment regression from day one. Its settle
 * path matches `ClaudeCliModel.execOnce`'s too: the reap goes through the
 * injectable {@link GeminiCliOptions.reapDescendants} seam, and a kill by the
 * wall-clock cap comes back `timedOut` (THIRD CAP) instead of reading as an
 * ordinary crash. Never rejects: a spawn failure resolves the same "no
 * envelope" shape an abnormal exit gets.
 */
export class GeminiCliModel implements ModelPort {
  constructor(private readonly opts: GeminiCliOptions) {}

  async invoke(model: string, prompt: string, resumeSessionId?: string): Promise<ModelResponse> {
    const first = await this.execOnce(model, prompt, resumeSessionId);
    if (resumeSessionId === undefined || resumeSessionId.length === 0) return first;
    if (isGeminiResumeFailure(resumeSessionId, first)) {
      const retry = await this.execOnce(model, prompt, undefined);
      return { ...retry, resumed: false };
    }
    // No session in the output (an exit before the CLI wrote one): nothing
    // attests whether the resume took, so no claim either way.
    const wireSession = first.sessionId ?? null;
    return wireSession === null ? first : { ...first, resumed: wireSession === resumeSessionId };
  }

  private execOnce(
    model: string,
    prompt: string,
    resumeSessionId: string | undefined,
  ): Promise<ModelResponse> {
    // npm installs `gemini` on Windows as a `gemini.cmd` shim, which execFile
    // cannot launch itself (ENOENT). gate.ts's buildInvocation routes a bare
    // name through `cmd.exe /c`, which finds it by PATHEXT; an explicit path
    // or `.exe` is still spawned directly.
    const binary = this.opts.binary ?? 'gemini';
    const platform = this.opts.platform ?? process.platform;
    const viaCmd = buildInvocation(binary, [], platform).bin !== binary;
    // `--prompt` is `nargs: 1` (config.ts), and yargs-parser's `eatNargs` never
    // takes an arg matching /^-[^0-9]/ as its value: the run fails "Not enough
    // arguments following: prompt". A leading `-` goes on stdin with the long
    // ones. So does every prompt behind cmd.exe, which would otherwise read its
    // `&`, `|`, `%VAR%` and quotes as its own syntax.
    const pipePrompt =
      viaCmd || prompt.length > CLI_STDIN_PROMPT_THRESHOLD || prompt.startsWith('-');
    const args = [
      '--model',
      model,
      '--output-format',
      'stream-json',
      '--approval-mode',
      this.opts.approvalMode ?? 'yolo',
    ];
    if (this.opts.trustWorkspace === true) args.push('--skip-trust');
    if (resumeSessionId !== undefined && resumeSessionId.length > 0) {
      args.push('--resume', resumeSessionId);
    }
    if (!pipePrompt) args.push('--prompt', prompt);
    // The model and a resume id still ride argv. Refused rather than spawned,
    // with the exit code the CLI itself gives an unknown session id, so a bad
    // resume id reads as a resume failure and invoke() retries it cold.
    if (viaCmd && !args.every((arg) => CMD_SAFE_ARG.test(arg))) {
      return Promise.resolve({
        stdout: 'gemini-cli: refused to pass the model or resume id through cmd.exe',
        exitCode: GEMINI_FATAL_INPUT_ERROR,
        envelope: null,
        sessionId: null,
      });
    }
    const invocation = buildInvocation(binary, args, platform);

    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_CLI_TIMEOUT_MS;
    const idleTimeoutMs = this.opts.idleTimeoutMs ?? DEFAULT_CLI_IDLE_TIMEOUT_MS;
    const startedAt = Date.now();
    const baseEnv = this.opts.env ?? process.env;
    const guard = this.opts.guardSettingsPath;
    const execOpts: ExecFileOptions & { detached: boolean; encoding: 'utf8' } = {
      cwd: this.opts.repo,
      env:
        guard !== undefined && guard.length > 0
          ? { ...baseEnv, GEMINI_CLI_SYSTEM_SETTINGS_PATH: guard }
          : baseEnv,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      timeout: timeoutMs,
      // A detached cmd.exe has no console, so Windows would open a new one for
      // the node process the shim starts. The gate runs its cmd.exe shims
      // attached, and the reap below walks the tree with `taskkill /t` either way.
      detached: !viaCmd,
      encoding: 'utf8',
    };
    return new Promise((resolve) => {
      // The idle cap is OUR timer; execFile's `timeout` above stays the
      // wall-clock cap. Every stdout chunk re-arms it, so only a child silent
      // for the whole window is killed.
      let idleTimer: NodeJS.Timeout | undefined;
      let idleDeath = false;
      // THREAT-MODEL T6: a search's query has left by the time the run ends,
      // so each is audited as its line lands, not read off the settled stdout.
      const onWebSearch = this.opts.onWebSearch;
      let unreadLine = '';
      const auditWebSearches = (text: string): void => {
        if (onWebSearch === undefined) return;
        for (const event of streamEvents(text)) {
          const search = geminiWebSearchFromEvent(event);
          if (search !== null) onWebSearch(search);
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
          // real exit code; a spawn failure or timeout kill has none, so it reads as 1.
          const exitCode =
            err && typeof (err as { code?: unknown }).code === 'number'
              ? (err as { code: number }).code
              : err
                ? 1
                : 0;
          const killedBySignal = err !== null && (err as { killed?: boolean }).killed === true;
          const elapsedMs = Date.now() - startedAt;
          // An idle-cap kill is a cap death too, as in CodexCliModel.execOnce.
          const capDeath = idleDeath
            ? 'idle'
            : isCliTimeoutDeath(killedBySignal, elapsedMs, timeoutMs)
              ? 'wall-clock'
              : null;
          const parsed = parseGeminiStreamJsonOutput(stdout ?? '', exitCode, model);
          resolve({
            ...parsed,
            // With no `result`, the events say nothing about WHY the run died;
            // its stderr does (a failed login, an untrusted folder, a stale
            // resume id all exit before the first event), and firing.ts records
            // this stdout as the firing's death tail.
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
            // The `result` event's `duration_ms` dies with a killed run; this
            // clock does not. No turn count rides with it (ModelResponse.observed).
            observed: { elapsedMs },
          });
          // A last line with no newline is audited too. After resolve, so a
          // sink that throws can never leave the run unsettled.
          auditWebSearches(unreadLine);
        },
      );
      const armIdle = (): void => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          idleDeath = true;
          // execFile settles only once every pipe has closed. Behind cmd.exe
          // the node shim outlives the kill and holds them open, so close our
          // end first, as execFile's own timeout kill does.
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
      if (onWebSearch !== undefined) {
        // execFile set the stream's encoding, so a chunk is a string. Only
        // the chunk is scanned, so a long tool output line is never rescanned.
        child.stdout?.on('data', (chunk: string) => {
          const end = chunk.lastIndexOf('\n');
          if (end < 0) {
            unreadLine += chunk;
            return;
          }
          const complete = unreadLine + chunk.slice(0, end);
          unreadLine = chunk.slice(end + 1);
          auditWebSearches(complete);
        });
      }
      if (child.pid !== undefined) this.opts.pidRegistry?.track(child.pid);
      // A CLI that exits before reading its stdin (bad flag, untrusted folder)
      // breaks the pipe; unheard, that EPIPE would crash the host rather than
      // reach the callback above, which already reports the exit.
      child.stdin?.on('error', () => undefined);
      if (pipePrompt) child.stdin?.end(prompt);
      else child.stdin?.end();
    });
  }
}
