// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * i18n wiring for the project page's "files in flight" map
 * (`web/features/activity.ts`'s `flightMap()`, board web-msnsndki-dz3vn1) —
 * its first i18n slice. The map's `aria-label` is a fixed sentence with no
 * live value, so it carries a plain `data-i18n-aria` tag; `translateDom()`
 * (page load, language switch, and `renderFleet()`'s own post-render sweep)
 * repaints it in place. The orient/do/gate/commit phase names beside it name
 * AUTOPILOT's own flight phases, not translatable English words, so they
 * stay out of `STRINGS` — this slice covers only the map's aria-label.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
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
  lastActivityAt: 1,
  flightLog: [],
  tasks: [],
  activity: [
    { tool: 'Edit', target: 'src/a.ts', kind: 'file', phase: 'do', at: 6, firingId: 'f1' },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 1, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
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

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

describe('"files in flight" map i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.removeItem('ap-locale');
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tags the map aria-label with its STRINGS key', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const map = document.querySelector('.flightmap');
    expect(map?.getAttribute('data-i18n-aria')).toBe('flightMapAria');
    expect(map?.getAttribute('aria-label')).toBe('Files in flight');
  });

  it('switching to Hebrew translates the map aria-label', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    switchToHebrew();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.flightmap')?.getAttribute('aria-label')).toBe(
      STRINGS.he.flightMapAria,
    );
  });
});
