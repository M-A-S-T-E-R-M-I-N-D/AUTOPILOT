// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0012 slice 3 (docs/epics/0012-agentic-ask-escalation.md, board
 * web-msnqmghc-3cb6dc): the Ask panel's manual Deep toggle (`#ask-deep`) and
 * the live Read/Grep/Glob tool-activity chips an escalated session streams
 * back. Both were wired end-to-end in `web/features/search.ts`
 * (`askDeepEl`/`renderActivity`) but only had string-containment coverage
 * (`search.test.ts`'s `toContain` checks against the generated source) — no
 * test drove the actual checkbox or fed a real `{activity}` SSE frame
 * through `pumpAskStream` the way `ask-persona-toggle.test.ts` does for the
 * sibling persona toggle. This file closes that gap with the same
 * jsdom + `new Function(clientJs())()` + mocked-fetch pattern.
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

/** One SSE frame per queued activity entry, then a terminal `done` frame. */
function mockAskStream(
  onBody: (body: unknown) => void,
  activities: ReadonlyArray<{ tool: string; target: string }> = [],
): void {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (typeof url === 'string' && url === '/api/ask/stream') {
      onBody(JSON.parse(String(init?.body ?? '{}')));
      const frames =
        activities.map((a) => `data: ${JSON.stringify({ activity: a })}\n\n`).join('') +
        `data: ${JSON.stringify({ done: true, ok: true, answer: 'the answer', sources: ['src/a.ts'] })}\n\n`;
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

describe('the Ask panel Deep toggle', () => {
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

  it('sends deep: false by default, without touching the checkbox', async () => {
    let received: unknown;
    mockAskStream((body) => {
      received = body;
    });

    new Function(clientJs())();
    await askViaUi('what is happening right now?');

    expect(received).toMatchObject({ project: 'p1', deep: false });
  });

  it('sends deep: true once the Deep checkbox is checked', async () => {
    let received: unknown;
    mockAskStream((body) => {
      received = body;
    });

    new Function(clientJs())();
    const deepEl = document.getElementById('ask-deep') as HTMLInputElement;
    deepEl.checked = true;
    await askViaUi('where does auth happen?');

    expect(received).toMatchObject({ project: 'p1', deep: true });
  });
});

describe('the Ask panel live activity chips', () => {
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

  it('renders no chips when the escalation session emits no activity', async () => {
    mockAskStream(() => {});

    new Function(clientJs())();
    await askViaUi('what is happening right now?');

    expect(document.querySelectorAll('.ask-activity-chip')).toHaveLength(0);
  });

  it('appends one chip per Read/Grep/Glob activity frame, in order, without touching the answer', async () => {
    mockAskStream(() => {}, [
      { tool: 'Read', target: 'src/cart.ts' },
      { tool: 'Grep', target: 'checkout' },
    ]);

    new Function(clientJs())();
    const deepEl = document.getElementById('ask-deep') as HTMLInputElement;
    deepEl.checked = true;
    await askViaUi('where does checkout total get computed?');

    const chips = Array.from(document.querySelectorAll('.ask-activity-chip')).map(
      (c) => c.textContent,
    );
    expect(chips).toEqual(['Read: src/cart.ts', 'Grep: checkout']);

    const answerEl = document.getElementById('ask-answer');
    expect(answerEl?.textContent).toContain('the answer');
  });

  it('clears the previous chip trail when a new Ask request starts', async () => {
    mockAskStream(() => {}, [{ tool: 'Read', target: 'src/cart.ts' }]);
    new Function(clientJs())();
    const deepEl = document.getElementById('ask-deep') as HTMLInputElement;
    deepEl.checked = true;
    await askViaUi('first question');
    expect(document.querySelectorAll('.ask-activity-chip')).toHaveLength(1);

    mockAskStream(() => {}, [
      { tool: 'Glob', target: '**/*.ts' },
      { tool: 'Read', target: 'src/index.ts' },
    ]);
    await askViaUi('second question');

    const chips = Array.from(document.querySelectorAll('.ask-activity-chip')).map(
      (c) => c.textContent,
    );
    expect(chips).toEqual(['Glob: **/*.ts', 'Read: src/index.ts']);
  });
});
