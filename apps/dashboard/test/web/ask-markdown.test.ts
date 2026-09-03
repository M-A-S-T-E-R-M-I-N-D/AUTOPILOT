// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Ask answer used to render as one raw text node (safe, but flat — no
 * headings, code blocks, tables, or lists even when the model returns them).
 * This drives the REAL client bundle through a full ask round-trip and
 * asserts the answer renders as structured DOM built via createElement /
 * textContent only — never innerHTML — so a model answer can never inject
 * markup, no matter what characters it contains.
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

const MARKDOWN_ANSWER = [
  '# Heading',
  '',
  'A paragraph with **bold**, *italic*, and `inline code`.',
  '',
  '- first item',
  '- second item',
  '',
  '```js',
  'const x = 1;',
  '<script>alert(1)</script>',
  '```',
  '',
  '| a | b |',
  '| --- | --- |',
  '| 1 | 2 |',
].join('\n');

describe('ask answer renders as structured Markdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.open();
    document.write(renderShell());
    document.close();
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && url === '/api/ask/stream') {
        const frame = `data: ${JSON.stringify({ done: true, ok: true, answer: MARKDOWN_ANSWER, sources: ['src/a.ts'] })}\n\n`;
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
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('builds headings, lists, code blocks, and tables via DOM APIs (no innerHTML injection)', async () => {
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1); // first fleet paint populates the project picker

    const sel = document.getElementById('search-project') as HTMLSelectElement;
    const qEl = document.getElementById('search-q') as HTMLInputElement;
    const askBtn = document.getElementById('ask-go') as HTMLButtonElement;
    expect(sel.options.length).toBe(1);
    sel.value = 'p1';
    qEl.value = 'what does this repo do?';

    askBtn.click();
    await vi.advanceTimersByTimeAsync(1);

    const answerEl = document.getElementById('ask-answer')!;
    expect(answerEl.querySelector('h1')?.textContent).toBe('Heading');
    expect(answerEl.querySelector('strong')?.textContent).toBe('bold');
    expect(answerEl.querySelector('em')?.textContent).toBe('italic');
    expect(answerEl.querySelectorAll('li').length).toBe(2);

    const codeBlock = answerEl.querySelector('pre code');
    expect(codeBlock?.textContent).toContain('<script>alert(1)</script>');
    // The fenced block's contents landed as text, not markup — no script element exists anywhere.
    expect(answerEl.querySelector('script')).toBeNull();

    const rows = answerEl.querySelectorAll('table tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0]?.querySelectorAll('td')[1]?.textContent).toBe('2');

    expect(answerEl.querySelector('.ask-sources')?.textContent).toBe('sources: src/a.ts');
  });

  it('accumulates streamed delta frames as they arrive, not just the terminal answer', async () => {
    // The terminal frame deliberately omits `answer` — the only way the final
    // render can be correct is if the client accumulated the delta frames as
    // they streamed in, proving the answer builds up progressively rather than
    // appearing all at once from a `done.answer` field.
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && url === '/api/ask/stream') {
        const frames = [
          { delta: 'The total ' },
          { delta: 'is a reduce over cart items.' },
          { done: true, ok: true, sources: ['src/cart.ts'] },
        ]
          .map((f) => `data: ${JSON.stringify(f)}\n\n`)
          .join('');
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(frames));
            controller.close();
          },
        });
        return { ok: true, body } as unknown as Response;
      }
      return { ok: true, json: async () => STATE } as Response;
    });

    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const sel = document.getElementById('search-project') as HTMLSelectElement;
    const qEl = document.getElementById('search-q') as HTMLInputElement;
    const askBtn = document.getElementById('ask-go') as HTMLButtonElement;
    sel.value = 'p1';
    qEl.value = 'how is the total computed?';

    askBtn.click();
    await vi.advanceTimersByTimeAsync(1);

    const answerEl = document.getElementById('ask-answer')!;
    expect(answerEl.textContent).toContain('The total is a reduce over cart items.');
    expect(answerEl.querySelector('.ask-sources')?.textContent).toBe('sources: src/cart.ts');
    expect(askBtn.disabled).toBe(false);
    expect(askBtn.textContent).toBe('Ask');
  });
});
