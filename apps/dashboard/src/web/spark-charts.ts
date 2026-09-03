// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The generic per-firing bar sparkline (`metricSparkline`) every stat-tile
 * trend (cost, fleet ship form, turns, cache-read share, ...) is built from —
 * client-only (no server counterpart, unlike `shared/*.ts`), so it lives in
 * `web/` rather than `shared/` (BOARD web-msuflffa-imy6ne, "PARALLEL UNLOCK
 * A2": `shell.ts` had grown to ~3800 lines of concatenation instead of real
 * module boundaries; this is the first cut of DOM-building — not just pure
 * math — out of it).
 *
 * `apps/dashboard/tsconfig.json` (the one `tsc -b`/`pnpm run build` actually
 * type-checks against) has no `"DOM"` lib — only `tsconfig.typecheck.json`
 * adds it — so a real, buildable module here cannot call `document.*`
 * directly the way the still-inline `flightTimelineStrip`/`contributionHeatmap`
 * do inside `fleetJs()`'s template literal (never type-checked as code, only
 * as string text). `createSvgNode` takes the SVG-node factory as an injected
 * capability instead — the same "stay import-free, inject what a cross-
 * cutting call needs" convention `flight-metrics.ts`'s `firingTimelineRowMeta`
 * and `stat-tiles.ts`'s formatter params already established for cross-module
 * calls, extended here to cover the DOM boundary too. `sparkBars`/`taskMap`/
 * `flightBarMeta`/`flightHeadlineOf` are injected for the same reason: a real
 * `import` from a sibling module type-checks fine but breaks once `.toString()`
 * extracts this function's source for embedding into the generated `/app.js`
 * text — see `fleetJs()` in `shell.ts` — since the import gets rewritten to a
 * module-namespace reference that doesn't exist in the browser's global scope.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

import type { FlightBarEntry, FlightBarMeta, TaskLike } from './flight-metrics.js';
import type { SparkGeometry } from './sparkline.js';

/** The minimal SVG-node surface {@link metricSparkline} needs — just enough
 *  of `SVGElement` to set attributes and nest `<rect>`s inside the `<svg>`
 *  root, so this module never has to name `SVGElement`/`Element` itself and
 *  stay buildable without the `"DOM"` lib. */
export interface SvgNodeLike {
  setAttribute(name: string, value: string): void;
  appendChild(child: SvgNodeLike): void;
}

/**
 * Generic per-firing bar sparkline: every tile/card spark (cost, fleet-wide
 * ship form, turns, cache-read share, ...) shares this shape and only differs
 * in which number a bar's height encodes and how that number is captioned —
 * `valueOf`/`fmtValue`/`ariaLabel` carry that difference in. Returns `null`
 * when there is no real data yet (e.g. a freshly scripted project) rather
 * than rendering an empty/flat chart.
 */
export function metricSparkline<F extends FlightBarEntry, T extends TaskLike>(
  log: readonly F[],
  tasks: readonly T[] | null | undefined,
  valueOf: (f: F) => number,
  fmtValue: (f: F) => string,
  ariaLabel: (n: number, total: number) => string,
  createSvgNode: (tag: string) => SvgNodeLike,
  sparkBars: (
    values: readonly number[],
    width?: number,
    height?: number,
    gap?: number,
  ) => SparkGeometry,
  taskMap: (tasks: readonly T[] | null | undefined) => Record<string, T>,
  flightBarMeta: (
    f: F,
    taskById: Readonly<Record<string, unknown>>,
    valueLabel: string,
    headlineOf: (f: F, taskById: Readonly<Record<string, unknown>>) => string,
  ) => FlightBarMeta,
  flightHeadlineOf: (f: F, taskById: Readonly<Record<string, unknown>>) => string,
): SvgNodeLike | null {
  const W = 240;
  const H = 34;
  const gap = 2;
  const n = log.length;
  const values: number[] = [];
  for (let i = 0; i < n; i++) values.push(valueOf(log[i]!) || 0);
  const geo = sparkBars(values, W, H, gap);
  if (geo.max <= 0 || n === 0) return null; // no real data yet (e.g. scripted) — skip
  const taskById = taskMap(tasks);
  const svg = createSvgNode('svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('class', 'spark');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', ariaLabel(n, geo.total));
  for (let j = 0; j < n; j++) {
    const f = log[j]!;
    const bar = geo.bars[j]!;
    const rect = createSvgNode('rect');
    rect.setAttribute('x', String(bar.x));
    rect.setAttribute('y', String(bar.y));
    rect.setAttribute('width', String(bar.width));
    rect.setAttribute('height', String(bar.height));
    const valueLabel = fmtValue(f);
    const meta = flightBarMeta(f, taskById, valueLabel, flightHeadlineOf);
    rect.setAttribute('class', meta.barClass);
    // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): only
    // the first bar in this sparkline is a Tab stop — every bar used to add
    // its own, and a fleet-wide trend can carry dozens of firings. The
    // keydown/focusin handlers in web/shell.ts (scoped per `.spark` group)
    // move the single stop.
    rect.setAttribute('tabindex', j === 0 ? '0' : '-1');
    rect.setAttribute('role', 'button');
    rect.setAttribute('aria-label', meta.ariaLabel);
    rect.setAttribute('data-tip-title', meta.title);
    rect.setAttribute('data-tip-verdict', meta.verdictLabel);
    rect.setAttribute('data-tip-cost', valueLabel);
    rect.setAttribute('data-tip-turns', meta.turnsLabel);
    rect.setAttribute('data-tip-sha', meta.sha);
    svg.appendChild(rect);
  }
  return svg;
}
