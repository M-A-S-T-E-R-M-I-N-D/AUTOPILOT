// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * M3 component pass v2 (web-msm66jkf-1v7wk6), next slice after chip labels
 * (db98f92): the task board's own controls — focus/move/done/delete buttons,
 * the focused-row highlight, and the add-task input+button — still carried
 * the legacy `--radius-sm` corner. Moves them to `--shape-extra-small`
 * (numerically identical — 4px either way — so no visual size change),
 * matching the M3 shape scale used by every other migrated surface. These
 * stay flat controls (no elevation added) except `.task-add button`, which
 * already carried `--elevation-level-1` from an earlier pass and keeps it.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

function ruleFor(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

describe('task board M3 shape', () => {
  const selectors = [
    '.task-focused',
    '.task-move',
    '.task-focus-btn',
    '.task-done-btn',
    '.task-delete-btn',
    '.task-add input',
    '.task-add button',
  ];

  it.each(selectors)(
    '%s uses the M3 shape token, not the legacy plain radius token',
    (selector) => {
      const rule = ruleFor(layoutCss(), selector);
      expect(rule).toContain('var(--shape-extra-small)');
      expect(rule).not.toContain('var(--radius-sm)');
    },
  );

  it('.task-add button keeps its existing M3 elevation', () => {
    const rule = ruleFor(layoutCss(), '.task-add button');
    expect(rule).toContain('var(--elevation-level-1)');
  });
});
