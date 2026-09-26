// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0026 "the tasks screen" slice 1 (board web-mtywp82m-zodn7z): row
 * selection — the Linear/M3 half of "keyboard selection" that
 * task-row-keyboard-selection.test.ts's j/k cursor left open. Every row leads
 * with a real checkbox; `x` presses the one under the cursor, Ctrl/Cmd-A
 * takes every one in the cursor's list (the second describe below), the
 * pointer clicks it, and every path converges on one truth: the .task-selected
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

// Linear's "Cmd/Ctrl-A takes all" (the epic doc's field notes): with the
// cursor anywhere in the list, the chord checks every row's box at once and
// the status line counts the whole set. It is the one modifier chord the
// board claims, and only with focus inside a row — a text field elsewhere on
// the page keeps the browser's own select-all.
describe('task row select-all (epic 0026 slice 1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('Ctrl+A with the cursor in the list checks every row and counts the whole set', async () => {
    await boot();

    titleOf('t2').focus();
    const notCancelled = press(titleOf('t2'), 'a', { ctrlKey: true });

    expect(notCancelled).toBe(false);
    for (const id of ['t1', 't2', 't3']) {
      expect(boxOf(id).checked).toBe(true);
      expect(rowOf(id).classList.contains('task-selected')).toBe(true);
    }
    expect(list().getAttribute('data-selecting')).toBe('true');
    expect(line().textContent).toBe(STRINGS.en.boardSelected.replace('{n}', '3'));
    expect(line().getAttribute('data-i18n-args')).toBe(JSON.stringify({ n: 3 }));
    // The cursor stays where it was: taking all is not a move.
    expect(document.activeElement).toBe(titleOf('t2'));
  });

  it('Cmd+A takes all the same way on a Mac keyboard', async () => {
    await boot();

    titleOf('t1').focus();
    const notCancelled = press(titleOf('t1'), 'a', { metaKey: true });

    expect(notCancelled).toBe(false);
    expect(['t1', 't2', 't3'].every((id) => boxOf(id).checked)).toBe(true);
    expect(line().textContent).toBe(STRINGS.en.boardSelected.replace('{n}', '3'));
  });

  it('takes all over a partial set without toggling it, and the set survives a rebuild', async () => {
    const state = await boot();

    boxOf('t2').click();
    titleOf('t3').focus();
    press(titleOf('t3'), 'a', { ctrlKey: true });
    expect(line().textContent).toBe(STRINGS.en.boardSelected.replace('{n}', '3'));

    state.totals.firings = 2;
    await vi.advanceTimersByTimeAsync(3000);

    expect(['t1', 't2', 't3'].map((id) => [id, boxOf(id).checked])).toEqual([
      ['t1', true],
      ['t2', true],
      ['t3', true],
    ]);
    expect(line().textContent).toBe(STRINGS.en.boardSelected.replace('{n}', '3'));
  });

  it('Escape after taking all clears the whole set and keeps the cursor', async () => {
    await boot();

    titleOf('t1').focus();
    press(titleOf('t1'), 'a', { ctrlKey: true });
    press(titleOf('t1'), 'Escape');

    expect(['t1', 't2', 't3'].some((id) => boxOf(id).checked)).toBe(false);
    expect(list().hasAttribute('data-selecting')).toBe(false);
    expect(line().textContent).toBe('');
    expect(document.activeElement).toBe(titleOf('t1'));
  });

  it('outside a row, or with Shift or Alt added, the chord is left to the browser', async () => {
    await boot();

    const input = document.getElementById('task-new-title') as HTMLInputElement;
    input.focus();
    const inField = press(input, 'a', { ctrlKey: true });
    titleOf('t1').focus();
    const withShift = press(titleOf('t1'), 'A', { ctrlKey: true, shiftKey: true });
    const withAlt = press(titleOf('t1'), 'a', { ctrlKey: true, altKey: true });

    expect(inField).toBe(true);
    expect(withShift).toBe(true);
    expect(withAlt).toBe(true);
    expect(['t1', 't2', 't3'].some((id) => boxOf(id).checked)).toBe(false);
    expect(line().textContent).toBe('');
  });

  it('the legend names the chord as Ctrl+A beside x, translated like its neighbours', async () => {
    await boot();

    const legend = document.querySelector('.board-keys') as HTMLElement;
    const keys = [...legend.querySelectorAll('kbd')].map((k) => k.textContent);
    expect(keys).toEqual(['j', 'k', 'Enter', 'x', 'Shift', 'j', 'k', 'Ctrl', 'A', 'a', 'd', 'Esc']);
    // Ctrl and A are one chord, joined by +; j and k are alternatives, joined by /.
    expect(legend.textContent).toContain('Ctrl+A ' + STRINGS.en.boardKeysSelectAll);
    expect(legend.textContent).toContain('j/k ' + STRINGS.en.boardKeysMove);
    const label = legend.querySelector('[data-i18n="boardKeysSelectAll"]') as HTMLElement;
    expect(label.textContent).toBe(STRINGS.en.boardKeysSelectAll);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
    expect(label.textContent).toBe(STRINGS.he.boardKeysSelectAll);
    expect(legend.textContent).toContain('Ctrl+A ' + STRINGS.he.boardKeysSelectAll);
  });
});

// Linear's "Shift extends" (the epic doc's field notes), the last of its five
// selection keys: Shift+j/k moves the cursor like j/k and checks both the row
// it leaves and the row it lands on, so holding Shift and walking a run of
// rows selects the run. Extending only ever adds — walking back over the run
// keeps it; x unticks a single row, Escape clears the lot.
describe('task row shift-extend (epic 0026 slice 1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const checked = () => ['t1', 't2', 't3'].filter((id) => boxOf(id).checked);

  it('Shift+J checks the row it leaves and the row it lands on, then moves there', async () => {
    await boot();

    titleOf('t1').focus();
    const notCancelled = press(titleOf('t1'), 'J', { shiftKey: true });

    expect(notCancelled).toBe(false);
    expect(checked()).toEqual(['t1', 't2']);
    expect(rowOf('t1').classList.contains('task-selected')).toBe(true);
    expect(rowOf('t2').classList.contains('task-selected')).toBe(true);
    expect(document.activeElement).toBe(titleOf('t2'));
    expect(list().getAttribute('data-selecting')).toBe('true');
    expect(line().textContent).toBe(STRINGS.en.boardSelected.replace('{n}', '2'));
  });

  it('Shift+K extends upward the same way', async () => {
    await boot();

    titleOf('t3').focus();
    press(titleOf('t3'), 'K', { shiftKey: true });

    expect(checked()).toEqual(['t2', 't3']);
    expect(document.activeElement).toBe(titleOf('t2'));
  });

  it('walking a run selects the run, and walking back keeps it', async () => {
    await boot();

    titleOf('t1').focus();
    press(titleOf('t1'), 'J', { shiftKey: true });
    press(titleOf('t2'), 'J', { shiftKey: true });
    expect(checked()).toEqual(['t1', 't2', 't3']);
    expect(document.activeElement).toBe(titleOf('t3'));

    press(titleOf('t3'), 'K', { shiftKey: true });

    expect(checked()).toEqual(['t1', 't2', 't3']);
    expect(document.activeElement).toBe(titleOf('t2'));
    expect(line().textContent).toBe(STRINGS.en.boardSelected.replace('{n}', '3'));
  });

  it('adds to a set made by x without toggling a row already in it', async () => {
    await boot();

    titleOf('t2').focus();
    press(titleOf('t2'), 'x');
    press(titleOf('t2'), 'J', { shiftKey: true });

    expect(checked()).toEqual(['t2', 't3']);
    expect(line().textContent).toBe(STRINGS.en.boardSelected.replace('{n}', '2'));
  });

  it('at the edge of the list it neither moves nor selects, and leaves the key alone', async () => {
    await boot();

    titleOf('t3').focus();
    const notCancelled = press(titleOf('t3'), 'J', { shiftKey: true });

    expect(notCancelled).toBe(true);
    expect(checked()).toEqual([]);
    expect(document.activeElement).toBe(titleOf('t3'));
    expect(line().textContent).toBe('');
  });

  it('an extended set survives a rebuild, and Escape clears it', async () => {
    const state = await boot();

    titleOf('t1').focus();
    press(titleOf('t1'), 'J', { shiftKey: true });
    state.totals.firings = 2;
    await vi.advanceTimersByTimeAsync(3000);
    expect(checked()).toEqual(['t1', 't2']);

    titleOf('t2').focus();
    press(titleOf('t2'), 'Escape');

    expect(checked()).toEqual([]);
    expect(line().textContent).toBe('');
    expect(document.activeElement).toBe(titleOf('t2'));
  });

  it('with Ctrl, Cmd or Alt added, or typed in the add-task field, it does nothing', async () => {
    await boot();

    titleOf('t1').focus();
    const withCtrl = press(titleOf('t1'), 'J', { shiftKey: true, ctrlKey: true });
    const withMeta = press(titleOf('t1'), 'J', { shiftKey: true, metaKey: true });
    const withAlt = press(titleOf('t1'), 'J', { shiftKey: true, altKey: true });
    const input = document.getElementById('task-new-title') as HTMLInputElement;
    input.focus();
    const inField = press(input, 'J', { shiftKey: true });

    expect([withCtrl, withMeta, withAlt, inField]).toEqual([true, true, true, true]);
    expect(checked()).toEqual([]);
    expect(line().textContent).toBe('');
  });

  it('the legend names it as Shift+j/k beside x, translated like its neighbours', async () => {
    await boot();

    const legend = document.querySelector('.board-keys') as HTMLElement;
    // Shift and j/k are one chord (+); j and k are alternatives (/).
    expect(legend.textContent).toContain('x ' + STRINGS.en.boardKeysSelect + ' · Shift+j/k ');
    expect(legend.textContent).toContain('Shift+j/k ' + STRINGS.en.boardKeysExtend);
    const label = legend.querySelector('[data-i18n="boardKeysExtend"]') as HTMLElement;
    expect(label.textContent).toBe(STRINGS.en.boardKeysExtend);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
    expect(label.textContent).toBe(STRINGS.he.boardKeysExtend);
    expect(legend.textContent).toContain('Shift+j/k ' + STRINGS.he.boardKeysExtend);
  });
});
