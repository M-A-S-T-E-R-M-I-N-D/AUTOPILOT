// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The narrator line: a deterministic, model-free one-sentence summary of what
 * the live firing is doing right now, rendered on the worker card. Drives the
 * REAL client bundle in jsdom against a mocked /api/state, same pattern as
 * live-render.test.ts and office-map.test.ts.
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
  flightLog: [],
  activity: [],
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

describe('the narrator line', () => {
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

  it("renders a plain-language sentence for the live firing's latest action", async () => {
    current = stateWith({
      activity: [
        { tool: 'Edit', target: 'src/a.ts', kind: 'file', phase: 'do', at: 1, firingId: 'f1' },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const narrator = document.querySelector('.live-worker-narrator');
    expect(narrator?.textContent).toBe('Editing a.ts.');
  });

  it('explains the narrator sentence on hover+focus like its worker-card siblings', async () => {
    current = stateWith({
      activity: [
        { tool: 'Edit', target: 'src/a.ts', kind: 'file', phase: 'do', at: 1, firingId: 'f1' },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const narrator = document.querySelector('.live-worker-narrator');
    // D1 TAB-STOP ROVING: one Tab stop per live-worker card (its first line);
    // the arrow keys reach the narrator (live-worker-roving-tabindex.test.ts).
    expect(narrator?.getAttribute('tabindex')).toBe('-1');
    expect(narrator?.getAttribute('data-tip')).toBeTruthy();
    expect(narrator?.getAttribute('aria-label')).toBe(narrator?.textContent);
  });

  it('renders nothing when no firing is live (no stale sentence)', async () => {
    current = stateWith({ status: 'registered', activity: [] });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.live-worker-narrator')).toBeNull();
  });

  it('updates the sentence as the live firing moves to a new action', async () => {
    current = stateWith({
      activity: [
        { tool: 'Read', target: 'src/a.ts', kind: 'file', phase: 'orient', at: 1, firingId: 'f1' },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.live-worker-narrator')?.textContent).toBe('Reading a.ts.');

    current = stateWith({
      activity: [
        {
          tool: 'Bash',
          target: 'pnpm run test',
          kind: 'command',
          phase: 'gate',
          at: 2,
          firingId: 'f1',
        },
        { tool: 'Read', target: 'src/a.ts', kind: 'file', phase: 'orient', at: 1, firingId: 'f1' },
      ],
    });
    await vi.advanceTimersByTimeAsync(4000);
    expect(document.querySelector('.live-worker-narrator')?.textContent).toBe(
      'Running the gate: pnpm run test.',
    );
  });
});
