// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING (epic 0015, board web-mtd1wyte-ssntzi): the Ask panel's
 * live tool-activity chip trail (`#ask-activity .ask-activity-chip`, one chip
 * per Read/Grep/Glob call an escalated Deep session streams back) gave EVERY
 * chip its own unconditional `tabindex="0"` — a Deep answer that reads
 * thirty files put thirty Tab stops between the Ask button and the answer.
 * The trail is now ONE roving group: only its first chip is a real Tab stop,
 * each later chip lands at -1 as it streams in, and the shared wireRoving()
 * Left/Right/Home/End + focusin handlers move the stop. Same jsdom +
 * `new Function(clientJs())()` + mocked `/api/ask/stream` harness as
 * ask-deep-toggle.test.ts.
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
function mockAskStream(activities: ReadonlyArray<{ tool: string; target: string }>): void {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
    if (typeof url === 'string' && url === '/api/ask/stream') {
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

function chips(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.ask-activity-chip'));
}

function tabindexes(nodes: HTMLElement[]): (string | null)[] {
  return nodes.map((n) => n.getAttribute('tabindex'));
}

const THREE_CALLS = [
  { tool: 'Glob', target: '**/*.ts' },
  { tool: 'Read', target: 'src/cart.ts' },
  { tool: 'Grep', target: 'checkout' },
];

describe('the Ask panel activity chip trail uses a roving Tab stop', () => {
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

  it('seeds only the first streamed chip as a Tab stop; later chips land at -1', async () => {
    mockAskStream(THREE_CALLS);
    new Function(clientJs())();
    (document.getElementById('ask-deep') as HTMLInputElement).checked = true;
    await askViaUi('where does checkout total get computed?');

    const trail = chips();
    expect(trail.length).toBe(3);
    expect(tabindexes(trail)).toEqual(['0', '-1', '-1']);
  });

  it('moves the roving stop with ArrowRight/End/Home and follows programmatic focus', async () => {
    mockAskStream(THREE_CALLS);
    new Function(clientJs())();
    (document.getElementById('ask-deep') as HTMLInputElement).checked = true;
    await askViaUi('where does checkout total get computed?');

    const [c0, c1, c2] = chips();
    if (!c0 || !c1 || !c2) throw new Error('expected three activity chips');

    c0.focus();
    c0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(c1);
    expect(tabindexes([c0, c1, c2])).toEqual(['-1', '0', '-1']);

    c1.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(c2);
    // ArrowRight on the last chip stays put — no wrap, no escape.
    c2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(c2);
    expect(tabindexes([c0, c1, c2])).toEqual(['-1', '-1', '0']);

    c2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(c0);
    expect(tabindexes([c0, c1, c2])).toEqual(['0', '-1', '-1']);

    // Mouse/programmatic focus moves the stop too (APG recommendation).
    c1.focus();
    expect(tabindexes([c0, c1, c2])).toEqual(['-1', '0', '-1']);
  });

  it('re-seeds the stop on the first chip of a fresh trail after the previous one is cleared', async () => {
    mockAskStream([{ tool: 'Read', target: 'src/cart.ts' }]);
    new Function(clientJs())();
    (document.getElementById('ask-deep') as HTMLInputElement).checked = true;
    await askViaUi('first question');
    expect(tabindexes(chips())).toEqual(['0']);

    mockAskStream([
      { tool: 'Glob', target: '**/*.ts' },
      { tool: 'Read', target: 'src/index.ts' },
    ]);
    await askViaUi('second question');
    expect(chips().map((c) => c.textContent)).toEqual(['Glob: **/*.ts', 'Read: src/index.ts']);
    expect(tabindexes(chips())).toEqual(['0', '-1']);
  });
});
