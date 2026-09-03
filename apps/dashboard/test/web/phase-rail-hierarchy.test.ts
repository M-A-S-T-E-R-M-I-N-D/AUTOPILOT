// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 4, `docs/epics/0005-cockpit-redesign.md`):
 * the epic's hierarchy contract wants hero numbers vs. quiet labels, VERIFIED
 * per surface. On the phase rail, a segment's content is its count — bold,
 * tabular, `--text-sm` against the 9px uppercase phase name — but the number
 * inherited the segment's muted rest color (`.phase` paints
 * `--color-text-muted`), so the hero half of the pair sat at chrome strength.
 * The cockpit reading: `.phase-count` explicit at full `--color-text`, the
 * segment chrome staying muted around it. The one segment that fills itself
 * with accent (`.phase-on`) needs the count restored to `--color-accent-text`
 * — an explicit `--color-text` would break contrast on the accent surface.
 * Same assertion idiom as `board-row-hierarchy.test.ts`: find the rule in the
 * emitted stylesheet, pin its tokens.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

/**
 * The flightlog-row idiom, hardened for selectors that also appear as the
 * TAIL of a grouped rule: anchor the match to a rule whose prelude starts at
 * a line boundary with exactly this selector.
 */
function ruleFor(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped} \\{[^}]*\\}`, 'm').exec(css);
  expect(match, `rule "${selector}" exists`).not.toBeNull();
  return (match as RegExpExecArray)[0];
}

const css = layoutCss();

describe('phase-rail hierarchy (COCKPIT 4/6)', () => {
  it('the phase count reads as a hero number, explicitly at full text strength', () => {
    const rule = ruleFor(css, '.phase-count');
    expect(rule).toContain('color: var(--color-text)');
  });

  it('the segment chrome around it stays quiet, keeping the contrast pair', () => {
    expect(ruleFor(css, '.phase')).toContain('color: var(--color-text-muted)');
  });

  it('the accent-filled active segment restores its count to accent-text', () => {
    const rule = ruleFor(css, '.phase-on .phase-count');
    expect(rule).toContain('color: var(--color-accent-text)');
  });
});
