// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: the project page's "Recently shipped" flight
 * summary line (headline, cost, closed-task chip, and relative timestamp)
 * used to be plain, unfocusable text — unlike the card chips/stats and status
 * pills around it, which already carry the shared [data-tip] primitive. They
 * now explain themselves on hover/focus too.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 2,
  shipped: 2,
  cost: 0.42,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  activity: [],
  tasks: [{ id: 't1', title: 'Fix the thing', status: 'done' }],
  flightLog: [
    {
      id: 'f1',
      shipped: true,
      item: 't1',
      cost: 0.12,
      sha: 'abc1234',
      at: Date.now() - 60_000,
      kind: 'fix',
    },
    {
      id: 'f2',
      shipped: true,
      item: null,
      cost: 0.3,
      sha: 'def5678',
      commitSubject: 'chore: tidy up',
      at: Date.now() - 120_000,
      kind: 'chore',
    },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 2,
    shipped: 2,
    openFindings: 0,
    cost: 0.42,
  },
  projects: [PROJECT],
  empty: false,
};

function boot(projectId: string): void {
  document.open();
  document.write(renderShell(projectId));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('the "Recently shipped" flight summary explains itself on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('makes the headline of every shipped flight keyboard-reachable with a tooltip', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const headlines = Array.from(document.querySelectorAll('.flight-summary-headline'));
    expect(headlines.length).toBe(2);
    for (const headline of headlines) {
      expect(headline.getAttribute('tabindex')).toBe('0');
      expect(headline.getAttribute('data-tip')).toBeTruthy();
      expect(headline.getAttribute('aria-label')).toContain('shipped:');
    }
  });

  it('makes the cost of every shipped flight self-explaining with a tooltip (roving, not its own Tab stop)', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const costs = Array.from(document.querySelectorAll('.flight-summary-cost'));
    expect(costs.length).toBe(2);
    for (const cost of costs) {
      // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): the
      // cost never leads its line (the headline does), so it starts at -1 —
      // reachable via the line's roving group, not its own Tab stop.
      // Tooltip/label content is unaffected either way.
      expect(cost.getAttribute('tabindex')).toBe('-1');
      expect(cost.getAttribute('data-tip')).toBeTruthy();
      expect(cost.getAttribute('aria-label')).toContain('cost:');
    }
  });

  it('makes the closed-task chip self-explaining and names the task it closed', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const closed = document.querySelectorAll('.flight-summary-task');
    expect(closed.length).toBe(1);
    // Never leads its line — same roving-group reasoning as the cost above.
    expect(closed[0]?.getAttribute('tabindex')).toBe('-1');
    expect(closed[0]?.getAttribute('data-tip')).toBe('Closed task: Fix the thing');
    expect(closed[0]?.getAttribute('aria-label')).toBe('closed task: Fix the thing');
  });

  it('makes the relative timestamp self-explaining with a tooltip (roving, not its own Tab stop)', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const agos = Array.from(document.querySelectorAll('.flight-summary-ago'));
    expect(agos.length).toBe(2);
    for (const ago of agos) {
      // Never leads its line — same roving-group reasoning as the cost above.
      expect(ago.getAttribute('tabindex')).toBe('-1');
      expect(ago.getAttribute('data-tip')).toBeTruthy();
      expect(ago.getAttribute('aria-label')).toContain('shipped');
    }
  });
});
