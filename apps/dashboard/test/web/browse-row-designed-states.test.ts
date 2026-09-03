// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * the browse-a-folder rows (`.browse-entry` / `.browse-drive`) had their
 * hover/focus-visible pairing shipped TWICE — two byte-identical rules with
 * shuffled selector order, a union-merge sync-back artifact — and stopped
 * there: no shape-morph, no lift, no pressed state. This pins the dedupe
 * (exactly one pairing rule survives) and brings the rows into the row-button
 * idiom `.flight-head` established: radius morph + `--elevation-level-1` on
 * hover/focus-visible, pressed radius flat on `:active`. Same assertion idiom
 * as `tour-browse-cta-designed-states.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

function ruleFor(css: string, marker: string): string {
  const start = css.indexOf(marker);
  expect(start, `rule containing "${marker}" exists`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

function countOccurrences(css: string, needle: string): number {
  return css.split(needle).length - 1;
}

const css = layoutCss();

describe('browse dialog row designed states (COCKPIT 6/6)', () => {
  it('ships exactly one hover/focus-visible pairing rule for the rows (union-merge duplicate removed)', () => {
    expect(countOccurrences(css, '.browse-entry:hover')).toBe(1);
    expect(countOccurrences(css, '.browse-entry:focus-visible')).toBe(1);
    expect(countOccurrences(css, '.browse-drive:hover')).toBe(1);
    expect(countOccurrences(css, '.browse-drive:focus-visible')).toBe(1);
  });

  it('rows rest on the state-responsive shape token with the radius/shadow transition', () => {
    const rule = ruleFor(css, '.browse-entry, .browse-drive {');
    expect(rule).toContain('border-radius: var(--shape-extra-small)');
    expect(rule).toContain(
      'transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard)',
    );
  });

  it('rows morph shape and lift on hover/focus-visible, keeping the surface fill', () => {
    const hover = ruleFor(css, '.browse-entry:hover');
    expect(hover).toContain('.browse-entry:focus-visible');
    expect(hover).toContain('.browse-drive:hover');
    expect(hover).toContain('.browse-drive:focus-visible');
    expect(hover).toContain('background: var(--color-surface)');
    expect(hover).toContain('border-color: var(--color-border)');
    expect(hover).toContain('border-radius: var(--shape-extra-small-hover)');
    expect(hover).toContain('box-shadow: var(--elevation-level-1)');
  });

  it('rows flatten pressed on active', () => {
    const active = ruleFor(css, '.browse-entry:active');
    expect(active).toContain('.browse-drive:active');
    expect(active).toContain('border-radius: var(--shape-extra-small-pressed)');
    expect(active).toContain('box-shadow: none');
  });
});
