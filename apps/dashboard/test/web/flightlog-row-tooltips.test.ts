// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: each collapsed row in a project's "Flight
 * log" list (verdict dot, sha, cost, relative timestamp) used to be plain,
 * unfocusable markup — unlike the identical fields already wired up in the
 * "Recently shipped" summary and the per-firing trace. They now explain
 * themselves on hover/focus too.
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
  shipped: 1,
  cost: 0.42,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 0.5,
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
      shipped: false,
      gateResult: 'reverted',
      item: null,
      cost: 0.05,
      sha: null,
      commitSubject: null,
      failedCheck: 'test',
      at: Date.now() - 120_000,
      kind: 'fix',
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
    shipped: 1,
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

describe('the flight-log row explains itself on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('makes the verdict dot keyboard-reachable and names the verdict', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const dots = Array.from(document.querySelectorAll('.flight-dot'));
    expect(dots.length).toBe(2);
    expect(dots[0]?.getAttribute('tabindex')).toBe('0');
    expect(dots[0]?.getAttribute('data-tip')).toBe('How this firing ended: shipped');
    expect(dots[0]?.getAttribute('aria-label')).toBe('verdict: shipped');
    expect(dots[1]?.getAttribute('data-tip')).toBe('How this firing ended: reverted');
  });

  it('makes the sha keyboard-reachable with the full commit hash', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const shas = Array.from(document.querySelectorAll('.flight-sha'));
    expect(shas.length).toBe(1);
    // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): the sha
    // is not the first field in its row's header (the verdict dot leads), so
    // it starts at -1 — reachable via the row's roving group, not its own Tab
    // stop. tooltip/label content is unaffected either way.
    expect(shas[0]?.getAttribute('tabindex')).toBe('-1');
    expect(shas[0]?.getAttribute('data-tip')).toBe('Commit: abc1234');
    expect(shas[0]?.getAttribute('aria-label')).toBe('commit abc1234');
  });

  it('makes the cost self-explaining with a tooltip (roving, not its own Tab stop)', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const costs = Array.from(document.querySelectorAll('.flight-cost'));
    expect(costs.length).toBe(2);
    for (const cost of costs) {
      // Cost never leads a row's header (dot always does), so it's always -1
      // — same roving-group reasoning as the sha assertion above.
      expect(cost.getAttribute('tabindex')).toBe('-1');
      expect(cost.getAttribute('data-tip')).toBe('Total spend for this firing');
      expect(cost.getAttribute('aria-label')).toContain('cost:');
    }
  });

  it('makes the relative timestamp self-explaining with a tooltip (roving, not its own Tab stop)', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const agos = Array.from(document.querySelectorAll('.flight-ago'));
    expect(agos.length).toBe(2);
    for (const ago of agos) {
      expect(ago.getAttribute('tabindex')).toBe('-1');
      expect(ago.getAttribute('data-tip')).toBe('When this firing happened');
      expect(ago.getAttribute('aria-label')).toContain('happened');
    }
  });

  it('makes the headline self-explaining and recovers the full text when truncated', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const items = Array.from(document.querySelectorAll('.flight-item'));
    expect(items.length).toBe(2);
    // f1's headline resolves to the task title "Fix the thing" — short enough
    // to show in full, but it should still be reachable and self-explaining.
    // It sits second in the row's header (after the verdict dot), so it
    // starts at -1, not its own Tab stop.
    expect(items[0]?.textContent).toBe('Fix the thing');
    expect(items[0]?.getAttribute('tabindex')).toBe('-1');
    expect(items[0]?.getAttribute('data-tip')).toBe('Fix the thing');
    // D1 ATTRIBUTE PAYLOAD (epic 0015, web-mtd1wmqc-v7h6cq): no aria-label
    // duplicating the tip — the full headline rides aria-describedby into a
    // visually-hidden span instead (same fix as the per-firing trace
    // headline).
    expect(items[0]?.hasAttribute('aria-label')).toBe(false);
    const descId = items[0]?.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    const desc = document.getElementById(descId ?? '');
    expect(desc?.classList.contains('sr-only')).toBe(true);
    expect(desc?.textContent).toBe('Fix the thing');
    // The desc must NOT sit inside the row button — a button's accessible
    // name is computed from its contents, sr-only text included, so nesting
    // it there would duplicate the headline into the button's name instead.
    expect(desc?.closest('.flight-head')).toBeNull();
  });

  it('makes the expanded row detail line keyboard-reachable with a tooltip', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const head = document.querySelector('.flight-head') as HTMLButtonElement | null;
    expect(head).not.toBeNull();
    head!.click();
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    const meta = document.querySelector('.flight-detail .muted');
    expect(meta).not.toBeNull();
    expect(meta?.getAttribute('tabindex')).toBe('0');
    expect(meta?.getAttribute('data-tip')).toContain('Verdict, change kind, short commit sha');
    expect(meta?.getAttribute('aria-label')).toBe(meta?.textContent);
    await vi.advanceTimersByTimeAsync(5000);
  });

  it('recovers a truncated headline via the tooltip and the sr-only description', async () => {
    const longHeadline = 'a'.repeat(80);
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({
            ...STATE,
            projects: [
              {
                ...PROJECT,
                tasks: [{ id: 't1', title: longHeadline, status: 'done' }],
              },
            ],
          }),
        }) as unknown as Response,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const item = document.querySelector('.flight-item');
    expect(item?.textContent).toBe('a'.repeat(64) + '…');
    expect(item?.getAttribute('data-tip')).toBe(longHeadline);
    expect(item?.hasAttribute('aria-label')).toBe(false);
    const descId = item?.getAttribute('aria-describedby');
    const desc = document.getElementById(descId ?? '');
    expect(desc?.textContent).toBe(longHeadline);
  });
});
