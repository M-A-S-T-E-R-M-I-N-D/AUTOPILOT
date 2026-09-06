// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * search.ts's Ask button click handler (searchInit()) painted five status
 * lines as hardcoded English literals set via el()/textContent at click
 * time — "Pick a project and type a question first.", "Asking…", the two
 * "grounded" vs "Deep" progress lines, and "Ask failed — is the dashboard
 * still running?" — plus reset the button back to a literal 'Ask' when a
 * request settled. `pnpm i18n:untagged` never flagged any of them: the text
 * is assigned via DOM calls, not an HTML template the tag scanner reads,
 * the same blind spot the Inbox note form had (board web-msnsndki-dz3vn1).
 * This pins the tr()-at-paint-time route for all five, in both locales.
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

describe('search.ts Ask button status text i18n', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('paints every Ask status line via tr(), not hardcoded literals', () => {
    const js = clientJs();
    expect(js).toContain("tr('askPickProjectFirst')");
    expect(js).toContain("tr('asking')");
    expect(js).toContain("tr('askReadingDeep')");
    expect(js).toContain("tr('askAskingModel')");
    expect(js).toContain("tr('askFailed')");
    expect(js).toContain("askBtn.textContent = tr('ask')");
    expect(js).not.toContain("'Pick a project and type a question first.'");
    expect(js).not.toContain("'Asking…'");
    expect(js).not.toContain("'Reading the project to find the answer (Deep)…'");
    expect(js).not.toContain("'Asking the model (grounded in the indexed code)…'");
    expect(js).not.toContain("'Ask failed — is the dashboard still running?'");
  });

  it('shows the English guidance line when clicking Ask with no question typed', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const qEl = document.getElementById('search-q') as HTMLInputElement;
    const askBtn = document.getElementById('ask-go') as HTMLButtonElement;
    qEl.value = '';
    askBtn.click();

    const answerEl = document.getElementById('ask-answer');
    expect(answerEl?.textContent).toBe(STRINGS.en.askPickProjectFirst);
  });

  it('shows the Hebrew guidance line once the locale is Hebrew', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    switchToHebrew();

    const qEl = document.getElementById('search-q') as HTMLInputElement;
    const askBtn = document.getElementById('ask-go') as HTMLButtonElement;
    qEl.value = '';
    askBtn.click();

    const answerEl = document.getElementById('ask-answer');
    expect(answerEl?.textContent).toBe(STRINGS.he.askPickProjectFirst);
    expect(STRINGS.he.askPickProjectFirst).not.toBe(STRINGS.en.askPickProjectFirst);
  });

  it('shows the localized "Asking…" progress line, then resets to the localized "Ask" label', async () => {
    let resolveStream: (() => void) | undefined;
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && url === '/api/ask/stream') {
        return new Promise<Response>((resolve) => {
          resolveStream = () => {
            const frame = `data: ${JSON.stringify({ done: true, ok: true, answer: 'ok', sources: [] })}\n\n`;
            const body = new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(frame));
                controller.close();
              },
            });
            resolve({ ok: true, body } as unknown as Response);
          };
        });
      }
      return { ok: true, json: async () => STATE } as Response;
    });

    document.open();
    document.write(renderShell('p1'));
    document.close();
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);
    switchToHebrew();

    const sel = document.getElementById('search-project') as HTMLSelectElement;
    const qEl = document.getElementById('search-q') as HTMLInputElement;
    const askBtn = document.getElementById('ask-go') as HTMLButtonElement;
    sel.value = 'p1';
    qEl.value = 'what does this do?';
    askBtn.click();
    await vi.advanceTimersByTimeAsync(1);

    expect(askBtn.textContent).toBe(STRINGS.he.asking);

    resolveStream?.();
    await vi.advanceTimersByTimeAsync(1);

    expect(askBtn.textContent).toBe(STRINGS.he.ask);
  });

  it('renders the localized failure line when the stream request itself rejects', async () => {
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && url === '/api/ask/stream') {
        throw new Error('network down');
      }
      return { ok: true, json: async () => STATE } as Response;
    });

    boot();
    await vi.advanceTimersByTimeAsync(1);

    const sel = document.getElementById('search-project') as HTMLSelectElement;
    const qEl = document.getElementById('search-q') as HTMLInputElement;
    const askBtn = document.getElementById('ask-go') as HTMLButtonElement;
    sel.value = 'p1';
    qEl.value = 'what does this do?';
    askBtn.click();
    await vi.advanceTimersByTimeAsync(1);

    const answerEl = document.getElementById('ask-answer');
    expect(answerEl?.textContent).toBe(STRINGS.en.askFailed);
  });
});
