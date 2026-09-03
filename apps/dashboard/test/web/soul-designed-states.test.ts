// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 4, `docs/epics/0005-cockpit-redesign.md`):
 * the SOUL-surface controls — the proposal disclosure summary, its
 * ratify/dismiss buttons, and the un-ratify undo button — carry the same MX
 * shape-morph + elevation hover/active language as the board's task buttons
 * and the flight-log toggles, instead of the flat cursor-only styling they
 * shipped with. Same assertion idiom as `flightbar-shape-morph.test.ts`:
 * find the rule in the emitted stylesheet, pin its state tokens.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

// A selector may open its own rule (`sel {`) or sit in a shared selector
// list (`sel, other {`) — match either so combined hover/focus-visible
// rules resolve the same as standalone ones.
function ruleFor(css: string, selector: string): string {
  const braceIdx = css.indexOf(`${selector} {`);
  const commaIdx = css.indexOf(`${selector},`);
  const candidates = [braceIdx, commaIdx].filter((i) => i >= 0);
  const start = candidates.length > 0 ? Math.min(...candidates) : -1;
  expect(start, `rule "${selector}" exists`).toBeGreaterThanOrEqual(0);
  expect(start, `rule containing "${selector}" exists`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

const css = layoutCss();

describe.each([
  {
    label: 'proposal summary',
    rest: '.soul-proposal-summary',
    hover: '.soul-proposal-summary:hover, .soul-proposal-summary:focus-visible',
    active: '.soul-proposal-summary:active',
  },
  {
    label: 'ratify/dismiss buttons',
    rest: '.soul-ratify-btn, .soul-dismiss-btn',
    hover: '.soul-ratify-btn:not(:disabled):hover',
    active: '.soul-ratify-btn:not(:disabled):active, .soul-dismiss-btn:not(:disabled):active',
  },
  {
    label: 'un-ratify button',
    rest: '.soul-unratify-btn',
    hover: '.soul-unratify-btn:not(:disabled):hover',
    active: '.soul-unratify-btn:not(:disabled):active',
  },
])('SOUL $label designed states (COCKPIT 4/6)', ({ rest, hover, active }) => {
  it('transitions border-radius and box-shadow at rest', () => {
    const rule = ruleFor(css, rest);
    expect(rule).toContain('transition:');
    expect(rule).toContain('border-radius var(--duration-short2)');
    expect(rule).toContain('box-shadow var(--duration-short2)');
  });

  it('morphs to the MX hover radius with an elevation lift', () => {
    const rule = ruleFor(css, hover);
    expect(rule).toContain('var(--shape-extra-small-hover)');
    expect(rule).toContain('var(--elevation-level-1)');
  });

  it('presses to the MX pressed radius, flat', () => {
    const rule = ruleFor(css, active);
    expect(rule).toContain('var(--shape-extra-small-pressed)');
    expect(rule).toContain('box-shadow: none');
  });
});

describe('ratify hover keeps its needs-you semantic', () => {
  it('washes with translucent needs-you rather than a solid unverified fill', () => {
    const rule = ruleFor(css, '.soul-ratify-btn:not(:disabled):hover');
    expect(rule).toContain('color-mix(in srgb, var(--color-needs-you) 15%, transparent)');
  });
});
