// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression trip-wire for a documented hand-sync risk (epic 0002 "shell
 * decomposition", slice 1), same shape as callsign-parity.test.ts,
 * count-turns-parity.test.ts, and narrator-parity.test.ts: `web/shell.ts`'s
 * client-side flightHeadlineOf/finishedFlightSummaries used to be a
 * hand-written mirror of `read/fleet.ts`'s server-side finishedFlightSummaries
 * (now both generated from `shared/flight-summary.ts`). Before this slice the
 * two copies had already drifted — the server's headline never applied the
 * "a slice leads with its own commit subject" rule the client used, so a
 * shipped 'slice' firing's headline would differ between the two (see fixture
 * 3 below, the case that would have caught it). This renders the project page
 * through `clientJs()` (the exact bytes served as /app.js) for a spread of
 * headline-resolution branches and asserts every rendered headline equals
 * `finishedFlightSummaries()` computed directly from the server module.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { finishedFlightSummaries } from '../../src/shared/flight-summary.js';
import { renderShell, clientJs } from '../../src/web/shell.js';

const TASKS = [
  { id: 't1', title: 'Fix the login', status: 'done' },
  { id: 't2', title: 'Refactor the poller', status: 'in_progress' },
];

const FLIGHT_LOG = [
  // A matching DONE task wins the headline and the closed badge.
  {
    id: 'f1',
    item: 't1',
    shipped: true,
    cost: 0.1,
    sha: 'aaa1111',
    at: 6,
    kind: 'fix',
    gateResult: 'passed',
    died: null,
    completion: null,
    commitSubject: null,
  },
  // A matching task that is not (yet) done still supplies the headline.
  {
    id: 'f2',
    item: 't2',
    shipped: true,
    cost: 0.2,
    sha: 'bbb2222',
    at: 5,
    kind: 'feat',
    gateResult: 'passed',
    died: null,
    completion: null,
    commitSubject: null,
  },
  // A 'slice' completion leads with its OWN commit subject, not the shared
  // task title every sibling slice repeats — the divergence this slice fixed.
  {
    id: 'f3',
    item: 't2',
    shipped: true,
    cost: 0.3,
    sha: 'ccc3333',
    at: 4,
    kind: 'refactor',
    gateResult: 'passed',
    died: null,
    completion: 'slice',
    commitSubject: 'refactor: slice 3 of 5',
  },
  // No matching task: falls back to the real commit subject.
  {
    id: 'f4',
    item: 'unknown-item',
    shipped: true,
    cost: 0.4,
    sha: 'ddd4444',
    at: 3,
    kind: 'chore',
    gateResult: 'passed',
    died: null,
    completion: null,
    commitSubject: 'chore: tidy up',
  },
  // No task, no commit subject: falls back to the raw item id.
  {
    id: 'f5',
    item: 'inferred-item',
    shipped: true,
    cost: 0.5,
    sha: 'eee5555',
    at: 2,
    kind: 'docs',
    gateResult: 'passed',
    died: null,
    completion: null,
    commitSubject: null,
  },
  // No task, no commit subject, no item: falls back to the kind.
  {
    id: 'f6',
    item: null,
    shipped: true,
    cost: 0.6,
    sha: 'fff6666',
    at: 1,
    kind: 'perf',
    gateResult: 'passed',
    died: null,
    completion: null,
    commitSubject: null,
  },
];

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  fileCount: 12,
  totalBytes: 4096,
  languages: [],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: true,
  firings: FLIGHT_LOG.length,
  shipped: FLIGHT_LOG.length,
  cost: 2.1,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  activity: [],
  tasks: TASKS,
  flightLog: FLIGHT_LOG,
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: FLIGHT_LOG.length,
    shipped: FLIGHT_LOG.length,
    openFindings: 0,
    cost: 2.1,
  },
  projects: [PROJECT],
  empty: false,
};

async function renderedHeadlines(): Promise<readonly string[]> {
  vi.useFakeTimers();
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
  const headlines = Array.from(document.querySelectorAll('.flight-summary-headline')).map(
    (el) => el.textContent ?? '',
  );
  vi.useRealTimers();
  vi.restoreAllMocks();
  return headlines;
}

describe('client-side finishedFlightSummaries stays in sync with the server copy', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the exact server-computed headline for every shipped flight, in order', async () => {
    const expected = finishedFlightSummaries({ tasks: TASKS, flightLog: FLIGHT_LOG }).map(
      (s) => s.headline,
    );
    expect(expected).toEqual([
      'Fix the login',
      'Refactor the poller',
      'refactor: slice 3 of 5',
      'chore: tidy up',
      'inferred-item',
      'perf firing',
    ]);
    expect(await renderedHeadlines()).toEqual(expected);
  });
});
