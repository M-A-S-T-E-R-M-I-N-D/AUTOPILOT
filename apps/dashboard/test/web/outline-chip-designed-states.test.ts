// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * the outline-chip trio — `#fly-browse-btn` (the fly bar's Browse… button,
 * `shell.ts`), `.docs-file` (the Docs panel's per-file chips,
 * `features/docs-viewer.ts`), and `.report-dialog-close` (the report-from-
 * here dialog's ✕, `features/report-menu.ts`) — each paired hover with
 * focus-visible (the pairing pin tracks Browse) but carried only a color /
 * border-color / background recolor: no shape-morph, no elevation cue, no
 * pressed state, no transition, while their structural twins
 * (`.task-delete-btn`, `.replay-nav-btn`, `.gh-issue-form button`) already
 * read the full MX designed-states language. None of the three is ever
 * disabled, so no `:not(:disabled)` guard — the pairing pin's tracked
 * `#fly-browse-btn` selector keeps its shape. `.docs-file`'s rest radius
 * swaps `--radius-sm` for `--shape-extra-small` (both 4px) so the state
 * tokens pair with their own rest value — rest-state pixels do not move.
 * Same assertion idiom as `masthead-pill-designed-states.test.ts`.
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

describe.each(['#fly-browse-btn', '.docs-file', '.report-dialog-close'])(
  'outline-chip designed states (COCKPIT 6/6): %s',
  (selector) => {
    it('rests on the extra-small shape token with the shape-morph + elevation transition', () => {
      const rest = ruleFor(css, selector);
      expect(rest).toContain('border-radius: var(--shape-extra-small)');
      expect(rest).toContain(
        'transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard)',
      );
    });

    it('morphs + lifts on hover/focus-visible, flattens pressed on active', () => {
      const hover = ruleFor(css, `${selector}:hover`);
      expect(hover).toContain(`${selector}:focus-visible`);
      expect(hover).toContain('border-radius: var(--shape-extra-small-hover)');
      expect(hover).toContain('box-shadow: var(--elevation-level-1)');

      const active = ruleFor(css, `${selector}:active`);
      expect(active).toContain('border-radius: var(--shape-extra-small-pressed)');
      expect(active).toContain('box-shadow: none');
    });
  },
);

// `.docs-file.on` (the currently open doc) must keep winning over the hover
// pair so an open chip stays accent-colored through hover/press — the rule
// order is the whole mechanism, so pin it.
it('.docs-file.on stays after the hover pair so the open chip keeps its accent through hover', () => {
  const hoverIdx = css.indexOf('.docs-file:hover');
  const onIdx = css.indexOf('.docs-file.on {');
  expect(hoverIdx).toBeGreaterThanOrEqual(0);
  expect(onIdx).toBeGreaterThan(hoverIdx);
});
