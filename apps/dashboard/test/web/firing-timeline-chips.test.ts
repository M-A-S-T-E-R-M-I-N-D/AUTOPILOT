// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Guard-denial + autoformat-rescue chips on the PER-FIRING TRACE rows
 * (headless-surfacing sweep, board web-msnqqjmd-9bx0wd): the flight-log rows
 * grew these chips, but the activity log's firing timeline — the "who did
 * what, when, in which firing" view that already joins each row against its
 * flight-log entry — never showed them, so an operator reading the trace had
 * no idea a firing bounced off the guard or was mechanically rescued. Drives
 * the REAL client bundle in jsdom against a mocked /api/state, same pattern
 * as flight-guard-chip.test.ts and activity-feed.test.ts.
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
  tasks: [],
  flightLog: [
    {
      id: 'f2',
      shipped: true,
      item: null,
      completion: null,
      commitSubject: 'fix: bounced off the boundary, then auto-fixed',
      cost: 0.2,
      sha: 'sha0002',
      at: Date.now() - 10_000,
      kind: 'fix',
      gateResult: 'passed',
      guardDenials: 2,
      autoformatRescued: true,
    },
    {
      id: 'f1',
      shipped: true,
      item: null,
      completion: null,
      commitSubject: 'fix: clean firing, no notable events',
      cost: 0.22,
      sha: 'sha0001',
      at: Date.now() - 20_000,
      kind: 'fix',
      gateResult: 'passed',
      guardDenials: 0,
      autoformatRescued: false,
    },
  ],
  activity: [
    { tool: 'Edit', target: 'src/a.ts', kind: 'file', phase: 'do', at: 6, firingId: 'f2' },
    { tool: 'Read', target: 'src/b.ts', kind: 'file', phase: 'orient', at: 5, firingId: 'f2' },
    { tool: 'Edit', target: 'src/c.ts', kind: 'file', phase: 'do', at: 4, firingId: 'f1' },
    { tool: 'Read', target: 'src/d.ts', kind: 'file', phase: 'orient', at: 3, firingId: 'f1' },
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

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('guard-denial + autoformat chips on the firing timeline', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows keyboard-reachable, self-explaining chips on the firing the guard bounced and autoformat rescued', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const rows = Array.from(document.querySelectorAll('.firing-timeline .firing-toggle'));
    expect(rows.length).toBe(2);
    const bounced = rows[0];

    // tabindex="-1", not "0": the row roves (D1 TAB-STOP ROVING) — the chip
    // is focusable via Left/Right from the row's headline, not its own Tab stop.
    const guardChip = bounced?.querySelector('.flight-guard-chip');
    expect(guardChip).not.toBeNull();
    expect(guardChip?.textContent).toContain('2');
    expect(guardChip?.getAttribute('tabindex')).toBe('-1');
    expect(guardChip?.getAttribute('data-tip')).toBeTruthy();
    expect(guardChip?.getAttribute('aria-label')).toBeTruthy();

    const autoChip = bounced?.querySelector('.flight-autoformat-chip');
    expect(autoChip).not.toBeNull();
    expect(autoChip?.getAttribute('tabindex')).toBe('-1');
    expect(autoChip?.getAttribute('data-tip')).toBeTruthy();
    expect(autoChip?.getAttribute('aria-label')).toBeTruthy();
  });

  it('omits both chips on a clean firing', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const rows = Array.from(document.querySelectorAll('.firing-timeline .firing-toggle'));
    const clean = rows[1];
    expect(clean?.querySelector('.flight-guard-chip')).toBeNull();
    expect(clean?.querySelector('.flight-autoformat-chip')).toBeNull();
  });
});
