// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Board ap-muslal3n-0: the Keeper queue vanished on a project page instead of
 * saying "Nothing waiting on you" once its last item settled through a
 * re-render.
 *
 * renderProjectPage rebuilds `#fleet` with replaceChildren(), which detaches
 * the queue's host section. renderKeeperQueue then only re-created the host
 * for a NON-empty queue, so a tick that both rebuilt the page and settled the
 * last item left no host at all: the session's "N settled" record was lost
 * and the queue silently disappeared, where an in-place settle (same page,
 * host still attached) showed the cleared state.
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

// Longer than the client's polling interval (shell.ts REFRESH_MS) and its
// SSE backup poll, so exactly one more refresh has landed either way.
const NEXT_TICK_MS = 15_000;

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

let state: unknown;

async function boot(): Promise<void> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  localStorage.setItem('ap-tour-seen', '1');
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

describe('the Keeper queue across a project-page re-render (ap-muslal3n-0)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // First on purpose: jsdom's document.open() keeps a booted client's
  // document listeners, so a client that saw an item would answer this
  // page's ap:subjects-changed with its own settled history.
  it('still builds no queue on a project page where nothing ever waited', async () => {
    state = stateWith([{ id: 't3', title: 'workable', status: 'queued' }]);
    await boot();
    await vi.advanceTimersByTimeAsync(NEXT_TICK_MS);

    expect(document.getElementById('keeper-queue')).toBeNull();
  });

  it('says "Nothing waiting on you" when the last item settles through a re-render', async () => {
    state = stateWith([{ id: 't2', title: 'self-proposed', status: 'needs_approval' }]);
    await boot();
    const before = document.getElementById('keeper-queue');
    expect(before?.querySelectorAll('.keeper-queue-item')).toHaveLength(1);

    // The approval lands server-side; the next tick rebuilds the page.
    state = stateWith([{ id: 't2', title: 'self-proposed', status: 'queued' }]);
    await vi.advanceTimersByTimeAsync(NEXT_TICK_MS);

    expect(document.querySelector('[data-task-approve]')).toBeNull();
    expect(before?.isConnected).toBe(false);
    const queue = document.getElementById('keeper-queue') as HTMLElement;
    expect(queue).not.toBeNull();
    expect(queue.hidden).toBe(false);
    expect(queue.querySelectorAll('.keeper-queue-item')).toHaveLength(0);
    expect(queue.querySelector('.keeper-queue-title')?.textContent).toBe(
      STRINGS.en.keeperQueueClear + ' · ' + STRINGS.en.keeperQueueSettled.replace('{n}', '1'),
    );
    // Re-placed where the queue always leads: inside the rebuilt page.
    expect(document.getElementById('fleet')?.contains(queue)).toBe(true);
  });
});
