// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The per-project verification gate as a runnable adapter (GatePort). Executes
 * the detected gate commands (typecheck / test / build — produced by M2's gate
 * DETECTION) in order, argv-only (no shell → no injection), failing fast on the
 * first non-zero exit. This is the missing bridge between onboarding's gate
 * detection and the engine's gate execution. Commands are passed in decoupled
 * from onboarding's `GateSpec` shape, so the engine stays independent of that
 * package; the caller maps its GateSpec → this command list.
 */

import { execFile } from 'node:child_process';
import type { GatePort, GateResult, GateCheckResult } from '../ports.js';
import type { GateSemaphorePort } from './gate-semaphore.js';

/** One gate command — argv only (never a shell string). */
export interface GateCommandSpec {
  readonly bin: string;
  readonly args: readonly string[];
  readonly label?: string;
  /**
   * True when this command is safe to run concurrently with its neighbors
   * (no shared output it depends on — e.g. typecheck/lint/format all read
   * the same source tree independently). Consecutive `parallel: true`
   * commands are batched and awaited together instead of one at a time;
   * a command without it (or a `false`) still runs strictly after every
   * earlier command has passed, exactly as before. The caller decides which
   * commands qualify — GateRunner itself has no opinion on tool semantics.
   */
  readonly parallel?: boolean;
}

/** The outcome of running one command (its process exit code). */
export interface CommandRun {
  readonly code: number;
  /**
   * True when the process never produced a real exit code — spawn failure
   * (missing binary), timeout, or signal kill — as opposed to the tool itself
   * running and reporting a genuine non-zero result. A crash is not evidence
   * the AGENT's work is bad; it means the gate couldn't verify it.
   */
  readonly crashed?: boolean;
  /**
   * Why a crashed command never produced a real exit code — 'timeout' when
   * execFile's own `timeout` option killed it, the raw spawn error code
   * (e.g. 'ENOENT') for a missing binary, or 'unknown' for anything else.
   * Absent when {@link crashed} is falsy. Threaded into `GateResult.details`
   * (verdict-quality, board web-mtq6zn6x-3khfkb) so a crash's telemetry
   * reason is actually distinguishable instead of a uniform "(exit 1)".
   */
  readonly crashReason?: string;
  /** The last {@link GATE_OUTPUT_TAIL_LINES} lines the command printed —
   *  stdout then stderr — attached on a NON-ZERO exit only, so a red gate
   *  can name the failing test or rule (2026-09-13: a landing gate went red
   *  twice on "pnpm run test failed (exit 1)" and nothing said why). */
  readonly outputTail?: string;
}

/** How many trailing output lines a failed gate command keeps. Vitest's own
 *  failure summary sits within the last few dozen lines; forty is enough to
 *  name the file, the test and the assertion without carrying the whole run. */
export const GATE_OUTPUT_TAIL_LINES = 40;

/** The last `n` non-empty lines of `text`, joined by newlines. */
export function lastLines(text: string, n: number): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

export type GateExec = (
  cmd: GateCommandSpec,
  cwd: string,
  timeoutMs: number,
) => Promise<CommandRun>;

export interface GateRunnerOptions {
  readonly cwd: string;
  readonly commands: readonly GateCommandSpec[];
  readonly timeoutMs?: number;
  /** Test seam: run one command → its exit code. Defaults to a real `execFile`. */
  readonly exec?: GateExec;
  /** Optional live-progress observer. A gate run takes minutes (the test leg
   *  alone is ~140s here), and a caller that can only await the final result
   *  has nothing honest to show an operator meanwhile — the LANDING job
   *  (`apps/dashboard/src/landing/job.ts`) reports "which step, how long" from
   *  exactly this. Purely observational: it can never change a verdict, and a
   *  throwing observer is swallowed rather than failing the gate it watches. */
  readonly onProgress?: (event: GateProgressEvent) => void;
  /** Cross-lane scheduling gate (operator-machine mercy 2, board
   *  web-mtsvchak-kecyjk): when given, a shared-slot semaphore acquired
   *  before running any command and released once this gate finishes,
   *  win or lose — see `gate-semaphore.ts`. Undefined (the default) runs
   *  exactly as before every existing caller/test already relies on. */
  readonly semaphore?: GateSemaphorePort;
}

/** One live gate-progress notification: a command STARTED, or one ENDED with
 *  its verdict. `index`/`total` are 1-based positions in the command list, so
 *  a UI can render "3/5" without knowing the gate's shape. */
export interface GateProgressEvent {
  readonly kind: 'start' | 'end';
  readonly label: string;
  readonly index: number;
  readonly total: number;
  readonly pass?: boolean;
  readonly durationMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Resolve the real (bin, args) to spawn — argv-structured, never a shell string.
 * On Windows the common gate tools (`pnpm`/`npm`/`npx`/`tsc`) are `.cmd` shims
 * that `execFile` cannot launch directly (ENOENT); route a bare command name
 * through `cmd.exe /c` so PATHEXT resolves the shim. Anything with a path
 * separator or an `.exe`/`.com` extension is spawned directly. Pure + platform-
 * parameterized so the branch is deterministically testable.
 */
export function buildInvocation(
  bin: string,
  args: readonly string[],
  platform: NodeJS.Platform,
): { bin: string; args: string[] } {
  const bareName = !bin.includes('/') && !bin.includes('\\');
  const needsShim = platform === 'win32' && bareName && !/\.(exe|com)$/i.test(bin);
  return needsShim ? { bin: 'cmd.exe', args: ['/c', bin, ...args] } : { bin, args: [...args] };
}

/**
 * Turn one `execFile` rejection into a gate result — the difference between
 * "the tool ran and said no" and "the tool never ran", which decides whether a
 * red gate is a verdict on the commit or a verdict on the machine.
 *
 * A real exit code is numeric. A spawn failure or a timeout carries a string or
 * absent code (`'ENOENT'`, `'ETIMEDOUT'`): the tool never reached completion,
 * so those are CRASHES rather than the tool's own answer. `killed` is set
 * whenever execFile's own `timeout` option fired — the one crash cause this
 * command chose for itself, as opposed to the environment or an unidentified
 * one.
 *
 * Exported, and lifted out of the callback, because these arms are
 * PLATFORM-DEPENDENT to reach through a real spawn: on Windows the gate runs
 * through a cmd.exe shim, so a missing binary returns a shell exit code 1
 * rather than ENOENT, and the string-code arm cannot be produced locally at all
 * (measured 2026-09-17). Testing the classifier directly is what makes these
 * arms provable on every platform instead of only on whichever one CI uses.
 */
export function classifyExecFailure(error: unknown, outputTail: string): CommandRun {
  const raw = (error as { code?: unknown }).code;
  if (typeof raw === 'number') {
    return outputTail ? { code: raw, outputTail } : { code: raw };
  }
  const killed = (error as { killed?: unknown }).killed === true;
  const crashReason = killed ? 'timeout' : typeof raw === 'string' ? raw : 'unknown';
  return outputTail
    ? { code: 1, crashed: true, crashReason, outputTail }
    : { code: 1, crashed: true, crashReason };
}

/** Run one command with `execFile` (no shell string). Any spawn/exec failure ⇒ non-zero. */
const realExec: GateExec = (cmd, cwd, timeoutMs) =>
  new Promise((resolve) => {
    const inv = buildInvocation(cmd.bin, cmd.args, process.platform);
    execFile(
      inv.bin,
      inv.args,
      // 64 MiB: a full vitest run's output must never itself become a crash
      // (execFile kills the child past maxBuffer and reports it as one).
      { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ code: 0 });
          return;
        }
        resolve(
          classifyExecFailure(
            error,
            lastLines(`${String(stdout)}\n${String(stderr)}`, GATE_OUTPUT_TAIL_LINES),
          ),
        );
      },
    );
  });

/** Group leading run of `commands` starting at `start` that share the same
 *  `parallel` batch — either one sequential command, or a run of consecutive
 *  `parallel: true` commands. Returns the batch and the index just past it. */
function nextBatch(
  commands: readonly GateCommandSpec[],
  start: number,
): { batch: readonly GateCommandSpec[]; next: number } {
  // Stryker disable next-line OptionalChaining: `nextBatch` is only ever
  // called with `start < commands.length` — run()'s `while (i <
  // commands.length)` guard enforces it before every call — so
  // `commands[start]` is never undefined here; the chaining is redundant.
  // Provably equivalent, not killable.
  if (commands[start]?.parallel !== true) return { batch: [commands[start]!], next: start + 1 };
  let end = start + 1;
  // Stryker disable next-line ConditionalExpression,EqualityOperator,OptionalChaining:
  // `end < commands.length` is redundant with the optional chaining below —
  // `commands[end]` is safely `undefined` past the array's end (JS never
  // throws on out-of-bounds indexing), and `undefined?.parallel === true` is
  // always `false`, so the loop already terminates correctly once `end`
  // reaches `commands.length` regardless of the bound check, the `<`-vs-`<=`
  // comparison, or whether the chaining itself is present. Provably
  // equivalent, not killable.
  while (end < commands.length && commands[end]?.parallel === true) end++;
  return { batch: commands.slice(start, end), next: end };
}

export class GateRunner implements GatePort {
  constructor(private readonly opts: GateRunnerOptions) {}

  async run(): Promise<GateResult> {
    const { cwd, commands } = this.opts;
    const exec = this.opts.exec ?? realExec;
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (commands.length === 0) {
      return { ok: true, details: 'no gate commands configured', checks: [] };
    }

    const release = await this.opts.semaphore?.acquire();
    try {
      const checks: GateCheckResult[] = [];
      // Never let an observer's own failure change a gate verdict — this is a
      // reporting side channel, not part of the decision.
      const notify = (event: GateProgressEvent): void => {
        try {
          // Stryker disable next-line OptionalChaining: equivalent by
          // construction, measured 2026-09-17. With no observer wired, calling
          // it unconditionally throws a TypeError that this very catch
          // swallows — so both forms emit no event and fail nothing, and no
          // assertion on the gate can tell them apart. The `?.` stays because
          // "there may be no observer" is the normal case, not an exception.
          this.opts.onProgress?.(event);
        } catch {
          /* observational only — a broken observer must not fail the gate */
        }
      };
      let i = 0;
      while (i < commands.length) {
        const { batch, next } = nextBatch(commands, i);
        const runs = await Promise.all(
          batch.map(async (cmd, offset) => {
            const label = cmd.label ?? cmd.bin;
            const position = i + offset + 1;
            notify({ kind: 'start', label, index: position, total: commands.length });
            const startedAt = Date.now();
            const { code, crashed, crashReason, outputTail } = await exec(cmd, cwd, timeoutMs);
            const durationMs = Date.now() - startedAt;
            notify({
              kind: 'end',
              label,
              index: position,
              total: commands.length,
              pass: code === 0,
              durationMs,
            });
            return { cmd, code, crashed, crashReason, outputTail, durationMs };
          }),
        );
        for (const r of runs) {
          checks.push({
            label: r.cmd.label ?? r.cmd.bin,
            pass: r.code === 0,
            durationMs: r.durationMs,
            ...(r.code !== 0 && r.outputTail ? { outputTail: r.outputTail } : {}),
          });
        }
        // First failure in BATCH ORDER (not completion order) — deterministic
        // regardless of which concurrent command happens to settle first.
        const failed = runs.find((r) => r.code !== 0);
        if (failed) {
          const label = failed.cmd.label ?? failed.cmd.bin;
          // verdict-quality (board web-mtq6zn6x-3khfkb): a crash's `details` used
          // to read identically to a real failure ("label failed (exit 1)"),
          // making a spawn error, a timeout, and a genuine tool crash all look
          // the same downstream. Keep "failed" in the text (existing callers
          // match on it) but fold in WHY when it's known.
          const verdict = failed.crashed
            ? `${label} failed (crashed${failed.crashReason ? `: ${failed.crashReason}` : ''}) — gate could not verify the commit`
            : `${label} failed (exit ${failed.code})`;
          // The tail rides after the verdict line, so callers that match on
          // "failed (exit N)" still do and a human reads why underneath.
          const details = failed.outputTail ? `${verdict}\n${failed.outputTail}` : verdict;
          return {
            ok: false,
            details,
            checks,
            ...(failed.crashed ? { crashed: true } : {}),
          };
        }
        i = next;
      }
      return { ok: true, details: `${commands.length} gate command(s) passed`, checks };
    } finally {
      release?.();
    }
  }
}
