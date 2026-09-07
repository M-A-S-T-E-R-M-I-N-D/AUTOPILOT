// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * i18n wiring for the project page's Flight console panel
 * (`web/features/flight-console.ts`, board web-msnsndki-dz3vn1): its
 * collapsed placeholder and the empty/fetch-failure states are client-built
 * `el()` nodes — `scripts/i18n/find-untagged-strings.mjs` listed all three as
 * untagged. Each must carry its STRINGS key so `translateDom()` (page load,
 * language switch, AND the panel's own post-fetch sweep) renders it in the
 * active locale, the same contract `docs-viewer.ts` already meets.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
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

type ConsoleMode = 'empty' | 'fail';

function boot(mode: ConsoleMode): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/flightlog')) {
      if (mode === 'fail') throw new Error('network down');
      return { ok: true, json: async () => ({ lines: [] }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

function expandConsole(): void {
  (document.querySelector('.console-title') as HTMLElement).click();
}

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

describe('the Flight console panel i18n wiring (board web-msnsndki-dz3vn1)', () => {
  afterEach(() => {
    localStorage.removeItem('ap-locale');
    vi.restoreAllMocks();
  });

  it('tags the collapsed placeholder with its STRINGS key', async () => {
    boot('empty');

    await vi.waitFor(() => {
      expect(document.querySelector('.console-body p')).not.toBeNull();
    });

    const collapsed = document.querySelector('.console-body p');
    expect(collapsed?.textContent).toBe('Collapsed — expand to load.');
    expect(collapsed?.getAttribute('data-i18n')).toBe('consoleCollapsed');
  });

  it('tags the empty state with its STRINGS key once expanded', async () => {
    boot('empty');
    await vi.waitFor(() => {
      expect(document.querySelector('.console-panel')).not.toBeNull();
    });
    expandConsole();

    await vi.waitFor(() => {
      expect(document.querySelector('.console-body p')?.textContent).toBe('No console output yet.');
    });
    expect(document.querySelector('.console-body p')?.getAttribute('data-i18n')).toBe(
      'consoleEmpty',
    );
  });

  it('tags the unavailable state when the fetch fails', async () => {
    boot('fail');
    await vi.waitFor(() => {
      expect(document.querySelector('.console-panel')).not.toBeNull();
    });
    expandConsole();

    await vi.waitFor(() => {
      expect(document.querySelector('.console-body p')?.textContent).toBe(
        'Flight console unavailable.',
      );
    });
    expect(document.querySelector('.console-body p')?.getAttribute('data-i18n')).toBe(
      'consoleUnavailable',
    );
  });

  it('switching to Hebrew translates the collapsed placeholder', async () => {
    boot('empty');
    await vi.waitFor(() => {
      expect(document.querySelector('.console-body p')).not.toBeNull();
    });

    switchToHebrew();

    expect(document.querySelector('.console-body p')?.textContent).toBe(
      STRINGS.he.consoleCollapsed,
    );
  });

  it('renders the empty state in Hebrew when expanded after the language switch', async () => {
    boot('empty');
    await vi.waitFor(() => {
      expect(document.querySelector('.console-panel')).not.toBeNull();
    });
    switchToHebrew();
    expandConsole();

    await vi.waitFor(() => {
      expect(document.querySelector('.console-body p')?.textContent).toBe(STRINGS.he.consoleEmpty);
    });
  });

  it('renders the unavailable state in Hebrew when the fetch fails after the language switch', async () => {
    boot('fail');
    await vi.waitFor(() => {
      expect(document.querySelector('.console-panel')).not.toBeNull();
    });
    switchToHebrew();
    expandConsole();

    await vi.waitFor(() => {
      expect(document.querySelector('.console-body p')?.textContent).toBe(
        STRINGS.he.consoleUnavailable,
      );
    });
  });
});
