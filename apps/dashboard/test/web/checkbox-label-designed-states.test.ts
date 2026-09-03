// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * the checkbox-label trio — `.notify-enable` (notification settings, `shell.ts`),
 * `.github-sync-public` (CONNECT popover, `shell.ts`), `.release-ghrelease`
 * (release panel, `features/release.ts`) — each wraps a native checkbox
 * `<input>` in a muted-text `<label>` with `cursor: pointer` but carried NO
 * hover or focus feedback on the label itself: a mouse operator got no
 * highlight skimming the row, and a keyboard operator tabbing to the input
 * got no visual confirmation on the label it belongs to. Since focus lands
 * on the child `<input>`, not the label, this follows the `.fly-flight` /
 * `.card` idiom (`:hover, :focus-within`) rather than `:focus-visible` —
 * brightening text to `--color-text` on either, the same "plain content,
 * no shape to morph" treatment `.card-link` / `.back a` already use.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

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
const selectors = ['.notify-enable', '.github-sync-public', '.release-ghrelease'];

describe('checkbox label designed states (COCKPIT 6/6)', () => {
  it.each(selectors)('%s brightens text on hover/focus-within', (selector) => {
    const hover = ruleFor(css, `${selector}:hover`);
    expect(hover).toContain(`${selector}:focus-within`);
    expect(hover).toContain('color: var(--color-text)');
  });

  it('the three labels share the byte-identical hover/focus-within body', () => {
    const bodies = selectors.map((selector) => {
      const rule = ruleFor(css, `${selector}:hover`);
      return rule.slice(rule.indexOf('{'));
    });
    expect(bodies[1]).toBe(bodies[0]);
    expect(bodies[2]).toBe(bodies[0]);
  });
});
