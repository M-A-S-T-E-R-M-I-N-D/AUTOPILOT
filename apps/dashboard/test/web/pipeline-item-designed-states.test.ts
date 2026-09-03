// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * `.pipeline-item` — the pipeline tree's `role="treeitem"` rows
 * (`pipeline-tree-html.ts`, selection wired by `features/pipeline.ts`) —
 * already paired hover with focus-visible (the D4 pin in `layout-css.test.ts`
 * tracks that) but carried only an accent border-color recolor: no
 * shape-morph, no elevation cue, no pressed state, no transition, while its
 * structural twins (`.phase`, the phase-rail segment; `.report-ctx-menu-item`,
 * the report context-menu row — both transparent-bordered rows that recolor
 * their border on hover) already read the full MX designed-states language.
 * Rest radius is already `--shape-extra-small`, so only the transition is
 * added at rest — rest-state pixels do not move. It is a `<div>`, never
 * disabled, so no `:not(:disabled)` guard. Same assertion idiom as
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
const selector = '.pipeline-item';

describe('pipeline tree item designed states (COCKPIT 6/6)', () => {
  it('rests on the extra-small shape token with the shape-morph + elevation transition', () => {
    const rest = ruleFor(css, selector);
    expect(rest).toContain('border-radius: var(--shape-extra-small)');
    expect(rest).toContain(
      'transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard)',
    );
  });

  it('morphs + lifts on hover/focus-visible, keeping its accent-border recolor', () => {
    const hover = ruleFor(css, `${selector}:hover`);
    expect(hover).toContain(`${selector}:focus-visible`);
    expect(hover).toContain('border-color: var(--color-accent)');
    expect(hover).toContain('border-radius: var(--shape-extra-small-hover)');
    expect(hover).toContain('box-shadow: var(--elevation-level-1)');
  });

  it('flattens pressed on active with the body every extra-small sibling shares', () => {
    const active = ruleFor(css, `${selector}:active`);
    expect(active).toContain('border-radius: var(--shape-extra-small-pressed)');
    expect(active).toContain('box-shadow: none');

    // Byte-identical to .phase:active — the row twin — so the pair cannot drift.
    const phaseActive = ruleFor(css, '.phase:active');
    expect(active.slice(active.indexOf('{'))).toBe(phaseActive.slice(phaseActive.indexOf('{')));
  });

  // `[aria-selected='true']` (the selected node) and `[data-connected='true']`
  // (its neighbours) must keep winning over the hover pair so a selected row
  // keeps its surface fill through hover/press — rule order is the whole
  // mechanism, so pin it, the same way outline-chip pins `.docs-file.on`.
  it('the selected/connected rules stay after the hover pair', () => {
    const hoverIdx = css.indexOf(`${selector}:hover`);
    const selectedIdx = css.indexOf(`${selector}[aria-selected='true'] {`);
    const connectedIdx = css.indexOf(`${selector}[data-connected='true'] {`);
    expect(hoverIdx).toBeGreaterThanOrEqual(0);
    expect(selectedIdx).toBeGreaterThan(hoverIdx);
    expect(connectedIdx).toBeGreaterThan(selectedIdx);
  });
});
