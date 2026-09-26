// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0026 "the tasks screen" slice 1 (board web-mtywp82m-zodn7z): row
 * selection — the Linear/M3 half of "keyboard selection" that
 * task-row-keyboard-selection.test.ts's j/k cursor left open. Every row leads
 * with a real checkbox; `x` presses the one under the cursor, the pointer
 * clicks it, and either path converges on one truth: the .task-selected
 * rows, the list's data-selecting flag, the "N selected" status line. The
 * set lives outside the DOM (shell.ts's boardSelected) because a changed
 * tick rebuilds the whole list. Escape is two-stage: clear the set, then
 * leave. Bulk actions over the set are the epic's slice 4.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

function makeState() {
  return {
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
    projects: [
      {
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
      },
    ],
    empty: false,
  };
}

async function boot(state = makeState()): Promise<ReturnType<typeof makeState>> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
  return state;
}

function titleOf(taskId: string): HTMLElement {
  const title = document.querySelector(`.task[data-task-id="${taskId}"] .task-title`);
  if (!(title instanceof HTMLElement)) throw new Error(`no title for ${taskId}`);
  return title;
}

function boxOf(taskId: string): HTMLInputElement {
  const box = document.querySelector(`input[data-task-select="${taskId}"]`);
  if (!(box instanceof HTMLInputElement)) throw new Error(`no selection box for ${taskId}`);
  return box;
}

function rowOf(taskId: string): HTMLElement {
  return boxOf(taskId).closest('.task') as HTMLElement;
}

function list(): HTMLElement {
  return document.querySelector('.tasks') as HTMLElement;
}

function line(): HTMLElement {
  return document.querySelector('.board-selection') as HTMLElement;
}

function press(el: Element, key: string, mods?: Partial<KeyboardEventInit>): boolean {
  return el.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }),
  );
}

describe('task row selection (epic 0026 slice 1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('every row leads with a checkbox named for its task, tagged for the aria sweep', async () => {
    await boot();

    const rows: Array<[string, string]> = [
      ['t1', 'Wire up the retry queue'],
      ['t2', 'Rename the webhook payload'],
      ['t3', 'Old cleanup task'],
    ];
    for (const [id, title] of rows) {
      const box = boxOf(id);
      expect(box.type).toBe('checkbox');
      expect(box.checked).toBe(false);
      expect(rowOf(id).firstElementChild).toBe(box);
      expect(box.getAttribute('aria-label')).toBe(
        STRINGS.en.taskSelectAria.replace('{name}', title),
      );
      expect(box.getAttribute('data-i18n-aria-template')).toBe('taskSelectAria');
      expect(box.getAttribute('data-i18n-name')).toBe(title);
    }
    expect(line().getAttribute('role')).toBe('status');
    expect(line().textContent).toBe('');
    expect(list().hasAttribute('data-selecting')).toBe(false);
  });

  it('x on the focused row checks its box, marks the row and counts it in the status line', async () => {
    await boot();

    titleOf('t1').focus();
    const notCancelled = press(titleOf('t1'), 'x');

    expect(notCancelled).toBe(false);
    expect(boxOf('t1').checked).toBe(true);
    expect(rowOf('t1').classList.contains('task-selected')).toBe(true);
    expect(rowOf('t2').classList.contains('task-selected')).toBe(false);
    expect(list().getAttribute('data-selecting')).toBe('true');
    expect(line().textContent).toBe(STRINGS.en.boardSelected.replace('{n}', '1'));
    expect(line().getAttribute('data-i18n-template')).toBe('boardSelected');
    expect(line().getAttribute('data-i18n-args')).toBe(JSON.stringify({ n: 1 }));
  });

  it('x again unchecks the row, drops the flag and blanks the line (no template left to resweep)', async () => {
    await boot();

    titleOf('t1').focus();
    press(titleOf('t1'), 'x');
    press(titleOf('t1'), 'x');

    expect(boxOf('t1').checked).toBe(false);
    expect(rowOf('t1').classList.contains('task-selected')).toBe(false);
    expect(list().hasAttribute('data-selecting')).toBe(false);
    expect(line().textContent).toBe('');
    expect(line().hasAttribute('data-i18n-template')).toBe(false);
    expect(line().hasAttribute('data-i18n-args')).toBe(false);
  });

  it('a pointer click on the box selects the same way, and the line counts the whole set', async () => {
    await boot();

    boxOf('t2').click();
    titleOf('t3').focus();
    press(titleOf('t3'), 'x');

    expect(boxOf('t2').checked).toBe(true);
    expect(boxOf('t3').checked).toBe(true);
    expect(rowOf('t2').classList.contains('task-selected')).toBe(true);
    expect(rowOf('t3').classList.contains('task-selected')).toBe(true);
    expect(line().textContent).toBe(STRINGS.en.boardSelected.replace('{n}', '2'));
  });

  it('Escape with a set clears it and keeps the cursor; the next Escape leaves', async () => {
    await boot();

    boxOf('t1').click();
    titleOf('t2').focus();
    press(titleOf('t2'), 'x');
    expect(line().textContent).toBe(STRINGS.en.boardSelected.replace('{n}', '2'));

    press(titleOf('t2'), 'Escape');

    expect(boxOf('t1').checked).toBe(false);
    expect(boxOf('t2').checked).toBe(false);
    expect(list().hasAttribute('data-selecting')).toBe(false);
    expect(line().textContent).toBe('');
    expect(document.activeElement).toBe(titleOf('t2'));

    press(titleOf('t2'), 'Escape');
    expect(document.activeElement).not.toBe(titleOf('t2'));
  });

  it('the set survives the list being rebuilt on the next changed tick', async () => {
    const state = await boot();

    boxOf('t1').click();
    const listBefore = list();

    // An unrelated field moves so the fleet dirty-check rebuilds the page —
    // renderProjectPage builds the task list fresh (it is not a cached panel).
    state.totals.firings = 2;
    await vi.advanceTimersByTimeAsync(3000);

    expect(list()).not.toBe(listBefore);
    expect(boxOf('t1').checked).toBe(true);
    expect(boxOf('t2').checked).toBe(false);
    expect(rowOf('t1').classList.contains('task-selected')).toBe(true);
    expect(list().getAttribute('data-selecting')).toBe('true');
    expect(line().textContent).toBe(STRINGS.en.boardSelected.replace('{n}', '1'));
  });

  it('x with a modifier held, or typed in the add-task field, selects nothing', async () => {
    await boot();

    titleOf('t1').focus();
    press(titleOf('t1'), 'x', { ctrlKey: true });
    const input = document.getElementById('task-new-title') as HTMLInputElement;
    input.focus();
    press(input, 'x');

    expect(boxOf('t1').checked).toBe(false);
    expect(list().hasAttribute('data-selecting')).toBe(false);
    expect(line().textContent).toBe('');
  });

  it('switching to Hebrew resweeps the status line and the box names in place', async () => {
    await boot();
    boxOf('t1').click();

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expect(line().textContent).toBe(STRINGS.he.boardSelected.replace('{n}', '1'));
    expect(boxOf('t1').getAttribute('aria-label')).toBe(
      STRINGS.he.taskSelectAria.replace('{name}', 'Wire up the retry queue'),
    );
  });
});
