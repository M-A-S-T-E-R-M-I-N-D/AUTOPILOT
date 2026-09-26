// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0026 "the tasks screen" (board web-mtywp82m-zodn7z): the row-anatomy
 * spec's action keys — `a` approves the proposal under the keyboard cursor,
 * `d` marks the open row under it done — and the one-line keyboard legend
 * that makes those keys (and task-row-keyboard-selection.test.ts's j/k)
 * discoverable. Each key presses the row's OWN button, so it rides the same
 * delegated click → fetch → refresh path the mouse does and is a no-op on a
 * row that has no such button.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

function task(id: string, title: string, status: string) {
  return {
    id,
    title,
    status,
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
    task('t1', 'Wire up the retry queue', 'queued'),
    task('t2', 'Rename the webhook payload', 'needs_approval'),
    task('t3', 'Old cleanup task', 'done'),
  ],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

async function boot(): Promise<void> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function titleOf(taskId: string): HTMLElement {
  const title = document.querySelector(`.task[data-task-id="${taskId}"] .task-title`);
  if (!(title instanceof HTMLElement)) throw new Error(`no title for ${taskId}`);
  return title;
}

function press(el: Element, key: string, mods?: Partial<KeyboardEventInit>): boolean {
  return el.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }),
  );
}

/** Every POST body the client sent to /api/task/status since boot. */
function statusPosts(): Array<{ id: string; status: string }> {
  return (globalThis.fetch as Mock).mock.calls
    .filter(([url]) => url === '/api/task/status')
    .map(
      ([, init]) =>
        JSON.parse(String((init as RequestInit).body)) as { id: string; status: string },
    );
}

/**
 * Every boot() in this file stacks another set of clientJs()'s delegated
 * document listeners (document.write() keeps the document object, and so its
 * listeners), so one keystroke in the Nth test posts N times. Assert on the
 * shape of every post, never on their count — project-page.test.ts's board
 * click test tolerates the same stacking with a find().
 */
function expectEveryPost(expected: { id: string; status: string }): void {
  const posts = statusPosts();
  expect(posts.length).toBeGreaterThan(0);
  for (const post of posts) expect(post).toEqual(expected);
}

describe('task row a/d keyboard actions (epic 0026)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('d on an open row marks that row done through its own button', async () => {
    await boot();

    titleOf('t1').focus();
    const notCancelled = press(titleOf('t1'), 'd');

    expect(notCancelled).toBe(false);
    expectEveryPost({ id: 't1', status: 'done' });
    const btn = document.querySelector('button[data-task-done="t1"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('a on a self-proposed row approves it into the queue', async () => {
    await boot();

    titleOf('t2').focus();
    press(titleOf('t2'), 'a');

    expectEveryPost({ id: 't2', status: 'queued' });
  });

  it('a on a queued row and d on a done row are no-ops (no button to press)', async () => {
    await boot();

    titleOf('t1').focus();
    const queuedA = press(titleOf('t1'), 'a');
    titleOf('t3').focus();
    const doneD = press(titleOf('t3'), 'd');

    expect(queuedA).toBe(true);
    expect(doneD).toBe(true);
    expect(statusPosts()).toEqual([]);
  });

  it('a modifier held with d leaves the row alone', async () => {
    await boot();

    titleOf('t1').focus();
    press(titleOf('t1'), 'd', { ctrlKey: true });

    expect(statusPosts()).toEqual([]);
  });

  it('typing d in the add-task field never marks a row done', async () => {
    await boot();

    const input = document.getElementById('task-new-title') as HTMLInputElement;
    input.focus();
    press(input, 'd');

    expect(statusPosts()).toEqual([]);
  });

  it('a second press while the first is pending does not double-post', async () => {
    await boot();

    titleOf('t1').focus();
    press(titleOf('t1'), 'd');
    const afterFirst = statusPosts().length;
    press(titleOf('t1'), 'd');

    expect(afterFirst).toBeGreaterThan(0);
    expect(statusPosts().length).toBe(afterFirst);
  });
});

describe('the board keyboard legend (epic 0026)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('names j/k, x, a, d and Esc above the rows, each label tagged for i18n', async () => {
    await boot();

    const legend = document.querySelector('.board-keys');
    expect(legend).not.toBeNull();
    const keys = [...(legend as Element).querySelectorAll('kbd')].map((k) => k.textContent);
    expect(keys).toEqual(['j', 'k', 'x', 'a', 'd', 'Esc']);
    const labels = [...(legend as Element).querySelectorAll('[data-i18n]')];
    expect(labels.map((l) => l.getAttribute('data-i18n'))).toEqual([
      'boardKeysMove',
      'boardKeysSelect',
      'boardKeysApprove',
      'boardKeysDone',
      'boardKeysLeave',
    ]);
    expect(labels.map((l) => l.textContent)).toEqual([
      STRINGS.en.boardKeysMove,
      STRINGS.en.boardKeysSelect,
      STRINGS.en.boardKeysApprove,
      STRINGS.en.boardKeysDone,
      STRINGS.en.boardKeysLeave,
    ]);
    // The legend sits between the column heads and the list, in reading order.
    const card = (legend as Element).parentElement as Element;
    const order = [...card.children].map((c) => c.className);
    expect(order.indexOf('board-columns')).toBeLessThan(order.indexOf('board-keys muted'));
    expect(order.indexOf('board-keys muted')).toBeLessThan(order.indexOf('tasks'));
  });

  it('switching to Hebrew translates the labels and keeps the <kbd> keys', async () => {
    await boot();
    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const legend = document.querySelector('.board-keys') as Element;
    const labels = [...legend.querySelectorAll('[data-i18n]')].map((l) => l.textContent);
    expect(labels).toEqual([
      STRINGS.he.boardKeysMove,
      STRINGS.he.boardKeysSelect,
      STRINGS.he.boardKeysApprove,
      STRINGS.he.boardKeysDone,
      STRINGS.he.boardKeysLeave,
    ]);
    expect([...legend.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual([
      'j',
      'k',
      'x',
      'a',
      'd',
      'Esc',
    ]);
  });

  it('is absent on an empty board (nothing to steer)', async () => {
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ ...STATE, projects: [{ ...PROJECT, tasks: [] }] }),
        }) as unknown as Response,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.board-keys')).toBeNull();
  });
});
