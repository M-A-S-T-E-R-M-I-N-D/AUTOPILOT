// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: the task board's action buttons (reorder
 * ↑/↓, focus 🎯, approve/reject a self-proposed task, done ✓, delete 🗑)
 * already carried a full aria-label but — like the phase-rail buttons before
 * them — never got the matching [data-tip] partner, so sighted mouse/
 * keyboard users saw nothing on hover/focus even though screen readers
 * announced it. They now explain themselves like the rest of the shell.
 *
 * Epic 0025 (board web-mtywp7zq-55f3o9): the reorder buttons painted ↑/↓
 * as their whole faces, the way the plan canvas zoom bar painted +/−. They
 * draw the vendored arrow-up/arrow-down strokes now; the aria-label above
 * stays each button's only name.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';
import { ICON_NAMES } from '../../src/web/icons.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
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
  lastActivityAt: 1,
  activity: [],
  flightLog: [],
  tasks: [
    { id: 't1', title: 'Ship the thing', status: 'queued', source: 'operator' },
    { id: 't2', title: 'Investigate the flaky test', status: 'needs_approval', source: 'self' },
    {
      id: 't3',
      title: 'Locked-in hotfix',
      status: 'in_progress',
      source: 'operator',
      pinned: true,
    },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 1,
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0,
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

describe('task action buttons explain themselves on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives the reorder and focus buttons a data-tip matching their aria-label', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const up = document.querySelector('[data-task-move="up"]');
    const down = document.querySelector('[data-task-move="down"]');
    const focusBtn = document.querySelector('[data-task-focus="t1"]');
    for (const btn of [up, down, focusBtn]) {
      expect(btn).toBeTruthy();
      const tip = btn?.getAttribute('data-tip');
      expect(tip).toBeTruthy();
      expect(tip).toBe(btn?.getAttribute('aria-label'));
    }
    expect(focusBtn?.getAttribute('data-tip')).toBe('Focus the autopilot on "Ship the thing"');
  });

  it('draws the reorder buttons as vendored arrow strokes, not ↑/↓ glyph faces (epic 0025)', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    for (const [dir, icon] of [
      ['up', 'arrow-up'],
      ['down', 'arrow-down'],
    ] as const) {
      const btn = document.querySelector(`[data-task-move="${dir}"]`) as HTMLButtonElement;
      // Law 2: the icon alone is decorative; the aria-label names the button.
      expect(btn.textContent).toBe('');
      expect(btn.children).toHaveLength(1);
      const svg = btn.firstElementChild as Element;
      expect(svg.tagName.toLowerCase()).toBe('svg');
      expect(svg.getAttribute('class')).toBe('icon icon-' + icon);
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.childElementCount).toBeGreaterThan(0);
      expect(btn.getAttribute('aria-label')).toBeTruthy();
      expect(ICON_NAMES).toContain(icon);
    }
  });

  it('sizes the arrow strokes like the focus, delete and unpin icons beside them', () => {
    expect(layoutCss()).toContain(
      '.task-move > .icon, .task-focus-btn > .icon, .task-delete-btn > .icon, .task-unpin-btn > .icon { inline-size: 1.1em; block-size: 1.1em; vertical-align: middle; }',
    );
  });

  it('gives the done and delete buttons a data-tip matching their aria-label', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const doneBtn = document.querySelector('[data-task-done="t1"]');
    const delBtn = document.querySelector('[data-task-delete="t1"]');
    expect(doneBtn?.getAttribute('data-tip')).toBe('Mark "Ship the thing" done');
    expect(doneBtn?.getAttribute('data-tip')).toBe(doneBtn?.getAttribute('aria-label'));
    expect(delBtn?.getAttribute('data-tip')).toBe('Delete task "Ship the thing"');
    expect(delBtn?.getAttribute('data-tip')).toBe(delBtn?.getAttribute('aria-label'));
  });

  it('gives the approve and reject buttons on a proposed task a data-tip matching their aria-label', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const approveBtn = document.querySelector('[data-task-approve="t2"]');
    const rejectBtn = document.querySelector('[data-task-delete="t2"]');
    expect(approveBtn?.getAttribute('data-tip')).toBe(
      'Approve proposed task "Investigate the flaky test"',
    );
    expect(approveBtn?.getAttribute('data-tip')).toBe(approveBtn?.getAttribute('aria-label'));
    expect(rejectBtn?.getAttribute('data-tip')).toBe(
      'Reject proposed task "Investigate the flaky test"',
    );
    expect(rejectBtn?.getAttribute('data-tip')).toBe(rejectBtn?.getAttribute('aria-label'));
  });

  it('deleting an operator task confirms with the translated, task-named message before posting', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const delBtn = document.querySelector('[data-task-delete="t1"]') as HTMLButtonElement;
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    delBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(confirmSpy).toHaveBeenCalledWith(
      STRINGS.en.taskDeleteConfirm.replace('{name}', 'Ship the thing'),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/task/delete',
      expect.objectContaining({ body: JSON.stringify({ id: 't1' }) }),
    );
  });

  it('gives the pinned row an unpin button with a data-tip matching its aria-label, absent elsewhere', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const unpinBtn = document.querySelector('[data-task-unpin="t3"]');
    expect(unpinBtn).toBeTruthy();
    expect(unpinBtn?.getAttribute('data-tip')).toBe(
      'Release the operator pin from "Locked-in hotfix" — the next triage will rank it automatically',
    );
    expect(unpinBtn?.getAttribute('data-tip')).toBe(unpinBtn?.getAttribute('aria-label'));
    expect(document.querySelector('[data-task-unpin="t1"]')).toBeFalsy();
  });

  it('clicking the unpin button releases the pin via /api/task/unpin', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const unpinBtn = document.querySelector('[data-task-unpin="t3"]') as HTMLButtonElement;
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();

    unpinBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/task/unpin',
      expect.objectContaining({ body: JSON.stringify({ project: 'p1', ids: ['t3'] }) }),
    );
  });
});
