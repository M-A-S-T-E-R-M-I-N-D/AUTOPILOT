// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Operator-reported 2026-09-17: "I ask the LLM questions and I don't see it
 * answering me in the chat at all." The capture they attached showed
 * `#ask-sheet-body` holding a run of tool-activity chips and no answer.
 *
 * Measured against the live server the same day, a Deep ask streams a shape
 * the non-Deep path never produces: **zero `delta` frames**, N `activity`
 * frames, then ONE terminal `done` frame carrying the entire answer (12
 * activity frames / 0 deltas / 1 done, 49s, on `POST /api/ask/stream` with
 * `deep: true`). Every prior ask test drives either a delta stream or a bare
 * terminal frame with no activity ahead of it, so that exact ordering — a
 * pile of activity frames followed by a single terminal answer, while the
 * Ask SHEET holds the searchbar — was never covered.
 *
 * This drives the real client bundle through it with the sheet open, which
 * is where the operator was looking: the sheet moves `#searchbar` into its
 * body and `#search-form` into its foot, so a regression that stranded
 * `#ask-answer` outside the visible body would show up here as an answer
 * that never lands under `#ask-sheet-body`.
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

/** The measured Deep answer text — Markdown, as the escalated tier returns it. */
const DEEP_ANSWER = [
  'Donations are **published addresses only** — there is no payment code.',
  '',
  '- `docs/DONATE.md` states the policy.',
  '- `.github/FUNDING.yml` carries the platform entries.',
].join('\n');

/** The measured frame ordering: activity chips, then ONE terminal answer. */
const DEEP_FRAMES = [
  { activity: { tool: 'Grep', target: 'FOUNDRY' } },
  { activity: { tool: 'Read', target: 'docs/DONATE.md' } },
  { activity: { tool: 'Glob', target: 'docs/donations.json' } },
  { done: true, ok: true, answer: DEEP_ANSWER, sources: [], persona: 'genius' },
];

function streamOf(frames: readonly unknown[]): ReadableStream<Uint8Array> {
  const text = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('');
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

describe('a Deep ask answers inside the Ask sheet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The sheet remembers itself open for the session (`ap-ask-sheet`), and
    // sessionStorage outlives document.write() — without this clear, the
    // second test starts with the sheet already restored open and the fab
    // click TOGGLES it shut instead of opening it.
    sessionStorage.clear();
    document.open();
    document.write(renderShell());
    document.close();
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && url === '/api/ask/stream') {
        return { ok: true, body: streamOf(DEEP_FRAMES) } as unknown as Response;
      }
      return { ok: true, json: async () => STATE } as Response;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the terminal answer into #ask-answer even when no delta frame ever arrives', async () => {
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    (document.getElementById('ask-fab') as HTMLButtonElement).click();

    const sel = document.getElementById('search-project') as HTMLSelectElement;
    const qEl = document.getElementById('search-q') as HTMLInputElement;
    sel.value = 'p1';
    qEl.value = 'how do donations work?';
    (document.getElementById('ask-go') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(1);

    const answerEl = document.getElementById('ask-answer')!;
    expect(answerEl.textContent).toContain('published addresses only');
    expect(answerEl.querySelectorAll('li').length).toBe(2);
  });

  it('puts that answer inside the sheet body, where the operator is looking', async () => {
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    (document.getElementById('ask-fab') as HTMLButtonElement).click();

    const sel = document.getElementById('search-project') as HTMLSelectElement;
    const qEl = document.getElementById('search-q') as HTMLInputElement;
    sel.value = 'p1';
    qEl.value = 'how do donations work?';
    (document.getElementById('ask-go') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(1);

    const body = document.getElementById('ask-sheet-body')!;
    const answerEl = document.getElementById('ask-answer')!;
    expect(body.contains(answerEl)).toBe(true);
    expect(body.textContent).toContain('published addresses only');
    // The activity chips render too — the answer does not replace them.
    expect(body.querySelectorAll('.ask-activity-chip').length).toBe(3);
  });
});
