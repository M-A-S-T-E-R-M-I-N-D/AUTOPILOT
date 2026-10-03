// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * cockpit-baseline-doc — folds one `scripts/cockpit-metrics.mjs` run into the living
 * `docs/COCKPIT-BASELINE.md`, a fold that used to be done by hand from a fresh dated
 * `EVALUATION-<date>-cockpit-baseline.md` (three of them, 94.6% mutual overlap).
 *
 * The doc carries `<!-- COCKPIT:<name>:START/END -->` blocks. A TREND block is one table
 * whose rows are keyed by the cells before its `date` column (the axis; none for a
 * once-per-run table) plus the date: a run's row replaces the same key — a second run on
 * one day never duplicates — or lands after its group's last row. A CURRENT block is
 * rewritten whole. Nothing outside the blocks — the hand-written prose — is touched.
 * `staleBlocks` is the `--check` half, wall-clock axes (`NOISY_BLOCKS`) aside.
 */

export const BASELINE_DOC = 'docs/COCKPIT-BASELINE.md';

/** axe impact levels, in the order the axe trend table's columns list them. */
export const AXE_IMPACTS = ['critical', 'serious', 'moderate', 'minor'];

/** Alarm shape buckets, in the order the alarm trend table's columns list them. */
const ALARM_COLUMNS = ['critical', 'high', 'needsYou', 'medium', 'low'];

/** Literals the color-literals line names before counting the rest (the trend has totals). */
const LITERAL_LIST_CAP = 12;

/** Trend blocks measured in wall-clock time — written every run, never checked. */
export const NOISY_BLOCKS = new Set(['longest-task', 'interaction']);

const startMarker = (name) => `<!-- COCKPIT:${name}:START -->`;
const endMarker = (name) => `<!-- COCKPIT:${name}:END -->`;

/** The content between a block's markers, trimmed — null when the doc lacks the block. */
export function readBlock(text, name) {
  const start = text.indexOf(startMarker(name));
  const end = text.indexOf(endMarker(name));
  if (start < 0 || end < start) return null;
  return text.slice(start + startMarker(name).length, end).trim();
}

/** {@link readBlock}, throwing when the doc lacks the block — a run never drops a figure. */
function requireBlock(text, name) {
  const inner = readBlock(text, name);
  if (inner === null) throw new Error(`cockpit-baseline: ${BASELINE_DOC} has no ${name} block`);
  return inner;
}

/** `text` with the block's content replaced. A one-line `<!-- … -->` is a whole HTML
 *  block in CommonMark, so a table or paragraph may sit right against either marker. */
function writeBlock(text, name, inner) {
  requireBlock(text, name);
  const start = text.indexOf(startMarker(name)) + startMarker(name).length;
  return `${text.slice(0, start)}\n${inner}\n${text.slice(text.indexOf(endMarker(name)))}`;
}

/** One Markdown table row's cells (between its outer pipes), trimmed. */
export function tableCells(line) {
  const inner = line.trim().slice(1, -1);
  return inner.split('|').map((cell) => cell.trim());
}

/** A trend table split into its header lines and body rows, with the row keys. */
function parseTrend(table) {
  const [header, separator, ...body] = table.split('\n');
  const dateAt = tableCells(header).indexOf('date');
  if (dateAt < 0) throw new Error(`cockpit-baseline: trend table has no date column: ${header}`);
  const leading = (line, count) => tableCells(line).slice(0, count).join('|');
  const groupOf = (line) => leading(line, dateAt);
  const keyOf = (line) => leading(line, dateAt + 1);
  const sansDate = (line) => tableCells(line).toSpliced(dateAt, 1).join('|');
  const dateOf = (line) => tableCells(line)[dateAt];
  return { header, separator, body, groupOf, keyOf, sansDate, dateOf };
}

/** `table` with `rows` folded in: same group + date replaces, else after the group. */
export function upsertTrendRows(table, rows) {
  const { header, separator, body, groupOf, keyOf } = parseTrend(table);
  const merged = rows.reduce((lines, row) => {
    const same = lines.findIndex((line) => keyOf(line) === keyOf(row));
    if (same >= 0) return lines.with(same, row);
    const last = lines.findLastIndex((line) => groupOf(line) === groupOf(row));
    return lines.toSpliced(last < 0 ? lines.length : last + 1, 0, row);
  }, body);
  return [header, separator, ...merged].join('\n');
}

/** Every date any of the named trend blocks records, ascending. */
function trendDates(text, names) {
  const dates = names.flatMap((name) => {
    const { body, dateOf } = parseTrend(requireBlock(text, name));
    return body.map(dateOf);
  });
  return [...new Set(dates)].sort();
}

/** `text` with one run folded in — `fresh` as `renderBaselineBlocks` returns it. */
export function updateBaseline(text, fresh) {
  const trendNames = Object.keys(fresh.trends);
  const withTrends = Object.entries(fresh.trends).reduce(
    (doc, [name, rows]) => writeBlock(doc, name, upsertTrendRows(requireBlock(doc, name), rows)),
    text,
  );
  const withCurrent = Object.entries(fresh.current).reduce(
    (doc, [name, inner]) => writeBlock(doc, name, inner),
    withTrends,
  );
  const runs = trendDates(withCurrent, trendNames).map((date) => `**${date}**`);
  return writeBlock(withCurrent, 'runs', `Runs so far: ${runs.join(', ')}.`);
}

/** The blocks (`block:group` for a trend table's axis) whose latest recorded figures
 *  differ from `fresh` — empty when the doc already says what this run measured. */
export function staleBlocks(text, fresh) {
  const trendStale = Object.entries(fresh.trends)
    .filter(([name]) => !NOISY_BLOCKS.has(name))
    .flatMap(([name, rows]) => {
      const table = readBlock(text, name);
      if (table === null) return [name];
      const { body, groupOf, sansDate } = parseTrend(table);
      return rows
        .filter((row) => {
          const latest = body.findLast((line) => groupOf(line) === groupOf(row));
          return latest === undefined || sansDate(latest) !== sansDate(row);
        })
        .map((row) => (groupOf(row) === '' ? name : `${name}:${groupOf(row)}`));
    });
  const currentStale = Object.entries(fresh.current)
    .filter(([name, inner]) => readBlock(text, name) !== inner.trim())
    .map(([name]) => name);
  return [...trendStale, ...currentStale];
}

const row = (...cells) => `| ${cells.join(' | ')} |`;
const pair = (small, large) => `${small} → ${large}`;
const span = (axis) => pair(axis.smallN, axis.largeN);
const pct = (part, whole) => `${((part / whole) * 100).toFixed(1)}%`;
const ms = (value) => value.toFixed(2);

function i18nCell(side, pool) {
  const { tagged, untagged } = side[pool];
  const total = tagged + untagged;
  return `${tagged}/${total} (${total === 0 ? 'n/a' : pct(tagged, total)})`;
}

/** One row per axis (or per run) for every trend table, dated `date`. */
function renderTrends(date, r) {
  const perAxis = (axes, cellsOf) => axes.map((a) => row(a.label, date, span(a), ...cellsOf(a)));
  const { cssCensus: css, specificity: spec, tokenColorCensus: colors } = r;
  return {
    'dom-growth': perAxis(r.axes, (a) => [pair(a.smallNodes, a.largeNodes), a.perUnit.toFixed(1)]),
    axe: perAxis(r.axeAxes, (a) => AXE_IMPACTS.map((i) => pair(a.small[i], a.large[i]))),
    'tab-stops': perAxis(r.tabAxes, (a) => [
      pair(a.smallStops, a.largeStops),
      a.perUnit.toFixed(1),
    ]),
    'attribute-payload': perAxis(r.attrAxes, (a) => [
      pair(a.smallBytes, a.largeBytes),
      a.perUnit.toFixed(1),
    ]),
    'duplicate-renders': perAxis(r.dupAxes, (a) => [
      pair(a.smallMutations, a.largeMutations),
      a.perUnit.toFixed(1),
    ]),
    'longest-task': perAxis(r.longestTaskAxes, (a) => [
      pair(`${a.smallMs.toFixed(1)}ms`, `${a.largeMs.toFixed(1)}ms`),
    ]),
    'unique-values': [
      row(
        date,
        css.properties,
        css.declarations,
        css.uniqueValues,
        css.custom.declarations,
        css.custom.unique,
      ),
    ],
    specificity: [
      row(
        date,
        spec.selectors,
        spec.styleRules,
        `${spec.max.a},${spec.max.b},${spec.max.c}`,
        spec.idSelectors,
      ),
    ],
    'token-coverage': [
      row(
        date,
        colors.covered,
        colors.drifted.length,
        colors.uncovered.length,
        colors.keyword,
        colors.unparsed,
      ),
    ],
    alarm: perAxis(r.alarmAxes, (a) => [
      `${pair(a.small.alarmed, a.large.alarmed)} (${pair(pct(a.small.alarmed, a.small.total), pct(a.large.alarmed, a.large.total))})`,
      ...ALARM_COLUMNS.map((level) => pair(a.small.shape[level], a.large.shape[level])),
    ]),
    i18n: perAxis(r.i18nAxes, (a) =>
      ['text', 'aria', 'placeholder'].map((pool) =>
        pair(i18nCell(a.small, pool), i18nCell(a.large, pool)),
      ),
    ),
    interaction: perAxis(r.interactionAxes, (a) => [
      pair(a.small.interactions, a.large.interactions),
      pair(ms(a.small.inpP75), ms(a.large.inpP75)),
      pair(ms(a.small.inpMax), ms(a.large.inpMax)),
      pair(ms(a.small.longestTask), ms(a.large.longestTask)),
    ]),
  };
}

/** The figures only the latest run is shown for, each a whole block. */
function renderCurrent(r) {
  const top = r.cssCensus.top.map((p) => `\`${p.property}\` ${p.declarations}/${p.unique}`);
  const cellCount = r.contrast[0]?.cells.length ?? 0;
  const contrastRows = r.contrast.map((t) =>
    row(
      t.name,
      `${t.min.ratio.toFixed(2)} (\`${t.min.fg}\` on \`${t.min.bg}\`)`,
      t.belowNonText,
      t.nonTextOnly,
      t.textReady,
    ),
  );
  const literal = (d) => `\`${d.selector}\` (\`${d.property}: ${d.value}\`)`;
  const capped = (items) =>
    items.length > LITERAL_LIST_CAP
      ? [...items.slice(0, LITERAL_LIST_CAP), `${items.length - LITERAL_LIST_CAP} more`]
      : items;
  const drifted = capped(
    r.tokenColorCensus.drifted.map((d) => `${literal(d)} duplicates ${d.matches.join(', ')}`),
  );
  const uncovered = capped(r.tokenColorCensus.uncovered.map(literal));
  const selectors = Object.entries(r.alarmIndex).map(([level, list]) => `${level} ${list.length}`);
  return {
    'css-top': `Top ${top.length} properties by unique-value count in the latest run (declarations/unique values): ${top.join(', ')}.`,
    contrast: [
      `| theme | min ratio (pair) | below 3:1 | in [3, 4.5) | ≥ 4.5:1 (of ${cellCount} cells) |`,
      '| --- | --- | --- | --- | --- |',
      ...contrastRows,
    ].join('\n'),
    'color-literals': `Latest run — drifted: ${drifted.join('; ') || 'none'}. Uncovered: ${uncovered.join('; ') || 'none'}.`,
    'alarm-selectors': `Derived resting alarm selectors in the latest run: ${selectors.join(', ')}.`,
  };
}

/** Every block one run writes: `{ trends: { block: rows[] }, current: { block: text } }`. */
export function renderBaselineBlocks(date, results) {
  return { trends: renderTrends(date, results), current: renderCurrent(results) };
}
