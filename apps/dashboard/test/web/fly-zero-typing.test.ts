// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * FLY-BAR folder UX (board web-msrhr2d9-xxwa3a) — the deliverable clause a
 * prior close attempt was demoted for: "fly a project with zero typing".
 * Drives the REAL client bundle in jsdom (same pattern as
 * multi-flight-cards.test.ts/a11y.test.ts's browse-folder cases) through the
 * full picker -> launch path using ONLY `.click()` calls — no `.value =`
 * assignment, no keyboard/input events — proving the datalist + server-backed
 * browse modal (both already shipped) compose into a genuinely typing-free
 * flow, not just two disconnected pieces.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

interface RecordedCall {
  readonly href: string;
  readonly method: string;
  readonly body: Record<string, unknown> | null;
}

const ROOT_LISTING = {
  path: '/srv/projects',
  parent: '/srv',
  entries: [{ name: 'checkout-web', path: '/srv/projects/checkout-web' }],
};

const PROJECT_LISTING = {
  path: '/srv/projects/checkout-web',
  parent: '/srv/projects',
  entries: [],
};

const FLEET_STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [] as unknown[],
  empty: true,
};

function mockFetch(calls: RecordedCall[]): void {
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : (input as Request).url;
    const method = (init && init.method) || 'GET';
    if (href.startsWith('/api/browse-folder')) {
      const path = new URL(href, 'http://localhost').searchParams.get('path') || '';
      const body = path === PROJECT_LISTING.path ? PROJECT_LISTING : ROOT_LISTING;
      return { ok: true, json: async () => body } as unknown as Response;
    }
    if (href.includes('/api/fly')) {
      if (method === 'GET') {
        return {
          ok: true,
          json: async () => ({ running: false, paused: false }),
        } as unknown as Response;
      }
      calls.push({
        href,
        method,
        body:
          init && typeof init.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : null,
      });
      return {
        ok: true,
        json: async () => ({ started: true, message: 'Launched.' }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => FLEET_STATE } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('FLY-BAR: fly a project with zero typing (board web-msrhr2d9-xxwa3a)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('picks a folder via Browse clicks only, then launches — #fly-folder is only ever click-populated', async () => {
    const calls: RecordedCall[] = [];
    mockFetch(calls);
    document.open();
    document.write(renderShell());
    document.close();
    new Function(clientJs())();

    const folderInput = document.getElementById('fly-folder') as HTMLInputElement;
    await vi.waitFor(() => {
      expect(document.getElementById('fly-browse-btn')).not.toBeNull();
    });
    expect(folderInput.value).toBe('');

    // 1. Open the browse modal — a click, not a keystroke.
    (document.getElementById('fly-browse-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(document.querySelector('.browse-dialog')).not.toBeNull();
    });

    // 2. Navigate into the listed project folder — a click on the entry, not a typed path.
    const entry = document.querySelector('.browse-entry:not(.browse-up)') as HTMLButtonElement;
    expect(entry.textContent).toBe('checkout-web');
    entry.click();
    await vi.waitFor(() => {
      expect(document.querySelector('.browse-path')?.textContent).toBe(PROJECT_LISTING.path);
    });

    // 3. Confirm the folder — a click on "Use this folder".
    (document.querySelector('.browse-use') as HTMLButtonElement).click();

    expect(folderInput.value).toBe(PROJECT_LISTING.path);
    expect((document.querySelector('.browse-overlay') as HTMLElement).hidden).toBe(true);

    // 4. Launch — the only remaining action is the Fly it click itself.
    (document.getElementById('fly-go') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(calls.some((c) => c.href.endsWith('/api/fly') && c.method === 'POST')).toBe(true);
    });
    const launch = calls.find((c) => c.href.endsWith('/api/fly') && c.method === 'POST');
    expect(launch?.body?.['folder']).toBe(PROJECT_LISTING.path);
  });
});
