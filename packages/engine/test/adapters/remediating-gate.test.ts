// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  RemediatingGate,
  AUTOFORMAT_COMMIT_MESSAGE,
  deriveFormatFixCommand,
} from '../../src/adapters/remediating-gate.js';
import type { GatePort, GateResult, VcsPort, CommitRef } from '../../src/ports.js';

/** An inner gate scripted with a sequence of results. */
function gateOf(results: GateResult[]): GatePort & { runs: number } {
  const g = {
    runs: 0,
    run(): Promise<GateResult> {
      g.runs += 1;
      return Promise.resolve(results[Math.min(g.runs - 1, results.length - 1)] as GateResult);
    },
  };
  return g;
}

function vcsFake(dirtyAfterFix: boolean): VcsPort & {
  commits: string[];
  reverts: number;
  markFixerRan: () => void;
} {
  let dirty = false;
  const v = {
    commits: [] as string[],
    reverts: 0,
    head: () => Promise.resolve('h'),
    lastCommit: () => Promise.resolve(null as CommitRef | null),
    commitInFiringRange: () => Promise.resolve(false),
    changedFiles: () => Promise.resolve([] as readonly string[]),
    revertLast: () => {
      v.reverts += 1;
      return Promise.resolve();
    },
    isDirty: () => Promise.resolve(dirty),
    commitAll: (message: string) => {
      v.commits.push(message);
      dirty = false;
      return Promise.resolve();
    },
    markFixerRan: () => {
      dirty = dirtyAfterFix;
    },
  };
  return v;
}

const ok: GateResult = { ok: true, details: 'all green' };
const red: GateResult = { ok: false, details: 'format:check failed' };

const redWithChecks: GateResult = {
  ok: false,
  details: 'format:check failed',
  checks: [{ label: 'format:check', pass: false, durationMs: 5 }],
};
const okWithChecks: GateResult = {
  ok: true,
  details: 'all green',
  checks: [{ label: 'format:check', pass: true, durationMs: 3 }],
};

describe('RemediatingGate', () => {
  it('passes straight through when the gate is green (no fixer, no commits)', async () => {
    const inner = gateOf([ok]);
    const vcs = vcsFake(true);
    let fixerRuns = 0;
    const gate = new RemediatingGate({
      inner,
      vcs,
      runFixer: () => {
        fixerRuns += 1;
        return Promise.resolve(true);
      },
    });
    expect((await gate.run()).ok).toBe(true);
    expect(fixerRuns).toBe(0);
    expect(vcs.commits).toHaveLength(0);
  });

  it('RESCUES a format-only failure: fix → additive commit → re-run → green', async () => {
    const inner = gateOf([red, ok]);
    const vcs = vcsFake(true);
    const gate = new RemediatingGate({
      inner,
      vcs,
      runFixer: () => {
        vcs.markFixerRan();
        return Promise.resolve(true);
      },
    });

    const result = await gate.run();

    expect(result.ok).toBe(true);
    expect(result.details).toContain('mechanical remediation');
    expect(vcs.commits).toEqual([AUTOFORMAT_COMMIT_MESSAGE]);
    expect(inner.runs).toBe(2);
    expect(vcs.reverts).toBe(0);
    // Neither `red` nor `ok` carries `.checks` — the merge's `?? []` fallback
    // must produce an empty array, not a phantom entry from a loosened fallback.
    expect(result.checks).toEqual([]);
  });

  it('never re-runs the gate or touches vcs when runFixer itself resolves false, even if the tree happens to already be dirty for an unrelated reason', async () => {
    const inner = gateOf([red, ok]); // a second run would pass — must never be reached
    const vcs: VcsPort & { commits: string[]; reverts: number } = {
      commits: [],
      reverts: 0,
      head: () => Promise.resolve('h'),
      lastCommit: () => Promise.resolve(null),
      commitInFiringRange: () => Promise.resolve(false),
      changedFiles: () => Promise.resolve([]),
      revertLast: () => {
        vcs.reverts += 1;
        return Promise.resolve();
      },
      isDirty: () => Promise.resolve(true), // already dirty, unrelated to the fixer
      commitAll: (message: string) => {
        vcs.commits.push(message);
        return Promise.resolve();
      },
    };
    const gate = new RemediatingGate({ inner, vcs, runFixer: () => Promise.resolve(false) });

    const result = await gate.run();

    expect(result).toEqual(red);
    expect(vcs.commits).toHaveLength(0);
    expect(vcs.reverts).toBe(0);
    expect(inner.runs).toBe(1);
  });

  it('AUTOFORMAT_COMMIT_MESSAGE is the stable, mechanical-remediation-labeled commit subject', () => {
    expect(AUTOFORMAT_COMMIT_MESSAGE).toBe(
      'style(autopilot): autoformat — mechanical gate remediation',
    );
  });

  it('does NOT mask a real failure: fixer changes nothing → original red returned', async () => {
    const inner = gateOf([red]);
    const vcs = vcsFake(false); // fixer runs but tree stays clean
    const gate = new RemediatingGate({
      inner,
      vcs,
      runFixer: () => {
        vcs.markFixerRan();
        return Promise.resolve(true);
      },
    });

    const result = await gate.run();
    expect(result.ok).toBe(false);
    expect(vcs.commits).toHaveLength(0);
    expect(inner.runs).toBe(1); // no pointless re-run
  });

  it('rolls back its own autofix commit when the gate is STILL red after fixing', async () => {
    const inner = gateOf([red, red]);
    const vcs = vcsFake(true);
    const gate = new RemediatingGate({
      inner,
      vcs,
      runFixer: () => {
        vcs.markFixerRan();
        return Promise.resolve(true);
      },
    });

    const result = await gate.run();

    expect(result.ok).toBe(false);
    expect(vcs.commits).toEqual([AUTOFORMAT_COMMIT_MESSAGE]); // tried…
    expect(vcs.reverts).toBe(1); // …then undid itself so the engine reverts the UNIT commit
  });

  it('a failing fixer degrades to the original result', async () => {
    const inner = gateOf([red]);
    const vcs = vcsFake(true);
    const gate = new RemediatingGate({ inner, vcs, runFixer: () => Promise.resolve(false) });
    expect((await gate.run()).ok).toBe(false);
    expect(vcs.commits).toHaveLength(0);
  });

  it('carries a CRASHED verdict through untouched — remediation never masks a crash', async () => {
    const crashed: GateResult = { ok: false, details: 'ghost failed (exit 1)', crashed: true };
    const inner = gateOf([crashed]);
    const vcs = vcsFake(false); // fixer runs but changes nothing (nothing to format-fix)
    const gate = new RemediatingGate({
      inner,
      vcs,
      runFixer: () => {
        vcs.markFixerRan();
        return Promise.resolve(true);
      },
    });

    const result = await gate.run();
    expect(result.ok).toBe(false);
    expect(result.crashed).toBe(true);
    expect(vcs.reverts).toBe(0);
  });

  it('skips remediation entirely on a CRASH — no fixer run, no commit, no gate re-run', async () => {
    const crashed: GateResult = { ok: false, details: 'ghost failed (exit 1)', crashed: true };
    const inner = gateOf([crashed, ok]); // a second run would pass — remediation must never reach it
    const vcs = vcsFake(true);
    let fixerRuns = 0;
    const gate = new RemediatingGate({
      inner,
      vcs,
      runFixer: () => {
        fixerRuns += 1;
        vcs.markFixerRan();
        return Promise.resolve(true);
      },
    });

    const result = await gate.run();
    expect(result).toEqual(crashed);
    expect(fixerRuns).toBe(0);
    expect(vcs.commits).toHaveLength(0);
    expect(inner.runs).toBe(1); // no wasted second gate run against a broken environment
  });

  it('does NOT revert the autoformat commit when the RE-RUN crashes — a crash is not a real failure', async () => {
    const crashedRerun: GateResult = { ok: false, details: 'ghost failed (exit 1)', crashed: true };
    const inner = gateOf([red, crashedRerun]);
    const vcs = vcsFake(true);
    const gate = new RemediatingGate({
      inner,
      vcs,
      runFixer: () => {
        vcs.markFixerRan();
        return Promise.resolve(true);
      },
    });

    const result = await gate.run();

    expect(result.ok).toBe(false);
    expect(result.crashed).toBe(true);
    expect(vcs.commits).toEqual([AUTOFORMAT_COMMIT_MESSAGE]); // fixer's commit stays…
    expect(vcs.reverts).toBe(0); // …never undone: the crash never judged the fix either way
  });

  it('merges per-command checks from both attempts so the drill-down shows the full story', async () => {
    const inner = gateOf([redWithChecks, okWithChecks]);
    const vcs = vcsFake(true);
    const gate = new RemediatingGate({
      inner,
      vcs,
      runFixer: () => {
        vcs.markFixerRan();
        return Promise.resolve(true);
      },
    });

    const result = await gate.run();

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual([
      { label: 'format:check', pass: false, durationMs: 5 },
      { label: 'format:check', pass: true, durationMs: 3 },
    ]);
  });
});

describe('deriveFormatFixCommand', () => {
  it('maps the format:check script to its write-mode sibling', () => {
    const fix = deriveFormatFixCommand({
      bin: 'pnpm',
      args: ['run', 'format:check'],
      label: 'pnpm run format:check',
    });
    expect(fix).toEqual({ bin: 'pnpm', args: ['run', 'format'], label: 'pnpm run format' });
  });

  it('returns null when there is no format check or no script convention', () => {
    expect(deriveFormatFixCommand(undefined)).toBeNull();
    expect(
      deriveFormatFixCommand({
        bin: 'prettier',
        args: ['--check', '.'],
        label: 'prettier --check',
      }),
    ).toBeNull();
  });

  it('omits label entirely when the source spec carries none', () => {
    const fix = deriveFormatFixCommand({ bin: 'pnpm', args: ['run', 'format:check'] });
    expect(fix).toEqual({ bin: 'pnpm', args: ['run', 'format'] });
    expect(fix).not.toHaveProperty('label');
  });
});
