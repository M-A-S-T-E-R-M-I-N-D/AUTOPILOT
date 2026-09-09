// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  buildMergeEscalationPrompt,
  mergeEscalationCommitMessage,
  runMergeEscalationAgent,
  type MergeEscalationDeps,
} from '../../src/adapters/merge-escalation-agent.js';
import type { MergeConflictSides } from '../../src/adapters/merge-conflict-context.js';

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
