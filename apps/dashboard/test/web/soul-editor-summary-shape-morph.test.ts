// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 4, `docs/epics/0005-cockpit-redesign.md`):
 * the SOUL editor's own disclosure toggle (`.soul-editor-summary`, "✎ view/edit
 * SOUL") was the one SOUL-surface control left with only a `cursor: pointer` —
 * no hover, no transition, no shape morph, no elevation — while its sibling
 * `.soul-proposal-summary` (the ratify/dismiss proposal disclosure) and the
 * board's task buttons already carry the MX shape-morph + elevation language.
 * Same pattern here: a short transition plus `--shape-extra-small-hover`/
 * `-pressed` corner-radius shift and an elevation bump on hover, flattened
 * again on press.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

function ruleFor(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

describe('.soul-editor-summary shape morph', () => {
  const css = layoutCss();

  it('transitions border-radius and box-shadow on the rest state', () => {
    const rule = ruleFor(css, '.soul-editor-summary');
    expect(rule).toContain('transition:');
    expect(rule).toContain('border-radius');
  });

  it('shifts to the MX hover radius on hover/focus-visible', () => {
    const rule = ruleFor(css, '.soul-editor-summary:hover, .soul-editor-summary:focus-visible');
    expect(rule).toContain('var(--shape-extra-small-hover)');
    expect(rule).toContain('var(--elevation-level-1)');
  });

  it('shifts to the MX pressed radius on :active', () => {
    const rule = ruleFor(css, '.soul-editor-summary:active');
    expect(rule).toContain('var(--shape-extra-small-pressed)');
  });
});
