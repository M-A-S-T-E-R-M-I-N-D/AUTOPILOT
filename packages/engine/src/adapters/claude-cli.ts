// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { execFile, type ExecFileOptions, spawn } from 'node:child_process';
import type {
  ModelPort,
  ModelResponse,
  ModelEnvelope,
  PartialUsage,
  InvokeCaps,
} from '../ports.js';
import type { EngineConfig } from '../config.js';
import { resolveClaudeEnv, DEFAULT_AUTH, type AuthConfig } from '../auth.js';
import {
  parseStreamLine,
  activitiesFromEvent,
  isResultEvent,
  textDeltaFromEvent,
  usageFromEvent,
  guardDenialDetailsFromEvent,
  type Activity,
  type GuardDenialDetail,
} from '../stream.js';

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Coerce a string OR finite number to string — `api_error_status` is a number (e.g. 429). */
function strOrNum(v: unknown): string | null {
  if (typeof v === 'string') return v;
  // Stryker disable next-line ConditionalExpression: `Number.isFinite` (unlike
  // the global `isFinite`) never coerces — it already returns false for every
  // non-number type, so the preceding `typeof v === 'number' &&` is redundant
  // with it, not a runtime case a test can drive. Provably equivalent, not
  // killable.
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function numOrNull(v: unknown): number | null {
  // Stryker disable next-line ConditionalExpression: same redundancy as
  // strOrNum above — `Number.isFinite` alone already implies `typeof v ===
  // 'number'`. Provably equivalent, not killable.
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Parse the `claude -p --output-format json` envelope into the facts the agent
 * cannot fake. Pure and unit-tested; the impure spawn lives in {@link ClaudeCliModel}.
 * Tokens come from the first `modelUsage` entry (the model actually billed).
 * Also lifts `session_id` (docs/epics/0009-warm-sessions.md) — the CLI already
 * returns it in every envelope; nothing resumes it yet, but the fact is no
 * longer thrown away before a future firing can persist and reuse it.
 */
export function parseModelEnvelope(stdout: string): ModelEnvelope | null {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith('{')) return null;
  let raw: unknown;
  // prettier-ignore
  try {
    raw = JSON.parse(trimmed);
  }
  // Stryker disable next-line BlockStatement: an emptied catch body still
  // returns null overall — `raw` stays its `let`-declared `undefined` (the
  // assignment above never completed), and the `typeof raw !== 'object'`
  // guard just below catches that on its own. Provably equivalent, not
  // killable.
  catch {
    return null;
  }
  // Stryker disable next-line ConditionalExpression,LogicalOperator: per the
  // JSON grammar (RFC 8259 §3), a successful `JSON.parse` of a string that
  // passed the `startsWith('{')` guard above can only ever yield a non-null
  // object — this line's `true` branch is unreachable from any input this
  // function can be called with. Kept for TypeScript's `as Record<string,
  // unknown>` narrowing below, not for a runtime case a test can drive.
  // Provably equivalent, not killable.
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;

  let modelUsed: string | null = null;
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;
  let cacheRead: number | null = null;
  let cacheCreate: number | null = null;

  const mu = o['modelUsage'];
  if (mu !== null && typeof mu === 'object') {
    const first = Object.entries(mu as Record<string, unknown>)[0];
    if (first) {
      modelUsed = first[0];
      const usage = first[1];
      // Stryker disable next-line ConditionalExpression: for every value a
      // JSON parse can produce, member access on a non-null/undefined
      // primitive (string/number/boolean) safely yields `undefined` rather
      // than throwing — the SAME outcome `numOrNull` gives for a value it
      // never had to fetch. Forcing this clause to `true` for a primitive
      // `usage` is observably identical to skipping the block. Provably
      // equivalent, not killable.
      if (usage !== null && typeof usage === 'object') {
        const u = usage as Record<string, unknown>;
        tokensIn = numOrNull(u['inputTokens']);
        tokensOut = numOrNull(u['outputTokens']);
        cacheRead = numOrNull(u['cacheReadInputTokens']);
        cacheCreate = numOrNull(u['cacheCreationInputTokens']);
      }
    }
  }

  return {
    result: strOrNull(o['result']),
    isError: o['is_error'] === true,
    apiErrorStatus: strOrNum(o['api_error_status']),
    costUsd: numOrNull(o['total_cost_usd']),
    numTurns: numOrNull(o['num_turns']),
    durationMs: numOrNull(o['duration_ms']),
    stopReason: strOrNull(o['stop_reason']),
    modelUsed,
    tokensIn,
    tokensOut,
    cacheRead,
    cacheCreate,
    sessionId: strOrNull(o['session_id']),
  };
}

/**
 * True when a `--resume`d invocation's response looks like the RESUME ITSELF
 * failed (docs/epics/0009-warm-sessions.md's open CLI-level fallback) — an
 * expired/moved/unknown session id makes the CLI exit non-zero printing a
 * plain-text error, not a JSON envelope. An ordinary model/quota failure
 * still returns a valid parsed envelope (`is_error`/`api_error_status` carry
 * it — see `parseModelEnvelope`), so this never misfires on a ~real~ agent
 * failure and never fires at all when no session was being resumed.
 */
export function isResumeFailure(
  resumeSessionId: string | undefined,
  resp: Pick<ModelResponse, 'envelope' | 'exitCode'>,
): boolean {
  return (
    resumeSessionId !== undefined &&
    resumeSessionId.length > 0 &&
    resp.envelope === null &&
    resp.exitCode !== 0
  );
}

/** True when a resume was actually asked for on this attempt (vs an ordinary cold spawn). */
function resumeWasRequested(resumeSessionId: string | undefined): boolean {
  return resumeSessionId !== undefined && resumeSessionId.length > 0;
}

export interface ClaudeCliOptions {
  readonly repo: string;
  readonly config: EngineConfig;
  /** CLI binary — discovered from PATH by default (never a hardcoded personal path). */
  readonly binary?: string;
  /** How to authenticate the CLI. Defaults to the user's Claude subscription. */
  readonly auth?: AuthConfig;
  /** Base environment to derive the CLI env from (defaults to `process.env`). */
  readonly env?: NodeJS.ProcessEnv;
  /**
   * Path to a generated `--settings` JSON (the containment guard hook). CLI-arg
   * scoped: layers on top of the user's own settings files, never edits them.
   */
  readonly settingsPath?: string;
  /** Kill the child if it runs longer than this. Defaults to {@link DEFAULT_CLI_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
  /** ORPHAN SWEEP seam (board web-msu3sv1w-hfj87n) — defaults to the real
   *  cross-platform reap ({@link reapCliDescendants}); tests inject a spy
   *  instead of depending on a real taskkill/SIGKILL. */
  readonly reapDescendants?: (pid: number | undefined, platform?: NodeJS.Platform) => void;
  /** ORPHAN SWEEP crash-path follow-up (board ap-mt2ukjg5-2): persists the
   *  child's pid for the duration of the invocation so a crash-path sweep
   *  can still reap it if THIS process dies before the normal settle
   *  callback (below) untracks it. Structurally typed — any
   *  `{@link CliDescendantRegistry}` satisfies this without an import cycle. */
  readonly pidRegistry?: { track: (pid: number) => void; untrack: (pid: number) => void };
}

/**
 * ORPHAN SWEEP (board web-msu3sv1w-hfj87n): reaps whatever the `claude` CLI
 * child left running once its OWN invocation has settled — a real incident
 * saw a Bash-tool background experiment (`npx tsx …`) survive 22+ hours past
 * the firing that spawned it, its script already deleted by the time anyone
 * noticed the three orphaned node processes still running. The `timeout`
 * option on the spawn below only ever signals the immediate `claude` child —
 * never a grandchild it spawned itself — and nothing at all reaps stragglers
 * on an ordinary clean exit. The CLI child is spawned `detached: true` (its
 * own process group on POSIX, mirroring
 * apps/dashboard/src/flight/spawn-flight.ts's proven flight-level kill), so
 * `-pid` here targets exactly its descendants, never the flight's own
 * group. On Windows, `taskkill /t` still walks an already-exited parent's
 * children by their retained ParentProcessId — verified empirically against
 * a real exited-parent/orphaned-child pair, not assumed from the tool's
 * docs — so this runs unconditionally after EVERY invocation settles
 * (success, error, or timeout alike), not only when the CLI looks like it
 * misbehaved.
 */
export function reapCliDescendants(
  pid: number | undefined,
  platform: NodeJS.Platform = process.platform,
): void {
  if (pid === undefined) return;
  if (platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' }).on('error', () => {
      // Already gone, or never spawned any children — nothing left to reap.
    });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // Empty/already-gone group — same race as the Windows branch above.
  }
}

/**
 * Conservative headroom under Windows' ~32K `CreateProcess` command-line ceiling
 * (docs/BACKLOG-999.md §K, MDVIEWER-STUDY §1 L1199-1230) — leaves room for the
 * other argv flags plus quoting overhead through a `claude.cmd` shim. A prompt at
 * or under this length is passed as the final argv entry (existing, well-tested
 * behavior); a longer one is folded into stdin instead (`claude -p` reads the
 * prompt from stdin when no positional prompt argument is given — "useful for
 * pipes" per `claude --help`; 10MB cap per docs/CLAUDE-CLI-INTEGRATION.md).
 */
export const CLI_STDIN_PROMPT_THRESHOLD = 6000;

/**
 * A hung `claude` child (e.g. a stalled auth prompt or a wedged MCP server)
 * would otherwise block a firing forever — long enough for a full xhigh-effort,
 * 120-turn firing to finish, short enough to guarantee eventual forward
 * progress. `timeoutMs` on {@link ClaudeCliOptions} overrides this per call.
 */
export const DEFAULT_CLI_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * THIRD CAP surfacing (board web-mt1w1ime-pohh9d): true when an attempt was
 * killed by the wall-clock cap rather than an ordinary crash, quota error, or
 * an unrelated external signal (an operator/OS kill can also signal-terminate
 * the child, but would almost always land well under the cap). Elapsed time
 * is the disambiguator: only a signal-killed attempt that actually ran at
 * least as long as the configured timeout counts as a timeout death. Pure so
 * the detection logic is unit-testable without spawning a real process.
 */
export function isCliTimeoutDeath(
  killedBySignal: boolean,
  elapsedMs: number,
  timeoutMs: number,
): boolean {
  return killedBySignal && elapsedMs >= timeoutMs;
}

/**
 * ModelPort over the local Claude Code CLI (MDVIEWER-STUDY §1): spawns
 * `claude -p … --output-format json` on the user's own subscription auth (no API
 * key). Faithful to the proven v2.4 args. Never rejects — captures stdout + exit
 * code so quota/error envelopes flow to the resilience logic.
 */
export class ClaudeCliModel implements ModelPort {
  constructor(private readonly opts: ClaudeCliOptions) {}

  async invoke(
    model: string,
    prompt: string,
    resumeSessionId?: string,
    caps?: InvokeCaps,
  ): Promise<ModelResponse> {
    const first = await this.execOnce(model, prompt, resumeSessionId, caps);
    // CLI-level resume fallback (docs/epics/0009-warm-sessions.md): the
    // session id itself was rejected (expired/moved/unknown) — retry once,
    // cold, rather than surface a failure the flight never needed to have.
    if (isResumeFailure(resumeSessionId, first)) {
      const retry = await this.execOnce(model, prompt, undefined, caps);
      return { ...retry, resumed: false };
    }
    return resumeWasRequested(resumeSessionId) ? { ...first, resumed: true } : first;
  }

  private execOnce(
    model: string,
    prompt: string,
    resumeSessionId: string | undefined,
    caps?: InvokeCaps,
  ): Promise<ModelResponse> {
    const args = buildClaudeArgs(
      model,
      prompt,
      applyInvokeCaps(this.opts.config, caps),
      this.opts.repo,
      'json',
      this.opts.settingsPath,
      undefined,
      resumeSessionId,
    );
    const env = resolveClaudeEnv(this.opts.auth ?? DEFAULT_AUTH, this.opts.env ?? process.env);
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_CLI_TIMEOUT_MS;
    const startedAt = Date.now();
    // `detached` is a spawn option execFile forwards through to spawn — its
    // ExecFileOptions type simply doesn't NAME it, so the options object is
    // typed as the intersection (ORPHAN SWEEP: the CLI's own process group
    // must be reapable as a unit when the wall clock kills it).
    const execOpts: ExecFileOptions & { detached: boolean; encoding: 'utf8' } = {
      cwd: this.opts.repo,
      env,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      timeout: timeoutMs,
      detached: true,
      encoding: 'utf8',
    };
    return new Promise((resolve) => {
      const child = execFile(
        this.opts.binary ?? 'claude',
        args,
        // The cast narrows `detached` away for the overload's excess-property
        // check only — the runtime object still carries it into spawn.
        execOpts as ExecFileOptions & { encoding: 'utf8' },
        (err, stdout) => {
          (this.opts.reapDescendants ?? reapCliDescendants)(child.pid);
          if (child.pid !== undefined) this.opts.pidRegistry?.untrack(child.pid);
          const exitCode =
            err && typeof (err as { code?: unknown }).code === 'number'
              ? (err as { code: number }).code
              : err
                ? 1
                : 0;
          const out = stdout ?? '';
          const killedBySignal = err !== null && (err as { killed?: boolean }).killed === true;
          const timedOut = isCliTimeoutDeath(killedBySignal, Date.now() - startedAt, timeoutMs);
          resolve({
            stdout: out,
            exitCode,
            envelope: parseModelEnvelope(out),
            ...(timedOut ? { timedOut: true } : {}),
          });
        },
      );
      if (child.pid !== undefined) this.opts.pidRegistry?.track(child.pid);
      if (prompt.length > CLI_STDIN_PROMPT_THRESHOLD) child.stdin?.end(prompt);
    });
  }
}

/**
 * Overlay per-invocation cap overrides (FINISH-LINE EXTENSION) onto the
 * adapter's config — the extension's smaller tap for one call, byte-identical
 * config when no caps ride along (every pre-existing call path).
 */
export function applyInvokeCaps(config: EngineConfig, caps?: InvokeCaps): EngineConfig {
  if (!caps) return config;
  return {
    ...config,
    ...(caps.maxTurns !== undefined ? { maxTurns: caps.maxTurns } : {}),
    ...(caps.maxBudgetUsd !== undefined ? { maxBudgetUsd: caps.maxBudgetUsd } : {}),
  };
}

/** Build the `claude -p` argv (shared by the buffered + streaming adapters). */
export function buildClaudeArgs(
  model: string,
  prompt: string,
  c: EngineConfig,
  repo: string,
  outputFormat: 'json' | 'stream-json',
  settingsPath?: string,
  includePartialMessages?: boolean,
  resumeSessionId?: string,
): string[] {
  const args = [
    '--print',
    '--model',
    model,
    '--fallback-model',
    c.fallbackModel,
    '--effort',
    c.effort,
    '--allowedTools',
    c.allowedTools.join(','),
    '--disallowedTools',
    c.disallowedTools.join(','),
    '--add-dir',
    repo,
    '--max-turns',
    String(c.maxTurns),
    '--max-budget-usd',
    String(c.maxBudgetUsd),
    '--output-format',
    outputFormat,
  ];
  if (outputFormat === 'stream-json') args.push('--verbose'); // required for stream-json
  // Live answer-text deltas (verified wire format: stream_event/content_block_delta/
  // text_delta) — only requested when a caller actually consumes them (onText).
  if (includePartialMessages === true) args.push('--include-partial-messages');
  // The containment guard settings (PreToolUse Bash hook) — CLI-arg scoped.
  if (settingsPath !== undefined && settingsPath.length > 0) args.push('--settings', settingsPath);
  // Resume a prior firing's CLI session (docs/epics/0009-warm-sessions.md)
  // instead of cold-spawning a new one. Added AFTER every containment flag
  // above (--settings/--add-dir/--fallback-model/…) so a resumed invocation
  // still carries them explicitly — sessions.md documents that resume does
  // NOT restore them on its own.
  if (resumeSessionId !== undefined && resumeSessionId.length > 0) {
    args.push('--resume', resumeSessionId);
  }
  // Over-threshold prompts are piped via stdin instead (see CLI_STDIN_PROMPT_THRESHOLD)
  // to dodge Windows' command-line ceiling — omitted here, not left dangling in argv.
  if (prompt.length <= CLI_STDIN_PROMPT_THRESHOLD) args.push(prompt);
  return args;
}

export interface StreamingClaudeCliOptions extends ClaudeCliOptions {
  /** Called for each tool the agent uses, in real time (the activity timeline). */
  readonly onActivity?: (activity: Activity) => void;
  /**
   * Called with each incremental answer-text chunk as it streams in. Setting
   * this adds `--include-partial-messages` to the spawn — existing callers that
   * only use `onActivity` are unaffected (the flag is opt-in per invocation).
   */
  readonly onText?: (text: string) => void;
}

/**
 * Streaming variant of {@link ClaudeCliModel}: runs `--output-format stream-json`
 * and parses each NDJSON event, emitting the agent's tool uses live via
 * `onActivity` (feeding the activity map) and/or the answer's text deltas live
 * via `onText` (feeding an SSE relay), then resolves the same `ModelResponse`
 * from the terminal `result` event. A drop-in ModelPort — the firing logic and
 * telemetry are identical; it just also sees what the agent did/said along the way.
 */
export class StreamingClaudeCliModel implements ModelPort {
  constructor(private readonly opts: StreamingClaudeCliOptions) {}

  async invoke(
    model: string,
    prompt: string,
    resumeSessionId?: string,
    caps?: InvokeCaps,
  ): Promise<ModelResponse> {
    const first = await this.execOnce(model, prompt, resumeSessionId, caps);
    // CLI-level resume fallback (docs/epics/0009-warm-sessions.md) — see
    // ClaudeCliModel.invoke's identical comment.
    if (isResumeFailure(resumeSessionId, first)) {
      const retry = await this.execOnce(model, prompt, undefined, caps);
      return { ...retry, resumed: false };
    }
    return resumeWasRequested(resumeSessionId) ? { ...first, resumed: true } : first;
  }

  private execOnce(
    model: string,
    prompt: string,
    resumeSessionId: string | undefined,
    caps?: InvokeCaps,
  ): Promise<ModelResponse> {
    const args = buildClaudeArgs(
      model,
      prompt,
      applyInvokeCaps(this.opts.config, caps),
      this.opts.repo,
      'stream-json',
      this.opts.settingsPath,
      this.opts.onText !== undefined,
      resumeSessionId,
    );
    const env = resolveClaudeEnv(this.opts.auth ?? DEFAULT_AUTH, this.opts.env ?? process.env);
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_CLI_TIMEOUT_MS;
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const child = spawn(this.opts.binary ?? 'claude', args, {
        cwd: this.opts.repo,
        env,
        windowsHide: true,
        timeout: timeoutMs,
        detached: true,
      });
      if (child.pid !== undefined) this.opts.pidRegistry?.track(child.pid);
      if (prompt.length > CLI_STDIN_PROMPT_THRESHOLD) child.stdin?.end(prompt);
      let buffer = '';
      let result: Record<string, unknown> | null = null;
      let stderr = '';
      // DEATH-COST capture (docs/EVALUATION-2026-08.md §3.6): the last usage
      // snapshot seen on the wire, kept so an abnormal exit (killed before
      // `result` arrives) can still resolve real observed turns/tokens
      // instead of silently discarding them.
      let lastUsage: ReturnType<typeof usageFromEvent> = null;
      let assistantTurns = 0;
      let guardDenials = 0;
      const guardDenialDetails: GuardDenialDetail[] = [];

      const onLine = (line: string): void => {
        const event = parseStreamLine(line);
        if (event === null) return;
        if (this.opts.onActivity) {
          for (const activity of activitiesFromEvent(event)) this.opts.onActivity(activity);
        }
        if (this.opts.onText) {
          const delta = textDeltaFromEvent(event);
          if (delta !== null) this.opts.onText(delta);
        }
        const usage = usageFromEvent(event);
        if (usage !== null) {
          assistantTurns += 1;
          lastUsage = usage;
        }
        const details = guardDenialDetailsFromEvent(event);
        if (details.length > 0) guardDenialDetails.push(...details);
        guardDenials += details.length;
        if (isResultEvent(event)) result = event;
      };

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        buffer += chunk;
        let nl = buffer.indexOf('\n');
        while (nl >= 0) {
          onLine(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
          nl = buffer.indexOf('\n');
        }
      });
      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', () => {
        (this.opts.reapDescendants ?? reapCliDescendants)(child.pid);
        if (child.pid !== undefined) this.opts.pidRegistry?.untrack(child.pid);
        resolve({
          stdout: stderr,
          exitCode: 1,
          envelope: null,
          partialUsage: null,
          guardDenials,
          guardDenialDetails,
        });
      });
      child.on('close', (code, signal) => {
        (this.opts.reapDescendants ?? reapCliDescendants)(child.pid);
        if (child.pid !== undefined) this.opts.pidRegistry?.untrack(child.pid);
        // Stryker disable next-line ConditionalExpression,EqualityOperator,MethodExpression:
        // `onLine` re-derives its own trim + `startsWith('{')` guard on whatever
        // it's handed, so calling it unconditionally with an empty/whitespace
        // leftover buffer is a no-op either way (`parseStreamLine` returns null,
        // `event === null` short-circuits before touching `result`/`stdout`).
        // This guard only skips redundant work; no observable output depends on
        // it. Provably equivalent, not killable.
        if (buffer.trim().length > 0) onLine(buffer);
        const stdout = result ? JSON.stringify(result) : '';
        const envelope = result ? parseModelEnvelope(stdout) : null;
        const partialUsage: PartialUsage | null =
          envelope === null && lastUsage !== null
            ? {
                modelUsed: lastUsage.model,
                tokensIn: lastUsage.tokensIn,
                tokensOut: lastUsage.tokensOut,
                turnsObserved: assistantTurns,
              }
            : null;
        // A signal-killed child (timeout or otherwise) has no real exit code — do
        // not let the `code ?? 0` fallback below report that as a clean success.
        const timedOut = isCliTimeoutDeath(signal !== null, Date.now() - startedAt, timeoutMs);
        resolve({
          stdout,
          exitCode: code ?? (signal ? 1 : 0),
          envelope,
          partialUsage,
          guardDenials,
          guardDenialDetails,
          ...(timedOut ? { timedOut: true } : {}),
        });
      });
    });
  }
}
