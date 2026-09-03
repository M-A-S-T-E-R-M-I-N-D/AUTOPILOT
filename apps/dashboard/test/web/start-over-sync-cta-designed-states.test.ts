// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * the project page's "↺ Start over" button (`.start-over button`) and the
 * "Sync to GitHub" button (`.github-sync button`, shell.ts) are bordered chip
 * CTAs that shipped with a color-only hover — no radius/shadow transition, no
 * shape-morph, no elevation lift, no pressed state — while `.github-pr-summary`
 * right beside them carries the full MX pair. They rest on `--radius-md`, so
 * they join via the `--shape-small` family (both 8px — the `.flight-head`
 * precedent), not the `--shape-extra-small` one. The sync button is disabled
 * mid-request (`b.disabled = true` in the click handler), so states are
 * guarded with `:not(:disabled)` and `:disabled` quiets like its siblings.
 * Same assertion idiom as `tour-browse-cta-designed-states.test.ts`.
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

describe('start-over + github-sync CTA designed states (COCKPIT 6/6)', () => {
  it('start-over button rests on the state-responsive shape token with the radius/shadow transition', () => {
    const rule = ruleFor(css, '.start-over button {');
    expect(rule).toContain('border-radius: var(--shape-small)');
    expect(rule).toContain(
      'transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard)',
    );
  });

  it('start-over button morphs shape and lifts on hover/focus-visible, flattens pressed on active', () => {
    const hover = ruleFor(css, '.start-over button:not(:disabled):hover');
    expect(hover).toContain('.start-over button:not(:disabled):focus-visible');
    expect(hover).toContain('border-radius: var(--shape-small-hover)');
    expect(hover).toContain('box-shadow: var(--elevation-level-1)');

    const active = ruleFor(css, '.start-over button:not(:disabled):active');
    expect(active).toContain('border-radius: var(--shape-small-pressed)');
    expect(active).toContain('box-shadow: none');
  });

  it('github-sync button rests on the state-responsive shape token with the radius/shadow transition', () => {
    const rule = ruleFor(css, '.github-sync button {');
    expect(rule).toContain('border-radius: var(--shape-small)');
    expect(rule).toContain(
      'transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard)',
    );
  });

  it('github-sync button morphs shape and lifts on hover/focus-visible, flattens pressed on active', () => {
    const hover = ruleFor(css, '.github-sync button:not(:disabled):hover');
    expect(hover).toContain('.github-sync button:not(:disabled):focus-visible');
    expect(hover).toContain('border-radius: var(--shape-small-hover)');
    expect(hover).toContain('box-shadow: var(--elevation-level-1)');

    const active = ruleFor(css, '.github-sync button:not(:disabled):active');
    expect(active).toContain('border-radius: var(--shape-small-pressed)');
    expect(active).toContain('box-shadow: none');
  });

  it('github-sync button quiets while disabled (mid-sync)', () => {
    const rule = ruleFor(css, '.github-sync button:disabled');
    expect(rule).toContain('opacity: 0.6');
    expect(rule).toContain('cursor: default');
  });
});
