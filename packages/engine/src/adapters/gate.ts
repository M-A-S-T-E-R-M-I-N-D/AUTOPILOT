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

/** Run one command with `execFile` (no shell string). Any spawn/exec failure ⇒ non-zero. */
const realExec: GateExec = (cmd, cwd, timeoutMs) =>
  new Promise((resolve) => {
    const inv = buildInvocation(cmd.bin, cmd.args, process.platform);
    execFile(inv.bin, inv.args, { cwd, timeout: timeoutMs, windowsHide: true }, (error) => {
      if (!error) {
        resolve({ code: 0 });
        return;
      }
      // A real exit code is numeric; a spawn failure (ENOENT) or timeout carries a
      // string/undefined code (e.g. 'ENOENT', 'ETIMEDOUT') — the tool never ran to
      // completion, so this is a CRASH, not the tool's own verdict.
      const raw = (error as { code?: unknown }).code;
      const isRealExitCode = typeof raw === 'number';
      resolve({ code: isRealExitCode ? raw : 1, crashed: !isRealExitCode });
    });
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

    const checks: GateCheckResult[] = [];
    // Never let an observer's own failure change a gate verdict — this is a
    // reporting side channel, not part of the decision.
    const notify = (event: GateProgressEvent): void => {
      try {
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
          const { code, crashed } = await exec(cmd, cwd, timeoutMs);
          const durationMs = Date.now() - startedAt;
          notify({
            kind: 'end',
            label,
            index: position,
            total: commands.length,
            pass: code === 0,
            durationMs,
          });
          return { cmd, code, crashed, durationMs };
        }),
      );
      for (const r of runs) {
        checks.push({
          label: r.cmd.label ?? r.cmd.bin,
          pass: r.code === 0,
          durationMs: r.durationMs,
        });
      }
      // First failure in BATCH ORDER (not completion order) — deterministic
      // regardless of which concurrent command happens to settle first.
      const failed = runs.find((r) => r.code !== 0);
      if (failed) {
        const label = failed.cmd.label ?? failed.cmd.bin;
        return {
          ok: false,
          details: `${label} failed (exit ${failed.code})`,
          checks,
          ...(failed.crashed ? { crashed: true } : {}),
        };
      }
      i = next;
    }
    return { ok: true, details: `${commands.length} gate command(s) passed`, checks };
  }
}
