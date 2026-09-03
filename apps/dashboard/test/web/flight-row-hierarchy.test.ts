// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 4, `docs/epics/0005-cockpit-redesign.md`):
 * the epic's hierarchy contract wants each surface's content stronger than its
 * chrome. The flight log's FIRING rows already carry that pair
 * (`flightlog-row-hierarchy.test.ts`: muted `.firing-toggle` chrome, explicit
 * full-strength `.firing-headline`), but its FLIGHT rows — the top-level list
 * — shipped hierarchy-flat the other way round: `.flight-head` inherits full
 * body color, so the headline (`.flight-item`, what the firing shipped) and
 * its cost/turns/ago metadata all read in ONE full-strength tone; only the
 * sha was quiet. The cockpit reading: the headline rests at explicit full
 * text strength, the row's metadata chrome stays muted like its firing-row
 * siblings `.firing-count`/`.firing-ago`. Same assertion idiom as
 * `worker-card-hierarchy.test.ts`: find the rule in the emitted stylesheet,
 * pin its tokens.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

/**
 * The worker-card idiom, anchored to a rule whose prelude starts at a line
 * boundary with exactly this selector — `.flight-item` also appears in the
 * stylesheet-top overflow-wrap group and as the tail of `.flight-group
 * .flight-item`, which a bare indexOf would shadow.
 */
function ruleFor(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped} \\{[^}]*\\}`, 'm').exec(css);
  expect(match, `rule "${selector}" exists`).not.toBeNull();
  return (match as RegExpExecArray)[0];
}

const css = layoutCss();

describe('flight-log flight-row hierarchy (COCKPIT 4/6)', () => {
  it('the flight headline reads as content, explicitly at full text strength', () => {
    const rule = ruleFor(css, '.flight-item');
    expect(rule).toContain('color: var(--color-text)');
  });

  it('the cost chip is row chrome and stays quiet', () => {
    const rule = ruleFor(css, '.flight-cost');
    expect(rule).toContain('color: var(--color-text-muted)');
  });

  it('the turns chip is row chrome and stays quiet', () => {
    const rule = ruleFor(css, '.flight-turns');
    expect(rule).toContain('color: var(--color-text-muted)');
  });

  it('the relative-time label is row chrome and stays quiet', () => {
    const rule = ruleFor(css, '.flight-ago');
    expect(rule).toContain('color: var(--color-text-muted)');
  });

  it('the sha chip keeps the muted tone it already had, completing the pair', () => {
    const rule = ruleFor(css, '.flight-sha');
    expect(rule).toContain('color: var(--color-text-muted)');
  });

  it('the secondary real-cost figure stays a step quieter than the cost chip', () => {
    const rule = ruleFor(css, '.flight-real-cost');
    expect(rule).toContain('color: var(--color-text-muted)');
    expect(rule).toContain('opacity: 0.75');
  });
});
