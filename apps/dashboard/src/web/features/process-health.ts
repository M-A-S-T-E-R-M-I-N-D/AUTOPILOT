// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's process-health stat-tile cluster — the DORA-for-agents,
 * parallel-gate-savings, and warm-session-savings panels
 * (`doraSection`/`gateParallelSection`/`warmSessionsSection`), a whole
 * bundle-composing assembler function extracted out of `shell.ts`'s
 * `fleetJs()` into its own file under `web/features/` (epic 0002 "shell
 * decomposition", SHELL HUB RELIEF — see docs/epics/0002-shell-decomposition.md,
 * and `web/features/round-panel.ts`/`web/features/backlog.ts` for the prior
 * extractions of this shape). Unlike every prior cut, this one moves THREE
 * sibling section functions at once: the source comment `fleetJs()` carried at
 * their old home already named them together as the three panels that "each
 * independently hand-rolled this exact seven-line loop body verbatim", so they
 * are one coherent cluster, not three unrelated regions.
 * `web/shell.ts`'s `clientJs()` calls them indirectly through
 * `featureModulesJs()`, so the return value — not this file's compiled source —
 * is what lands in the served `/app.js` text; moving the functions (not
 * splicing them) is therefore zero behavior change.
 * `discoverFeatureModules('web/features')` finds this file's `processHealthJs`
 * export the same way it already finds `round-panel.ts`'s `roundPanelJs`. Like
 * `round-panel.ts`, this file still carries real relative-import splices of its
 * own — `doraTileItems`/`gateParallelTileItems`/`warmSessionTileItems`,
 * embedded via `.toString()` — now resolved relative to this file instead of
 * `shell.ts`. And like `round-panel.ts`/`backlog.ts`, none of these panels
 * keeps any module-level state: every render reads only the passed project
 * card `c`, with no `pid`-keyed map surviving between renders and no execute
 * click handler of its own.
 *
 * `doraSection(c)`/`gateParallelSection(c)`/`warmSessionsSection(c)` (declared
 * below) are each called from `fleetJs()`'s `renderProjectPage()` — call sites
 * that stay bare, unimported identifier references in `fleetJs()`'s own served
 * text. That works because the served bundle is one concatenated non-module
 * script (`clientJs()` = `fleetJs()` + `featureModulesJs()`): each is a hoisted
 * `function` declaration, and by the time `renderProjectPage()` actually calls
 * them (only once a project page is opened, well after the whole script has
 * already run once), every feature module's functions — these three included —
 * are already defined in the same shared top-level scope, the same way
 * `round-panel.ts`'s `roundSection` call site already relies on. `el`/`statTile`
 * (which stays inline in `fleetJs()`, shared with `renderStatTiles`) and
 * `fmtDuration`, called by name inside these sections, hoist the same way from
 * `fleetJs()`'s own top-level declarations.
 */
import { doraTileItems, gateParallelTileItems, warmSessionTileItems } from '../stat-tiles.js';

/** The process-health stat-tile panels client — vanilla, external (keeps CSP script-src 'self'). */
export function processHealthJs(): string {
  return `
// doraTileItems/gateParallelTileItems/warmSessionTileItems are generated FROM
// web/stat-tiles.ts below (epic 0002 "shell decomposition", slice 2,
// twenty-seventh/twenty-eighth cuts) — their real compiled source via
// .toString(), not a hand-retyped copy. They can no longer drift apart.
${doraTileItems.toString()}
${gateParallelTileItems.toString()}
${warmSessionTileItems.toString()}
// Process-health tiles (DORA-for-agents, backlog web-msnsxudt-sfw78a): landing
// frequency, task lead time, change failure rate, and MTTR (checkpoint-to-
// resume) — the four numbers are computed store-side (packages/store/src/
// dora.ts) from this project's own metrics/tasks rows; this only renders them.
// Reuses the .stat-tiles/.stat-tile M3 surface the fleet-wide header bar uses
// (renderStatTiles) but under its own #dora-tiles id, scoped to one project.
function doraSection(c) {
  var d = c.dora;
  if (!d) return null;
  var wrap = el('section', 'dora-panel');
  wrap.appendChild(el('h3', 'dora-title', '📈 Process health (DORA)'));
  var grid = el('div', 'stat-tiles');
  grid.id = 'dora-tiles';
  var items = doraTileItems(d, fmtDuration);
  for (var i = 0; i < items.length; i++) grid.appendChild(statTile(items[i][0], items[i][1], items[i][2]));
  // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): one Tab
  // stop per grid; wireRoving('.stat-tiles .stat-tile', ...) in web/shell.ts
  // moves it.
  seedRoving(grid, '.stat-tile');
  wrap.appendChild(grid);
  return wrap;
}
// Parallel-gate savings tiles (backlog web-msnt26tn-jvyihy "PARALLEL GATE +
// test-impact"): the real wall-clock saved by running typecheck/lint/format
// concurrently instead of sequentially, computed store-side (packages/store/
// src/read.ts gateParallelSavings) from this project's own gate-check
// telemetry — this only renders it. A metric with no visible tile is not
// "complete" (see doraSection above, the precedent this mirrors).
function gateParallelSection(c) {
  var g = c.gateParallel;
  if (!g || g.sampledFirings === 0) return null;
  var wrap = el('section', 'gate-parallel-panel');
  wrap.appendChild(el('h3', 'gate-parallel-title', '⚡ Parallel gate savings'));
  var grid = el('div', 'stat-tiles');
  grid.id = 'gate-parallel-tiles';
  var items = gateParallelTileItems(g, fmtDuration);
  for (var i = 0; i < items.length; i++) grid.appendChild(statTile(items[i][0], items[i][1], items[i][2]));
  // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): one Tab
  // stop per grid; wireRoving('.stat-tiles .stat-tile', ...) in web/shell.ts
  // moves it.
  seedRoving(grid, '.stat-tile');
  wrap.appendChild(grid);
  return wrap;
}
// Warm-session savings tiles (epic 0009 WARM SESSIONS, board
// web-msnt26so-0c6tje): resumed-vs-cold firing cost anatomy, computed
// store-side (packages/store/src/warm-sessions.ts) from metrics.resumed —
// this only renders it. Hidden until at least one firing has actually run
// on a resumed session, so pre-warm-sessions projects show nothing rather
// than a panel of dashes (see gateParallelSection above, the precedent
// this mirrors).
function warmSessionsSection(c) {
  var w = c.warmSessions;
  if (!w || w.resumed.firings === 0) return null;
  var wrap = el('section', 'warm-sessions-panel');
  wrap.appendChild(el('h3', 'warm-sessions-title', '🔥 Warm sessions'));
  var grid = el('div', 'stat-tiles');
  grid.id = 'warm-sessions-tiles';
  var items = warmSessionTileItems(w);
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
