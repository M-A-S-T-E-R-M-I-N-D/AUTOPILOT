// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { GatePort } from '@autopilot/engine';

/**
 * CONVERGENCE GATE — verify the MERGED branch after a sync-back.
 *
 * Each lane gates its own worktree, then `syncWorktreeBranch` merges into
 * `targetBranch` and only checks that git succeeded. A clean auto-merge of
 * two individually-green lanes can still be red, and it has been twice:
 * `eab78a89` (auto-merge kept both sides of four test fixtures → duplicate
 * object keys) and `f13ba9ee` (two lanes re-exported different symbols →
 * dangling re-export). Both were tsc-red while vitest stayed GREEN, because
 * esbuild's transform tolerates duplicate keys (last wins).
 *
 * Two call sites, two gate weights (board web-mtbeu5d3-n09acx "CONVERGENCE
 * FULL GATE"):
 *  - Per-firing sync-back: typecheck only (~17s) — the ~109s median gap
 *    between two lanes advancing the branch can't absorb a full gate
 *    (~160s), and typecheck alone caught both recorded incidents.
 *  - Flight-end final sync-back: the FULL detected gate (typecheck + lint +
 *    format + test + build) — this runs once, after the last lane for the
 *    flight has landed, so the cadence pressure above doesn't apply. It is
 *    the one point that can still catch an ADDITIVE invariant two
 *    individually-green lanes each respect alone but jointly bust (a lint
 *    rule, a test count, a build-time budget) before the next landing
 *    ritual runs — `docs/DOCTRINE-COORDINATION.md` documents that ritual as
 *    the only OTHER full-suite gate on this branch, and it only fires on an
 *    explicit land, so a flight that never lands never sees it.
 *
 * Alarm, not a blocker either way: refusing the merge here would strand
 * work that is already committed and safe. A red convergence is surfaced
 * loudly and persisted, same contract as `sync-back-refusal`.
 */
export interface ConvergenceGateDeps {
  readonly gate: GatePort;
  readonly out: (line: string) => void;
  readonly recordRed: (check: string, mergeDetails: string) => void;
}

export async function gateConvergedBranch(
  targetBranch: string,
  mergeDetails: string,
  deps: ConvergenceGateDeps,
): Promise<void> {
  const result = await deps.gate.run();
  const checks = result.checks ?? [];
  // Nothing detected for this repo (e.g. no typecheck command) — silent
  // no-op, not a false "convergence passes" green.
  if (checks.length === 0) return;

  if (result.ok) {
    // Say so on SUCCESS too. A gate whose green is invisible is a gate
    // nobody can prove ran — which is precisely how `test:impacted` sat
    // executing zero tests across 15 firings while reporting `passed`
    // (docs/EVALUATION-2026-08-27-silent-gate.md §1). The duration is the
    // tell: a real gate run is seconds to low minutes, a silently-skipped
    // one is not.
    const ms = checks.reduce((sum, c) => sum + c.durationMs, 0);
    deps.out(
      `  ✓ convergence: '${targetBranch}' passes ${checks.length} check(s) after sync-back ` +
        `(${Math.round(ms)}ms)`,
    );
    return;
  }

  const reason = checks.find((c) => !c.pass)?.label ?? 'gate';
  deps.out(
    `  ⛔ CONVERGENCE RED: '${targetBranch}' fails ${reason} AFTER this sync-back — ` +
      `both sides were green alone, so this is a merge interaction. ${mergeDetails}`,
  );
  deps.recordRed(reason, mergeDetails);
}
