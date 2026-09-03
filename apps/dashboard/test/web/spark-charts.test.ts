// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for `metricSparkline` (`web/spark-charts.ts`),
 * extracted from `shell.ts` under BOARD web-msuflffa-imy6ne ("PARALLEL
 * UNLOCK A2"). `spark-tooltip.test.ts`/`fleet-stat-tiles.test.ts` already
 * regression-test the real `sparkBars`/`taskMap`/`flightBarMeta`/
 * `flightHeadlineOf` composition indirectly through the rendered DOM in
 * `clientJs()`; this test exercises `metricSparkline`'s own loop/early-
 * return/attribute-wiring logic directly, with lightweight stand-ins for
 * the injected `flightBarMeta`/`flightHeadlineOf` shaped exactly like the
 * real ones (avoiding the two modules' independent generic-type params,
 * which don't unify cleanly across an `unknown`-erased `taskById`).
 */

import { describe, it, expect } from 'vitest';
import { metricSparkline, type SvgNodeLike } from '../../src/web/spark-charts.js';
import { taskMap, type FlightBarEntry, type FlightBarMeta } from '../../src/web/flight-metrics.js';
import { sparkBars } from '../../src/web/sparkline.js';

interface TestFiring extends FlightBarEntry {
  readonly id: string;
  readonly cost: number;
}

function firing(overrides: Partial<TestFiring>): TestFiring {
  return {
    id: 'f1',
    shipped: false,
    gateResult: null,
    died: null,
    sha: 'abc1234',
    turns: 3,
    failedCheck: null,
    cost: 0,
    ...overrides,
  };
}

function createSvgNode(tag: string): SvgNodeLike {
  return document.createElementNS('http://www.w3.org/2000/svg', tag) as unknown as SvgNodeLike;
}

const headlineOf = (f: TestFiring): string => `firing ${f.id}`;

const flightBarMeta = (
  f: TestFiring,
  _taskById: Readonly<Record<string, unknown>>,
  valueLabel: string,
  resolveHeadline: (f: TestFiring, taskById: Readonly<Record<string, unknown>>) => string,
): FlightBarMeta => ({
  barClass: `spark-${f.shipped ? 'shipped' : 'not-shipped'} spark-bar`,
  sha: f.sha ? f.sha.slice(0, 7) : '—',
  title: resolveHeadline(f, _taskById),
  verdictLabel: f.shipped ? 'shipped' : 'not shipped',
  turnsLabel: `${f.turns} turns`,
  ariaLabel: `${resolveHeadline(f, _taskById)} — ${valueLabel}`,
});

function render(log: readonly TestFiring[]) {
  return metricSparkline(
    log,
    [],
    (f) => f.cost,
    (f) => `$${f.cost.toFixed(2)}`,
    (n, total) => `${n} firings, total $${total.toFixed(2)}`,
    createSvgNode,
    sparkBars,
    taskMap,
    flightBarMeta,
    headlineOf,
  ) as unknown as SVGElement | null;
}

describe('metricSparkline', () => {
  it('returns null for an empty log', () => {
    expect(render([])).toBeNull();
  });

  it('returns null when every value is zero — no real data to chart yet', () => {
    expect(render([firing({ cost: 0 }), firing({ cost: 0 })])).toBeNull();
  });

  it('renders one <rect> per firing, an aria-label on the group, and per-bar tip data', () => {
    const svg = render([
      firing({ id: 'f1', cost: 0.1, shipped: true, sha: 'deadbeef' }),
      firing({ id: 'f2', cost: 0.2 }),
    ]);

    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('class')).toBe('spark');
    expect(svg!.getAttribute('role')).toBe('group');
    expect(svg!.getAttribute('aria-label')).toBe('2 firings, total $0.30');

    const rects = Array.from(svg!.querySelectorAll('rect'));
    expect(rects).toHaveLength(2);

    const first = rects[0]!;
    expect(first.getAttribute('class')).toBe('spark-shipped spark-bar');
    expect(first.getAttribute('data-tip-sha')).toBe('deadbee');
    expect(first.getAttribute('data-tip-cost')).toBe('$0.10');
    expect(first.getAttribute('data-tip-title')).toBe('firing f1');
    expect(first.getAttribute('role')).toBe('button');
    expect(first.getAttribute('tabindex')).toBe('0');

    const second = rects[1]!;
    expect(second.getAttribute('class')).toBe('spark-not-shipped spark-bar');
    expect(second.getAttribute('data-tip-cost')).toBe('$0.20');
    // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): only
    // the first bar is a Tab stop.
    expect(second.getAttribute('tabindex')).toBe('-1');
  });

  it('sizes bars so the tallest reaches the chart height, per sparkBars geometry', () => {
    const svg = render([firing({ id: 'small', cost: 1 }), firing({ id: 'tall', cost: 10 })]);
    const rects = Array.from(svg!.querySelectorAll('rect'));
    const heights = rects.map((r) => Number(r.getAttribute('height')));
    expect(heights[1]).toBeGreaterThan(heights[0]!);
    expect(heights[1]).toBeCloseTo(32, 0); // H(34) - 2px padding, per sparkBars
  });
});
