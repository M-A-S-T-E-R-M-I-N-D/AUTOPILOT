// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure task-queue tally math for the project detail page's Tasks card —
 * client-only (no server counterpart, unlike `shared/*.ts`), so it lives in
 * `web/` rather than `shared/` (epic 0002 "shell decomposition", slice 2:
 * feature-module split of `shell.ts`), following the same pattern
 * `phase-rail.ts`/`flight-metrics.ts` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** The fields {@link taskFocusActive}/{@link taskQueueCounts} read off each
 *  task entry. */
export interface TaskQueueTask {
  readonly status: string;
  readonly focus?: unknown;
}

/** Whether any task is under the operator's WIP-limit-1 focus lock — drives
 *  the "🎯 FOCUS MODE" heading and dims every other row. */
export function taskFocusActive(tasks: readonly TaskQueueTask[]): boolean {
  for (const t of tasks) {
    if (t.focus) return true;
  }
  return false;
}

/** {@link taskQueueCounts}'s result: how many tasks are open (workable) vs.
 *  closed (done/deferred), and how many of the closed ones the paginated
 *  "Load more done" history currently reveals. */
export interface TaskQueueCounts {
  readonly openCount: number;
  readonly closedTotal: number;
  readonly closedVisible: number;
}

/** Open-vs-closed task tallies for the Tasks card — `openCount` feeds the
 *  ↑/↓ reorder buttons' "position X of Y" tips (only `queued`/`in_progress`
 *  tasks are workable), `closedTotal`/`closedVisible` feed the "Load more
 *  done" pagination (capped to `historyChunk` tasks at a time unless the
 *  operator already revealed more via `revealedCount`). A task in some other
 *  status (e.g. `needs_approval`) counts toward neither bucket — it renders
 *  unconditionally and isn't reorderable. */
export function taskQueueCounts(
  tasks: readonly TaskQueueTask[],
  revealedCount: number | undefined,
  historyChunk: number,
): TaskQueueCounts {
  let openCount = 0;
  let closedTotal = 0;
  for (const t of tasks) {
    if (t.status === 'queued' || t.status === 'in_progress') openCount++;
    else if (t.status === 'done' || t.status === 'deferred') closedTotal++;
  }
  const closedVisible = Math.min(revealedCount || historyChunk, closedTotal);
  return { openCount, closedTotal, closedVisible };
}

/** {@link taskHistoryMoreMeta}'s result: the "Load more done" pagination
 *  button's visible text and its shared tip/aria-label. */
export interface TaskHistoryMoreMeta {
  readonly text: string;
  readonly tip: string;
}

/** The "Load more done" pagination button's text ("Load more done (showing X
 *  of Y)") and tip/aria-label ("Reveal N more done/deferred tasks", N clamped
 *  to whatever's left of `historyChunk`) — the other half of {@link
 *  taskQueueCounts}'s `closedTotal`/`closedVisible` tallies, which feed the
 *  numbers this button's own text formats. */
export function taskHistoryMoreMeta(
  closedVisible: number,
  closedTotal: number,
  historyChunk: number,
): TaskHistoryMoreMeta {
  const text = 'Load more done (showing ' + closedVisible + ' of ' + closedTotal + ')';
  const tip =
    'Reveal ' + Math.min(historyChunk, closedTotal - closedVisible) + ' more done/deferred tasks';
  return { text, tip };
}

/** The fields {@link probableTaskTitle} reads off each task entry. */
export interface ProbableTaskCandidate {
  readonly status: string;
  readonly title: string;
}

/** The title of the first workable (`queued`/`in_progress`) task, or `null`
 *  when none is workable — the live worker card's honest best guess at "what
 *  this firing is probably working" when no task carries an explicit focus
 *  lock. Tasks are assumed already priority-ordered (the board's own order),
 *  so the first match IS the queue head. */
export function probableTaskTitle(tasks: readonly ProbableTaskCandidate[]): string | null {
  for (const t of tasks) {
    if (t.status === 'queued' || t.status === 'in_progress') return t.title;
  }
  return null;
}

/** {@link moveTaskOrder}'s result: the full reordered id list plus the moved
 *  task's new 0-based position. */
export interface TaskMoveResult {
  readonly order: readonly string[];
  readonly toIndex: number;
}

/** Move `id` one slot up (`dir` -1) or down (`dir` 1) within `items` (task ids
 *  in on-page order) — the pure half of the ↑/↓ reorder buttons' "compute the
 *  new full order from the DOM, POST it" flow. Returns `null` when `id` isn't
 *  in `items` or the move would run off either end (nothing to commit then). */
export function moveTaskOrder(
  items: readonly string[],
  id: string,
  dir: -1 | 1,
): TaskMoveResult | null {
  const idx = items.indexOf(id);
  const to = idx + dir;
  if (idx < 0 || to < 0 || to >= items.length) return null;
  const order = items.slice();
  const moved = order[idx];
  if (moved === undefined) return null;
  order.splice(idx, 1);
  order.splice(to, 0, moved);
  return { order, toIndex: to };
}

/** One task row's DOM element — the subset {@link domTaskOrder} reads off
 *  each child to recover the on-page task order. */
export interface TaskOrderElement {
  readonly getAttribute: (name: string) => string | null;
}

/** The task list's DOM container — the subset {@link domTaskOrder} reads. */
export interface TaskOrderList {
  readonly children: ArrayLike<TaskOrderElement>;
}

/**
 * Reads the on-page task order straight off the DOM: each row's
 * `data-task-id`, in list order, skipping rows without one. Both the ↑/↓
 * reorder buttons and the pointer drag-reorder's `dragend` handler call this
 * right before computing the new order via {@link moveTaskOrder}, so the
 * commit always reflects whatever order the DOM actually ended up in.
 */
export function domTaskOrder(list: TaskOrderList): string[] {
  const items: string[] = [];
  for (let i = 0; i < list.children.length; i++) {
    const id = list.children[i]?.getAttribute('data-task-id');
    if (id) items.push(id);
  }
  return items;
}

/** {@link taskBurnLabel}'s input: a task's accumulated burn (mirrors
 *  `flight-metrics.ts`'s `TaskBurn` as a plain shape rather than an import —
 *  same reason every shared function in this epic stays import-free). */
export interface TaskBurnAmount {
  readonly slices: number;
  readonly cost: number;
  readonly wallMs: number;
}

/** {@link taskBurnLabel}'s result: the TASK BURN chip's visible text and its
 *  longer tooltip sentence. */
export interface TaskBurnLabel {
  readonly text: string;
  readonly tip: string;
}

/** The TASK BURN chip's text+tip for a task at least one firing has worked
 *  (`burn.slices > 0` — callers skip rendering the chip otherwise).
 *  `fmtCost`/`fmtDuration` are caller-injected rather than imported from
 *  `./format.ts`, the same `flightProgressOf`/`actMeta` pattern. */
export function taskBurnLabel(
  burn: TaskBurnAmount,
  fmtCost: (n: number) => string,
  fmtDuration: (ms: number) => string,
): TaskBurnLabel {
  let text = burn.slices + (burn.slices === 1 ? ' slice' : ' slices') + ' · ' + fmtCost(burn.cost);
  if (burn.wallMs > 0) text += ' · ' + fmtDuration(burn.wallMs);
  const tip =
    burn.slices +
    (burn.slices === 1 ? ' firing has' : ' firings have') +
    ' worked this task — ' +
    fmtCost(burn.cost) +
    ' total' +
    (burn.wallMs > 0 ? ', ' + fmtDuration(burn.wallMs) + ' wall time' : '');
  return { text, tip };
}

/** The TASK ECONOMICS runaway chip's tooltip sentence for a task
 *  (`t.isRunaway`) that has burned cost across many firings without ever
 *  closing. `fmtCost` is caller-injected, same reason as {@link
 *  taskBurnLabel}. */
export function taskRunawayTip(
  cumulativeCostUsd: number,
  firingCount: number,
  fmtCost: (n: number) => string,
): string {
  return (
    'This task has burned ' +
    fmtCost(cumulativeCostUsd) +
    ' across ' +
    firingCount +
    (firingCount === 1 ? ' firing' : ' firings') +
    ' without ever closing — TASK ECONOMICS flags it for your review.'
  );
}

/** Mirrors `flight/budget.ts`'s `FLY_MAX_TURNS` (120) — duplicated rather
 *  than imported for the same reason {@link STALE_TASK_DAYS} below is: this
 *  module compiles into the browser bundle (`shell.ts`'s `.toString()`
 *  embedding) and `flight/budget.ts` is Node-only. */
export const DEFAULT_FIRING_TURNS = 120;

/** ADAPTIVE TASK BUDGET (deaths cluster on under-budgeted epics): a task
 *  that has turn-capped before suggests the next firing needs headroom above
 *  {@link DEFAULT_FIRING_TURNS} — each prior turn-cap death bumps the
 *  suggestion by another 50%, since one bump clearing the cap once is weak
 *  evidence, but the SAME task capping out repeatedly is a task that keeps
 *  being handed too little runway for its real breadth. Returns `null` for a
 *  task that has never turn-capped — the default already fits it, so
 *  {@link taskBudgetSignalOf} (`flight-metrics.ts`)'s callers should render
 *  no chip at all rather than a redundant "budget: 120t" on every row. */
export function suggestedTurnBudget(turnCapped: number, defaultTurns: number): number | null {
  if (turnCapped <= 0) return null;
  return Math.round(defaultTurns * (1 + 0.5 * turnCapped));
}

/** The BUDGET RISK chip's tooltip sentence for a task {@link
 *  suggestedTurnBudget} flagged — mirrors {@link taskRunawayTip}'s shape. */
export function taskBudgetRiskTip(
  turnCapped: number,
  suggested: number,
  defaultTurns: number,
): string {
  return (
    'This task hit the ' +
    defaultTurns +
    '-turn cap ' +
    turnCapped +
    (turnCapped === 1 ? ' time' : ' times') +
    ' without finishing — try budgeting ~' +
    suggested +
    ' turns for the next firing.'
  );
}

/** The BUDGET RISK chip's tooltip sentence for a task that has never itself
 *  turn-capped but shares a dimension with one that has — {@link
 *  taskDimensionBudgetSignalOf} (`flight-metrics.ts`)'s breadth estimate,
 *  phrased around "similar work" rather than the task's own history like
 *  {@link taskBudgetRiskTip} is. */
export function taskDimensionBudgetRiskTip(
  dimension: string,
  turnCapped: number,
  suggested: number,
  defaultTurns: number,
): string {
  return (
    'Other ' +
    dimension +
    ' tasks hit the ' +
    defaultTurns +
    '-turn cap ' +
    turnCapped +
    (turnCapped === 1 ? ' time' : ' times') +
    ' — this looks like similar work, so try budgeting ~' +
    suggested +
    ' turns before you start.'
  );
}

/** A queued task sitting on the board this many days or longer earns a
 *  STALE chip — the UX-EXPRESSION half of TRIAGE V2's `stalenessDays`
 *  factor (`computeTriageFactors`, `flight/triage.ts`): the same model-free
 *  signal already feeding the post-flight ranking, now visible on the row
 *  itself instead of only inside the triage prompt (web-mssnofje-bboigi). */
export const STALE_TASK_DAYS = 14;

/** Days between `at` (a task's `created_at`) and `nowMs` — the same clamped
 *  floor-division {@link computeTriageFactors} uses server-side, duplicated
 *  here rather than imported: this module compiles into the browser bundle
 *  (`shell.ts`'s `.toString()` embedding, which carries only a function's
 *  own body — not module-level consts from its surrounding scope — so the
 *  day-in-ms literal has to live INSIDE the function) and `flight/triage.ts`
 *  is Node-only. */
export function taskStalenessDays(at: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - at) / (24 * 60 * 60 * 1000)));
}

/** The STALE chip's tooltip sentence for a queued task that has sat on the
 *  board {@link STALE_TASK_DAYS}+ days without closing — mirrors {@link
 *  taskRunawayTip}'s shape/precedent. */
export function taskStalenessTip(stalenessDays: number): string {
  return (
    'This task has sat on the board ' +
    stalenessDays +
    (stalenessDays === 1 ? ' day' : ' days') +
    ' without closing — TRIAGE factors staleness into its ranking.'
  );
}

/** {@link taskTitleTip}'s result: the task title span's hover/focus tip. */
export interface TaskTitleTip {
  readonly tip: string;
}

/** The task title span's own explain-itself tip — when the task was added,
 *  plus the operator's manual priority when one was set (app-wide
 *  interactivity audit v2 follow-up: the title was the last silent element
 *  on the row), plus a preview of the task's `body` when it carries one
 *  beyond the title (e.g. an INBOX note's full content — otherwise
 *  unrecoverable once the source file archives to the gitignored
 *  `INBOX/.triaged/`). `fmtAgo` is caller-injected rather than imported from
 *  `./format.ts`, the same {@link taskBurnLabel}/{@link taskRunawayTip}
 *  pattern. Takes no `title`: the span's own text content already gives it
 *  an accessible name, so the caller wires this tip in via aria-describedby
 *  rather than a title-prefixed aria-label duplicating it (D1 ATTRIBUTE
 *  PAYLOAD, epic 0015 — see 189137e0/f8779d15 for the same fix on other
 *  chips). */
export function taskTitleTip(
  at: number,
  priority: number | null | undefined,
  fmtAgo: (ts: number) => string,
  body?: string | null,
): TaskTitleTip {
  const hasPriority = priority !== null && priority !== undefined;
  const trimmedBody = body?.trim();
  // 240 is inlined rather than a named constant: this function's compiled
  // source is embedded into the client bundle verbatim via .toString()
  // (see web/shell.ts), so an outside identifier would be a ReferenceError
  // in the browser instead of a build-time error.
  const bodyPreview = trimmedBody ? ' — ' + trimmedBody.slice(0, 240) : '';
  const tip =
    'Added ' + fmtAgo(at) + (hasPriority ? ' · operator priority ' + priority : '') + bodyPreview;
  return { tip };
}

/** The ↑/↓ reorder buttons' "Move ... earlier/later (position X of Y)" tip
 *  (shared as both `data-tip` and `aria-label`) — `openIdx`/`openCount` come
 *  from {@link taskQueueCounts} and the row's own 1-based position among
 *  workable tasks. */
export function taskMoveTip(
  dir: 'up' | 'down',
  title: string,
  openIdx: number,
  openCount: number,
): string {
  return (
    'Move "' +
    title +
    '" ' +
    (dir === 'up' ? 'earlier' : 'later') +
    ' (position ' +
    openIdx +
    ' of ' +
    openCount +
    ')'
  );
}

/** The 🎯 focus toggle button's "Focus the autopilot on ..."/"Release focus
 *  from ..." tip (shared as both `data-tip` and `aria-label`) — flips wording
 *  based on whether the row's own task already carries the WIP-limit-1
 *  lock. */
export function taskFocusTip(title: string, focused: boolean): string {
  return (focused ? 'Release focus from' : 'Focus the autopilot on') + ' "' + title + '"';
}

/** The four terminal task-row action buttons {@link taskActionTip} covers —
 *  approve/reject a self-proposed task (`needs_approval` only) or mark an
 *  open task done/delete it. */
export type TaskActionKind = 'approve' | 'reject' | 'done' | 'delete';

/** Each action button's own "Verb ... task" tip (shared as both `data-tip`
 *  and `aria-label`) — `done` reads "Mark ... done" rather than "Done task
 *  ..." since that's how the row's own click handler already phrased it. */
export function taskActionTip(action: TaskActionKind, title: string): string {
  switch (action) {
    case 'approve':
      return 'Approve proposed task "' + title + '"';
    case 'reject':
      return 'Reject proposed task "' + title + '"';
    case 'done':
      return 'Mark "' + title + '" done';
    case 'delete':
      return 'Delete task "' + title + '"';
  }
}

/** One task-row attribute chip's `tipChip` argument tuple (text, tip,
 *  ariaLabel, extraClass) — `extraClass` is omitted when the chip has none,
 *  same convention `release-panel.ts`'s `ReleaseVersionItem` tuple uses. */
export type TaskChipItem = readonly [
  text: string,
  tip: string,
  ariaLabel: string,
  extraClass?: string,
];

/** The DIMENSION chip's `tipChip` args for a task's classified pool
 *  dimension — display label with underscores turned to spaces
 *  (`"human_interaction"` → `"human interaction"`), matching how every other
 *  `Dimension` label reads on the board. */
export function taskDimensionChip(dimension: string): TaskChipItem {
  const label = dimension.replaceAll('_', ' ');
  return [label, 'Dimension: the area this task lives in', 'Dimension: ' + label];
}

/** The SEVERITY chip's `tipChip` args for a task carrying a `severity` —
 *  text and `extraClass` are the raw value (`"sev-" + severity`), the
 *  aria-label prefixes it the same way every other attribute chip on this
 *  row does. */
export function taskSeverityChip(severity: string): TaskChipItem {
  return [
    severity,
    'Severity: how urgent this finding is — critical clears first, low last',
    'Severity: ' + severity,
    'sev-' + severity,
  ];
}

/** The recent-firings window {@link queueForecastMeta} extrapolates from —
 *  small enough to track current pace, big enough to smooth one odd firing. */
export const QUEUE_FORECAST_WINDOW = 20;

/** The fields {@link queueForecastMeta} reads off each flight-log entry
 *  (`c.flightLog`, newest first) — a plain shape rather than an import, same
 *  reason as {@link TaskBurnAmount}. */
export interface ForecastLogEntry {
  readonly cost: number;
  readonly completion: string | null;
}

/** {@link queueForecastMeta}'s result: the QUEUE FORECAST line's visible
 *  text and its honest-basis tooltip sentence. */
export interface QueueForecastMeta {
  readonly text: string;
  readonly tip: string;
}

/** The Tasks card's QUEUE FORECAST line (board web-msnsxugi-99uxhx): at the
 *  recent completion pace and $/firing, when does the open queue drain. The
 *  rate counts `completion === 'complete'` endings only — the one ending that
 *  CLOSES a task; a shipped "slice" advances a task but drains nothing, so a
 *  ship-rate forecast would overpromise. Null with an empty queue or no
 *  recorded firings (nothing honest to project); zero completions in the
 *  window degrades to an explicit "unknown" line rather than ∞ or a guess.
 *  `fmtCost` is caller-injected, same reason as {@link taskBurnLabel}. */
export function queueForecastMeta(
  openCount: number,
  log: readonly ForecastLogEntry[],
  fmtCost: (n: number) => string,
): QueueForecastMeta | null {
  if (openCount <= 0 || log.length === 0) return null;
  const recent = log.slice(0, QUEUE_FORECAST_WINDOW);
  let completes = 0;
  let cost = 0;
  for (const f of recent) {
    if (f.completion === 'complete') completes++;
    cost += f.cost;
  }
  const n = recent.length;
  const windowPhrase = 'the last ' + n + (n === 1 ? ' firing' : ' firings');
  const openPhrase = openCount + (openCount === 1 ? ' open task' : ' open tasks');
  if (completes === 0) {
    return {
      text: 'Queue drain: unknown — 0 tasks completed in ' + windowPhrase,
      tip:
        'Queue forecast: none of ' +
        windowPhrase +
        ' completed a task, so there is no honest completion rate to project ' +
        openPhrase +
        ' from. Slices advance tasks, but only a "complete" drains the queue.',
    };
  }
  const firings = Math.ceil(openCount / (completes / n));
  const avgCost = cost / n;
  const est = firings * avgCost;
  const firingsPhrase = firings + (firings === 1 ? ' firing' : ' firings');
  return {
    text: 'Queue drains in ~' + firingsPhrase + ' / ~' + fmtCost(est),
    tip:
      'Queue forecast: over ' +
      windowPhrase +
      ', ' +
      completes +
      (completes === 1 ? ' task' : ' tasks') +
      ' completed at ' +
      fmtCost(avgCost) +
      '/firing average, so ' +
      openPhrase +
      ' ≈ ' +
      firingsPhrase +
      ' ≈ ' +
      fmtCost(est) +
      '. A pace extrapolation, not a promise — task sizes vary, so this moves every firing.',
  };
}
