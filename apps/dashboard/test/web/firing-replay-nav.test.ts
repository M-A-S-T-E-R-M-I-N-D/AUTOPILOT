// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Firing Replay viewer, step-through slice (BOARD web-msnt26yk-5fzo6j): the
 * per-firing drill-down's "▶ Step through" control lets an operator move one
 * step at a time through a past firing's trace instead of scanning the full
 * list. Drives the REAL client bundle in jsdom against a mocked /api/state,
 * same pattern as activity-feed.test.ts.
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
  flightLog: [],
  tasks: [],
  activity: [
    { tool: 'Edit', target: 'src/a.ts', kind: 'file', phase: 'do', at: 3, firingId: 'f1' },
    { tool: 'Read', target: 'src/b.ts', kind: 'file', phase: 'orient', at: 2, firingId: 'f1' },
    { tool: 'Grep', target: 'TODO', kind: 'search', phase: 'orient', at: 1, firingId: 'f1' },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 1, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

async function openFiring(): Promise<void> {
  boot();
  await vi.advanceTimersByTimeAsync(1);
  const toggle = document.querySelector('[data-firing-toggle="f1"]') as HTMLElement | null;
  toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(1);
}

function click(selector: string): void {
  const el = document.querySelector(selector) as HTMLElement | null;
  expect(el).not.toBeNull();
  el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function arrowKey(selector: string, key: 'ArrowLeft' | 'ArrowRight'): void {
  const el = document.querySelector(selector) as HTMLElement | null;
  expect(el).not.toBeNull();
  el!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('Firing Replay viewer — step-through playback controls', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows a "Step through" toggle for a multi-step firing, none for the compact feed', async () => {
    await openFiring();
    expect(document.querySelector('[data-replay-start="f1"]')).not.toBeNull();
  });

  it('entering replay shows exactly one step plus Prev/Next/Exit controls', async () => {
    await openFiring();
    click('[data-replay-start="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    const rows = document.querySelectorAll('.firing-replay-single .act-sentence');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toBe('Editing a.ts.');
    expect(document.querySelector('.replay-nav-label')?.textContent).toBe('Step 1 of 3');
    expect((document.querySelector('[data-replay-prev="f1"]') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((document.querySelector('[data-replay-next="f1"]') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('Next moves forward one step and updates the label', async () => {
    await openFiring();
    click('[data-replay-start="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    click('[data-replay-next="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.firing-replay-single .act-sentence')?.textContent).toBe(
      'Reading b.ts.',
    );
    expect(document.querySelector('.replay-nav-label')?.textContent).toBe('Step 2 of 3');
  });

  it('Next stops at the last step instead of going out of range', async () => {
    await openFiring();
    click('[data-replay-start="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    click('[data-replay-next="f1"]');
    await vi.advanceTimersByTimeAsync(1);
    click('[data-replay-next="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.replay-nav-label')?.textContent).toBe('Step 3 of 3');
    expect((document.querySelector('[data-replay-next="f1"]') as HTMLButtonElement).disabled).toBe(
      true,
    );

    // A disabled button ignores a synthetic click too (matches real browser behavior).
    click('[data-replay-next="f1"]');
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.replay-nav-label')?.textContent).toBe('Step 3 of 3');
  });

  it('Prev moves back a step', async () => {
    await openFiring();
    click('[data-replay-start="f1"]');
    await vi.advanceTimersByTimeAsync(1);
    click('[data-replay-next="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    click('[data-replay-prev="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.replay-nav-label')?.textContent).toBe('Step 1 of 3');
  });

  it('ArrowRight/ArrowLeft scrub Prev/Next when focus is inside the replay nav bar', async () => {
    await openFiring();
    click('[data-replay-start="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    arrowKey('.replay-nav-label', 'ArrowRight');
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.replay-nav-label')?.textContent).toBe('Step 2 of 3');

    arrowKey('.replay-nav-label', 'ArrowLeft');
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.replay-nav-label')?.textContent).toBe('Step 1 of 3');
  });

  it('arrow keys outside the replay nav bar, and on a disabled end button, are ignored', async () => {
    await openFiring();
    click('[data-replay-start="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    // Outside '.replay-nav' entirely — must not move the step.
    arrowKey('.firing-replay-single .act-sentence', 'ArrowRight');
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.replay-nav-label')?.textContent).toBe('Step 1 of 3');

    // Already at the first step — ArrowLeft's target (Prev) is disabled.
    arrowKey('.replay-nav-label', 'ArrowLeft');
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.replay-nav-label')?.textContent).toBe('Step 1 of 3');
  });

  it('Exit returns to the full-trace list view', async () => {
    await openFiring();
    click('[data-replay-start="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    click('[data-replay-exit="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.firing-replay-single')).toBeNull();
    expect(document.querySelector('.replay-nav')).toBeNull();
    const rows = document.querySelectorAll('.firing-detail .act-sentence');
    expect(rows).toHaveLength(3);
    expect(document.querySelector('[data-replay-start="f1"]')).not.toBeNull();
  });
});
