// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The worker card's "recent actions seen" line was the one stat in the live
 * activity row without a [data-tip]/aria-label — its siblings (the tool span,
 * the target span) both explain themselves on hover+focus, but the action
 * count's "+" cap indicator had no explanation at all (app-wide interactivity
 * audit, web-msm66jlc-gm4oom). Drives the real client bundle in jsdom (same
 * pattern as live-worker-turns.test.ts) to prove the line is now focusable
 * and carries a tip that explains what a capped window means.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const NOW = 1_700_000_000_000;

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
  // A live firing's "capped" flag comes from ALL fetched activity belonging
  // to it (see liveFiring in shell.ts) — a second row from an OLDER, distinct
  // firing is what proves the count is a true, uncapped total for f1.
  activity: [
    {
      tool: 'Bash',
      target: 'pnpm run test',
      kind: 'command',
      phase: 'gate',
      at: NOW - 125_000,
      firingId: 'f1',
      model: 'sonnet',
      tokensIn: 500,
      tokensOut: 40,
    },
    {
      tool: 'Read',
      target: 'src/old.ts',
      kind: 'file',
      phase: 'orient',
      at: NOW - 999_000,
      firingId: 'f0',
      model: 'sonnet',
      tokensIn: 300,
      tokensOut: 20,
    },
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

describe('the worker card recent-actions line', () => {
  let current: ReturnType<typeof stateWith>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
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

  it('is keyboard-focusable and explains an uncapped count', async () => {
    current = stateWith({});
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const line = document.querySelector('.live-worker-count');
    expect(line?.textContent).toBe('1 recent action seen');
    // D1 TAB-STOP ROVING: one Tab stop per live-worker card (its first line);
    // the arrow keys reach this line (live-worker-roving-tabindex.test.ts).
    expect(line?.getAttribute('tabindex')).toBe('-1');
    expect(line?.getAttribute('data-tip')).toContain('Every action this live firing has taken');
    expect(line?.getAttribute('aria-label')).toBe('recent actions: 1 recent action seen');
  });

  it('explains a capped count with the "+" suffix', async () => {
    current = stateWith({
      activity: [
        BASE_PROJECT.activity[0],
        {
          ...BASE_PROJECT.activity[0],
          tool: 'Read',
          target: 'src/a.ts',
          kind: 'file',
          phase: 'orient',
        },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const line = document.querySelector('.live-worker-count');
    expect(line?.textContent).toBe('2+ recent actions seen');
    expect(line?.getAttribute('data-tip')).toContain('entirely this firing');
  });
});
