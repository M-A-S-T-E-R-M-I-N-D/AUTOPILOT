// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * `.connect-test` — the CONNECT popover's "Test connection" and "Check for
 * updates" buttons (`shell.ts`'s `#connect-test`/`#gh-lts-check`) — shares its
 * outline-button shape (transparent background, `--color-border` border,
 * `--color-text` text) with `.gh-issue-form button` / `.tour-actions button` /
 * `.browse-actions button`, but shipped with a single static rule and zero
 * hover/focus/active feedback, a raw browser default next to its sibling
 * `.connect-login` (which DOES carry the filled-button state-layer group). It
 * joins the shape-morph + `--elevation-level-1` pair those outline siblings
 * use: radius morphs and lifts on hover/focus-visible, flattens pressed on
 * active. Same assertion idiom as `gh-issue-form-cta-designed-states.test.ts`.
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

describe('connect-test CTA designed states (COCKPIT 6/6)', () => {
  it('rests on the state-responsive shape token with the radius/shadow transition', () => {
    const rule = ruleFor(css, '.connect-test {');
    expect(rule).toContain('border-radius: var(--shape-extra-small)');
    expect(rule).toContain(
      'transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard)',
    );
  });

  it('morphs shape and lifts on hover/focus-visible, flattens pressed on active', () => {
    const hover = ruleFor(css, '.connect-test:not(:disabled):hover');
    expect(hover).toContain('.connect-test:not(:disabled):focus-visible');
    expect(hover).toContain('border-radius: var(--shape-extra-small-hover)');
    expect(hover).toContain('box-shadow: var(--elevation-level-1)');

    const active = ruleFor(css, '.connect-test:not(:disabled):active');
    expect(active).toContain('border-radius: var(--shape-extra-small-pressed)');
    expect(active).toContain('box-shadow: none');
  });
});
