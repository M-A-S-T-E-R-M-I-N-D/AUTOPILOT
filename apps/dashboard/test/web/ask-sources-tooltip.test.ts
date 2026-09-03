// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: the Ask answer's "sources: a.ts · b.ts" strip
 * rendered as a bare `.ask-sources` span — every other file-list element in
 * the shell (docs-file chips, search-hit rows, landing-commit file lists)
 * explains itself via [data-tip] on hover/focus, but this one did not.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 2,
  totalBytes: 100,
  languages: [{ language: 'typescript', files: 2, bytes: 100 }],
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

describe('the ask answer sources strip explains itself on hover/focus', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives the .ask-sources strip a data-tip and an aria-label spelling out the file list', async () => {
    vi.useFakeTimers();
    document.open();
    document.write(renderShell());
    document.close();
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && url === '/api/ask/stream') {
        const frame = `data: ${JSON.stringify({ done: true, ok: true, answer: 'It sums cart items.', sources: ['src/a.ts', 'src/b.ts'] })}\n\n`;
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

    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const sel = document.getElementById('search-project') as HTMLSelectElement;
    const qEl = document.getElementById('search-q') as HTMLInputElement;
    const askBtn = document.getElementById('ask-go') as HTMLButtonElement;
    sel.value = 'p1';
    qEl.value = 'how is the total computed?';
    askBtn.click();
    await vi.advanceTimersByTimeAsync(1);

    const sources = document.querySelector('.ask-sources');
    expect(sources).toBeTruthy();
    expect(sources?.textContent).toBe('sources: src/a.ts · src/b.ts');
    expect(sources?.getAttribute('tabindex')).toBe('0');
    expect(sources?.getAttribute('data-tip')).toBe(
      'Indexed files the model consulted to ground this answer',
    );
    expect(sources?.getAttribute('aria-label')).toBe('Sources: src/a.ts, src/b.ts');
  });
});
