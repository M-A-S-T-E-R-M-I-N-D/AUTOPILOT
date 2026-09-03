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

    // Mechanical remediation attempt — deterministic, model-free.
    const fixerRan = await this.opts.runFixer();
    if (!fixerRan) return first;
    if (!(await this.opts.vcs.isDirty())) return first; // fixer changed nothing → real failure

    await this.opts.vcs.commitAll(AUTOFORMAT_COMMIT_MESSAGE);
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
