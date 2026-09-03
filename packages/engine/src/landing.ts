// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The LANDING card's EXECUTE policy (BACKLOG web-msnqeegt-ki7dm0, "Landing
 * EXECUTE v3" — v2 shipped a read-only preview only). Gate-then-merge: runs
 * the project's verification gate first and REFUSES to touch git at all when
 * it's red, so a merge is never attempted on unverified work. Only once the
 * gate is green does it hand off to `GitVcs.land`. This is the policy layer
 * only — the CSRF-guarded HTTP endpoint (`landing/execute.ts`), the
 * explicit-confirm UI (`web/shell.ts`), and the rebuild + graceful restart
 * (`landing/self-restart.ts`) are wired in on top of it.
 */

import type { GatePort, GateResult } from './ports.js';
import type { LandResult, LineRange } from './adapters/git.js';

/** Minimal VCS capability `executeLanding` needs — implemented by {@link GitVcs.land}. */
export interface Landable {
  land(base: string, message?: string): Promise<LandResult>;
}

/** Why one landing-execute attempt succeeded or was refused. */
export type LandingExecuteReason = 'gate-red' | 'merge-failed' | 'landed';

export interface LandingExecuteResult {
  readonly ok: boolean;
  readonly reason: LandingExecuteReason;
  readonly details: string;
  /** The gate run that gated this attempt — present whenever the gate actually ran. */
  readonly gate?: GateResult;
}

/**
 * Runs `gate`, and only when it passes hands off to `vcs.land(base)`. A red
 * gate short-circuits before any git command runs — the returned result still
 * carries the gate's own `details`/`checks` so the caller (the LANDING card)
 * can show exactly which check failed.
 */
export async function executeLanding(
  gate: GatePort,
  vcs: Landable,
  base: string,
  message?: string,
): Promise<LandingExecuteResult> {
  const gateResult = await gate.run();
  if (!gateResult.ok) {
    return {
      ok: false,
      reason: 'gate-red',
      details: gateResult.details ?? 'the gate failed',
      gate: gateResult,
    };
  }

  const land = await vcs.land(base, message);
  return land.ok
    ? { ok: true, reason: 'landed', details: land.details, gate: gateResult }
    : { ok: false, reason: 'merge-failed', details: land.details, gate: gateResult };
}

/** A sibling flight branch's own unlanded files, the input {@link detectLandingOverlap} compares against. */
export interface SiblingFileSet {
  readonly branch: string;
  readonly files: readonly string[];
}

/** A sibling flight branch whose unlanded work touches files this landing is about to bring into `base`. */
export interface LandingOverlapWarning {
  readonly branch: string;
  readonly files: readonly string[];
}

/**
 * Detects same-file overlap between the branch about to land and each
 * sibling flight branch's own unlanded work (RESEARCH-LIBRARY fleet
 * anti-duplication, defense-stack item 3: landing branch A while sibling
 * branch B's unlanded commits touch the same files heads B toward a
 * conflict, or worse a silent duplicate-work collision, the moment B itself
 * lands). Pure set-intersection — no git access; callers gather each side's
 * file list (see `commitsAhead`'s `ref` parameter). Deliberately
 * detection-only: Mergiraf as a resolution aid remains a follow-up.
 */
export function detectLandingOverlap(
  myFiles: readonly string[],
  siblings: readonly SiblingFileSet[],
): readonly LandingOverlapWarning[] {
  const mine = new Set(myFiles);
  const warnings: LandingOverlapWarning[] = [];
  for (const sibling of siblings) {
    const files = [...new Set(sibling.files)].filter((f) => mine.has(f));
    if (files.length > 0) warnings.push({ branch: sibling.branch, files });
  }
  return warnings;
}

/** True when any range in `a` intersects any range in `b` (inclusive, 1-indexed spans). */
function hunksOverlap(a: readonly LineRange[], b: readonly LineRange[]): boolean {
  return a.some((x) => b.some((y) => x.start <= y.end && y.start <= x.end));
}

/**
 * Narrows {@link detectLandingOverlap}'s file-level warnings down to files
 * whose actual changed lines intersect — a same-file touch in two disjoint
 * parts of an 800-line module isn't the collision risk a same-line touch is.
 * `myRanges`/`branchRanges` come from {@link GitVcs.changedLineRanges}, the
 * latter keyed by branch to match each warning. A file this pass can't
 * measure (missing from either side's range map — a binary file, or the diff
 * itself failed) is KEPT rather than silently dropped: an unmeasurable file
 * is treated as a possible collision, not a cleared one.
 */
export function narrowToHunkOverlap(
  fileWarnings: readonly LandingOverlapWarning[],
  myRanges: ReadonlyMap<string, readonly LineRange[]>,
  branchRanges: ReadonlyMap<string, ReadonlyMap<string, readonly LineRange[]>>,
): readonly LandingOverlapWarning[] {
  const warnings: LandingOverlapWarning[] = [];
  for (const warning of fileWarnings) {
    const theirRanges = branchRanges.get(warning.branch);
    const files = warning.files.filter((file) => {
      const mine = myRanges.get(file);
      const theirs = theirRanges?.get(file);
      if (!mine || !theirs) return true;
      return hunksOverlap(mine, theirs);
    });
    if (files.length > 0) warnings.push({ branch: warning.branch, files });
  }
  return warnings;
}
