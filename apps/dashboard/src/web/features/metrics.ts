// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's Metrics detail-panel cluster — the per-project cost
 * sparkline (`costSparkline`), the flight timeline strip (`flightTimelineStrip`),
 * and the metrics section that composes both alongside the stat row and model
 * mix (`metricsSection`), a whole bundle-composing assembler function
 * extracted out of `shell.ts`'s `fleetJs()` into its own file under
 * `web/features/` (epic 0002 "shell decomposition", SHELL HUB RELIEF — see
 * docs/epics/0002-shell-decomposition.md, and `web/features/evolution.ts` for
 * the prior cluster extraction of this shape). `costSparkline` and
 * `flightTimelineStrip` are called from nowhere else in `shell.ts` — both
 * exist solely to be assembled into `metricsSection`'s "Metrics" detail
 * panel — so all three move together rather than splitting the shared
 * splices across two files (no splice in this epic is duplicated across two
 * files, the same rule the evolution cut's own comment already followed).
 * `web/shell.ts`'s `clientJs()` calls them indirectly through
 * `featureModulesJs()`, so the return value — not this file's compiled
 * source — is what lands in the served `/app.js` text; moving the functions
 * (not splicing them) is therefore zero behavior change.
 * `discoverFeatureModules('web/features')` finds this file's `metricsJs`
 * export the same way it already finds `evolution.ts`'s `evolutionJs`. Like
 * `evolution.ts`, this file still carries real relative-import splices of its
 * own — `timelineSegments` (from `web/timeline-strip.ts`) and
 * `metricsStatItems`/`modelMixItems`/`modelMixChipMeta` (from
 * `web/stat-tiles.ts`), embedded via `.toString()` — now resolved relative to
 * this file instead of `shell.ts`. None of these functions keeps any
 * module-level state: every render reads only the passed project card `c` (or
 * its own `log`/`tasks`/`pid` arguments), with no `pid`-keyed map surviving
 * between renders and no execute click handler of its own.
 * `svgNode`/`sparkBars`/`metricSparkline`/`flightBarMeta`/`taskMap`/
 * `flightHeadlineOf`/`el`/`tipChip`/`stat`/`fmtCost`/`fmtTokens` all stay
 * inline in `fleetJs()` — `metricSparkline`/`flightBarMeta`/`svgNode`/
 * `sparkBars`/`taskMap`/`flightHeadlineOf` are shared with the four
 * fleet-wide stat-tile sparklines (`fleetCostSpark`/`fleetTurnsSpark`/
 * `fleetFormSpark`/`fleetCacheSpark`) that stay behind, so moving them here
 * too would duplicate them across two files instead of sharing one; `el`/
 * `tipChip`/`stat`/`fmtCost`/`fmtTokens` are broadly shared DOM/format
 * primitives used well beyond this cluster. Called by name inside these
 * functions, they hoist the same way `evolution.ts`'s `el`/`statTile`
 * references already rely on.
 *
 * `metricsSection(c)` (declared below, alongside its two private helpers) is
 * called from `fleetJs()`'s `metricsDetailNode(c)` wrapper — a call site that
 * stays a bare, unimported identifier reference in `fleetJs()`'s own served
 * text. That works because the served bundle is one concatenated non-module
 * script (`clientJs()` = `fleetJs()` + `featureModulesJs()`): each is a
 * hoisted `function` declaration, and by the time `metricsDetailNode()`
 * actually calls it (only once a project page's Details panel renders, well
 * after the whole script has already run once), every feature module's
 * functions — `metricsSection` included — are already defined in the same
 * shared top-level scope, the same way `evolution.ts`'s `evolutionSection`
 * call site already relies on.
 */
import { timelineSegments } from '../timeline-strip.js';
import { metricsStatItems, modelMixItems, modelMixChipMeta } from '../stat-tiles.js';

/** The Metrics detail-panel cluster client — vanilla, external (keeps CSP script-src 'self'). */
export function metricsJs(): string {
  return `
// costSparkline is one of the fleet-wide sparkline shapes
// (svgNode/sparkBars/metricSparkline/flightBarMeta/taskMap/flightHeadlineOf
// stay inline in fleetJs(), shared with fleetCostSpark/fleetTurnsSpark/
// fleetFormSpark/fleetCacheSpark) — this is the per-PROJECT cost trend the
// Metrics detail panel renders, called by name as a hoisted bundle
// identifier.
function costSparkline(log, tasks) {
  return metricSparkline(
    log,
    tasks,
    function (f) { return f.cost || 0; },
    function (f) { return fmtCost(f.cost || 0); },
    function (n, total) { return 'Cost per firing over ' + n + ' firings, total ' + fmtCost(total) + ' — tab through bars for detail'; },
    svgNode, sparkBars, taskMap, flightBarMeta, flightHeadlineOf,
  );
}
// timelineSegments is generated FROM web/timeline-strip.ts below (epic 0002
// "shell decomposition", slice 2) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${timelineSegments.toString()}
// Horizontal FLIGHT TIMELINE strip for a project's flight history: unlike
// metricSparkline (equal-width bars, height encodes a value), here every
// segment is the same height and WIDTH encodes relative duration — a scan
// across the strip reads as "where the flight's time actually went", not
// just "how many firings happened".
function flightTimelineStrip(log, tasks, pid) {
  var W = 240, H = 14, n = log.length, i;
  var durationsMs = [];
  for (i = 0; i < n; i++) durationsMs.push(log[i].durationMs);
  var geo = timelineSegments(durationsMs, W);
  if (!geo) return null; // no real timing data yet — skip rather than fake it
  var taskById = taskMap(tasks);
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('class', 'timeline-strip');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Flight timeline across ' + n + ' firings, segment width proportional to duration — tab through segments for detail');
  for (var j = 0; j < n; j++) {
    var f = log[j];
    var seg = geo.segments[j];
    var rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(seg.x));
    rect.setAttribute('y', '0');
    rect.setAttribute('width', String(seg.width));
    rect.setAttribute('height', String(H));
    var costLabel = fmtCost(f.cost || 0);
    var meta = flightBarMeta(f, taskById, costLabel, flightHeadlineOf);
    rect.setAttribute('class', meta.barClass);
    // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): only
    // the first segment is a Tab stop, not one per firing — the same fix
    // already shipped for the fleet-card gauge, language bar, task-row
    // chips, and generic metricSparkline bars. wireRoving() below (shared
    // helper defined in web/shell.ts, in scope here since clientJs()
    // concatenates fleetJs() before featureModulesJs()) moves the stop.
    rect.setAttribute('tabindex', j === 0 ? '0' : '-1');
    rect.setAttribute('role', 'button');
    rect.setAttribute('aria-label', meta.ariaLabel);
    rect.setAttribute('data-tip-title', meta.title);
    rect.setAttribute('data-tip-verdict', meta.verdictLabel);
    rect.setAttribute('data-tip-cost', costLabel);
    rect.setAttribute('data-tip-turns', meta.turnsLabel);
    rect.setAttribute('data-tip-sha', meta.sha);
    if (pid) {
      rect.setAttribute('data-flight-row', f.id);
      rect.setAttribute('data-flight-pid', pid);
    }
    svg.appendChild(rect);
  }
  return svg;
}
wireRoving('.timeline-strip .spark-bar', '.timeline-strip');
// metricsStatItems/modelMixItems/modelMixChipMeta are generated FROM
// web/stat-tiles.ts below (epic 0002 "shell decomposition", slice 2,
// thirty-fifth and sixty-fifth cuts) — their real compiled source via
// .toString(), not a hand-retyped copy. They can no longer drift apart.
${metricsStatItems.toString()}
${modelMixItems.toString()}
${modelMixChipMeta.toString()}
function metricsSection(c) {
  if (!c.firings) return null;
  var wrap = el('div', 'metrics');
  var stats = el('div', 'card-stats');
  var mItems = metricsStatItems(c, fmtCost, fmtTokens);
  for (var mi = 0; mi < mItems.length; mi++) {
    stats.appendChild(stat(mItems[mi][0], mItems[mi][1], mItems[mi][2]));
  }
  // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): this
  // row shares the fleet card's .card-stats shape, and web/shell.ts wires
  // wireRoving('.card-stats .stat[tabindex]', '.card-stats') for both — so
  // it must seed the same single Tab stop cardStats does, or its three tiles
  // would each stay a Tab stop until the first focus collapsed them.
  seedRoving(stats, '.stat[tabindex]');
  wrap.appendChild(stats);
  // MODEL MIX (backlog web-mssn106m-bqvxi8): which model ran which share of
  // this project's tracked firings — data already carried per-firing on
  // flightLog[].model, just never surfaced as its own panel until now.
  var mix = modelMixItems(c.flightLog || []);
  if (mix.length > 0) {
    var mixTotal = 0;
    for (var ti = 0; ti < mix.length; ti++) mixTotal += mix[ti].count;
    var mixRow = el('div', 'model-mix');
    for (var xi = 0; xi < mix.length; xi++) {
      var mixMeta = modelMixChipMeta(mix[xi], mixTotal);
      mixRow.appendChild(tipChip(mixMeta[0], mixMeta[1], mixMeta[2], 'chip-model'));
    }
    wrap.appendChild(mixRow);
  }
  var chrono = (c.flightLog || []).slice().reverse(); // oldest → newest
  var spark = costSparkline(chrono, c.tasks);
  if (spark) wrap.appendChild(spark);
  var timeline = flightTimelineStrip(chrono, c.tasks, c.id);
  if (timeline) wrap.appendChild(timeline);
  return wrap;
}
`.trim();
}
