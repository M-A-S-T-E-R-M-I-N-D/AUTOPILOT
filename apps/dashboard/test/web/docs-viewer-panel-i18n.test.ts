// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * i18n wiring for the project page's Docs reader panel
 * (`web/features/docs-viewer.ts`, board web-msnsndki-dz3vn1): its title and
 * the empty/fetch-failure states are client-built `el()` nodes —
 * `scripts/i18n/find-untagged-strings.mjs` listed all three as untagged.
 * Each must carry its STRINGS key so `translateDom()` (page load, language
 * switch, AND the panel's own post-fetch sweep) renders it in the active
 * locale, the same contract `round-panel.ts`/`coordination.ts` already meet.
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

type DocsMode = 'empty' | 'fail';

function boot(mode: DocsMode): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/docs')) {
      if (mode === 'fail') throw new Error('network down');
      return { ok: true, json: async () => ({ files: [] }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

describe('the Docs reader panel i18n wiring (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => localStorage.removeItem('ap-locale'));
  afterEach(() => vi.restoreAllMocks());

  it('tags the title and the empty state with their STRINGS keys', async () => {
    boot('empty');
    await settle();

    const title = document.querySelector('.docs-title');
    expect(title?.textContent).toBe('📚 Docs');
    expect(title?.getAttribute('data-i18n')).toBe('docsTitle');

    const empty = document.querySelector('.docs-list li');
    expect(empty?.textContent).toBe('No indexed documents yet.');
    expect(empty?.getAttribute('data-i18n')).toBe('docsEmpty');
  });

  it('tags the unavailable state when the fetch fails', async () => {
    boot('fail');
    await settle();

    const unavailable = document.querySelector('.docs-list li');
    expect(unavailable?.textContent).toBe('Docs unavailable.');
    expect(unavailable?.getAttribute('data-i18n')).toBe('docsUnavailable');
  });

  it('switching to Hebrew translates the title and the empty state', async () => {
    boot('empty');
    await settle();

    switchToHebrew();

    expect(document.querySelector('.docs-title')?.textContent).toBe(STRINGS.he.docsTitle);
    expect(document.querySelector('.docs-list li')?.textContent).toBe(STRINGS.he.docsEmpty);
  });

  it('renders the unavailable state in Hebrew when the fetch fails after the language switch', async () => {
    boot('fail');
    await settle();
    switchToHebrew();

    // A second panel render whose fetch fails AFTER the switch must sweep
    // its own fresh DOM — the page-level switch sweep already ran.
    boot('fail');
    await settle();

    expect(document.querySelector('.docs-list li')?.textContent).toBe(STRINGS.he.docsUnavailable);
  });
});
