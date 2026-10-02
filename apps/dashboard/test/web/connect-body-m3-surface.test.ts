// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * M3 component pass v2 (web-msm66jkf-1v7wk6), next slice after `.card`
 * (0b8da42): the account "connect" popover was the one surface still
 * carrying a raw, un-tokenized `box-shadow` (`0 10px 34px rgba(0,0,0,0.28)`)
 * plus the legacy `--radius-lg` corner — everything INSIDE it (its buttons)
 * already used the M3 elevation tokens. This moves the popover itself onto
 * `--shape-medium` (numerically identical to the old `--radius-lg`, so no
 * visual size change) and `--elevation-level-2` (M3's menu/overlay tier —
 * m3.material.io/styles/elevation — one step above the resting `.card`'s
 * level-1, since it floats above page content rather than sitting in flow).
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

function ruleFor(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

describe('connect popover M3 surface', () => {
  it('uses the M3 shape token, not the legacy plain radius token', () => {
    const rule = ruleFor(layoutCss(), '.connect-body');
    expect(rule).toContain('var(--shape-medium)');
    expect(rule).not.toContain('var(--radius-lg)');
  });

  it('uses the M3 elevation token, not a raw hardcoded shadow', () => {
    const rule = ruleFor(layoutCss(), '.connect-body');
    expect(rule).toContain('box-shadow: var(--elevation-level-2)');
    expect(rule).not.toContain('rgba(0, 0, 0, 0.28)');
  });
});

describe('connect popover never outgrows the viewport (operator catch, 2026-10-02)', () => {
  // The Connect panel with its report form open ran past the bottom of a
  // phone sheet and a 330px desktop menu alike, and the page's own scroll
  // never reaches a fixed or masthead-anchored box.
  it('the phone sheet caps its block size under its top offset and scrolls inside', () => {
    const rule = ruleFor(layoutCss(), '.connect-body');
    expect(rule).toContain('position: fixed');
    expect(rule).toContain('max-block-size: calc(100dvh - 6.5rem - var(--space-3))');
    expect(rule).toContain('overflow-y: auto');
    expect(rule).toContain('overscroll-behavior: contain');
  });

  it('the md menu keeps the cap, leaving the masthead its own height', () => {
    const css = layoutCss();
    const start = css.indexOf('.connect-body { position: absolute');
    expect(start).toBeGreaterThanOrEqual(0);
    const rule = css.slice(start, css.indexOf('}', start) + 1);
    expect(rule).toContain('max-block-size: calc(100dvh - 8rem)');
  });
});
