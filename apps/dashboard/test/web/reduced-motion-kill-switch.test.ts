// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * "prefers-reduced-motion honored" is the sweep's third pillar, and the whole
 * pillar rests on ONE rule — the global kill switch in layoutCss's
 * accessibility block. It must reach every element AND pseudo-element (the
 * M3 state layers live on `::after`), and its declarations must carry
 * `!important`: the block sits mid-sheet while feature CSS with its own
 * transitions/animations keeps being appended after it, so without
 * `!important` any later equal-specificity declaration would win and motion
 * would leak through for exactly the users who asked it to stop.
 *
 * Until now the pillar was pinned only incidentally: two designed-state tests
 * mention the block, and the one existence guard
 * (`firing-trace-loading-state.test.ts`) was vacuous — `indexOf` returning -1
 * fed `slice(-1)`, whose one-character tail can never equal `''`. This pin
 * brace-walks the block (the `compositor-only-transitions.test.ts` idiom) and
 * returns a real absence signal, self-checked red-capable below.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

/** Brace-walked body of the first `@media (prefers-reduced-motion: reduce)`
 *  block, or null when the stylesheet carries none. */
function killSwitchBody(cssText: string): string | null {
  const at = cssText.indexOf('@media (prefers-reduced-motion: reduce)');
  if (at < 0) return null;
  const start = cssText.indexOf('{', at) + 1;
  let depth = 1;
  let i = start;
  while (i < cssText.length && depth > 0) {
    if (cssText[i] === '{') depth += 1;
    else if (cssText[i] === '}') depth -= 1;
    i += 1;
  }
  return cssText.slice(start, i - 1);
}

const css = layoutCss();

describe('reduced-motion kill switch (COCKPIT 6/6)', () => {
  it('the stylesheet carries a prefers-reduced-motion block', () => {
    expect(
      killSwitchBody(css),
      'a @media (prefers-reduced-motion: reduce) block exists',
    ).not.toBeNull();
  });

  it('reaches every element and pseudo-element (M3 state layers ride ::after)', () => {
    expect(killSwitchBody(css)).toContain('*, *::before, *::after {');
  });

  it('kills transitions, animations, and smooth scrolling past any later-appended rule', () => {
    const body = killSwitchBody(css) ?? '';
    expect(body).toContain('transition: none !important');
    expect(body).toContain('animation: none !important');
    expect(body).toContain('scroll-behavior: auto !important');
  });

  it('the locator reports absence instead of trailing garbage (red-capable proof)', () => {
    expect(killSwitchBody('.card { color: red; }')).toBeNull();
    expect(killSwitchBody('@media (prefers-reduced-motion: reduce) { * { opacity: 1; } }')).toBe(
      ' * { opacity: 1; } ',
    );
  });
});
