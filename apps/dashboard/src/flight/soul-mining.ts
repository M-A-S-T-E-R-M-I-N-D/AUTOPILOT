// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * SOUL evolution loop (B5 closure, web-msnsndir-k1xgnd), continuing
 * 6447b45/4bc52d5/afd05bf/e9c2795: those slices landed the storage
 * (`soul_proposed` + `proposeSoulAmendment`/`ratifySoulAmendment`/
 * `dismissSoulProposal`) and the ratify/dismiss UI, but nothing ever CALLED
 * `proposeSoulAmendment` — afd05bf flagged "the actual post-flight mining
 * step (what decides a proposal is worth making)" as the remaining open
 * half. `mineSoulAmendment` is that decision, kept pure (same seam as
 * `doc-freshness.ts`'s `computeDocDrift`) so it's unit-testable without a
 * real store: a post-flight sweep collects the inputs, this decides.
 *
 * The one learning mined so far is deliberately narrow and mechanical, not
 * free-form text generation: RESEARCH-LIBRARY.md's cognitive-defenses
 * section already names a repeated cap-death (checkpoint-and-resume)
 * streak as a live rot/fixation signal ("deaths cluster at high turns").
 * When a project's last CHECKPOINT_STREAK_THRESHOLD firings ALL died that
 * way, that is real, project-specific evidence worth surfacing to the
 * operator as a proposed SOUL note — never applied automatically, same
 * locked-by-default/operator-ratifies contract as every other SOUL change.
 */

export const CHECKPOINT_STREAK_THRESHOLD = 3;

/** Marks a SOUL amendment this module proposed — lets `mineSoulAmendment`
 *  recognize its own note already landed (via a prior ratify) and skip
 *  re-proposing the same learning forever. */
export const CHECKPOINT_SOUL_AMENDMENT_MARKER = '## Learned: recurring checkpoint pattern';

export const NOOP_STREAK_THRESHOLD = 3;

/** Marks the noop-streak note (epic 0014 slice 2) the same way. */
export const NOOP_SOUL_AMENDMENT_MARKER = '## Learned: recurring noop pattern';

/** How many newest `gate_result` rows the sweep must fetch so EVERY kind's
 *  full streak window is visible to its miner. */
export const SOUL_MINING_GATE_LOOKBACK = Math.max(
  CHECKPOINT_STREAK_THRESHOLD,
  NOOP_STREAK_THRESHOLD,
);

export interface SoulMiningInput {
  readonly soul: string;
  /** The project's current pending proposal, if any (`projects.soul_proposed`). */
  readonly soulProposed: string | null;
  /** `metrics.gate_result` for the project's most recent firings, newest first. */
  readonly recentGateResults: readonly (string | null)[];
}

/** One project-level learning kind (epic 0014's marker-registry design,
 *  applied at the project seam): the stable `## Learned: …` marker its notes
 *  carry, the `gate_result` value whose consecutive streak triggers it, and
 *  the fixed note body — a pre-authored template, never free-form text. */
interface StreakLearningKind {
  readonly marker: string;
  readonly gateResult: string;
  readonly streakThreshold: number;
  readonly note: string;
}

const CHECKPOINT_KIND: StreakLearningKind = {
  marker: CHECKPOINT_SOUL_AMENDMENT_MARKER,
  gateResult: 'checkpointed',
  streakThreshold: CHECKPOINT_STREAK_THRESHOLD,
  note:
    `- The last ${CHECKPOINT_STREAK_THRESHOLD} firings each hit the turn cap mid-unit ` +
    `(checkpoint-and-resume, gate_result: checkpointed). Size the next unit smaller than ` +
    `instinct suggests: commit the first safely-verifiable slice well before the cap, ` +
    `instead of chasing the whole task in one firing.`,
};

/** Second learning kind (epic 0014 slice 2): a project whose firings keep
 *  ending with no commit is telling the operator its board is stale or
 *  scoped elsewhere — the NOOP→VERDICT doctrine turned into a mined note. */
const NOOP_KIND: StreakLearningKind = {
  marker: NOOP_SOUL_AMENDMENT_MARKER,
  gateResult: 'no-commit',
  streakThreshold: NOOP_STREAK_THRESHOLD,
  note:
    `- The last ${NOOP_STREAK_THRESHOLD} firings each ended with no commit ` +
    `(gate_result: no-commit). The board may be stale or scoped away from this project: ` +
    `instead of re-scanning the same ground, spend the firing on VERDICT proposals ` +
    `(split/close/deprioritize/blocked) so the operator can unblock or retire the work.`,
};

/** True when the newest `streakThreshold` firings all ended as the kind's
 *  `gateResult` — a consecutive streak, not merely N-of-M, since a genuine
 *  turnaround (one different outcome) should reset it. */
function hasGateResultStreak(
  recentGateResults: readonly (string | null)[],
  kind: StreakLearningKind,
): boolean {
  if (recentGateResults.length < kind.streakThreshold) return false;
  return recentGateResults
    .slice(0, kind.streakThreshold)
    .every((result) => result === kind.gateResult);
}

function mineStreakAmendment(input: SoulMiningInput, kind: StreakLearningKind): string | null {
  if (input.soulProposed !== null) return null;
  if (input.soul.includes(kind.marker)) return null;
  if (!hasGateResultStreak(input.recentGateResults, kind)) return null;
  return `${input.soul.trimEnd()}\n\n${kind.marker}\n${kind.note}\n`;
}

/**
 * Decides whether THIS flight should propose a SOUL amendment, returning the
 * full proposed replacement text (never a diff — `proposeSoulAmendment`
 * stores whole text, same as `ratifySoulAmendment` applies it wholesale) or
 * `null` when there is nothing fresh to propose: a proposal is already
 * pending (the operator hasn't acted on the last one yet — never overwrite
 * an unreviewed proposal with a re-derived one), the SOUL already carries
 * this note (a past proposal was ratified, or dismissed and rediscovering it
 * every flight would just be noise for a decision the operator already
 * made), or the checkpoint streak hasn't happened.
 */
export function mineSoulAmendment(input: SoulMiningInput): string | null {
  return mineStreakAmendment(input, CHECKPOINT_KIND);
}

/** {@link mineSoulAmendment}'s twin for the noop-streak learning — same
 *  contract, second registry kind (epic 0014 slice 2). */
export function mineNoopSoulAmendment(input: SoulMiningInput): string | null {
  return mineStreakAmendment(input, NOOP_KIND);
}

/** Cuts a marker heading (and everything through the next `## ` heading, or
 *  end of string) out of SOUL text, so a pruned note leaves no orphaned
 *  bullets behind. Exported for {@link pruneSoulAmendment} here and
 *  `fleet-wisdom-mining.ts`'s `composeSoulWithFleetWisdom`, which strips a
 *  note the project SOUL already carries out of the shared fleet layer. */
export function stripMarkedSection(soul: string, marker: string): string {
  const markerIndex = soul.indexOf(marker);
  if (markerIndex === -1) return soul;
  const before = soul.slice(0, markerIndex).trimEnd();
  const afterMarker = soul.slice(markerIndex + marker.length);
  const nextHeadingOffset = afterMarker.indexOf('\n## ');
  const after =
    nextHeadingOffset === -1 ? '' : afterMarker.slice(nextHeadingOffset + 1).trimStart();
  return after ? `${before}\n\n${after}` : `${before}\n`;
}

export interface SoulPruneInput {
  readonly soul: string;
  /** The project's current pending proposal, if any (`projects.soul_proposed`). */
  readonly soulProposed: string | null;
  /** `metrics.gate_result` for the project's most recent firings, newest first. */
  readonly recentGateResults: readonly (string | null)[];
}

/**
 * Counterpart to {@link mineSoulAmendment} (board web-mt1qajrv-ukabrc,
 * "META-LEARNING GAP — SOUL/LESSON PRUNE"): libraries must evolve, not
 * grow, and removal is regression-gated and first-class, not an
 * afterthought. The recurring-checkpoint note asserts a specific, checkable
 * fact — "the last N firings hit the cap mid-unit" — that can go stale the
 * moment a clean ship breaks the streak it described. When that happens,
 * propose dropping the now-inaccurate note, through the SAME
 * `soul_proposed`/ratify-or-dismiss slot `mineSoulAmendment` writes to:
 * pruning is never automatic, only ever offered for the operator to accept.
 * Deliberately narrow, mirroring `mineSoulAmendment`'s own scope: it only
 * knows how to retract the one note type mined so far.
 */
export function pruneSoulAmendment(input: SoulPruneInput): string | null {
  return pruneStreakAmendment(input, CHECKPOINT_KIND);
}

/** {@link pruneSoulAmendment}'s twin for the noop-streak note: once a firing
 *  that commits (or dies differently) breaks the streak the note asserted,
 *  propose retracting it — same operator-ratified slot, never automatic. */
export function pruneNoopSoulAmendment(input: SoulPruneInput): string | null {
  return pruneStreakAmendment(input, NOOP_KIND);
}

function pruneStreakAmendment(input: SoulPruneInput, kind: StreakLearningKind): string | null {
  if (input.soulProposed !== null) return null;
  if (!input.soul.includes(kind.marker)) return null;
  if (hasGateResultStreak(input.recentGateResults, kind)) return null;
  return stripMarkedSection(input.soul, kind.marker);
}
