// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * M3 component pass v2 (web-msm66jkf-1v7wk6), next slice after the fleet-card
 * remove button (b7bad77): the `.flightbar` controls — the folder/firings/
 * budget/total inputs, the mode select, and the go/stop buttons — still
 * carried the legacy `--radius-sm` corner. Moves them to `--shape-extra-small`
 * (numerically identical — 4px either way — so no visual size change),
 * matching the M3 shape scale used by every other migrated surface. No
 * elevation added — these stay flat controls like the task board's buttons.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

function ruleFor(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

describe('flightbar M3 shape', () => {
  const selectors = ['.fly-form input', '#fly-mode', '#fly-go', '#fly-stop', '#fly-pause'];

  it.each(selectors)(
    '%s uses the M3 shape token, not the legacy plain radius token',
    (selector) => {
      const rule = ruleFor(layoutCss(), selector);
      expect(rule).toContain('var(--shape-extra-small)');
      expect(rule).not.toContain('var(--radius-sm)');
    },
  );
});
