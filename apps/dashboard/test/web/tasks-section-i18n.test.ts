// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The task board's operator-facing text inside `shell.ts`'s `tasksSection()`
 * (board web-msnsndki-dz3vn1): the FOCUS-MODE lock note, the empty-board
 * note, and the three per-task decision buttons — ✓ approve / ✗ reject on a
 * self-proposed task, ✓ done on an open one. All five were raw English
 * `el()` text nodes (`pnpm i18n:untagged` listed each); the heading above
 * them (`tasks` / `tasksFocusMode`) was already tagged, so the card already
 * rides both the fleet page's and the project page's `translateDom()` sweep.
 *
 * The buttons keep their `taskActionTip()` data-tip/aria-label pairing — the
 * `[data-i18n]` sweep only swaps text content — so the accessible name stays
 * the full per-task sentence in both locales.
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
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [{ dir: 'src', files: 3 }],
  hotFiles: ['src/a.ts'],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 6,
  shipped: 1,
  cost: 9,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 0.16,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
  anomalies: [],
  soulReviewed: true,
  soulProposed: null,
};

function stateWith(projectOverrides: Record<string, unknown>) {
  return {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 1,
      needsYou: 0,
      firings: 6,
      shipped: 1,
      openFindings: 0,
      cost: 9,
    },
    projects: [{ ...PROJECT, ...projectOverrides }],
    empty: false,
  };
}

async function boot(state: unknown): Promise<void> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

const OPEN_TASK = { id: 't1', title: 'ship it', status: 'open' };
const FOCUSED_TASK = { ...OPEN_TASK, focus: true };
const PROPOSED_TASK = { id: 't2', title: 'self-proposed', status: 'needs_approval' };

function textNode(selector: string, startsWith: string): Element | undefined {
  return [...document.querySelectorAll(selector)].find((n) =>
    (n.textContent || '').startsWith(startsWith),
  );
}

describe('task board i18n — notes and decision buttons (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tags the empty-board note with tasksEmpty', async () => {
    await boot(stateWith({ tasks: [] }));

    const note = textNode('p.muted', 'No tasks yet');
    expect(note?.getAttribute('data-i18n')).toBe('tasksEmpty');
    expect(note?.textContent).toBe(STRINGS.en.tasksEmpty);
  });

  it('tags the FOCUS-MODE lock note with tasksFocusNote', async () => {
    await boot(stateWith({ tasks: [FOCUSED_TASK] }));

    const note = document.querySelector('p.focus-note');
    expect(note?.getAttribute('data-i18n')).toBe('tasksFocusNote');
    expect(note?.textContent).toBe(STRINGS.en.tasksFocusNote);
  });

  it('tags ✓ approve / ✗ reject on a self-proposed task with taskApprove / taskReject', async () => {
    await boot(stateWith({ tasks: [PROPOSED_TASK] }));

    const approve = document.querySelector('button[data-task-approve="t2"]');
    expect(approve?.textContent).toBe('✓ approve');
    expect(approve?.getAttribute('data-i18n')).toBe('taskApprove');
    const reject = document.querySelector('button[data-task-delete="t2"]');
    expect(reject?.textContent).toBe('✗ reject');
    expect(reject?.getAttribute('data-i18n')).toBe('taskReject');
  });

  it('tags ✓ done on an open task with taskDone', async () => {
    await boot(stateWith({ tasks: [OPEN_TASK] }));

    const done = document.querySelector('button[data-task-done="t1"]');
    expect(done?.textContent).toBe('✓ done');
    expect(done?.getAttribute('data-i18n')).toBe('taskDone');
  });

  it('switching to Hebrew translates both notes', async () => {
    await boot(stateWith({ tasks: [] }));
    switchToHebrew();
    expect(textNode('p.muted', STRINGS.he.tasksEmpty)?.textContent).toBe(STRINGS.he.tasksEmpty);

    await boot(stateWith({ tasks: [FOCUSED_TASK] }));
    switchToHebrew();
    expect(document.querySelector('p.focus-note')?.textContent).toBe(STRINGS.he.tasksFocusNote);
  });

  it('switching to Hebrew translates the three buttons and keeps their tip/aria pairing', async () => {
    await boot(stateWith({ tasks: [OPEN_TASK, PROPOSED_TASK] }));
    switchToHebrew();

    const approve = document.querySelector('button[data-task-approve="t2"]');
    const reject = document.querySelector('button[data-task-delete="t2"]');
    const done = document.querySelector('button[data-task-done="t1"]');
    expect(approve?.textContent).toBe(STRINGS.he.taskApprove);
    expect(reject?.textContent).toBe(STRINGS.he.taskReject);
    expect(done?.textContent).toBe(STRINGS.he.taskDone);
    for (const btn of [approve, reject, done]) {
      const tip = btn?.getAttribute('data-tip');
      expect(tip).toBeTruthy();
      expect(btn?.getAttribute('aria-label')).toBe(tip);
    }
  });

  it('keeps the three Hebrew button labels distinct and marked like their English twins', () => {
    const he = [STRINGS.he.taskApprove, STRINGS.he.taskReject, STRINGS.he.taskDone];
    expect(new Set(he).size).toBe(3);
    expect(STRINGS.he.taskApprove.startsWith('✓ ')).toBe(true);
    expect(STRINGS.he.taskReject.startsWith('✗ ')).toBe(true);
    expect(STRINGS.he.taskDone.startsWith('✓ ')).toBe(true);
  });
});
