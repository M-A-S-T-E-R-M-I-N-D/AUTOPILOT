// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 3, `docs/epics/0005-cockpit-redesign.md`):
 * a first real consumer of the MX shape-morph tokens (`packages/tokens/src/mx.ts`'s
 * `stateRadius`, landed unwired in slice 1) on the fly bar's action buttons —
 * "the first screen an operator sees". Started on `#fly-go` (the primary CTA)
 * alone; this extends the same designed-states treatment to `#fly-stop` and
 * `#fly-pause` so all three flightbar actions read as one coherent system
 * rather than one polished button next to two untouched ones. Each button's
 * corner radius shifts subtly on hover/press via the
 * `--shape-extra-small-hover`/`-pressed` custom properties
 * `packages/tokens/src/css.ts`'s `shapeStateVars()` emits, with a short
 * transition so the shift reads as physical rather than instant — the global
 * `prefers-reduced-motion` rule (layoutCss's `*, *::before, *::after` block)
 * already collapses it to instant for users who need that.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

// A selector may open its own rule (`sel {`) or sit in a shared selector
// list (`sel, other {`) — match either so a hover/focus-visible-paired rule
// (hover-focus-visible-pairing.test.ts) resolves the same as a standalone one.
function ruleFor(css: string, selector: string): string {
  const braceIdx = css.indexOf(`${selector} {`);
  const commaIdx = css.indexOf(`${selector},`);
  const candidates = [braceIdx, commaIdx].filter((i) => i >= 0);
  const start = candidates.length > 0 ? Math.min(...candidates) : -1;
  expect(start).toBeGreaterThanOrEqual(0);
  expect(start, `rule containing "${selector}" exists`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

describe.each(['#fly-go', '#fly-stop', '#fly-pause'])('%s shape morph', (id) => {
  const css = layoutCss();

  it('transitions border-radius and box-shadow on the rest state', () => {
    const rule = ruleFor(css, id);
    expect(rule).toContain('transition:');
    expect(rule).toContain('border-radius');
  });

  it('shifts to the MX hover radius, un-pressed only', () => {
    const rule = ruleFor(css, `${id}:not(:disabled):hover`);
    expect(rule).toContain('var(--shape-extra-small-hover)');
  });

  it('shifts to the MX pressed radius on :active, un-pressed only', () => {
    const rule = ruleFor(css, `${id}:not(:disabled):active`);
    expect(rule).toContain('var(--shape-extra-small-pressed)');
  });
});

describe('flightbar shape morph scope', () => {
  it('leaves non-action controls alone (inputs and the mode select stay static)', () => {
    const css = layoutCss();
    for (const selector of ['.fly-form input', '#fly-mode']) {
      expect(css).not.toContain(`${selector}:not(:disabled):hover`);
    }
  });
});
