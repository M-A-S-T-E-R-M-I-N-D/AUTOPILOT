// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The agent office map: an SVG rail of ORIENT/DO/GATE/COMMIT zones with the
 * live firing rendered as a dot eased toward its current phase. Drives the
 * REAL client bundle in jsdom (fake timers drive requestAnimationFrame too)
 * against a mocked /api/state, same pattern as live-render.test.ts.
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

describe('the agent office map', () => {
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

  it('renders all four zone labels while a firing is live', async () => {
    current = stateWith({
      activity: [
        {
          tool: 'Read',
          target: 'src/a.ts',
          kind: 'file',
          phase: 'orient',
          at: 5,
          firingId: 'p1:firing-1',
        },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const labels = Array.from(document.querySelectorAll('.office-zone-label')).map(
      (l) => l.textContent,
    );
    expect(labels).toEqual(['ORIENT', 'DO', 'GATE', 'COMMIT']);
  });

  it('renders NO map at all when nothing is flying (an idle office is noise)', async () => {
    current = stateWith({ status: 'registered', activity: [] });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.office-map')).toBeNull();
  });

  it('highlights the GATE zone and eases the dot there for a live gate firing', async () => {
    current = stateWith({
      status: 'flying',
      activity: [
        {
          tool: 'Bash',
          target: 'pnpm test',
          kind: 'command',
          phase: 'gate',
          at: 1,
          firingId: 'f1',
        },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(2000); // let the ease-to-target tween finish

    const active = document.querySelectorAll('.office-zone-active');
    expect(active).toHaveLength(1);
    expect(document.querySelector('.office-zone-label-active')?.textContent).toBe('GATE');

    const dot = document.querySelector('.office-dot');
    expect(dot).not.toBeNull();
    // The gate zone is the 3rd of 4 (index 2): x = 13 + 2*(64+13) = 167, center = 199; y = 8 + 14 = 22.
    expect(Number(dot!.getAttribute('cx'))).toBeCloseTo(199, 0);
    expect(Number(dot!.getAttribute('cy'))).toBeCloseTo(22, 0);
  });

  it('re-eases the dot when the live phase moves from DO to COMMIT across a rebuild', async () => {
    current = stateWith({
      status: 'flying',
      activity: [
        { tool: 'Edit', target: 'a.ts', kind: 'file', phase: 'do', at: 1, firingId: 'f1' },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.querySelector('.office-zone-label-active')?.textContent).toBe('DO');

    current = stateWith({
      status: 'flying',
      activity: [
        {
          tool: 'Bash',
          target: 'git commit',
          kind: 'command',
          phase: 'commit',
          at: 2,
          firingId: 'f1',
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(4000);

    expect(document.querySelector('.office-zone-label-active')?.textContent).toBe('COMMIT');
    const dot = document.querySelector('.office-dot');
    // COMMIT is the 4th zone (index 3): x = 13 + 3*(64+13) = 244, center = 276; y = 22.
    expect(Number(dot!.getAttribute('cx'))).toBeCloseTo(276, 0);
    expect(Number(dot!.getAttribute('cy'))).toBeCloseTo(22, 0);
  });

  it('gives the live position dot its own hover/focus tooltip (it sits ON TOP of the zone rect)', async () => {
    current = stateWith({
      status: 'flying',
      activity: [
        {
          tool: 'Bash',
          target: 'pnpm test',
          kind: 'command',
          phase: 'gate',
          at: 1,
          firingId: 'f1',
        },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(2000);

    const dot = document.querySelector('.office-dot');
    expect(dot?.getAttribute('tabindex')).toBe('0');
    expect(dot?.getAttribute('data-tip')).toContain('GATE');
    expect(dot?.getAttribute('aria-label')).toBe(dot?.getAttribute('data-tip'));
  });

  it('renders one orbiting satellite per distinct live subagent, labeled via data-tip', async () => {
    current = stateWith({
      status: 'flying',
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
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(2000);

    const satellites = document.querySelectorAll('.office-satellite');
    expect(satellites).toHaveLength(2);
    const tips = Array.from(satellites).map((s) => s.getAttribute('data-tip'));
    expect(tips).toEqual(['Subagent — Security review', 'Subagent — Fix the build']);
  });

  it('renders no satellites when the firing has no Agent/Task calls', async () => {
    current = stateWith({
      status: 'flying',
      activity: [
        { tool: 'Read', target: 'a.ts', kind: 'file', phase: 'orient', at: 1, firingId: 'f1' },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelectorAll('.office-satellite')).toHaveLength(0);
  });

  it('gives the map an accessible role and label', async () => {
    current = stateWith({
      status: 'flying',
      activity: [
        { tool: 'Read', target: 'a.ts', kind: 'file', phase: 'orient', at: 1, firingId: 'f1' },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const svg = document.querySelector('.office-map');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toContain('orient');
  });
});
