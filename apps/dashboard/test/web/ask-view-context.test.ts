// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Omniscient chat context (BACKLOG web-msnrw1ok-0gsdff). First slice: the Ask
 * request should tell the model which dashboard page the operator is
 * currently on — the fleet overview or a specific project's page — so the
 * model answers with awareness of where the operator is looking, not just
 * what project they picked in the dropdown. Second slice: when a task is
 * under the operator's WIP-limit-1 focus lock (the "selected element" the
 * board task calls for), its title rides along too. Third (final) slice:
 * "recent operator actions" — what the operator actually DID this session
 * (flight launch/stop/pause) rides along too; see operator-actions.test.ts
 * for the underlying pure log math.
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

function mockAskStream(onBody: (body: unknown) => void, state: unknown = STATE): void {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (typeof url === 'string' && url === '/api/ask/stream') {
      onBody(JSON.parse(String(init?.body ?? '{}')));
      const frame = `data: ${JSON.stringify({ done: true, ok: true, answer: 'ok', sources: [] })}\n\n`;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(frame));
          controller.close();
        },
      });
      return { ok: true, body } as unknown as Response;
    }
    return { ok: true, json: async () => state } as Response;
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

describe("ask requests carry the operator's current dashboard view", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends "fleet page" when asking from the fleet overview (no pinned project)', async () => {
    document.open();
    document.write(renderShell());
    document.close();
    let received: unknown;
    mockAskStream((body) => {
      received = body;
    });

    new Function(clientJs())();
    await askViaUi('what is happening right now?');

    expect(received).toMatchObject({ project: 'p1', view: 'fleet page (all projects)' });
  });

  it('sends "project page: <id>" when asking from that project\'s own page', async () => {
    document.open();
    document.write(renderShell('p1'));
    document.close();
    let received: unknown;
    mockAskStream((body) => {
      received = body;
    });

    new Function(clientJs())();
    await askViaUi('what should I focus on next?');

    expect(received).toMatchObject({ project: 'p1', view: 'project page: p1' });
  });

  it('appends the focused task to the view when one is under the WIP-limit-1 lock', async () => {
    const withFocus = {
      ...STATE,
      projects: [
        {
          ...PROJECT,
          tasks: [{ id: 't1', title: 'Wire up the retry queue', status: 'queued', focus: true }],
        },
      ],
    };
    document.open();
    document.write(renderShell('p1'));
    document.close();
    let received: unknown;
    mockAskStream((body) => {
      received = body;
    }, withFocus);

    new Function(clientJs())();
    await askViaUi('what should I focus on next?');

    expect(received).toMatchObject({
      project: 'p1',
      view: 'project page: p1, focused task: Wire up the retry queue',
    });
  });

  it('does not append a focused task on the fleet page even if one exists', async () => {
    const withFocus = {
      ...STATE,
      projects: [
        {
          ...PROJECT,
          tasks: [{ id: 't1', title: 'Wire up the retry queue', status: 'queued', focus: true }],
        },
      ],
    };
    document.open();
    document.write(renderShell());
    document.close();
    let received: unknown;
    mockAskStream((body) => {
      received = body;
    }, withFocus);

    new Function(clientJs())();
    await askViaUi('what is happening right now?');

    expect(received).toMatchObject({ project: 'p1', view: 'fleet page (all projects)' });
  });

  it('appends a recent operator action (a flight launch) to the view', async () => {
    document.open();
    document.write(renderShell());
    document.close();
    let received: unknown;
    mockAskStream((body) => {
      received = body;
    });

    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1); // first fleet paint / fly bar load()

    const folderEl = document.getElementById('fly-folder') as HTMLInputElement;
    const goEl = document.getElementById('fly-go') as HTMLButtonElement;
    folderEl.value = '/repo/acme';
    goEl.click();

    await askViaUi('why is it still going?');

    expect(received).toMatchObject({
      project: 'p1',
      view: 'fleet page (all projects), recent operator actions: launched /repo/acme',
    });
  });
});
