// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Firing Replay viewer, per-step diff slice (BOARD web-msnt26yk-5fzo6j): the
 * "View diff" pane, opened while step-through playback is active, narrows a
 * whole-firing patch down to just the CURRENT step's target file instead of
 * showing the same wall of text on every step. Drives the REAL client bundle
 * in jsdom against a mocked /api/state + /api/firing-diff, same pattern as
 * firing-replay-nav.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const MULTI_FILE_PATCH = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 111..222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,3 @@',
  ' line1',
  '+added line',
  ' line2',
  'diff --git a/src/b.ts b/src/b.ts',
  'index 333..444 100644',
  '--- a/src/b.ts',
  '+++ b/src/b.ts',
  '@@ -1,1 +1,1 @@',
  '-old',
  '+new',
].join('\n');

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
  flightLog: [{ id: 'f1', at: 1, cost: 0, turns: 1, sha: 'abc1234' }],
  tasks: [],
  activity: [
    { tool: 'Edit', target: 'src/a.ts', kind: 'file', phase: 'do', at: 3, firingId: 'f1' },
    { tool: 'Edit', target: 'src/b.ts', kind: 'file', phase: 'do', at: 2, firingId: 'f1' },
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
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    if (String(url).indexOf('/api/firing-diff') !== -1) {
      return { ok: true, json: async () => ({ patch: MULTI_FILE_PATCH }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
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

function diffText(): string {
  return Array.from(document.querySelectorAll('.firing-diff > div'))
    .map((d) => d.textContent)
    .join('\n');
}

describe('Firing Replay viewer — per-step diff narrowing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the whole patch when the diff is opened outside replay mode', async () => {
    await openFiring();
    click('[data-diff-toggle="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    const text = diffText();
    expect(text).toContain('src/a.ts');
    expect(text).toContain('src/b.ts');
  });

  it("narrows the diff to the current step's file when replay is active", async () => {
    await openFiring();
    click('[data-replay-start="f1"]');
    await vi.advanceTimersByTimeAsync(1);
    click('[data-diff-toggle="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    // Step 1 is the Edit on src/a.ts — only that file's hunk should render.
    const text = diffText();
    expect(text).toContain('src/a.ts');
    expect(text).not.toContain('src/b.ts');
  });

  it("re-narrows the diff to the new step's file after Next", async () => {
    await openFiring();
    click('[data-replay-start="f1"]');
    await vi.advanceTimersByTimeAsync(1);
    click('[data-diff-toggle="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    click('[data-replay-next="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    const text = diffText();
    expect(text).toContain('src/b.ts');
    expect(text).not.toContain('src/a.ts');
  });

  it('falls back to the full patch on a non-file step (search) instead of showing nothing', async () => {
    await openFiring();
    click('[data-replay-start="f1"]');
    await vi.advanceTimersByTimeAsync(1);
    click('[data-diff-toggle="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    click('[data-replay-next="f1"]');
    await vi.advanceTimersByTimeAsync(1);
    click('[data-replay-next="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    // Step 3 is the Grep search (no matching file) — full patch, not empty.
    const text = diffText();
    expect(text).toContain('src/a.ts');
    expect(text).toContain('src/b.ts');
  });
});
