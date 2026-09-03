// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * the masthead's pill family — `.switch button` (Theme switch), `.connect >
 * summary` (CONNECT popover toggle), and `.tour-btn` (Tour) — carried only a
 * text-color brightening on hover/focus-visible: no elevation cue, no pressed
 * state, no transition, while every other interactive control on the page
 * already reads the MX designed-states language. Shape-morph is deliberately
 * OUT for this family: `stateRadius` no-ops `full` radius (a pill has no
 * corner to morph — `packages/tokens/src/css.ts`), so there are no
 * `--shape-full-hover/pressed` tokens and the pills keep `--radius-full` in
 * every state. The pill idiom is therefore elevation alone: rest carries the
 * box-shadow transition, hover/focus-visible lift to `--elevation-level-1`,
 * `:active` flattens pressed — the same lift/flatten cycle the shape-morphing
 * siblings pair with their radius shift. Same assertion idiom as
 * `connect-test-cta-designed-states.test.ts`.
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

describe.each(['.switch button', '.connect > summary', '.tour-btn'])(
  'masthead pill designed states (COCKPIT 6/6): %s',
  (selector) => {
    it('rests as a pill with the elevation transition (no shape-morph on full radius)', () => {
      const rest = ruleFor(css, selector);
      expect(rest).toContain('border-radius: var(--radius-full)');
      expect(rest).toContain(
        'transition: box-shadow var(--duration-short2) var(--easing-standard)',
      );
    });

    it('lifts on hover/focus-visible, flattens pressed on active', () => {
      const hover = ruleFor(css, `${selector}:hover`);
      expect(hover).toContain(`${selector}:focus-visible`);
      expect(hover).toContain('box-shadow: var(--elevation-level-1)');

      const active = ruleFor(css, `${selector}:active`);
      expect(active).toContain('box-shadow: none');
    });
  },
);
