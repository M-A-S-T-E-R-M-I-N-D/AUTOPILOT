// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING (epic 0015): the three KEEPER-family decision panels —
 * PR review (`.pr-review-panel`), contributor pool (`.pool-client-panel`)
 * and issue triage (`.issue-triage-list`) — each gave every row's "#N"
 * number chip its own unconditional `tabindex="0"`, the same "one Tab stop
 * per item" anti-pattern already fixed for the fleet-card gauge, language
 * bar, contribution heatmap, flight-log rows, task-row chips, flight
 * timeline strip, office map, DETECTED BACKLOG rows, flight map nodes,
 * eval-trend bars, search hits, trace rows and coordination lines. A busy
 * review round (10 open PRs + 10 pool issues + 10 triage plans) cost one
 * Tab press per row to cross. Each panel now exposes ONE shared Tab stop;
 * the shared wireRoving() Left/Right/Home/End pattern moves it.
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
  activity: [],
  tasks: [],
};

const STATE = {
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
};

const PR_PLANS = [
  {
    pr: { number: 41, title: 'fix: leaky socket' },
    decision: { decision: 'merge', reasoning: 'policy-green.' },
  },
  {
    pr: { number: 42, title: 'feat: retry queue' },
    decision: { decision: 'request-changes', reasoning: 'gate failed.' },
  },
  {
    pr: { number: 43, title: 'docs: runbook' },
    decision: { decision: 'queue-for-human', reasoning: 'guard path.' },
  },
];

const POOL_ENTRIES = [
  {
    issue: { number: 7, title: 'polish: empty state' },
    decision: { decision: 'claim', reasoning: 'good first issue.' },
  },
  {
    issue: { number: 8, title: 'bug: axis drift' },
    decision: { decision: 'skip', reasoning: 'already claimed.' },
  },
  {
    issue: { number: 9, title: 'chore: dep bump' },
    decision: { decision: 'claim', reasoning: 'unclaimed.' },
  },
];

const TRIAGE_PLANS = [
  {
    issue: { number: 11, title: 'bug: broken link' },
    decision: { decision: 'accept', reasoning: 'reproducible.' },
  },
  {
    issue: { number: 12, title: 'idea: dark mode' },
    decision: { decision: 'duplicate', reasoning: 'matches t9.' },
  },
  {
    issue: { number: 13, title: 'question: setup' },
    decision: { decision: 'close', reasoning: 'answered in docs.' },
  },
];

function bootWithKeeperPanels(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/pr-review')) {
      return { ok: true, json: async () => ({ plans: PR_PLANS }) } as unknown as Response;
    }
    if (url.includes('/api/pool-client')) {
      return { ok: true, json: async () => ({ entries: POOL_ENTRIES }) } as unknown as Response;
    }
    if (url.includes('/api/issue-triage')) {
      return { ok: true, json: async () => ({ triage: TRIAGE_PLANS }) } as unknown as Response;
    }
    if (url.includes('/api/coordination')) {
      return { ok: true, json: async () => ({ lines: [] }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

function chips(sel: string): HTMLElement[] {
  return Array.from(document.querySelectorAll(sel));
}

describe('KEEPER panel number chips roving tabindex', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives the PR review number chips ONE shared Tab stop, not one per row', async () => {
    bootWithKeeperPanels();
    await vi.advanceTimersByTimeAsync(1);

    const stops = chips('.pr-review-panel .pr-review-number');
    expect(stops.length).toBe(3);
    expect(stops.map((n) => n.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('moves the PR review roving stop with ArrowRight/ArrowLeft/Home/End', async () => {
    bootWithKeeperPanels();
    await vi.advanceTimersByTimeAsync(1);

    const [n0, n1, n2] = chips('.pr-review-panel .pr-review-number');
    if (!n0 || !n1 || !n2) throw new Error('expected 3 PR review number chips');

    n0.focus();
    n0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(n1);
    expect(n0.getAttribute('tabindex')).toBe('-1');
    expect(n1.getAttribute('tabindex')).toBe('0');

    n1.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(n2);

    n2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(n0);
    expect(n0.getAttribute('tabindex')).toBe('0');
  });

  it('gives the pool number chips ONE shared Tab stop and follows mouse/programmatic focus', async () => {
    bootWithKeeperPanels();
    await vi.advanceTimersByTimeAsync(1);

    const stops = chips('.pool-client-panel .pool-client-number');
    expect(stops.length).toBe(3);
    expect(stops.map((n) => n.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);

    const n2 = stops[2];
    if (!n2) throw new Error('expected a third pool number chip');
    n2.focus();
    expect(stops.map((n) => n.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
  });

  it('gives the issue-triage number chips ONE shared Tab stop with Arrow traversal', async () => {
    bootWithKeeperPanels();
    await vi.advanceTimersByTimeAsync(1);

    const stops = chips('.issue-triage-list .issue-triage-number');
    expect(stops.length).toBe(3);
    expect(stops.map((n) => n.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);

    const [n0, n1] = stops;
    if (!n0 || !n1) throw new Error('expected issue-triage number chips');
    n0.focus();
    n0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(n1);
    expect(n1.getAttribute('tabindex')).toBe('0');
  });
});
