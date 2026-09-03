// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression trip-wire for a documented hand-sync risk (epic 0002 "shell
 * decomposition", slice 1), same shape as callsign-parity.test.ts:
 * `web/shell.ts`'s client-side `countTurns` used to be a hand-written mirror
 * of `read/fleet.ts`'s server-side `countTurns` (now both generated from
 * `shared/turns.ts`). This renders the live worker card through `clientJs()`
 * (the exact bytes served as /app.js) for several activity shapes and asserts
 * the rendered "~N turn(s)" count equals `countTurns()` computed directly
 * from the server module — a future edit to either copy without updating the
 * other would fail this test instead of silently drifting.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { countTurns } from '../../src/read/fleet.js';
import { renderShell, clientJs } from '../../src/web/shell.js';

const NOW = 1_700_000_000_000;

const BASE_PROJECT = {
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
  lastActivityAt: null,
  flightLog: [],
  tasks: [],
};

interface FixtureActivity {
  readonly tool: string;
  readonly target: string;
  readonly kind: string;
  readonly phase: string;
  readonly at: number;
  readonly firingId: string;
  readonly model?: string | null;
  readonly tokensIn?: number | null;
  readonly tokensOut?: number | null;
  readonly reasoning?: string | null;
}

function stateWithActivity(activity: readonly FixtureActivity[]) {
  return {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 1,
      needsYou: 0,
      firings: 0,
      shipped: 0,
      openFindings: 0,
      cost: 0,
    },
    projects: [{ ...BASE_PROJECT, activity }],
    empty: false,
  };
}

async function renderedTurnsSeen(activity: readonly FixtureActivity[]): Promise<number> {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () =>
      ({ ok: true, json: async () => stateWithActivity(activity) }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
  const text = document.querySelector('.live-worker-turns')?.textContent ?? '';
  const match = /~(\d+) turns?/.exec(text);
  vi.useRealTimers();
  vi.restoreAllMocks();
  return match ? Number(match[1]) : NaN;
}

function act(overrides: Partial<FixtureActivity>): FixtureActivity {
  return {
    tool: 'Bash',
    target: 'pnpm run test',
    kind: 'command',
    phase: 'gate',
    at: NOW - 5_000,
    firingId: 'f1',
    ...overrides,
  };
}

describe('client-side countTurns stays in sync with the server copy', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const FIXTURES: readonly (readonly FixtureActivity[])[] = [
    // All-consecutive same-tuple rows: collapses to one turn.
    [
      act({ model: 'sonnet', tokensIn: 500, tokensOut: 40 }),
      act({
        tool: 'Read',
        target: 'src/a.ts',
        kind: 'file',
        model: 'sonnet',
        tokensIn: 500,
        tokensOut: 40,
      }),
    ],
    // A genuinely distinct tuple ahead of the collapsed pair: two turns.
    [
      act({ model: 'sonnet', tokensIn: 700, tokensOut: 60 }),
      act({ model: 'sonnet', tokensIn: 500, tokensOut: 40 }),
      act({
        tool: 'Read',
        target: 'src/a.ts',
        kind: 'file',
        model: 'sonnet',
        tokensIn: 500,
        tokensOut: 40,
      }),
    ],
    // Every row distinct: as many turns as rows.
    [
      act({ model: 'sonnet', tokensIn: 100, tokensOut: 10 }),
      act({ model: 'sonnet', tokensIn: 200, tokensOut: 20 }),
      act({ model: 'haiku', tokensIn: 200, tokensOut: 20 }),
    ],
    // No telemetry captured on any row: every row shares the same empty key,
    // collapsing to one turn (the honest-undercount branch).
    [act({}), act({ tool: 'Read', target: 'src/a.ts', kind: 'file' }), act({ tool: 'Edit' })],
    // reasoning differs while model/tokens stay identical: still a distinct turn.
    [
      act({ model: 'sonnet', tokensIn: 500, tokensOut: 40, reasoning: 'first' }),
      act({ model: 'sonnet', tokensIn: 500, tokensOut: 40, reasoning: 'second' }),
    ],
  ];

  it.each(FIXTURES.map((activity, i) => [i, activity] as const))(
    'renders the exact server-computed turn count for fixture %i',
    async (_i, activity) => {
      expect(await renderedTurnsSeen(activity)).toBe(countTurns(activity));
    },
  );
});
