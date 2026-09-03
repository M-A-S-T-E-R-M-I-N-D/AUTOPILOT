// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 4, `docs/epics/0005-cockpit-redesign.md`):
 * the flight log's replay prev/next buttons carry the same MX shape-morph +
 * elevation hover/focus/active language as their flight-log siblings
 * `.firing-toggle` and `.diff-toggle`, instead of the color-only hover and
 * static `--radius-sm` they shipped with (no active state at all). Same
 * assertion idiom as `detail-summary-designed-states.test.ts`: find the rule
 * in the emitted stylesheet, pin its state tokens.
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

describe('flight-log replay-nav designed states (COCKPIT 4/6)', () => {
  it('rests on the state-responsive shape token and transitions radius + shadow', () => {
    const rule = ruleFor(css, '.replay-nav-btn');
    expect(rule).toContain('border-radius: var(--shape-extra-small)');
    expect(rule).toContain('transition:');
    expect(rule).toContain('border-radius var(--duration-short2)');
    expect(rule).toContain('box-shadow var(--duration-short2)');
  });

  it('morphs to the MX hover radius with an elevation lift, focus included', () => {
    const rule = ruleFor(
      css,
      '.replay-nav-btn:hover:not(:disabled), .replay-nav-btn:focus-visible:not(:disabled)',
    );
    expect(rule).toContain('var(--shape-extra-small-hover)');
    expect(rule).toContain('var(--elevation-level-1)');
    expect(rule).toContain('var(--color-accent)');
  });

  it('presses to the MX pressed radius, flat, only when enabled', () => {
    const rule = ruleFor(css, '.replay-nav-btn:active:not(:disabled)');
    expect(rule).toContain('var(--shape-extra-small-pressed)');
    expect(rule).toContain('box-shadow: none');
  });
});

describe('flight-log replay-exit designed states (COCKPIT 4/6)', () => {
  it('rests on the state-responsive shape token and transitions radius + shadow', () => {
    const rule = ruleFor(css, '.replay-nav-exit');
    expect(rule).toContain('border-radius: var(--shape-extra-small)');
    expect(rule).toContain('transition:');
    expect(rule).toContain('border-radius var(--duration-short2)');
    expect(rule).toContain('box-shadow var(--duration-short2)');
  });

  it('raises a surface with the MX hover radius and elevation lift, focus included', () => {
    const rule = ruleFor(css, '.replay-nav-exit:hover, .replay-nav-exit:focus-visible');
    expect(rule).toContain('var(--color-surface-raised)');
    expect(rule).toContain('var(--shape-extra-small-hover)');
    expect(rule).toContain('var(--elevation-level-1)');
  });

  it('presses to the MX pressed radius, flat', () => {
    const rule = ruleFor(css, '.replay-nav-exit:active');
    expect(rule).toContain('var(--shape-extra-small-pressed)');
    expect(rule).toContain('box-shadow: none');
  });
});
