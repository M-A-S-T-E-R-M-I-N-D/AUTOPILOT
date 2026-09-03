// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * ARCHITECT chat v2 slice 3, client half (docs/epics/0011-architect-chat-
 * v2.md, board web-msnqmgge-oijj8x): once the terminal `/api/ask/stream`
 * frame carries a `proposal`, the Ask panel must render it as an
 * inspectable action card — a read-safety tool (`tasks_list`) auto-runs,
 * a write/destructive tool requires an explicit operator click before
 * `/api/control/execute` is ever called. See ask-persona-toggle.test.ts for
 * the sibling slice 2 toggle's equivalent coverage.
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

function sseBody(payload: unknown): ReadableStream<Uint8Array> {
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(frame));
      controller.close();
    },
  });
}

function mockFetches(opts: {
  proposal?: unknown;
  onExecute?: (body: unknown) => void;
  executeResult?: unknown;
  askBodies?: unknown[];
}): void {
  const askBodies = opts.askBodies ?? [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (typeof url === 'string' && url === '/api/ask/stream') {
      askBodies.push(JSON.parse(String(init?.body ?? '{}')));
      return {
        ok: true,
        body: sseBody({ done: true, ok: true, answer: 'ok', sources: [], proposal: opts.proposal }),
      } as unknown as Response;
    }
    if (typeof url === 'string' && url === '/api/control/execute') {
      opts.onExecute?.(JSON.parse(String(init?.body ?? '{}')));
      return {
        ok: true,
        json: async () => opts.executeResult ?? { ok: true, result: { items: [] } },
      } as Response;
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

describe('the ARCHITECT chat v2 action card', () => {
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

  it('renders no card when the terminal frame carries no proposal', async () => {
    mockFetches({ proposal: undefined });
    new Function(clientJs())();

    await askViaUi('what is happening right now?');

    expect(document.querySelector('.control-proposal')).toBeNull();
  });

  it('renders an inspectable card naming the tool and its args', async () => {
    mockFetches({
      proposal: {
        tool: 'tasks_set_status',
        args: { taskId: 't1', status: 'queued' },
        safety: 'write',
      },
    });
    new Function(clientJs())();

    await askViaUi('move t1 to queued');

    const card = document.querySelector('.control-proposal');
    expect(card).not.toBeNull();
    expect(card?.querySelector('.control-proposal-summary')?.textContent).toContain(
      'tasks_set_status',
    );
    const argsText = card?.querySelector('.control-proposal-text')?.textContent ?? '';
    expect(JSON.parse(argsText)).toEqual({ taskId: 't1', status: 'queued' });
  });

  it('auto-runs a read-safety proposal (tasks_list) without an operator click', async () => {
    let executed: unknown;
    mockFetches({
      proposal: { tool: 'tasks_list', args: { projectId: 'p1' }, safety: 'read' },
      onExecute: (body) => {
        executed = body;
      },
      executeResult: { ok: true, result: [] },
    });
    new Function(clientJs())();

    await askViaUi('list the open tasks');
    await vi.advanceTimersByTimeAsync(1);

    expect(executed).toEqual({ tool: 'tasks_list', args: { projectId: 'p1' } });
    expect(document.querySelector('.control-proposal-status')?.textContent).toBe('Done.');
    expect(document.querySelector('.control-proposal-confirm')).toBeNull();
  });

  it('never calls execute for a write-safety proposal until the operator clicks Confirm', async () => {
    let executed: unknown = null;
    mockFetches({
      proposal: {
        tool: 'tasks_set_status',
        args: { taskId: 't1', status: 'queued' },
        safety: 'write',
      },
      onExecute: (body) => {
        executed = body;
      },
    });
    new Function(clientJs())();

    await askViaUi('move t1 to queued');

    expect(executed).toBeNull();
    const confirmBtn = document.querySelector('.control-proposal-confirm') as HTMLButtonElement;
    expect(confirmBtn).not.toBeNull();
    expect(confirmBtn.tagName).toBe('BUTTON');
    expect(confirmBtn.getAttribute('type')).toBe('button');
    expect(confirmBtn.getAttribute('aria-label')).toBeTruthy();
    expect(confirmBtn.textContent).toBe('Confirm');

    confirmBtn.click();
    await vi.advanceTimersByTimeAsync(1);

    expect(executed).toEqual({
      tool: 'tasks_set_status',
      args: { taskId: 't1', status: 'queued' },
    });
    expect(document.querySelector('.control-proposal-status')?.textContent).toBe('Done.');
  });

  it('labels a destructive-safety proposal distinctly and still gates it on a click', async () => {
    let executed: unknown = null;
    mockFetches({
      proposal: { tool: 'project_reset', args: { projectId: 'p1' }, safety: 'destructive' },
      onExecute: (body) => {
        executed = body;
      },
    });
    new Function(clientJs())();

    await askViaUi('reset the project');

    const confirmBtn = document.querySelector('.control-proposal-confirm') as HTMLButtonElement;
    expect(confirmBtn.textContent).toBe('Confirm (destructive)');
    expect(executed).toBeNull();

    confirmBtn.click();
    await vi.advanceTimersByTimeAsync(1);

    expect(executed).toEqual({ tool: 'project_reset', args: { projectId: 'p1' } });
  });

  it('shows the server error inline when the execute call fails', async () => {
    mockFetches({
      proposal: { tool: 'tasks_list', args: { projectId: 'p1' }, safety: 'read' },
      executeResult: { ok: false, error: 'a project id is required' },
    });
    new Function(clientJs())();

    await askViaUi('list the open tasks');
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.control-proposal-status')?.textContent).toBe(
      'Failed: a project id is required',
    );
  });

  it('appends an operator-action-log entry once a proposal executes, picked up by the next Ask', async () => {
    const askBodies: unknown[] = [];
    mockFetches({
      proposal: {
        tool: 'tasks_set_status',
        args: { taskId: 't1', status: 'queued' },
        safety: 'write',
      },
      askBodies,
    });
    new Function(clientJs())();

    await askViaUi('move t1 to queued');
    const confirmBtn = document.querySelector('.control-proposal-confirm') as HTMLButtonElement;
    confirmBtn.click();
    await vi.advanceTimersByTimeAsync(1);

    await askViaUi('what did I just do?');

    expect(askBodies).toHaveLength(2);
    expect((askBodies[1] as { view: string }).view).toContain('ARCHITECT ran tasks_set_status');
  });
});
