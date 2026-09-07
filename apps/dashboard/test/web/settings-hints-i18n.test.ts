// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's two settings-row hints (board web-msnsndki-dz3vn1;
 * `pnpm i18n:untagged` listed both): the muted sentence beside the
 * "↺ Start over" button ("Resets firings + ship-rate counters to 0/0. Tasks,
 * index, and backups are kept.") and the one beside "⇪ Sync to GitHub"
 * ("Private by default. Creates a repo on first sync, pushes on every one
 * after.") — `shell.ts`'s `renderProjectPage()`.
 *
 * Both are built synchronously with the page, next to a Start-over button
 * that already paints via `tr()` and carries its key, so they follow the
 * same route: painted in the active locale at birth, tagged `data-i18n`, and
 * kept current by the page-level `translateDom()` sweep and the language
 * toggle's document-wide one.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const HEBREW_LETTER = /\p{Script=Hebrew}/u;

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
  activity: [],
  flightLog: [],
  tasks: [],
  anomalies: [],
  soulReviewed: true,
  soulProposed: null,
};

const STATE = {
  generatedAt: 1,
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

async function boot(): Promise<void> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  ) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

function startOverHint(): HTMLElement | null {
  return document.querySelector('section.start-over span.muted');
}

function githubSyncHint(): HTMLElement | null {
  return document.querySelector('section.github-sync span.muted');
}

describe('project page settings hints i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tags both hints and paints them in English by default', async () => {
    await boot();

    const so = startOverHint();
    expect(so?.textContent).toBe(
      'Resets firings + ship-rate counters to 0/0. Tasks, index, and backups are kept.',
    );
    expect(so?.textContent).toBe(STRINGS.en.startOverHint);
    expect(so?.getAttribute('data-i18n')).toBe('startOverHint');

    const gh = githubSyncHint();
    expect(gh?.textContent).toBe(
      'Private by default. Creates a repo on first sync, pushes on every one after.',
    );
    expect(gh?.textContent).toBe(STRINGS.en.githubSyncHint);
    expect(gh?.getAttribute('data-i18n')).toBe('githubSyncHint');
  });

  it('switching to Hebrew translates both hints in place', async () => {
    await boot();
    const so = startOverHint();
    const gh = githubSyncHint();

    switchToHebrew();

    expect(startOverHint()).toBe(so);
    expect(so?.textContent).toBe(STRINGS.he.startOverHint);
    expect(githubSyncHint()).toBe(gh);
    expect(gh?.textContent).toBe(STRINGS.he.githubSyncHint);
  });

  it('a page that boots in Hebrew paints both hints in Hebrew at birth', async () => {
    localStorage.setItem('ap-locale', 'he');
    await boot();

    expect(startOverHint()?.textContent).toBe(STRINGS.he.startOverHint);
    expect(githubSyncHint()?.textContent).toBe(STRINGS.he.githubSyncHint);
  });

  it('keeps the Hebrew rows native — real Hebrew, not the English text', () => {
    for (const key of ['startOverHint', 'githubSyncHint'] as const) {
      expect(STRINGS.he[key]).not.toBe(STRINGS.en[key]);
      expect(HEBREW_LETTER.test(STRINGS.he[key])).toBe(true);
    }
    // The reset hint keeps its "0/0" — the counters it names read the same
    // in every locale.
    expect(STRINGS.he.startOverHint).toContain('0/0');
  });
});
