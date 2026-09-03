// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * A "slice" firing only ADVANCED its task (completion.ts taskShouldClose keeps
 * it open) — every sibling slice shares that same task title, so leading the
 * flight-log headline with it reads as duplicate rows (operator: "identical
 * epic titles x15 read as duplication"). A slice row leads with its OWN
 * commit subject and names the shared task via a "slice of <task>" chip; a
 * RUN of 2+ consecutive same-task slices collapses into one expandable group
 * row ("<task> — N slices", total cost) instead of repeating the task N
 * times. An isolated slice (no run partner) keeps the single-row treatment.
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
  firings: 5,
  shipped: 4,
  cost: 0.95,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 0.8,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  activity: [],
  tasks: [
    { id: 'epic1', title: 'Ship the whole galaxy feature', status: 'in_progress' },
    { id: 'epic2', title: 'Track telemetry drift', status: 'in_progress' },
  ],
  flightLog: [
    {
      id: 'f4',
      shipped: true,
      item: 'epic1',
      completion: 'slice',
      commitSubject: 'feat: galaxy renderer draws the third moon',
      cost: 0.2,
      sha: 'sha0004',
      at: Date.now() - 10_000,
      kind: 'feat',
    },
    {
      id: 'f3',
      shipped: true,
      item: 'epic1',
      completion: 'slice',
      commitSubject: 'feat: galaxy renderer draws the second moon',
      cost: 0.2,
      sha: 'sha0003',
      at: Date.now() - 20_000,
      kind: 'feat',
    },
    {
      id: 'f2',
      shipped: true,
      item: 'epic1',
      completion: 'slice',
      commitSubject: 'feat: galaxy renderer draws the first moon',
      cost: 0.2,
      sha: 'sha0002',
      at: Date.now() - 30_000,
      kind: 'feat',
    },
    {
      id: 'f1',
      shipped: true,
      item: null,
      completion: null,
      commitSubject: 'chore: unrelated cleanup',
      cost: 0.1,
      sha: 'sha0001',
      at: Date.now() - 40_000,
      kind: 'chore',
    },
    {
      id: 'f0',
      shipped: true,
      item: 'epic2',
      completion: 'slice',
      commitSubject: 'feat: telemetry adds one more counter',
      cost: 0.05,
      sha: 'sha0000',
      at: Date.now() - 50_000,
      kind: 'feat',
    },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 5,
    shipped: 4,
    openFindings: 0,
    cost: 0.95,
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

describe('slice-aware flight log', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('collapses a run of 2+ consecutive same-task slices into one group row naming the task and slice count', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    // Display order: the epic1 run (f4/f3/f2) collapses to one row, then the
    // unrelated chore (f1), then the isolated epic2 slice (f0) — 3 rows for
    // 5 underlying firings.
    const rows = Array.from(document.querySelectorAll('.flightlog > li'));
    expect(rows).toHaveLength(3);
    expect(rows[0]?.className).toContain('flight-group');
    expect(rows[0]?.querySelector('.flight-item')?.textContent).toBe(
      'Ship the whole galaxy feature — 3 slices',
    );
    expect(rows[1]?.querySelector('.flight-item')?.textContent).toBe('chore: unrelated cleanup');
  });

  it('sums the cost of every slice in the run onto the group row', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const group = document.querySelector('.flight-group');
    // 0.2 + 0.2 + 0.2
    expect(group?.querySelector('.flight-cost')?.textContent).toBe('$0.60');
  });

  it('expands the group on click to reveal each individual slice with its own commit subject, sha, and cost', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('.flight-group .flight-head') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    const members = Array.from(document.querySelectorAll('.flight-group-member'));
    expect(members).toHaveLength(3);
    expect(members[0]?.querySelector('.flight-item')?.textContent).toBe(
      'feat: galaxy renderer draws the third moon',
    );
    expect(members[0]?.querySelector('.flight-sha')?.textContent).toBe('sha0004');
    expect(members[0]?.querySelector('.flight-cost')?.textContent).toBe('$0.20');
    // D1 ATTRIBUTE PAYLOAD (epic 0015, web-mtd1wmqc-v7h6cq): a group member's
    // headline used to duplicate its tip into aria-label verbatim, same as
    // the flat flight-log row's own headline — it now rides aria-describedby
    // into a visually-hidden span instead.
    const memberItem = members[0]?.querySelector('.flight-item');
    expect(memberItem?.hasAttribute('aria-label')).toBe(false);
    const memberDescId = memberItem?.getAttribute('aria-describedby');
    expect(memberDescId).toBeTruthy();
    expect(document.getElementById(memberDescId ?? '')?.textContent).toBe(
      'feat: galaxy renderer draws the third moon',
    );
    expect(members[1]?.querySelector('.flight-item')?.textContent).toBe(
      'feat: galaxy renderer draws the second moon',
    );
    expect(members[2]?.querySelector('.flight-item')?.textContent).toBe(
      'feat: galaxy renderer draws the first moon',
    );

    await vi.advanceTimersByTimeAsync(5000);
  });

  it('does not group an isolated slice — it keeps its own row with a "slice of <task>" chip', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const rows = Array.from(document.querySelectorAll('.flightlog > li'));
    const isolatedRow = rows[2];
    expect(isolatedRow?.className).not.toContain('flight-group');
    expect(isolatedRow?.querySelector('.flight-item')?.textContent).toBe(
      'feat: telemetry adds one more counter',
    );

    const chips = document.querySelectorAll('.flight-slice-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0]?.textContent).toBe('slice of Track telemetry drift');
  });
});
