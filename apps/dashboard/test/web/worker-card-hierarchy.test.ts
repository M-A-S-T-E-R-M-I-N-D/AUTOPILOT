// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 4, `docs/epics/0005-cockpit-redesign.md`):
 * the epic's hierarchy contract wants each surface's content stronger than its
 * chrome, VERIFIED per surface. Board rows, flight-log rows, and the phase
 * rail each carry a pin (`board-row-hierarchy.test.ts`,
 * `flightlog-row-hierarchy.test.ts`, `phase-rail-hierarchy.test.ts`) — the
 * worker card was the last of slice 4's four named surfaces whose pair held
 * unverified. Its content is the narrator sentence (`.live-worker-narrator`,
 * explicit `--color-text`); its chrome is the probable-task guess
 * (`.live-worker-guess`) and the count/turn metric lines, which read muted
 * through the `muted` class their markup carries (`shell.ts`). Same assertion
 * idiom as the sibling pins: find the rule in the emitted stylesheet, pin its
 * tokens.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

/**
 * The flightlog-row idiom, hardened for selectors that also appear as the
 * TAIL of a grouped rule (`.firing-headline, …, .live-worker-guess { … }` at
 * the stylesheet top would shadow a bare indexOf): anchor the match to a rule
 * whose prelude starts at a line boundary with exactly this selector.
 */
function ruleFor(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped} \\{[^}]*\\}`, 'm').exec(css);
  expect(match, `rule "${selector}" exists`).not.toBeNull();
  return (match as RegExpExecArray)[0];
}

const css = layoutCss();

describe('worker card hierarchy (COCKPIT 4/6)', () => {
  it('the narrator sentence reads as content, explicitly at full text strength', () => {
    const rule = ruleFor(css, '.live-worker-narrator');
    expect(rule).toContain('color: var(--color-text)');
  });

  it('the probable-task guess stays quiet, keeping the contrast pair', () => {
    const rule = ruleFor(css, '.live-worker-guess');
    expect(rule).toContain('color: var(--color-text-muted)');
  });

  it('the muted chrome class the count/turn lines carry stays muted', () => {
    const rule = ruleFor(css, '.muted');
    expect(rule).toContain('color: var(--color-text-muted)');
  });
});
