// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure stat-tile item math for the per-project DORA-for-agents panel, the
 * parallel-gate-savings panel, the fleet-wide header bar's two tile rows,
 * each project card's `.card-meta`/`.card-stats` rows, and the Metrics
 * panel's `.card-stats` row — client-only
 * (no server counterpart, unlike `shared/*.ts`), so it lives in `web/`
 * rather than `shared/` (epic 0002 "shell decomposition", slice 2: feature-
 * module split of `shell.ts`), following the same pattern
 * `phase-rail.ts`/`flight-metrics.ts` proved. Each panel previously built its
 * `[value, label, tip]` tile-item array inline with hand-typed formatting
 * before looping to build each `.stat-tile`/`.stat` — this pulls just that
 * item math out, one function per panel kept in the same module since they
 * share the exact tuple shape. Every function that formats a currency or
 * duration value takes `fmtCost`/`fmtDuration`/`fmtTokens` via injection
 * rather than importing them from `./format.ts`, the same
 * `flightProgressOf`/`actMeta` pattern (a real cross-module import
 * type-checks fine but breaks once Vitest's SSR transform rewrites it to a
 * reference that doesn't survive `.toString()` extraction).
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** One `.stat-tile`'s value/label/tooltip triple, in render order. */
export type StatTileItem = readonly [value: string, label: string, tip: string];

/** A `.stat-tile`/`.total`/`.stat` cell's `aria-label` — `doraSection`,
 *  `gateParallelSection`, `renderTotals`, `renderStatTiles`, and the
 *  lower-level `stat()` builder (`cardStats`/`metricsSection`'s shared
 *  element factory) in `web/shell.ts` each independently re-derived this
 *  same `label + ': ' + value + ' — ' + tip` string right before writing
 *  it, a hand-sync duplication across five call sites the same shape
 *  `flightBarMeta`'s doc comment (`web/flight-metrics.ts`, fifty-first cut)
 *  warns about — the seventy-fifth cut fixed the first four call sites;
 *  the seventy-ninth cut closed the fifth, `stat()` itself, which those
 *  four don't route through. */
export function statTileAriaLabel(item: StatTileItem): string {
  return item[1] + ': ' + item[0] + ' — ' + item[2];
}

/** The subset of `packages/store/src/dora.ts`'s `DoraSnapshot` {@link doraTileItems} reads. */
export interface DoraSnapshotLike {
  readonly landingFrequency: { readonly perDay: number; readonly windowDays: number };
  readonly taskLeadTime: {
    readonly medianLeadTimeMs: number | null;
    readonly tasksCompleted: number;
  };
  readonly changeFailureRate: { readonly rate: number | null; readonly shipped: number };
  readonly mttr: { readonly medianRecoveryMs: number | null; readonly resolved: number };
}

/** The DORA-for-agents panel's four tiles' value/label/tip triples, in the
 *  panel's fixed render order (landings/day, task lead time, change failure
 *  rate, MTTR). A metric with no data yet renders `'—'` rather than a false
 *  `0`/`0%`. */
export function doraTileItems(
  d: DoraSnapshotLike,
  fmtDuration: (ms: number) => string,
): readonly StatTileItem[] {
  return [
    [
      d.landingFrequency.perDay.toFixed(1),
      'landings / day',
      'Shipped, gate-verified firings per day, trailing ' + d.landingFrequency.windowDays + ' days',
    ],
    [
      d.taskLeadTime.medianLeadTimeMs === null ? '—' : fmtDuration(d.taskLeadTime.medianLeadTimeMs),
      'task lead time',
      'Median time from a board task being created to the firing that completed it (' +
        d.taskLeadTime.tasksCompleted +
        ' completed)',
    ],
    [
      d.changeFailureRate.rate === null ? '—' : Math.round(d.changeFailureRate.rate * 100) + '%',
      'change failure rate',
      'Shipped commits that were reverts, trailing 30 days (' +
        d.changeFailureRate.shipped +
        ' shipped)',
    ],
    [
      d.mttr.medianRecoveryMs === null ? '—' : fmtDuration(d.mttr.medianRecoveryMs),
      'MTTR',
      'Median time from a checkpoint (turn-budget escape hatch) to the firing that resumed it (' +
        d.mttr.resolved +
        ' resolved)',
    ],
  ];
}

/** The subset of `packages/store/src/read.ts`'s `GateParallelSavings` {@link gateParallelTileItems} reads. */
export interface GateParallelSavingsLike {
  readonly sampledFirings: number;
  readonly savedMs: number;
  readonly savedPct: number | null;
}

/** The parallel-gate-savings panel's three tiles' value/label/tip triples,
 *  in the panel's fixed render order (sampled firings, wall-clock saved,
 *  saved-vs-sequential percentage). */
export function gateParallelTileItems(
  g: GateParallelSavingsLike,
  fmtDuration: (ms: number) => string,
): readonly StatTileItem[] {
  return [
    [
      String(g.sampledFirings),
      'sampled firings',
      'Firings with ≥2 concurrently-run typecheck/lint/format checks recorded',
    ],
    [
      fmtDuration(g.savedMs),
      'wall-clock saved',
      'Sum of (sequential cost − observed concurrent cost) across sampled firings',
    ],
    [
      g.savedPct === null ? '—' : Math.round(g.savedPct * 100) + '%',
      'saved vs sequential',
      'Wall-clock saved as a share of what running those checks one after another would have cost',
    ],
  ];
}

/** The subset of `packages/store/src/warm-sessions.ts`'s `WarmSessionSavings`
 *  {@link warmSessionTileItems} reads. */
export interface WarmSessionSavingsLike {
  readonly resumed: { readonly firings: number };
  readonly cold: { readonly firings: number };
  readonly freshInputDeltaPerFiring: number | null;
  readonly costDeltaPerFiring: number | null;
  readonly costPerTurnDeltaPerFiring: number | null;
}

/** The warm-sessions panel's four tiles' value/label/tip triples, in the
 *  panel's fixed render order (resumed firings, fresh input saved per firing,
 *  cost saved per firing, cost saved per turn) — epic 0009's measurable win,
 *  rendered. Formats inline (tokens rounded, cost to cents) so the compiled
 *  client copy carries no formatter dependency; a null delta (either
 *  comparison group still empty) reads as an em dash, never a fake 0. The
 *  per-turn tile is confound-controlled: resumed and cold firings run very
 *  different average turn counts, so it can disagree with the raw per-firing
 *  cost tile — that disagreement IS the signal, not noise. */
export function warmSessionTileItems(w: WarmSessionSavingsLike): readonly StatTileItem[] {
  return [
    [
      String(w.resumed.firings),
      'resumed firings',
      'Firings that ran on a resumed CLI session instead of a cold spawn (' +
        w.cold.firings +
        ' cold to compare against)',
    ],
    [
      w.freshInputDeltaPerFiring === null ? '—' : Math.round(w.freshInputDeltaPerFiring) + ' tok',
      'fresh input saved / firing',
      'Average fresh (uncached) input tokens a cold firing pays minus what a resumed one pays',
    ],
    [
      w.costDeltaPerFiring === null ? '—' : '$' + w.costDeltaPerFiring.toFixed(2),
      'cost saved / firing',
      'Average cost of a cold firing minus a resumed one — positive means resume is cheaper',
    ],
    [
      w.costPerTurnDeltaPerFiring === null ? '—' : '$' + w.costPerTurnDeltaPerFiring.toFixed(3),
      'cost saved / turn',
      'Confound-controlled: average of each firing’s own cost/turn ratio, cold minus resumed — ' +
        'isolates resume’s effect from the two groups running different average turn counts',
    ],
  ];
}

/** The subset of `web/evaluation-trend.ts`'s `EvaluationTrendSummary`
 *  {@link evaluationTrendTileItems} reads. */
export interface EvaluationTrendSummaryLike {
  readonly approved: number;
  readonly rejected: number;
  readonly rate: number | null;
  readonly direction: 'improving' | 'declining' | 'flat' | null;
}

/** The evolution panel's four tiles' value/label/tip triples, in the panel's
 *  fixed render order (approval rate, approved, rejected, trend) — backlog
 *  item J checkbox 5's "is the agent improving?" view (approval-rate up,
 *  rejection-rate down, over time), rendered as a summary for the trailing
 *  window {@link EvaluationTrendSummaryLike} already covers. `windowWeeks` is
 *  injected (the panel's own `EVAL_TREND_WEEKS` constant) rather than
 *  imported, the same reason `fmtCost`/`fmtDuration` are injected elsewhere
 *  in this file. A window with no operator verdicts yet renders an em dash
 *  rather than a fake 0%. */
export function evaluationTrendTileItems(
  s: EvaluationTrendSummaryLike,
  windowWeeks: number,
): readonly StatTileItem[] {
  const directionWord =
    s.direction === null ? 'not enough data' : s.direction === 'flat' ? 'steady' : s.direction;
  return [
    [
      s.rate === null ? '—' : Math.round(s.rate * 100) + '%',
      'approval rate',
      'Share of operator-reviewed proposals (task approve/reject, SOUL ratify/unratify/dismiss) ' +
        'approved, trailing ' +
        windowWeeks +
        ' weeks',
    ],
    [String(s.approved), 'approved', 'Operator-approved proposals in the trailing window'],
    [String(s.rejected), 'rejected', 'Operator-rejected proposals in the trailing window'],
    [
      directionWord,
      'trend',
      s.direction === null
        ? 'Fewer than two weeks with any operator verdicts yet — too little data for a direction'
        : 'Later half of the window’s weekly approval rate vs the earlier half — a move inside ' +
          '±5 points reads as steady, not a trend',
    ],
  ];
}

/** The subset of `read/fleet.ts`'s `FleetTotals` {@link totalsTileItems}/{@link statTileItems} read. */
export interface FleetTotalsLike {
  readonly projects: number;
  readonly flying: number;
  readonly firings: number;
  readonly shipped: number;
  readonly cost: number;
  /** Cost semantics v3 (epic 0013) — fleet-wide summed real subscription-
   *  apportioned spend; `null` when unconfigured or not one firing carries it. */
  readonly realCost?: number | null;
  readonly openFindings: number;
  readonly needsYou: number;
  readonly costPerShipped: number | null;
  readonly shipRate: number | null;
  readonly currentStreak: number;
  readonly avgTurns: number | null;
  readonly cacheReadShare: number | null;
}

/** The fleet-wide header bar's raw-count tiles' value/label/tip triples
 *  (projects, flying, firings, shipped, cost, open findings, need you), in
 *  the panel's fixed render order. An eighth "real cost" tile (cost semantics
 *  v3, epic 0013) only appears once `realCost` is non-null — an unconfigured
 *  fleet (the common case today) renders the same seven tiles it always has,
 *  rather than a permanent, mostly-unconfigured "—" chip. */
export function totalsTileItems(
  t: FleetTotalsLike,
  fmtCost: (n: number) => string,
): readonly StatTileItem[] {
  const items: StatTileItem[] = [
    [String(t.projects), 'projects', 'Distinct projects AUTOPILOT is tracking'],
    [String(t.flying), 'flying', 'Projects with a firing running right now'],
    [String(t.firings), 'firings', 'Total engine firings across all projects'],
    [String(t.shipped), 'shipped', 'Firings that passed the gate and committed'],
    [fmtCost(t.cost), 'cost', 'Total spend across every firing'],
    [String(t.openFindings), 'open findings', 'Unresolved review findings across all projects'],
    [String(t.needsYou), 'need you', 'Items waiting on a decision from you'],
  ];
  if (typeof t.realCost === 'number') {
    items.push([
      fmtCost(t.realCost),
      'real cost',
      'Total spend apportioned by real subscription share instead of API list price (cost semantics v3)',
    ]);
  }
  return items;
}

/** The fleet-wide header bar's derived-rate tiles' value/label/tip triples
 *  (cost/shipped, ship rate, streak, avg turns, cache-read share), in the
 *  panel's fixed render order. Each tile also carries a spark built from the
 *  fleet's merged firing series — DOM-built separately by the caller and
 *  matched back to this array by index, kept out of this pure tuple the same
 *  reason the DOM-building loop itself stays inline everywhere else in this
 *  slice. */
export function statTileItems(
  t: FleetTotalsLike,
  fmtCost: (n: number) => string,
): readonly StatTileItem[] {
  return [
    [
      typeof t.costPerShipped === 'number' ? fmtCost(t.costPerShipped) : '—',
      'cost / shipped',
      'Average spend per firing that actually shipped',
    ],
    [
      typeof t.shipRate === 'number' ? Math.round(t.shipRate * 100) + '%' : '—',
      'ship rate',
      'Shipped firings as a share of all firings, fleet-wide',
    ],
    [
      String(t.currentStreak),
      'streak',
      'Consecutive shipped firings, newest first, across the whole fleet',
    ],
    [
      typeof t.avgTurns === 'number' ? t.avgTurns.toFixed(1) : '—',
      'avg turns',
      'Average assistant turns per firing, fleet-wide',
    ],
    [
      typeof t.cacheReadShare === 'number' ? Math.round(t.cacheReadShare * 100) + '%' : '—',
      'cache-read share',
      'Share of processed context tokens served from cache',
    ],
  ];
}

/** The subset of a project card's fields {@link cardStatItems} reads. */
export interface CardStatsLike {
  readonly firings: number;
  readonly shipped: number;
  readonly shipRate: number | null;
  readonly recentShipRate?: number | null;
}

/** A project card's `.card-stats` row value/label/tip triples (firings,
 *  shipped, ship rate), in the card's fixed render order. A fourth "recent
 *  form" tile — ship rate over the last 5 firings, an honest "how is it
 *  doing NOW?" complement to the lifetime rate — only appears once the
 *  project has enough history to compute one. */
export function cardStatItems(c: CardStatsLike): readonly StatTileItem[] {
  const items: StatTileItem[] = [
    [String(c.firings), 'firings', 'Total engine firings for this project'],
    [String(c.shipped), 'shipped', 'Firings that passed the gate and committed'],
    [
      c.shipRate === null ? '—' : Math.round(c.shipRate * 100) + '%',
      'ship rate',
      'Shipped firings as a share of all firings for this project',
    ],
  ];
  if (c.recentShipRate !== null && c.recentShipRate !== undefined) {
    items.push([
      Math.round(c.recentShipRate * 100) + '%',
      'recent form',
      'Ship rate over the last 5 firings',
    ]);
  }
  return items;
}

/** The subset of a project card's fields {@link cardMetaItems} reads. */
export interface CardMetaLike {
  readonly primaryLanguage: string;
  readonly fileCount: number;
  readonly totalBytes: number;
}

/** A project card's `.card-meta` row chip text/tip/aria-label triples
 *  (primary language, file count, total size), in the card's fixed render
 *  order — the same tipChip-argument-order shape {@link RoundStatItem}
 *  defines below, since this row also builds `tipChip`s directly rather than
 *  `stat()` tiles. Takes `fmtBytes` via injection rather than importing it
 *  from `./format.ts`, the same `doraTileItems`/`actMeta` pattern. */
export function cardMetaItems(
  c: CardMetaLike,
  fmtBytes: (n: number) => string,
): readonly RoundStatItem[] {
  return [
    [
      c.primaryLanguage,
      'Primary language detected in this project',
      'Primary language: ' + c.primaryLanguage,
    ],
    [
      c.fileCount + ' files',
      'Number of source files AUTOPILOT is tracking',
      'File count: ' + c.fileCount,
    ],
    [
      fmtBytes(c.totalBytes),
      'Total size of tracked source files',
      'Total size: ' + fmtBytes(c.totalBytes),
    ],
  ];
}

/** The subset of `read/source.ts`'s `RoundInfo` {@link roundSinceLabel} reads. */
export interface RoundSinceLike {
  readonly roundStartAt: number | null;
  readonly tagName: string | null;
}

/** The subset of `read/source.ts`'s `RoundInfo` {@link roundStatItems} reads. */
export interface RoundStatsLike {
  readonly firings: number;
  readonly shipped: number;
  readonly cost: number;
  readonly shipRate: number | null;
}

/** The CURRENT ROUND panel's "since &lt;tag&gt;" chip label/aria-label pair,
 *  or `null` when the project has no release tags yet (the panel falls back
 *  to a fixed "every firing counts toward the round so far" sentence in that
 *  case — a static string with nothing to compute, so it stays inline).
 *  Takes `fmtAgo` via injection rather than importing it from `./format.ts`,
 *  the same `doraTileItems`/`gateParallelTileItems` pattern. */
export function roundSinceLabel(
  round: RoundSinceLike,
  fmtAgo: (at: number) => string,
): { readonly text: string; readonly ariaLabel: string } | null {
  if (!round.tagName || round.roundStartAt === null) return null;
  const ago = fmtAgo(round.roundStartAt);
  return {
    text: 'since ' + round.tagName + ' · ' + ago,
    ariaLabel: 'round boundary: since ' + round.tagName + ', ' + ago,
  };
}

/** One round-stats chip's text/tip/aria-label triple, in `tipChip`'s own
 *  argument order — distinct from {@link StatTileItem}'s value/label/tip
 *  order since this panel builds `tipChip`s directly rather than `stat()`
 *  tiles. */
export type RoundStatItem = readonly [text: string, tip: string, ariaLabel: string];

/** The CURRENT ROUND panel's stat-chip text/tip/aria-label triples (firings,
 *  shipped, cost), in the panel's fixed render order. A fourth "ship rate"
 *  chip only appears once the round has a defined rate (no firings yet
 *  means no honest rate to show), the same conditional-tile shape
 *  {@link cardStatItems}'s "recent form" tile uses. Takes `fmtCost` via
 *  injection rather than importing it from `./format.ts`, the same
 *  `doraTileItems`/`gateParallelTileItems` pattern. */
export function roundStatItems(
  round: RoundStatsLike,
  fmtCost: (n: number) => string,
): readonly RoundStatItem[] {
  const items: RoundStatItem[] = [
    [String(round.firings), 'Firings this round', round.firings + ' firings this round'],
    [String(round.shipped), 'Shipped this round', round.shipped + ' shipped this round'],
    [fmtCost(round.cost), 'Spend this round', 'cost this round: ' + fmtCost(round.cost)],
  ];
  if (round.shipRate !== null) {
    const pct = Math.round(round.shipRate * 100) + '%';
    items.push([pct, 'Ship rate this round', 'ship rate this round: ' + pct]);
  }
  return items;
}

/** The subset of a project card's fields {@link metricsStatItems} reads. */
export interface MetricsStatsLike {
  readonly cost: number;
  readonly tokensIn?: number | null;
  readonly tokensOut?: number | null;
  readonly shipRate: number | null;
}

/** The project detail page's Metrics panel `.card-stats` row value/label/tip
 *  triples (total cost, tokens, ship rate), in the panel's fixed render
 *  order. Takes `fmtCost`/`fmtTokens` via injection rather than importing
 *  them from `./format.ts`, the same `doraTileItems`/`gateParallelTileItems`
 *  pattern. */
export function metricsStatItems(
  c: MetricsStatsLike,
  fmtCost: (n: number) => string,
  fmtTokens: (n: number) => string,
): readonly StatTileItem[] {
  return [
    [fmtCost(c.cost), 'total cost', 'Total spend across every firing for this project'],
    [
      fmtTokens((c.tokensIn || 0) + (c.tokensOut || 0)),
      'tokens',
      'Total input + output tokens processed across every firing',
    ],
    [
      c.shipRate === null ? '—' : Math.round(c.shipRate * 100) + '%',
      'ship rate',
      'Shipped firings as a share of all firings for this project',
    ],
  ];
}

/** A flight-log entry's field {@link modelMixItems} reads to tally which model ran it. */
export interface ModelMixEntry {
  readonly model?: string | null;
}

/** One model's share of a project's tracked firings, in {@link modelMixItems}'s
 *  count-descending render order. */
export interface ModelMixItem {
  readonly model: string;
  readonly count: number;
  readonly pct: number;
}

/** Per-project MODEL MIX breakdown (backlog `web-mssn106m-bqvxi8`): how many
 *  firings each model ran, sorted by count descending. A firing's `model` is
 *  already recorded per-firing (`read/fleet.ts`'s `FlightEntry.model`) but
 *  was never rolled up into its own panel — this closes that gap for the
 *  project detail page's Metrics panel. Firings that predate per-firing model
 *  tracking (`model` null/absent — a pre-existing-fixture caveat, same reason
 *  as `FlightEntry`'s cache-token/duration fields) are excluded from both the
 *  count and the percentage denominator rather than lumped into a misleading
 *  "unknown" bucket — an empty result means every firing predates tracking,
 *  and the caller renders nothing rather than a single meaningless 100% chip. */
export function modelMixItems(log: readonly ModelMixEntry[]): readonly ModelMixItem[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const entry of log) {
    if (!entry.model) continue;
    counts.set(entry.model, (counts.get(entry.model) || 0) + 1);
    total++;
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([model, count]) => ({ model, count, pct: count / total }));
}

/** One {@link ModelMixItem}'s chip text/tip/aria-label triple that
 *  `metricsSection` in `web/shell.ts` previously computed inline (percentage
 *  rounding, the "N of M tracked firing(s) ran <model>" tip sentence) before
 *  calling `tipChip`, in `tipChip`'s own argument order — the same
 *  {@link RoundStatItem} shape `cardMetaItems` reuses. `total` is the
 *  caller's own already-summed tracked-firing count (the denominator every
 *  item in one `modelMixItems(...)` result shares) rather than a value this
 *  function derives itself, the same reason `roundSinceLabel` takes `fmtAgo`
 *  via injection instead of importing it. */
export function modelMixChipMeta(item: ModelMixItem, total: number): RoundStatItem {
  const text = item.model + ' ' + Math.round(item.pct * 100) + '%';
  return [
    text,
    item.count + ' of ' + total + ' tracked firing(s) ran ' + item.model,
    'model mix: ' + text,
  ];
}

/** The live-firing fields {@link liveWorkerItems} reads — a narrow view of
 *  `shared/live-firing.ts`'s `LiveFiringResult`. */
export interface LiveWorkerFiringLike {
  readonly model: string | null;
  readonly phase: string;
  readonly callsign: string;
}

/** One project card's identity plus its already-computed live firings (empty
 *  when idle) — the shape {@link liveWorkerItems} reduces over. The caller
 *  computes `lives` itself (server: `read/fleet.ts`'s `liveFirings`; client:
 *  `web/shell.ts`'s wrapper of `shared/live-firing.ts`'s `liveFiringsOf`)
 *  rather than this function importing either, the same injection reason
 *  `doraTileItems`/`gateParallelTileItems` take `fmtDuration` instead of
 *  importing `./format.ts`. A project can run several concurrent worktree
 *  lanes at once (board web-mtbp0t86-rnimyi, "fleet cockpit shows 1 pilot
 *  for 8 lanes") — plural from the start avoids re-collapsing that here. */
export interface LiveWorkerCardLike {
  readonly id: string;
  readonly name: string;
  readonly lives: readonly LiveWorkerFiringLike[];
}

/** One currently-flying LANE's rollup entry, in {@link liveWorkerItems}'s
 *  render order (source array order — the fleet's own project order, not
 *  re-sorted; a multi-lane project's own lanes stay adjacent, newest-lane
 *  first, matching `liveFiringsOf`'s own order). */
export interface LiveWorkerItem {
  readonly projectId: string;
  readonly projectName: string;
  readonly model: string | null;
  readonly phase: string;
  readonly callsign: string;
  /** How many concurrent lanes THIS project has live right now — 1 for the
   *  common single-lane case. {@link liveWorkerChipMeta} uses `> 1` to
   *  disambiguate otherwise-identical chips (same project, same/no model)
   *  with the callsign, instead of rendering indistinguishable duplicates. */
  readonly laneCount: number;
}

/** Fleet-wide "who works on what" rollup (backlog `web-mssn106m-bqvxi8`,
 *  fourth slice; multi-lane board web-mtbp0t86-rnimyi): every LANE running
 *  right now, alongside the model running it — the whole-fleet complement to
 *  the per-project live-worker card's model badge (previous slice) and the
 *  Metrics panel's historical MODEL MIX breakdown (first slice,
 *  `modelMixItems` above), which only shows *finished* firings. Idle
 *  projects (`lives` empty) are filtered out rather than padded with a
 *  placeholder row; a project running N concurrent lanes contributes N rows. */
export function liveWorkerItems(cards: readonly LiveWorkerCardLike[]): readonly LiveWorkerItem[] {
  const out: LiveWorkerItem[] = [];
  for (const c of cards) {
    for (const live of c.lives) {
      out.push({
        projectId: c.id,
        projectName: c.name,
        model: live.model,
        phase: live.phase,
        callsign: live.callsign,
        laneCount: c.lives.length,
      });
    }
  }
  return out;
}

/** One {@link LiveWorkerItem}'s chip text/tip/aria-label triple that
 *  `renderLiveWorkers` in `web/shell.ts` previously computed inline before
 *  calling `tipChip`. Takes `officeTips` via injection rather than importing
 *  `OFFICE_TIPS` from `web/office-map.ts`, the same `doraTileItems`/`actMeta`
 *  pattern this module's siblings use to stay import-free (these modules get
 *  spliced into the client bundle via `.toString()`). */
export interface LiveWorkerChipMeta {
  readonly text: string;
  readonly tip: string;
  readonly ariaLabel: string;
}

export function liveWorkerChipMeta(
  w: LiveWorkerItem,
  officeTips: Readonly<Record<string, string>>,
): LiveWorkerChipMeta {
  const phaseTip = officeTips[w.phase] || 'phase not yet classified from recent activity';
  // Two lanes on the SAME project would otherwise render textually identical
  // chips (same project name, same/no model) — the callsign is the one field
  // that's always distinct per lane, so it only needs surfacing here once
  // there's a second lane to tell apart from.
  const laneTag = w.laneCount > 1 ? ' (' + w.callsign + ')' : '';
  const text = w.projectName + laneTag + (w.model ? ' · ' + w.model : '');
  const tip =
    w.projectName +
    ' (' +
    w.callsign +
    ') is flying — ' +
    phaseTip +
    (w.model ? ', model: ' + w.model : ', model not yet captured');
  const ariaLabel =
    'flying now: ' +
    w.projectName +
    laneTag +
    (w.model ? ', model ' + w.model : '') +
    ', phase ' +
    w.phase;
  return { text, tip, ariaLabel };
}
