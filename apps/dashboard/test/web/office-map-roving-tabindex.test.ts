// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING (epic 0015): the agent office map gave every phase zone
 * (`.office-zone`, always 4 of them) and every subagent satellite
 * (`.office-satellite`, one per live Agent/Task call) its own Tab stop — the
 * same "one Tab stop per item" anti-pattern already fixed for the fleet-card
 * gauge, language bar, contribution heatmap, flight-log rows, task-row chips,
 * and flight timeline strip. Only the first zone/satellite is now a Tab stop;
 * the roving group moves it with the shared wireRoving() Left/Right/Home/End
 * pattern those widgets already use.
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

function boot(project: Record<string, unknown>): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => stateWith(project) }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('office map roving tabindex', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives the four phase zones ONE shared Tab stop, not one per zone', async () => {
    boot({
      activity: [
        { tool: 'Read', target: 'a.ts', kind: 'file', phase: 'orient', at: 1, firingId: 'f1' },
      ],
    });
    await vi.advanceTimersByTimeAsync(2000);

    const zones = Array.from(document.querySelectorAll('.office-zone'));
    expect(zones).toHaveLength(4);
    expect(zones[0]!.getAttribute('tabindex')).toBe('0');
    expect(zones.slice(1).every((z) => z.getAttribute('tabindex') === '-1')).toBe(true);
  });

  it('moves the roving zone stop with ArrowRight/ArrowLeft', async () => {
    boot({
      activity: [
        { tool: 'Read', target: 'a.ts', kind: 'file', phase: 'orient', at: 1, firingId: 'f1' },
      ],
    });
    await vi.advanceTimersByTimeAsync(2000);

    const zones = Array.from(document.querySelectorAll('.office-zone')) as HTMLElement[];
    zones[0]!.focus();
    zones[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(zones[1]);
    expect(zones[0]!.getAttribute('tabindex')).toBe('-1');
    expect(zones[1]!.getAttribute('tabindex')).toBe('0');

    zones[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(zones[0]);
    expect(zones[0]!.getAttribute('tabindex')).toBe('0');
  });

  it('gives multiple subagent satellites ONE shared Tab stop, not one per subagent', async () => {
    boot({
      activity: [
        {
          tool: 'Agent',
          target: 'Security review',
          kind: 'other',
          phase: 'do',
          at: 3,
          firingId: 'f1',
        },
        {
          tool: 'Task',
          target: 'Fix the build',
          kind: 'other',
          phase: 'do',
          at: 2,
          firingId: 'f1',
        },
        { tool: 'Agent', target: 'Docs pass', kind: 'other', phase: 'do', at: 1, firingId: 'f1' },
      ],
    });
    await vi.advanceTimersByTimeAsync(2000);

    const satellites = Array.from(document.querySelectorAll('.office-satellite'));
    expect(satellites).toHaveLength(3);
    expect(satellites[0]!.getAttribute('tabindex')).toBe('0');
    expect(satellites.slice(1).every((s) => s.getAttribute('tabindex') === '-1')).toBe(true);
  });

  it('moves the roving satellite stop with ArrowRight, independently of the zone group', async () => {
    boot({
      activity: [
        {
          tool: 'Agent',
          target: 'Security review',
          kind: 'other',
          phase: 'do',
          at: 2,
          firingId: 'f1',
        },
        {
          tool: 'Task',
          target: 'Fix the build',
          kind: 'other',
          phase: 'do',
          at: 1,
          firingId: 'f1',
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(2000);

    const satellites = Array.from(document.querySelectorAll('.office-satellite')) as HTMLElement[];
    satellites[0]!.focus();
    satellites[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(document.activeElement).toBe(satellites[1]);
    expect(satellites[0]!.getAttribute('tabindex')).toBe('-1');
    expect(satellites[1]!.getAttribute('tabindex')).toBe('0');

    // The zone group is untouched by satellite navigation — a separate group.
    const zones = document.querySelectorAll('.office-zone');
    expect(zones[0]!.getAttribute('tabindex')).toBe('0');
  });
});
