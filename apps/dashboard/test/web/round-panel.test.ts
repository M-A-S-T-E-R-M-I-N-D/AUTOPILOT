// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * CURRENT ROUND (web-msntc6cx-yios2n): the project page's inside page fetches
 * GET /api/round on demand and renders totals since the project's last git
 * release tag — a non-destructive alternative to "Start over". These tests
 * drive the REAL served client bundle in jsdom against a URL-aware mocked fetch.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
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

function bootWithRound(round: unknown): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/round')) {
      return { ok: true, json: async () => ({ round }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

describe('the CURRENT ROUND panel', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders totals since the last release tag', async () => {
    bootWithRound({
      roundStartAt: 1700000000000,
      tagName: 'v1.2.0',
      firings: 4,
      shipped: 3,
      cost: 1.5,
      shipRate: 0.75,
      costPerShipped: 0.5,
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.round-panel')).not.toBeNull();
    });
    await vi.waitFor(() => {
      expect(document.querySelector('.round-line')?.textContent).toContain('v1.2.0');
    });

    const chips = Array.from(document.querySelectorAll('.round-stats .chip')).map(
      (c) => c.textContent,
    );
    expect(chips).toEqual(['4', '3', '$1.50', '75%']);
  });

  it('makes the "since <tag>" chip explain itself on hover/focus', async () => {
    bootWithRound({
      roundStartAt: 1700000000000,
      tagName: 'v1.2.0',
      firings: 1,
      shipped: 1,
      cost: 0,
      shipRate: 1,
      costPerShipped: 0,
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.round-since')).not.toBeNull();
    });
    const since = document.querySelector('.round-since');
    expect(since?.getAttribute('tabindex')).toBe('0');
    expect(since?.getAttribute('data-tip')).toBeTruthy();
    expect(since?.getAttribute('aria-label')).toContain('v1.2.0');
  });

  it('shows an honest "no release tags yet" state instead of a fabricated boundary', async () => {
    bootWithRound({
      roundStartAt: null,
      tagName: null,
      firings: 2,
      shipped: 1,
      cost: 0.2,
      shipRate: 0.5,
      costPerShipped: 0.2,
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.round-panel')).not.toBeNull();
    });
    await vi.waitFor(() => {
      expect(document.querySelector('.round-line')?.textContent).toContain('No release tags yet');
    });
    expect(document.querySelector('.round-since')).toBeNull();
  });

  it('degrades to an honest unavailable message when the fetch fails', async () => {
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/round')) throw new Error('network down');
      return { ok: true, json: async () => STATE } as unknown as Response;
    });
    new Function(clientJs())();

    await vi.waitFor(() => {
      expect(document.querySelector('.round-body')?.textContent).toContain(
        'Round totals unavailable',
      );
    });
  });
});
