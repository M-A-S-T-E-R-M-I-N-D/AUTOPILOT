// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 4, `docs/epics/0005-cockpit-redesign.md`):
 * the project card's "Details" disclosure summary — the gateway to the flight
 * log, facts grid, and phase rail — carries the same MX shape-morph +
 * elevation hover/focus/active language as `.soul-editor-summary` and the
 * flight-log toggles, instead of the bare color-only hover it shipped with
 * (no focus-visible or active state at all). Same assertion idiom as
 * `soul-designed-states.test.ts`: find the rule in the emitted stylesheet,
 * pin its state tokens.
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

describe('project-card Details summary designed states (COCKPIT 4/6)', () => {
  it('transitions border-radius and box-shadow at rest', () => {
    const rule = ruleFor(css, '.detail summary');
    expect(rule).toContain('transition:');
    expect(rule).toContain('border-radius var(--duration-short2)');
    expect(rule).toContain('box-shadow var(--duration-short2)');
  });

  it('morphs to the MX hover radius with an elevation lift, focus included', () => {
    const rule = ruleFor(css, '.detail summary:hover, .detail summary:focus-visible');
    expect(rule).toContain('var(--shape-extra-small-hover)');
    expect(rule).toContain('var(--elevation-level-1)');
    expect(rule).toContain('var(--color-surface-raised)');
  });

  it('presses to the MX pressed radius, flat', () => {
    const rule = ruleFor(css, '.detail summary:active');
    expect(rule).toContain('var(--shape-extra-small-pressed)');
    expect(rule).toContain('box-shadow: none');
  });
});
