// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 follow-up (web-msm66jlc-gm4oom): the task
 * board row's title span was the last silent element on the row — every
 * other row element (status pill, chips, move/focus/done buttons) already
 * explains itself via the shared [data-tip] primitive, but TaskEntry's
 * `at`/`priority` fields were fetched and never displayed anywhere. The
 * title now surfaces both on hover/focus.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const NOW = 1_700_000_000_000;

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
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
  tasks: [
    {
      id: 't1',
      title: 'Ship the thing',
      status: 'queued',
      source: 'dashboard',
      severity: null,
      dimension: null,
      focus: false,
      priority: 2,
      at: NOW - 3 * 60 * 60 * 1000,
    },
    {
      id: 't2',
      title: 'Unordered task',
      status: 'queued',
      source: 'dashboard',
      severity: null,
      dimension: null,
      focus: false,
      priority: null,
      at: NOW - 60 * 1000,
    },
    {
      id: 't3',
      title: 'ship faster please',
      body: 'ship faster please\n\nmore detail on why this matters below.',
      status: 'queued',
      source: 'inbox',
      severity: null,
      dimension: null,
      focus: false,
      priority: null,
      at: NOW - 30 * 1000,
    },
  ],
};

const STATE = {
  generatedAt: NOW,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0,
  },
  projects: [PROJECT],
  empty: false,
};

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('task title explains itself on hover/focus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows when the task was added and its operator priority when set', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const titles = Array.from(document.querySelectorAll('.task-title'));
    expect(titles).toHaveLength(3);

    const ordered = titles[0];
    // D1 TAB-STOP ROVING (board web-mtd1wyte-ssntzi): the title shares one
    // roving group with the row's status pill (and any chips) — the pill
    // comes first in DOM order and holds the '0' stop, so the title itself
    // is arrow-reachable at '-1' rather than a second unconditional stop.
    expect(ordered?.getAttribute('tabindex')).toBe('-1');
    expect(ordered?.getAttribute('data-tip')).toBe('Added 3h ago · operator priority 2');
    // D1 ATTRIBUTE PAYLOAD (epic 0015): the title's own text already gives it
    // an accessible name, so aria-label must not restate it plus duplicate
    // the full data-tip sentence verbatim — the supplemental facts ride
    // aria-describedby -> a visually-hidden span instead.
    expect(ordered?.getAttribute('aria-label')).toBeNull();
    const descId = ordered?.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    const desc = document.getElementById(descId!);
    expect(desc?.className).toBe('sr-only');
    expect(desc?.textContent).toBe('Added 3h ago · operator priority 2');
  });

  it('omits the priority clause when the task is unordered', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const titles = Array.from(document.querySelectorAll('.task-title'));
    const unordered = titles[1];
    expect(unordered?.getAttribute('data-tip')).toBe('Added 1m ago');
    expect(unordered?.getAttribute('aria-label')).toBeNull();
    const descId = unordered?.getAttribute('aria-describedby');
    const desc = document.getElementById(descId!);
    expect(desc?.textContent).toBe('Added 1m ago');
  });

  it("previews an INBOX-triaged task's full note body — the only place it survives once the source file archives to the gitignored INBOX/.triaged/", async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const titles = Array.from(document.querySelectorAll('.task-title'));
    const withBody = titles[2];
    const expectedTip =
      'Added 30s ago — ship faster please\n\nmore detail on why this matters below.';
    expect(withBody?.getAttribute('data-tip')).toBe(expectedTip);
    const descId = withBody?.getAttribute('aria-describedby');
    const desc = document.getElementById(descId!);
    expect(desc?.textContent).toBe(expectedTip);
  });
});
