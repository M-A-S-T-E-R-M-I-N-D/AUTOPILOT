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
          task('t1', 'Wire up the retry queue', 'queued', LONG_BODY),
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

  describe('its history: the firings that worked the task', () => {
    const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);

    function flight(id: string, item: string, over: Record<string, unknown>) {
      return {
        id,
        item,
        kind: 'feat',
        sha: null,
        shipped: false,
        gateResult: null,
        cost: 0,
        tokensIn: 0,
        tokensOut: 0,
        turns: 10,
        commitSubject: null,
        completion: null,
        failedCheck: null,
        died: null,
        at: NOW - 60_000,
        ...over,
      };
    }

    function withHistory() {
      const state = makeState();
      const project = state.projects[0]!;
      project.tasks[0] = { ...project.tasks[0]!, firingCount: 3, cumulativeCostUsd: 7.5 } as never;
      (project as { flightLog: unknown[] }).flightLog = [
        flight('f3', 't1', {
          shipped: true,
          sha: 'abcdef1234',
          commitSubject: 'feat: persist the attempt count',
          completion: 'slice',
          cost: 2.25,
          at: NOW - 60_000,
        }),
        flight('f2', 'other', {
          shipped: true,
          sha: '9999999999',
          commitSubject: 'feat: other work',
          cost: 40,
        }),
        flight('f1', 't1', {
          died: 'turn-cap',
          commitSubject: 'chore: a sibling commit at HEAD',
          cost: 1.25,
          at: NOW - 3_600_000,
        }),
      ];
      return state;
    }

    const lines = (id: string) => [...detailOf(id).querySelectorAll('.task-history-line')];

    beforeEach(() => {
      vi.setSystemTime(NOW);
    });

    it("heads it with the store's lifetime count and cost, then lists the log's firings newest first", async () => {
      await boot(withHistory());

      titleOf('t1').click();

      const head = detailOf('t1').querySelector('.task-detail-history > p') as HTMLElement;
      expect(head.textContent).toBe(
        STRINGS.en.taskHistoryMany.replace('{n}', '3').replace('{cost}', '$7.50'),
      );
      const list = detailOf('t1').querySelector('ol.task-history') as HTMLElement;
      expect(list.getAttribute('aria-label')).toBe(STRINGS.en.taskHistoryList);
      const [newest, oldest] = lines('t1');
      expect(lines('t1')).toHaveLength(2);
      expect(newest!.querySelector('.flight-verdict')?.textContent).toBe('shipped');
      expect(newest!.querySelector('.task-history-completion')?.textContent).toBe(
        STRINGS.en.taskHistorySlice,
      );
      expect(newest!.querySelector('.task-history-subject')?.textContent).toBe(
        'feat: persist the attempt count',
      );
      expect(newest!.querySelector('code')?.textContent).toBe('abcdef1');
      expect(newest!.textContent).toContain('$2.25');
      expect(oldest!.querySelector('.flight-verdict')?.textContent).toBe('turn-capped');
      // It left no commit, so HEAD's subject — a sibling's — is not its own.
      expect(oldest!.querySelector('.task-history-subject')).toBeNull();
      expect(oldest!.querySelector('code')).toBeNull();
      expect(oldest!.textContent).not.toContain('sibling');
      // The third lifetime firing is older than the loaded log.
      expect(detailOf('t1').textContent).toContain(STRINGS.en.taskHistoryOlder.replace('{n}', '1'));
    });

    it('says so when no firing has worked the task, and draws no list', async () => {
      await boot(withHistory());

      titleOf('t2').click();

      const none = detailOf('t2').querySelector('.task-detail-history p') as HTMLElement;
      expect(none.textContent).toBe(STRINGS.en.taskHistoryNone);
      expect(none.getAttribute('data-i18n')).toBe('taskHistoryNone');
      expect(detailOf('t2').querySelector('ol.task-history')).toBeNull();
    });

    it('translates every line on a locale switch, counts and cost kept', async () => {
      await boot(withHistory());
      titleOf('t1').click();

      (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

      const head = detailOf('t1').querySelector('.task-detail-history > p') as HTMLElement;
      expect(head.textContent).toBe(
        STRINGS.he.taskHistoryMany.replace('{n}', '3').replace('{cost}', '$7.50'),
      );
      expect(detailOf('t1').querySelector('ol.task-history')?.getAttribute('aria-label')).toBe(
        STRINGS.he.taskHistoryList,
      );
      expect(lines('t1')[0]!.querySelector('.task-history-completion')?.textContent).toBe(
        STRINGS.he.taskHistorySlice,
      );
      expect(detailOf('t1').textContent).toContain(STRINGS.he.taskHistoryOlder.replace('{n}', '1'));
    });
  });

  describe('its claim: the flight instance holding the task', () => {
    function withClaims() {
      const state = makeState();
      const project = state.projects[0]!;
      project.tasks[0] = {
        ...project.tasks[0]!,
        status: 'in_progress',
        claimedBy: 'fleet-3',
      } as never;
      // A done task keeps the assignee it finished under; its lease is over.
      project.tasks[2] = { ...project.tasks[2]!, claimedBy: 'fleet-2' } as never;
      project.tasks.push(task('t4', 'Nobody has picked this up', 'queued'));
      return state;
    }

    const claimOf = (id: string) => detailOf(id).querySelector('.task-detail-claim');

    it('names the flight holding an open task, and says so when none holds it', async () => {
      await boot(withClaims());

      titleOf('t1').click();
      titleOf('t4').click();

      const held = claimOf('t1') as HTMLElement;
      expect(held.textContent).toBe(STRINGS.en.taskClaimBy.replace('{who}', 'fleet-3'));
      expect(held.getAttribute('data-i18n-template')).toBe('taskClaimBy');
      const free = claimOf('t4') as HTMLElement;
      expect(free.textContent).toBe(STRINGS.en.taskClaimNone);
      expect(free.getAttribute('data-i18n')).toBe('taskClaimNone');
      // It sits between the provenance line and the history.
      const blocks = [...detailOf('t1').children].map((node) => node.className);
      expect(blocks.indexOf('task-detail-meta task-detail-provenance')).toBe(2);
      expect(blocks.indexOf('task-detail-meta task-detail-claim')).toBe(3);
      expect(blocks.indexOf('task-detail-history')).toBe(4);
    });

    it('draws no claim line where no flight can hold one: awaiting approval, or done', async () => {
      await boot(withClaims());

      titleOf('t2').click();
      titleOf('t3').click();

      expect(claimOf('t2')).toBeNull();
      expect(claimOf('t3')).toBeNull();
      expect(detailOf('t3').textContent).not.toContain('fleet-2');
    });

    it('translates on a locale switch, the instance kept', async () => {
      await boot(withClaims());
      titleOf('t1').click();
      titleOf('t4').click();

      (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

      expect(claimOf('t1')?.textContent).toBe(STRINGS.he.taskClaimBy.replace('{who}', 'fleet-3'));
      expect(claimOf('t4')?.textContent).toBe(STRINGS.he.taskClaimNone);
    });
  });

  describe('its provenance: how the task reached the board', () => {
    function withSources(githubRepo: string | null = 'acme/widgets') {
      const state = makeState();
      const project = state.projects[0]! as ReturnType<typeof makeState>['projects'][0] & {
        githubRepo?: string | null;
      };
      project.githubRepo = githubRepo;
      project.tasks[1] = { ...project.tasks[1]!, source: 'self' };
      project.tasks.push({ ...task('t4', 'Triaged note', 'queued'), source: 'inbox' });
      project.tasks.push({
        ...task('github-42', 'Crash on empty config', 'queued'),
        source: 'github',
      });
      // Older rows, or a hand-made one, may not carry the github-<n> id.
      project.tasks.push({ ...task('t6', 'Imported by hand', 'queued'), source: 'github' });
      return state;
    }

    const provenanceOf = (id: string) =>
      detailOf(id).querySelector('.task-detail-provenance') as HTMLElement | null;

    afterEach(() => {
      history.replaceState(null, '', '/');
    });

    it('says in words where each task came from, right under its id line', async () => {
      await boot(withSources());

      for (const id of ['t1', 't2', 't4']) titleOf(id).click();

      expect(provenanceOf('t1')?.textContent).toBe(STRINGS.en.taskFromDashboard);
      expect(provenanceOf('t2')?.textContent).toBe(STRINGS.en.taskFromSelf);
      expect(provenanceOf('t4')?.textContent).toBe(STRINGS.en.taskFromInbox);
      expect(provenanceOf('t4')?.querySelector('[data-i18n="taskFromInbox"]')).not.toBeNull();
      const blocks = [...detailOf('t2').children].map((node) => node.className);
      expect(blocks.indexOf('task-detail-meta task-detail-provenance')).toBe(2);
    });

    it("names a GitHub task's issue and links it on the project's own repository", async () => {
      await boot(withSources());

      titleOf('github-42').click();

      const line = provenanceOf('github-42') as HTMLElement;
      expect(line.textContent).toContain(STRINGS.en.taskFromGithubIssue.replace('{n}', '42'));
      const link = line.querySelector('a') as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe('https://github.com/acme/widgets/issues/42');
      expect(link.textContent).toBe(STRINGS.en.taskFromGithubOpen.replace('{n}', '42'));
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('names the issue without a link when the project is not on GitHub, and a bare source when the id names none', async () => {
      await boot(withSources(null));

      titleOf('github-42').click();
      titleOf('t6').click();

      expect(provenanceOf('github-42')?.textContent).toBe(
        STRINGS.en.taskFromGithubIssue.replace('{n}', '42'),
      );
      expect(provenanceOf('github-42')?.querySelector('a')).toBeNull();
      expect(provenanceOf('t6')?.textContent).toBe(STRINGS.en.taskFromGithub);
    });

    it("stays in the detail when the Show options hide the row's source chip", async () => {
      history.replaceState(null, '', '/p/p1?hide=source');
      await boot(withSources());

      titleOf('t2').click();

      expect(document.querySelector('.task[data-task-id="t2"] .chip-proposed')).toBeNull();
      expect(provenanceOf('t2')?.textContent).toBe(STRINGS.en.taskFromSelf);
    });

    it('translates on a locale switch, the issue number and the link kept', async () => {
      await boot(withSources());
      titleOf('t4').click();
      titleOf('github-42').click();

      (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

      expect(provenanceOf('t4')?.textContent).toBe(STRINGS.he.taskFromInbox);
      const line = provenanceOf('github-42') as HTMLElement;
      expect(line.textContent).toContain(STRINGS.he.taskFromGithubIssue.replace('{n}', '42'));
      const link = line.querySelector('a') as HTMLAnchorElement;
      expect(link.textContent).toBe(STRINGS.he.taskFromGithubOpen.replace('{n}', '42'));
      expect(link.getAttribute('href')).toBe('https://github.com/acme/widgets/issues/42');
    });
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
});
