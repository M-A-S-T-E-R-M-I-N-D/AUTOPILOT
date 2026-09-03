// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 4, `docs/epics/0005-cockpit-redesign.md`):
 * the epic's hierarchy contract wants content to read stronger than its chrome
 * ("hero numbers vs. quiet labels" — scale/value contrast, never uniform
 * emphasis). The flight log's firing rows shipped hierarchy-flat: the
 * `.firing-toggle` row paints EVERYTHING — the firing headline (what the
 * firing actually shipped) plus its count/ago metadata — in one muted
 * `--color-text-muted`, so the content is indistinguishable from the chrome
 * around it. The cockpit reading: the headline rests at full text strength,
 * the row's metadata stays quiet. Same assertion idiom as
 * `worker-card-depth.test.ts`: find the rule in the emitted stylesheet, pin
 * its tokens.
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

describe('flight-log row hierarchy (COCKPIT 4/6)', () => {
  it('the firing headline reads as content, at full text strength', () => {
    const rule = ruleFor(css, '.firing-headline');
    expect(rule).toContain('color: var(--color-text)');
  });

  it('the row chrome around it stays quiet, keeping the contrast pair', () => {
    const rule = ruleFor(css, '.firing-toggle');
    expect(rule).toContain('color: var(--color-text-muted)');
  });
});
