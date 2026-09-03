// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * SYSTEMIC fix (BACKLOG web-msm66jma-4w4bwr): a firing that only advances its
 * linked board task — not finishes it — must not close the whole task. The
 * agent self-reports `"completion":"slice"|"complete"` on its METRICS line
 * (packages/engine/src/telemetry.ts); fly.ts's markTaskDoneIfShipped calls
 * this to decide whether the task closes or stays open for the next firing.
 * NULL (every firing before this field existed, or a commit-inferred ship
 * with no self-report to say otherwise) is trusted whole, same as before.
 */
export function taskShouldClose(completion: 'slice' | 'complete' | null): boolean {
  return completion !== 'slice';
}

/**
 * NOOP→VERDICT follow-through (measured gap, 2026-08-21: two tasks were each
 * re-picked and re-verdict'd at ~$2 a pass — $8.39 of duplicate judgment in
 * one morning): when a verdict-carrying noop's PROPOSALS name the very task
 * this firing claimed, the decision now belongs to the OPERATOR — return
 * that task id so the flight defers it (out of every sibling's pick queue,
 * across flights) until the proposal is approved or rejected. Null when the
 * verdict was about something else, or nothing was claimed: those noops
 * change nothing about the claimed task's standing.
 */
export function verdictDeferTarget(
  claimedTaskId: string | null,
  proposals: readonly { readonly title: string }[] | undefined,
): string | null {
  if (claimedTaskId === null) return null;
  return verdictDeferTargets(proposals).includes(claimedTaskId) ? claimedTaskId : null;
}

/** Every task-id shape the board mints — `web-<ts36>-<rand>` (web board),
 *  `ap-<ts36>-<n>` (firing-hooks self-proposals), `inbox-<slug>`
 *  (inbox-triage) and `github-<issue#>` (issue-triage) — used to pull the
 *  tasks a verdict proposal NAMES out of its title. Widened from web-only
 *  (board web-mtettjx9-57a9i5): a verdict naming a self-proposed or triaged
 *  task deferred nothing. Over-matching prose (e.g. "inbox-triage") is fine
 *  — the caller only flips tasks whose exact id is currently open. */
const VERDICT_TASK_ID_RE =
  /(?:web|ap)-[a-z0-9]+-[a-z0-9]+|inbox-[a-z0-9]+(?:-[a-z0-9]+)*|github-[0-9]+/g;
const VERDICT_DEFER_KIND_RE = /^VERDICT (close|blocked)\b/i;

/**
 * Generalized defer (investigation, 2026-08-21 — the claimed-task-only
 * {@link verdictDeferTarget} missed its first live case THE SAME DAY: one
 * firing's verdicts named THREE tasks while its claim pointed elsewhere, so
 * zero defers fired and the re-pick class stayed open): every task id a
 * `VERDICT close`/`VERDICT blocked` proposal names is handed to the operator
 * — deferred out of every pick queue until the proposal is ruled on.
 * `split`/`deprioritize` verdicts leave workable content and defer nothing.
 * Order-preserving, deduped; the CALLER guards that only currently-open
 * tasks actually flip (a verdict naming a done task must not resurrect it).
 */
export function verdictDeferTargets(
  proposals: readonly { readonly title: string }[] | undefined,
): string[] {
  if (proposals === undefined) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const p of proposals) {
    if (!VERDICT_DEFER_KIND_RE.test(p.title)) continue;
    for (const id of p.title.match(VERDICT_TASK_ID_RE) ?? []) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

/**
 * The full defer set for ONE firing: {@link verdictDeferTarget}'s claimed-task
 * check merged with {@link verdictDeferTargets}' generalized named-task scan,
 * deduped. Takes no noop/gate-result input — by design: fly.ts previously ran
 * this merge only inside its `noopClass === 'verdict-carrying'` branch, and
 * `classifyNoop` (packages/engine/src/telemetry.ts) returns null whenever
 * `gateResult !== 'no-commit'`, so a firing that SHIPPED unrelated work while
 * ALSO filing "VERDICT blocked X" about a different task never deferred X —
 * X stayed queued and got re-picked and re-verdict'd every subsequent firing
 * (the starvation class EVALUATION-2026-08-27-silent-gate.md documents).
 * Calling this unconditionally on every firing's proposals, not just a pure
 * noop's, closes that gap by construction.
 */
export function verdictDeferTargetsForFiring(
  claimedTaskId: string | null,
  proposals: readonly { readonly title: string }[] | undefined,
): string[] {
  const claimDefer = verdictDeferTarget(claimedTaskId, proposals);
  const namedTargets = verdictDeferTargets(proposals);
  return [...new Set([...(claimDefer !== null ? [claimDefer] : []), ...namedTargets])];
}

/** The machine-checkable world state a VERDICT-blocked title is judged
 *  against at flight start — the two blocker classes board
 *  web-mtettjx9-57a9i5 part (a) names: a sibling LANE that has since landed/
 *  vanished, and a GATE that has since gone green. */
export interface VerdictBlockerState {
  /** Fleet lane names/branches currently flying (e.g.
   *  `autopilot/flight-worktree-fly-autopilot--fleet-3`). */
  readonly liveLanes: readonly string[];
  /** Whether this checkout's gate is green right now. */
  readonly gateGreen: boolean;
}

const VERDICT_BLOCKED_RE = /^VERDICT blocked\b/i;
const LANE_TOKEN_RE = /fleet-\d+/gi;
const GATE_MENTION_RE = /\bgate\b/i;

/** The `fleet-<n>` tokens in `text`, lowercased — token equality (never bare
 *  substring) is what keeps a verdict's `fleet-1` from matching a live
 *  `fleet-10` lane. */
function laneTokens(text: string): string[] {
  return (text.match(LANE_TOKEN_RE) ?? []).map((token) => token.toLowerCase());
}

/**
 * VERDICT AUTO-RECONCILE part (a)'s pure decision core (board
 * web-mtettjx9-57a9i5): has the blocker a `VERDICT blocked` proposal NAMED
 * verifiably cleared, so its deferred target may requeue and the verdict
 * retire? Deliberately fail-closed at every step, mirroring the pr-review
 * doctrine that a check may only narrow: a non-blocked verdict (close is the
 * operator's call, split/deprioritize defer nothing) never clears; a blocked
 * title naming NO machine-checkable blocker never clears — the operator's
 * bench decision stands until a human rules, because "I can't parse the
 * reason" must not become "the reason is gone". A named `fleet-<n>` lane
 * clears only when no live lane carries that exact token; a gate mention
 * clears only when the gate is green NOW; a title naming both requeues only
 * when BOTH cleared. Pure — the flight-start sweep wiring in fly.ts (which
 * guards that only currently-`deferred` tasks flip, and retires the
 * proposal) is the follow-up slice.
 */
export function verdictBlockerCleared(title: string, state: VerdictBlockerState): boolean {
  if (!VERDICT_BLOCKED_RE.test(title)) return false;
  const namedLanes = [...new Set(laneTokens(title))];
  const namesGate = GATE_MENTION_RE.test(title);
  if (namedLanes.length === 0 && !namesGate) return false;
  const liveTokens = new Set(state.liveLanes.flatMap((lane) => laneTokens(lane)));
  const lanesGone = namedLanes.every((lane) => !liveTokens.has(lane));
  const gateCleared = !namesGate || state.gateGreen;
  return lanesGone && gateCleared;
}

/** One deferred task paired with the `VERDICT blocked` proposal title that
 *  benched it — the shape the flight-start sweep hands to {@link
 *  verdictRequeueTargets}. */
export interface VerdictBlockedDefer {
  readonly taskId: string;
  readonly verdictTitle: string;
}

/**
 * Which deferred task ids may requeue this flight start: exactly those whose
 * EVERY benching verdict {@link verdictBlockerCleared} judges cleared. A task
 * benched by two verdicts requeues only when both cleared — one standing "no"
 * keeps it benched, because requeueing past a live blocker on the strength of
 * an unrelated cleared one would widen, and every check in this doctrine may
 * only narrow (the same all-must-clear stance verdictBlockerCleared itself
 * takes on a title naming both a lane and the gate). Order-preserving,
 * deduped — the same contract as {@link verdictDeferTargets}; the CALLER
 * guards that only currently-`deferred` tasks actually flip back to `queued`
 * and that the ruled-out verdict proposal is retired alongside.
 */
export function verdictRequeueTargets(
  defers: readonly VerdictBlockedDefer[],
  state: VerdictBlockerState,
): string[] {
  const stillBlocked = new Set<string>();
  for (const defer of defers) {
    if (!verdictBlockerCleared(defer.verdictTitle, state)) stillBlocked.add(defer.taskId);
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const defer of defers) {
    if (stillBlocked.has(defer.taskId) || seen.has(defer.taskId)) continue;
    seen.add(defer.taskId);
    ids.push(defer.taskId);
  }
  return ids;
}
