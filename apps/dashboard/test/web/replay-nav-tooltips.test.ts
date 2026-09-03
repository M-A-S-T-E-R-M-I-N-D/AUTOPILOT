// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the Firing Replay
 * playback controls were a whole silent cluster — the "▶ Step through"
 * toggle, Prev/Next, "Exit replay", and the "Step N of M" position label
 * all rendered with no [data-tip], so the one part of the app built for
 * explaining a firing did not explain itself. Drives the REAL client bundle
 * in jsdom against a mocked /api/state, same harness as
 * firing-replay-nav.test.ts.
 *
 * D1 ATTRIBUTE PAYLOAD (epic 0015, web-mtd1wmqc-v7h6cq): Step through/Prev/
 * Next/Exit originally set aria-label to the exact same sentence as
 * data-tip, shipping the explanatory text twice per control. Each
 * aria-label now states the action concisely; data-tip alone carries the
 * full sentence.
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

describe('Firing Replay playback controls explain themselves on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('the "Step through" toggle carries a data-tip and a concise, distinct aria-label', async () => {
    await openFiring();

    const toggle = document.querySelector('[data-replay-start="f1"]');
    expect(toggle).toBeTruthy();
    expect(toggle?.getAttribute('data-tip')).toBe(
      'Replay this firing one action at a time with Prev and Next controls',
    );
    expect(toggle?.getAttribute('aria-label')).toBe('Step through');
  });

  it('Prev, Next and Exit each carry a data-tip and a concise, distinct aria-label', async () => {
    await openFiring();
    click('[data-replay-start="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    const prev = document.querySelector('[data-replay-prev="f1"]');
    expect(prev?.getAttribute('data-tip')).toBe('Step back to the previous action in this replay');
    expect(prev?.getAttribute('aria-label')).toBe('Previous action');

    const next = document.querySelector('[data-replay-next="f1"]');
    expect(next?.getAttribute('data-tip')).toBe('Advance to the next action in this replay');
    expect(next?.getAttribute('aria-label')).toBe('Next action');

    const exit = document.querySelector('[data-replay-exit="f1"]');
    expect(exit?.getAttribute('data-tip')).toBe('Leave playback and show the full trace list');
    expect(exit?.getAttribute('aria-label')).toBe('Exit replay');
  });

  it('the "Step N of M" label is focusable and explains the arrow-key scrub', async () => {
    await openFiring();
    click('[data-replay-start="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    const label = document.querySelector('.replay-nav-label');
    expect(label?.textContent).toBe('Step 1 of 3');
    expect(label?.getAttribute('tabindex')).toBe('0');
    expect(label?.getAttribute('data-tip')).toBe(
      'Your position in this replay — Left and Right arrow keys also step',
    );
    // No aria-label: the label is an aria-live status region whose announced
    // text must stay "Step N of M", not the tip.
    expect(label?.getAttribute('aria-label')).toBeNull();
  });
});
