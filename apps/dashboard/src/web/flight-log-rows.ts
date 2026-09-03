// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure flight-log row math — the slice-run grouping and the expanded row's
 * detail-sentence text — client-only (no server counterpart, unlike
 * `shared/*.ts`), so it lives in `web/` rather than `shared/` (epic 0002
 * "shell decomposition", slice 2: feature-module split of `shell.ts`),
 * following the same pattern `task-queue.ts`/`activity-log.ts` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** A flight-log entry {@link flightLogDisplayRows} groups by slice run. */
export interface FlightLogSliceEntry {
  readonly completion?: string | null;
  readonly item?: string | null;
}

/** A run of 2+ consecutive firings that all advanced the same open task —
 *  collapses to one expandable group row instead of repeating the task's
 *  title once per firing. */
export interface FlightLogGroupRow<T> {
  readonly isGroup: true;
  readonly item: string;
  readonly rows: readonly T[];
}

/** A single firing with no slice-run partner — renders its own row. */
export interface FlightLogSingleRow<T> {
  readonly isGroup: false;
  readonly row: T;
}

export type FlightLogDisplayRow<T> = FlightLogGroupRow<T> | FlightLogSingleRow<T>;

/** Walks a newest-first flight log and folds runs of 2+ consecutive
 *  `completion === 'slice'` entries sharing the same open task (`item`) into
 *  one group row; every other entry (including an isolated slice with no run
 *  partner) stays its own row (operator: "identical epic titles x15 read as
 *  duplication"). */
export function flightLogDisplayRows<T extends FlightLogSliceEntry>(
  log: readonly T[],
): FlightLogDisplayRow<T>[] {
  const rows: FlightLogDisplayRow<T>[] = [];
  let i = 0;
  while (i < log.length) {
    const first = log[i]!;
    let j = i + 1;
    if (first.completion === 'slice' && first.item) {
      while (j < log.length && log[j]!.completion === 'slice' && log[j]!.item === first.item) j++;
    }
    if (j - i > 1) {
      rows.push({ isGroup: true, item: first.item!, rows: log.slice(i, j) });
    } else {
      rows.push({ isGroup: false, row: first });
    }
    i = j;
  }
  return rows;
}

/** A grouped row's member firing — the shape {@link flightGroupSummary} needs
 *  from each slice in the run. */
export interface FlightGroupSummaryRow {
  readonly id: string;
  readonly cost?: number | null;
}

/** The open task a group row's slices advanced — only the title matters here. */
export interface FlightGroupSummaryTask {
  readonly title?: string | null;
}

/** The pure summary math behind a slice-run group row — task-title
 *  resolution (falls back to the raw task id if the task itself is gone),
 *  the total spend across every slice in the run, and the synthetic
 *  `groupId` the flight-row click delegation opens/closes by — that
 *  `flightGroupRow` previously computed inline before building any DOM.
 *  Takes `verdictOf` via injection rather than importing `flightVerdictOf`
 *  from `shell.ts`, the same `heatmapDays`/`actMeta` pattern every module in
 *  this epic uses. */
export function flightGroupSummary<T extends FlightGroupSummaryRow>(
  entry: FlightLogGroupRow<T>,
  taskById: Readonly<Record<string, FlightGroupSummaryTask | undefined>>,
  verdictOf: (row: T) => string,
): {
  readonly newest: T;
  readonly taskTitle: string;
  readonly totalCost: number;
  readonly groupId: string;
  readonly verdict: string;
  readonly headline: string;
} {
  const newest = entry.rows[0]!;
  const task = taskById[entry.item];
  const taskTitle = (task && task.title) || entry.item;
  let totalCost = 0;
  for (const row of entry.rows) totalCost += row.cost || 0;
  const groupId = 'group:' + entry.item + ':' + newest.id;
  const verdict = verdictOf(newest);
  const headline = taskTitle + ' — ' + entry.rows.length + ' slices';
  return { newest, taskTitle, totalCost, groupId, verdict, headline };
}

/** A flight-log entry's fields {@link flightDetailLine} reads to build the
 *  expanded row's detail sentence. */
export interface FlightDetailEntry {
  readonly kind?: string | null;
  readonly sha?: string | null;
  readonly turns?: number | null;
  readonly cost?: number | null;
  readonly failedCheck?: string | null;
  readonly model?: string | null;
}

/** The "slice of &lt;task&gt;" chip's text/tip/aria-label triple. */
export interface SliceChipMeta {
  readonly text: string;
  readonly tip: string;
  readonly ariaLabel: string;
}

/** The "slice of &lt;task&gt;" chip an isolated slice firing (no run partner
 *  to collapse into a group row) shows next to its own headline — the label
 *  truncates the task title at 40 chars, while the hover tip and aria-label
 *  both carry the full, untruncated title — that `flightLogNode` previously
 *  computed inline as a single ternary expression before calling `tipChip`.
 *  The 40-char cutoff stays a bare literal (mirrors `landingCommitFilesMeta`'s
 *  bare 8-file cutoff) rather than a module-level constant, since a constant
 *  outside the function body doesn't survive the `.toString()` splice into
 *  `fleetJs()` — only the function's own source text gets embedded. */
export function sliceChipMeta(taskTitle: string): SliceChipMeta {
  const truncated = taskTitle.length > 40 ? taskTitle.slice(0, 40) + '…' : taskTitle;
  return {
    text: 'slice of ' + truncated,
    tip: 'Part of a multi-firing task, still open: ' + taskTitle,
    ariaLabel: 'slice of ' + taskTitle,
  };
}

/** A flight-log row's derived text/tip/aria-label metadata — the verdict
 *  dot, headline chip, and (when present) the commit-sha chip that both
 *  `flightLogNode`'s own rows and `flightGroupRow`'s per-member rows render
 *  identically. No `itemAriaLabel` (D1 ATTRIBUTE PAYLOAD, epic 0015, board
 *  web-mtd1wmqc-v7h6cq): it used to duplicate `itemTip` verbatim, the exact
 *  class of duplication already fixed for the per-firing trace/flight-map/
 *  phase-rail/Activity headlines — the caller rides `itemTip` into an
 *  `aria-describedby`'d sr-only span instead of a second full-length
 *  attribute. */
export interface FlightLogRowMeta {
  readonly dotTip: string;
  readonly dotAriaLabel: string;
  readonly itemText: string;
  readonly itemTip: string;
  readonly shaText: string | null;
  readonly shaTip: string | null;
  readonly shaAriaLabel: string | null;
}

/** A single flight-log row's verdict-dot tip/aria-label, headline chip
 *  (truncated to 64 chars for display while the tip carries the full text),
 *  and commit-sha chip (`null` fields when the firing has no `sha`) — the
 *  exact math `flightLogNode`'s per-row loop and `flightGroupRow`'s
 *  per-member loop each computed inline and identically, a genuine
 *  duplication the same shape as the twenty-second through twenty-fourth
 *  cuts (indirect DOM-render coverage only, never a shared direct-unit-
 *  tested source of truth). */
export function flightLogRowMeta(
  headline: string,
  verdict: string,
  sha: string | null | undefined,
): FlightLogRowMeta {
  return {
    dotTip: 'How this firing ended: ' + verdict,
    dotAriaLabel: 'verdict: ' + verdict,
    itemText: headline.length > 64 ? headline.slice(0, 64) + '…' : headline,
    itemTip: headline,
    shaText: sha ? sha.slice(0, 7) : null,
    shaTip: sha ? 'Commit: ' + sha : null,
    shaAriaLabel: sha ? 'commit ' + sha : null,
  };
}

/** A slice-run group row's collapsed HEAD — verdict dot, headline chip, total
 *  cost, and relative timestamp — tip/aria-label metadata. */
export interface FlightGroupHeadMeta {
  readonly dotTip: string;
  readonly dotAriaLabel: string;
  readonly itemTip: string;
  readonly itemAriaLabel: string;
  readonly costTip: string;
  readonly costAriaLabel: string;
  readonly agoTip: string;
  readonly agoAriaLabel: string;
}

/** The slice-run group row's collapsed HEAD's verdict-dot/headline/cost/
 *  relative-timestamp tip+aria-label text — the exact math `flightGroupRow`
 *  previously computed inline across four `setAttribute` pairs before
 *  appending each span, distinct from {@link flightLogRowMeta} above, which
 *  covers the group's expanded MEMBER rows only (the head summarizes across
 *  every slice in the run — "N firings advanced ... total $X" — while each
 *  member describes just its own slice). Takes `fmtCost`/`fmtAgo` via
 *  injection, the same `flightDetailLine` pattern used one function below. */
export function flightGroupHeadMeta(
  verdict: string,
  rowsCount: number,
  taskTitle: string,
  totalCost: number,
  headline: string,
  newestAt: number,
  fmtCost: (n: number) => string,
  fmtAgo: (at: number) => string,
): FlightGroupHeadMeta {
  return {
    dotTip: 'Most recent slice ended: ' + verdict,
    dotAriaLabel: 'verdict: ' + verdict,
    itemTip:
      rowsCount + ' firings advanced "' + taskTitle + '", still open — total ' + fmtCost(totalCost),
    itemAriaLabel: headline,
    costTip: 'Total spend across all ' + rowsCount + ' slices',
    costAriaLabel: 'total cost: ' + fmtCost(totalCost),
    agoTip: 'When the most recent slice happened',
    agoAriaLabel: 'happened ' + fmtAgo(newestAt),
  };
}

/** A flight-log row's cost/relative-timestamp chip tip+aria-label pair. */
export interface FlightCostAgoMeta {
  readonly costTip: string;
  readonly costAriaLabel: string;
  /** Cost semantics v3 (epic 0013) — the real-cost chip's visible text, null
   *  when `realCostUsd` wasn't given/is null (unconfigured or predating
   *  tracking), so the caller skips rendering that chip entirely, same as
   *  {@link FlightSummaryLineMeta}'s `closedText` null-skip pattern. */
  readonly realCostText: string | null;
  readonly realCostTip: string | null;
  readonly realCostAriaLabel: string | null;
  readonly agoTip: string;
  readonly agoAriaLabel: string;
}

/** The `flight-cost`/`flight-ago` chip pair's tip+aria-label metadata that
 *  `flightGroupRow`'s per-member loop ("Spend for this slice" / "When this
 *  slice happened") and `flightLogNode`'s own per-row loop ("Total spend for
 *  this firing" / "When this firing happened") each hand-typed independently
 *  — identical `'cost: ' + fmtCost(...)` / `'happened ' + fmtAgo(...)`
 *  aria-label formula in both, differing only in the caller-supplied tip
 *  wording, the same drift-prone shape `flightBarMeta`'s doc comment already
 *  warned about elsewhere in this file. `costTip`/`agoTip` are caller-supplied
 *  rather than derived here since each call site's wording differs ("slice"
 *  vs "firing"), the same split `flightDetailLine`'s own bits array leaves to
 *  its caller for anything scope-specific. Takes `fmtCost`/`fmtAgo` via
 *  injection, the same `flightGroupHeadMeta` pattern. `realCostUsd` (cost
 *  semantics v3, epic 0013 slice 3) is surfaced NEXT TO `cost`, never in
 *  place of it — an operator on a flat-rate subscription sees both the
 *  API list-price and its real, subscription-apportioned share. */
export function flightCostAgoMeta(
  costTip: string,
  agoTip: string,
  cost: number,
  at: number,
  fmtCost: (n: number) => string,
  fmtAgo: (at: number) => string,
  realCostUsd?: number | null,
): FlightCostAgoMeta {
  const realCostText = typeof realCostUsd === 'number' ? 'real ' + fmtCost(realCostUsd) : null;
  return {
    costTip,
    costAriaLabel: 'cost: ' + fmtCost(cost),
    realCostText,
    realCostTip: realCostText
      ? 'Real cost: this spend apportioned by your subscription share, not API list-price'
      : null,
    realCostAriaLabel: realCostText ? 'real cost: ' + fmtCost(realCostUsd as number) : null,
    agoTip,
    agoAriaLabel: 'happened ' + fmtAgo(at),
  };
}

/** The "Show all (N)"/"Show fewer" toggle button's visible text and its
 *  matching tip/aria-label pair. */
export interface FlightLogMoreMeta {
  readonly text: string;
  readonly tip: string;
}

/** The flight log's "Show all (N)"/"Show fewer" toggle button's text+tip —
 *  only rendered once `totalCount` exceeds `compactRows` — that
 *  `flightLogNode` previously computed inline as two parallel ternaries
 *  before setting `.textContent`/`data-tip`/`aria-label`. `compactRows` is
 *  caller-injected rather than imported as a constant: this module compiles
 *  into the browser bundle (`shell.ts`'s `.toString()` embedding, which
 *  carries only a function's own body — not module-level consts from its
 *  surrounding scope), the same reason {@link taskStalenessDays} in
 *  `task-queue.ts` takes its day-in-ms literal inline instead. */
export function flightLogMoreMeta(
  isOpen: boolean,
  totalCount: number,
  compactRows: number,
): FlightLogMoreMeta {
  if (isOpen) {
    return {
      text: 'Show fewer',
      tip: 'Collapse back to the most recent ' + compactRows + ' firings',
    };
  }
  return {
    text: 'Show all (' + totalCount + ')',
    tip:
      'Reveal all ' + totalCount + ' locally-held firings, not just the most recent ' + compactRows,
  };
}

/** The expanded flight-log row's detail sentence — verdict, kind, sha, turns,
 *  cost, model (when recorded — MODEL MIX, backlog web-mssn106m-bqvxi8, first
 *  slice: the model is already written per-firing but never left the store
 *  layer), plus a verdict-specific caveat clause explaining WHY a reverted/
 *  checkpointed/turn-capped/timed-out/errored/unverified firing ended the way it did —
 *  that `flightLogNode` previously built inline before writing it to the
 *  open row's `.textContent`. Takes `fmtCost` via injection (mirrors
 *  `flightProgressOf`'s own fmtCost param) rather than importing it from
 *  `./format.ts`, same reason every module in this epic stays import-free. */
export function flightDetailLine(
  f: FlightDetailEntry,
  verdict: string,
  fmtCost: (n: number) => string,
): string {
  const bits: (string | null)[] = [
    verdict,
    f.kind || null,
    f.sha || null,
    (f.turns || 0) + ' turns',
    fmtCost(f.cost || 0),
    f.model || null,
  ];
  if (verdict === 'reverted' && f.failedCheck) bits.push(f.failedCheck + ' failed');
  if (verdict === 'checkpointed') {
    bits.push(
      'hit the turn cap mid-unit — WIP packed into a checkpoint commit, next firing resumes it',
    );
  }
  if (verdict === 'turn-capped') bits.push('hit the per-firing turn ceiling mid-work');
  if (verdict === 'timed-out') bits.push('killed by the CLI wall-clock cap before any commit');
  if (verdict === 'errored') bits.push('CLI exited in error before any commit');
  if (verdict === 'unverified') {
    bits.push(
      f.failedCheck
        ? f.failedCheck + ' crashed before it could judge the work — commit left in place'
        : 'the gate crashed before it could judge the work — commit left in place',
    );
  }
  return bits.filter(Boolean).join(' · ');
}
