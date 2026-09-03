// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * `.gh-issue-form button` — the CONNECT popover's bug-report submit and the
 * per-project "Open pull request" submit (`shell.ts`'s `ghPrForm`, which
 * reuses the `.gh-issue-form` class) — shipped with a base rule but zero
 * hover/active feedback, the survey's last named gap. It joins the MX pair
 * its sibling CTAs carry: shape-morph radius + `--elevation-level-1` lift on
 * hover/focus-visible, pressed radius flat on `:active` (the
 * `.tour-actions button` / `.browse-actions button` idiom). Same assertion
 * idiom as `tour-browse-cta-designed-states.test.ts`.
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

describe('gh-issue-form CTA designed states (COCKPIT 6/6)', () => {
  it('rests on the state-responsive shape token with the radius/shadow transition', () => {
    const rule = ruleFor(css, '.gh-issue-form button {');
    expect(rule).toContain('border-radius: var(--shape-extra-small)');
    expect(rule).toContain(
      'transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard)',
    );
  });

  it('morphs shape and lifts on hover/focus-visible, flattens pressed on active', () => {
    const hover = ruleFor(css, '.gh-issue-form button:not(:disabled):hover');
    expect(hover).toContain('.gh-issue-form button:not(:disabled):focus-visible');
    expect(hover).toContain('border-radius: var(--shape-extra-small-hover)');
    expect(hover).toContain('box-shadow: var(--elevation-level-1)');

    const active = ruleFor(css, '.gh-issue-form button:not(:disabled):active');
    expect(active).toContain('border-radius: var(--shape-extra-small-pressed)');
    expect(active).toContain('box-shadow: none');
  });
});
