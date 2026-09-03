// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The worker card's "what task is this firing on" line. With no focus lock
 * set, the card used to say nothing at all — this drives the REAL client
 * bundle in jsdom (same pattern as narrator.test.ts) to prove it now shows an
 * honestly-labeled guess (the queue head) instead, and swaps to the confirmed
 * title the moment a focus lock is set.
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

describe('the worker card task line', () => {
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

  it('shows the queue head as an honestly-labeled guess when nothing is focused', async () => {
    current = stateWith({
      tasks: [
        { id: 't1', title: 'Harden the guard hook', status: 'queued', focus: false },
        { id: 't2', title: 'Add docs', status: 'queued', focus: false },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const line = document.querySelector('.live-worker-guess');
    expect(line?.textContent).toBe('probably working: Harden the guard hook');
  });

  it('swaps to the exact title, unhedged, once a task is focused', async () => {
    current = stateWith({
      tasks: [
        { id: 't1', title: 'Harden the guard hook', status: 'queued', focus: false },
        { id: 't2', title: 'Add docs', status: 'queued', focus: true },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.live-worker-guess')).toBeNull();
    const lines = Array.from(document.querySelectorAll('.live-worker-line')).map(
      (n) => n.textContent,
    );
    expect(lines).toContain('🎯 working: Add docs');
  });

  it('explains the confirmed-focus line on hover+focus like its worker-card siblings', async () => {
    current = stateWith({
      tasks: [{ id: 't1', title: 'Add docs', status: 'queued', focus: true }],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const lines = Array.from(document.querySelectorAll('.live-worker-line'));
    const line = lines.find((n) => n.textContent === '🎯 working: Add docs');
    // D1 TAB-STOP ROVING: one Tab stop per live-worker card (its first line);
    // the arrow keys reach this line (live-worker-roving-tabindex.test.ts).
    expect(line?.getAttribute('tabindex')).toBe('-1');
    expect(line?.getAttribute('data-tip')).toContain('explicitly working on');
    expect(line?.getAttribute('aria-label')).toBe(line?.textContent);
  });

  it('explains the honestly-labeled guess line on hover+focus like its worker-card siblings', async () => {
    current = stateWith({
      tasks: [
        { id: 't1', title: 'Harden the guard hook', status: 'queued', focus: false },
        { id: 't2', title: 'Add docs', status: 'queued', focus: false },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const line = document.querySelector('.live-worker-guess');
    // D1 TAB-STOP ROVING: same roving shape as the confirmed-focus line above.
    expect(line?.getAttribute('tabindex')).toBe('-1');
    expect(line?.getAttribute('data-tip')).toContain('best guess');
    expect(line?.getAttribute('aria-label')).toBe(line?.textContent);
  });

  it('skips a needs_approval proposal — it is never actually worked', async () => {
    current = stateWith({
      tasks: [
        { id: 't1', title: 'Self-proposed idea', status: 'needs_approval', focus: false },
        { id: 't2', title: 'Real queued work', status: 'queued', focus: false },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const line = document.querySelector('.live-worker-guess');
    expect(line?.textContent).toBe('probably working: Real queued work');
  });

  it('renders no task line at all when the board has nothing workable', async () => {
    current = stateWith({
      tasks: [{ id: 't1', title: 'Awaiting approval', status: 'needs_approval', focus: false }],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.live-worker-guess')).toBeNull();
    const lines = Array.from(document.querySelectorAll('.live-worker-line')).map(
      (n) => n.textContent,
    );
    expect(lines.some((t) => (t || '').indexOf('working:') !== -1)).toBe(false);
  });
});
