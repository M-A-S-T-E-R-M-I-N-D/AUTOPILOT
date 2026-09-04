// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's "🔍 Detected backlog" panel heading
 * (`web/features/backlog.ts`'s `backlogSection()`) is an `el()`-built
 * `<h3 class="backlog-title">` the regex `pnpm i18n:untagged` scanner cannot
 * see — the same blind spot `flightSummarySection()`'s heading had before it
 * was tagged (board web-msnsndki-dz3vn1).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
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
  firings: 1,
  shipped: 1,
  cost: 0.12,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  activity: [],
  tasks: [],
  flightLog: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 1,
    shipped: 1,
    openFindings: 0,
    cost: 0.12,
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

describe('"🔍 Detected backlog" panel i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tags the "Detected backlog" heading with its STRINGS key', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const heading = document.querySelector('.backlog-panel h3.backlog-title');
    expect(heading?.getAttribute('data-i18n')).toBe('backlogTitle');
    expect(heading?.textContent).toBe('🔍 Detected backlog');
  });

  it('switching to Hebrew translates the heading', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const heading = document.querySelector('.backlog-panel h3.backlog-title');
    expect(heading?.textContent).toBe(STRINGS.he.backlogTitle);
  });

  it('switching to Hebrew translates the fetch-built empty-state message', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const empty = document.querySelector('.backlog-body p.muted');
    expect(empty?.getAttribute('data-i18n')).toBe('backlogEmpty');
    expect(empty?.textContent).toBe(STRINGS.he.backlogEmpty);
  });
});
