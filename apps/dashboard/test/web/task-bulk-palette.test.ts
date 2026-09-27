// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0026 slice 4 (board web-mtywp82m-zodn7z), its wiring: the command
 * palette acts on the tasks board's selection. With rows checked, the palette
 * leads with each action some checked row can take and how many it reaches
 * (`web/task-bulk.ts` decides), and running one sends, one row at a time, the
 * request that row's own button posts. Only delete asks first, once for the
 * whole set; a request the server refuses is counted and said as an error.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

function task(id: string, status: string) {
  return {
    id,
    title: 'Task ' + id,
    status,
    source: 'dashboard',
    severity: null,
    dimension: null,
    focus: false,
    priority: null,
    at: 1,
  };
}

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
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
        task('q1', 'queued'),
        task('p1', 'needs_approval'),
        task('p2', 'needs_approval'),
        task('f1', 'in_progress'),
        task('d1', 'done'),
      ],
    },
  ],
  empty: false,
};

/** The English a template key renders with its placeholders filled. */
function en(key: keyof typeof STRINGS.en, subs: Record<string, number>): string {
  let text: string = STRINGS.en[key];
  for (const [name, value] of Object.entries(subs)) text = text.replace(`{${name}}`, String(value));
  return text;
}

/** Answers every GET with the board, and each task write with `writeOk`. */
async function boot(writeOk = true): Promise<void> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (url: unknown) => {
    const write = url === '/api/task/status' || url === '/api/task/delete';
    return { ok: write ? writeOk : true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function select(...ids: string[]): void {
  for (const id of ids) {
    const box = document.querySelector<HTMLInputElement>(`input[data-task-select="${id}"]`);
    if (!box) throw new Error(`no selection box for ${id}`);
    box.click();
  }
}

/** Opens the palette from its masthead button (this boot's own listener). */
function openPalette(): string[] {
  document.getElementById('palette-btn')!.click();
  return [...document.querySelectorAll('#palette-list [role="option"]')].map(
    (li) => li.textContent ?? '',
  );
}

/** Narrows the open palette to `query` and runs its first option. */
async function run(query: string): Promise<void> {
  const input = document.getElementById('palette-input') as HTMLInputElement;
  input.value = query;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await vi.advanceTimersByTimeAsync(1);
}

/** Every task write the client sent since boot, in the order it sent them. */
function taskWrites(): Array<{ path: string; body: unknown }> {
  return (globalThis.fetch as Mock).mock.calls
    .filter(([url]) => url === '/api/task/status' || url === '/api/task/delete')
    .map(([url, init]) => ({
      path: String(url),
      body: JSON.parse(String((init as RequestInit).body)) as unknown,
    }));
}

function stateFetches(): number {
  return (globalThis.fetch as Mock).mock.calls.filter(([url]) => url === '/api/state').length;
}

function snacks(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('#snackbar-host .snack')];
}

describe('the palette acts on the board selection (epic 0026 slice 4)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('offers no bulk action while nothing is selected', async () => {
    await boot();
    const bulk = [
      'boardBulkApprove',
      'boardBulkReject',
      'boardBulkDone',
      'boardBulkDelete',
    ] as const;
    const labels = openPalette();
    for (const key of bulk) {
      const stem = STRINGS.en[key].split(' (')[0]!;
      expect(labels.some((label) => label.startsWith(stem))).toBe(false);
    }
  });

  it('leads with each action the selection can take and how many rows it reaches', async () => {
    await boot();
    select('q1', 'p1', 'p2', 'd1');
    expect(openPalette().slice(0, 4)).toEqual([
      en('boardBulkApprove', { n: 2 }),
      en('boardBulkReject', { n: 2 }),
      en('boardBulkDone', { n: 1 }),
      en('boardBulkDelete', { n: 1 }),
    ]);
  });

  it('approves each selected proposal with its own request, in board order, then says so and refreshes', async () => {
    await boot();
    select('p2', 'q1', 'p1');
    openPalette();
    const refreshes = stateFetches();
    await run(STRINGS.en.boardBulkApprove.split(' (')[0]!);

    expect(taskWrites()).toEqual([
      { path: '/api/task/status', body: { id: 'p1', status: 'queued' } },
      { path: '/api/task/status', body: { id: 'p2', status: 'queued' } },
    ]);
    expect(snacks().map((s) => s.querySelector('.snack-text')?.textContent)).toEqual([
      en('boardBulkSent', { n: 2 }),
    ]);
    expect(snacks()[0]!.getAttribute('role')).toBeNull();
    expect(stateFetches()).toBeGreaterThan(refreshes);
  });

  it('asks once before deleting the set, and sends nothing when declined', async () => {
    await boot();
    select('q1', 'f1', 'p1');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    openPalette();
    await run(STRINGS.en.boardBulkDelete.split(' (')[0]!);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(en('boardBulkDeleteConfirm', { n: 2 }));
    expect(taskWrites()).toEqual([]);

    confirm.mockReturnValue(true);
    openPalette();
    await run(STRINGS.en.boardBulkDelete.split(' (')[0]!);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(taskWrites()).toEqual([
      { path: '/api/task/delete', body: { id: 'q1' } },
      { path: '/api/task/delete', body: { id: 'f1' } },
    ]);
  });

  it('rejects proposals without asking', async () => {
    await boot();
    select('p1');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    openPalette();
    await run(STRINGS.en.boardBulkReject.split(' (')[0]!);

    expect(confirm).not.toHaveBeenCalled();
    expect(taskWrites()).toEqual([{ path: '/api/task/delete', body: { id: 'p1' } }]);
  });

  it('counts every request the server refuses and says so as an error', async () => {
    await boot(false);
    select('q1', 'f1');
    openPalette();
    await run(STRINGS.en.boardBulkDone.split(' (')[0]!);

    expect(taskWrites()).toHaveLength(2);
    const [snack] = snacks();
    expect(snack?.querySelector('.snack-text')?.textContent).toBe(
      en('boardBulkFailed', { failed: 2, n: 2 }),
    );
    expect(snack?.getAttribute('role')).toBe('alert');
  });
});
