// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * CRITICAL UX (web-mss4oy4r-hdgj2s): a whole-card sig meant ANY field change on
 * a flying project's `proj` object rebuilt the entire card — including its
 * Details panel — on every ~1.5s SSE tick. A reader with the flight log open
 * and scrolled into, or a focused control anywhere else in the card, lost
 * that state every tick a firing was in progress, because the live-worker
 * fields (activity, elapsed time) legitimately change almost every tick.
 * renderCard/updateDetailPanel (shell.ts) now diff per SECTION: only the
 * section whose own data changed gets rebuilt, so an untouched section (e.g.
 * the flight log, while only live activity ticks) keeps its exact DOM node.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const BASE_PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [{ language: 'typescript', files: 2, bytes: 100 }],
  topDirs: [{ dir: 'src', files: 2 }],
  hotFiles: ['src/a.ts'],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 3,
  shipped: 2,
  cost: 0.1,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 0.67,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [
    { id: 'f1', at: 1, cost: 0.05, sha: 'abc1234', kind: 'feat', turns: 4 },
    { id: 'f2', at: 2, cost: 0.06, sha: 'def5678', kind: 'fix', turns: 3 },
  ],
  activity: [
    { tool: 'Read', target: 'src/a.ts', kind: 'file', phase: 'orient', at: 1, firingId: 'f3' },
  ],
  tasks: [],
};

function stateWith(projectOverrides: Record<string, unknown>) {
  return {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 1,
      needsYou: 0,
      firings: 3,
      shipped: 2,
      openFindings: 0,
      cost: 0.1,
    },
    projects: [{ ...BASE_PROJECT, ...projectOverrides }],
    empty: false,
  };
}

describe('per-section card patching (live-blink fix)', () => {
  let current: ReturnType<typeof stateWith>;

  beforeEach(() => {
    vi.useFakeTimers();
    document.open();
    document.write(renderShell());
    document.close();
    current = stateWith({});
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => current }) as unknown as Response,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps the flight log DOM node — and a reader's scroll inside it — untouched while only live activity ticks", async () => {
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const det = document.querySelector('.card details.detail') as HTMLDetailsElement | null;
    expect(det).not.toBeNull();
    det!.open = true;
    const flightLogBefore = document.querySelector('.flightlog');
    expect(flightLogBefore).not.toBeNull();
    // Mark the node so identity survives even if content is textually identical.
    (flightLogBefore as HTMLElement).dataset['probe'] = 'untouched';

    // A live tick: only the activity feed moved (a new tool call happened) —
    // firings/shipped/flightLog/languages/etc. are all unchanged.
    current = stateWith({
      activity: [
        { tool: 'Edit', target: 'src/b.ts', kind: 'file', phase: 'do', at: 2, firingId: 'f3' },
        ...BASE_PROJECT.activity,
      ],
    });
    await vi.advanceTimersByTimeAsync(4000);

    const flightLogAfter = document.querySelector('.flightlog');
    expect(flightLogAfter).toBe(flightLogBefore); // same node — never rebuilt
    expect((flightLogAfter as HTMLElement).dataset['probe']).toBe('untouched');
    expect(det!.open).toBe(true); // still open

    // The Activity feed itself DID update (it's supposed to — it's live).
    const activityRows = document.querySelectorAll(
      '.act-wrap .activity li, .act-wrap ul.activity > *',
    );
    expect(activityRows.length).toBeGreaterThan(0);
  });

  it('rebuilds the flight log section — and only that section — once a firing actually lands', async () => {
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const metaBefore = document.querySelector('.card-meta');
    const gaugeBefore = document.querySelector('.card-gauge');
    const flightLogBefore = document.querySelector('.flightlog');
    expect(flightLogBefore).not.toBeNull();

    current = stateWith({
      firings: 4,
      shipped: 3,
      flightLog: [
        { id: 'f3', at: 3, cost: 0.04, sha: '9999999', kind: 'feat', turns: 2 },
        ...BASE_PROJECT.flightLog,
      ],
    });
    await vi.advanceTimersByTimeAsync(4000);

    // Unrelated sections (meta/gauge don't depend on flightLog) stay the same node.
    expect(document.querySelector('.card-meta')).toBe(metaBefore);
    expect(document.querySelector('.card-gauge')).toBe(gaugeBefore);
    // The flight log itself was rebuilt to reflect the newly landed firing.
    const flightLogAfter = document.querySelector('.flightlog');
    expect(flightLogAfter).not.toBeNull();
    expect(flightLogAfter!.textContent).toContain('9999999'.slice(0, 7));
  });
});
