// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0026 "the tasks screen" slice 1 (board web-mtywp82m-zodn7z): Enter,
 * the last key of the epic's keyboard set (`j`/`k`, `x`, Enter, `a`, `d`).
 * The row's title is a disclosure button: Enter (anywhere in the row but on
 * one of its own buttons), Space on the title, or a click opens the row's
 * read-only detail beneath it — the task's WHOLE body, which until now lived
 * only in a hover tip cut at 240 characters, plus its id and age. The open
 * rows live outside the DOM (shell.ts's boardOpen) because a changed tick
 * rebuilds the whole list, the same way the selection set does.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const LONG_BODY =
  'The retry queue drops a job when the worker restarts mid-backoff. ' +
  'Persist the attempt count with the job, re-arm the timer from the stored ' +
  'deadline on boot, and cap the total at five attempts before the job lands ' +
  'on the dead-letter list the operator already reads. The tip cut this at ' +
  'two hundred and forty characters; the detail shows every word of it.';

function task(id: string, title: string, status: string, body?: string) {
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
    ...(body ? { body } : {}),
  };
}

function firing(item: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `f-${item}-${String(overrides['at'] ?? 1)}`,
    item,
    kind: 'feat',
    sha: null,
    shipped: false,
    gateResult: null,
    cost: 0,
    tokensIn: 1,
    tokensOut: 1,
    turns: 1,
    durationMs: null,
    commitSubject: null,
    completion: 'slice',
    failedCheck: null,
    died: null,
    at: 1,
    ...overrides,
  };
}

function makeState(flightLog: unknown[] = [], lifetime: Record<string, unknown> = {}) {
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
        flightLog,
        activity: [],
        tasks: [
          { ...task('t1', 'Wire up the retry queue', 'queued', LONG_BODY), ...lifetime },
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

function detailOf(taskId: string): HTMLElement {
  const detail = document.querySelector(`.task[data-task-id="${taskId}"] .task-detail`);
  if (!(detail instanceof HTMLElement)) throw new Error(`no detail for ${taskId}`);
  return detail;
}

function press(el: Element, key: string, mods?: Partial<KeyboardEventInit>): boolean {
  return el.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }),
  );
}

const open = (id: string) => !detailOf(id).hidden;

describe('task row detail (epic 0026 slice 1: Enter)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('every title is a collapsed disclosure button that controls its own hidden detail', async () => {
    await boot();

    for (const id of ['t1', 't2', 't3']) {
      const title = titleOf(id);
      expect(title.getAttribute('role')).toBe('button');
      expect(title.getAttribute('aria-expanded')).toBe('false');
      const detail = detailOf(id);
      expect(title.getAttribute('aria-controls')).toBe(detail.id);
      expect(document.getElementById(detail.id)).toBe(detail);
      expect(detail.hidden).toBe(true);
    }
  });

  it('Enter on the title opens the detail with the whole body, the id and the age', async () => {
    await boot();

    titleOf('t1').focus();
    const notCancelled = press(titleOf('t1'), 'Enter');

    expect(notCancelled).toBe(false);
    expect(open('t1')).toBe(true);
    expect(titleOf('t1').getAttribute('aria-expanded')).toBe('true');
    // Every word — the hover tip stops at 240 characters.
    expect(LONG_BODY.length).toBeGreaterThan(240);
    expect(detailOf('t1').querySelector('.task-detail-body')?.textContent).toBe(LONG_BODY);
    expect(detailOf('t1').querySelector('code')?.textContent).toBe('t1');
    expect(detailOf('t1').textContent).toContain('Added ');
    // Only the row asked for opens; the cursor stays on it.
    expect(open('t2')).toBe(false);
    expect(document.activeElement).toBe(titleOf('t1'));
  });

  it('Enter again closes it', async () => {
    await boot();

    titleOf('t1').focus();
    press(titleOf('t1'), 'Enter');
    press(titleOf('t1'), 'Enter');

    expect(open('t1')).toBe(false);
    expect(titleOf('t1').getAttribute('aria-expanded')).toBe('false');
  });

  it('Space on the title and a pointer click toggle it the same way (the button contract)', async () => {
    await boot();

    titleOf('t2').focus();
    const notCancelled = press(titleOf('t2'), ' ');
    expect(notCancelled).toBe(false);
    expect(open('t2')).toBe(true);

    titleOf('t2').click();
    expect(open('t2')).toBe(false);
    titleOf('t3').click();
    expect(open('t3')).toBe(true);
    expect(titleOf('t3').getAttribute('aria-expanded')).toBe('true');
  });

  it('Enter on the status pill opens its row too, but a row button keeps its own Enter', async () => {
    await boot();

    const pill = document.querySelector('.task[data-task-id="t1"] .pill') as HTMLElement;
    pill.focus();
    press(pill, 'Enter');
    expect(open('t1')).toBe(true);

    const approve = document.querySelector('[data-task-approve="t2"]') as HTMLButtonElement;
    approve.focus();
    const notCancelled = press(approve, 'Enter');
    expect(notCancelled).toBe(true);
    expect(open('t2')).toBe(false);
  });

  it('a task with no body says so in a translated line', async () => {
    await boot();

    titleOf('t2').click();

    const line = detailOf('t2').querySelector('.task-detail-body') as HTMLElement;
    expect(line.textContent).toBe(STRINGS.en.taskDetailEmpty);
    expect(line.getAttribute('data-i18n')).toBe('taskDetailEmpty');

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
    expect(line.textContent).toBe(STRINGS.he.taskDetailEmpty);
  });

  it('an open detail survives the list being rebuilt on the next changed tick', async () => {
    const state = await boot();

    titleOf('t1').click();
    const before = detailOf('t1');
    state.totals.firings = 2;
    await vi.advanceTimersByTimeAsync(3000);

    expect(detailOf('t1')).not.toBe(before);
    expect(open('t1')).toBe(true);
    expect(titleOf('t1').getAttribute('aria-expanded')).toBe('true');
    expect(open('t2')).toBe(false);
  });

  it('with a modifier held, or typed in the add-task field, Enter opens nothing', async () => {
    await boot();

    titleOf('t1').focus();
    const withCtrl = press(titleOf('t1'), 'Enter', { ctrlKey: true });
    const input = document.getElementById('task-new-title') as HTMLInputElement;
    input.focus();
    press(input, 'Enter');

    expect(withCtrl).toBe(true);
    expect(['t1', 't2', 't3'].some(open)).toBe(false);
  });

  it('the legend names Enter as open right after j/k, translated like its neighbours', async () => {
    await boot();

    const legend = document.querySelector('.board-keys') as HTMLElement;
    expect(legend.textContent).toContain(
      'j/k ' + STRINGS.en.boardKeysMove + ' · Enter ' + STRINGS.en.boardKeysOpen + ' · x ',
    );
    const label = legend.querySelector('[data-i18n="boardKeysOpen"]') as HTMLElement;
    expect(label.textContent).toBe(STRINGS.en.boardKeysOpen);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
    expect(label.textContent).toBe(STRINGS.he.boardKeysOpen);
  });

  it('lists the task’s firings newest first under its lifetime tally, and counts the older ones', async () => {
    const log = [
      firing('t1', {
        at: 3,
        sha: 'abcdef0123456',
        shipped: true,
        gateResult: 'passed',
        commitSubject: 'feat: the retry queue persists its attempts',
        cost: 1.25,
        durationMs: 90000,
      }),
      firing('t2', { at: 2, cost: 9 }),
      firing('t1', { at: 1, gateResult: 'reverted', cost: 0.5 }),
    ];
    await boot(makeState(log, { firingCount: 5, cumulativeCostUsd: 4.5 }));

    titleOf('t1').click();

    const detail = detailOf('t1');
    const head = detail.querySelector('[data-i18n-template="taskDetailFirings"]') as HTMLElement;
    expect(head.textContent).toBe(
      STRINGS.en.taskDetailFirings.replace('{n}', '5').replace('{cost}', '$4.50'),
    );
    const rows = [...detail.querySelectorAll('.task-detail-firings li')] as HTMLElement[];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toMatch(
      /^shipped · feat: the retry queue persists its attempts · \$1\.25 · 1m 30s · .+ · abcdef0$/,
    );
    expect(rows[0]!.querySelector('code')?.textContent).toBe('abcdef0');
    const dot = rows[0]!.querySelector('.flight-dot') as HTMLElement;
    expect(dot.classList.contains('flight-shipped')).toBe(true);
    expect(dot.getAttribute('aria-hidden')).toBe('true');
    // No commit, no sha; no wall time recorded, no "0s".
    expect(rows[1]!.textContent).toMatch(/^reverted · \$0\.50 · [^·]+$/);
    expect(rows[1]!.querySelector('code')).toBeNull();
    // The task's own id stays the detail's first code element.
    expect(detail.querySelector('code')?.textContent).toBe('t1');

    const earlier = detail.querySelector(
      '[data-i18n-template="taskDetailFiringsEarlier"]',
    ) as HTMLElement;
    expect(earlier.textContent).toBe(STRINGS.en.taskDetailFiringsEarlier.replace('{n}', '3'));

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
    expect(head.textContent).toBe(
      STRINGS.he.taskDetailFirings.replace('{n}', '5').replace('{cost}', '$4.50'),
    );
    expect(earlier.textContent).toBe(STRINGS.he.taskDetailFiringsEarlier.replace('{n}', '3'));
  });

  it('a task no firing claimed shows no firing history at all', async () => {
    await boot(makeState([firing('t2', { cost: 1 })]));

    titleOf('t1').click();

    expect(detailOf('t1').querySelector('.task-detail-firings')).toBeNull();
    expect(detailOf('t1').querySelector('[data-i18n-template^="taskDetailFirings"]')).toBeNull();
  });
});
