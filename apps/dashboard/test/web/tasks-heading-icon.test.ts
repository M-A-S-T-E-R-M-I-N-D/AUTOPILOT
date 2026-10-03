// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the task board's heading.
 * In focus mode "Tasks — FOCUS MODE" led with the `target` icon that
 * replaced its 🎯, but the everyday "Tasks" heading, the first line of the
 * project page's Board tab, headed with bare words beside the iconed Landing,
 * Flight console and Recently shipped panels.
 *
 * It leads with the `square-kanban` the Board tab draws now, the board's own
 * place, the way the Keeper queue leads with the rail's `inbox`; focus mode
 * still swaps in `target`, so the icon keeps telling the two modes apart.
 * Each icon is decorative, so the heading's text stays the words alone, and
 * `setSweptText()` keeps it across a locale switch and every later tick.
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

const OPEN_TASK = { id: 't1', title: 'ship it', status: 'open' };
const FOCUSED_TASK = { ...OPEN_TASK, focus: true };

function stateWith(tasks: unknown[]) {
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
    projects: [{ ...PROJECT, tasks }],
    empty: false,
  };
}

async function boot(tasks: unknown[]): Promise<void> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  localStorage.setItem('ap-tour-seen', '1');
  const state = stateWith(tasks);
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

function tasksHeading(): HTMLElement {
  const heading = document.querySelector(
    '.detail-h[data-i18n="tasks"], .detail-h[data-i18n="tasksFocusMode"]',
  ) as HTMLElement;
  expect(heading).not.toBeNull();
  return heading;
}

function expectIconHeading(name: string, key: string): HTMLElement {
  const heading = tasksHeading();
  expect(heading.getAttribute('data-i18n')).toBe(key);
  const icon = heading.firstElementChild;
  expect(icon?.getAttribute('class')).toBe('icon icon-' + name);
  expect(icon?.getAttribute('aria-hidden')).toBe('true');
  expect(icon?.querySelectorAll('path, circle, rect').length).toBeGreaterThan(0);
  expect(heading.querySelectorAll('svg')).toHaveLength(1);
  return heading;
}

describe('the task board heading (epic 0025 slice 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('"Tasks" leads with the square-kanban the Board tab draws', async () => {
    await boot([OPEN_TASK]);

    expect(
      document
        .querySelector('a.project-tab[data-subject-link="board"] > svg')
        ?.getAttribute('class'),
    ).toBe('icon icon-square-kanban');
    const heading = expectIconHeading('square-kanban', 'tasks');
    expect(heading.textContent).toBe(STRINGS.en.tasks);
  });

  it('leads with the icon on an empty board too', async () => {
    await boot([]);

    expect(expectIconHeading('square-kanban', 'tasks').textContent).toBe(STRINGS.en.tasks);
  });

  it('focus mode swaps in the target, so the icon still tells the two apart', async () => {
    await boot([FOCUSED_TASK]);

    const heading = expectIconHeading('target', 'tasksFocusMode');
    expect(heading.textContent).toBe(STRINGS.en.tasksFocusMode);
    expect(heading.querySelector('svg.icon-square-kanban')).toBeNull();
  });

  it('keeps the icon beside Hebrew words, tick after tick', async () => {
    await boot([OPEN_TASK]);
    switchToHebrew();

    expect(expectIconHeading('square-kanban', 'tasks').textContent).toBe(STRINGS.he.tasks);
    await vi.advanceTimersByTimeAsync(5000);
    expect(expectIconHeading('square-kanban', 'tasks').textContent).toBe(STRINGS.he.tasks);
  });
});
