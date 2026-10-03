// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the Keeper queue's heading.
 * The queue leads the Keeper subject, above the PR review, Pool and triage
 * panels that each head with a stroke icon, yet "Waiting on you · N" and its
 * cleared state "Nothing waiting on you · N settled this session" headed with
 * bare words.
 *
 * Both lead with the `inbox` the rail's Keeper link draws, so the queue reads
 * as that place's own list, the way the empty fleet leads with the Fleet
 * link's `layout-grid`. The icon is decorative, so the heading's text and the
 * section's aria-label stay the words alone. `subject-nav.ts` rides
 * `/panels.js`, so core does not grow.
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

const PROPOSED_TASK = { id: 't2', title: 'self-proposed', status: 'needs_approval' };

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

function queueHeading(): HTMLElement {
  const heading = document.querySelector('#keeper-queue .keeper-queue-title') as HTMLElement;
  expect(heading).not.toBeNull();
  const icon = heading.firstElementChild;
  expect(icon?.getAttribute('class')).toBe('icon icon-inbox');
  expect(icon?.getAttribute('aria-hidden')).toBe('true');
  expect(icon?.querySelectorAll('path, polyline, rect').length).toBeGreaterThan(0);
  expect(heading.querySelectorAll('svg')).toHaveLength(1);
  return heading;
}

describe('the Keeper queue heading (epic 0025 slice 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('"Waiting on you" leads with the inbox the rail’s Keeper link draws', async () => {
    state = stateWith([PROPOSED_TASK]);
    await boot();

    expect(
      document.querySelector('a[data-subject-link="keeper"] > svg')?.getAttribute('class'),
    ).toBe('icon icon-inbox');
    const heading = queueHeading();
    expect(heading.textContent).toBe(STRINGS.en.keeperQueueTitle + ' · 1');
    expect(document.getElementById('keeper-queue')?.getAttribute('aria-label')).toBe(
      STRINGS.en.keeperQueueTitle,
    );
  });

  it('the cleared queue keeps the inbox beside "Nothing waiting on you"', async () => {
    state = stateWith([PROPOSED_TASK]);
    await boot();
    queueHeading();

    // The approval settles: its button leaves the board, and the page
    // announces the change the way renderProjectPage does.
    document.querySelector('[data-task-approve="t2"]')?.remove();
    document.dispatchEvent(new CustomEvent('ap:subjects-changed'));

    expect(document.querySelectorAll('#keeper-queue .keeper-queue-item')).toHaveLength(0);
    const heading = queueHeading();
    expect(heading.textContent).toBe(
      STRINGS.en.keeperQueueClear + ' · ' + STRINGS.en.keeperQueueSettled.replace('{n}', '1'),
    );
  });
});
