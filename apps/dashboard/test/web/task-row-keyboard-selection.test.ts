// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0026 "the tasks screen" slice 1 (board web-mtywp82m-zodn7z): the
 * row-anatomy spec's keyboard half — `j`/`k` move a single-selection cursor
 * row-to-row, `Escape` clears it. This is orthogonal to
 * task-row-roving-tabindex.test.ts's Left/Right/Home/End group, which moves
 * the Tab stop WITHIN one row's own pill/title/chips; `j`/`k` jumps BETWEEN
 * rows instead, always landing on the destination row's title span (the one
 * control every row carries unconditionally, per D1 ATTRIBUTE PAYLOAD).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

function task(id: string, title: string) {
  return {
    id,
    title,
    status: 'queued',
    source: 'dashboard',
    severity: null,
    dimension: null,
    focus: false,
    priority: null,
    at: 1,
  };
}

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
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
  lastActivityAt: null,
  flightLog: [],
  activity: [],
  tasks: [
    task('t1', 'Wire up the retry queue'),
    task('t2', 'Document the webhook payload'),
    task('t3', 'Old cleanup task'),
  ],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
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

function titleOf(taskId: string): HTMLElement {
  const title = document.querySelector(`.task[data-task-id="${taskId}"] .task-title`);
  if (!(title instanceof HTMLElement)) throw new Error(`no title for ${taskId}`);
  return title;
}

function press(el: Element, key: string, mods?: Partial<KeyboardEventInit>): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...mods }));
}

describe('task row j/k keyboard selection (epic 0026 slice 1)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('j moves focus from one row title to the next row title', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    titleOf('t1').focus();
    press(titleOf('t1'), 'j');
    expect(document.activeElement).toBe(titleOf('t2'));
  });

  it('k moves focus back to the previous row title', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    titleOf('t2').focus();
    press(titleOf('t2'), 'k');
    expect(document.activeElement).toBe(titleOf('t1'));
  });

  it('j on the last row and k on the first row are clamped (no wrap, no throw)', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    titleOf('t3').focus();
    press(titleOf('t3'), 'j');
    expect(document.activeElement).toBe(titleOf('t3'));

    titleOf('t1').focus();
    press(titleOf('t1'), 'k');
    expect(document.activeElement).toBe(titleOf('t1'));
  });

  it('Escape blurs the focused row control', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    titleOf('t2').focus();
    expect(document.activeElement).toBe(titleOf('t2'));
    press(titleOf('t2'), 'Escape');
    expect(document.activeElement).not.toBe(titleOf('t2'));
  });

  it('a modifier held with j does not move the cursor', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    titleOf('t1').focus();
    press(titleOf('t1'), 'j', { ctrlKey: true });
    expect(document.activeElement).toBe(titleOf('t1'));
  });

  it('j/k outside any task row is a no-op', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const heading = document.querySelector('h1, h2') as HTMLElement | null;
    expect(heading).not.toBeNull();
    expect(() => press(heading as HTMLElement, 'j')).not.toThrow();
  });
});
