// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression trip-wire for a documented hand-sync risk (epic 0002 "shell
 * decomposition", slice 1), same shape as callsign-parity.test.ts,
 * count-turns-parity.test.ts, narrator-parity.test.ts, and
 * live-firing-parity.test.ts: `web/shell.ts`'s client-side flight map used to
 * be a hand-written mirror of `read/fleet.ts`'s server-side
 * `activityFileNodes` (both now generated from `shared/file-nodes.ts`). This
 * renders the flight map through `clientJs()` (the exact bytes served as
 * /app.js) for a spread of activity fixtures and asserts every rendered file
 * node matches `activityFileNodes()` computed directly from the shared
 * module.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { activityFileNodes } from '../../src/shared/file-nodes.js';
import { basename } from '../../src/shared/narrator.js';
import { renderShell, clientJs } from '../../src/web/shell.js';

interface FixtureActivity {
  readonly tool: string;
  readonly target: string;
  readonly kind: string;
  readonly phase: string;
  readonly at: number;
  readonly firingId: string;
}

function act(overrides: Partial<FixtureActivity>): FixtureActivity {
  return {
    tool: 'Read',
    target: 'src/index.ts',
    kind: 'file',
    phase: 'orient',
    at: 1,
    firingId: 'f1',
    ...overrides,
  };
}

function baseProject(activity: readonly FixtureActivity[]): Record<string, unknown> {
  return {
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
    activity,
  };
}

function stateWithProject(project: Record<string, unknown>) {
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
    projects: [project],
    empty: false,
  };
}

async function renderedFileNodeNames(
  activity: readonly FixtureActivity[],
): Promise<readonly string[]> {
  vi.useFakeTimers();
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () =>
      ({
        ok: true,
        json: async () => stateWithProject(baseProject(activity)),
      }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
  return Array.from(document.querySelectorAll('.flightmap .fnode-name')).map(
    (el) => el.textContent ?? '',
  );
}

describe('client-side activityFileNodes stays in sync with the server copy', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const FIXTURES: readonly (readonly FixtureActivity[])[] = [
    // Distinct files, newest touch wins the identity, newest-first order.
    [
      act({ tool: 'Read', target: 'src/cart.ts', phase: 'orient', at: 1 }),
      act({ tool: 'Edit', target: 'src/cart.ts', phase: 'do', at: 3 }),
      act({ tool: 'Write', target: 'src/pay.ts', phase: 'do', at: 2 }),
    ],
    // Non-file activity (commands, searches) is ignored.
    [
      act({ tool: 'Bash', target: 'pnpm test', kind: 'command', phase: 'gate', at: 1 }),
      act({ tool: 'Grep', target: 'TODO', kind: 'search', phase: 'orient', at: 2 }),
      act({ tool: 'Read', target: 'src/x.ts', kind: 'file', phase: 'orient', at: 3 }),
    ],
    // Basename derives from either slash style and falls back to the raw target.
    [
      act({ target: 'deep/nested/module.ts', at: 1 }),
      act({ target: 'winstyle\\path\\file.tsx', at: 2 }),
      act({ target: 'toplevel.md', at: 3 }),
    ],
    // Out-of-order events: the later-processed touch still wins on a tie, and
    // the higher timestamp wins otherwise regardless of processing order.
    [
      act({ tool: 'Edit', target: 'src/a.ts', phase: 'do', at: 9 }),
      act({ tool: 'Read', target: 'src/a.ts', phase: 'orient', at: 3 }),
    ],
  ];

  it.each(FIXTURES.map((activity, i) => [i, activity] as const))(
    'renders the exact server-computed file node set for fixture %i',
    async (_i, activity) => {
      const expected = activityFileNodes(activity, basename, 8).map((n) => n.name);
      expect(await renderedFileNodeNames(activity)).toEqual(expected);
    },
  );
});
