// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression trip-wire for a documented hand-sync risk (epic 0002 "shell
 * decomposition", slice 1), same shape as callsign-parity.test.ts and
 * count-turns-parity.test.ts: `web/shell.ts`'s client-side narrator
 * (narratorTarget/basename/narratorKind/narratorPhrase/narratorLine) used to
 * be a hand-written mirror of `read/fleet.ts`'s server-side narrator (now
 * both generated from `shared/narrator.ts`). This renders the live worker
 * card through `clientJs()` (the exact bytes served as /app.js) for several
 * activity shapes and asserts the rendered narrator sentence equals
 * `narratorLine()` computed directly from the server module — a future edit
 * to either copy without updating the other would fail this test instead of
 * silently drifting.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { narratorLine } from '../../src/read/fleet.js';
import { renderShell, clientJs } from '../../src/web/shell.js';

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

async function renderedNarratorLine(activity: readonly FixtureActivity[]): Promise<string | null> {
  vi.useFakeTimers();
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () =>
      ({ ok: true, json: async () => stateWithActivity(activity) }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
  const text = document.querySelector('.live-worker-narrator')?.textContent ?? null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  return text;
}

function act(overrides: Partial<FixtureActivity>): FixtureActivity {
  return {
    tool: 'Bash',
    target: 'pnpm run test',
    kind: 'command',
    phase: 'gate',
    at: 1,
    firingId: 'f1',
    ...overrides,
  };
}

describe('client-side narratorLine stays in sync with the server copy', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const FIXTURES: readonly (readonly FixtureActivity[])[] = [
    // A single edit — the basename() branch.
    [act({ tool: 'Edit', target: 'src/deep/path/a.ts', kind: 'file', phase: 'do' })],
    // A single read — the other basename() branch.
    [act({ tool: 'Read', target: 'src/a.ts', kind: 'file', phase: 'orient' })],
    // A search — the narratorTarget() quoting branch.
    [act({ tool: 'Grep', target: 'TODO', kind: 'search', phase: 'orient' })],
    // A streak of 3 consecutive edits collapses into one sentence + count.
    [
      act({ tool: 'Edit', target: 'c.ts', kind: 'file', phase: 'do' }),
      act({ tool: 'Edit', target: 'b.ts', kind: 'file', phase: 'do' }),
      act({ tool: 'Edit', target: 'a.ts', kind: 'file', phase: 'do' }),
    ],
    // A target long enough to trip narratorTarget()'s truncation cap.
    [act({ tool: 'Bash', target: 'x'.repeat(120), kind: 'command', phase: 'do' })],
    // The 'other' default branch — no recognized kind/phase.
    [act({ tool: 'Task', target: '', kind: 'other', phase: 'other' })],
  ];

  it.each(FIXTURES.map((activity, i) => [i, activity] as const))(
    'renders the exact server-computed narrator line for fixture %i',
    async (_i, activity) => {
      expect(await renderedNarratorLine(activity)).toBe(narratorLine(activity));
    },
  );
});
