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
 *
 * Relanded: the slice first shipped as c9f4d502 and was swept away three
 * minutes later by the 07:47 revert burst — a false-positive drive-path
 * scanner hit on `overflow-y` (fixed in 4fecba5f) blind-reverted every commit
 * in its window. The scanner and its other innocent victims were forward-
 * relanded; this one was not, so the three strings reappeared in the
 * scanner's report.
 *
 * That relanded pass missed the panel's own always-on chrome — the
 * `<summary>` toggle's title/tip and the loaded `<pre>`'s line-count
 * `aria-label`/`data-tip` — since neither is a literal `<tag>text</tag>` or
 * `el()` call the untagged-string scanner's regex can see (`.textContent =`
 * and a function-call value are both outside its detection). Covered below
 * alongside the original three.
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

type ConsoleMode = 'empty' | 'fail' | 'lines' | 'lines1';

function boot(mode: ConsoleMode): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/flightlog')) {
      if (mode === 'fail') throw new Error('network down');
      const lines =
        mode === 'lines' ? ['first line', 'second line'] : mode === 'lines1' ? ['only line'] : [];
      return { ok: true, json: async () => ({ lines }) } as unknown as Response;
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

  it('tags the panel toggle title and tip with their STRINGS keys', async () => {
    boot('empty');
    await vi.waitFor(() => {
      expect(document.querySelector('.console-title')).not.toBeNull();
    });

    const summary = document.querySelector('.console-title');
    expect(summary?.textContent).toBe('🖥️ Flight console');
    expect(summary?.getAttribute('data-i18n')).toBe('consoleTitle');
    expect(summary?.getAttribute('data-tip')).toBe(
      'Raw stdout+stderr tail of the flight process for this project',
    );
    expect(summary?.getAttribute('data-i18n-tip')).toBe('consoleTitleTip');
  });

  it('switching to Hebrew translates the panel toggle title and tip', async () => {
    boot('empty');
    await vi.waitFor(() => {
      expect(document.querySelector('.console-title')).not.toBeNull();
    });

    switchToHebrew();

    const summary = document.querySelector('.console-title');
    expect(summary?.textContent).toBe(STRINGS.he.consoleTitle);
    expect(summary?.getAttribute('data-tip')).toBe(STRINGS.he.consoleTitleTip);
  });

  it('tags the loaded console lines with the {n} template key for aria-label and tip', async () => {
    boot('lines');
    await vi.waitFor(() => {
      expect(document.querySelector('.console-panel')).not.toBeNull();
    });
    expandConsole();

    await vi.waitFor(() => {
      expect(document.querySelector('.console-lines')).not.toBeNull();
    });
    const pre = document.querySelector('.console-lines');
    expect(pre?.getAttribute('aria-label')).toBe('2 lines of raw flight process output');
    expect(pre?.getAttribute('data-tip')).toBe('2 lines of raw flight process output');
    expect(pre?.getAttribute('data-i18n-aria-template')).toBe('consoleLinesAriaPlural');
    expect(pre?.getAttribute('data-i18n-tip-template')).toBe('consoleLinesAriaPlural');
    expect(pre?.getAttribute('data-i18n-args')).toBe(JSON.stringify({ n: 2 }));
  });

  it('picks the singular template key for a single-line console', async () => {
    boot('lines1');
    await vi.waitFor(() => {
      expect(document.querySelector('.console-panel')).not.toBeNull();
    });
    expandConsole();

    await vi.waitFor(() => {
      expect(document.querySelector('.console-lines')).not.toBeNull();
    });
    const pre = document.querySelector('.console-lines');
    expect(pre?.getAttribute('aria-label')).toBe('1 line of raw flight process output');
    expect(pre?.getAttribute('data-i18n-aria-template')).toBe('consoleLinesAriaSingular');
    expect(pre?.getAttribute('data-i18n-args')).toBe(JSON.stringify({ n: 1 }));
  });

  it('renders the loaded console lines aria-label and tip in Hebrew when expanded after the language switch', async () => {
    boot('lines');
    await vi.waitFor(() => {
      expect(document.querySelector('.console-panel')).not.toBeNull();
    });
    switchToHebrew();
    expandConsole();

    await vi.waitFor(() => {
      expect(document.querySelector('.console-lines')).not.toBeNull();
    });
    const expected = STRINGS.he.consoleLinesAriaPlural.replace('{n}', '2');
    const pre = document.querySelector('.console-lines');
    expect(pre?.getAttribute('aria-label')).toBe(expected);
    expect(pre?.getAttribute('data-tip')).toBe(expected);
  });
});
