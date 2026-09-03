// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * `.control-proposal-confirm` — the ARCHITECT proposal card's "Confirm" /
 * "Confirm (destructive)" button (`features/search.ts`) — is the exact
 * needs-you outline-chip twin of `.soul-ratify-btn` (transparent background,
 * `--color-needs-you` border and text, `:disabled` dim), but shipped with base
 * + :disabled styling only: no transition, no hover wash, no shape-morph, no
 * pressed state — zero feedback on the one button that authorizes a possibly
 * destructive action. It joins its twin's treatment: translucent needs-you
 * wash (never a solid fill — needs-you is contrast-verified as TEXT, not a
 * backdrop) with the MX shape-morph + `--elevation-level-1` lift on
 * hover/focus-visible, pressed-flat on active. Same assertion idiom as
 * `soul-review-btn-designed-states.test.ts` / `connect-test-cta-designed-states.test.ts`.
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

describe('control-proposal confirm CTA designed states (COCKPIT 6/6)', () => {
  it('rests on the state-responsive shape token with the radius/shadow transition', () => {
    const rule = ruleFor(css, '.control-proposal-confirm {');
    expect(rule).toContain('border-radius: var(--shape-extra-small)');
    expect(rule).toContain(
      'transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard)',
    );
  });

  it('washes with translucent needs-you and lifts on hover/focus-visible, keeping its semantic', () => {
    const hover = ruleFor(css, '.control-proposal-confirm:not(:disabled):hover');
    expect(hover).toContain('.control-proposal-confirm:not(:disabled):focus-visible');
    expect(hover).toContain('color-mix(in srgb, var(--color-needs-you) 15%, transparent)');
    expect(hover).toContain('border-radius: var(--shape-extra-small-hover)');
    expect(hover).toContain('box-shadow: var(--elevation-level-1)');
  });

  it('presses to the MX pressed radius, flat', () => {
    const active = ruleFor(css, '.control-proposal-confirm:not(:disabled):active');
    expect(active).toContain('border-radius: var(--shape-extra-small-pressed)');
    expect(active).toContain('box-shadow: none');
  });
});
