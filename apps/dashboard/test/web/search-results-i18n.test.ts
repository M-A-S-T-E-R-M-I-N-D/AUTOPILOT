// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The search palette's four result-state notes (board web-msnsndki-dz3vn1;
 * `pnpm i18n:untagged` listed the "No matches." node, the other three ride
 * the same `render()` as a variable the scanner cannot see): "Pick a project
 * and type a query." on an incomplete submit, "Searching…" while the fetch is
 * in flight, "No matches." on an empty hit list, and "Search failed." when
 * the request rejects — `web/features/search.ts`'s `searchInit()`.
 *
 * Every note is rebuilt inside the submit handler or its fetch continuations,
 * which land whenever the server answers — long after any page-level
 * `translateDom()` sweep — so each paints via `tr()` in the locale active
 * at birth AND carries its `data-i18n` key, so the language toggle's
 * document-wide sweep (and every later `renderFleet()` tick) keeps a note
 * that is still on screen current when the reader switches locale.
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

const HITS = [{ path: 'src/foo.ts', language: 'typescript', score: 3.2, snippet: 'const foo' }];

/** How the mocked `/api/search` answers: a hit list, an empty one, a
 *  rejection, or never (the request stays in flight). */
type SearchMode = 'hits' | 'empty' | 'fail' | 'pending';

function searchFetch(mode: { value: SearchMode }): typeof fetch {
  return vi.fn(async (url: unknown) => {
    const href = String(url);
    if (!href.includes('/api/search')) {
      return { ok: true, json: async () => STATE } as unknown as Response;
    }
    if (mode.value === 'fail') throw new Error('connection refused');
    if (mode.value === 'pending') return new Promise<Response>(() => {});
    const hits = mode.value === 'hits' ? HITS : [];
    return { ok: true, json: async () => ({ hits }) } as unknown as Response;
  }) as unknown as typeof fetch;
}

async function boot(mode: { value: SearchMode }): Promise<void> {
  document.open();
  document.write(renderShell(''));
  document.close();
  globalThis.fetch = searchFetch(mode);
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

async function submit(project: string, q: string): Promise<void> {
  const sel = document.getElementById('search-project') as HTMLSelectElement;
  const qEl = document.getElementById('search-q') as HTMLInputElement;
  const form = document.getElementById('search-form') as HTMLFormElement;
  sel.value = project;
  qEl.value = q;
  form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await vi.advanceTimersByTimeAsync(1);
  await Promise.resolve();
  await Promise.resolve();
}

function note(): HTMLElement | null {
  return document.querySelector('#search-results .search-empty');
}

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

const STATES: ReadonlyArray<{
  label: string;
  mode: SearchMode;
  project: string;
  key: 'searchPickProject' | 'searchSearching' | 'searchNoMatches' | 'searchFailed';
  english: string;
}> = [
  {
    label: 'an incomplete submit',
    mode: 'hits',
    project: '',
    key: 'searchPickProject',
    english: 'Pick a project and type a query.',
  },
  {
    label: 'a request still in flight',
    mode: 'pending',
    project: 'p1',
    key: 'searchSearching',
    english: 'Searching…',
  },
  {
    label: 'an empty hit list',
    mode: 'empty',
    project: 'p1',
    key: 'searchNoMatches',
    english: 'No matches.',
  },
  {
    label: 'a rejected request',
    mode: 'fail',
    project: 'p1',
    key: 'searchFailed',
    english: 'Search failed.',
  },
];

describe('search palette result-state i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(STATES)('tags the note for $label and paints it in English by default', async (s) => {
    await boot({ value: s.mode });
    await submit(s.project, 'foo');

    const p = note();
    expect(p).not.toBeNull();
    expect(p?.textContent).toBe(s.english);
    expect(p?.textContent).toBe(STRINGS.en[s.key]);
    expect(p?.getAttribute('data-i18n')).toBe(s.key);
  });

  it.each(STATES)(
    'a page that boots in Hebrew paints the note for $label in Hebrew at birth',
    async (s) => {
      localStorage.setItem('ap-locale', 'he');
      await boot({ value: s.mode });
      await submit(s.project, 'foo');

      expect(note()?.textContent).toBe(STRINGS.he[s.key]);
    },
  );

  it('switching to Hebrew while a note shows translates it in place', async () => {
    await boot({ value: 'empty' });
    await submit('p1', 'foo');
    const before = note();
    expect(before?.textContent).toBe('No matches.');

    switchToHebrew();

    expect(note()).toBe(before);
    expect(before?.textContent).toBe(STRINGS.he.searchNoMatches);
  });

  it('a hit list renders hits, not a note', async () => {
    await boot({ value: 'hits' });
    await submit('p1', 'foo');

    expect(note()).toBeNull();
    expect(document.querySelectorAll('.search-hit').length).toBe(1);
  });

  it('keeps the Hebrew rows native — real Hebrew, not the English text', () => {
    for (const s of STATES) {
      expect(STRINGS.he[s.key]).not.toBe(STRINGS.en[s.key]);
      expect(HEBREW_LETTER.test(STRINGS.he[s.key])).toBe(true);
    }
    // The in-flight note keeps its trailing ellipsis: it is a waiting state.
    expect(STRINGS.he.searchSearching.endsWith('…')).toBe(true);
  });
});
