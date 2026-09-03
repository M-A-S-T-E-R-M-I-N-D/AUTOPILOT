// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 4, `docs/epics/0005-cockpit-redesign.md`):
 * the epic's type contract demands tabular numerals for EVERY metric —
 * instrument-panel discipline, so ticking figures never jitter their row.
 * The worker card's action-count and elapsed/turn lines
 * (`.live-worker-count`/`.live-worker-turns`), the flight log's ticking
 * started-ago label (`.firing-ago`), and the flight ROW's own ticking ago
 * label (`.flight-ago` — rendered via `fmtAgo` on both the flight log's
 * top-level rows and the fleet page's flight cards), and the flight-summary
 * panel's ticking ago label (`.flight-summary-ago`, the same `fmtAgo` text
 * via `flightSummaryLineMeta`) all render live numbers, yet shipped without
 * `font-variant-numeric` while their siblings
 * (`.firing-count`, `.phase-count`, `.stat-n`) already carry the discipline.
 * A follow-up audit found the earlier sweep's own reasoning wrong about one
 * row-mate pair: `.flight-cost`/`.flight-turns`/`.flight-real-cost` were
 * waved through as "already carry the discipline" because they're mono —
 * but `font-family: var(--font-mono)` and `font-variant-numeric:
 * tabular-nums` are separate properties, and every OTHER metric class in
 * this stylesheet declares tabular-nums explicitly regardless of font
 * (`.flight-summary-cost`/`.landing-commit-sha` aren't even mono and still
 * carry it). These three were the only cost/turn metrics on the page
 * without it.
 * Same assertion idiom as `detail-summary-designed-states.test.ts`: find
 * the rule in the emitted stylesheet, pin its tokens.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

function ruleFor(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `rule "${selector}" exists`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

const css = layoutCss();

describe('project-page metric tabular numerals (COCKPIT 4/6)', () => {
  it('worker-card action-count and turn lines read as instruments', () => {
    const rule = ruleFor(css, '.live-worker-count, .live-worker-turns');
    expect(rule).toContain('font-variant-numeric: tabular-nums');
  });

  it("flight log's ticking started-ago label keeps its width as it counts", () => {
    const rule = ruleFor(css, '.firing-ago');
    expect(rule).toContain('font-variant-numeric: tabular-nums');
  });

  it("flight row's ticking ago label keeps its width as it counts", () => {
    const rule = ruleFor(css, '.flight-ago');
    expect(rule).toContain('font-variant-numeric: tabular-nums');
  });

  it("flight summary's ticking ago label keeps its width as it counts", () => {
    const rule = ruleFor(css, '.flight-summary-ago');
    expect(rule).toContain('font-variant-numeric: tabular-nums');
  });

  it("flight row's cost figure carries tabular-nums, not just mono", () => {
    const rule = ruleFor(css, '.flight-cost');
    expect(rule).toContain('font-variant-numeric: tabular-nums');
  });

  it("flight row's real-cost figure carries tabular-nums, not just mono", () => {
    const rule = ruleFor(css, '.flight-real-cost');
    expect(rule).toContain('font-variant-numeric: tabular-nums');
  });

  it("flight row's turn count carries tabular-nums, not just mono", () => {
    const rule = ruleFor(css, '.flight-turns');
    expect(rule).toContain('font-variant-numeric: tabular-nums');
  });
});
