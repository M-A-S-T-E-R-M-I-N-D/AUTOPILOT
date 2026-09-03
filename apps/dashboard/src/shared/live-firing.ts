// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure logic shared by the server read-model (`read/fleet.ts`) and the
 * hand-authored client bundle (`web/shell.ts`, no bundler, CSP `self`-only —
 * epic 0002 "shell decomposition", slice 1). `web/shell.ts` embeds this
 * module's real compiled source into the generated `/app.js` text via
 * `.toString()` — see `fleetJs()` — instead of hand-retyping the live-firing
 * helpers, so the two copies can no longer drift apart.
 * `apps/dashboard/test/web/live-firing-parity.test.ts` regression-tests that
 * the served bundle's output matches this module's own functions.
 */

/** The activity fields {@link liveSubagents} reads — a narrow view of `read/fleet.ts`'s `ActivityEntry`. */
export interface SubagentKeyedActivity {
  readonly tool: string;
  readonly target: string;
}

/** A subagent (Agent/Task tool call) seen live within the current firing's
 *  activity window — rendered as an orbiting satellite on the office map. */
export interface LiveSubagent {
  readonly label: string;
}

export const SUBAGENT_TOOLS: ReadonlySet<string> = new Set(['Agent', 'Task']);
export const LIVE_SUBAGENT_CAP = 4;

/**
 * The distinct subagents (Agent/Task tool calls) seen in a firing's activity
 * window, newest first, capped for legibility (`activity` is already
 * newest-first, so the first occurrence of a label IS its newest one).
 */
export function liveSubagents(activity: readonly SubagentKeyedActivity[]): readonly LiveSubagent[] {
  const seen = new Set<string>();
  const out: LiveSubagent[] = [];
  for (const a of activity) {
    if (!SUBAGENT_TOOLS.has(a.tool)) continue;
    const label = a.target || a.tool;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label });
    if (out.length >= LIVE_SUBAGENT_CAP) break;
  }
  return out;
}

/** The flight-log field {@link averageFiringDurationMs} reads — a narrow view of `read/fleet.ts`'s `FlightEntry`. */
export interface DurationKeyedFlight {
  readonly durationMs?: number | null;
}

/** Mean of the past firings' recorded `durationMs` — null when none of them
 *  recorded one (predates duration tracking, or there's no history yet). */
export function averageFiringDurationMs(flightLog: readonly DurationKeyedFlight[]): number | null {
  const durations = flightLog
    .map((f) => f.durationMs)
    .filter((d): d is number => typeof d === 'number');
  if (durations.length === 0) return null;
  return durations.reduce((sum, d) => sum + d, 0) / durations.length;
}

/** The activity fields {@link liveFiringOf} reads to find and describe the
 *  live firing — a narrow view of `read/fleet.ts`'s `ActivityEntry`. Also
 *  carries the message-level telemetry `countTurnsOf` (`shared/turns.ts`'s
 *  `countTurns`) keys a turn on, since `liveFiringOf` hands it the matching
 *  activity slice directly. */
export interface LiveFiringActivity extends SubagentKeyedActivity {
  readonly firingId: string | null;
  readonly phase: string;
  readonly kind: string;
  readonly at: number;
  readonly model?: string | null;
  readonly tokensIn?: number | null;
  readonly tokensOut?: number | null;
  readonly reasoning?: string | null;
}

/** How many turns of zero DO-phase activity is worth flagging as a live
 *  rot/fixation signal — orientation (reading/planning) should resolve into
 *  a first edit well before this many turns. RESEARCH-LIBRARY.md's "ORIENT-
 *  length anomaly" gap (turns-before-first-edit as a live rot/fixation
 *  signal) named this as unmechanized; its own death-cluster analysis found
 *  dead firings average ~65 turns, so this threshold aims to alert the
 *  operator well ahead of that, while it's still cheap to notice. */
export const ORIENT_FIXATION_TURN_THRESHOLD = 15;

/** True when a firing's (capped) activity window shows zero DO-phase
 *  activity yet despite having already run at least
 *  {@link ORIENT_FIXATION_TURN_THRESHOLD} turns — the live counterpart to
 *  RESEARCH-LIBRARY.md's "ORIENT-length anomaly" gap: a rot/fixation signal
 *  visible WHILE it's happening, not only after the firing lands or dies. */
export function orientFixation(
  activity: readonly Pick<LiveFiringActivity, 'phase'>[],
  turnsSeen: number,
): boolean {
  if (turnsSeen < ORIENT_FIXATION_TURN_THRESHOLD) return false;
  return !activity.some((a) => a.phase === 'do');
}

/** The flight-log field {@link liveFiringOf} reads to detect a firing that
 *  has already landed — a narrow view of `read/fleet.ts`'s `FlightEntry`. */
export interface LiveFiringFlightLogEntry extends DurationKeyedFlight {
  readonly id: string;
}

/** The task field {@link liveFiringOf} reads for the operator's focus lock —
 *  a narrow view of `read/fleet.ts`'s `TaskEntry`. */
export interface LiveFiringTask {
  readonly focus?: unknown;
  readonly title: string;
}

/** The project fields {@link liveFiringOf} reads. */
export interface LiveFiringProject {
  readonly status: string;
  readonly activity: readonly LiveFiringActivity[];
  readonly flightLog: readonly LiveFiringFlightLogEntry[];
  readonly tasks: readonly LiveFiringTask[];
}

/** {@link liveFiringOf}'s result: everything the live worker card + office
 *  map render for the currently-running firing. Cost is deliberately absent:
 *  it's only known once the firing lands. `turnsSeen` is an honest live
 *  approximation (see `countTurns` in `shared/turns.ts`) — callers should
 *  label it as such rather than treat it as the authoritative count. */
export interface LiveFiringResult {
  readonly firingId: string;
  /** See {@link CALLSIGN_WORDS} (`shared/callsign.ts`). */
  readonly callsign: string;
  readonly phase: string;
  readonly tool: string;
  readonly target: string;
  readonly kind: string;
  /** Tool uses seen for this firing within the (capped) activity window. */
  readonly recentActions: number;
  /** True when EVERY loaded activity entry belongs to this firing — the
   *  window may be hiding earlier actions, so `recentActions` is a floor,
   *  not a total. */
  readonly recentActionsCapped: boolean;
  readonly turnsSeen: number;
  /** `at` of the oldest activity in this firing's (capped) window — the
   *  renderer computes "elapsed" from this against the current clock rather
   *  than baking in a duration here, which would go stale between renders. */
  readonly startedAt: number;
  /** The operator-focused task's title, if one is locked (WIP-limit-1) — the
   *  honest best guess at "what this firing is working", not a self-report. */
  readonly focusTask: string | null;
  readonly narrator: string;
  readonly subagents: readonly LiveSubagent[];
  /** Mean wall-clock duration of this project's past firings that recorded
   *  one — null with no such history yet. Lets the renderer show live
   *  progress ("elapsed vs. the ~Nm this usually takes") instead of a bare,
   *  unanchored elapsed counter. */
  readonly avgFiringDurationMs: number | null;
  /** See {@link orientFixation} — true when this firing has run at least
   *  {@link ORIENT_FIXATION_TURN_THRESHOLD} turns with no DO-phase (edit)
   *  activity yet, a live rot/fixation signal the operator can act on before
   *  waiting for the turn cap. */
  readonly orientFixation: boolean;
  /** The model that produced the firing's newest activity (MODEL MIX,
   *  backlog `web-mssn106m-bqvxi8`, second slice: the Metrics panel's
   *  per-firing rollup already shipped — this is the office-map/live-worker
   *  badge, sourced from the per-step `model` the events payload already
   *  carries). Null when uncaptured — activity that predates per-step model
   *  tracking. */
  readonly model: string | null;
}

/**
 * The currently-running firing, or null when nothing is live. A firing is
 * live once the project is `flying` AND its newest activity's `firingId` has
 * no matching row in `flightLog` yet (a landed firing — shipped, reverted, or
 * no-commit — always gets one, see `SqliteFiringStore.recordFiring`).
 *
 * `callsignOf`/`narratorLineOf`/`countTurnsOf` are caller-supplied rather
 * than imported from `shared/callsign.ts`/`shared/narrator.ts`/`shared/
 * turns.ts` — the same `heatmapDays(..., verdictOf)` injection pattern
 * `web/heatmap.ts` already uses. A real cross-module import here would
 * type-check and run fine server-side, but breaks once Vitest's SSR
 * transform rewrites it to a `__vite_ssr_import_N__` reference that doesn't
 * survive this module's own `.toString()` extraction into the client bundle
 * — shared modules stay import-free by rule, not just by precedent (see
 * `shared/file-nodes.ts`'s doc comment).
 */
export function liveFiringOf(
  p: LiveFiringProject,
  callsignOf: (firingId: string) => string,
  narratorLineOf: (activity: readonly LiveFiringActivity[]) => string,
  countTurnsOf: (activity: readonly LiveFiringActivity[]) => number,
): LiveFiringResult | null {
  if (p.status !== 'flying' || p.activity.length === 0) return null;
  const newest = p.activity[0]!;
  if (!newest.firingId) return null;
  if (p.flightLog.some((f) => f.id === newest.firingId)) return null;
  const matching = p.activity.filter((a) => a.firingId === newest.firingId);
  const turnsSeen = countTurnsOf(matching);
  return {
    firingId: newest.firingId,
    callsign: callsignOf(newest.firingId),
    phase: newest.phase,
    tool: newest.tool,
    target: newest.target,
    kind: newest.kind,
    recentActions: matching.length,
    recentActionsCapped: matching.length === p.activity.length,
    turnsSeen,
    startedAt: matching[matching.length - 1]!.at,
    focusTask: p.tasks.find((t) => t.focus)?.title ?? null,
    narrator: narratorLineOf(matching),
    subagents: liveSubagents(matching),
    avgFiringDurationMs: averageFiringDurationMs(p.flightLog),
    orientFixation: orientFixation(matching, turnsSeen),
    model: newest.model ?? null,
  };
}

/**
 * Every still-live firing in the project's activity window, newest-lane
 * first — the multi-lane counterpart to {@link liveFiringOf}. A single
 * project (repo) can run several autopilot worktree lanes concurrently, and
 * their tool-call events interleave into one `activity` array keyed by
 * `firingId`; `liveFiringOf` only ever resolves the newest entry's
 * `firingId`, so N concurrent lanes collapsed into ONE reported "live
 * firing" (board web-mtbp0t86-rnimyi, "fleet cockpit shows 1 pilot for 8
 * lanes"). This walks the whole window once, taking the first (newest)
 * activity entry for each distinct `firingId` that has not yet landed in
 * `flightLog`, and builds the same {@link LiveFiringResult} shape per lane.
 * `liveFiringOf` is left untouched — its single-firing contract and the
 * client-bundle parity test that pins it stay exactly as they are; this is
 * an additive read, not a replacement.
 */
export function liveFiringsOf(
  p: LiveFiringProject,
  callsignOf: (firingId: string) => string,
  narratorLineOf: (activity: readonly LiveFiringActivity[]) => string,
  countTurnsOf: (activity: readonly LiveFiringActivity[]) => number,
): readonly LiveFiringResult[] {
  if (p.status !== 'flying' || p.activity.length === 0) return [];
  const landedIds = new Set(p.flightLog.map((f) => f.id));
  const seen = new Set<string>();
  const lanes: LiveFiringActivity[] = [];
  for (const newest of p.activity) {
    const firingId = newest.firingId;
    if (!firingId || seen.has(firingId) || landedIds.has(firingId)) continue;
    seen.add(firingId);
    lanes.push(newest);
  }
  // p.tasks/p.flightLog-derived reads stay behind this guard, same as
  // liveFiringOf's early `if (!newest.firingId) return null` above — an idle
  // project (nothing live to report) should never have to satisfy
  // LiveFiringProject's `tasks` contract just to be asked the question.
  if (lanes.length === 0) return [];
  const avgFiringDurationMs = averageFiringDurationMs(p.flightLog);
  const focusTask = p.tasks.find((t) => t.focus)?.title ?? null;
  return lanes.map((newest) => {
    const firingId = newest.firingId!;
    const matching = p.activity.filter((a) => a.firingId === firingId);
    const turnsSeen = countTurnsOf(matching);
    return {
      firingId,
      callsign: callsignOf(firingId),
      phase: newest.phase,
      tool: newest.tool,
      target: newest.target,
      kind: newest.kind,
      recentActions: matching.length,
      recentActionsCapped: matching.length === p.activity.length,
      turnsSeen,
      startedAt: matching[matching.length - 1]!.at,
      focusTask,
      narrator: narratorLineOf(matching),
      subagents: liveSubagents(matching),
      avgFiringDurationMs,
      orientFixation: orientFixation(matching, turnsSeen),
      model: newest.model ?? null,
    };
  });
}
