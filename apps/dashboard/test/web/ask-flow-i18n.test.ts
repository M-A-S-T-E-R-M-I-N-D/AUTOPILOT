// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The search palette's Ask flow (board web-msnsndki-dz3vn1, the slice after
 * the four search result-state notes): the "Ask" button's busy label
 * ("Asking…"), the pick-a-project nudge on an incomplete submit, the two
 * thinking placeholders painted into `#ask-answer` while the stream is in
 * flight (grounded / Deep), and the failure line when the request rejects —
 * `web/features/search.ts`'s Ask click handler. All were plain literals
 * (`textContent` assignments and `renderAnswer()` arguments), invisible to
 * `pnpm i18n:untagged`, stuck in English under the Hebrew locale.
 *
 * Two traps the plain tag alone would not close:
 *  - the button is tagged `data-i18n="ask"` in the shell HTML, so every
 *    `renderFleet()` tick's document-wide `translateDom()` sweep repainted the
 *    idle "Ask" over "Asking…" mid-request. The handler now tags the button
 *    with whichever key matches its state, the way the flight log's
 *    Load-older button does.
 *  - `#ask-answer` is an aria-live `role="status"` region: a tagged note there
 *    would be re-announced by every tick's sweep. The `[data-i18n]` sweep now
 *    writes only on a real change (`features/locale.ts`).
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

/** How the mocked `/api/ask/stream` answers: a rejection, never (the request
 *  stays in flight), or a two-frame SSE stream that answers "Hello". */
type AskMode = 'fail' | 'pending' | 'stream';

const STREAM_BODY = 'data: {"delta":"Hello"}\n\ndata: {"done":true}\n\n';

function streamResponse(): Response {
  const bytes = new TextEncoder().encode(STREAM_BODY);
  let handed = false;
  const reader = {
    read: async () => {
      if (handed) return { done: true, value: undefined };
      handed = true;
      return { done: false, value: bytes };
    },
  };
  return { ok: true, body: { getReader: () => reader } } as unknown as Response;
}

function askFetch(mode: { value: AskMode }): typeof fetch {
  return vi.fn(async (url: unknown) => {
    const href = String(url);
    if (!href.includes('/api/ask/stream')) {
      return { ok: true, json: async () => STATE } as unknown as Response;
    }
    if (mode.value === 'fail') throw new Error('connection refused');
    if (mode.value === 'pending') return new Promise<Response>(() => {});
    return streamResponse();
  }) as unknown as typeof fetch;
}

async function boot(mode: { value: AskMode }): Promise<void> {
  document.open();
  document.write(renderShell(''));
  document.close();
  globalThis.fetch = askFetch(mode);
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function askButton(): HTMLButtonElement {
  return document.getElementById('ask-go') as HTMLButtonElement;
}

async function ask(project: string, q: string, deep = false): Promise<void> {
  (document.getElementById('search-project') as HTMLSelectElement).value = project;
  (document.getElementById('search-q') as HTMLInputElement).value = q;
  (document.getElementById('ask-deep') as HTMLInputElement).checked = deep;
  askButton().click();
  await vi.advanceTimersByTimeAsync(10);
}

function note(): HTMLElement | null {
  return document.querySelector('#ask-answer .ask-note');
}

function switchTo(locale: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${locale}"]`) as HTMLButtonElement).click();
}

const NOTES: ReadonlyArray<{
  label: string;
  mode: AskMode;
  project: string;
  deep: boolean;
  key: 'askPickProject' | 'askThinking' | 'askThinkingDeep' | 'askFailed';
  english: string;
}> = [
  {
    label: 'an incomplete submit',
    mode: 'pending',
    project: '',
    deep: false,
    key: 'askPickProject',
    english: 'Pick a project and type a question first.',
  },
  {
    label: 'a grounded request still in flight',
    mode: 'pending',
    project: 'p1',
    deep: false,
    key: 'askThinking',
    english: 'Asking the model (grounded in the indexed code)…',
  },
  {
    label: 'a Deep request still in flight',
    mode: 'pending',
    project: 'p1',
    deep: true,
    key: 'askThinkingDeep',
    english: 'Reading the project to find the answer (Deep)…',
  },
  {
    label: 'a rejected request',
    mode: 'fail',
    project: 'p1',
    deep: false,
    key: 'askFailed',
    english: 'Ask failed — is the dashboard still running?',
  },
];

describe('search palette Ask flow i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(NOTES)('tags the note for $label and paints it in English by default', async (s) => {
    await boot({ value: s.mode });
    await ask(s.project, 'why?', s.deep);

    const p = note();
    expect(p).not.toBeNull();
    expect(p?.textContent).toBe(s.english);
    expect(p?.textContent).toBe(STRINGS.en[s.key]);
    expect(p?.getAttribute('data-i18n')).toBe(s.key);
  });

  it.each(NOTES)(
    'a page that boots in Hebrew paints the note for $label in Hebrew at birth',
    async (s) => {
      localStorage.setItem('ap-locale', 'he');
      await boot({ value: s.mode });
      await ask(s.project, 'why?', s.deep);

      const p = note();
      expect(p).not.toBeNull();
      expect(p?.textContent).toBe(STRINGS.he[s.key]);
    },
  );

  it('paints the busy label with the busy key mid-request, so a sweep repaints "Asking…" and not the idle "Ask"', async () => {
    await boot({ value: 'pending' });
    await ask('p1', 'why?');

    const btn = askButton();
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Asking…');
    expect(btn.textContent).toBe(STRINGS.en.askAsking);
    expect(btn.getAttribute('data-i18n')).toBe('askAsking');

    // The language toggle runs the same document-wide translateDom() sweep a
    // fleet tick does — it must repaint the BUSY label, not the idle one.
    switchTo('he');
    expect(askButton()).toBe(btn);
    expect(btn.textContent).toBe(STRINGS.he.askAsking);
    expect(btn.textContent).not.toBe(STRINGS.he.ask);
  });

  it('switching to Hebrew mid-request translates the thinking note in place', async () => {
    await boot({ value: 'pending' });
    await ask('p1', 'why?');
    const before = note();
    expect(before).not.toBeNull();
    expect(before?.textContent).toBe(STRINGS.en.askThinking);

    switchTo('he');

    expect(note()).toBe(before);
    expect(before?.textContent).toBe(STRINGS.he.askThinking);
  });

  it('a rejected request restores the idle label with the idle key, in the locale active then', async () => {
    await boot({ value: 'fail' });
    await ask('p1', 'why?');

    const btn = askButton();
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe(STRINGS.en.ask);
    expect(btn.getAttribute('data-i18n')).toBe('ask');
    expect(note()?.getAttribute('data-i18n')).toBe('askFailed');

    switchTo('he');
    expect(btn.textContent).toBe(STRINGS.he.ask);
    expect(note()?.textContent).toBe(STRINGS.he.askFailed);
  });

  it('a streamed answer replaces the note and carries no tag, so a later sweep can never overwrite the model’s words', async () => {
    await boot({ value: 'stream' });
    await ask('p1', 'why?');
    await vi.waitFor(() => expect(askButton().disabled).toBe(false));

    const answer = document.getElementById('ask-answer') as HTMLElement;
    expect(note()).toBeNull();
    expect(answer.querySelector('[data-i18n]')).toBeNull();
    expect(answer.textContent).toContain('Hello');

    switchTo('he');
    expect(answer.textContent).toContain('Hello');
    expect(askButton().textContent).toBe(STRINGS.he.ask);
  });

  it('an identical sweep leaves the aria-live note’s text node untouched — no re-announce per fleet tick', async () => {
    await boot({ value: 'pending' });
    await ask('p1', 'why?');
    const p = note() as HTMLElement;
    const textNode = p.firstChild;
    expect(textNode).not.toBeNull();

    // Re-applying the current locale runs a full translateDom() sweep.
    switchTo('en');

    expect(note()).toBe(p);
    expect(p.firstChild).toBe(textNode);
  });

  it('keeps the Hebrew rows native — real Hebrew, not the English text', () => {
    for (const key of [
      'askAsking',
      'askPickProject',
      'askThinking',
      'askThinkingDeep',
      'askFailed',
    ] as const) {
      expect(STRINGS.he[key]).not.toBe(STRINGS.en[key]);
      expect(HEBREW_LETTER.test(STRINGS.he[key])).toBe(true);
    }
    // The waiting states keep their trailing ellipsis in every locale.
    expect(STRINGS.he.askAsking.endsWith('…')).toBe(true);
    expect(STRINGS.he.askThinking.endsWith('…')).toBe(true);
    expect(STRINGS.he.askThinkingDeep.endsWith('…')).toBe(true);
  });

  it('paints every label and note via tr(), with none of the old literals left in the assembled bundle', () => {
    const js = clientJs();
    expect(js).toContain("setAskLabel('askAsking')");
    expect(js).toContain("renderAskNote('askFailed')");
    // Pin the old single-quoted JS literals, not the bare sentences: the
    // English STRINGS table itself ships in this bundle as JSON (double
    // quotes).
    expect(js).not.toContain("'Asking…'");
    expect(js).not.toContain("askBtn.textContent = 'Ask'");
    expect(js).not.toContain("'Pick a project and type a question first.'");
    expect(js).not.toContain("'Asking the model (grounded in the indexed code)…'");
    expect(js).not.toContain("'Reading the project to find the answer (Deep)…'");
    expect(js).not.toContain("'Ask failed — is the dashboard still running?'");
  });
});
