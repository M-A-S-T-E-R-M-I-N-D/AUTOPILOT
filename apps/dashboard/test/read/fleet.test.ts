// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  buildFleetView,
  toCard,
  activityPhase,
  activityFileNodes,
  finishedFlightSummaries,
  firingCallsign,
  countTurns,
  fleetStreak,
  fleetChronoLog,
  liveFiring,
  liveFirings,
  liveSubagents,
  narratorLine,
  firstFailedGateCheck,
  wasAutoformatRescued,
  ACTIVITY_PHASES,
  type ActivityEntry,
  type FlightEntry,
  type ProjectAggregate,
  type TaskEntry,
} from '../../src/read/fleet.js';
import { flightHeadlineOf } from '../../src/shared/flight-summary.js';
import { basename } from '../../src/shared/narrator.js';
import { ORIENT_FIXATION_TURN_THRESHOLD } from '../../src/shared/live-firing.js';

function act(over: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    tool: 'Read',
    target: 'src/index.ts',
    kind: 'file',
    phase: 'orient',
    at: 1,
    firingId: null,
    ...over,
  };
}

function aggregate(over: Partial<ProjectAggregate> = {}): ProjectAggregate {
  return {
    id: 'p1',
    slug: 'alpha',
    name: 'Alpha',
    status: 'flying',
    createdAt: 100,
    fileCount: 10,
    totalBytes: 2048,
    languages: [
      { language: 'typescript', files: 8, bytes: 1800 },
      { language: 'json', files: 2, bytes: 248 },
    ],
    topDirs: [{ dir: 'src', files: 8 }],
    hotFiles: ['src/index.ts'],
    gate: 'js · vitest run',
    backedUp: true,
    soul: null,
    soulReviewed: true,
    soulProposed: null,
    soulPrevious: null,
    firings: 4,
    shipped: 3,
    cost: 1.5,
    tokensIn: 1000,
    tokensOut: 200,
    cacheReadTokens: 400,
    cacheWriteTokens: 100,
    turns: 20,
    gauge: { critical: 1, high: 2, medium: 0, low: 1 },
    lastActivityAt: 999,
    flightLog: [],
    activity: [],
    tasks: [],
    dora: {
      landingFrequency: { windowDays: 7, landings: 0, perDay: 0 },
      taskLeadTime: { tasksCompleted: 0, medianLeadTimeMs: null, meanLeadTimeMs: null },
      changeFailureRate: { shipped: 0, reverts: 0, rate: null },
      mttr: { checkpoints: 0, resolved: 0, medianRecoveryMs: null, meanRecoveryMs: null },
    },
    gateParallel: {
      sampledFirings: 0,
      sequentialMs: 0,
      observedMs: 0,
      savedMs: 0,
      savedPct: null,
    },
    ...over,
  };
}

describe('ACTIVITY_PHASES', () => {
  it('lists the ORIENT-DO-GATE-COMMIT rail in order', () => {
    expect(ACTIVITY_PHASES).toEqual(['orient', 'do', 'gate', 'commit']);
  });
});

describe('toCard', () => {
  it('derives primary language, ship rate, and open-finding count', () => {
    const card = toCard(aggregate());
    expect(card.primaryLanguage).toBe('typescript');
    expect(card.shipRate).toBeCloseTo(0.75);
    expect(card.openFindings).toBe(4); // 1+2+0+1
  });

  it('sums all four severities for open-finding count, not just three of them', () => {
    const card = toCard(aggregate({ gauge: { critical: 1, high: 2, medium: 3, low: 4 } }));
    expect(card.openFindings).toBe(10);
  });

  it('reports a null ship rate (not 0/0) when there are no firings', () => {
    const card = toCard(aggregate({ firings: 0, shipped: 0 }));
    expect(card.shipRate).toBeNull();
  });

  it('falls back to "unknown" when no languages are indexed', () => {
    const card = toCard(aggregate({ languages: [] }));
    expect(card.primaryLanguage).toBe('unknown');
  });

  it('passes the DORA snapshot through unchanged for the per-project tiles', () => {
    const dora = {
      landingFrequency: { windowDays: 7, landings: 3, perDay: 3 / 7 },
      taskLeadTime: { tasksCompleted: 2, medianLeadTimeMs: 1000, meanLeadTimeMs: 1500 },
      changeFailureRate: { shipped: 4, reverts: 1, rate: 0.25 },
      mttr: { checkpoints: 1, resolved: 1, medianRecoveryMs: 500, meanRecoveryMs: 500 },
    };
    const card = toCard(aggregate({ dora }));
    expect(card.dora).toBe(dora);
  });

  it('passes the parallel-gate savings through unchanged for the per-project tiles', () => {
    const gateParallel = {
      sampledFirings: 3,
      sequentialMs: 9000,
      observedMs: 5000,
      savedMs: 4000,
      savedPct: 4000 / 9000,
    };
    const card = toCard(aggregate({ gateParallel }));
    expect(card.gateParallel).toBe(gateParallel);
  });

  it('recent form covers the LAST 5 firings — an old failure ages out honestly', () => {
    const flight = (id: string, shipped: boolean): FlightEntry => ({
      id,
      item: null,
      kind: null,
      sha: null,
      shipped,
      gateResult: shipped ? 'passed' : 'no-commit',
      cost: 1,
      tokensIn: 0,
      tokensOut: 0,
      turns: 10,
      commitSubject: null,
      completion: null,
      failedCheck: null,
      died: null,
      at: 0,
    });
    // Newest first: 5 recent ships, the 6th (oldest) was the failure.
    const card = toCard(
      aggregate({
        firings: 6,
        shipped: 5,
        flightLog: [
          flight('f6', true),
          flight('f5', true),
          flight('f4', true),
          flight('f3', true),
          flight('f2', true),
          flight('f1', false),
        ],
      }),
    );
    expect(card.shipRate).toBeCloseTo(5 / 6); // lifetime NEVER lies
    expect(card.recentShipRate).toBe(1); // but current form is 100%
  });

  it('recent form is null with no flight log, and counts a fresh failure', () => {
    expect(toCard(aggregate({ flightLog: [] })).recentShipRate).toBeNull();
  });

  it('recent form is the SHIPPED share of the window, not just its size', () => {
    const flight = (id: string, shipped: boolean): FlightEntry => ({
      id,
      item: null,
      kind: null,
      sha: null,
      shipped,
      gateResult: shipped ? 'passed' : 'no-commit',
      cost: 1,
      tokensIn: 0,
      tokensOut: 0,
      turns: 10,
      commitSubject: null,
      completion: null,
      failedCheck: null,
      died: null,
      at: 0,
    });
    const card = toCard(
      aggregate({ flightLog: [flight('f3', true), flight('f2', false), flight('f1', true)] }),
    );
    expect(card.recentShipRate).toBeCloseTo(2 / 3);
  });

  it('carries the live firing snapshot through (null when nothing is in flight)', () => {
    expect(toCard(aggregate({ status: 'registered' })).liveFiring).toBeNull();
    const card = toCard(aggregate({ activity: [act({ firingId: 'p1:firing-9' })] }));
    expect(card.liveFiring?.firingId).toBe('p1:firing-9');
  });
});

describe('activityPhase', () => {
  it('maps reads/searches/listing to ORIENT', () => {
    expect(activityPhase('Read', 'src/index.js', 'file')).toBe('orient');
    expect(activityPhase('Glob', 'src/**/*.ts', 'file')).toBe('orient');
    expect(activityPhase('Grep', 'TODO', 'search')).toBe('orient');
    expect(activityPhase('Bash', 'git log --oneline', 'command')).toBe('orient');
    expect(activityPhase('Bash', 'ls -la', 'command')).toBe('orient');
  });

  it('still requires exactly one+ space in the git orient verbs (git  log, double-spaced)', () => {
    expect(activityPhase('Bash', 'git  log --oneline', 'command')).toBe('orient');
  });

  it('maps writes/edits to DO', () => {
    expect(activityPhase('Write', 'README.md', 'file')).toBe('do');
    expect(activityPhase('Edit', 'src/a.ts', 'file')).toBe('do');
    expect(activityPhase('NotebookEdit', 'notebook.ipynb', 'file')).toBe('do');
    expect(activityPhase('Bash', 'mkdir -p src', 'command')).toBe('do');
  });

  it('maps test/build/typecheck commands to GATE', () => {
    expect(activityPhase('Bash', 'pnpm run test', 'command')).toBe('gate');
    expect(activityPhase('Bash', 'tsc -b', 'command')).toBe('gate');
    expect(activityPhase('Bash', 'pytest -q', 'command')).toBe('gate');
  });

  it('maps git commit/add to COMMIT, even double-spaced', () => {
    expect(activityPhase('Bash', 'git add -A && git commit -m x', 'command')).toBe('commit');
    expect(activityPhase('Bash', 'git  commit -m x', 'command')).toBe('commit');
  });

  it('falls back to OTHER for an unrecognized file-kind tool or an unclassified kind', () => {
    expect(activityPhase('MultiEdit', 'src/a.ts', 'file')).toBe('other');
    expect(activityPhase('WebFetch', 'https://example.com', 'other')).toBe('other');
    expect(activityPhase('Read', 'src/a.ts', 'other')).toBe('other');
  });
});

describe('activityFileNodes', () => {
  it('collapses activity into distinct file nodes with a basename and touch count', () => {
    const nodes = activityFileNodes(
      [
        act({ tool: 'Read', target: 'src/cart.ts', phase: 'orient', at: 1 }),
        act({ tool: 'Edit', target: 'src/cart.ts', phase: 'do', at: 3 }),
        act({ tool: 'Write', target: 'src/pay.ts', phase: 'do', at: 2 }),
      ],
      basename,
    );

    expect(nodes).toHaveLength(2);
    const cart = nodes.find((n) => n.path === 'src/cart.ts');
    expect(cart).toMatchObject({ name: 'cart.ts', touches: 2 });
  });

  it('marks each node with the phase + tool of its MOST RECENT touch', () => {
    const [node] = activityFileNodes(
      [
        act({ tool: 'Read', target: 'src/a.ts', phase: 'orient', at: 1 }),
        act({ tool: 'Edit', target: 'src/a.ts', phase: 'do', at: 9 }),
      ],
      basename,
    );
    expect(node).toMatchObject({ phase: 'do', tool: 'Edit', at: 9 });
  });

  it('breaks a same-timestamp tie by keeping the LATER-PROCESSED touch', () => {
    const [node] = activityFileNodes(
      [
        act({ tool: 'Read', target: 'src/a.ts', phase: 'orient', at: 5 }),
        act({ tool: 'Edit', target: 'src/a.ts', phase: 'do', at: 5 }),
      ],
      basename,
    );
    expect(node).toMatchObject({ phase: 'do', tool: 'Edit', at: 5 });
  });

  it('keeps the earlier-processed touch when it has the LATER timestamp (out-of-order events)', () => {
    const [node] = activityFileNodes(
      [
        act({ tool: 'Edit', target: 'src/a.ts', phase: 'do', at: 9 }),
        act({ tool: 'Read', target: 'src/a.ts', phase: 'orient', at: 3 }),
      ],
      basename,
    );
    expect(node).toMatchObject({ phase: 'do', tool: 'Edit', at: 9 });
  });

  it('orders nodes by most-recently-touched first', () => {
    const nodes = activityFileNodes(
      [
        act({ target: 'a.ts', at: 1 }),
        act({ target: 'b.ts', at: 5 }),
        act({ target: 'c.ts', at: 3 }),
      ],
      basename,
    );
    expect(nodes.map((n) => n.name)).toEqual(['b.ts', 'c.ts', 'a.ts']);
  });

  it('ignores non-file activity (commands, searches)', () => {
    const nodes = activityFileNodes(
      [
        act({ tool: 'Bash', target: 'pnpm test', kind: 'command', phase: 'gate', at: 1 }),
        act({ tool: 'Grep', target: 'TODO', kind: 'search', phase: 'orient', at: 2 }),
        act({ tool: 'Read', target: 'src/x.ts', kind: 'file', phase: 'orient', at: 3 }),
      ],
      basename,
    );
    expect(nodes.map((n) => n.name)).toEqual(['x.ts']);
  });

  it('derives a basename from both slash styles and falls back to the raw target', () => {
    const nodes = activityFileNodes(
      [
        act({ target: 'deep/nested/module.ts', at: 1 }),
        act({ target: 'winstyle\\path\\file.tsx', at: 2 }),
        act({ target: 'toplevel.md', at: 3 }),
      ],
      basename,
    );
    expect(nodes.map((n) => n.name)).toEqual(['toplevel.md', 'file.tsx', 'module.ts']);
  });

  it('caps the node count (busy flights stay legible)', () => {
    const many: ActivityEntry[] = [];
    for (let i = 0; i < 20; i += 1) many.push(act({ target: 'f' + i + '.ts', at: i }));
    const nodes = activityFileNodes(many, basename, 6);
    expect(nodes).toHaveLength(6);
    // the newest six survive (at 19..14)
    expect(nodes[0]?.name).toBe('f19.ts');
    expect(nodes[5]?.name).toBe('f14.ts');
  });

  it('returns an empty list for no activity', () => {
    expect(activityFileNodes([], basename)).toEqual([]);
  });
});

describe('firstFailedGateCheck', () => {
  it('returns the label of the first failing check', () => {
    const checks = [
      { label: 'typecheck', pass: true },
      { label: 'test', pass: false },
      { label: 'build', pass: false },
    ];
    expect(firstFailedGateCheck(checks)).toBe('test');
  });

  it('returns null when every check passed', () => {
    const checks = [
      { label: 'typecheck', pass: true },
      { label: 'test', pass: true },
    ];
    expect(firstFailedGateCheck(checks)).toBeNull();
  });

  it('returns null for an empty check list', () => {
    expect(firstFailedGateCheck([])).toBeNull();
  });
});

describe('wasAutoformatRescued', () => {
  it('is true when a label failed then the same label later passed', () => {
    const checks = [
      { label: 'format:check', pass: false },
      { label: 'format:check', pass: true },
    ];
    expect(wasAutoformatRescued(checks)).toBe(true);
  });

  it('is false when nothing failed', () => {
    const checks = [
      { label: 'typecheck', pass: true },
      { label: 'test', pass: true },
    ];
    expect(wasAutoformatRescued(checks)).toBe(false);
  });

  it('is false when a check failed and never recovered', () => {
    const checks = [
      { label: 'typecheck', pass: true },
      { label: 'test', pass: false },
    ];
    expect(wasAutoformatRescued(checks)).toBe(false);
  });

  it('is false when a DIFFERENT label passed, not the one that failed', () => {
    const checks = [
      { label: 'format:check', pass: false },
      { label: 'typecheck', pass: true },
    ];
    expect(wasAutoformatRescued(checks)).toBe(false);
  });

  it('is false for an empty check list', () => {
    expect(wasAutoformatRescued([])).toBe(false);
  });
});

describe('finishedFlightSummaries', () => {
  const task = (over: Partial<TaskEntry> = {}): TaskEntry => ({
    id: 't1',
    title: 'Fix the login',
    body: null,
    status: 'done',
    severity: 'high',
    dimension: 'ux',
    focus: false,
    priority: null,
    source: 'dashboard',
    at: 1,
    cumulativeCostUsd: 0,
    firingCount: 0,
    isRunaway: false,
    ...over,
  });
  const flight = (over: Partial<FlightEntry> = {}): FlightEntry => ({
    id: 'f1',
    item: 't1',
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
    ...over,
  });

  it('resolves the headline and closed task title from the matching DONE task', () => {
    const [summary] = finishedFlightSummaries(
      aggregate({ flightLog: [flight()], tasks: [task()] }),
    );
    expect(summary).toMatchObject({
      id: 'f1',
      headline: 'Fix the login',
      closedTaskTitle: 'Fix the login',
      cost: 0.42,
      sha: 'abc1234',
      at: 5,
    });
  });

  it('carries realCostUsd through when the firing tracked it (cost semantics v3)', () => {
    const [summary] = finishedFlightSummaries(
      aggregate({ flightLog: [flight({ realCostUsd: 0.07 })], tasks: [task()] }),
    );
    expect(summary).toMatchObject({ realCostUsd: 0.07 });
  });

  it('defaults realCostUsd to null when the firing predates cost semantics v3 tracking', () => {
    const [summary] = finishedFlightSummaries(
      aggregate({ flightLog: [flight()], tasks: [task()] }),
    );
    expect(summary).toMatchObject({ realCostUsd: null });
  });

  it('ignores un-shipped flights', () => {
    const summaries = finishedFlightSummaries(
      aggregate({ flightLog: [flight({ shipped: false })], tasks: [task()] }),
    );
    expect(summaries).toEqual([]);
  });

  it('resolves the headline from the task title even when the task is not (yet) done, but withholds the closed badge', () => {
    const [summary] = finishedFlightSummaries(
      aggregate({ flightLog: [flight()], tasks: [task({ status: 'in_progress' })] }),
    );
    expect(summary).toMatchObject({ headline: 'Fix the login', closedTaskTitle: null });
  });

  it('falls back to the real commit subject for a free-pick ship with no matching board task', () => {
    const [summary] = finishedFlightSummaries(
      aggregate({
        flightLog: [
          flight({ item: 'inferred', commitSubject: 'fix: patch the race in the poller' }),
        ],
        tasks: [],
      }),
    );
    expect(summary).toMatchObject({
      headline: 'fix: patch the race in the poller',
      closedTaskTitle: null,
    });
  });

  it('falls back to the kind when there is no item, task, or commit subject to resolve at all', () => {
    const [summary] = finishedFlightSummaries(
      aggregate({ flightLog: [flight({ item: null })], tasks: [] }),
    );
    expect(summary).toMatchObject({ headline: 'fix firing', closedTaskTitle: null });
  });

  it('a slice completion leads with its own commit subject, not the shared task title every sibling slice repeats', () => {
    const [summary] = finishedFlightSummaries(
      aggregate({
        flightLog: [flight({ completion: 'slice', commitSubject: 'refactor: slice 2 of 5' })],
        tasks: [task()],
      }),
    );
    expect(summary).toMatchObject({ headline: 'refactor: slice 2 of 5' });
  });

  it('prefers the task title over a present commit subject when completion is not a slice', () => {
    const [summary] = finishedFlightSummaries(
      aggregate({
        flightLog: [flight({ commitSubject: 'chore: tidy up' })],
        tasks: [task()],
      }),
    );
    expect(summary).toMatchObject({ headline: 'Fix the login' });
  });

  it('falls back to the checkpoint explanation when the gate died mid-unit', () => {
    const [summary] = finishedFlightSummaries(
      aggregate({
        flightLog: [flight({ item: null, gateResult: 'checkpointed' })],
        tasks: [],
      }),
    );
    expect(summary).toMatchObject({
      headline: 'died mid-unit — WIP packed into a checkpoint commit',
    });
  });

  it('falls back to the turn-cap explanation when the firing died at the turn budget', () => {
    const [summary] = finishedFlightSummaries(
      aggregate({
        flightLog: [flight({ item: null, gateResult: null, died: 'turn-cap' })],
        tasks: [],
      }),
    );
    expect(summary).toMatchObject({ headline: 'died at the turn cap — nothing committed' });
  });

  it('falls back to the error explanation when the firing errored mid-flight', () => {
    const [summary] = finishedFlightSummaries(
      aggregate({
        flightLog: [flight({ item: null, gateResult: null, died: 'error' })],
        tasks: [],
      }),
    );
    expect(summary).toMatchObject({ headline: 'errored mid-firing — nothing committed' });
  });

  it('falls back to a bare "firing" when even the kind is missing', () => {
    const [summary] = finishedFlightSummaries(
      aggregate({
        flightLog: [flight({ item: null, gateResult: null, kind: null })],
        tasks: [],
      }),
    );
    expect(summary).toMatchObject({ headline: 'a firing' });
  });

  it('tolerates a missing tasks or flightLog array instead of throwing', () => {
    const malformed = aggregate() as unknown as { tasks?: unknown; flightLog?: unknown };
    delete malformed.tasks;
    delete malformed.flightLog;
    expect(finishedFlightSummaries(malformed as unknown as ProjectAggregate)).toEqual([]);
  });
});

describe('flightHeadlineOf', () => {
  it('falls back past a null taskById instead of throwing when an item id is set but no task map is available', () => {
    const headline = flightHeadlineOf(
      {
        item: 'inferred-item',
        kind: 'fix',
        gateResult: null,
        died: null,
        completion: null,
        commitSubject: null,
      },
      null,
    );
    expect(headline).toBe('inferred-item');
  });
});

describe('liveFiring', () => {
  const task = (over: Partial<TaskEntry> = {}): TaskEntry => ({
    id: 't1',
    title: 'Fix the login',
    body: null,
    status: 'in_progress',
    severity: 'high',
    dimension: 'ux',
    focus: false,
    priority: null,
    source: 'dashboard',
    at: 1,
    cumulativeCostUsd: 0,
    firingCount: 0,
    isRunaway: false,
    ...over,
  });
  const flight = (over: Partial<FlightEntry> = {}): FlightEntry => ({
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
    ...over,
  });

  it('is null when the project is not flying', () => {
    const p = aggregate({
      status: 'registered',
      activity: [act({ firingId: 'p1:firing-3' })],
    });
    expect(liveFiring(p)).toBeNull();
  });

  it('is null with no activity at all', () => {
    expect(liveFiring(aggregate({ activity: [] }))).toBeNull();
  });

  it('is null when the newest activity predates firing_id tagging', () => {
    const p = aggregate({ activity: [act({ firingId: null })] });
    expect(liveFiring(p)).toBeNull();
  });

  it('is null once the firing has landed in the flight log', () => {
    const p = aggregate({
      activity: [act({ firingId: 'p1:firing-2' })],
      flightLog: [flight({ id: 'p1:firing-2' })],
    });
    expect(liveFiring(p)).toBeNull();
  });

  it('reports the in-progress firing — phase, latest action, and focus task', () => {
    const p = aggregate({
      activity: [
        act({
          firingId: 'p1:firing-3',
          tool: 'Bash',
          target: 'pnpm run test',
          kind: 'command',
          phase: 'gate',
          at: 3,
        }),
        act({
          firingId: 'p1:firing-3',
          tool: 'Edit',
          target: 'src/a.ts',
          kind: 'file',
          phase: 'do',
          at: 2,
        }),
        act({
          firingId: 'p1:firing-2',
          tool: 'Read',
          target: 'src/b.ts',
          kind: 'file',
          phase: 'orient',
          at: 1,
        }),
      ],
      flightLog: [flight({ id: 'p1:firing-2' })],
      tasks: [task({ focus: true, title: 'Wire up retries' })],
    });
    expect(liveFiring(p)).toEqual({
      firingId: 'p1:firing-3',
      callsign: 'AP-3 echo',
      phase: 'gate',
      tool: 'Bash',
      target: 'pnpm run test',
      kind: 'command',
      recentActions: 2,
      recentActionsCapped: false,
      turnsSeen: 1,
      startedAt: 2,
      focusTask: 'Wire up retries',
      narrator: 'Running the gate: pnpm run test.',
      subagents: [],
      avgFiringDurationMs: null,
      orientFixation: false,
      model: null,
    });
  });

  it("reports the newest activity's model", () => {
    const p = aggregate({
      activity: [
        act({ firingId: 'p1:firing-3', at: 2, model: 'claude-sonnet-5' }),
        act({ firingId: 'p1:firing-3', at: 1, model: 'claude-haiku-4-5' }),
      ],
    });
    expect(liveFiring(p)?.model).toBe('claude-sonnet-5');
  });

  it('reports a null model when the newest activity predates per-step model tracking', () => {
    const p = aggregate({
      activity: [act({ firingId: 'p1:firing-3' })],
    });
    expect(liveFiring(p)?.model).toBeNull();
  });

  it('marks the count capped when every loaded entry belongs to this firing', () => {
    const p = aggregate({
      activity: [act({ firingId: 'p1:firing-3' }), act({ firingId: 'p1:firing-3' })],
    });
    expect(liveFiring(p)?.recentActionsCapped).toBe(true);
  });

  it('reports no focus task when none is locked', () => {
    const p = aggregate({
      activity: [act({ firingId: 'p1:firing-3' })],
      tasks: [task({ focus: false })],
    });
    expect(liveFiring(p)?.focusTask).toBeNull();
  });

  it('collapses parallel tool calls from one assistant message into one turn', () => {
    const p = aggregate({
      activity: [
        act({ firingId: 'p1:firing-3', at: 4, model: 'sonnet', tokensIn: 500, tokensOut: 40 }),
        act({ firingId: 'p1:firing-3', at: 3, model: 'sonnet', tokensIn: 500, tokensOut: 40 }),
        act({ firingId: 'p1:firing-3', at: 2, model: 'sonnet', tokensIn: 300, tokensOut: 20 }),
        act({ firingId: 'p1:firing-3', at: 1, model: 'sonnet', tokensIn: 300, tokensOut: 20 }),
      ],
    });
    // Two distinct (model, tokensIn, tokensOut, reasoning) tuples, each spanning
    // two consecutive rows — that's two turns, not four tool calls.
    expect(liveFiring(p)?.turnsSeen).toBe(2);
  });

  it("reports startedAt as the oldest activity in this firing's window", () => {
    const p = aggregate({
      activity: [
        act({ firingId: 'p1:firing-3', at: 30 }),
        act({ firingId: 'p1:firing-3', at: 10 }),
      ],
    });
    expect(liveFiring(p)?.startedAt).toBe(10);
  });

  it('surfaces distinct Agent/Task calls in the window as subagents', () => {
    const p = aggregate({
      activity: [
        act({
          firingId: 'p1:firing-3',
          tool: 'Agent',
          target: 'Security review',
          kind: 'other',
          at: 3,
        }),
        act({
          firingId: 'p1:firing-3',
          tool: 'Task',
          target: 'Fix the build',
          kind: 'other',
          at: 2,
        }),
        act({ firingId: 'p1:firing-3', tool: 'Read', target: 'src/a.ts', kind: 'file', at: 1 }),
      ],
    });
    expect(liveFiring(p)?.subagents).toEqual([
      { label: 'Security review' },
      { label: 'Fix the build' },
    ]);
  });

  it('averages the recorded durations of past firings', () => {
    const p = aggregate({
      activity: [act({ firingId: 'p1:firing-4' })],
      flightLog: [
        flight({ id: 'p1:firing-3', durationMs: 100_000 }),
        flight({ id: 'p1:firing-2', durationMs: 200_000 }),
      ],
    });
    expect(liveFiring(p)?.avgFiringDurationMs).toBe(150_000);
  });

  it('ignores past firings with no recorded duration', () => {
    const p = aggregate({
      activity: [act({ firingId: 'p1:firing-4' })],
      flightLog: [
        flight({ id: 'p1:firing-3', durationMs: 100_000 }),
        flight({ id: 'p1:firing-2', durationMs: null }),
      ],
    });
    expect(liveFiring(p)?.avgFiringDurationMs).toBe(100_000);
  });

  it('is null with no duration history at all', () => {
    const p = aggregate({
      activity: [act({ firingId: 'p1:firing-4' })],
      flightLog: [flight({ id: 'p1:firing-3' })],
    });
    expect(liveFiring(p)?.avgFiringDurationMs).toBeNull();
  });

  function orientTurns(count: number, extra: Partial<ActivityEntry> = {}): ActivityEntry[] {
    return Array.from({ length: count }, (_, i) =>
      act({ firingId: 'p1:firing-3', phase: 'orient', tokensIn: i, ...extra }),
    );
  }

  it('flags orientFixation once turnsSeen reaches the threshold with zero DO-phase activity', () => {
    const p = aggregate({ activity: orientTurns(ORIENT_FIXATION_TURN_THRESHOLD) });
    expect(liveFiring(p)?.turnsSeen).toBe(ORIENT_FIXATION_TURN_THRESHOLD);
    expect(liveFiring(p)?.orientFixation).toBe(true);
  });

  it('does not flag orientFixation below the turn threshold', () => {
    const p = aggregate({ activity: orientTurns(ORIENT_FIXATION_TURN_THRESHOLD - 1) });
    expect(liveFiring(p)?.orientFixation).toBe(false);
  });

  it('does not flag orientFixation once a DO-phase activity exists, even past the threshold', () => {
    const activity = orientTurns(ORIENT_FIXATION_TURN_THRESHOLD - 1);
    activity.push(act({ firingId: 'p1:firing-3', phase: 'do', tokensIn: -1 }));
    const p = aggregate({ activity });
    expect(liveFiring(p)?.turnsSeen).toBe(ORIENT_FIXATION_TURN_THRESHOLD);
    expect(liveFiring(p)?.orientFixation).toBe(false);
  });
});

describe('liveFirings (board web-mtbp0t86-rnimyi: fleet cockpit showed 1 pilot for 8 lanes)', () => {
  const flight = (over: Partial<FlightEntry> = {}): FlightEntry => ({
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
    ...over,
  });

  it('is empty when the project is not flying', () => {
    const p = aggregate({
      status: 'registered',
      activity: [act({ firingId: 'p1:firing-3' })],
    });
    expect(liveFirings(p)).toEqual([]);
  });

  it('reports ONE firing exactly as liveFiring does when only one lane is live', () => {
    const p = aggregate({
      activity: [act({ firingId: 'p1:firing-3', at: 2 })],
    });
    expect(liveFirings(p)).toEqual([liveFiring(p)]);
  });

  it('reports EVERY still-live firingId, not just the newest — the multi-worktree-lane collapse this exists to fix', () => {
    const p = aggregate({
      activity: [
        act({ firingId: 'p1:firing-lane-a', tool: 'Bash', target: 'pnpm run test', at: 6 }),
        act({ firingId: 'p1:firing-lane-b', tool: 'Edit', target: 'src/b.ts', at: 5 }),
        act({ firingId: 'p1:firing-lane-a', tool: 'Read', target: 'src/a.ts', at: 4 }),
        act({ firingId: 'p1:firing-lane-c', tool: 'Read', target: 'src/c.ts', at: 3 }),
      ],
      flightLog: [flight({ id: 'p1:firing-landed' })],
    });
    const ids = liveFirings(p).map((f) => f.firingId);
    expect(ids).toEqual(['p1:firing-lane-a', 'p1:firing-lane-b', 'p1:firing-lane-c']);
  });

  it('excludes a firingId that already landed in the flight log even when it still has activity entries', () => {
    const p = aggregate({
      activity: [
        act({ firingId: 'p1:firing-live', at: 3 }),
        act({ firingId: 'p1:firing-landed', at: 2 }),
      ],
      flightLog: [flight({ id: 'p1:firing-landed' })],
    });
    const ids = liveFirings(p).map((f) => f.firingId);
    expect(ids).toEqual(['p1:firing-live']);
  });

  it('excludes activity entries that predate firing_id tagging', () => {
    const p = aggregate({
      activity: [act({ firingId: null, at: 3 }), act({ firingId: 'p1:firing-live', at: 2 })],
    });
    const ids = liveFirings(p).map((f) => f.firingId);
    expect(ids).toEqual(['p1:firing-live']);
  });

  it('is empty with no activity at all', () => {
    expect(liveFirings(aggregate({ activity: [] }))).toEqual([]);
  });

  it('never touches tasks/flightLog-derived reads when no activity entry actually has a firingId', () => {
    // A flying project whose activity predates firing_id tagging (real
    // pre-epoch data, and the shape several axe-a11y test fixtures use) —
    // liveFirings must short-circuit to [] the same way liveFiring does,
    // without ever reaching `p.tasks.find(...)`. Omitting `tasks` entirely
    // (a raw object, not the `aggregate()` helper, which always supplies a
    // real array) is the only way to prove that: a bug that unconditionally
    // read `p.tasks` here previously threw `Cannot read properties of
    // undefined (reading 'find')` and silently aborted the client render
    // mid-script for any such project — caught by the full a11y suite.
    const p = {
      status: 'flying',
      activity: [act({ firingId: null, at: 1 })],
      flightLog: [],
    } as unknown as ProjectAggregate;
    expect(() => liveFirings(p)).not.toThrow();
    expect(liveFirings(p)).toEqual([]);
  });
});

describe('firingCallsign', () => {
  it('is deterministic for the same firing id', () => {
    expect(firingCallsign('p1:firing-3')).toBe(firingCallsign('p1:firing-3'));
  });

  it('embeds the firing number and a stable word', () => {
    expect(firingCallsign('p1:firing-3')).toBe('AP-3 echo');
    expect(firingCallsign('p1:firing-9')).toBe('AP-9 pulse');
  });

  it('differs across firings that only differ by number', () => {
    expect(firingCallsign('proj:firing-1')).not.toBe(firingCallsign('proj:firing-2'));
  });

  it('falls back to AP-0 when the id carries no firing number', () => {
    expect(firingCallsign('unattributed')).toMatch(/^AP-0 /);
  });

  it('keeps a multi-digit firing number intact rather than truncating to one digit', () => {
    expect(firingCallsign('p1:firing-42')).toBe('AP-42 drift');
  });

  it('reaches every word in CALLSIGN_WORDS across enough distinct ids', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['p1:firing-0', 'AP-0 raven'],
      ['p1:firing-1', 'AP-1 onyx'],
      ['p1:firing-2', 'AP-2 zephyr'],
      ['p1:firing-3', 'AP-3 echo'],
      ['p1:firing-4', 'AP-4 flux'],
      ['p1:firing-5', 'AP-5 cipher'],
      ['p1:firing-6', 'AP-6 halo'],
      ['p1:firing-7', 'AP-7 vertex'],
      ['p1:firing-8', 'AP-8 drift'],
      ['p1:firing-9', 'AP-9 pulse'],
      ['p1:firing-10', 'AP-10 cobalt'],
      ['p1:firing-11', 'AP-11 grit'],
      ['p1:firing-12', 'AP-12 signal'],
      ['p1:firing-13', 'AP-13 tide'],
      ['p1:firing-14', 'AP-14 nova'],
      ['p1:firing-15', 'AP-15 ember'],
      ['p1:firing-16', 'AP-16 quartz'],
      ['p1:firing-26', 'AP-26 talon'],
      ['p1:firing-27', 'AP-27 shard'],
      ['p1:firing-28', 'AP-28 lumen'],
    ];
    for (const [id, expected] of cases) {
      expect(firingCallsign(id)).toBe(expected);
    }
  });
});

describe('liveSubagents', () => {
  it('is empty when no Agent/Task tool calls are present', () => {
    expect(liveSubagents([act({ tool: 'Read', target: 'src/a.ts', kind: 'file' })])).toEqual([]);
  });

  it('dedupes repeated subagent labels, keeping the newest occurrence order', () => {
    const rows = [
      act({ tool: 'Agent', target: 'Security review', kind: 'other', at: 3 }),
      act({ tool: 'Agent', target: 'Security review', kind: 'other', at: 2 }),
      act({ tool: 'Task', target: 'Fix the build', kind: 'other', at: 1 }),
    ];
    expect(liveSubagents(rows)).toEqual([{ label: 'Security review' }, { label: 'Fix the build' }]);
  });

  it('caps at 4 distinct subagents', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((label) =>
      act({ tool: 'Agent', target: label, kind: 'other' }),
    );
    expect(liveSubagents(rows)).toHaveLength(4);
  });

  it('falls back to the tool name when no target/description is present', () => {
    expect(liveSubagents([act({ tool: 'Task', target: '', kind: 'other' })])).toEqual([
      { label: 'Task' },
    ]);
  });
});

describe('countTurns', () => {
  it('is zero for no activity', () => {
    expect(countTurns([])).toBe(0);
  });

  it('counts one turn for a single row', () => {
    expect(countTurns([act({ model: 'sonnet', tokensIn: 500, tokensOut: 40 })])).toBe(1);
  });

  it('collapses consecutive rows sharing model/tokensIn/tokensOut/reasoning into one turn', () => {
    const rows = [
      act({ tool: 'Bash', model: 'sonnet', tokensIn: 500, tokensOut: 40 }),
      act({ tool: 'Read', target: 'src/a.ts', model: 'sonnet', tokensIn: 500, tokensOut: 40 }),
    ];
    expect(countTurns(rows)).toBe(1);
  });

  it('starts a new turn when the tuple changes', () => {
    const rows = [
      act({ model: 'sonnet', tokensIn: 700, tokensOut: 60 }),
      act({ model: 'sonnet', tokensIn: 500, tokensOut: 40 }),
      act({ tool: 'Read', target: 'src/a.ts', model: 'sonnet', tokensIn: 500, tokensOut: 40 }),
    ];
    expect(countTurns(rows)).toBe(2);
  });

  it('counts every row as its own turn when each tuple is distinct', () => {
    const rows = [
      act({ model: 'sonnet', tokensIn: 100, tokensOut: 10 }),
      act({ model: 'sonnet', tokensIn: 200, tokensOut: 20 }),
      act({ model: 'haiku', tokensIn: 200, tokensOut: 20 }),
    ];
    expect(countTurns(rows)).toBe(3);
  });

  it('collapses rows with no captured telemetry into one turn (the honest undercount)', () => {
    const rows = [act({}), act({ tool: 'Read', target: 'src/a.ts' }), act({ tool: 'Edit' })];
    expect(countTurns(rows)).toBe(1);
  });

  it('treats a differing reasoning field as a distinct turn even when model/tokens match', () => {
    const rows = [
      act({ model: 'sonnet', tokensIn: 500, tokensOut: 40, reasoning: 'first' }),
      act({ model: 'sonnet', tokensIn: 500, tokensOut: 40, reasoning: 'second' }),
    ];
    expect(countTurns(rows)).toBe(2);
  });

  it('treats an absent model the same as an explicit empty string (both normalize to the same key)', () => {
    const rows = [
      act({ tokensIn: 500, tokensOut: 40, reasoning: 'r' }),
      act({ model: '', tokensIn: 500, tokensOut: 40, reasoning: 'r' }),
    ];
    expect(countTurns(rows)).toBe(1);
  });

  it('treats absent reasoning the same as an explicit empty string (both normalize to the same key)', () => {
    const rows = [
      act({ model: 'sonnet', tokensIn: 500, tokensOut: 40 }),
      act({ model: 'sonnet', tokensIn: 500, tokensOut: 40, reasoning: '' }),
    ];
    expect(countTurns(rows)).toBe(1);
  });

  it('starts a new turn for a genuinely different tokensIn value, not just any truthy one', () => {
    const rows = [
      act({ model: 'sonnet', tokensIn: 500, tokensOut: 40, reasoning: 'r' }),
      act({ model: 'sonnet', tokensIn: 700, tokensOut: 40, reasoning: 'r' }),
    ];
    expect(countTurns(rows)).toBe(2);
  });

  it('starts a new turn for a genuinely different tokensOut value, not just any truthy one', () => {
    const rows = [
      act({ model: 'sonnet', tokensIn: 500, tokensOut: 40, reasoning: 'r' }),
      act({ model: 'sonnet', tokensIn: 500, tokensOut: 60, reasoning: 'r' }),
    ];
    expect(countTurns(rows)).toBe(2);
  });
});

describe('narratorLine', () => {
  it('says nothing has been captured yet for an empty window', () => {
    expect(narratorLine([])).toBe('Getting oriented — no activity captured yet.');
  });

  it('narrates a read as "Reading <basename>"', () => {
    expect(narratorLine([act({ tool: 'Read', target: 'src/deep/a.ts', kind: 'file' })])).toBe(
      'Reading a.ts.',
    );
  });

  it('narrates a write/edit as "Editing <basename>"', () => {
    expect(narratorLine([act({ tool: 'Edit', target: 'src/a.ts', kind: 'file' })])).toBe(
      'Editing a.ts.',
    );
  });

  it('narrates a search with the query, quoted', () => {
    expect(narratorLine([act({ tool: 'Grep', target: 'TODO', kind: 'search' })])).toBe(
      'Searching for "TODO".',
    );
  });

  it('narrates a gate-phase command as "Running the gate"', () => {
    expect(
      narratorLine([
        act({ tool: 'Bash', target: 'pnpm run test', kind: 'command', phase: 'gate' }),
      ]),
    ).toBe('Running the gate: pnpm run test.');
  });

  it('narrates a commit-phase command as "Committing"', () => {
    expect(
      narratorLine([
        act({ tool: 'Bash', target: 'git commit -m x', kind: 'command', phase: 'commit' }),
      ]),
    ).toBe('Committing: git commit -m x.');
  });

  it('narrates an orient-phase command as "Looking around"', () => {
    expect(
      narratorLine([
        act({ tool: 'Bash', target: 'git log --oneline', kind: 'command', phase: 'orient' }),
      ]),
    ).toBe('Looking around: git log --oneline.');
  });

  it('narrates an unclassified command tool use generically', () => {
    expect(
      narratorLine([act({ tool: 'Bash', target: 'rm -rf dist', kind: 'command', phase: 'do' })]),
    ).toBe('Running: rm -rf dist.');
  });

  it('narrates a tool with no target by its own kind', () => {
    expect(narratorLine([act({ tool: 'Task', target: '', kind: 'other' })])).toBe('Using Task.');
  });

  it('collapses a run of same-kind actions into one sentence with a streak count', () => {
    const acts = [
      act({ tool: 'Edit', target: 'c.ts', kind: 'file', at: 3 }),
      act({ tool: 'Edit', target: 'b.ts', kind: 'file', at: 2 }),
      act({ tool: 'Edit', target: 'a.ts', kind: 'file', at: 1 }),
    ];
    expect(narratorLine(acts)).toBe('Editing c.ts (3 in a row).');
  });

  it('breaks the streak at the first differently-kinded action', () => {
    const acts = [
      act({ tool: 'Edit', target: 'b.ts', kind: 'file', at: 2 }),
      act({ tool: 'Read', target: 'a.ts', kind: 'file', at: 1 }),
    ];
    expect(narratorLine(acts)).toBe('Editing b.ts.');
  });

  it('truncates a long command target instead of overflowing the sentence', () => {
    const long = 'pnpm run ' + 'x'.repeat(80);
    const line = narratorLine([act({ tool: 'Bash', target: long, kind: 'command', phase: 'do' })]);
    expect(line.length).toBeLessThan(long.length);
    expect(line).toContain('…');
  });

  it('does not truncate a target exactly at the 60-char cap', () => {
    const target = 'x'.repeat(60);
    const line = narratorLine([act({ tool: 'Bash', target, kind: 'command', phase: 'do' })]);
    expect(line).toBe(`Running: ${target}.`);
  });

  it('truncates a target one character past the cap to exactly 59 chars plus an ellipsis', () => {
    const target = 'x'.repeat(61);
    const line = narratorLine([act({ tool: 'Bash', target, kind: 'command', phase: 'do' })]);
    expect(line).toBe(`Running: ${'x'.repeat(59)}….`);
  });

  it('classifies a Write tool call on a file as an edit narration', () => {
    expect(narratorLine([act({ tool: 'Write', target: 'src/new.ts', kind: 'file' })])).toBe(
      'Editing new.ts.',
    );
  });

  it('classifies a NotebookEdit tool call on a file as an edit narration', () => {
    expect(
      narratorLine([act({ tool: 'NotebookEdit', target: 'notebook.ipynb', kind: 'file' })]),
    ).toBe('Editing notebook.ipynb.');
  });

  it('falls back to the raw target when it has no basename segment (trailing slash)', () => {
    expect(narratorLine([act({ tool: 'Edit', target: 'src/dir/', kind: 'file' })])).toBe(
      'Editing src/dir/.',
    );
  });

  it('narrates an edit with no target using the generic file phrase', () => {
    expect(narratorLine([act({ tool: 'Edit', target: '', kind: 'file' })])).toBe('Editing a file.');
  });

  it('narrates a read with no target using the generic file phrase', () => {
    expect(narratorLine([act({ tool: 'Read', target: '', kind: 'file' })])).toBe('Reading a file.');
  });

  it('narrates a search with no target using the generic search phrase', () => {
    expect(narratorLine([act({ tool: 'Grep', target: '', kind: 'search' })])).toBe(
      'Searching the codebase.',
    );
  });

  it('narrates a gate-phase command with no target using the generic gate phrase', () => {
    expect(narratorLine([act({ tool: 'Bash', target: '', kind: 'command', phase: 'gate' })])).toBe(
      'Running the gate.',
    );
  });

  it('narrates a commit-phase command with no target using the generic commit phrase', () => {
    expect(
      narratorLine([act({ tool: 'Bash', target: '', kind: 'command', phase: 'commit' })]),
    ).toBe('Committing the change.');
  });

  it('narrates an orient-phase command with no target using the generic orient phrase', () => {
    expect(
      narratorLine([act({ tool: 'Bash', target: '', kind: 'command', phase: 'orient' })]),
    ).toBe('Looking around the repo.');
  });

  it('narrates an unclassified command with no target by its tool name alone', () => {
    expect(narratorLine([act({ tool: 'Bash', target: '', kind: 'command', phase: 'do' })])).toBe(
      'Running Bash.',
    );
  });

  it('narrates an unclassified tool with a target generically, including the raw target', () => {
    expect(narratorLine([act({ tool: 'Task', target: 'security audit', kind: 'other' })])).toBe(
      'Using Task on security audit.',
    );
  });
});

describe('buildFleetView', () => {
  it('marks an empty fleet and stamps the generated time', () => {
    const view = buildFleetView(1234, []);
    expect(view.empty).toBe(true);
    expect(view.generatedAt).toBe(1234);
    expect(view.totals.projects).toBe(0);
    expect(view.projects).toEqual([]);
  });

  it('aggregates totals across projects', () => {
    const view = buildFleetView(1, [
      aggregate({ id: 'p1', status: 'flying', firings: 4, shipped: 3 }),
      aggregate({ id: 'p2', status: 'needs_you', firings: 2, shipped: 1 }),
      aggregate({
        id: 'p3',
        status: 'paused',
        firings: 0,
        shipped: 0,
        gauge: { critical: 0, high: 0, medium: 0, low: 0 },
      }),
    ]);
    expect(view.empty).toBe(false);
    expect(view.totals.projects).toBe(3);
    expect(view.totals.flying).toBe(1);
    expect(view.totals.needsYou).toBe(1);
    expect(view.totals.firings).toBe(6);
    expect(view.totals.shipped).toBe(4);
    expect(view.totals.cost).toBeCloseTo(4.5); // 1.5 × 3 projects
    // openFindings: p1(4) + p2(4) + p3(0)
    expect(view.totals.openFindings).toBe(8);
    expect(view.totals.costPerShipped).toBeCloseTo(4.5 / 4);
    expect(view.totals.shipRate).toBeCloseTo(4 / 6);
    expect(view.totals.avgTurns).toBeCloseTo(60 / 6); // turns: 20 × 3 projects
    expect(view.totals.cacheReadShare).toBeCloseTo(1200 / 4500); // cacheRead 1200 of 4500 processed
    expect(view.totals.currentStreak).toBe(0); // no flight log entries in the fixture
    expect(view.totals.realCost).toBeNull(); // cost semantics v3: no fixture project carries it
  });

  it('sums realCost (cost semantics v3) across only the projects that carry it', () => {
    const view = buildFleetView(1, [
      aggregate({ id: 'p1', realCost: 0.4 }),
      aggregate({ id: 'p2', realCost: 0.6 }),
      // Unconfigured/pre-existing project — contributes to `cost` but not `realCost`.
      aggregate({ id: 'p3', realCost: null }),
    ]);
    expect(view.totals.realCost).toBeCloseTo(1);
  });

  it('reports null rate/average totals (not 0) with no firings anywhere', () => {
    const view = buildFleetView(1, [
      aggregate({
        firings: 0,
        shipped: 0,
        cost: 0,
        tokensIn: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        turns: 0,
      }),
    ]);
    expect(view.totals.costPerShipped).toBeNull();
    expect(view.totals.shipRate).toBeNull();
    expect(view.totals.avgTurns).toBeNull();
    expect(view.totals.cacheReadShare).toBeNull();
  });
});

describe('fleetStreak', () => {
  const flight = (id: string, shipped: boolean, at: number): FlightEntry => ({
    id,
    item: null,
    kind: null,
    sha: null,
    shipped,
    gateResult: shipped ? 'passed' : 'no-commit',
    cost: 1,
    tokensIn: 0,
    tokensOut: 0,
    turns: 1,
    commitSubject: null,
    completion: null,
    failedCheck: null,
    died: null,
    at,
  });

  it('is 0 with no flight log entries anywhere', () => {
    expect(fleetStreak([aggregate({ flightLog: [] })])).toBe(0);
  });

  it('counts consecutive shipped firings, newest first, breaking at the first non-ship', () => {
    const projects = [
      aggregate({ id: 'p1', flightLog: [flight('f3', true, 30), flight('f1', true, 10)] }),
      aggregate({ id: 'p2', flightLog: [flight('f2', false, 20)] }),
    ];
    // Merged by `at` descending: f3(ship) -> f2(no-ship) -> f1(ship, unreachable).
    expect(fleetStreak(projects)).toBe(1);
  });

  it('interleaves multiple projects by time — an unbroken run across projects counts fully', () => {
    const projects = [
      aggregate({ id: 'p1', flightLog: [flight('f3', true, 30), flight('f1', true, 10)] }),
      aggregate({ id: 'p2', flightLog: [flight('f2', true, 20)] }),
    ];
    expect(fleetStreak(projects)).toBe(3);
  });
});

describe('fleetChronoLog', () => {
  const flight = (id: string, at: number): FlightEntry => ({
    id,
    item: null,
    kind: null,
    sha: null,
    shipped: true,
    gateResult: 'passed',
    cost: 1,
    tokensIn: 0,
    tokensOut: 0,
    turns: 1,
    commitSubject: null,
    completion: null,
    failedCheck: null,
    died: null,
    at,
  });

  it('is empty with no flight log entries anywhere', () => {
    expect(fleetChronoLog([aggregate({ flightLog: [] })])).toEqual([]);
  });

  it('merges every project by time, oldest first (the reverse of the newest-first flight log)', () => {
    const projects = [
      aggregate({ id: 'p1', flightLog: [flight('f3', 30), flight('f1', 10)] }),
      aggregate({ id: 'p2', flightLog: [flight('f2', 20)] }),
    ];
    expect(fleetChronoLog(projects).map((f) => f.id)).toEqual(['f1', 'f2', 'f3']);
  });

  it('caps to the window, keeping the most recent firings', () => {
    const flights = [flight('f1', 10), flight('f2', 20), flight('f3', 30), flight('f4', 40)];
    const projects = [aggregate({ flightLog: flights })];
    expect(fleetChronoLog(projects, 2).map((f) => f.id)).toEqual(['f3', 'f4']);
  });
});

describe('buildFleetView recentFirings', () => {
  const flight = (id: string, at: number): FlightEntry => ({
    id,
    item: null,
    kind: null,
    sha: null,
    shipped: true,
    gateResult: 'passed',
    cost: 1,
    tokensIn: 0,
    tokensOut: 0,
    turns: 1,
    commitSubject: null,
    completion: null,
    failedCheck: null,
    died: null,
    at,
  });

  it('exposes the fleet-wide chronological series the stat-tile sparks read', () => {
    const projects = [aggregate({ id: 'p1', flightLog: [flight('f2', 20), flight('f1', 10)] })];
    const view = buildFleetView(0, projects);
    expect(view.recentFirings.map((f) => f.id)).toEqual(['f1', 'f2']);
  });
});
