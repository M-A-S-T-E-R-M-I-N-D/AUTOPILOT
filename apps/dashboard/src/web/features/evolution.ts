// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's "is the agent improving?" evolution cluster — the
 * operator-evaluation trend bar chart (`evaluationTrendPanel`) and the
 * evolution stat-tile summary (`evolutionSection`), a whole bundle-composing
 * assembler function extracted out of `shell.ts`'s `fleetJs()` into its own
 * file under `web/features/` (epic 0002 "shell decomposition", SHELL HUB
 * RELIEF — see docs/epics/0002-shell-decomposition.md, and
 * `web/features/process-health.ts` for the prior whole-cluster extraction of
 * this shape). The process-health cut's own doc comment flagged this as its
 * deferred follow-on: both panels read the same
 * `evaluationTrendWeeks`/`evaluationTrendSummary` window math off
 * `c.evaluationLabelDayCounts`, so they move together rather than splitting
 * the shared splices across two files (no splice in this epic is duplicated
 * across two files — the same rule the issue-triage cut's
 * `decisionItemHeadMeta` relocation already followed).
 * `web/shell.ts`'s `clientJs()` calls them indirectly through
 * `featureModulesJs()`, so the return value — not this file's compiled
 * source — is what lands in the served `/app.js` text; moving the functions
 * (not splicing them) is therefore zero behavior change.
 * `discoverFeatureModules('web/features')` finds this file's `evolutionJs`
 * export the same way it already finds `process-health.ts`'s
 * `processHealthJs`. Like `process-health.ts`, this file still carries real
 * relative-import splices of its own — `EVAL_TREND_WEEKS`/
 * `EVAL_TREND_DAY_MS`/`EVAL_TREND_WEEK_MS`/`EVAL_TREND_FLAT_BAND`/
 * `evalDayTs`/`evalDayKey`/`evalWeekStart`/`evaluationTrendWeeks`/
 * `evaluationTrendSummary`/`evaluationTrendWeekTip`/`evaluationTrendLabel`
 * (from `web/evaluation-trend.ts`) and `evaluationTrendTileItems` (from
 * `web/stat-tiles.ts`), embedded via `.toString()`/`JSON.stringify()` — now
 * resolved relative to this file instead of `shell.ts`. Neither panel keeps
 * any module-level state: every render reads only the passed project card
 * `c`, with no `pid`-keyed map surviving between renders and no execute
 * click handler of its own.
 *
 * `evaluationTrendPanel(c)`/`evolutionSection(c)` (declared below) are each
 * called from `fleetJs()`'s `renderProjectPage()` — call sites that stay
 * bare, unimported identifier references in `fleetJs()`'s own served text.
 * That works because the served bundle is one concatenated non-module script
 * (`clientJs()` = `fleetJs()` + `featureModulesJs()`): each is a hoisted
 * `function` declaration, and by the time `renderProjectPage()` actually
 * calls them (only once a project page is opened, well after the whole
 * script has already run once), every feature module's functions — these two
 * included — are already defined in the same shared top-level scope, the
 * same way `process-health.ts`'s three section calls already rely on. `el`/
 * `statTile` (which stays inline in `fleetJs()`, shared with
 * `renderStatTiles` and the process-health cluster), called by name inside
 * `evolutionSection`, hoist the same way from `fleetJs()`'s own top-level
 * declarations.
 */
import {
  EVAL_TREND_WEEKS,
  EVAL_TREND_DAY_MS,
  EVAL_TREND_WEEK_MS,
  EVAL_TREND_FLAT_BAND,
  evalDayTs,
  evalDayKey,
  evalWeekStart,
  evaluationTrendWeeks,
  evaluationTrendSummary,
  evaluationTrendWeekTip,
  evaluationTrendLabel,
} from '../evaluation-trend.js';
import { evaluationTrendTileItems } from '../stat-tiles.js';

/** The evolution cluster client — vanilla, external (keeps CSP script-src 'self'). */
export function evolutionJs(): string {
  return `
// EVAL_TREND_WEEKS/evaluationTrendWeeks/evaluationTrendSummary/
// evaluationTrendWeekTip/evaluationTrendLabel are generated FROM
// web/evaluation-trend.ts below (epic 0002 "shell decomposition", backlog
// item J checkbox 5) — their real compiled source via .toString(), not a
// hand-retyped copy. They can no longer drift apart.
var EVAL_TREND_WEEKS = ${JSON.stringify(EVAL_TREND_WEEKS)};
var EVAL_TREND_DAY_MS = ${JSON.stringify(EVAL_TREND_DAY_MS)};
var EVAL_TREND_WEEK_MS = ${JSON.stringify(EVAL_TREND_WEEK_MS)};
var EVAL_TREND_FLAT_BAND = ${JSON.stringify(EVAL_TREND_FLAT_BAND)};
${evalDayTs.toString()}
${evalDayKey.toString()}
${evalWeekStart.toString()}
${evaluationTrendWeeks.toString()}
${evaluationTrendSummary.toString()}
${evaluationTrendWeekTip.toString()}
${evaluationTrendLabel.toString()}
// Evolution view: "is the agent improving?" — weekly operator approve/reject
// verdict rate on the agent's own proposed work, trailing EVAL_TREND_WEEKS
// weeks. A verdict-free week renders as a gap (the empty class), never a
// fake 0% bar, mirroring the heatmap's heat-empty convention.
function evaluationTrendPanel(c) {
  var dayCounts = c.evaluationLabelDayCounts || [];
  var weeks = evaluationTrendWeeks(dayCounts, Date.now());
  var summary = evaluationTrendSummary(weeks);
  if (summary.approved + summary.rejected === 0) return null; // no operator verdicts recorded yet
  var cell = 12, gap = 3, cols = weeks.length, H = 40;
  var W = cols * (cell + gap) - gap;
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('class', 'eval-trend-grid');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Operator approval over the last ' + EVAL_TREND_WEEKS + ' weeks — ' + evaluationTrendLabel(summary));
  for (var i = 0; i < weeks.length; i++) {
    var w = weeks[i];
    var x = i * (cell + gap);
    var rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('width', String(cell));
    rect.setAttribute('rx', '2');
    // Roving tabindex (D1 TAB-STOP ROVING follow-on): only the first week
    // cell is a Tab stop, not one per week — the same fix already shipped
    // for the fleet-card gauge, language bar, task-row chips, and the
    // flight timeline strip. wireRoving() below (shared helper defined in
    // web/shell.ts, in scope here since clientJs() concatenates fleetJs()
    // before featureModulesJs()) moves the stop.
    rect.setAttribute('tabindex', i === 0 ? '0' : '-1');
    rect.setAttribute('role', 'img');
    rect.setAttribute('data-week', w.key);
    var label;
    if (w.rate === null) {
      // No verdicts this week: a flat baseline marker, not a fake 0% bar.
      rect.setAttribute('y', String(H - 2));
      rect.setAttribute('height', '2');
      rect.setAttribute('class', 'eval-trend-empty');
      label = w.key + ': no operator verdicts';
    } else {
      // Colored by majority verdict (eval-approve/eval-reject, layout-css.ts)
      // so a bad week reads as red at a glance, not just a shorter green bar.
      var barH = Math.max(2, w.rate * H);
      rect.setAttribute('y', String(H - barH));
      rect.setAttribute('height', String(barH));
      rect.setAttribute('class', 'eval-trend-bar ' + (w.rate >= 0.5 ? 'eval-approve' : 'eval-reject'));
      label = evaluationTrendWeekTip(w);
    }
    rect.setAttribute('aria-label', label);
    rect.setAttribute('data-tip', label);
    svg.appendChild(rect);
  }
  var wrap = el('div', 'eval-trend-wrap');
  wrap.appendChild(el('h2', 'detail-h', 'Evolution — is the agent improving?'));
  wrap.appendChild(svg);
  wrap.appendChild(el('p', 'eval-trend-legend muted', evaluationTrendLabel(summary)));
  return wrap;
}
wireRoving('.eval-trend-grid rect[data-week]', '.eval-trend-grid');
// evaluationTrendTileItems is generated FROM web/stat-tiles.ts below (epic
// 0002 "shell decomposition", backlog item J checkbox 5) — its real compiled
// source via .toString(), not a hand-retyped copy. It can no longer drift
// apart. EVAL_TREND_WEEKS is spliced as a bare value above (the same shape
// OFFICE_W uses in web/office-map.ts): evaluationTrendTileItems's own
// .toString()'d body references it by name directly.
${evaluationTrendTileItems.toString()}
// Evolution panel (backlog item J checkbox 5, "is the agent improving?"):
// buckets this project's own evaluationLabelDayCounts (store-side, every
// task approve/reject and SOUL ratify/unratify/dismiss) into the trailing
// EVAL_TREND_WEEKS-week window and renders the approval-rate trend — this
// only computes/renders it, the data plane already existed
// (read/source.ts's ProjectAggregate.evaluationLabelDayCounts) with no panel
// reading it yet. Hidden until at least one operator verdict has ever been
// recorded, same precedent as doraSection/gateParallelSection/
// warmSessionsSection (web/features/process-health.ts). renderProjectPage()
// renders this immediately after evaluationTrendPanel's own chart (UX
// weakness sweep cut 3/3, epic 0015, board web-mtju8ekq-dlpe9n) — the two
// panels summarize the exact same approval-rate numbers, one as a per-week
// chart, this one as at-a-glance tiles, so a heading that just repeated
// "Evolution" back-to-back read as an accidental duplicate rather than the
// chart's own companion row.
function evolutionSection(c) {
  var weeks = evaluationTrendWeeks(c.evaluationLabelDayCounts, Date.now(), EVAL_TREND_WEEKS);
  var summary = evaluationTrendSummary(weeks);
  if (summary.approved === 0 && summary.rejected === 0) return null;
  var wrap = el('section', 'evolution-panel');
  wrap.appendChild(el('h3', 'evolution-title', '🧬 Approval summary'));
  var grid = el('div', 'stat-tiles');
  grid.id = 'evolution-tiles';
  var items = evaluationTrendTileItems(summary, EVAL_TREND_WEEKS);
  for (var i = 0; i < items.length; i++) grid.appendChild(statTile(items[i][0], items[i][1], items[i][2]));
  // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): one Tab
  // stop per grid; wireRoving('.stat-tiles .stat-tile', ...) in web/shell.ts
  // moves it.
  seedRoving(grid, '.stat-tile');
  wrap.appendChild(grid);
  return wrap;
}
`.trim();
}
