// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * the search bar's CTA pair — `#search-go` (filled accent submit) and `#ask-go`
 * (outline accent Ask) — shipped with base + `:disabled` styling only, zero
 * hover/focus/active feedback, while their structural twin `#fly-go` (the fly
 * bar's filled accent CTA) already carries the MX pair: rest on the
 * state-responsive shape token with a radius/shadow transition, shape-morph
 * radius + `--elevation-level-1` lift on hover/focus-visible, pressed radius
 * flat on `:active`. Flagged by the firing-156 stylesheet audit (29040f59).
 * Same assertion idiom as `tour-browse-cta-designed-states.test.ts`.
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

describe.each(['#search-go', '#ask-go'])('%s designed states (COCKPIT 6/6)', (selector) => {
  it('rests on the state-responsive shape token with the radius/shadow transition', () => {
    const rule = ruleFor(css, `${selector} {`);
    expect(rule).toContain('border-radius: var(--shape-extra-small)');
    expect(rule).toContain(
      'transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard)',
    );
  });

  it('morphs shape and lifts on hover/focus-visible, flattens pressed on active', () => {
    const hover = ruleFor(css, `${selector}:not(:disabled):hover`);
    expect(hover).toContain(`${selector}:not(:disabled):focus-visible`);
    expect(hover).toContain('border-radius: var(--shape-extra-small-hover)');
    expect(hover).toContain('box-shadow: var(--elevation-level-1)');

    const active = ruleFor(css, `${selector}:not(:disabled):active`);
    expect(active).toContain('border-radius: var(--shape-extra-small-pressed)');
    expect(active).toContain('box-shadow: none');
  });
});
