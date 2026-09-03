// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * the tour dialog's nav buttons (`.tour-actions button`, incl. the filled
 * `.tour-next`) and the browse-a-folder modal's footer buttons
 * (`.browse-actions button`, incl. the filled `.browse-use`) shipped with a
 * base rule but zero hover/active feedback — the survey's last two named
 * gaps. They join the MX pair their sibling CTAs carry: shape-morph radius +
 * `--elevation-level-1` lift on hover/focus-visible, pressed radius flat on
 * `:active` (`.fly-flight-actions button` / `.landing-execute` idiom). Same
 * assertion idiom as `soul-review-btn-designed-states.test.ts`.
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

describe('tour + browse dialog CTA designed states (COCKPIT 6/6)', () => {
  it('tour buttons rest on the state-responsive shape token with the radius/shadow transition', () => {
    const rule = ruleFor(css, '.tour-actions button {');
    expect(rule).toContain('border-radius: var(--shape-extra-small)');
    expect(rule).toContain(
      'transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard)',
    );
  });

  it('tour buttons morph shape and lift on hover/focus-visible, flatten pressed on active', () => {
    const hover = ruleFor(css, '.tour-actions button:not(:disabled):hover');
    expect(hover).toContain('.tour-actions button:not(:disabled):focus-visible');
    expect(hover).toContain('border-radius: var(--shape-extra-small-hover)');
    expect(hover).toContain('box-shadow: var(--elevation-level-1)');

    const active = ruleFor(css, '.tour-actions button:not(:disabled):active');
    expect(active).toContain('border-radius: var(--shape-extra-small-pressed)');
    expect(active).toContain('box-shadow: none');
  });

  it('browse buttons carry the radius/shadow transition at rest', () => {
    const rule = ruleFor(css, '.browse-actions button {');
    expect(rule).toContain('border-radius: var(--shape-extra-small)');
    expect(rule).toContain(
      'transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard)',
    );
  });

  it('browse buttons morph shape and lift on hover/focus-visible, flatten pressed on active', () => {
    const hover = ruleFor(css, '.browse-actions button:not(:disabled):hover');
    expect(hover).toContain('.browse-actions button:not(:disabled):focus-visible');
    expect(hover).toContain('border-radius: var(--shape-extra-small-hover)');
    expect(hover).toContain('box-shadow: var(--elevation-level-1)');

    const active = ruleFor(css, '.browse-actions button:not(:disabled):active');
    expect(active).toContain('border-radius: var(--shape-extra-small-pressed)');
    expect(active).toContain('box-shadow: none');
  });
});
