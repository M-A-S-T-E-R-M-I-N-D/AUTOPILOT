// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: the office map's orbiting subagent satellites
 * used a native SVG `<title>` — mouse-hover only, like the ORIENT/DO/GATE/COMMIT
 * zones before web-msm66jlc-gm4oom fixed them. They now explain themselves on
 * hover+focus too, via the shared [data-tip] primitive.
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

describe('office map subagent satellites explain themselves on hover/focus', () => {
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

  it('makes every satellite keyboard-reachable with a tooltip and accessible label, no native title', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () =>
            stateWith({
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
            }),
        }) as unknown as Response,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(2000);

    const satellites = Array.from(document.querySelectorAll('.office-satellite'));
    expect(satellites).toHaveLength(2);
    // Roving tabindex (D1 TAB-STOP ROVING): only the first satellite is a Tab
    // stop, not one per subagent — see office-map-roving-tabindex.test.ts.
    expect(satellites.map((s) => s.getAttribute('tabindex'))).toEqual(['0', '-1']);
    for (const sat of satellites) {
      expect(sat.getAttribute('role')).toBe('img');
      expect(sat.getAttribute('data-tip')).toBeTruthy();
      expect(sat.getAttribute('aria-label')).toBe(sat.getAttribute('data-tip'));
      expect(sat.querySelector('title')).toBeNull();
    }
  });
});
