// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 4, `docs/epics/0005-cockpit-redesign.md`):
 * the epic's type contract mandates tabular/mono numerals for EVERY metric —
 * instrument-panel discipline so ticking figures never jitter their row. The
 * flight log's "Show all (N)" toggle (`.flight-more`, N grows as firings
 * stream in) and the phase rail's expanded detail heading
 * (`.phase-detail-title`, "inside do (N recent)") both render live counts yet
 * shipped without `font-variant-numeric` while siblings (`.firing-count`,
 * `.phase-count`, `.stat-n`) already carry it. Same stylesheet-rule idiom as
 * `detail-summary-designed-states.test.ts`: find the rule in the emitted
 * stylesheet, pin the token.
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

describe('flight-log / phase-rail live-count tabular numerals (COCKPIT 4/6)', () => {
  it('keeps the "Show all (N)" flight-log toggle count from jittering', () => {
    const rule = ruleFor(css, '.flight-more');
    expect(rule).toContain('font-variant-numeric: tabular-nums');
  });

  it('keeps the phase-detail heading count from jittering', () => {
    const rule = ruleFor(css, '.phase-detail-title');
    expect(rule).toContain('font-variant-numeric: tabular-nums');
  });
});
