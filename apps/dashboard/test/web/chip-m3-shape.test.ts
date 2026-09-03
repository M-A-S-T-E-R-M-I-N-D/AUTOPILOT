// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * M3 component pass v2 (web-msm66jkf-1v7wk6), next slice after the heatmap
 * wrapper (d332c2e): `.chip` (severity/status labels on task cards) still
 * carried the legacy `--radius-sm` corner. Moves it to `--shape-extra-small`
 * (numerically identical — 4px either way — so no visual size change),
 * matching the M3 shape scale used by every other migrated surface. Chips
 * stay flat (no elevation) — M3's chip spec is a resting, non-elevated
 * container (m3.material.io/components/chips), so unlike the panel surfaces
 * this slice adds no box-shadow.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

function ruleFor(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

describe('chip M3 shape', () => {
  it('uses the M3 shape token, not the legacy plain radius token', () => {
    const rule = ruleFor(layoutCss(), '.chip');
    expect(rule).toContain('var(--shape-extra-small)');
    expect(rule).not.toContain('var(--radius-sm)');
  });
});
