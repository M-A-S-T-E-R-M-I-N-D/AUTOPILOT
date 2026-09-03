// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 4, `docs/epics/0005-cockpit-redesign.md`):
 * the project-page panels' primary "Execute" CTAs — landing, release,
 * PR-review, and issue-triage — were the last interactive controls whose
 * hover was a lone off-system `filter: brightness()` recolor instead of the
 * MX shape-morph + elevation pair every sibling control already carries
 * (`#fly-go`, the board's task buttons, the flight-log toggles). Same
 * assertion idiom as `detail-summary-designed-states.test.ts`: find the rule
 * in the emitted stylesheet, pin its state tokens.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

function ruleFor(css: string, selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `rule "${selector}" exists`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

const css = layoutCss();

const EXECUTE_CTAS = [
  '.landing-execute',
  '.release-execute',
  '.pr-review-execute',
  '.issue-triage-execute',
];

describe('panel execute CTAs designed states (COCKPIT 4/6)', () => {
  it('drops the off-system brightness() hover entirely', () => {
    expect(css).not.toContain('brightness(');
  });

  it('transitions border-radius and box-shadow at rest', () => {
    const rule = ruleFor(css, EXECUTE_CTAS.join(', '));
    expect(rule).toContain('transition:');
    expect(rule).toContain('border-radius var(--duration-short2)');
    expect(rule).toContain('box-shadow var(--duration-short2)');
  });

  for (const cta of EXECUTE_CTAS) {
    it(`${cta} morphs to the MX hover radius with an elevation lift, focus included`, () => {
      const rule = ruleFor(css, `${cta}:not(:disabled):hover`);
      expect(rule).toContain(`${cta}:not(:disabled):focus-visible`);
      expect(rule).toContain('var(--shape-extra-small-hover)');
      expect(rule).toContain('var(--elevation-level-1)');
    });

    it(`${cta} presses to the MX pressed radius, flat`, () => {
      const rule = ruleFor(css, `${cta}:not(:disabled):active`);
      expect(rule).toContain('var(--shape-extra-small-pressed)');
      expect(rule).toContain('box-shadow: none');
    });
  }
});
