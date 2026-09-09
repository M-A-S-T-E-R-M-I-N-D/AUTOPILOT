// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildMergeEscalationPrompt,
  createGitMergeEscalationDeps,
  mergeEscalationCommitMessage,
  runMergeEscalationAgent,
  type MergeEscalationDeps,
} from '../../src/adapters/merge-escalation-agent.js';
import type { MergeConflictSides } from '../../src/adapters/merge-conflict-context.js';
import type { GatePort } from '../../src/ports.js';

const CONFLICTS: readonly MergeConflictSides[] = [
  { path: 'a.txt', base: 'base-a', ours: 'ours-a', theirs: 'theirs-a' },
];

function makeDeps(overrides: Partial<MergeEscalationDeps> = {}): MergeEscalationDeps {
  return {
    invokeAgent: vi.fn().mockResolvedValue({ ok: true, details: 'agent resolved the conflict' }),
    listUnresolvedPaths: vi.fn().mockResolvedValue([]),
    runGate: vi.fn().mockResolvedValue({ ok: true, details: 'gate green' }),
    commit: vi.fn().mockResolvedValue({ ok: true, details: 'committed abc123' }),
    abortMerge: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('buildMergeEscalationPrompt', () => {
  it('names every conflicted path and includes the base/ours/theirs context', () => {
    const prompt = buildMergeEscalationPrompt(CONFLICTS, 'lane/foo', 'main');

    expect(prompt).toContain("merge of 'lane/foo' into 'main'");
    expect(prompt).toContain('Files to resolve: a.txt');
    expect(prompt).toContain('## a.txt');
    expect(prompt).toContain('--- base ---\nbase-a');
  });

  it('instructs the agent to stage resolutions but never commit itself', () => {
    const prompt = buildMergeEscalationPrompt(CONFLICTS, 'lane/foo', 'main');

    expect(prompt).toContain("stage it with 'git add'");
    expect(prompt).toContain("do not run 'git commit' yourself");
  });

  it('lists every path when more than one conflict survives', () => {
    const prompt = buildMergeEscalationPrompt(
      [...CONFLICTS, { path: 'b.txt', base: 'b', ours: 'b-ours', theirs: 'b-theirs' }],
      'lane/foo',
      'main',
    );

    expect(prompt).toContain('Files to resolve: a.txt, b.txt');
  });
});

describe('mergeEscalationCommitMessage', () => {
  it('carries a Merge-Escalation-Agent trailer naming the taxonomy doc', () => {
    const message = mergeEscalationCommitMessage('lane/foo', 'main');

    expect(message).toContain('chore: sync lane/foo into main');
    expect(message).toContain(
      'Merge-Escalation-Agent: docs/EVALUATION-2026-09-03-sync-conflict-taxonomy.md rung 4',
    );
  });
});

describe('runMergeEscalationAgent', () => {
  it('commits with the escalation trailer when the agent resolves, nothing is left unresolved, and the gate is green', async () => {
    const deps = makeDeps();

    const outcome = await runMergeEscalationAgent(CONFLICTS, 'lane/foo', 'main', deps);

    expect(outcome).toEqual({ kind: 'resolved', details: 'committed abc123' });
    expect(deps.commit).toHaveBeenCalledWith(mergeEscalationCommitMessage('lane/foo', 'main'));
    expect(deps.abortMerge).not.toHaveBeenCalled();
  });

  it('aborts and reports agent-failed when the agent invocation itself errors', async () => {
    const deps = makeDeps({
      invokeAgent: vi.fn().mockResolvedValue({ ok: false, details: 'CLI timed out' }),
    });

    const outcome = await runMergeEscalationAgent(CONFLICTS, 'lane/foo', 'main', deps);

    expect(outcome).toEqual({ kind: 'agent-failed', details: 'CLI timed out' });
    expect(deps.abortMerge).toHaveBeenCalledOnce();
    expect(deps.runGate).not.toHaveBeenCalled();
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it('aborts and reports left-unresolved when the agent claims success but a path is still unmerged', async () => {
    const deps = makeDeps({
      listUnresolvedPaths: vi.fn().mockResolvedValue(['a.txt']),
    });

    const outcome = await runMergeEscalationAgent(CONFLICTS, 'lane/foo', 'main', deps);

    expect(outcome).toEqual({ kind: 'left-unresolved', unresolvedPaths: ['a.txt'] });
    expect(deps.abortMerge).toHaveBeenCalledOnce();
    expect(deps.runGate).not.toHaveBeenCalled();
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it('aborts and reports gate-red without committing when the full gate fails the resolution', async () => {
    const deps = makeDeps({
      runGate: vi.fn().mockResolvedValue({ ok: false, details: 'typecheck failed' }),
    });

    const outcome = await runMergeEscalationAgent(CONFLICTS, 'lane/foo', 'main', deps);

    expect(outcome).toEqual({ kind: 'gate-red', details: 'typecheck failed' });
    expect(deps.abortMerge).toHaveBeenCalledOnce();
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it('aborts and reports commit-failed when the gate is green but the commit itself fails', async () => {
    const deps = makeDeps({
      commit: vi.fn().mockResolvedValue({ ok: false, details: 'commit rejected' }),
    });

    const outcome = await runMergeEscalationAgent(CONFLICTS, 'lane/foo', 'main', deps);

    expect(outcome).toEqual({ kind: 'commit-failed', details: 'commit rejected' });
    expect(deps.abortMerge).toHaveBeenCalledOnce();
  });
});

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

/** A real repo with a mid-merge conflict on `a.txt` — same shape as
 *  `worktree.test.ts`'s own conflict fixtures, just built on two branches of
 *  one repo instead of a checkout + linked worktree. */
function conflictedRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'autopilot-merge-escalation-'));
  gitSync(dir, ['init', '-q']);
  gitSync(dir, ['config', 'user.email', 'test@autopilot.dev']);
  gitSync(dir, ['config', 'user.name', 'Test']);
  gitSync(dir, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'a.txt'), 'base');
  gitSync(dir, ['add', '-A']);
  gitSync(dir, ['commit', '-q', '-m', 'feat: AP-1 base']);
  const initialBranch = gitSync(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);

  gitSync(dir, ['checkout', '-q', '-b', 'lane']);
  writeFileSync(join(dir, 'a.txt'), 'lane change');
  gitSync(dir, ['add', '-A']);
  gitSync(dir, ['commit', '-q', '-m', 'feat: AP-2 lane change']);

  gitSync(dir, ['checkout', '-q', initialBranch]);
  writeFileSync(join(dir, 'a.txt'), 'target change');
  gitSync(dir, ['add', '-A']);
  gitSync(dir, ['commit', '-q', '-m', 'feat: AP-3 target change']);

  try {
    gitSync(dir, ['merge', 'lane']);
  } catch {
    /* expected: the merge stops on the conflict */
  }
  return dir;
}

const NOOP_GATE: GatePort = { run: async () => ({ ok: true }) };

describe('createGitMergeEscalationDeps', () => {
  it('reads the real unresolved path off a conflicted index, then reads empty once it is resolved and staged', async () => {
    const repo = conflictedRepo();
    const deps = createGitMergeEscalationDeps(repo, NOOP_GATE, vi.fn());

    expect(await deps.listUnresolvedPaths()).toEqual(['a.txt']);

    writeFileSync(join(repo, 'a.txt'), 'reconciled');
    gitSync(repo, ['add', 'a.txt']);

    expect(await deps.listUnresolvedPaths()).toEqual([]);
  });

  it('commits the staged resolution with --signoff once nothing is left unresolved', async () => {
    const repo = conflictedRepo();
    const deps = createGitMergeEscalationDeps(repo, NOOP_GATE, vi.fn());
    writeFileSync(join(repo, 'a.txt'), 'reconciled');
    gitSync(repo, ['add', 'a.txt']);

    const outcome = await deps.commit(mergeEscalationCommitMessage('lane', 'master'));

    expect(outcome.ok).toBe(true);
    expect(gitSync(repo, ['log', '-1', '--format=%s'])).toBe(
      'chore: sync lane into master (rung 4 merge-escalation agent resolved)',
    );
    expect(gitSync(repo, ['log', '-1', '--format=%b'])).toContain('Signed-off-by:');
    expect(gitSync(repo, ['status', '--porcelain'])).toBe('');
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('reconciled');
  });

  it('reports commit failure with the real git stderr when a path is still unresolved', async () => {
    const repo = conflictedRepo();
    const deps = createGitMergeEscalationDeps(repo, NOOP_GATE, vi.fn());

    const outcome = await deps.commit(mergeEscalationCommitMessage('lane', 'master'));

    expect(outcome.ok).toBe(false);
    expect(outcome.details.length).toBeGreaterThan(0);
  });

  it('aborts the real in-progress merge, leaving the checkout clean and untouched by either side', async () => {
    const repo = conflictedRepo();
    const before = gitSync(repo, ['rev-parse', 'HEAD']);
    const deps = createGitMergeEscalationDeps(repo, NOOP_GATE, vi.fn());

    await deps.abortMerge();

    expect(gitSync(repo, ['status', '--porcelain'])).toBe('');
    expect(gitSync(repo, ['rev-parse', 'HEAD'])).toBe(before);
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('target change');
  });

  it("delegates runGate to the caller's GatePort and fills in a default detail message when none is given", async () => {
    const repo = conflictedRepo();
    const greenGate: GatePort = { run: async () => ({ ok: true }) };
    const redGate: GatePort = { run: async () => ({ ok: false }) };

    const green = await createGitMergeEscalationDeps(repo, greenGate, vi.fn()).runGate();
    const red = await createGitMergeEscalationDeps(repo, redGate, vi.fn()).runGate();

    expect(green).toEqual({ ok: true, details: 'gate passed' });
    expect(red).toEqual({ ok: false, details: 'gate failed' });
  });

  it('passes runGate details through unchanged when the GatePort supplies its own', async () => {
    const repo = conflictedRepo();
    const gate: GatePort = { run: async () => ({ ok: false, details: 'typecheck failed' }) };

    const result = await createGitMergeEscalationDeps(repo, gate, vi.fn()).runGate();

    expect(result).toEqual({ ok: false, details: 'typecheck failed' });
  });

  it('passes invokeAgent through unchanged', () => {
    const invokeAgent = vi.fn();
    const repo = conflictedRepo();

    const deps = createGitMergeEscalationDeps(repo, NOOP_GATE, invokeAgent);

    expect(deps.invokeAgent).toBe(invokeAgent);
  });
});
