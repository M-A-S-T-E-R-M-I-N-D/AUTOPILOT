// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * `.publicity-link-live` — the PUBLICITY panel's live affordance chips
 * (repo / watch / star / discussions, real `<a href target="_blank">`
 * anchors built by `features/publicity.ts`) — paired hover with
 * focus-visible but carried only an accent recolor (border + text): no
 * shape-morph, no elevation cue, no pressed state, no transition, while its
 * structural twin `.docs-file` (an outline chip on the same
 * `--shape-extra-small` rest radius with the same accent-border hover) reads
 * the full MX designed-states language. It escaped the firing-348
 * `cursor: pointer` audit because an anchor gets its pointer cursor from the
 * UA and never declares one in CSS — the same blind spot that hid
 * `.card-link` / `.back a` from the earlier surveys.
 *
 * The dormant variant (`.publicity-link-dormant`, an `aria-disabled` `<span>`
 * with `cursor: default`) shares the `.publicity-link` base rule and must
 * stay state-free — the idiom lives on the `-live` class alone, so the
 * transition sits on `.publicity-link-live`, not on the shared base.
 * Same assertion idiom as `outline-chip-designed-states.test.ts`.
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
const selector = '.publicity-link-live';

describe('publicity link chip designed states (COCKPIT 6/6)', () => {
  it('rests on the extra-small shape token (shared base) with the transition on the live variant', () => {
    const base = ruleFor(css, '.publicity-link');
    expect(base).toContain('border-radius: var(--shape-extra-small)');

    const rest = ruleFor(css, selector);
    expect(rest).toContain(
      'transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard)',
    );
  });

  it('morphs + lifts on hover/focus-visible, keeping its accent recolor', () => {
    const hover = ruleFor(css, `${selector}:hover`);
    expect(hover).toContain(`${selector}:focus-visible`);
    expect(hover).toContain('border-color: var(--color-accent)');
    expect(hover).toContain('color: var(--color-accent)');
    expect(hover).toContain('border-radius: var(--shape-extra-small-hover)');
    expect(hover).toContain('box-shadow: var(--elevation-level-1)');
  });

  it('flattens pressed on active with the body every extra-small sibling shares', () => {
    const active = ruleFor(css, `${selector}:active`);
    expect(active).toContain('border-radius: var(--shape-extra-small-pressed)');
    expect(active).toContain('box-shadow: none');

    // Byte-identical to .docs-file:active — the outline-chip twin — so the
    // pair cannot drift.
    const docsActive = ruleFor(css, '.docs-file:active');
    expect(active.slice(active.indexOf('{'))).toBe(docsActive.slice(docsActive.indexOf('{')));
  });

  // The dormant span is aria-disabled and cursor: default — a designed state
  // on it would promise an interaction that never comes. Neither the dormant
  // class nor the shared base may carry hover/focus/active.
  it('the dormant variant and the shared base stay state-free', () => {
    for (const cls of ['.publicity-link-dormant', '.publicity-link']) {
      for (const state of [':hover', ':focus-visible', ':active']) {
        expect(css, `${cls}${state} must not exist`).not.toContain(`${cls}${state}`);
      }
    }
  });
});
