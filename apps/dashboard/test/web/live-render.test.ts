// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression: the live stream re-renders the fleet on every tick, and an earlier
 * version rebuilt every card from scratch — so a project's <details> panel snapped
 * shut ~1.5s after the user opened it. This drives the REAL client bundle through
 * two renders and asserts an opened panel stays open across the refresh.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
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
  firings: 1,
  shipped: 1,
  cost: 0.1,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [{ tool: 'Read', target: 'src/a.ts', kind: 'file', phase: 'orient', at: 1 }],
  tasks: [],
};

function stateWith(overrides: Record<string, unknown>) {
  return {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 1,
      needsYou: 0,
      firings: 1,
      shipped: 1,
      openFindings: 0,
      cost: 0.1,
    },
    projects: [PROJECT],
    empty: false,
    ...overrides,
  };
}

describe('live re-render', () => {
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

  it('preserves an opened <details> across a real data change (no snap-shut)', async () => {
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1); // flush the immediate first paint

    const det = document.querySelector('.card details.detail') as HTMLDetailsElement | null;
    expect(det).not.toBeNull();
    det!.open = true; // the user opens the panel

    // A genuine change (a firing shipped) forces a rebuild on the next refresh.
    current = stateWith({
      projects: [{ ...PROJECT, firings: 2, shipped: 2 }],
      totals: { ...stateWith({}).totals, firings: 2, shipped: 2 },
    });
    await vi.advanceTimersByTimeAsync(4000);

    const after = document.querySelector('.card details.detail') as HTMLDetailsElement | null;
    expect(after).not.toBeNull();
    expect(after!.open).toBe(true); // still open — preserved across the rebuild
  });

  it('leaves an untouched project card in place when a sibling card changes', async () => {
    current = stateWith({
      totals: { ...stateWith({}).totals, projects: 2 },
      projects: [PROJECT, { ...PROJECT, id: 'p2', name: 'Beta' }],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const cardsBefore = document.querySelectorAll('.card');
    expect(cardsBefore.length).toBe(2);
    const untouched = cardsBefore[1]; // p2 — will not change on the next tick
    const scrollableInUntouched = untouched!.querySelector('.docs-viewer-body, .phase-acts');
    if (scrollableInUntouched) (scrollableInUntouched as HTMLElement).scrollTop = 42;

    // Only p1 changes (a firing shipped); p2's data is byte-identical.
    current = stateWith({
      totals: { ...stateWith({}).totals, projects: 2, firings: 2, shipped: 2 },
      projects: [
        { ...PROJECT, firings: 2, shipped: 2 },
        { ...PROJECT, id: 'p2', name: 'Beta' },
      ],
    });
    await vi.advanceTimersByTimeAsync(4000);

    const cardsAfter = document.querySelectorAll('.card');
    expect(cardsAfter.length).toBe(2);
    // The untouched card is the SAME DOM node — never torn down and rebuilt —
    // so scroll position, focus, and selection inside it survive the tick.
    expect(cardsAfter[1]).toBe(untouched);
    expect((cardsAfter[1] as HTMLElement).dataset['project']).toBe('p2');
  });

  it('does NOT rebuild the DOM when the data is unchanged (no flash)', async () => {
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const firstCard = document.querySelector('.card');
    expect(firstCard).not.toBeNull();

    // Several more ticks with identical data (only generatedAt would differ).
    current = stateWith({ generatedAt: 999 });
    await vi.advanceTimersByTimeAsync(4000);

    // The very same card node is still there — it was never torn down + rebuilt.
    expect(document.querySelector('.card')).toBe(firstCard);
  });
});
