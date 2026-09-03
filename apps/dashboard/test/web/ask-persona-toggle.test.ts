// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * ARCHITECT chat v2 slice 2 (docs/epics/0011-architect-chat-v2.md, board
 * web-msnqmgge-oijj8x): the Ask panel's GENIUS/ARCHITECT persona toggle.
 * GENIUS is the default, unchanged-behavior persona; ARCHITECT is opt-in per
 * session (in-memory only — never persisted to localStorage, so a fresh page
 * load always starts back at GENIUS) and threads a `persona` field through
 * `/api/ask/stream`'s request body. See ask-view-context.test.ts for the
 * sibling "view" field's equivalent coverage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

function mockAskStream(onBody: (body: unknown) => void): void {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (typeof url === 'string' && url === '/api/ask/stream') {
      onBody(JSON.parse(String(init?.body ?? '{}')));
      const frame = `data: ${JSON.stringify({ done: true, ok: true, answer: 'ok', sources: [], persona: 'genius' })}\n\n`;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(frame));
          controller.close();
        },
      });
      return { ok: true, body } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as Response;
  });
}

async function askViaUi(question: string): Promise<void> {
  await vi.advanceTimersByTimeAsync(1); // first fleet paint populates the project picker
  const sel = document.getElementById('search-project') as HTMLSelectElement;
  const qEl = document.getElementById('search-q') as HTMLInputElement;
  const askBtn = document.getElementById('ask-go') as HTMLButtonElement;
  sel.value = 'p1';
  qEl.value = question;
  askBtn.click();
  await vi.advanceTimersByTimeAsync(1);
}

describe('the Ask panel persona toggle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.open();
    document.write(renderShell());
    document.close();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders GENIUS as the pressed default and ARCHITECT as unpressed', () => {
    new Function(clientJs())();
    const geniusBtn = document.querySelector('[data-persona-btn="genius"]');
    const architectBtn = document.querySelector('[data-persona-btn="architect"]');
    expect(geniusBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(architectBtn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('sends persona: genius when asking without touching the toggle', async () => {
    let received: unknown;
    mockAskStream((body) => {
      received = body;
    });

    new Function(clientJs())();
    await askViaUi('what is happening right now?');

    expect(received).toMatchObject({ project: 'p1', persona: 'genius' });
  });

  it('switches the pressed state and sends persona: architect once ARCHITECT is clicked', async () => {
    let received: unknown;
    mockAskStream((body) => {
      received = body;
    });

    new Function(clientJs())();
    const architectBtn = document.querySelector(
      '[data-persona-btn="architect"]',
    ) as HTMLButtonElement;
    architectBtn.click();

    const geniusBtn = document.querySelector('[data-persona-btn="genius"]');
    expect(geniusBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(architectBtn.getAttribute('aria-pressed')).toBe('true');

    await askViaUi('propose a task reorder');

    expect(received).toMatchObject({ project: 'p1', persona: 'architect' });
  });

  it('never persists the persona choice to localStorage (session-only, per the epic acceptance criterion)', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    mockAskStream(() => {});

    new Function(clientJs())();
    const architectBtn = document.querySelector(
      '[data-persona-btn="architect"]',
    ) as HTMLButtonElement;
    architectBtn.click();
    await askViaUi('what should I focus on next?');

    const personaWrites = setItem.mock.calls.filter(([key]) =>
      String(key).toLowerCase().includes('persona'),
    );
    expect(personaWrites).toEqual([]);
  });
});
