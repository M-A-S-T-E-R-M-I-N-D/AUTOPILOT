// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE FLEET REPORT (2026-09-25): every round is judged the same way — what
 * the firings worked on, how they ended, what a ship cost, and what the
 * convergence gate really said.
 */
import { describe, it, expect } from 'vitest';
import {
  taskClass,
  firingOutcome,
  laneOf,
  summarizeFirings,
  summarizeConvergence,
  summarizeEscalations,
  renderFleetReport,
  type ReportFiring,
} from '../../src/read/fleet-report.js';

const base: ReportFiring = {
  firingId: 'fly-autopilot:firing-1',
  title: 'a task',
  subject: 'feat(x): a thing',
  shipped: true,
  died: null,
  noopClass: null,
  gateResult: 'passed',
  costUsd: 2,
  durationMs: 10 * 60_000,
  model: 'claude-sonnet-5',
  engine: 'claude',
};

describe('taskClass', () => {
  it('reads product work, tests, docs and chores off the commit subject', () => {
    expect(taskClass('t', 'feat(pool): x')).toBe('product');
    expect(taskClass('t', 'fix: x')).toBe('product');
    expect(taskClass('t', 'perf(ci): x')).toBe('product');
    expect(taskClass('t', 'refactor!: x')).toBe('product');
    expect(taskClass('t', 'test(e2e): x')).toBe('test');
    expect(taskClass('t', 'docs: x')).toBe('docs');
    expect(taskClass('t', 'chore(deps): x')).toBe('chore');
  });

  it('reads the board title first for verdicts, meta checks and convergence reds', () => {
    expect(taskClass('VERDICT blocked web-a-1: x', null)).toBe('verdict');
    expect(taskClass('t', 'docs: reconfirm x (VERDICT ap-1-2)')).toBe('verdict');
    expect(taskClass('VERIFY-BY 2026-10-01: x', 'docs: x')).toBe('meta-check');
    expect(taskClass('DOC-FRESHNESS: x', 'docs: x')).toBe('meta-check');
    expect(taskClass('CONVERGENCE RED: pnpm run test fails', 'fix: x')).toBe('convergence-red');
  });

  it('says so when nothing was committed', () => {
    expect(taskClass('t', null)).toBe('no commit');
    expect(taskClass(null, '')).toBe('no commit');
  });
});

describe('firingOutcome and laneOf', () => {
  it('names the ending, death first', () => {
    expect(firingOutcome(base)).toBe('shipped');
    expect(firingOutcome({ ...base, shipped: false, died: 'timeout' })).toBe('died (timeout)');
    expect(firingOutcome({ ...base, shipped: false, noopClass: 'silent' })).toBe(
      'no commit (silent)',
    );
    expect(firingOutcome({ ...base, shipped: false, gateResult: 'reverted' })).toBe(
      'not shipped (reverted)',
    );
    expect(firingOutcome({ ...base, shipped: false, gateResult: null })).toBe(
      'not shipped (unknown)',
    );
  });

  it('reads the lane off the firing id', () => {
    expect(laneOf('fly-autopilot:firing-9')).toBe('base');
    expect(laneOf('fly-autopilot--fleet-3:firing-9')).toBe('fleet-3');
  });
});

describe('summarizeFirings', () => {
  it('counts, costs and takes the median duration', () => {
    const s = summarizeFirings([
      base,
      { ...base, shipped: false, costUsd: 1, durationMs: 2 * 60_000 },
      { ...base, costUsd: 3, durationMs: 30 * 60_000 },
    ]);
    expect(s).toEqual({
      firings: 3,
      shipped: 2,
      reverted: 0,
      died: 0,
      costUsd: 6,
      unpriced: 0,
      costPerShipUsd: 3,
      medianMinutes: 10,
    });
  });

  // Epic 0036: a Codex or Gemini run reports no priced figure, and its
  // record says `costUsd: null` — the metrics column stores that as 0, so a
  // report summing it priced every such ship at $0.00.
  it('leaves an unpriced firing out of the cost and the cost per ship, and counts it', () => {
    const s = summarizeFirings([
      base,
      { ...base, costUsd: null },
      { ...base, shipped: false, costUsd: 1 },
      { ...base, shipped: false, died: 'timeout', costUsd: null },
    ]);
    expect(s).toMatchObject({ firings: 4, shipped: 2, costUsd: 3, unpriced: 2 });
    expect(s.costPerShipUsd).toBe(3);
  });

  it('has no cost per ship when no priced firing shipped', () => {
    const codex = { ...base, costUsd: null };
    expect(summarizeFirings([codex, codex])).toMatchObject({
      costUsd: 0,
      unpriced: 2,
      costPerShipUsd: null,
    });
    expect(
      summarizeFirings([codex, { ...base, shipped: false, costUsd: 4 }]).costPerShipUsd,
    ).toBeNull();
  });

  it('counts the firings the gate reverted, and no other ending', () => {
    const s = summarizeFirings([
      base,
      { ...base, shipped: false, gateResult: 'reverted' },
      { ...base, shipped: false, gateResult: 'reverted', costUsd: null },
      { ...base, shipped: false, gateResult: 'unverifiable' },
      { ...base, shipped: false, gateResult: 'no-commit', noopClass: 'silent' },
    ]);
    expect(s).toMatchObject({ firings: 5, shipped: 1, reverted: 2, died: 0 });
  });

  it('has no cost per ship when nothing shipped, and a median of an even count', () => {
    const s = summarizeFirings([
      { ...base, shipped: false, died: 'error', durationMs: 60_000 },
      { ...base, shipped: false, durationMs: 3 * 60_000 },
    ]);
    expect(s.costPerShipUsd).toBeNull();
    expect(s.died).toBe(1);
    expect(s.medianMinutes).toBe(2);
    expect(summarizeFirings([]).medianMinutes).toBe(0);
  });
});

describe('summarizeConvergence', () => {
  it("tells a lane's own red, a merge red and no verdict apart", () => {
    const c = summarizeConvergence([
      { verdict: 'green', check: null, merge: 'fast-forwarded x', queuedMs: 10_000 },
      { verdict: 'red', check: 'pnpm run ci:doc-commit-refs', merge: 'fast-forwarded x' },
      { verdict: 'red', check: 'pnpm run ci:doc-commit-refs', merge: 'fast-forwarded y' },
      { verdict: 'red', check: 'pnpm run test', merge: 'chore: sync lane', queuedMs: 30_000 },
      { verdict: 'red', check: 'pnpm run test (crashed, no verdict)', merge: 'fast-forwarded z' },
      { verdict: 'red', check: 'lane fast-forward (merged head not gated)', merge: 'x' },
      { verdict: 'red', check: null, merge: null },
    ]);
    expect(c).toEqual({
      green: 1,
      redOwnCommit: 2,
      redMerge: 1,
      unjudged: 3,
      failingChecks: [
        ['pnpm run ci:doc-commit-refs', 2],
        ['pnpm run test', 1],
      ],
      medianQueuedSeconds: 20,
    });
  });

  it('has no queue figure when no verdict recorded one', () => {
    expect(summarizeConvergence([]).medianQueuedSeconds).toBeNull();
  });
});

describe('renderFleetReport', () => {
  it('prints every section, with the convergence split and the queue wait', () => {
    const lines = renderFleetReport(
      [base, { ...base, firingId: 'fly-autopilot--fleet-2:firing-2', subject: 'docs: x' }],
      [
        { verdict: 'red', check: 'pnpm run ci:x', merge: 'fast-forwarded a', queuedMs: 4_000 },
        { verdict: 'green', check: null, merge: 'fast-forwarded b' },
      ],
      'last 7 days',
    );
    const text = lines.join('\n');
    expect(lines[0]).toBe('fleet report — last 7 days');
    expect(text).toContain('by what it worked on');
    expect(text).toContain('by outcome');
    expect(text).toContain('by lane');
    expect(text).toContain('by model');
    expect(text).toContain('by model and work');
    expect(text).toContain('claude-sonnet-5 · product');
    expect(text).toContain('fleet-2');
    expect(text).toContain("green 1  red on a lane's own commit 1  red on a merge 0  no verdict 0");
    expect(text).toContain('  1× pnpm run ci:x');
    expect(text).toContain('median wait for a gate slot: 4s');
    expect(lines[1]).toContain('shipped 100%');
    expect(lines[1]).toContain('per ship   $2.00');
  });

  // 2026-09-30 round: "claude-opus-5-5 · meta-check" is 28 characters, so a
  // fixed 18-wide label column pushed each row's numbers a different distance.
  it('widens a section to its longest label, so every row of it lines up', () => {
    const opus = { ...base, model: 'claude-opus-5-5' };
    const lines = renderFleetReport(
      [
        opus,
        { ...opus, title: 'DOC-FRESHNESS: x', subject: 'docs: x' },
        { ...opus, subject: 'chore: x' },
      ],
      [],
      'w',
    );
    const start = lines.indexOf('by model and work');
    const block = lines.slice(start + 1, lines.indexOf('', start));
    expect(block).toHaveLength(3);
    const columns = new Set(block.map((l) => l.indexOf(' firings')));
    expect(columns.size).toBe(1);
    expect(block[0]).toMatch(/^ {2}claude-opus-5-5 · \S+ +1 firings/);
    // A section whose labels fit keeps the usual 18-wide column.
    expect(lines[1]).toBe(
      `  ${'all'.padEnd(18)}    3 firings  shipped 100%  reverted   0%  died   0%  $   6.00  per ship   $2.00  median 10.0 min`,
    );
  });
});

describe('renderFleetReport unpriced firings (epic 0036)', () => {
  const codex: ReportFiring = {
    ...base,
    firingId: 'fly-autopilot--fleet-2:firing-2',
    costUsd: null,
    model: 'gpt-5-codex',
  };

  it('prints a lane whose engine reports no price as unpriced, never as $0.00', () => {
    const lines = renderFleetReport([base, codex, codex], [], 'w');
    const row = lines.find((l) => l.startsWith('  gpt-5-codex '));
    expect(row).toBe(
      `  ${'gpt-5-codex'.padEnd(18)}    2 firings  shipped 100%  reverted   0%  died   0%         -  per ship       -  median 10.0 min  unpriced 2`,
    );
    expect(lines.join('\n')).not.toMatch(/gpt-5-codex .*\$0\.00/);
  });

  it('prices a mixed group by its priced firings alone, and says how many it left out', () => {
    const lines = renderFleetReport([base, codex, codex], [], 'w');
    expect(lines[1]).toBe(
      `  ${'all'.padEnd(18)}    3 firings  shipped 100%  reverted   0%  died   0%  $   2.00  per ship   $2.00  median 10.0 min  unpriced 2`,
    );
    const claude = lines.find((l) => l.startsWith('  claude-sonnet-5 '));
    expect(claude).not.toContain('unpriced');
  });
});

// Epic 0036 (GitHub #21's per-provider quality telemetry): a fleet whose
// lanes fly different CLIs is judged engine by engine, on the same rows.
describe('renderFleetReport by engine (epic 0036)', () => {
  const codex: ReportFiring = {
    ...base,
    firingId: 'fly-autopilot--fleet-2:firing-2',
    shipped: false,
    gateResult: 'reverted',
    costUsd: null,
    model: 'gpt-5-codex',
    engine: 'codex',
  };

  it('groups the firings by the engine they flew on, after the lanes and before the models', () => {
    const lines = renderFleetReport([base, base, codex], [], 'w');
    const start = lines.indexOf('by engine');
    expect(start).toBeGreaterThan(lines.indexOf('by lane'));
    expect(start).toBeLessThan(lines.indexOf('by model'));
    expect(lines.slice(start + 1, lines.indexOf('', start))).toEqual([
      `  ${'claude'.padEnd(18)}    2 firings  shipped 100%  reverted   0%  died   0%  $   4.00  per ship   $2.00  median 10.0 min`,
      `  ${'codex'.padEnd(18)}    1 firings  shipped   0%  reverted 100%  died   0%         -  per ship       -  median 10.0 min  unpriced 1`,
    ]);
  });

  // A non-Claude lane is demoted after two reverted firings in a row
  // (`demoteAfterGateFailures`), so the engine section reads its revert rate
  // beside its ship rate, not only the outcome section's round-wide count.
  it("names each engine's revert rate beside its ship rate", () => {
    const lines = renderFleetReport([base, codex, { ...codex, gateResult: 'no-commit' }], [], 'w');
    const start = lines.indexOf('by engine');
    const block = lines.slice(start + 1, lines.indexOf('', start));
    expect(block.find((l) => l.startsWith('  codex '))).toMatch(
      /shipped {3}0% {2}reverted {2}50% {2}died {3}0%/,
    );
    expect(block.find((l) => l.startsWith('  claude '))).toMatch(
      /shipped 100% {2}reverted {3}0% {2}died {3}0%/,
    );
  });

  it('names a firing recorded before the engine was an unrecorded one, never a guessed engine', () => {
    const text = renderFleetReport([{ ...base, engine: null }], [], 'w').join('\n');
    expect(text).toMatch(/^by engine\n {2}unrecorded +1 firings/m);
  });

  it('leaves out a firing the account quota killed, as the model sections do', () => {
    const quota = { ...base, shipped: false, died: 'quota', costUsd: 0 };
    const text = renderFleetReport([base, quota], [], 'w').join('\n');
    expect(text).toMatch(/^by engine\n {2}claude +1 firings {2}shipped 100%/m);
    expect(text).toContain('  left out: 1 firing the account quota killed\n\nby model\n');
  });
});

describe('renderFleetReport quota deaths (2026-09-29, round 37)', () => {
  const quota: ReportFiring = { ...base, shipped: false, died: 'quota', costUsd: 0, model: 'opus' };

  it('counts them in the round, but leaves them out of the model sections and says how many', () => {
    const text = renderFleetReport(
      [base, quota, { ...quota, firingId: 'fly-autopilot--fleet-2:firing-3' }],
      [],
      'w',
    ).join('\n');
    expect(text).toMatch(/^ {2}all +3 firings/m);
    expect(text).toMatch(/^ {2}died \(quota\) +2 firings/m);
    expect(text).toMatch(/^by model\n {2}claude-sonnet-5 +1 firings {2}shipped 100%/m);
    expect(text).not.toMatch(/^ {2}opus/m);
    expect(text).toContain('  left out: 2 firings the account quota killed\n\nby model and work');
    expect(text).toContain(
      '  left out: 2 firings the account quota killed\n\nconvergence after sync-back',
    );
  });

  it('prints no note when the quota killed none, and says it of one firing in the singular', () => {
    expect(renderFleetReport([base], [], 'w').join('\n')).not.toContain('left out');
    expect(renderFleetReport([quota], [], 'w').join('\n')).toContain(
      'by model\n  left out: 1 firing the account quota killed\n',
    );
  });
});

describe('renderFleetReport parked lanes (2026-09-25)', () => {
  it('lists lanes whose commits never reached the flight branch, and says none otherwise', () => {
    const parked = renderFleetReport([], [], 'w', [
      { branch: 'autopilot/flight-worktree-p--fleet-4', commits: 3 },
      { branch: 'autopilot/flight-worktree-p--fleet-2', commits: 0 },
    ]).join('\n');
    expect(parked).toContain('commits parked on a lane, not on the flight branch');
    expect(parked).toContain('  3 on autopilot/flight-worktree-p--fleet-4');
    expect(parked).not.toContain('fleet-2');
    expect(renderFleetReport([], [], 'w').join('\n')).toContain(
      'commits parked on a lane, not on the flight branch\n  none',
    );
  });
});

describe('summarizeEscalations (rung 4)', () => {
  it('counts attempts and resolutions, and the failures by kind, most frequent first', () => {
    const s = summarizeEscalations([
      { kind: 'gate-red', details: 'pnpm run test failed' },
      { kind: 'resolved', details: 'committed abc1234' },
      { kind: 'left-unresolved', details: 'left 1 path(s) unresolved: a.ts' },
      { kind: 'gate-red', details: 'pnpm run lint failed\nsecond line' },
    ]);
    expect(s).toEqual({
      attempts: 4,
      resolved: 1,
      failures: [
        ['gate-red', 2],
        ['left-unresolved', 1],
      ],
      latestFailure: { kind: 'gate-red', details: 'pnpm run lint failed\nsecond line' },
    });
  });

  it('has no latest failure when every attempt resolved, or none ran', () => {
    expect(summarizeEscalations([{ kind: 'resolved', details: 'x' }]).latestFailure).toBeNull();
    expect(summarizeEscalations([])).toEqual({
      attempts: 0,
      resolved: 0,
      failures: [],
      latestFailure: null,
    });
  });
});

describe('renderFleetReport rung 4', () => {
  const heading = 'rung 4: the merge-escalation agent at a conflicting sync-back';

  it('prints the success rate, the failures by kind and the latest failure on one line', () => {
    const text = renderFleetReport(
      [],
      [],
      'w',
      [],
      [
        { kind: 'resolved', details: 'committed abc1234' },
        { kind: 'agent-failed', details: 'timed out after 15 turns' },
        { kind: 'gate-red', details: `pnpm run test failed\n${'x'.repeat(400)}` },
      ],
    ).join('\n');
    expect(text).toContain(`${heading}\n  attempts 3  resolved 1`);
    expect(text).toContain('    1× agent-failed');
    expect(text).toContain('    1× gate-red');
    expect(text).toContain('  latest failure (gate-red): pnpm run test failed\n');
    expect(text).not.toContain('xxx');
  });

  it('caps a long single-line failure', () => {
    const long = [{ kind: 'agent-failed', details: 'y'.repeat(400) }];
    const text = renderFleetReport([], [], 'w', [], long).join('\n');
    expect(text).toContain(`  latest failure (agent-failed): ${'y'.repeat(159)}…`);
    expect(text).not.toContain('y'.repeat(160));
  });

  it('skips blank leading lines and a carriage return in the latest failure', () => {
    const gate = [{ kind: 'gate-red', details: '\r\n  \r\n  pnpm run lint failed\r\nmore' }];
    expect(renderFleetReport([], [], 'w', [], gate).join('\n')).toContain(
      '  latest failure (gate-red): pnpm run lint failed\n',
    );
  });

  it('says none when the agent never ran, and places the section before the parked lanes', () => {
    const lines = renderFleetReport([], [], 'w');
    const text = lines.join('\n');
    expect(text).toContain(`${heading}\n  none`);
    expect(lines.indexOf(heading)).toBeLessThan(
      lines.indexOf('commits parked on a lane, not on the flight branch'),
    );
    expect(lines.indexOf(heading)).toBeGreaterThan(lines.indexOf('convergence after sync-back'));
  });
});
