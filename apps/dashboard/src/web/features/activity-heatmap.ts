// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's "Firing activity" contribution heatmap — a whole
 * bundle-composing assembler function extracted out of `shell.ts`'s
 * `fleetJs()` into its own file under `web/features/` (epic 0002 "shell
 * decomposition", PARALLEL UNLOCK B — see
 * docs/epics/0002-shell-decomposition.md, and `web/features/round-panel.ts`
 * for a prior extraction of this shape). `web/shell.ts`'s `clientJs()` calls
 * it indirectly through `featureModulesJs()`, so its return value — not its
 * compiled source — is what lands in the served bundle text; moving the
 * function itself (not splicing it) is therefore zero behavior change.
 * `discoverFeatureModules('web/features')` finds this file's
 * `activityHeatmapJs` export the same way it already finds
 * `round-panel.ts`'s. Like `round-panel.ts`, this one still carries real
 * relative-import splices of its own — the `web/heatmap.ts` constants and
 * pure helpers, embedded via `JSON.stringify()`/`.toString()` — now resolved
 * relative to this file instead of `shell.ts`. Like `tour.ts`/
 * `flight-console.ts`, it keeps its own module-level state
 * (`heatRovingIndex`, the roving-tabindex position) and its own delegated
 * keydown/focusin handlers, with no read of `lastFleetState` or any other
 * fleet-wide mutable state `fleetJs()` owns.
 *
 * `contributionHeatmap(c)` (declared below) is called from `fleetJs()`'s
 * `renderProjectPage()` — a call site that stays a bare, unimported
 * identifier reference in `fleetJs()`'s own served text. That works because
 * the served bundle is a concatenated non-module script sharing one global
 * scope: `contributionHeatmap` is a hoisted `function` declaration, and by
 * the time `renderProjectPage()` actually calls it (only once a project page
 * renders its first `/api/state` response, well after this module's script
 * has already run), it is defined in the same shared top-level scope — the
 * same way `round-panel.ts`'s `roundSection` call site already relies on.
 * `el` and `flightVerdictOf`, called by name below, hoist the same way from
 * `fleetJs()`'s own text (`flightVerdictOf` stays spliced in `shell.ts`
 * because `fleetJs()`'s flight rows and log rows still use it too — the
 * same shared-helper-stays-put shape `issue-triage.ts`'s
 * `decisionItemHeadMeta` call already proved).
 */
import {
  HEATMAP_WEEKS,
  HEATMAP_DAY_MS,
  heatDayKey as sharedHeatDayKey,
  heatDayStart as sharedHeatDayStart,
  heatmapDays as sharedHeatmapDays,
  heatClass as sharedHeatClass,
  heatLabel as sharedHeatLabel,
  heatCellPos as sharedHeatCellPos,
  heatTip as sharedHeatTip,
} from '../heatmap.js';

/** The contribution-heatmap client — vanilla, external (keeps CSP script-src 'self'). */
export function activityHeatmapJs(): string {
  return `
// GitHub-style contribution calendar for a project's flightLog: one cell per
// day over a trailing fixed window (independent of when the project started,
// same as GitHub's own graph), green when a day shipped, red when a day had
// a real death (reverted/turn-capped/errored) — deaths win the cell color
// over ships so a bad day never hides behind an earlier good one.
// HEATMAP_WEEKS/HEATMAP_DAY_MS and heatDayKey/heatDayStart/heatmapDays/
// heatClass/heatLabel/heatCellPos/heatTip are generated FROM web/heatmap.ts
// below (epic 0002 "shell decomposition", slice 2) — their real
// values/compiled source via JSON.stringify()/.toString(), not a
// hand-retyped copy. They can no longer drift apart.
var HEATMAP_WEEKS = ${JSON.stringify(HEATMAP_WEEKS)};
var HEATMAP_DAY_MS = ${JSON.stringify(HEATMAP_DAY_MS)};
${sharedHeatDayKey.toString()}
${sharedHeatDayStart.toString()}
${sharedHeatmapDays.toString()}
${sharedHeatClass.toString()}
${sharedHeatLabel.toString()}
${sharedHeatCellPos.toString()}
${sharedHeatTip.toString()}
// D1 TAB-STOP ROVING (board web-mtd1wyte-ssntzi): the heatmap rendered up to
// 140 day cells EACH as a Tab stop — the single worst per-cell offender on
// the project page. One roving stop instead (APG roving-tabindex, same
// technique as the #live-workers strip); arrows walk the grid. -1 means
// "not moved yet": the first render lands the stop on TODAY's cell — a
// 20-week-old day is a useless entry point. Survives SSE re-renders because
// the index lives at module scope and each render re-applies it.
var heatRovingIndex = -1;
function contributionHeatmap(c) {
  var log = c.flightLog || [];
  var counts = c.dayCounts || [];
  if (!log.length && !counts.length) return null;
  var days = heatmapDays(log, Date.now(), HEATMAP_WEEKS, counts, flightVerdictOf);
  if (heatRovingIndex < 0 || heatRovingIndex >= days.length) heatRovingIndex = days.length - 1;
  var cell = 11, gap = 3, cols = HEATMAP_WEEKS, rows = 7;
  var W = cols * (cell + gap) - gap, H = rows * (cell + gap) - gap;
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('class', 'heatmap-grid');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Firing activity over the last ' + cols + ' weeks — green days shipped, red days had a death');
  for (var i = 0; i < days.length; i++) {
    var day = days[i];
    var pos = heatCellPos(i, cell, gap, rows);
    var rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(pos.x));
    rect.setAttribute('y', String(pos.y));
    rect.setAttribute('width', String(cell));
    rect.setAttribute('height', String(cell));
    rect.setAttribute('rx', '2');
    rect.setAttribute('class', 'heat-cell ' + heatClass(day));
    rect.setAttribute('data-day', day.key);
    rect.setAttribute('tabindex', i === heatRovingIndex ? '0' : '-1');
    rect.setAttribute('role', 'img');
    var label = heatTip(day);
    rect.setAttribute('aria-label', label);
    rect.setAttribute('data-tip', label);
    svg.appendChild(rect);
  }
  var wrap = el('div', 'heatmap-wrap');
  var heatmapH = el('h2', 'detail-h', 'Firing activity');
  heatmapH.setAttribute('data-i18n', 'firingActivity');
  wrap.appendChild(heatmapH);
  wrap.appendChild(svg);
  wrap.appendChild(el('p', 'heatmap-legend muted', 'green = shipped · red = died · gray = other activity'));
  return wrap;
}
// Roving-tabindex keyboard support for the heatmap grid above. Cells run in
// CHRONOLOGICAL order down each week's column (Sun→Sat), so Up/Down is ±1 day
// and Left/Right is ±7 — the same weekday one week over, matching the visual
// column-per-week layout. Rim moves clamp to the grid's first/last day rather
// than walking off. Delegated on document (the grid is rebuilt wholesale on
// every SSE re-render, so per-cell listeners would need re-attaching).
document.addEventListener('keydown', function (e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Home' && e.key !== 'End') return;
  var cellEl = e.target && e.target.closest && e.target.closest('.heat-cell');
  if (!cellEl) return;
  var grid = cellEl.closest('.heatmap-grid');
  if (!grid) return;
  var cells = Array.prototype.slice.call(grid.querySelectorAll('.heat-cell'));
  var i = cells.indexOf(cellEl);
  if (i < 0) return;
  var next = i;
  if (e.key === 'ArrowUp') next = i - 1;
  else if (e.key === 'ArrowDown') next = i + 1;
  else if (e.key === 'ArrowLeft') next = i - 7;
  else if (e.key === 'ArrowRight') next = i + 7;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = cells.length - 1;
  next = Math.max(0, Math.min(cells.length - 1, next));
  if (next === i) return;
  e.preventDefault();
  cellEl.setAttribute('tabindex', '-1');
  cells[next].setAttribute('tabindex', '0');
  if (cells[next].focus) cells[next].focus();
  heatRovingIndex = next;
});
// Mouse/programmatic focus also moves the roving tab stop (APG roving-
// tabindex recommendation) so Tabbing away and back lands where the user
// last was, not always back on today's cell.
document.addEventListener('focusin', function (e) {
  var cellEl = e.target && e.target.closest && e.target.closest('.heat-cell');
  if (!cellEl) return;
  var grid = cellEl.closest('.heatmap-grid');
  if (!grid) return;
  var cells = Array.prototype.slice.call(grid.querySelectorAll('.heat-cell'));
  var i = cells.indexOf(cellEl);
  if (i < 0 || i === heatRovingIndex) return;
  for (var j = 0; j < cells.length; j++) cells[j].setAttribute('tabindex', j === i ? '0' : '-1');
  heatRovingIndex = i;
});
`.trim();
}
