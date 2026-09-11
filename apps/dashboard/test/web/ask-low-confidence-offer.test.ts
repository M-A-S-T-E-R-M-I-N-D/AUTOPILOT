// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * ASK/ARCHITECT answer-quality doctrine slice 3 (docs/epics/0021-ask-answer-
 * quality-doctrine.md, board web-mtt5qwjp-xns6ps): the Ask panel's
 * escalation-offer affordance. `ask/service.ts`'s `AskResult.lowConfidence`
 * signal (piece 3's earlier slice) reaches the client on the terminal SSE
 * frame; `search.ts`'s `renderOffer()` turns it into a real button
 * (`#ask-offer`) that checks the Deep box and re-asks in one click — the
 * offer never auto-fires Deep itself (epic 0012's "operator decides" line).
 * Same jsdom + `new Function(clientJs())()` + mocked-fetch harness as
 * ask-deep-toggle.test.ts and ask-persona-toggle.test.ts.
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

/** Answers every `/api/ask/stream` call with a terminal `done` frame carrying
 *  the given `lowConfidence` value (omitted entirely when `undefined`, the
 *  same as a real tier-1 confident answer or an escalated Deep answer). */
function mockAskStream(onBody: (body: unknown) => void, lowConfidence?: boolean): void {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (typeof url === 'string' && url === '/api/ask/stream') {
      onBody(JSON.parse(String(init?.body ?? '{}')));
      const payload: Record<string, unknown> = {
        done: true,
        ok: true,
        answer: 'the answer',
        sources: ['src/a.ts'],
      };
      if (lowConfidence !== undefined) payload['lowConfidence'] = lowConfidence;
      const frame = `data: ${JSON.stringify(payload)}\n\n`;
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

describe('the Ask panel low-confidence escalation offer', () => {
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

  it('renders no offer on a confident answer', async () => {
    mockAskStream(() => {});

    new Function(clientJs())();
    await askViaUi('what is happening right now?');

    expect(document.getElementById('ask-offer')?.children.length).toBe(0);
  });

  it('renders the offer button on a low-confidence tier-1 answer', async () => {
    mockAskStream(() => {}, true);

    new Function(clientJs())();
    await askViaUi('where does auth happen?');

    const btn = document.querySelector('.ask-offer-btn');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toBe('Not confident in that answer — try Deep?');
  });

  it('never offers on an already-Deep answer, even if lowConfidence were somehow set', async () => {
    mockAskStream(() => {}, true);

    new Function(clientJs())();
    const deepEl = document.getElementById('ask-deep') as HTMLInputElement;
    deepEl.checked = true;
    await askViaUi('where does auth happen?');

    expect(document.getElementById('ask-offer')?.children.length).toBe(0);
  });

  it('checks Deep and re-asks the same question in one click, without auto-firing on its own', async () => {
    const bodies: unknown[] = [];
    mockAskStream((body) => bodies.push(body), true);

    new Function(clientJs())();
    const deepEl = document.getElementById('ask-deep') as HTMLInputElement;
    await askViaUi('where does auth happen?');

    expect(bodies).toHaveLength(1);
    expect(deepEl.checked).toBe(false); // no auto-fire — the offer only appeared

    const btn = document.querySelector('.ask-offer-btn') as HTMLButtonElement;
    btn.click();
    await vi.advanceTimersByTimeAsync(1);

    expect(deepEl.checked).toBe(true);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toMatchObject({ question: 'where does auth happen?', deep: true });
  });

  it('clears a stale offer when a new Ask request starts', async () => {
    mockAskStream(() => {}, true);
    new Function(clientJs())();
    await askViaUi('first question');
    expect(document.querySelectorAll('.ask-offer-btn')).toHaveLength(1);

    mockAskStream(() => {}, false);
    await askViaUi('second question');

    expect(document.querySelectorAll('.ask-offer-btn')).toHaveLength(0);
  });
});
