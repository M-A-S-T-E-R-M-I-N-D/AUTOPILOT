// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 4, `docs/epics/0005-cockpit-redesign.md`):
 * the epic's "depth as material" contract expresses elevation on raised dark
 * surfaces with layered shadow + border-light, keeping M3's elevation steps as
 * the mechanical scale. Every other raised card-like panel on the dashboard
 * (`.flight-summary`, `.landing-panel`, `.round-panel`, `.heatmap-wrap`, …)
 * already rests on `--elevation-level-1`, but the project page's live worker
 * card (`.live-worker`) shipped as the one raised, bordered surface with no
 * elevation at all — border + raised background, yet optically flat. Same
 * assertion idiom as `worker-card-tabular-numerals.test.ts`: find the rule in
 * the emitted stylesheet, pin its tokens.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

function ruleFor(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `rule "${selector}" exists`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

const css = layoutCss();

describe('worker-card depth as material (COCKPIT 4/6)', () => {
  it('the live worker card rests on the same elevation step as sibling raised panels', () => {
    const rule = ruleFor(css, '.live-worker');
    expect(rule).toContain('box-shadow: var(--elevation-level-1)');
  });
});
