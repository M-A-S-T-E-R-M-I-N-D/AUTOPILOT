// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Anomaly thresholds (backlog C, early M8 slice): cost-spike, death-cluster,
 * and gate-fail-streak rules over a project's flight log — pure read-model
 * derivations, same shape as {@link fleetStreak} — so a run of trouble shows
 * up as a needs-you chip with evidence instead of requiring the operator to
 * eyeball the flight log.
 */

import type { FlightEntry } from './fleet.js';
import { nearMissClassLabel, type NearMissClass } from '../flight/near-miss.js';

export type AnomalyKind =
  | 'cost-spike'
  | 'death-cluster'
  | 'gate-fail-streak'
  | 'orient-drag'
  | 'family-runaway'
  | 'intent-collision'
  | 'near-miss-recurring'
  | 'guard-denial'
  | 'sync-back-refusal'
  | 'land-gate-alarm'
  | 'convergence-red'
  | 'e2e-land-block';

export interface Anomaly {
  readonly kind: AnomalyKind;
  readonly evidence: string;
}

/** How many prior firings feed the cost-spike baseline average. */
const COST_SPIKE_WINDOW = 5;
/** A spike must also clear this floor — cheap firings jittering 3x is noise. */
const COST_SPIKE_FLOOR_USD = 1;
/** How far above the recent baseline counts as a spike. */
const COST_SPIKE_MULTIPLIER = 3;

/** The latest firing's cost multiples over the recent baseline average. */
function costSpike(log: readonly FlightEntry[]): Anomaly | null {
  if (log.length <= COST_SPIKE_WINDOW) return null;
  const latest = log[0];
  if (!latest || latest.cost < COST_SPIKE_FLOOR_USD) return null;
  const baseline = log.slice(1, 1 + COST_SPIKE_WINDOW);
  const avg = baseline.reduce((sum, f) => sum + f.cost, 0) / baseline.length;
  if (avg <= 0 || latest.cost < avg * COST_SPIKE_MULTIPLIER) return null;
  return {
    kind: 'cost-spike',
    evidence: `Firing cost $${latest.cost.toFixed(2)} vs ~$${avg.toFixed(2)} average of the last ${baseline.length} firings.`,
  };
}

/** How many of the most recent firings death-cluster looks at. */
const DEATH_CLUSTER_WINDOW = 3;
/** How many deaths within that window counts as a cluster. */
const DEATH_CLUSTER_THRESHOLD = 2;

/** Several of the last few firings died (turn-cap/error) without shipping. */
function deathCluster(log: readonly FlightEntry[]): Anomaly | null {
  const recent = log.slice(0, DEATH_CLUSTER_WINDOW);
  if (recent.length < DEATH_CLUSTER_WINDOW) return null;
  const deaths = recent.filter((f) => f.died !== null).length;
  if (deaths < DEATH_CLUSTER_THRESHOLD) return null;
  return {
    kind: 'death-cluster',
    evidence: `${deaths} of the last ${recent.length} firings died (turn-cap/error) without shipping.`,
  };
}

/** How many consecutive gate reverts count as a streak worth flagging. */
const GATE_FAIL_STREAK_THRESHOLD = 3;

/** A run of consecutive gate-reverted firings, counted from the most recent. */
function gateFailStreak(log: readonly FlightEntry[]): Anomaly | null {
  let streak = 0;
  for (const f of log) {
    if (f.gateResult !== 'reverted') break;
    streak++;
  }
  if (streak < GATE_FAIL_STREAK_THRESHOLD) return null;
  return {
    kind: 'gate-fail-streak',
    evidence: `${streak} consecutive firings reverted by the gate.`,
  };
}

/** The subset of `@autopilot/store`'s `OrientLength` {@link orientDrag} reads. */
export interface OrientLengthLike {
  readonly actionsBeforeFirstEdit: number;
}

/** How many prior firings feed the orient-drag baseline average. */
const ORIENT_DRAG_WINDOW = 5;
/** A drag must also clear this floor — a handful of extra reads is noise. */
const ORIENT_DRAG_FLOOR_ACTIONS = 10;
/** How far above the recent baseline counts as dragging. */
const ORIENT_DRAG_MULTIPLIER = 2;

/**
 * ORIENT-length anomaly (COGNITIVE DEFENSES, board web-mssn107s-qh8d95): the
 * latest firing spent far longer reading/searching before its first edit than
 * its recent baseline — the RESEARCH-LIBRARY audit's turns-before-first-edit
 * signal. Same window/floor/multiplier shape as {@link costSpike}; the
 * per-firing lengths come from the store's `orientLengths` (newest first),
 * which already excludes firings that never edited at all.
 */
function orientDrag(orient: readonly OrientLengthLike[]): Anomaly | null {
  if (orient.length <= ORIENT_DRAG_WINDOW) return null;
  const latest = orient[0];
  if (!latest || latest.actionsBeforeFirstEdit < ORIENT_DRAG_FLOOR_ACTIONS) return null;
  const baseline = orient.slice(1, 1 + ORIENT_DRAG_WINDOW);
  const avg = baseline.reduce((sum, f) => sum + f.actionsBeforeFirstEdit, 0) / baseline.length;
  if (avg <= 0 || latest.actionsBeforeFirstEdit < avg * ORIENT_DRAG_MULTIPLIER) return null;
  return {
    kind: 'orient-drag',
    evidence: `Latest firing took ${latest.actionsBeforeFirstEdit} actions before its first edit vs ~${avg.toFixed(1)} average of the last ${baseline.length} edit-reaching firings.`,
  };
}

/** One already-flagged runaway commit-subject family (TASK ECONOMICS v2,
 *  board web-mstxk2vm-g446is) — the parsed payload of a `family-runaway`
 *  event fly.ts's post-flight sweep persisted, deduped by the read layer. */
export interface FamilyRunawayLike {
  readonly family: string;
  readonly spendUsd: number;
  readonly firings: number;
}

/**
 * Family-runaway chips (TASK ECONOMICS v2, board web-mstxk2vm-g446is): one
 * needs-you chip per flagged commit-subject family. Unlike the other rules
 * here, the detection itself already ran — fly.ts's post-flight sweep judged
 * each family via `familyEconomicsFromRows`/`isRunaway` and persisted a
 * `family-runaway` event per hit — so this rule only surfaces those verdicts
 * as evidence-carrying chips instead of re-deriving them from the (windowed)
 * flight log, which cannot see the full spend history the sweep aggregated.
 */
function familyRunaways(families: readonly FamilyRunawayLike[]): Anomaly[] {
  return families.map((f) => ({
    kind: 'family-runaway',
    evidence:
      `Recurring pattern "${f.family}" burned $${f.spendUsd.toFixed(0)} across ` +
      `${f.firings} firings under many task ids — no single id ever crossed the per-task threshold.`,
  }));
}

/** One shipped-file-vs-sibling-claim breach (FLEET INTENT CLAIMS enforcement,
 *  board web-mswo4x1u-kl2qsw) — the parsed payload of an `intent-collision`
 *  event fly.ts persists when a shipped commit lands on a file a sibling had
 *  declared as its `.autopilot-intent`, deduped by the read layer. */
export interface IntentCollisionLike {
  readonly file: string;
  readonly sibling: string;
  readonly intent: string;
}

/** Intent-collision chips: like {@link familyRunaways}, the detection itself
 *  already ran (fly.ts verified the shipped commit against sibling claims and
 *  persisted one event per breach) — this rule only surfaces those persisted
 *  verdicts as evidence-carrying needs-you chips. */
function intentCollisions(collisions: readonly IntentCollisionLike[]): Anomaly[] {
  if (collisions.length === 0) return [];
  // ONE chip per breach spammed a card with twelve identical badges (operator
  // report, 2026-08-21) — the same information fits ONE aggregated chip: the
  // count plus the LATEST breach's full evidence (events arrive newest-first
  // from the read layer — intentCollisionEvents' `ORDER BY id DESC` — so the
  // first entry is the latest).
  const latest = collisions[0] as IntentCollisionLike;
  const single = collisions.length === 1;
  return [
    {
      kind: 'intent-collision',
      evidence: single
        ? `A firing shipped ${latest.file} while sibling ${latest.sibling} had it claimed ` +
          `as its declared intent ("${latest.intent}").`
        : `${collisions.length} intent collisions on record — latest: a firing shipped ` +
          `${latest.file} while sibling ${latest.sibling} had it claimed as its declared ` +
          `intent ("${latest.intent}").`,
    },
  ];
}

/** One already-flagged recurring near-miss class (SAFETY-II NEAR-MISS
 *  RITUAL, board web-mt1qat5h-nxzgjs) — the parsed payload of a
 *  `near-miss-recurring` event fly.ts's post-flight sweep persisted, deduped
 *  by the read layer. */
export interface RecurringNearMissLike {
  readonly nearMissClass: NearMissClass;
  readonly streak: number;
}

/** Near-miss-recurring chips: like {@link familyRunaways}/{@link
 *  intentCollisions}, the detection itself already ran —
 *  `detectRecurringNearMissClass` (flight/near-miss.ts) judged this flight's
 *  debrief history and fly.ts persisted one event per verdict — this rule
 *  only surfaces those persisted verdicts as evidence-carrying chips. */
function nearMissRecurring(items: readonly RecurringNearMissLike[]): Anomaly[] {
  return items.map((r) => ({
    kind: 'near-miss-recurring',
    evidence:
      `${nearMissClassLabel(r.nearMissClass)} stayed nonzero across the last ${r.streak} ` +
      `consecutive flights — SAFETY-II near-miss ritual (web-mt1qat5h-nxzgjs).`,
  }));
}

/** One persisted PreToolUse guard denial (GUARD-DENIAL telemetry, board
 *  web-msr0ug27-hj1w27) — the parsed `{kind, target}` payload of a
 *  `guard-denial` event fly.ts persists per denial, newest first. */
export interface GuardDenialLike {
  readonly kind: 'containment' | 'read-hygiene';
  readonly target: string;
}

/** Guard-denial chip: like {@link intentCollisions}, the detection itself
 *  already ran (a PreToolUse hook denied the tool call and fly.ts persisted
 *  one event per denial) — this rule only surfaces those persisted denials
 *  as ONE aggregated evidence-carrying chip (the count plus the latest
 *  denial's kind/target), same anti-spam shape as `intentCollisions`. */
function guardDenials(denials: readonly GuardDenialLike[]): Anomaly[] {
  if (denials.length === 0) return [];
  // Newest first (guardDenialEvents' `ORDER BY id DESC`), so the first entry
  // is the latest denial.
  const latest = denials[0] as GuardDenialLike;
  const single = denials.length === 1;
  return [
    {
      kind: 'guard-denial',
      evidence: single
        ? `A firing hit a guard denial (${latest.kind}): ${latest.target}`
        : `${denials.length} guard denials on record — latest (${latest.kind}): ${latest.target}`,
    },
  ];
}

/** One persisted worktree-branch sync-back refusal (CONVERGENCE MADE LOUD,
 *  board web-mtb8i2mj-i0n1c7) — the parsed `{details}` payload of a
 *  `sync-back-refusal` event fly.ts persists every time `syncWorktreeBranch`
 *  comes back `ok: false`, either from the per-firing attempt or the
 *  flight-end retry. */
export interface SyncBackRefusalLike {
  readonly details: string;
}

/** Sync-back-refusal chip: like {@link guardDenials}, the detection itself
 *  already ran (fly.ts persisted one event per refused sync-back) — this
 *  rule only surfaces those persisted refusals as ONE aggregated
 *  evidence-carrying chip (the count plus the latest refusal's details). A
 *  refused sync-back used to be nothing but a `⚠` console line a flight could
 *  log 10+ times in a row without anything durable to show for it
 *  (docs/EVALUATION-2026-08-27-silent-gate.md §3.3) — this chip makes the
 *  FIRST occurrence visible on the fleet card instead of waiting on it to
 *  recur across 3 whole flights (the near-miss-recurring threshold). */
function syncBackRefusals(refusals: readonly SyncBackRefusalLike[]): Anomaly[] {
  if (refusals.length === 0) return [];
  // Newest first (syncBackRefusalEvents' `ORDER BY id DESC`), so the first
  // entry is the latest refusal.
  const latest = refusals[0] as SyncBackRefusalLike;
  const single = refusals.length === 1;
  return [
    {
      kind: 'sync-back-refusal',
      evidence: single
        ? `A firing hit a sync-back refusal: ${latest.details}`
        : `${refusals.length} sync-back refusals on record — latest: ${latest.details}`,
    },
  ];
}

/** One persisted out-of-band LANDING gate failure (LANDING GATE OFF WHILE
 *  FLYING, board web-mtbeu5ga-22baso) — the parsed `{details}` payload of a
 *  `land-gate-alarm` event `landing/execute.ts`'s `createOutOfBandLandGateCheck`
 *  persists when the detached-worktree gate it runs during a flight-running
 *  EXECUTE refusal comes back red. */
export interface LandGateAlarmLike {
  readonly details: string;
}

/** Land-gate-alarm chip: like {@link syncBackRefusals}, the detection itself
 *  already ran (the out-of-band gate check persisted one event per red
 *  result) — this rule only surfaces those persisted alarms as ONE
 *  aggregated evidence-carrying chip (the count plus the latest alarm's
 *  details), same anti-spam shape as `guardDenials`/`syncBackRefusals`. */
function landGateAlarms(alarms: readonly LandGateAlarmLike[]): Anomaly[] {
  if (alarms.length === 0) return [];
  // Newest first (landGateAlarmEvents' `ORDER BY id DESC`), so the first
  // entry is the latest alarm.
  const latest = alarms[0] as LandGateAlarmLike;
  const single = alarms.length === 1;
  return [
    {
      kind: 'land-gate-alarm',
      evidence: single
        ? `The out-of-band land gate went red while a flight was running: ${latest.details}`
        : `${alarms.length} out-of-band land gate alarms on record — latest: ${latest.details}`,
    },
  ];
}

/** One persisted CONVERGENCE GATE alarm (board web-mtbeu5d3-n09acx
 *  "CONVERGENCE FULL GATE") — the parsed `{check, details}` payload of a
 *  `convergence-red` event `flight/convergence-gate.ts`'s `gateConvergedBranch`
 *  persists via fly.ts's `recordConvergenceRed` whenever the merged branch
 *  fails a check that both sides passed alone. */
export interface ConvergenceRedLike {
  readonly check: string;
  readonly details: string;
}

/** Convergence-red chip: like {@link landGateAlarms}, the detection itself
 *  already ran (the flight-end FULL gate — or the per-firing typecheck-only
 *  gate — judged the merged branch and fly.ts persisted one event per red
 *  result) — this rule only surfaces those persisted alarms as ONE
 *  aggregated evidence-carrying chip (the count plus the latest alarm's
 *  check/details), same anti-spam shape as
 *  `guardDenials`/`syncBackRefusals`/`landGateAlarms`. */
function convergenceRedAlarms(alarms: readonly ConvergenceRedLike[]): Anomaly[] {
  if (alarms.length === 0) return [];
  // Newest first (convergenceRedEvents' `ORDER BY id DESC`), so the first
  // entry is the latest alarm.
  const latest = alarms[0] as ConvergenceRedLike;
  const single = alarms.length === 1;
  return [
    {
      kind: 'convergence-red',
      evidence: single
        ? `A convergence gate went red after a sync-back (${latest.check}): ${latest.details}`
        : `${alarms.length} convergence-red alarms on record — latest (${latest.check}): ${latest.details}`,
    },
  ];
}

/** One persisted pre-land e2e guard refusal (E2E LANDING DAEMON, epic 0010
 *  slice 4 / ADR 0008 "option A") — the parsed `{detail}` payload of an
 *  `e2e-land-block` event `landing/execute.ts`'s `createLandingExecuteApi`
 *  persists when the converged branch's own e2e is red and a landing is
 *  refused before the gate or any git command runs. */
export interface E2eLandBlockLike {
  readonly detail: string;
}

/** E2e-land-block chip: like {@link landGateAlarms}, the detection itself
 *  already ran (the pre-land guard read the converged branch's already-
 *  computed e2e result and `landing/execute.ts` persisted one event per
 *  refusal) — this rule only surfaces those persisted refusals as ONE
 *  aggregated evidence-carrying chip (the count plus the latest refusal's
 *  detail), same anti-spam shape as
 *  `guardDenials`/`syncBackRefusals`/`landGateAlarms`/`convergenceRedAlarms`. */
function e2eLandBlocks(blocks: readonly E2eLandBlockLike[]): Anomaly[] {
  if (blocks.length === 0) return [];
  // Newest first (e2eLandBlockEvents' `ORDER BY id DESC`), so the first
  // entry is the latest refusal.
  const latest = blocks[0] as E2eLandBlockLike;
  const single = blocks.length === 1;
  return [
    {
      kind: 'e2e-land-block',
      evidence: single
        ? `A landing was refused because the converged branch's e2e is red: ${latest.detail}`
        : `${blocks.length} e2e-land-block refusals on record — latest: ${latest.detail}`,
    },
  ];
}

/**
 * Evaluate every anomaly rule against a project's flight log (newest first,
 * the same order {@link FlightEntry}[] is kept in everywhere else in the read
 * model). `orient` — per-firing ORIENT lengths, newest first — feeds the
 * orient-drag rule; `families` — already-deduped runaway commit-subject
 * families from the store's `family-runaway` events — feeds the
 * family-runaway chips; `recurringNearMisses` — already-deduped verdicts from
 * the store's `near-miss-recurring` events — feeds the near-miss-recurring
 * chips; `guardDenialRows` — persisted `guard-denial` events, newest first —
 * feeds the guard-denial chip; `syncBackRefusalRows` — persisted
 * `sync-back-refusal` events, newest first — feeds the sync-back-refusal
 * chip; `landGateAlarmRows` — persisted `land-gate-alarm` events, newest
 * first — feeds the land-gate-alarm chip; `convergenceRedRows` — persisted
 * `convergence-red` events, newest first — feeds the convergence-red chip;
 * `e2eLandBlockRows` — persisted `e2e-land-block` events, newest first —
 * feeds the e2e-land-block chip.
 * All default empty so pre-existing
 * callers/fixtures that predate them keep compiling and simply never fire
 * those rules. Returns only the anomalies that actually fired — an empty
 * array is the healthy, common case.
 */
export function detectAnomalies(
  flightLog: readonly FlightEntry[],
  // Stryker disable next-line ArrayDeclaration: `orient`'s only use is
  // `orientDrag(orient)`, gated by `orient.length <= ORIENT_DRAG_WINDOW`
  // (5) — a mutated 1-element default is exactly as `<= 5` as the real `[]`
  // default, so no call that omits `orient` can ever observe the
  // difference; provably equivalent, not killable.
  orient: readonly OrientLengthLike[] = [],
  families: readonly FamilyRunawayLike[] = [],
  collisions: readonly IntentCollisionLike[] = [],
  recurringNearMisses: readonly RecurringNearMissLike[] = [],
  guardDenialRows: readonly GuardDenialLike[] = [],
  syncBackRefusalRows: readonly SyncBackRefusalLike[] = [],
  landGateAlarmRows: readonly LandGateAlarmLike[] = [],
  convergenceRedRows: readonly ConvergenceRedLike[] = [],
  e2eLandBlockRows: readonly E2eLandBlockLike[] = [],
): readonly Anomaly[] {
  return [
    costSpike(flightLog),
    deathCluster(flightLog),
    gateFailStreak(flightLog),
    orientDrag(orient),
    ...familyRunaways(families),
    ...intentCollisions(collisions),
    ...nearMissRecurring(recurringNearMisses),
    ...syncBackRefusals(syncBackRefusalRows),
    ...guardDenials(guardDenialRows),
    ...landGateAlarms(landGateAlarmRows),
    ...convergenceRedAlarms(convergenceRedRows),
    ...e2eLandBlocks(e2eLandBlockRows),
  ].filter((a): a is Anomaly => a !== null);
}
