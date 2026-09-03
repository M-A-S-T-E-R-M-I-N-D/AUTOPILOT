// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 4, `docs/epics/0005-cockpit-redesign.md`):
 * the "◐ SOUL unreviewed" badge-button (`.soul-review-btn`, shell.ts) shares
 * the needs-you outline-chip look with `.soul-ratify-btn` but was left out of
 * the SOUL-surface designed-states pass (`soul-designed-states.test.ts`) — it
 * shipped with base + :disabled styling only: no transition, no hover wash, no
 * shape-morph, no pressed state. Same assertion idiom as that suite: find the
 * rule in the emitted stylesheet, pin its state tokens.
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

describe('SOUL unreviewed badge-button designed states (COCKPIT 4/6)', () => {
  it('transitions border-radius and box-shadow at rest', () => {
    const rule = ruleFor(css, '.soul-review-btn');
    expect(rule).toContain('transition:');
    expect(rule).toContain('border-radius var(--duration-short2)');
    expect(rule).toContain('box-shadow var(--duration-short2)');
  });

  it('morphs to the MX hover radius with an elevation lift', () => {
    const rule = ruleFor(css, '.soul-review-btn:not(:disabled):hover');
    expect(rule).toContain('var(--shape-extra-small-hover)');
    expect(rule).toContain('var(--elevation-level-1)');
  });

  it('washes with translucent needs-you on hover, keeping its semantic', () => {
    const rule = ruleFor(css, '.soul-review-btn:not(:disabled):hover');
    expect(rule).toContain('color-mix(in srgb, var(--color-needs-you) 15%, transparent)');
  });

  it('presses to the MX pressed radius, flat', () => {
    const rule = ruleFor(css, '.soul-review-btn:not(:disabled):active');
    expect(rule).toContain('var(--shape-extra-small-pressed)');
    expect(rule).toContain('box-shadow: none');
  });
});
