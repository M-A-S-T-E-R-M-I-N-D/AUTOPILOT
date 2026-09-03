// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 5, `docs/epics/0005-cockpit-redesign.md`):
 * "Charts and stat tiles follow the same language (... designed empty/loading
 * states) — dataviz is part of the system, not an afterthought." The firing
 * replay panel's trace/diff loading indicators (`.firing-trace-loading`, the
 * "Loading full trace…" / "Loading diff…" text `shell.ts`'s
 * `firingActivityExtra` renders while a trace or diff page is still fetching)
 * shipped as plain `.muted` text with NO dedicated rule at all — an undesigned
 * loading state: it read identically to any other muted caption, with nothing
 * signalling that work was in flight. This pins the designed treatment red-
 * first, the same stylesheet-assertion idiom as
 * `charts-cockpit-language.test.ts`: it now shares its firing-replay siblings'
 * indentation and breathes via the shared `live-pulse` opacity animation so it
 * reads as ACTIVE, with the global `prefers-reduced-motion` block collapsing
 * that breath to static.
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

describe('firing-trace loading state (COCKPIT 5/6)', () => {
  it('reads as an active loading affordance via the shared live-pulse breath', () => {
    expect(ruleFor(css, '.firing-trace-loading')).toContain('animation: live-pulse');
  });

  it("shares its firing-replay siblings' indentation", () => {
    // .firing-diff-empty / .firing-detail sit at margin-inline-start: --space-3
    // under the firing row — the loading text now aligns with them instead of
    // hanging flush.
    expect(ruleFor(css, '.firing-trace-loading')).toContain('margin-inline-start: var(--space-3)');
  });

  it('collapses the breath under prefers-reduced-motion', () => {
    // indexOf, not slice-and-compare: a -1 fed to slice() yields the last
    // character, which is never '' — the old guard could not go red.
    const at = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(at, 'a reduced-motion guard exists').toBeGreaterThanOrEqual(0);
    expect(css.slice(at)).toContain('animation: none !important');
  });
});
