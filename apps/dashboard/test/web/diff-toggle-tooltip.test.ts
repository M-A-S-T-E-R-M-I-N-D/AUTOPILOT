// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the firing detail's
 * "View diff"/"Hide diff" toggle used to render with no `data-tip`/
 * `aria-label`, unlike its sibling "Step through" replay toggle rendered
 * right above it (see `firing-replay-nav.test.ts`). It now explains itself
 * on hover/focus, state-aware like its own label.
 *
 * D1 ATTRIBUTE PAYLOAD (epic 0015, web-mtd1wmqc-v7h6cq): aria-label used to
 * duplicate the full data-tip sentence verbatim. The button's own visible
 * text ("View diff"/"Hide diff") already names the action, so aria-label
 * now just states that concisely — the explanatory sentence lives in
 * data-tip alone.
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
  flightLog: [{ id: 'f1', at: 1, cost: 0, turns: 1, sha: 'abc1234' }],
  tasks: [],
  activity: [
    { tool: 'Edit', target: 'src/a.ts', kind: 'file', phase: 'do', at: 1, firingId: 'f1' },
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

function click(selector: string): void {
  const el = document.querySelector(selector) as HTMLElement | null;
  expect(el).not.toBeNull();
  el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('the firing detail diff toggle explains itself on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('carries a tooltip and accessible label describing what it reveals when closed', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    click('[data-firing-toggle="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    const toggle = document.querySelector('[data-diff-toggle="f1"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('data-tip')).toBe(
      "Show this firing's code diff — the git commit patch it shipped",
    );
    // Concise, not the full data-tip sentence duplicated verbatim.
    expect(toggle?.getAttribute('aria-label')).toBe('View diff');
  });

  it('flips its tooltip and accessible label to "Hide this diff" once opened', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    click('[data-firing-toggle="f1"]');
    await vi.advanceTimersByTimeAsync(1);
    click('[data-diff-toggle="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    const toggle = document.querySelector('[data-diff-toggle="f1"]');
    expect(toggle?.getAttribute('data-tip')).toBe('Hide this diff');
    expect(toggle?.getAttribute('aria-label')).toBe('Hide diff');
  });
});
