// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The per-project inside page (`/p/<id>`): the server anchors the shell to one
 * project via `data-project`, and the client renders that project's full view —
 * everything open — plus its task board, from the SAME live fleet state. These
 * tests drive the REAL served bundle in jsdom against a mocked /api/state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
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
  flightLog: [
    {
      id: 'f1',
      item: 'web-abc123',
      kind: 'fix',
      sha: 'a1b2c3d',
      shipped: true,
      gateResult: null,
      cost: 0.1234,
      tokensIn: 100,
      tokensOut: 50,
      turns: 7,
      commitSubject: 'fix: something',
      at: 5,
    },
    {
      id: 'f2',
      item: null,
      kind: 'fix',
      sha: 'e5f6a7b',
      shipped: false,
      gateResult: 'unverifiable',
      failedCheck: 'typecheck',
      cost: 0.05,
      tokensIn: 40,
      tokensOut: 20,
      turns: 3,
      commitSubject: 'fix: something else',
      at: 4,
    },
  ],
  activity: [],
  tasks: [
    {
      id: 't1',
      title: 'Orient — first pass',
      status: 'queued',
      severity: null,
      dimension: null,
      focus: false,
      priority: null,
      at: 1,
    },
    {
      id: 't2',
      title: 'Fix the login',
      status: 'in_progress',
      severity: 'high',
      dimension: 'ux',
      focus: false,
      priority: null,
      at: 2,
    },
  ],
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

function boot(projectId: string): void {
  document.open();
  document.write(renderShell(projectId));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('the flight plan editor (epic 0021 slice 3, second cut)', () => {
  const SPEC = {
    ecosystem: 'js',
    typecheck: { bin: 'pnpm', args: ['run', 'typecheck'], label: 'pnpm run typecheck' },
    test: { bin: 'pnpm', args: ['run', 'test'], label: 'pnpm run test' },
  };
  function bootWithPlan(planStatus = 200): void {
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.startsWith('/api/plan/publish')) {
        return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
      }
      if (u.startsWith('/api/plan')) {
        return {
          ok: planStatus === 200,
          status: planStatus,
          json: async () => ({ ok: true, spec: SPEC }),
        } as unknown as Response;
      }
      return { ok: true, json: async () => STATE } as unknown as Response;
    });
    new Function(clientJs())();
  }
  function step(kind: string): HTMLElement {
    return document.querySelector(`[data-plan-step="${kind}"]`) as HTMLElement;
  }
  function publishButton(): HTMLButtonElement {
    return document.querySelector('[data-plan-publish]') as HTMLButtonElement;
  }
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the gate as a chain of steps, edits into a local draft, and publishes on demand', async () => {
    bootWithPlan();
    await vi.advanceTimersByTimeAsync(1);
    const kinds = Array.from(document.querySelectorAll('[data-plan-step]')).map((b) =>
      b.getAttribute('data-plan-step'),
    );
    expect(kinds).toEqual(['typecheck', 'lint', 'format', 'test', 'build']);
    expect(step('lint').classList.contains('plan-step-off')).toBe(true);
    expect(step('test').classList.contains('plan-step-off')).toBe(false);
    expect(publishButton().disabled).toBe(true);

    // Select test and change its command: a draft appears and autosaves locally.
    step('test').click();
    const cmd = document.querySelector('[data-plan-command="test"]') as HTMLInputElement;
    expect(cmd.value).toBe('pnpm run test');
    cmd.value = 'pnpm run test -- --coverage';
    cmd.dispatchEvent(new Event('change', { bubbles: true }));
    const draft = JSON.parse(window.localStorage.getItem('ap-plan-draft:p1') ?? 'null');
    expect(draft.test.args).toEqual(['run', 'test', '--', '--coverage']);
    expect(draft.typecheck).toEqual(SPEC.typecheck);
    expect(publishButton().disabled).toBe(false);
    expect(document.querySelector('.plan-status')?.textContent).toBe(STRINGS.en['planEditorDraft']);

    // Publish posts the draft; it becomes the published plan and the local copy clears.
    publishButton().click();
    await vi.advanceTimersByTimeAsync(1);
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const publish = calls.find((c) => String(c[0]) === '/api/plan/publish');
    expect(publish).toBeDefined();
    const sent = JSON.parse((publish?.[1] as RequestInit).body as string);
    expect(sent.project).toBe('p1');
    expect(sent.spec.ecosystem).toBe('js');
    expect(sent.spec.test.args).toEqual(['run', 'test', '--', '--coverage']);
    expect(window.localStorage.getItem('ap-plan-draft:p1')).toBeNull();
    expect(publishButton().disabled).toBe(true);
    expect(document.querySelector('.plan-status')?.textContent).toBe(
      STRINGS.en['planEditorPublishedNow'],
    );
  });

  it('a saved draft survives a reload; Discard returns to the published plan', async () => {
    window.localStorage.setItem(
      'ap-plan-draft:p1',
      JSON.stringify({
        ...SPEC,
        lint: { bin: 'pnpm', args: ['run', 'lint'], label: 'pnpm run lint' },
      }),
    );
    bootWithPlan();
    await vi.advanceTimersByTimeAsync(1);
    expect(step('lint').classList.contains('plan-step-off')).toBe(false);
    expect(publishButton().disabled).toBe(false);
    (document.querySelector('[data-plan-discard]') as HTMLElement).click();
    expect(step('lint').classList.contains('plan-step-off')).toBe(true);
    expect(publishButton().disabled).toBe(true);
    expect(window.localStorage.getItem('ap-plan-draft:p1')).toBeNull();
  });

  it('turning a step off drops it from the draft; turning it on with no command seeds one', async () => {
    bootWithPlan();
    await vi.advanceTimersByTimeAsync(1);
    step('lint').click();
    const on = document.querySelector('[data-plan-enabled="lint"]') as HTMLInputElement;
    on.checked = true;
    on.dispatchEvent(new Event('change', { bubbles: true }));
    expect(JSON.parse(window.localStorage.getItem('ap-plan-draft:p1') ?? 'null').lint.bin).toBe(
      'pnpm',
    );
    step('test').click();
    const off = document.querySelector('[data-plan-enabled="test"]') as HTMLInputElement;
    off.checked = false;
    off.dispatchEvent(new Event('change', { bubbles: true }));
    expect(
      JSON.parse(window.localStorage.getItem('ap-plan-draft:p1') ?? 'null').test,
    ).toBeUndefined();
  });

  it('is read-only where the plan route is not served', async () => {
    bootWithPlan(404);
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('[data-plan-step]')).toBeNull();
    expect(document.querySelector('.plan-editor')?.textContent).toContain(
      STRINGS.en['planEditorUnavailable'],
    );
  });
});

describe('the per-project inside page', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the anchored project with its detail open, tasks, and a back link', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    expect(document.body.dataset['project']).toBe('p1');
    expect(document.querySelector('.card-title')?.textContent).toBe('Alpha');
    // The inside page is a single full-width column (readable boards, not
    // 300px card cells that crush long task titles into 1-char lines).
    expect(document.getElementById('fleet')?.classList.contains('project-mode')).toBe(true);
    // The inside page opens everything.
    const det = document.querySelector('details.detail') as HTMLDetailsElement | null;
    expect(det?.open).toBe(true);
    // The task board is rendered from live data.
    const tasks = Array.from(document.querySelectorAll('.task')).map((t) => t.textContent ?? '');
    expect(tasks).toHaveLength(2);
    expect(tasks[1]).toContain('Fix the login');
    expect(tasks[1]).toContain('high');
    // Back to the fleet.
    expect(document.querySelector('.back a')?.getAttribute('href')).toBe('/');
  });

  it('shows the real per-firing cost and turn count in the flight log', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const row = document.querySelector('.flightlog .flight') as HTMLLIElement | null;
    expect(row).not.toBeNull();
    // Compact chip shows the cost; turns live in the click-to-expand detail
    // (progressive disclosure — the operator's "it's overloaded" feedback).
    expect(row!.querySelector('.flight-cost')?.textContent).toBe('$0.12');
    // The compact row also carries a truncated sha chip — no click needed to
    // find which commit a firing produced (GitHub-familiar flight history).
    expect(row!.querySelector('.flight-sha')?.textContent).toBe('a1b2c3d');
    (row!.querySelector('.flight-head') as HTMLButtonElement).click();
    // The deferred re-render goes through refresh() (fetch → json → render):
    // step the fake clock a few times so the whole promise chain settles.
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);
    const open = document.querySelector('.flightlog .flight-open .flight-detail');
    expect(open).not.toBeNull();
    expect(open!.textContent).toContain('7 turns');
    // Drain every pending timer/microtask INSIDE this document — the click
    // re-render schedules async paints (docs fetch etc.) that must not leak
    // past teardown into the next test's freshly-written document.
    await vi.advanceTimersByTimeAsync(5000);
  });

  it('explains an unverified row: which check crashed, and that the commit was left in place', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const rows = Array.from(document.querySelectorAll('.flightlog .flight'));
    const unverifiedRow = rows[1] as HTMLLIElement;
    expect(unverifiedRow.querySelector('.flight-dot')?.className).toContain('flight-unverified');
    (unverifiedRow.querySelector('.flight-head') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);
    const open = document.querySelectorAll('.flightlog .flight-open .flight-detail')[0];
    expect(open).not.toBeUndefined();
    expect(open!.textContent).toContain('typecheck crashed before it could judge the work');
    expect(open!.textContent).toContain('commit left in place');
    await vi.advanceTimersByTimeAsync(5000);
  });

  it('shows an honest not-found state for an unknown project id', async () => {
    boot('ghost');
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.empty h2')?.textContent).toBe('Project not found');
  });

  it('marks a task done from the board (delegated button → POST /api/task/status)', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const done = document.querySelector('[data-task-done="t2"]') as HTMLButtonElement | null;
    expect(done).not.toBeNull();
    done!.click();
    await vi.advanceTimersByTimeAsync(1);

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const statusCall = calls.find((c) => String(c[0]).includes('/api/task/status'));
    expect(statusCall).toBeDefined();
    expect(JSON.parse((statusCall?.[1] as RequestInit).body as string)).toEqual({
      id: 't2',
      status: 'done',
    });
  });

  it('adds a task from the board form (POST /api/task/create with the project id)', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const form = document.querySelector('[data-task-add="p1"]') as HTMLFormElement | null;
    expect(form).not.toBeNull();
    const input = form!.querySelector('input[name="title"]') as HTMLInputElement;
    input.value = 'Review the auth flow';
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(1);

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const createCall = calls.find((c) => String(c[0]).includes('/api/task/create'));
    expect(createCall).toBeDefined();
    expect(JSON.parse((createCall?.[1] as RequestInit).body as string)).toEqual({
      project: 'p1',
      title: 'Review the auth flow',
    });
  });

  it('locks focus from the board (🎯 → POST /api/task/focus)', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const btn = document.querySelector('[data-task-focus="t1"]') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('aria-pressed')).toBe('false');
    btn!.click();
    await vi.advanceTimersByTimeAsync(1);

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const focusCall = calls.find((c) => String(c[0]).includes('/api/task/focus'));
    expect(focusCall).toBeDefined();
    expect(JSON.parse((focusCall?.[1] as RequestInit).body as string)).toEqual({
      id: 't1',
      focus: true,
    });
  });

  it('reorders from the board (↓ → POST /api/task/reorder with the full new order)', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const down = document.querySelector(
      '[data-task-id="t1"] [data-task-move="down"]',
    ) as HTMLButtonElement | null;
    expect(down).not.toBeNull();
    down!.click();
    await vi.advanceTimersByTimeAsync(1);

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const reorderCall = calls.find((c) => String(c[0]).includes('/api/task/reorder'));
    expect(reorderCall).toBeDefined();
    expect(JSON.parse((reorderCall?.[1] as RequestInit).body as string)).toEqual({
      project: 'p1',
      ids: ['t2', 't1'],
    });
    // The move was announced for assistive tech.
    expect(document.getElementById('task-reorder-live')?.textContent).toContain('position 2 of 2');
  });

  it('reorders from the board via pointer drag (dragstart→dragover→drop→dragend → POST /api/task/reorder)', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const li = document.querySelector('[data-task-id="t1"]') as HTMLLIElement | null;
    const list = document.querySelector('ul.tasks') as HTMLUListElement | null;
    expect(li).not.toBeNull();
    expect(list).not.toBeNull();
    // Only workable (queued/in_progress) rows get the drag affordance.
    expect(li!.getAttribute('draggable')).toBe('true');

    li!.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }));
    expect(li!.classList.contains('task-dragging')).toBe(true);
    list!.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    list!.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    li!.dispatchEvent(new Event('dragend', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(1);

    // Dragging class is cleared once the drag ends.
    expect(li!.classList.contains('task-dragging')).toBe(false);
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const reorderCall = calls.find((c) => String(c[0]).includes('/api/task/reorder'));
    expect(reorderCall).toBeDefined();
    expect(JSON.parse((reorderCall?.[1] as RequestInit).body as string)).toEqual({
      project: 'p1',
      ids: ['t2', 't1'],
    });
    expect(document.getElementById('task-reorder-live')?.textContent).toBe('Reordered by drag.');
  });

  it('caps done-task history to a chunk of 15, revealing more on click (open queue stays full)', async () => {
    const doneTasks = Array.from({ length: 20 }, (_, i) => ({
      id: `d${i}`,
      title: `Old task ${i}`,
      status: 'done',
      severity: null,
      dimension: null,
      focus: false,
      priority: null,
      at: 100 + i,
    }));
    const project2 = {
      ...PROJECT,
      id: 'p2',
      slug: 'beta',
      tasks: [...PROJECT.tasks, ...doneTasks],
    };
    const state2 = { ...STATE, projects: [project2] };
    document.open();
    document.write(renderShell('p2'));
    document.close();
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => state2 }) as unknown as Response,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    // Open queue (2) always fully visible; done history capped at 15 of 20.
    expect(document.querySelectorAll('.task').length).toBe(17);
    expect(document.querySelectorAll('.task .task-done').length).toBe(15);
    const more = document.querySelector('[data-task-history-more="p2"]');
    expect(more?.textContent).toBe('Load more done (showing 15 of 20)');

    (more as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    expect(document.querySelectorAll('.task').length).toBe(22);
    expect(document.querySelector('[data-task-history-more="p2"]')).toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
  });

  it('fleet cards link INTO the inside page', async () => {
    document.open();
    document.write(renderShell()); // fleet mode
    document.close();
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.card-title a')?.getAttribute('href')).toBe('/p/p1');
  });
});
