// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * HIERARCHY CENSUS (epic 0030 slice 3, docs/HIERARCHY.md): the fleet home's
 * DOM order IS its visual order (WCAG 1.3.2 / 2.4.3 — never reordered by
 * CSS), and that order ranks the product's one verb first. The Fly bar leads,
 * the search line follows it, the fixed status slot (totals) comes next, then
 * live work, the performance tiles, the project cards, and only then what
 * waits on a human (Keeper) and the community. Before this slice the Fly bar
 * sat fourth, under "Contributor standing" — the README's own frames showed
 * it. The project page keeps the same skeleton (its subjects are tabs, so
 * only within-subject order is visible there).
 */

import { describe, it, expect } from 'vitest';
import { renderShell } from '../../src/web/shell.js';

/** Top-level ids in the order the fleet home must render them. */
const FLEET_ORDER = [
  'flightbar',
  'searchbar',
  'totals',
  'live-workers',
  'stat-tiles',
  'fleet',
  'pr-review-panel',
  'pool-client-panel',
  'ci-status-panel',
  'fleet-wisdom',
  'contributor-issue-list-panel',
  'publicity-panel',
  'contributor-standing-panel',
] as const;

function positions(html: string, ids: readonly string[]): number[] {
  return ids.map((id) => {
    const at = html.indexOf(` id="${id}"`);
    if (at < 0) throw new Error(`id="${id}" is not in the shell`);
    return at;
  });
}

describe('the fleet home ranks its subjects by importance, in DOM order', () => {
  const html = renderShell();

  it('renders every ranked section exactly once', () => {
    for (const id of FLEET_ORDER) {
      expect(html.split(` id="${id}"`).length - 1, id).toBe(1);
    }
  });

  it('keeps the pinned order: Fly bar, search, totals, live work, tiles, cards, Keeper, Community', () => {
    const at = positions(html, FLEET_ORDER);
    for (let i = 1; i < at.length; i++) {
      expect(at[i], `${FLEET_ORDER[i]} after ${FLEET_ORDER[i - 1]}`).toBeGreaterThan(at[i - 1]!);
    }
  });

  it('puts the one verb above the fixed status slot and above the leaderboard', () => {
    const [bar, totals, standing] = positions(html, [
      'flightbar',
      'totals',
      'contributor-standing-panel',
    ]);
    expect(bar).toBeLessThan(totals!);
    expect(bar).toBeLessThan(standing!);
  });

  it('places the masthead and the subject nav before any ranked section', () => {
    const nav = html.indexOf(' id="subject-nav"');
    const masthead = html.indexOf('class="masthead"');
    const [bar] = positions(html, ['flightbar']);
    expect(masthead).toBeGreaterThan(-1);
    expect(nav).toBeGreaterThan(masthead);
    expect(bar).toBeGreaterThan(nav);
  });
});
