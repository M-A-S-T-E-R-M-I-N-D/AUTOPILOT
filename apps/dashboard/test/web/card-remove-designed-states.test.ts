// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * `.card-remove` — the project card's Remove button (`shell.ts`'s
 * `cardActions`) — escaped the sweep's named-gap survey because that survey
 * looked for controls SHARING a base rule without their siblings' state-layer
 * treatment, and `.card-remove` owns its rule alone. It had partial designed
 * states (the danger fill on hover/focus-visible, paired by
 * `hover-focus-visible-pairing.test.ts`) but none of the MX language its
 * near-twin `.task-delete-btn` carries: no radius/shadow transition at rest,
 * no shape-morph + `--elevation-level-1` lift on hover/focus-visible, no
 * pressed-flat active — and its hover rule fired even while `:disabled`,
 * unlike every `:not(:disabled)`-guarded sibling. Same assertion idiom as
 * `connect-test-cta-designed-states.test.ts`.
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

describe('card-remove designed states (COCKPIT 6/6)', () => {
  it('rests on the state-responsive shape token with the radius/shadow transition', () => {
    const rule = ruleFor(css, '.card-remove {');
    expect(rule).toContain('border-radius: var(--shape-extra-small)');
    expect(rule).toContain(
      'transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard)',
    );
  });

  it('morphs shape and lifts on hover/focus-visible, keeping the danger fill', () => {
    const hover = ruleFor(css, '.card-remove:not(:disabled):hover');
    expect(hover).toContain('.card-remove:not(:disabled):focus-visible');
    expect(hover).toContain('background: var(--color-sev-high)');
    expect(hover).toContain('border-radius: var(--shape-extra-small-hover)');
    expect(hover).toContain('box-shadow: var(--elevation-level-1)');
  });

  it('flattens pressed on active', () => {
    const active = ruleFor(css, '.card-remove:not(:disabled):active');
    expect(active).toContain('border-radius: var(--shape-extra-small-pressed)');
    expect(active).toContain('box-shadow: none');
  });
});
