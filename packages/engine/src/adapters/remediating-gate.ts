// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mechanical gate remediation (the 100%-shipping lever, evidence-driven): every
 * gate-revert observed in real flights was a FORMAT-ONLY failure — correct work
 * destroyed because the agent skipped `format:check`. A mechanical failure
 * deserves a mechanical fix, with no model in the loop (the pattern Snyk Agent
 * Fix / Open SWE use: fix → re-validate → keep or roll back):
 *
 *   gate fails → run the deterministic fixer (e.g. `prettier --write .`) →
 *   if it changed files, commit them ADDITIVELY (`style(autopilot): …`) →
 *   re-run the gate → pass ⇒ shipped (unit + autofix commits, honest history);
 *   still failing ⇒ revert the autofix commit so the engine's own revert hits
 *   the UNIT commit exactly as before. Remediation never masks a real failure —
 *   it only clears mechanical noise.
 */

import type { GatePort, GateResult, VcsPort } from '../ports.js';
import type { GateCommandSpec } from './gate.js';

export const AUTOFORMAT_COMMIT_MESSAGE =
  'style(autopilot): autoformat — mechanical gate remediation';

export interface RemediatingGateOptions {
  readonly inner: GatePort;
  readonly vcs: VcsPort;
  /** Run the deterministic fixer; resolve true when it executed successfully. */
  readonly runFixer: () => Promise<boolean>;
  /**
   * Serializes the fixer→commit→re-verify critical section across concurrent
   * instances flying the same repo (docs/DOCTRINE-COORDINATION.md's "AUTOFORMAT
   * is not yet a single writer" gap: two lanes racing this section can fight
   * over the exact same autoformat commit). Only wraps the critical section,
   * never the initial gate run, so a green gate — the common case — never
   * waits on a lock at all. `null` means the lock never freed up within its
   * own bound; treated the same as a failing fixer, so a stuck sibling
   * degrades to the unremediated result rather than hanging. Omit to run
   * unlocked (single-instance callers, and every existing test).
   */
  readonly withLock?: <T>(fn: () => Promise<T>) => Promise<T | null>;
}

/**
 * Derive the WRITE-mode formatter from the detected format CHECK command using
 * the `format:check` ⇒ `format` script convention. When the repo has no
 * `format` script the derived command simply exits non-zero and remediation
 * degrades to a no-op — never worse than having no remediation at all.
 */
export function deriveFormatFixCommand(
  format: GateCommandSpec | undefined,
): GateCommandSpec | null {
  if (!format) return null;
  const idx = format.args.findIndex((a) => a === 'format:check');
  if (idx === -1) return null;
  return {
    bin: format.bin,
    args: format.args.map((a, i) => (i === idx ? 'format' : a)),
    ...(format.label !== undefined
      ? { label: format.label.replace('format:check', 'format') }
      : {}),
  };
}

export class RemediatingGate implements GatePort {
  constructor(private readonly opts: RemediatingGateOptions) {}

  async run(): Promise<GateResult> {
    const first = await this.opts.inner.run();
    if (first.ok) return first;
    // A CRASH (missing dep/OOM/tool error) is not a real failure — the gate
    // never judged the work, so a formatter can't fix it. Skip straight
    // through instead of wasting a fixer run + commit + full gate re-run
    // (up to the timeout) on an environment remediation can't repair.
    if (first.crashed) return first;

    if (!this.opts.withLock) return this.remediate(first);
    const locked = await this.opts.withLock(() => this.remediate(first));
    // Lock never freed up (a sibling instance is mid-remediation) — degrade
    // to the unremediated failure rather than fighting it for the same commit.
    return locked ?? first;
  }

  /**
   * The fixer→commit→re-verify critical section — the part that must never
   * run concurrently with another instance's copy of itself. Split out of
   * `run` so callers can wrap exactly this span with `withLock`.
   */
  private async remediate(first: GateResult): Promise<GateResult> {
    // Mechanical remediation attempt — deterministic, model-free. Snapshot
    // the dirty set BEFORE the fixer runs so its own edits can be told apart
    // from any unrelated WIP already sitting in this working tree (RITUAL
    // SWEEP fix, board ap-mtm4qzty-1): a whole-tree `commitAll` here would
    // sweep up — and mislabel under the autoformat message — a concurrent
    // process's in-flight edit, or even judge "fixer changed nothing" as
    // "fixer succeeded" purely because unrelated WIP kept the tree dirty.
    const dirtyBeforeFix = new Set(await this.opts.vcs.dirtyPaths());
    const fixerRan = await this.opts.runFixer();
    if (!fixerRan) return first;
    const fixedPaths = (await this.opts.vcs.dirtyPaths()).filter(
      (path) => !dirtyBeforeFix.has(path),
    );
    if (fixedPaths.length === 0) return first; // fixer changed nothing NEW → real failure

    const committed = await this.opts.vcs.commitPaths(fixedPaths, AUTOFORMAT_COMMIT_MESSAGE);
    if (!committed) return first;
    const second = await this.opts.inner.run();
    // Both attempts' per-command results ride along so the drill-down shows the
    // full story — including the checks that only failed before remediation.
    const checks = [...(first.checks ?? []), ...(second.checks ?? [])];
    if (second.ok) {
      return {
        ok: true,
        details: `passed after mechanical remediation (${second.details})`,
        checks,
      };
    }
    // The RE-RUN crashed (missing dep/OOM/tool error) — same as the first
    // run's crash check above, this never judged the fix either way, so
    // leave the autoformat commit in place rather than reverting it.
    if (second.crashed) return { ...second, checks };

    // Still red: undo OUR commit so the engine's additive revert targets the
    // agent's unit commit exactly as it would have without remediation.
    await this.opts.vcs.revertLast();
    return { ...second, checks };
  }
}
