// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0018 "calm cockpit" slice 2 (many-lanes view): a project running
 * several concurrent worktree lanes used to collapse into ONE reported
 * "live firing" card (board web-mtbp0t86-rnimyi) even though `shared/
 * live-firing.ts`'s `liveFiringsOf` already computed every lane. This drives
 * the REAL client bundle in jsdom (same pattern as worker-task.test.ts) to
 * prove the worker section now renders a compact card PER LANE once more
 * than one is live, while a single-lane project keeps the existing
 * `.live-worker` card completely unchanged (regression guard for its own
 * dedicated test suite).
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
  languages: [],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: false,
  firings: 0,
  shipped: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: null,
  activity: [
    { tool: 'Read', target: 'src/a.ts', kind: 'file', phase: 'orient', at: 1, firingId: 'f1' },
  ],
  flightLog: [],
  tasks: [],
};

function stateWith(project: Record<string, unknown>) {
  return {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 1,
      needsYou: 0,
      firings: 0,
      shipped: 0,
      openFindings: 0,
      cost: 0,
    },
    projects: [{ ...BASE_PROJECT, ...project }],
    empty: false,
  };
}

describe('the many-lanes grid', () => {
  let current: ReturnType<typeof stateWith>;

  beforeEach(() => {
    vi.useFakeTimers();
    document.open();
    document.write(renderShell());
    document.close();
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => current }) as unknown as Response,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders one compact lane card per concurrent lane, newest lane first', async () => {
    current = stateWith({
      activity: [
        {
          tool: 'Read',
          target: 'src/b.ts',
          kind: 'file',
          phase: 'do',
          at: 4,
          firingId: 'f2',
          model: 'claude-sonnet-5',
        },
        {
          tool: 'Write',
          target: 'src/a.ts',
          kind: 'file',
          phase: 'orient',
          at: 3,
          firingId: 'f2',
          model: 'claude-sonnet-5',
        },
        {
          tool: 'Read',
          target: 'src/c.ts',
          kind: 'file',
          phase: 'gate',
          at: 2,
          firingId: 'f1',
          model: 'claude-opus-5',
        },
        {
          tool: 'Edit',
          target: 'src/d.ts',
          kind: 'file',
          phase: 'do',
          at: 1,
          firingId: 'f1',
          model: 'claude-opus-5',
        },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    // The single-lane card must be fully replaced, not shown alongside the grid.
    expect(document.querySelector('.live-worker')).toBeNull();

    const cards = Array.from(document.querySelectorAll('.lane-card'));
    expect(cards).toHaveLength(2);

    const [newest, oldest] = cards;
    expect(newest!.querySelector('.live-phase-do')).not.toBeNull();
    expect(newest!.textContent).toContain('claude-sonnet-5');
    expect(newest!.textContent).toContain('Read');
    expect(newest!.textContent).toContain('src/b.ts');

    expect(oldest!.querySelector('.live-phase-gate')).not.toBeNull();
    expect(oldest!.textContent).toContain('claude-opus-5');
    expect(oldest!.textContent).toContain('Read');
    expect(oldest!.textContent).toContain('src/c.ts');
  });

  it('leaves a single-lane project rendering the existing .live-worker card, unchanged', async () => {
    current = stateWith({});
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.live-worker')).not.toBeNull();
    expect(document.querySelector('.lane-grid')).toBeNull();
    expect(document.querySelectorAll('.lane-card')).toHaveLength(0);
  });

  it('gives the lane grid an accessible group label', async () => {
    current = stateWith({
      activity: [
        { tool: 'Read', target: 'src/b.ts', kind: 'file', phase: 'do', at: 2, firingId: 'f2' },
        { tool: 'Read', target: 'src/c.ts', kind: 'file', phase: 'gate', at: 1, firingId: 'f1' },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const grid = document.querySelector('.lane-grid');
    expect(grid?.getAttribute('role')).toBe('group');
    expect(grid?.getAttribute('aria-label')).toBe("Who's flying now");
  });

  it('every focusable line in a lane card is keyboard-reachable (roving tabindex seeded)', async () => {
    current = stateWith({
      activity: [
        { tool: 'Read', target: 'src/b.ts', kind: 'file', phase: 'do', at: 2, firingId: 'f2' },
        { tool: 'Read', target: 'src/c.ts', kind: 'file', phase: 'gate', at: 1, firingId: 'f1' },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const cards = Array.from(document.querySelectorAll('.lane-card'));
    for (const card of cards) {
      const focusables = Array.from(card.querySelectorAll('[tabindex]'));
      expect(focusables.length).toBeGreaterThan(0);
      expect(focusables[0]!.getAttribute('tabindex')).toBe('0');
      expect(focusables.slice(1).every((el) => el.getAttribute('tabindex') === '-1')).toBe(true);
    }
  });
});
