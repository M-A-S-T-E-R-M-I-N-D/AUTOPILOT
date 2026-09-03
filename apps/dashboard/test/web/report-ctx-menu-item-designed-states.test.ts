// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * the report context-menu row (`.report-ctx-menu-item`) carried hover/
 * focus-visible feedback but stopped there — no shape-morph, no lift, no
 * pressed state, no rest-state transition — unlike sibling row-buttons
 * (`.browse-entry`/`.browse-drive`, `.flight-head`) that already carry the
 * full idiom. This pins the same idiom onto it.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

function ruleFor(css: string, marker: string): string {
  const start = css.indexOf(marker);
  expect(start, `rule containing "${marker}" exists`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

const css = layoutCss();

describe('report context-menu row designed states (COCKPIT 6/6)', () => {
  it('rests on the state-responsive shape token with the radius/shadow transition', () => {
    const rule = ruleFor(css, '.report-ctx-menu-item {');
    expect(rule).toContain('border-radius: var(--shape-extra-small)');
    expect(rule).toContain(
      'transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard)',
    );
  });

  it('morphs shape and lifts on hover/focus-visible, keeping the surface fill', () => {
    const hover = ruleFor(css, '.report-ctx-menu-item:hover');
    expect(hover).toContain('.report-ctx-menu-item:focus-visible');
    expect(hover).toContain('background: var(--color-surface)');
    expect(hover).toContain('border-color: var(--color-border)');
    expect(hover).toContain('border-radius: var(--shape-extra-small-hover)');
    expect(hover).toContain('box-shadow: var(--elevation-level-1)');
  });

  it('flattens pressed on active', () => {
    const active = ruleFor(css, '.report-ctx-menu-item:active');
    expect(active).toContain('border-radius: var(--shape-extra-small-pressed)');
    expect(active).toContain('box-shadow: none');
  });
});
