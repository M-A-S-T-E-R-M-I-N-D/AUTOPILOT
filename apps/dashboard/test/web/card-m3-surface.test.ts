// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * M3 component pass v2 (web-msm66jkf-1v7wk6): v1 (b27bc2c) gave only the
 * primary buttons M3 state-layer + elevation; the project card — the
 * dashboard's most-seen surface — still used the plain `--radius-lg` +
 * flat-border treatment. This slice gives `.card` the same elevated-surface
 * tokens `.stat-tile` already established (5404a89): `--shape-medium` corner
 * radius (numerically identical to the old `--radius-lg`, so no visual size
 * change) plus `--elevation-level-1`, lifting to `--elevation-level-2` on
 * hover/focus-within.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

function ruleFor(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

describe('project card M3 surface', () => {
  it('uses the M3 shape token, not the legacy plain radius token', () => {
    const rule = ruleFor(layoutCss(), '.card');
    expect(rule).toContain('var(--shape-medium)');
    expect(rule).not.toContain('var(--radius-lg)');
  });

  it('sits at elevation-level-1 by default', () => {
    const rule = ruleFor(layoutCss(), '.card');
    expect(rule).toContain('box-shadow: var(--elevation-level-1)');
  });

  it('lifts to elevation-level-2 on hover or when a child is focused', () => {
    const css = layoutCss();
    expect(css).toContain(
      '.card:hover, .card:focus-within { box-shadow: var(--elevation-level-2); }',
    );
  });
});
