// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression trip-wire for a documented hand-sync risk (epic 0002 "shell
 * decomposition", slice 1 + slice 2's twentieth cut), same shape as
 * callsign-parity.test.ts, count-turns-parity.test.ts, and
 * narrator-parity.test.ts: `web/shell.ts`'s client-side
 * `liveSubagents`/`averageFiringDurationMs`/`liveFiring` aggregate used to be
 * hand-written mirrors of `read/fleet.ts`'s server-side copies (all now
 * generated from `shared/live-firing.ts`). This renders the live worker card
 * + office map through `clientJs()` (the exact bytes served as /app.js) and
 * asserts the rendered output matches the server module's own functions — a
 * future edit to either copy without updating the other would fail this test
 * instead of silently drifting.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  liveSubagents,
  averageFiringDurationMs,
  liveFiringOf,
} from '../../src/shared/live-firing.js';
import { firingCallsign } from '../../src/shared/callsign.js';
import { narratorLine } from '../../src/shared/narrator.js';
import { countTurns } from '../../src/shared/turns.js';
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
  readonly model?: string;
}

interface FixtureFlight {
  readonly id: string;
  readonly item: string | null;
  readonly kind: string;
  readonly sha: string;
  readonly shipped: boolean;
  readonly gateResult: string;
  readonly cost: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly turns: number;
  readonly commitSubject: string | null;
  readonly completion: string | null;
  readonly failedCheck: string | null;
  readonly died: null;
  readonly at: number;
  readonly durationMs: number | null;
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

async function renderFleetPage(project: Record<string, unknown>): Promise<void> {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => stateWithProject(project) }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
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

interface FixtureTask {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly focus: boolean;
}

function task(overrides: Partial<FixtureTask>): FixtureTask {
  return {
    id: 't1',
    title: 'Wire up retries',
    status: 'in_progress',
    focus: false,
    ...overrides,
  };
}

function flight(overrides: Partial<FixtureFlight>): FixtureFlight {
  return {
    id: 'p1:firing-2',
    item: null,
    kind: 'fix',
    sha: 'abc1234',
    shipped: true,
    gateResult: 'passed',
    cost: 0.42,
    tokensIn: 0,
    tokensOut: 0,
    turns: 3,
    commitSubject: null,
    completion: null,
    failedCheck: null,
    died: null,
    at: 5,
    durationMs: null,
    ...overrides,
  };
}

describe('client-side liveSubagents stays in sync with the server copy', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const FIXTURES: readonly (readonly FixtureActivity[])[] = [
    // No Agent/Task calls at all — no satellites.
    [act({ tool: 'Read', target: 'src/a.ts', kind: 'file' })],
    // Two distinct subagents, newest first.
    [
      act({ tool: 'Agent', target: 'Security review', kind: 'other', at: NOW - 1_000 }),
      act({ tool: 'Task', target: 'Fix the build', kind: 'other', at: NOW - 2_000 }),
      act({ tool: 'Read', target: 'src/a.ts', kind: 'file', at: NOW - 3_000 }),
    ],
    // A repeated label collapses to one entry.
    [
      act({ tool: 'Agent', target: 'Security review', kind: 'other', at: NOW - 1_000 }),
      act({ tool: 'Agent', target: 'Security review', kind: 'other', at: NOW - 2_000 }),
    ],
    // Five distinct subagents — capped at LIVE_SUBAGENT_CAP (4).
    [
      act({ tool: 'Agent', target: 'a', kind: 'other', at: NOW - 1_000 }),
      act({ tool: 'Task', target: 'b', kind: 'other', at: NOW - 2_000 }),
      act({ tool: 'Agent', target: 'c', kind: 'other', at: NOW - 3_000 }),
      act({ tool: 'Task', target: 'd', kind: 'other', at: NOW - 4_000 }),
      act({ tool: 'Agent', target: 'e', kind: 'other', at: NOW - 5_000 }),
    ],
  ];

  it.each(FIXTURES.map((activity, i) => [i, activity] as const))(
    'renders the exact server-computed subagent set for fixture %i',
    async (_i, activity) => {
      await renderFleetPage({ ...BASE_PROJECT, activity });
      const rendered = Array.from(document.querySelectorAll('.office-satellite')).map((el) =>
        (el.getAttribute('aria-label') ?? '').replace(/^Subagent — /, ''),
      );
      const expected = liveSubagents(activity).map((s) => s.label);
      expect(rendered).toEqual(expected);
    },
  );
});

describe('client-side averageFiringDurationMs stays in sync with the server copy', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('hides the progress line when no past firing recorded a duration', async () => {
    await renderFleetPage({
      ...BASE_PROJECT,
      activity: [act({})],
      flightLog: [flight({ id: 'p1:firing-2', durationMs: null })],
    });
    expect(averageFiringDurationMs([{ durationMs: null }])).toBeNull();
    expect(document.querySelector('.live-worker-progress-label')).toBeNull();
  });

  const DURATION_FIXTURES: readonly (readonly FixtureFlight[])[] = [
    [
      flight({ id: 'p1:firing-2', durationMs: 60_000 }),
      flight({ id: 'p1:firing-3', durationMs: 60_000 }),
    ],
    [
      flight({ id: 'p1:firing-2', durationMs: 100_000 }),
      flight({ id: 'p1:firing-3', durationMs: 200_000 }),
      flight({ id: 'p1:firing-4', durationMs: null }),
    ],
  ];

  it.each(DURATION_FIXTURES.map((flightLog, i) => [i, flightLog] as const))(
    'renders the elapsed-vs-average progress bar off the exact server-computed average for fixture %i',
    async (_i, flightLog) => {
      const startedAt = NOW - 60_000;
      await renderFleetPage({
        ...BASE_PROJECT,
        activity: [act({ at: startedAt, firingId: 'f-live' })],
        flightLog,
      });
      const avg = averageFiringDurationMs(flightLog);
      expect(avg).not.toBeNull();
      const expectedPct = Math.min(100, Math.max(0, Math.round((60_000 / (avg as number)) * 100)));
      const bar = document.querySelector('.live-progress');
      expect(bar).not.toBeNull();
      expect(bar?.getAttribute('aria-valuenow')).toBe(String(expectedPct));
    },
  );
});

describe('client-side liveFiring aggregate stays in sync with the shared liveFiringOf core', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the callsign, phase, focus task, and turn count the shared core computes', async () => {
    const activity = [
      act({
        tool: 'Bash',
        target: 'pnpm run test',
        kind: 'command',
        phase: 'gate',
        firingId: 'p1:firing-3',
        at: NOW - 1_000,
        model: 'claude-sonnet-5',
      }),
      act({
        tool: 'Edit',
        target: 'src/a.ts',
        kind: 'file',
        phase: 'do',
        firingId: 'p1:firing-3',
        at: NOW - 2_000,
      }),
    ];
    const tasks = [task({ focus: true, title: 'Wire up retries' })];
    await renderFleetPage({ ...BASE_PROJECT, activity, tasks });

    const expected = liveFiringOf(
      { status: 'flying', activity, flightLog: [], tasks },
      firingCallsign,
      narratorLine,
      countTurns,
    );
    expect(expected).not.toBeNull();

    expect(document.querySelector('.live-callsign')?.textContent).toBe(expected?.callsign);
    expect(document.querySelector('.pill.live-phase-' + expected?.phase)?.textContent).toBe(
      expected?.phase,
    );
    expect(document.querySelector('.live-worker-narrator')?.textContent).toBe(expected?.narrator);
    expect(document.querySelector('.live-worker-line')?.textContent).toBe(
      '🎯 working: ' + expected?.focusTask,
    );
    expect(document.querySelector('.live-worker-turns')?.textContent).toContain(
      String(expected?.turnsSeen),
    );
    expect(document.querySelector('.live-model')?.textContent).toBe(expected?.model);
  });

  it('hides the model chip when the newest activity predates per-step model tracking', async () => {
    const activity = [act({ firingId: 'p1:firing-3' })];
    await renderFleetPage({ ...BASE_PROJECT, activity });

    const expected = liveFiringOf(
      { status: 'flying', activity, flightLog: [], tasks: [] },
      firingCallsign,
      narratorLine,
      countTurns,
    );
    expect(expected?.model).toBeNull();
    expect(document.querySelector('.live-model')).toBeNull();
  });

  it('falls back to the queue-head probable task when no focus is locked', async () => {
    const activity = [act({ firingId: 'p1:firing-3' })];
    const tasks = [
      task({ id: 't0', title: 'Ignore me', status: 'needs_approval', focus: false }),
      task({ id: 't1', title: 'Ship the fix', status: 'queued', focus: false }),
    ];
    await renderFleetPage({ ...BASE_PROJECT, activity, tasks });

    const expected = liveFiringOf(
      { status: 'flying', activity, flightLog: [], tasks },
      firingCallsign,
      narratorLine,
      countTurns,
    );
    expect(expected?.focusTask).toBeNull();
    expect(document.querySelector('.live-worker-line.live-worker-guess')?.textContent).toBe(
      'probably working: Ship the fix',
    );
  });
});

describe('client-side orientFixation chip stays in sync with the shared liveFiringOf core', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function orientTurns(count: number): FixtureActivity[] {
    return Array.from({ length: count }, (_, i) =>
      act({ firingId: 'p1:firing-3', phase: 'orient', model: 'sonnet-' + i }),
    );
  }

  it('renders the fixation chip once the shared core flags orientFixation', async () => {
    const activity = orientTurns(15);
    await renderFleetPage({ ...BASE_PROJECT, activity });

    const expected = liveFiringOf(
      { status: 'flying', activity, flightLog: [], tasks: [] },
      firingCallsign,
      narratorLine,
      countTurns,
    );
    expect(expected?.orientFixation).toBe(true);

    const chip = document.querySelector('.live-orient-fixation');
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute('aria-label')).toBe(
      'possible fixation: ' + expected?.turnsSeen + ' turns with no edit yet',
    );
  });

  it('renders no fixation chip when a DO-phase activity already exists', async () => {
    const activity = [
      ...orientTurns(14),
      act({ firingId: 'p1:firing-3', phase: 'do', model: 'sonnet-do' }),
    ];
    await renderFleetPage({ ...BASE_PROJECT, activity });

    const expected = liveFiringOf(
      { status: 'flying', activity, flightLog: [], tasks: [] },
      firingCallsign,
      narratorLine,
      countTurns,
    );
    expect(expected?.orientFixation).toBe(false);
    expect(document.querySelector('.live-orient-fixation')).toBeNull();
  });

  it('renders no fixation chip below the turn threshold', async () => {
    const activity = orientTurns(5);
    await renderFleetPage({ ...BASE_PROJECT, activity });

    expect(document.querySelector('.live-orient-fixation')).toBeNull();
  });
});
