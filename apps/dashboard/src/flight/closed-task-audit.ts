// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * CLOSED-TASK AUDIT ritual (web-msu74pog-w4hjgq) — the VERIFY DIET false-close
 * class: `flight/deliverable.ts`'s `verifyDeliverable` only proves a
 * DELIVERABLE clause true AT SHIP TIME, against that one commit's patch. Code
 * drifts after a task closes — a later refactor can delete or rename away the
 * very thing a "complete" claim pointed at, and nothing re-checks it once the
 * task is off the board. This is that re-check: the same keyword-overlap
 * heuristic, run against the CURRENT committed tree (`GitVcs.containsText`)
 * instead of a single historical patch. A second, narrower re-check
 * (`auditClosedTaskUxExpression`) closes the base check's own blind spot for
 * UX-promising clauses: a keyword can survive in a stray backend comment
 * long after the `/web/` panel or `docs/*.md` entry it described was ripped
 * out, and plain keyword-anywhere presence would miss that entirely.
 */

import { deliverableKeywords, extractDeliverable, promisesUxExpression } from './deliverable.js';

/** The lookup this audit needs from a VCS — satisfied by `GitVcs` (`@autopilot/engine`). */
export interface AuditVcs {
  containsText(pattern: string): Promise<boolean>;
  /** Committed paths whose content matches `pattern` — {@link GitVcs.filesContainingText}. */
  filesContainingText(pattern: string): Promise<readonly string[]>;
}

/**
 * True when `keyword` (or its naive singular, mirroring
 * `deliverable.ts`'s plural↔singular tolerance) satisfies `present`. Shared
 * by {@link auditClosedTaskDeliverable} (present = anywhere in the tree) and
 * {@link auditClosedTaskUxExpression} (present = specifically in a
 * user-facing file) so the plural↔singular tolerance isn't duplicated.
 */
async function keywordStillPresent(
  keyword: string,
  present: (keyword: string) => Promise<boolean>,
): Promise<boolean> {
  if (await present(keyword)) return true;
  if (!keyword.endsWith('s')) return false;
  const singular = keyword.slice(0, -1);
  return singular.length >= 4 && (await present(singular));
}

/**
 * True when a closed task's DELIVERABLE clause is still backed by the
 * current codebase — false is a drift candidate the ritual should reopen. A
 * clause with no checkable keywords (e.g. entirely stopwords) can't be
 * contradicted, so it passes untouched, same as the ship-time verifier.
 */
export async function auditClosedTaskDeliverable(
  deliverable: string,
  vcs: AuditVcs,
): Promise<boolean> {
  const keywords = deliverableKeywords(deliverable);
  if (keywords.length === 0) return true;
  for (const keyword of keywords) {
    if (await keywordStillPresent(keyword, (k) => vcs.containsText(k))) return true;
  }
  return false;
}

/** Mirrors `deliverable.ts`'s `touchesUserFacingSurface`, but against a
 *  currently-tracked file path instead of a patch's touched-file list. */
function isUserFacingPath(path: string): boolean {
  return path.includes('/web/') || (path.startsWith('docs/') && path.endsWith('.md'));
}

/**
 * True when a DELIVERABLE clause that promises a user-facing capability
 * (`promisesUxExpression`) is STILL backed by a `/web/` or `docs/*.md` file
 * in the CURRENT tree, not merely mentioned somewhere. This is the audit's
 * blind spot `auditClosedTaskDeliverable` alone can't see: that check only
 * proves a keyword survives ANYWHERE, so a UI panel ripped out by a later
 * refactor still passes as long as a stray backend comment keeps saying
 * "chip" — the very false-close the ritual exists to catch. A clause with
 * no UX signal words isn't promising a UI/Docs surface at all, so it passes
 * untouched without querying the VCS, same as the ship-time
 * `verifyUxExpression` treats a non-UX clause as out of scope.
 */
export async function auditClosedTaskUxExpression(
  deliverable: string,
  vcs: AuditVcs,
): Promise<boolean> {
  if (!promisesUxExpression(deliverable)) return true;
  const keywords = deliverableKeywords(deliverable);
  if (keywords.length === 0) return true;
  for (const keyword of keywords) {
    const stillUserFacing = async (k: string): Promise<boolean> =>
      (await vcs.filesContainingText(k)).some(isUserFacingPath);
    if (await keywordStillPresent(keyword, stillUserFacing)) return true;
  }
  return false;
}

/** A DONE task the ritual has to consider — the fields it needs from a `TaskSummaryRow`. */
export interface ClosedTaskAuditCandidate {
  readonly id: string;
  readonly title: string;
}

/** One DONE task whose DELIVERABLE clause is no longer backed by the tracked tree. */
export interface ClosedTaskAuditFinding {
  readonly taskId: string;
  readonly title: string;
  readonly deliverable: string;
  /** 'deliverable-drift': the clause's keywords vanished from the tree entirely.
   *  'ux-expression-drift': the keywords survive, but no longer in a `/web/` or
   *  `docs/*.md` file — a UI panel ripped out, leaving only a stray mention. */
  readonly reason: 'deliverable-drift' | 'ux-expression-drift';
}

/**
 * Runs {@link auditClosedTaskDeliverable} over every DONE candidate that
 * carries a `DELIVERABLE:` clause, returning one finding per clause the
 * current tree no longer backs. A candidate with no clause at all (nothing
 * to re-check) is skipped rather than flagged, same as the ship-time
 * verifier treats an unparseable claim as unfalsifiable. A clause that
 * clears the base check but promises a UI/Docs surface still gets
 * {@link auditClosedTaskUxExpression}'s narrower re-check — the two never
 * both fire for the same candidate, since a broader deliverable-drift
 * already subsumes it.
 */
export async function findClosedTaskAuditFindings(
  candidates: readonly ClosedTaskAuditCandidate[],
  vcs: AuditVcs,
): Promise<readonly ClosedTaskAuditFinding[]> {
  const findings: ClosedTaskAuditFinding[] = [];
  for (const candidate of candidates) {
    const deliverable = extractDeliverable(candidate.title);
    if (!deliverable) continue;
    if (!(await auditClosedTaskDeliverable(deliverable, vcs))) {
      findings.push({
        taskId: candidate.id,
        title: candidate.title,
        deliverable,
        reason: 'deliverable-drift',
      });
    } else if (!(await auditClosedTaskUxExpression(deliverable, vcs))) {
      findings.push({
        taskId: candidate.id,
        title: candidate.title,
        deliverable,
        reason: 'ux-expression-drift',
      });
    }
  }
  return findings;
}
