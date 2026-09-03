// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * `.landing-group-toggle` — the LANDING panel's collapsed commit-group row
 * (a real `<button>` toggle, `features/landing.ts`'s landingCommitGroupNode)
 * — paired hover with focus-visible but carried only a border + surface-
 * raise recolor: no shape-morph, no elevation cue, no pressed state, no
 * transition. Its structural twin `.flight-head` (the flight log's own
 * group-row toggle: same full-width borderless button, same
 * border-color + `--color-surface-raised` hover wash) already reads the
 * full MX language on the `--shape-small` role. This pins the toggle
 * joining that exact idiom. Rest radius swaps `--radius-md` for
 * `--shape-small` (both 8px) so the state tokens pair with their own rest
 * value — rest-state pixels do not move. The toggle is never disabled, so
 * no `:not(:disabled)` guard. Same assertion idiom as
 * `outline-chip-designed-states.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

// A selector may open its own rule (`sel {`) or sit in a shared selector
// list (`sel, other {`) — match either, like hover-focus-visible-pairing's.
function ruleFor(css: string, selector: string): string {
  const braceIdx = css.indexOf(`${selector} {`);
  const commaIdx = css.indexOf(`${selector},`);
  const candidates = [braceIdx, commaIdx].filter((i) => i >= 0);
  const start = candidates.length > 0 ? Math.min(...candidates) : -1;
  expect(start, `rule containing "${selector}" exists`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

const css = layoutCss();
const selector = '.landing-group-toggle';

describe('landing group toggle designed states (COCKPIT 6/6)', () => {
  it('rests on the small shape token with the shape-morph + elevation transition', () => {
    const rest = ruleFor(css, selector);
    expect(rest).toContain('border-radius: var(--shape-small)');
    expect(rest).not.toContain('var(--radius-md)');
    expect(rest).toContain(
      'transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard)',
    );
  });

  it('morphs + lifts on hover/focus-visible, flattens pressed on active', () => {
    const hover = ruleFor(css, `${selector}:hover`);
    expect(hover).toContain(`${selector}:focus-visible`);
    // The recolor it already had stays — the MX language is added, not swapped in.
    expect(hover).toContain('border-color: var(--color-border)');
    expect(hover).toContain('background: var(--color-surface-raised)');
    expect(hover).toContain('border-radius: var(--shape-small-hover)');
    expect(hover).toContain('box-shadow: var(--elevation-level-1)');

    const active = ruleFor(css, `${selector}:active`);
    expect(active).toContain('border-radius: var(--shape-small-pressed)');
    expect(active).toContain('box-shadow: none');
  });

  it('mirrors its structural twin .flight-head state for state', () => {
    // Both are full-width borderless group-row toggles with the same hover
    // wash; if one idiom drifts the pair stops reading as ONE system.
    const twinHover = ruleFor(css, '.flight-head:hover');
    const twinActive = ruleFor(css, '.flight-head:active');
    const hover = ruleFor(css, `${selector}:hover`);
    const active = ruleFor(css, `${selector}:active`);
    const body = (rule: string): string => rule.slice(rule.indexOf('{'));
    expect(body(hover)).toBe(body(twinHover));
    expect(body(active)).toBe(body(twinActive));
  });
});
