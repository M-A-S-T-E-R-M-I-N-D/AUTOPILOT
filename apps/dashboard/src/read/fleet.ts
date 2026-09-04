// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Fleet read-model — pure transforms from per-project aggregates to the
 * view model the dashboard renders (MASTER-PLAN §5). No I/O here: the DB gather
 * lives in read/source.ts, so this stays deterministic and unit-testable.
 */

import type {
  ProjectStatus,
  DoraSnapshot,
  GateParallelSavings,
  WarmSessionSavings,
  OrientLength,
} from '@autopilot/store';
import {
  detectAnomalies,
  type Anomaly,
  type FamilyRunawayLike,
  type IntentCollisionLike,
  type RecurringNearMissLike,
  type GuardDenialLike,
  type SyncBackRefusalLike,
  type LandGateAlarmLike,
  type ConvergenceRedLike,
  type E2eLandBlockLike,
} from './anomalies.js';
import { firingCallsign } from '../shared/callsign.js';
import { countTurns } from '../shared/turns.js';
import { narratorLine } from '../shared/narrator.js';
import { finishedFlightSummaries as sharedFinishedFlightSummaries } from '../shared/flight-summary.js';
import type { FlightSummary } from '../shared/flight-summary.js';
import {
  liveFiringOf as sharedLiveFiring,
  liveFiringsOf as sharedLiveFirings,
  type LiveFiringResult,
} from '../shared/live-firing.js';

export { firingCallsign } from '../shared/callsign.js';
export { countTurns } from '../shared/turns.js';
export { narratorLine } from '../shared/narrator.js';
export type { FlightSummary } from '../shared/flight-summary.js';
export { liveSubagents } from '../shared/live-firing.js';
export type { LiveSubagent } from '../shared/live-firing.js';
export { activityFileNodes } from '../shared/file-nodes.js';
export type { FileNode } from '../shared/file-nodes.js';

export interface SeverityGauge {
  readonly critical: number;
  readonly high: number;
  readonly medium: number;
  readonly low: number;
}

export interface LanguageCount {
  readonly language: string;
  readonly files: number;
  readonly bytes: number;
}

export interface DirCount {
  readonly dir: string;
  readonly files: number;
}

/** The autopilot phase an action belongs to (the ORIENT→DO→GATE→COMMIT rail). */
export type ActivityPhase = 'orient' | 'do' | 'gate' | 'commit' | 'other';

export const ACTIVITY_PHASES: readonly ActivityPhase[] = ['orient', 'do', 'gate', 'commit'];

/** Classify one tool use into its phase (heuristic, pure). */
export function activityPhase(tool: string, target: string, kind: string): ActivityPhase {
  const t = target.toLowerCase();
  if (kind === 'command') {
    if (/\bgit\s+(commit|add|tag|push)\b/.test(t)) return 'commit';
    if (
      // `go test` already matches via the bare `test` alternative above (a
      // separate `go\s+test` alternative here would be unreachable dead code).
      /\b(test|tsc|typecheck|build|lint|vitest|jest|pytest|cargo|mvn|gradle)\b/.test(t)
    ) {
      return 'gate';
    }
    if (/\b(ls|cat|find|head|tail|pwd|tree)\b|git\s+(log|status|diff|show)/.test(t))
      return 'orient';
    return 'do';
  }
  if (kind === 'search') return 'orient';
  if (kind === 'file') {
    if (tool === 'Read' || tool === 'Glob') return 'orient';
    if (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') return 'do';
  }
  return 'other';
}

/** One agent action (tool use) in the live activity timeline (newest first). */
export interface ActivityEntry {
  readonly tool: string;
  readonly target: string;
  readonly kind: string;
  readonly phase: ActivityPhase;
  readonly at: number;
  /** The firing this action ran in, or null for events recorded before firing_id existed. */
  readonly firingId: string | null;
  /** Bounded excerpt of the assistant's stated reasoning (the WHY) before this
   *  tool call, or null/absent when none was captured — DECISION TRANSPARENCY.
   *  Optional so pre-existing fixtures/read paths that predate this field still
   *  type-check; a real read always sets it explicitly (string or null). */
  readonly reasoning?: string | null;
  /** The model that produced this step, or null/absent when uncaptured —
   *  MICRO-ACTION TELEMETRY: an honest per-turn cost approximation. Optional
   *  for the same pre-existing-fixture reason as `reasoning`. */
  readonly model?: string | null;
  readonly tokensIn?: number | null;
  readonly tokensOut?: number | null;
}

/** One task on the project's board (focus first, then operator order, then newest). */
export interface TaskEntry {
  readonly id: string;
  readonly title: string;
  /** Free-form body beyond the title — e.g. an INBOX note's full content,
   *  otherwise unrecoverable once the source file archives to the gitignored
   *  `INBOX/.triaged/`. Null for a task with nothing beyond its title. */
  readonly body: string | null;
  readonly status: string;
  readonly severity: string | null;
  readonly dimension: string | null;
  /** Operator-locked focus (WIP-limit-1): flights work ONLY these until done. */
  readonly focus: boolean;
  /** Operator ordering (lower = sooner); null = unordered. */
  readonly priority: number | null;
  /** 'dashboard' = human-created; 'self' = autopilot-PROPOSED (awaiting approval). */
  readonly source: string;
  readonly at: number;
  /** Lifetime cumulative cost across every firing that claimed this task
   *  (`metrics.item`) — see `taskEconomics` (`@autopilot/store`). 0 for a
   *  task never worked. */
  readonly cumulativeCostUsd: number;
  /** Lifetime count of firings that claimed this task. */
  readonly firingCount: number;
  /** TASK ECONOMICS's operator-review flag: this task has burned real
   *  firings/dollars without ever closing (cost/firing threshold cleared with
   *  no firing ever self-reporting `completion: 'complete'`). */
  readonly isRunaway: boolean;
}

/** One gate command's outcome as recorded on the firing (GATE TRANSPARENCY). */
export interface GateCheckSummary {
  readonly label: string;
  readonly pass: boolean;
}

/** One firing in the flight log (newest first) + its metrics for the graphs. */
export interface FlightEntry {
  readonly id: string;
  readonly item: string | null;
  readonly kind: string | null;
  readonly sha: string | null;
  readonly shipped: boolean;
  readonly gateResult: string | null;
  readonly cost: number;
  /** Cost semantics v3 (epic 0013) — the same firing's cost, apportioned by
   *  real subscription share instead of API list-price. `null` when
   *  unconfigured (`AUTOPILOT_SUBSCRIPTION_PRICE_USD`/`AUTOPILOT_USAGE_POOL_DIRS`
   *  unset) or the firing predates this being tracked — the UI falls back to
   *  {@link cost} alone, never a fabricated number. Optional for the same
   *  pre-existing-fixture reason as {@link cacheReadTokens}/{@link model}. */
  readonly realCostUsd?: number | null;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly turns: number;
  /** The raw HEAD commit subject line — the real commit title, independent of `item`. */
  readonly commitSubject: string | null;
  /** The agent's self-reported `"slice"` (task only advanced, stays open) vs
   *  `"complete"` (task finished) — null when it named no task, or predates
   *  this being tracked. A 'slice' row's headline should lead with its own
   *  commit subject, not the shared task title every sibling slice repeats. */
  readonly completion: string | null;
  /** The first failing gate check's label for a REVERTED firing, or null when
   *  every check passed (or the firing predates per-check telemetry) — so a
   *  revert explains itself instead of forcing a log dig. */
  readonly failedCheck: string | null;
  /** WHY a firing that never committed died, when the record knows: 'timeout'
   *  (the CLI driver's own wall-clock cap killed it — THIRD CAP surfacing,
   *  board web-mt1w1ime-pohh9d), 'turn-cap' (hit the per-firing turn ceiling
   *  mid-work — observed live: firing 47 died at the cap with $ spent and
   *  nothing committed), or 'error' (the CLI exited in error / the envelope
   *  was unreadable). Null for shipped/reverted rows — an honest flight log
   *  explains EVERY empty row, not just gate reverts. */
  readonly died: 'turn-cap' | 'timeout' | 'error' | null;
  /** NOOP→VERDICT (lever 6, board web-mt1kv2au-8suw6u): for a TRUE no-commit
   *  ending (`gateResult === 'no-commit'`), whether the firing still named a
   *  verdict on the work it considered via PROPOSALS (`'verdict-carrying'`)
   *  or stayed silent (`'silent'`) — see `classifyNoop`. Null for any other
   *  ending (shipped/reverted/checkpointed/died-mid-unit), the same
   *  "not applicable" shape as {@link died}. Optional for the same
   *  pre-existing-fixture reason as the cache-token/duration fields above. */
  readonly noopClass?: 'verdict-carrying' | 'silent' | null;
  readonly at: number;
  /** Cache-read/-write tokens processed by this firing — optional for the same
   *  pre-existing-fixture reason as {@link ActivityEntry.reasoning}/`model`
   *  (the DB column is `NOT NULL DEFAULT 0`; only test fixtures predate it). */
  readonly cacheReadTokens?: number | null;
  readonly cacheWriteTokens?: number | null;
  /** Wall-clock duration of this firing in ms — the FLIGHT TIMELINE strip's
   *  segment widths. Optional/nullable for the same pre-existing-fixture
   *  reason as the cache-token fields above; a firing with none renders a
   *  floor-width segment rather than vanishing from the strip. */
  readonly durationMs?: number | null;
  /** True when the gate initially failed a check and mechanical remediation
   *  (`RemediatingGate` — `packages/engine/src/adapters/remediating-gate.ts`)
   *  fixed it so this firing shipped clean instead of reverting — see
   *  {@link wasAutoformatRescued}. Optional for the same pre-existing-fixture
   *  reason as the cache-token/duration fields above. */
  readonly autoformatRescued?: boolean;
  /** PreToolUse guard denials (containment / read-hygiene) this firing's
   *  final model attempt hit — 0/absent for a clean firing or one that
   *  predates this field. See {@link parseGuardDenials} (read/source.ts). */
  readonly guardDenials?: number;
  /** The model that ran this firing (e.g. `"claude-sonnet-5"`) — optional for
   *  the same pre-existing-fixture reason as the cache-token/duration fields
   *  above; null when the firing predates this being tracked. */
  readonly model?: string | null;
}

/**
 * The first failing gate check's label, or null when none failed. Answers the
 * operator's first question on a REVERTED row: WHICH command actually killed it.
 */
export function firstFailedGateCheck(checks: readonly GateCheckSummary[]): string | null {
  const failed = checks.find((c) => !c.pass);
  return failed ? failed.label : null;
}

/**
 * True when SOME check failed and the SAME label later passed in this firing's
 * check history. `RemediatingGate.run()` re-runs the whole gate from scratch
 * after a fixer commit, so a rescued label appears twice in `gateChecks` —
 * once failed (the first attempt), once passed (the re-run) — while a check
 * that never recovers only ever appears as a failure. Callers should combine
 * this with `gateResult === 'passed'`: a still-reverted firing can also show a
 * fail→pass pair (formatting got fixed, something else stayed broken), which
 * is not a rescue — the firing didn't ship.
 */
export function wasAutoformatRescued(checks: readonly GateCheckSummary[]): boolean {
  const failedLabels = new Set(checks.filter((c) => !c.pass).map((c) => c.label));
  return checks.some((c) => c.pass && failedLabels.has(c.label));
}

/**
 * The human summary line for each finished (shipped) flight — what shipped, its
 * cost, and the task it closed. A flight's `item` is the short id of the board
 * task it worked (see METRICS line in the flight prompt); resolving it against
 * `tasks` turns an opaque id into an honest headline instead of guessing.
 * Delegates to {@link sharedFinishedFlightSummaries} (`shared/flight-summary.ts`)
 * so the server and the hand-authored client bundle resolve headlines
 * identically — see that module's doc comment for the shared logic.
 */
export function finishedFlightSummaries(p: ProjectAggregate): readonly FlightSummary[] {
  return sharedFinishedFlightSummaries(p);
}

/** The in-progress firing, live — what the worker is doing RIGHT NOW. See
 *  {@link LiveFiringResult} (`shared/live-firing.ts`) for the field docs. */
export type LiveFiring = LiveFiringResult;

/**
 * The currently-running firing, or null when nothing is live. Delegates to
 * {@link sharedLiveFiring} (`shared/live-firing.ts`) so the server and the
 * hand-authored client bundle (`web/shell.ts`) resolve it identically — see
 * that module's doc comment for the shared logic and why
 * `firingCallsign`/`narratorLine`/`countTurns` are passed in rather than
 * imported inside it.
 */
export function liveFiring(
  p: Pick<ProjectAggregate, 'status' | 'activity' | 'flightLog' | 'tasks'>,
): LiveFiring | null {
  return sharedLiveFiring(p, firingCallsign, narratorLine, countTurns);
}

/**
 * Every still-live firing, one per concurrent worktree lane — see
 * {@link sharedLiveFirings} (`shared/live-firing.ts`) for why `liveFiring`
 * alone under-reports a project running several lanes at once (board
 * web-mtbp0t86-rnimyi).
 */
export function liveFirings(
  p: Pick<ProjectAggregate, 'status' | 'activity' | 'flightLog' | 'tasks'>,
): readonly LiveFiring[] {
  return sharedLiveFirings(p, firingCallsign, narratorLine, countTurns);
}

/** Everything gathered for one project, already read out of the store. */
export interface ProjectAggregate {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  /** Absolute filesystem path this project was onboarded from — the FLY-BAR
   *  folder picker's "registered projects" datalist option (board
   *  web-msrhr2d9-xxwa3a). Safe to expose to the dashboard's own client: this
   *  is a single-operator localhost tool, and the folder path is already the
   *  thing the operator typed by hand to onboard it. Optional so pre-existing
   *  fixtures/read paths that predate this field still type-check; a real
   *  read always sets it explicitly. */
  readonly rootPath?: string;
  readonly status: ProjectStatus;
  readonly createdAt: number;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly languages: readonly LanguageCount[];
  readonly topDirs: readonly DirCount[];
  readonly hotFiles: readonly string[];
  readonly gate: string | null;
  readonly backedUp: boolean;
  /** This project's live SOUL prompt text; null for a project that predates
   *  the SOUL evolution loop or was onboarded without one. Read-only source
   *  for the SOUL editor entry (board web-mswqemor-ab3jsu) — the operator's
   *  way to view the current text and propose a hand-written edit, the same
   *  ratify/dismiss flow an automated post-flight proposal already goes
   *  through. */
  readonly soul: string | null;
  /** False until the operator ratifies this project's (possibly LLM-generated
   *  starter) SOUL text — SOUL evolution loop, B5 closure — surfaced on the
   *  fleet card so an unreviewed prompt is never silently flying. */
  readonly soulReviewed: boolean;
  /** A pending SOUL amendment a post-flight step proposed (schema v14, B5
   *  closure); null when nothing is pending. Never applied automatically —
   *  the operator ratifies or dismisses it from the fleet card. */
  readonly soulProposed: string | null;
  /** The SOUL text a ratify last overwrote (schema v17, un-ratify
   *  affordance); null when there is nothing to undo. Drives the fleet
   *  card's "↺ un-ratify" chip — the fix for board web-mswqemor-ab3jsu, an
   *  operator ratifying by mistake with no way back short of a manual SQL
   *  edit. */
  readonly soulPrevious: string | null;
  readonly firings: number;
  readonly shipped: number;
  readonly cost: number;
  /** Cost semantics v3 (epic 0013) — this project's summed `realCostUsd` across
   *  its firings (`packages/store/src/read.ts`'s `FiringStats.realCost`); `null`
   *  when not one firing carries the figure, optional so fixtures predating it
   *  still type-check. */
  readonly realCost?: number | null;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  /** Summed turns across every recorded firing (for the fleet's avg-turns tile). */
  readonly turns: number;
  readonly gauge: SeverityGauge;
  readonly lastActivityAt: number | null;
  readonly flightLog: readonly FlightEntry[];
  /** Full-history per-day firing tallies (store firingDayCounts) — the heatmap's
   *  data plane. Optional so fixtures predating it still type-check. */
  readonly dayCounts?: readonly {
    readonly day: string;
    readonly ships: number;
    readonly deaths: number;
    readonly other: number;
  }[];
  /** Full-history per-day operator approve/reject verdicts on agent-proposed
   *  work (store evaluationLabelDayCounts — human-vs-agent evaluation, backlog
   *  web-msniol15-foo6oi item J checkbox 5). Served so an evolution-over-time
   *  panel can render approval-rate trend; no panel reads it yet. Optional so
   *  fixtures predating it still type-check; a real read always sets it. */
  readonly evaluationLabelDayCounts?: readonly {
    readonly day: string;
    readonly approved: number;
    readonly rejected: number;
  }[];
  /** True when older firings exist beyond `flightLog`'s window — drives the
   *  flight log's "Load more" (a real server round-trip via `/api/firings`,
   *  not just revealing rows already in memory). Optional so pre-existing
   *  fixtures/read paths that predate this field still type-check; a real
   *  read always sets it explicitly. */
  readonly flightLogHasMore?: boolean;
  readonly activity: readonly ActivityEntry[];
  readonly tasks: readonly TaskEntry[];
  /** DORA-for-agents snapshot (backlog web-msnsxudt-sfw78a), computed store-side
   *  (packages/store/src/dora.ts) from this project's own metrics/tasks rows —
   *  the per-project process-health tiles render this directly. */
  readonly dora: DoraSnapshot;
  /** Real wall-clock savings from running the gate's typecheck/lint/format checks
   *  concurrently (backlog web-msnt26tn-jvyihy "PARALLEL GATE + test-impact"),
   *  computed store-side (packages/store/src/read.ts) from this project's own
   *  gate-check telemetry — the per-project tiles render this directly. */
  readonly gateParallel: GateParallelSavings;
  /** Resumed-vs-cold firing cost anatomy (epic 0009 WARM SESSIONS), computed
   *  store-side (packages/store/src/warm-sessions.ts) from `metrics.resumed` —
   *  the per-project tiles render this directly. Optional so pre-existing
   *  fixtures that predate this field still type-check; a real read always
   *  sets it explicitly. */
  readonly warmSessions?: WarmSessionSavings;
  /** Per-firing ORIENT lengths (actions before first edit, newest first) from
   *  the store's `orientLengths` — feeds the orient-drag anomaly rule.
   *  Optional so pre-existing fixtures that predate this field still
   *  type-check; a real read always sets it explicitly. */
  readonly orientLengths?: readonly OrientLength[];
  /** Already-flagged runaway commit-subject families (TASK ECONOMICS v2,
   *  board web-mstxk2vm-g446is) from the store's `family-runaway` events,
   *  deduped by family keeping the newest verdict — feeds the family-runaway
   *  needs-you chips. Optional for the same pre-existing-fixture reason as
   *  `orientLengths`; a real read always sets it explicitly. */
  readonly familyRunaways?: readonly FamilyRunawayLike[];
  /** Persisted FLEET INTENT CLAIMS breaches (`intent-collision` events,
   *  board web-mswo4x1u-kl2qsw), deduped by file+sibling keeping the newest
   *  — feeds the intent-collision needs-you chips. Optional for the same
   *  pre-existing-fixture reason as `familyRunaways`. */
  readonly intentCollisions?: readonly IntentCollisionLike[];
  /** Persisted SAFETY-II near-miss-recurring verdicts (`near-miss-recurring`
   *  events, board web-mt1qat5h-nxzgjs), deduped by class keeping the newest
   *  — feeds the near-miss-recurring needs-you chips. Optional for the same
   *  pre-existing-fixture reason as `familyRunaways`/`intentCollisions`. */
  readonly nearMissRecurring?: readonly RecurringNearMissLike[];
  /** Persisted PreToolUse guard denials (`guard-denial` events, board
   *  web-msr0ug27-hj1w27), newest first — feeds the guard-denial needs-you
   *  chip. Optional for the same pre-existing-fixture reason as
   *  `familyRunaways`/`intentCollisions`/`nearMissRecurring`. */
  readonly guardDenialEvents?: readonly GuardDenialLike[];
  /** Persisted worktree-branch sync-back refusals (`sync-back-refusal`
   *  events, board web-mtb8i2mj-i0n1c7), newest first — feeds the
   *  sync-back-refusal needs-you chip. Optional for the same
   *  pre-existing-fixture reason as
   *  `familyRunaways`/`intentCollisions`/`nearMissRecurring`/
   *  `guardDenialEvents`. */
  readonly syncBackRefusalEvents?: readonly SyncBackRefusalLike[];
  /** Persisted out-of-band LANDING gate failures (`land-gate-alarm` events,
   *  board web-mtbeu5ga-22baso), newest first — feeds the land-gate-alarm
   *  needs-you chip. Optional for the same pre-existing-fixture reason as
   *  `familyRunaways`/`intentCollisions`/`nearMissRecurring`/
   *  `guardDenialEvents`/`syncBackRefusalEvents`. */
  readonly landGateAlarmEvents?: readonly LandGateAlarmLike[];
  /** Persisted CONVERGENCE GATE alarms (`convergence-red` events, board
   *  web-mtbeu5d3-n09acx "CONVERGENCE FULL GATE"), newest first — feeds the
   *  convergence-red needs-you chip. Optional for the same
   *  pre-existing-fixture reason as
   *  `familyRunaways`/`intentCollisions`/`nearMissRecurring`/
   *  `guardDenialEvents`/`syncBackRefusalEvents`/`landGateAlarmEvents`. */
  readonly convergenceRedEvents?: readonly ConvergenceRedLike[];
  /** Persisted pre-land e2e guard refusals (`e2e-land-block` events, epic
   *  0010 slice 4 / ADR 0008 "option A"), newest first — feeds the
   *  e2e-land-block needs-you chip. Optional for the same
   *  pre-existing-fixture reason as
   *  `familyRunaways`/`intentCollisions`/`nearMissRecurring`/
   *  `guardDenialEvents`/`syncBackRefusalEvents`/`landGateAlarmEvents`/
   *  `convergenceRedEvents`. */
  readonly e2eLandBlockEvents?: readonly E2eLandBlockLike[];
  /** Persisted flight-landed events (`landed` events, board
   *  web-msnsndlk-exw3t9) from `landing/execute.ts`'s green gate-then-merge
   *  writes, newest first — feeds the Notifications channel's flight-landed
   *  browser notification. Optional for the same pre-existing-fixture reason
   *  as `familyRunaways`/`intentCollisions`/`nearMissRecurring`/
   *  `guardDenialEvents`. */
  readonly landedEvents?: readonly LandedEventLike[];
}

/** One persisted flight-landed event — the parsed `{details}` payload of a
 *  `landed` event `landing/execute.ts` persists per green gate-then-merge. */
export interface LandedEventLike {
  readonly details: string;
  readonly at: number;
}

/** The last-N firings window for the "recent form" gauge. */
export const RECENT_FORM_WINDOW = 5;

/** The per-project card the UI renders (derived fields added). */
export interface ProjectCard extends ProjectAggregate {
  readonly primaryLanguage: string;
  readonly shipRate: number | null; // shipped / firings, null when no firings yet
  /**
   * Ship rate over the last {@link RECENT_FORM_WINDOW} firings — the honest
   * answer to "how is it doing NOW?". Lifetime shipRate keeps the full record
   * (a real failure is never erased); recent form shows that a fixed cause is
   * actually fixed.
   */
  readonly recentShipRate: number | null;
  readonly openFindings: number; // gauge sum
  /** The in-progress firing, live — null when nothing is currently flying.
   *  Reports only the single newest lane; see {@link liveFirings} for every
   *  concurrently-running worktree lane. */
  readonly liveFiring: LiveFiring | null;
  /** Every currently-running firing, one per concurrent worktree lane — see
   *  {@link liveFirings} (board web-mtbp0t86-rnimyi). Empty when nothing is
   *  flying; a single-lane project's array always mirrors `liveFiring`. */
  readonly liveFirings: readonly LiveFiring[];
  /** cost-spike / death-cluster / gate-fail-streak rules over `flightLog` — see
   *  {@link detectAnomalies}. Empty (the common case) when nothing is wrong. */
  readonly anomalies: readonly Anomaly[];
}

export interface FleetTotals {
  readonly projects: number;
  readonly flying: number;
  readonly needsYou: number;
  readonly firings: number;
  readonly shipped: number;
  readonly openFindings: number;
  readonly cost: number;
  /** Cost semantics v3 (epic 0013) — sum of every project's {@link ProjectAggregate.realCost},
   *  ignoring projects that report `null`; `null` (never `0`) when NOT ONE project
   *  fleet-wide carries a real-cost figure, so an unconfigured fleet reads as "no
   *  data" rather than a fabricated zero spend. */
  readonly realCost: number | null;
  /** cost / shipped — null when nothing has shipped yet (never divide by zero into a lie). */
  readonly costPerShipped: number | null;
  /** shipped / firings across the whole fleet — null with no firings yet. */
  readonly shipRate: number | null;
  /** Consecutive shipped firings counting back from the fleet's most recent, across
   *  every project interleaved by time — see {@link fleetStreak}. */
  readonly currentStreak: number;
  /** turns / firings across the whole fleet — null with no firings yet. */
  readonly avgTurns: number | null;
  /** Share of processed context tokens that were served from cache (cost-saving
   *  signal): cacheRead / (tokensIn + cacheRead + cacheWrite) — null when nothing
   *  has been processed yet. */
  readonly cacheReadShare: number | null;
}

/**
 * The fleet's current ship streak: walk every project's flight log (each
 * already newest-first) merged in time order, newest first, and count
 * consecutive SHIPPED firings until the first non-ship breaks it. Bounded by
 * each project's flight-log window (`recentFirings`, capped) like the
 * per-project {@link RECENT_FORM_WINDOW} — a streak longer than that window
 * undercounts rather than reads stale data, the same honest-floor tradeoff
 * used elsewhere in this file.
 */
export function fleetStreak(projects: readonly ProjectAggregate[]): number {
  // flatMap already returns a fresh array, so sorting it in place needs no
  // defensive .slice() copy first.
  const merged = projects.flatMap((p) => p.flightLog).sort((a, b) => b.at - a.at);
  let streak = 0;
  for (const f of merged) {
    if (!f.shipped) break;
    streak++;
  }
  return streak;
}

/** How many fleet-wide firings the stat-tile sparks show — the same
 *  honest-floor tradeoff as {@link RECENT_FORM_WINDOW}/{@link fleetStreak}. */
export const FLEET_SPARK_WINDOW = 24;

/**
 * Every project's flight log merged by time, newest first then capped to
 * {@link FLEET_SPARK_WINDOW} and reversed to oldest→newest — the fleet-wide
 * analog of the per-project `chrono` list `web/shell.ts` builds for
 * `costSparkline` (`c.flightLog.slice().reverse()`), feeding the M3 stat-tile
 * sparks (cost, ship form, turns, cache share) from one shared, real series
 * instead of five bespoke reads.
 */
export function fleetChronoLog(
  projects: readonly ProjectAggregate[],
  cap: number = FLEET_SPARK_WINDOW,
): readonly FlightEntry[] {
  // flatMap already returns a fresh array, so sorting it in place needs no
  // defensive .slice() copy first (see fleetStreak).
  return projects
    .flatMap((p) => p.flightLog)
    .sort((a, b) => b.at - a.at)
    .slice(0, cap)
    .reverse();
}

export interface FleetView {
  readonly generatedAt: number;
  readonly totals: FleetTotals;
  readonly projects: readonly ProjectCard[];
  /** See {@link fleetChronoLog} — feeds the stat-tile sparks. */
  readonly recentFirings: readonly FlightEntry[];
  readonly empty: boolean;
  /** Whether an `OTEL_EXPORTER_OTLP_*` endpoint is configured for this dashboard
   *  process (see `flight/otlp.ts`) — a fixed fact about the process's own env,
   *  not a per-project DB read, so `buildFleetView` never sets it; the server
   *  wiring (`server/main.ts`) merges it in. Absent (not `false`) wherever a
   *  `FleetView` is built without that wiring, e.g. tests. */
  readonly otlpConfigured?: boolean;
  /** The fleet-wide pending wisdom amendment awaiting operator ratify/dismiss
   *  (schema v20, board web-msnt26xe-pc4pzp) — `flight/fleet-wisdom-mining.ts`'s
   *  `mineFleetWisdom` writes it, `fly.ts` proposes it post-flight. Same
   *  merged-in-by-the-caller shape as `otlpConfigured`: `buildFleetView` is
   *  pure w.r.t. per-project `ProjectAggregate`s and never sets this — `readFleet`
   *  (read/source.ts) queries the `fleet` table directly (it already has store
   *  access at that layer) and merges the result in. Absent wherever a
   *  `FleetView` is built without that merge, e.g. tests; null when read but
   *  nothing is pending. */
  readonly wisdomProposed?: string | null;
  /** Learning-kind name the pending proposal carries (epic 0014 slice 4a),
   *  derived from its registry marker at the same merge point as
   *  `wisdomProposed`. Null when nothing is pending or the proposal carries
   *  no registered marker (e.g. hand-authored text). */
  readonly wisdomKind?: string | null;
}

function gaugeSum(g: SeverityGauge): number {
  return g.critical + g.high + g.medium + g.low;
}

/** Derive a project card (primary language, ship rates, open-finding count). */
export function toCard(p: ProjectAggregate): ProjectCard {
  const openFindings = gaugeSum(p.gauge);
  const shipRate = p.firings > 0 ? p.shipped / p.firings : null;
  const recent = p.flightLog.slice(0, RECENT_FORM_WINDOW); // newest first
  const recentShipRate =
    recent.length > 0 ? recent.filter((f) => f.shipped).length / recent.length : null;
  const primaryLanguage = p.languages[0]?.language ?? 'unknown';
  return {
    ...p,
    primaryLanguage,
    shipRate,
    recentShipRate,
    openFindings,
    liveFiring: liveFiring(p),
    liveFirings: liveFirings(p),
    anomalies: detectAnomalies(
      p.flightLog,
      p.orientLengths ?? [],
      p.familyRunaways ?? [],
      p.intentCollisions ?? [],
      p.nearMissRecurring ?? [],
      p.guardDenialEvents ?? [],
      p.syncBackRefusalEvents ?? [],
      p.landGateAlarmEvents ?? [],
      p.convergenceRedEvents ?? [],
      p.e2eLandBlockEvents ?? [],
    ),
  };
}

/** Roll per-project aggregates up into the whole-fleet view model. */
export function buildFleetView(now: number, projects: readonly ProjectAggregate[]): FleetView {
  const cards = projects.map(toCard);
  const firings = cards.reduce((sum, c) => sum + c.firings, 0);
  const shipped = cards.reduce((sum, c) => sum + c.shipped, 0);
  const cost = cards.reduce((sum, c) => sum + c.cost, 0);
  const realCostValues = cards
    .map((c) => c.realCost)
    .filter((v): v is number => typeof v === 'number');
  const realCost = realCostValues.length > 0 ? realCostValues.reduce((sum, v) => sum + v, 0) : null;
  const turns = cards.reduce((sum, c) => sum + c.turns, 0);
  const cacheReadTokens = cards.reduce((sum, c) => sum + c.cacheReadTokens, 0);
  const cacheWriteTokens = cards.reduce((sum, c) => sum + c.cacheWriteTokens, 0);
  const tokensIn = cards.reduce((sum, c) => sum + c.tokensIn, 0);
  const processedTokens = tokensIn + cacheReadTokens + cacheWriteTokens;
  const totals: FleetTotals = {
    projects: cards.length,
    flying: cards.filter((c) => c.status === 'flying').length,
    needsYou: cards.filter((c) => c.status === 'needs_you').length,
    firings,
    shipped,
    openFindings: cards.reduce((sum, c) => sum + c.openFindings, 0),
    cost,
    realCost,
    costPerShipped: shipped > 0 ? cost / shipped : null,
    shipRate: firings > 0 ? shipped / firings : null,
    currentStreak: fleetStreak(cards),
    avgTurns: firings > 0 ? turns / firings : null,
    cacheReadShare: processedTokens > 0 ? cacheReadTokens / processedTokens : null,
  };
  return {
    generatedAt: now,
    totals,
    projects: cards,
    recentFirings: fleetChronoLog(cards),
    empty: cards.length === 0,
  };
}
