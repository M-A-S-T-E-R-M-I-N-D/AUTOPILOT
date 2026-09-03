// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: the task board's "proposed" / severity /
 * dimension chips used to be plain, unexplained text — unlike the fleet
 * card's meta/stat chips, which already carry the shared [data-tip]
 * primitive via tipChip(). They now explain themselves on hover/focus too,
 * and keep their severity/proposed color-coding (.chip.sev-critical etc.).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 4,
  shipped: 3,
  cost: 0.42,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 0.75,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [
    {
      id: 't1',
      title: 'Self-proposed finding',
      status: 'needs_approval',
      source: 'self',
      severity: 'critical',
      dimension: 'ux',
    },
    {
      id: 't2',
      title: 'Auto-triaged from a dropped note',
      status: 'queued',
      source: 'inbox',
    },
    {
      id: 't3',
      title: 'Lifted from BACKLOG-999.md',
      status: 'needs_approval',
      source: 'backlog',
    },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 4,
    shipped: 3,
    openFindings: 0,
    cost: 0.42,
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

describe('task chips explain themselves on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('makes every task chip keyboard-reachable with a tooltip and accessible label, one roving Tab stop per row', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const chips = Array.from(document.querySelectorAll('.tasks .chip'));
    expect(chips.length).toBe(5); // proposed + severity + dimension + inbox + backlog
    for (const chip of chips) {
      expect(chip.getAttribute('data-tip')).toBeTruthy();
      expect(chip.getAttribute('aria-label')).toBeTruthy();
    }
    // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): a row's
    // chips share one roving group with its status pill and title — the pill
    // comes first in DOM order and holds the '0' stop in every row, so no
    // chip is a Tab stop of its own; all five start at '-1'.
    expect(chips.map((chip) => chip.getAttribute('tabindex'))).toEqual([
      '-1',
      '-1',
      '-1',
      '-1',
      '-1',
    ]);
  });

  it('moves the roving tab stop within one row with ArrowRight/ArrowLeft/Home/End, never crossing into another row', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const rows = Array.from(document.querySelectorAll('.tasks li.task'));
    const row1Chips = Array.from(rows[0]!.querySelectorAll('.chip')) as HTMLElement[];
    expect(row1Chips.length).toBe(3); // t1: proposed, severity, dimension
    const [chip0, chip1, chip2] = row1Chips;
    if (!chip0 || !chip1 || !chip2) throw new Error('expected 3 chips on the first task row');

    chip0.focus();
    chip0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(row1Chips.map((c) => c.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    expect(document.activeElement).toBe(chip1);

    chip1.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(row1Chips.map((c) => c.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
    expect(document.activeElement).toBe(chip2);

    // ArrowRight at the last chip clamps instead of wrapping into another row.
    chip2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(chip2);

    // Home jumps to the ROW's first stop — the status pill, now that the
    // pill/title/chips share one roving group (D1 TAB-STOP ROVING follow-up)
    // — not "the first chip", since the chips are no longer their own group.
    const pill = rows[0]!.querySelector('.pill') as HTMLElement;
    chip2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(row1Chips.map((c) => c.getAttribute('tabindex'))).toEqual(['-1', '-1', '-1']);
    expect(pill.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(pill);

    // A different row's lone chip is untouched by row 1's roving state, and
    // is not the '0' stop either — that row's own pill is.
    const row2Chip = rows[1]!.querySelector('.chip');
    expect(row2Chip?.getAttribute('tabindex')).toBe('-1');
  });

  it('moves the roving tab stop to whichever chip gets mouse/programmatic focus', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const row1Chips = Array.from(
      document.querySelectorAll('.tasks li.task')[0]!.querySelectorAll('.chip'),
    ) as HTMLElement[];
    const chip1 = row1Chips[1];
    if (!chip1) throw new Error('expected a second chip on the first task row');

    chip1.focus();
    expect(row1Chips.map((c) => c.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('keeps the severity and proposed color-coding classes alongside the tooltip', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.tasks .chip.chip-proposed')).not.toBeNull();
    expect(document.querySelector('.tasks .chip.sev-critical')).not.toBeNull();
  });

  it('marks an auto-triaged INBOX task with its own chip', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const chip = document.querySelector('.tasks .chip.chip-inbox');
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute('data-tip')).toContain('INBOX/');
    expect(chip?.getAttribute('aria-label')).toContain('INBOX');
  });

  it('marks a BACKLOG-999.md-sourced task with its own chip', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const chip = document.querySelector('.tasks .chip.chip-backlog');
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute('data-tip')).toContain('BACKLOG-999.md');
    expect(chip?.getAttribute('aria-label')).toContain('Backlog-sourced');
    // D1 TAB-STOP ROVING (board web-mtd1wyte-ssntzi): the chip shares one
    // roving group with the row's status pill and title — the pill holds the
    // '0' stop, so the chip is arrow-reachable at '-1' rather than its own.
    expect(chip?.getAttribute('tabindex')).toBe('-1');
  });
});
