// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * M3 component pass v2 (web-msm66jkf-1v7wk6), next slice after the connect
 * popover (3cde225): the project docs panel was still carrying the legacy
 * `--radius-lg` corner and no elevation at all — a flat, un-lifted surface
 * next to `.card`/`.stat-tile`, which already sit on the M3 elevation
 * system. Moves it to `--shape-medium` (numerically identical to the old
 * `--radius-lg`, so no visual size change) and `--elevation-level-1` (M3's
 * resting-surface tier — m3.material.io/styles/elevation — matching `.card`,
 * since this panel sits in flow rather than floating above page content).
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

function ruleFor(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

describe('docs panel M3 surface', () => {
  it('uses the M3 shape token, not the legacy plain radius token', () => {
    const rule = ruleFor(layoutCss(), '.docs-panel');
    expect(rule).toContain('var(--shape-medium)');
    expect(rule).not.toContain('var(--radius-lg)');
  });

  it('uses the M3 elevation token to lift the panel off the page', () => {
    const rule = ruleFor(layoutCss(), '.docs-panel');
    expect(rule).toContain('box-shadow: var(--elevation-level-1)');
  });
});
