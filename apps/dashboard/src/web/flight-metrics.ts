// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure per-flight/per-task classification helpers — client-only (no server
 * counterpart, unlike `shared/*.ts`), so it lives in `web/` rather than
 * `shared/` (epic 0002 "shell decomposition", slice 2: feature-module split
 * of `shell.ts`), following the same pattern `office-map.ts`/`format.ts`/
 * `heatmap.ts` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** A flight-log entry's fields {@link flightVerdictOf} reads to classify how it ended. */
export interface FlightVerdictEntry {
  readonly shipped: boolean;
  readonly gateResult: string | null;
  readonly died: string | null;
  /** NOOP→VERDICT (lever 6): see `FlightEntry.noopClass` (read/fleet.ts).
   *  Optional/absent for the same pre-existing-fixture reason as the other
   *  recently-added `FlightEntry` fields this interface mirrors. */
  readonly noopClass?: 'verdict-carrying' | 'silent' | null;
}

/** How a firing ended — the single source of truth every verdict dot/chip/tooltip reads. */
export function flightVerdictOf(f: FlightVerdictEntry): string {
  if (f.shipped) return 'shipped';
  if (f.gateResult === 'reverted') return 'reverted';
  if (f.gateResult === 'unverifiable') return 'unverified';
  // A checkpointed firing died mid-unit but ITS WIP WAS PACKED into a real
  // commit (ZERO-WORK-LOSS) — distinct from turn-capped/errored, which mean
  // nothing landed at all. Collapsing it into 'turn-capped' is what produced
  // the false "nothing committed" headline below (observed live, firing 163).
  if (f.gateResult === 'checkpointed') return 'checkpointed';
  if (f.died === 'turn-cap') return 'turn-capped';
  if (f.died === 'timeout') return 'timed-out';
  if (f.died === 'error') return 'errored';
  // A TRUE no-commit firing that still named a verdict on the work it
  // considered (PROPOSALS) carries real information — distinct from a
  // silent no-commit, which stays the bare 'no commit' fallback below
  // (NOOP→VERDICT, lever 6, board web-mt1kv2au-8suw6u).
  if (f.noopClass === 'verdict-carrying') return 'verdict-carrying';
  return 'no commit';
}

/** A task record {@link taskMap} indexes by id. */
export interface TaskLike {
  readonly id: string;
}

/** Indexes tasks by id — shared by costSparkline + the flight-log/trace
 *  renderers so a flight's headline means the same thing everywhere it's
 *  shown (finishedFlightSummaries builds its own taskById internally — see
 *  shared/flight-summary.ts). */
export function taskMap<T extends TaskLike>(
  tasks: readonly T[] | null | undefined,
): Record<string, T> {
  const byId: Record<string, T> = {};
  for (const task of tasks || []) byId[task.id] = task;
  return byId;
}

/** A flight-log entry's fields {@link taskBurnOf} sums across every firing that claimed a task. */
export interface TaskBurnLogEntry {
  readonly item: string | null;
  readonly cost: number | null;
  readonly durationMs: number | null;
}

/** A task's accumulated burn: how many slices worked it, how much it cost, and how long it took. */
export interface TaskBurn {
  readonly slices: number;
  readonly cost: number;
  readonly wallMs: number;
}

/** A task card's accumulated cost across every firing that claimed it
 *  (FlightEntry.item === task id) — epics stop being bottomless. Counts
 *  every claiming firing, not just 'slice'-tagged ones, so a task closed in
 *  one firing still shows what it cost to get there. */
export function taskBurnOf(
  taskId: string,
  log: readonly TaskBurnLogEntry[] | null | undefined,
): TaskBurn {
  let slices = 0;
  let cost = 0;
  let wallMs = 0;
  for (const entry of log || []) {
    if (entry.item !== taskId) continue;
    slices++;
    cost += entry.cost || 0;
    wallMs += entry.durationMs || 0;
  }
  return { slices, cost, wallMs };
}

/** A flight-log entry's fields {@link taskBudgetSignalOf} reads to detect
 *  under-budgeted work on a task. */
export interface TaskBudgetLogEntry {
  readonly item: string | null;
  readonly died: string | null;
}

/** A task's turn-cap death history — ADAPTIVE TASK BUDGET's risk signal
 *  (deaths cluster on under-budgeted epics): how many prior firings on this
 *  task hit the global turn ceiling (`flight/budget.ts`'s `FLY_MAX_TURNS`)
 *  before committing anything. Distinct from {@link taskBurnOf}'s
 *  slices/cost/wallMs tally — a task can burn plenty without ever
 *  turn-capping, and a task that turn-capped once but later shipped on a
 *  smaller slice still carries the scar (this counts lifetime, not a
 *  trailing streak like `flight/triage-factors.ts`'s TaskEconomics — a
 *  budget lesson learned once still applies to the next firing regardless of
 *  what shipped since). */
export interface TaskBudgetSignal {
  readonly turnCapped: number;
}

/** Counts, across every firing that claimed `taskId`, how many died hitting
 *  the turn cap (`died === 'turn-cap'`) — the raw signal {@link
 *  suggestedTurnBudget} (`task-queue.ts`) turns into a suggested per-firing
 *  turn budget for the board chip. */
export function taskBudgetSignalOf(
  taskId: string,
  log: readonly TaskBudgetLogEntry[] | null | undefined,
): TaskBudgetSignal {
  let turnCapped = 0;
  for (const entry of log || []) {
    if (entry.item !== taskId) continue;
    if (entry.died === 'turn-cap') turnCapped++;
  }
  return { turnCapped };
}

/** A task's fields {@link taskDimensionBudgetSignalOf} needs to find its
 *  "similar work" peers — other tasks tagged with the same dimension. */
export interface TaskDimensionLike extends TaskLike {
  readonly dimension: string | null;
}

/** Turn-cap risk carried by OTHER tasks sharing `task`'s dimension —
 *  ADAPTIVE TASK BUDGET's breadth estimate for a task that has never itself
 *  turn-capped (board web-msnt26wf-wnv3w7, "before working a task, estimate
 *  breadth ... touched by similar work"): "deaths cluster on under-budgeted
 *  epics" generalizes across similar work, not just a task's own history.
 *  {@link taskBudgetSignalOf} already covers a task's own scars; this is the
 *  ADVISORY fallback for a task that hasn't failed before but resembles ones
 *  that have. Returns zero for a dimension-less task (nothing to compare
 *  against) or when no dimension peer has ever turn-capped. */
export function taskDimensionBudgetSignalOf(
  task: TaskDimensionLike,
  tasks: readonly TaskDimensionLike[] | null | undefined,
  log: readonly TaskBudgetLogEntry[] | null | undefined,
): TaskBudgetSignal {
  if (!task.dimension) return { turnCapped: 0 };
  let turnCapped = 0;
  for (const peer of tasks || []) {
    if (peer.id === task.id || peer.dimension !== task.dimension) continue;
    turnCapped += taskBudgetSignalOf(peer.id, log).turnCapped;
  }
  return { turnCapped };
}

/** A flight-log entry's fields {@link fleetCacheShareOf} reads to compute its cache-read ratio. */
export interface FlightCacheEntry {
  readonly tokensIn: number | null;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
}

/** Share of a firing's processed context tokens served from cache — 0 when
 *  none of tokensIn/cacheReadTokens/cacheWriteTokens are present, rather than
 *  dividing by zero. Feeds both the fleet-wide cache-read-share stat tile and
 *  its spark (fleetCacheSpark). */
export function fleetCacheShareOf(f: FlightCacheEntry): number {
  const denom = (f.tokensIn || 0) + (f.cacheReadTokens || 0) + (f.cacheWriteTokens || 0);
  return denom > 0 ? (f.cacheReadTokens || 0) / denom : 0;
}

/** A flight-log entry's fields {@link flightBarMeta} needs beyond the verdict
 *  classification it already gets from {@link FlightVerdictEntry}. */
export interface FlightBarEntry extends FlightVerdictEntry {
  readonly sha: string | null;
  readonly turns: number | null;
  readonly failedCheck: string | null;
}

/** A spark/timeline bar's derived tooltip + aria-label metadata. */
export interface FlightBarMeta {
  readonly barClass: string;
  readonly sha: string;
  readonly title: string;
  readonly verdictLabel: string;
  readonly turnsLabel: string;
  readonly ariaLabel: string;
}

/** Every per-firing spark/timeline bar (metricSparkline, flightTimelineStrip)
 *  needs the same tooltip/aria-label metadata derived from a flight-log
 *  entry — verdict class, short sha, resolved title, the "reverted —
 *  <failedCheck>" caveat, and the pluralized turns label were hand-duplicated
 *  identically between the two before this cut (a future edit to one copy
 *  could silently drift from the other, the exact drift bug class
 *  flightVerdictOf/flightHeadlineOf's own doc comments warn about). Takes
 *  `headlineOf` via injection rather than importing `flightHeadlineOf` from
 *  `shared/flight-summary.ts`, the same `heatmapDays`/`actMeta` pattern every
 *  module in this epic uses to stay import-free; `flightVerdictOf` itself is
 *  called directly since it already lives in this same module. `valueLabel`
 *  is the caller's own already-formatted value string (cost, ship-form,
 *  ...) — each caller knows how to format its own value, so this stays
 *  generic across both call sites. */
export function flightBarMeta<F extends FlightBarEntry>(
  f: F,
  taskById: Readonly<Record<string, unknown>>,
  valueLabel: string,
  headlineOf: (f: F, taskById: Readonly<Record<string, unknown>>) => string,
): FlightBarMeta {
  const verdict = flightVerdictOf(f);
  const barClass = 'spark-' + verdict.split(' ')[0] + ' spark-bar';
  const sha = f.sha ? f.sha.slice(0, 7) : '—';
  const title = headlineOf(f, taskById);
  const verdictLabel =
    verdict === 'reverted' && f.failedCheck ? verdict + ' — ' + f.failedCheck : verdict;
  const turns = f.turns || 0;
  const turnsLabel = turns + (turns === 1 ? ' turn' : ' turns');
  const ariaLabel = `${title} — ${verdictLabel}, ${valueLabel}, ${turnsLabel}, ${sha}`;
  return { barClass, sha, title, verdictLabel, turnsLabel, ariaLabel };
}

/** One activity entry's tool-identity fields {@link trajectorySignalOf} reads
 *  — optional because pre-existing test fixtures (and any activity recorded
 *  before per-step tool/target capture) may omit them; a real `ActivityEntry`
 *  always carries both as plain strings. */
export interface TrajectoryEntry {
  readonly tool?: string;
  readonly target?: string;
}

/** A firing's derived path-quality signal — RESEARCH-LIBRARY.md's "trajectory-
 *  level evaluation" gap (score the PATH, not only the ship — a correct ship
 *  can mask a broken trajectory: unnecessary re-reads, redundant tool calls,
 *  backtracking are invisible to outcome-only scoring). `repeatedActions`
 *  counts every activity entry whose exact (tool, target) pair already
 *  occurred earlier in the SAME firing — a firing that re-read the same file
 *  5 times scores worse than one that re-read it twice, not just "some vs.
 *  none". Entries missing tool/target (see {@link TrajectoryEntry}) are
 *  excluded from both counts rather than treated as an always-matching key,
 *  which would falsely flag them as repeats of each other. */
export interface TrajectorySignal {
  readonly repeatedActions: number;
  readonly totalActions: number;
}

export function trajectorySignalOf(entries: readonly TrajectoryEntry[]): TrajectorySignal {
  const seen = new Set<string>();
  let repeatedActions = 0;
  let totalActions = 0;
  for (const e of entries) {
    if (typeof e.tool !== 'string' || typeof e.target !== 'string') continue;
    totalActions++;
    const key = e.tool + ' ' + e.target;
    if (seen.has(key)) repeatedActions++;
    else seen.add(key);
  }
  return { repeatedActions, totalActions };
}

/** A firing-timeline group's minimal shape {@link firingTimelineRowMeta}
 *  reads — one row per firingId (see groupByFiring in activity-log.ts). */
export interface FiringTimelineGroup {
  readonly firingId: string;
  readonly entries: ReadonlyArray<{ readonly at: number } & TrajectoryEntry>;
}

/** The Per-firing trace row's derived text/tip/aria-label metadata — `null`
 *  verdict fields mean "no flight-log entry for this firingId", the row's
 *  own signal to skip rendering the verdict chip entirely. */
export interface FiringTimelineRowMeta {
  readonly headline: string;
  readonly headlineDisplay: string;
  readonly showCallsign: boolean;
  readonly callsignTip: string;
  readonly callsignAriaLabel: string;
  readonly verdict: string | null;
  readonly verdictClass: string | null;
  readonly verdictTip: string | null;
  readonly verdictAriaLabel: string | null;
  readonly countLabel: string;
  readonly startedAgo: string;
  readonly startedAgoAriaLabel: string;
  /** See {@link trajectorySignalOf} — null when the firing had zero repeated
   *  (tool, target) calls, so a clean trajectory renders no chip at all. */
  readonly redundancyLabel: string | null;
  readonly redundancyTip: string | null;
  readonly redundancyAriaLabel: string | null;
}

/** The project page's "Per-firing trace" row's text/tip/aria-label math —
 *  the headline (resolved via `headlineOf` when a flight-log entry exists,
 *  else "unattributed activity" for the sentinel firingId or the raw
 *  firingId itself) truncated to 64 chars for display while the tip/aria
 *  carry the full text, the callsign chip's tip/aria (skipped entirely for
 *  the "unattributed" sentinel), the verdict chip's class/tip/aria (`null`
 *  when there is no flight-log entry to classify), the pluralized event
 *  count, and the "started" relative-time tip — that `firingTimelineSection`
 *  previously computed inline before building each row, spliced the same
 *  way this epic's other cuts were. Takes `headlineOf`/`fmtAgo` via
 *  injection rather than importing `flightHeadlineOf` from
 *  `shared/flight-summary.ts` or `fmtAgo` from `./format.ts`, the same
 *  `heatmapDays`/`actMeta` pattern; `flightVerdictOf` itself is called
 *  directly since it already lives in this same module. */
export function firingTimelineRowMeta<F extends FlightBarEntry>(
  g: FiringTimelineGroup,
  f: F | null | undefined,
  taskById: Readonly<Record<string, unknown>>,
  headlineOf: (f: F, taskById: Readonly<Record<string, unknown>>) => string,
  fmtAgo: (at: number) => string,
): FiringTimelineRowMeta {
  const headline = f
    ? headlineOf(f, taskById)
    : g.firingId === 'unattributed'
      ? 'unattributed activity'
      : g.firingId;
  const headlineDisplay = headline.length > 64 ? headline.slice(0, 64) + '…' : headline;
  const showCallsign = g.firingId !== 'unattributed';
  const callsignTip = 'Radio callsign for ' + g.firingId;
  const callsignAriaLabel = 'firing: ' + g.firingId;
  const verdict = f ? flightVerdictOf(f) : null;
  const verdictClass = verdict ? 'flight-verdict flight-' + verdict.split(' ')[0] : null;
  const verdictTip = verdict ? 'How this firing ended: ' + verdict : null;
  const verdictAriaLabel = verdict ? 'verdict: ' + verdict : null;
  const count = g.entries.length;
  const countLabel = count + (count === 1 ? ' event' : ' events');
  const startedAgo = fmtAgo(g.entries[0]!.at);
  const startedAgoAriaLabel = 'started ' + startedAgo;
  const trajectory = trajectorySignalOf(g.entries);
  const redundancyLabel =
    trajectory.repeatedActions > 0 ? '⟲ ' + trajectory.repeatedActions + ' repeated' : null;
  const redundancyTip = redundancyLabel
    ? trajectory.repeatedActions +
      ' of ' +
      trajectory.totalActions +
      ' actions repeated an identical tool+target call already made this firing — a trajectory-quality signal outcome-only scoring misses'
    : null;
  const redundancyAriaLabel = redundancyLabel ? 'trajectory: ' + redundancyLabel : null;
  return {
    headline,
    headlineDisplay,
    showCallsign,
    callsignTip,
    callsignAriaLabel,
    verdict,
    verdictClass,
    verdictTip,
    verdictAriaLabel,
    countLabel,
    startedAgo,
    startedAgoAriaLabel,
    redundancyLabel,
    redundancyTip,
    redundancyAriaLabel,
  };
}
