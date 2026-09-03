// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: the office map's ORIENT/DO/GATE/COMMIT zones
 * used to be `aria-hidden` decoration with no explanation of what each phase
 * means. They now explain themselves on hover/focus too, like the chips,
 * gauge segments, and heatmap cells already do.
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

describe('office map zones explain themselves on hover/focus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.open();
    document.write(renderShell());
    document.close();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('makes every zone keyboard-reachable with a tooltip and accessible label', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () =>
            stateWith({
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
            }),
        }) as unknown as Response,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const zones = Array.from(document.querySelectorAll('.office-zone'));
    expect(zones).toHaveLength(4);
    // Roving tabindex (D1 TAB-STOP ROVING): only the first zone is a Tab
    // stop, not one per phase — see office-map-roving-tabindex.test.ts.
    expect(zones.map((z) => z.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
    for (const zone of zones) {
      expect(zone.getAttribute('role')).toBe('img');
      expect(zone.getAttribute('data-tip')).toBeTruthy();
      expect(zone.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('marks the active zone tip as current and leaves the others plain', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () =>
            stateWith({
              activity: [
                {
                  tool: 'Read',
                  target: 'a.ts',
                  kind: 'file',
                  phase: 'orient',
                  at: 1,
                  firingId: 'f1',
                },
              ],
            }),
        }) as unknown as Response,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const active = document.querySelector('.office-zone-active');
    expect(active?.getAttribute('data-tip')).toContain('(current)');
    expect(active?.getAttribute('aria-label')).toContain('current phase');

    const others = Array.from(document.querySelectorAll('.office-zone:not(.office-zone-active)'));
    expect(others).toHaveLength(3);
    for (const zone of others) {
      expect(zone.getAttribute('data-tip')).not.toContain('(current)');
    }
  });
});
