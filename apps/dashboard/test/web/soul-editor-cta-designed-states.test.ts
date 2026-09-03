// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * `.soul-editor-form button` ("Propose edit") shares its base styling
 * (position/overflow/elevation/transition) with `.connect-form button`,
 * `.connect-login`, `.task-add button`, and `.inbox-add button`, but was left
 * out of the shared M3 filled-button state-layer group those siblings use
 * (`::after` shine overlay + hover/focus/active opacity + elevation
 * lift/flatten) — it rendered with zero hover or active feedback, a raw
 * browser default. Same assertion idiom as `execute-cta-designed-states.test.ts`.
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

describe('SOUL editor propose-edit CTA designed states (COCKPIT 6/6)', () => {
  it('joins the shared M3 filled-button state-layer overlay', () => {
    const rule = ruleFor(css, '.connect-form button::after');
    expect(rule).toContain('.soul-editor-form button::after');
  });

  it('gets the shine overlay on hover/focus/active', () => {
    expect(ruleFor(css, '.connect-form button:hover::after')).toContain(
      '.soul-editor-form button:hover::after',
    );
    expect(ruleFor(css, '.connect-form button:focus-visible::after')).toContain(
      '.soul-editor-form button:focus-visible::after',
    );
    expect(ruleFor(css, '.connect-form button:active::after')).toContain(
      '.soul-editor-form button:active::after',
    );
  });

  it('lifts elevation on hover and flattens on active/disabled', () => {
    const hoverRule = ruleFor(css, '.connect-form button:hover,');
    expect(hoverRule).toContain('.soul-editor-form button:hover');
    expect(hoverRule).toContain('var(--elevation-level-2)');

    const activeRule = ruleFor(css, '.connect-form button:active,');
    expect(activeRule).toContain('.soul-editor-form button:active');
    expect(activeRule).toContain('var(--elevation-level-0)');

    const disabledRule = ruleFor(css, '.connect-form button:disabled,');
    expect(disabledRule).toContain('.soul-editor-form button:disabled');
  });
});
