// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * M3 component pass v2 (web-msm66jkf-1v7wk6), next slice after the task
 * board's own controls (6ccf065): `.card-remove` — the fleet card's remove
 * button — was the one sibling of `.task-move`/`.task-focus-btn`/
 * `.task-done-btn`/`.task-delete-btn` left on the legacy `--radius-sm`
 * corner. Moves it to `--shape-extra-small` (numerically identical — 4px
 * either way — so no visual size change), matching the M3 shape scale used
 * by every other migrated surface. Stays a flat control (no elevation),
 * consistent with its already-converted siblings.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

function ruleFor(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

describe('card-remove M3 shape', () => {
  it('uses the M3 shape token, not the legacy plain radius token', () => {
    const rule = ruleFor(layoutCss(), '.card-remove');
    expect(rule).toContain('var(--shape-extra-small)');
    expect(rule).not.toContain('var(--radius-sm)');
  });
});
