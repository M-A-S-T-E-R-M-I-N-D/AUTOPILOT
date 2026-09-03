// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * FLEET LAUNCH FROM THE FLY BAR (board web-mtdcfel4-0bxf4h): the Fly bar
 * launched exactly one lane; hub-aware multi-lane launch (the SAME
 * partitioner `dashboard fleet` already gives the CLI) was reachable only
 * from a terminal. Drives the REAL client bundle in jsdom (same harness
 * `fly-zero-typing.test.ts` uses) through the Lanes field to prove the
 * launch decision — `/api/fly` vs `/api/fleet` — actually happens, not just
 * that the field renders.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

interface RecordedCall {
  readonly href: string;
  readonly method: string;
  readonly body: Record<string, unknown> | null;
}

const FLEET_STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [] as unknown[],
  empty: true,
};

function mockFetch(calls: RecordedCall[]): void {
  globalThis.fetch = ((input: unknown, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : (input as Request).url;
    const method = (init && init.method) || 'GET';
    if (href.includes('/api/fly') && method === 'GET') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ running: false, paused: false }),
      } as unknown as Response);
    }
    if (href.endsWith('/api/fly') || href.endsWith('/api/fleet')) {
      calls.push({
        href,
        method,
        body:
          init && typeof init.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : null,
      });
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ started: true, ok: true, lines: ['fleet: 2 lane(s)'] }),
      } as unknown as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(FLEET_STATE),
    } as unknown as Response);
  }) as unknown as typeof fetch;
}

function fillAndSubmit(): void {
  const folderInput = document.getElementById('fly-folder') as HTMLInputElement;
  folderInput.value = '/srv/projects/checkout-web';
  (document.getElementById('fly-go') as HTMLButtonElement).click();
}

describe('FLY-BAR Lanes field (board web-mtdcfel4-0bxf4h)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lanes left at 1 still launches a single flight via /api/fly, unchanged', async () => {
    const calls: RecordedCall[] = [];
    mockFetch(calls);
    document.open();
    document.write(renderShell());
    document.close();
    new Function(clientJs())();

    await vi.waitFor(() => {
      expect(document.getElementById('fly-go')).not.toBeNull();
    });
    fillAndSubmit();

    await vi.waitFor(() => {
      expect(calls.some((c) => c.href.endsWith('/api/fly') && c.method === 'POST')).toBe(true);
    });
    expect(calls.some((c) => c.href.endsWith('/api/fleet'))).toBe(false);
  });

  it('lanes set above 1 launches a partitioned fleet via /api/fleet instead of /api/fly', async () => {
    const calls: RecordedCall[] = [];
    mockFetch(calls);
    document.open();
    document.write(renderShell());
    document.close();
    new Function(clientJs())();

    await vi.waitFor(() => {
      expect(document.getElementById('fly-go')).not.toBeNull();
    });
    (document.getElementById('fly-lanes') as HTMLInputElement).value = '3';
    fillAndSubmit();

    await vi.waitFor(() => {
      expect(calls.some((c) => c.href.endsWith('/api/fleet') && c.method === 'POST')).toBe(true);
    });
    const launch = calls.find((c) => c.href.endsWith('/api/fleet'));
    expect(launch?.body).toEqual({
      folder: '/srv/projects/checkout-web',
      laneCount: 3,
      firings: 1,
      budgetUsd: 10,
    });
    expect(calls.some((c) => c.href.endsWith('/api/fly'))).toBe(false);
  });

  it('refuses lanes above 1 combined with total-spend mode instead of silently dropping the lane count', async () => {
    const calls: RecordedCall[] = [];
    mockFetch(calls);
    document.open();
    document.write(renderShell());
    document.close();
    new Function(clientJs())();

    await vi.waitFor(() => {
      expect(document.getElementById('fly-go')).not.toBeNull();
    });
    (document.getElementById('fly-lanes') as HTMLInputElement).value = '2';
    (document.getElementById('fly-mode') as HTMLSelectElement).value = 'total';
    fillAndSubmit();

    await vi.waitFor(() => {
      expect(document.getElementById('fly-status')?.textContent).toContain('fixed firing count');
    });
    expect(calls.some((c) => c.href.endsWith('/api/fleet') || c.href.endsWith('/api/fly'))).toBe(
      false,
    );
  });
});
