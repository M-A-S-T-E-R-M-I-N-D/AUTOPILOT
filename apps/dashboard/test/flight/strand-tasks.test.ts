// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openStore, migrate, createTask, type Store } from '@autopilot/store';
import {
  closeLandedStrandTasks,
  strandTaskBody,
  strandTaskTitle,
  strandedHeadOf,
} from '../../src/flight/strand-tasks.js';

const LANE = 'autopilot/flight-worktree-fly-autopilot--fleet-5';
const LANDED = '4371d22b1c2e3f4a5b6c7d8e9f0a1b2c3d4e5f60';
const PARKED = '8583c1190a1b2c3d4e5f60718293a4b5c6d7e8f9';
const CONFLICT = "merge of 'lane' into 'autopilot/flight' failed (exit 1): CONFLICT (content)";

describe('strandTaskTitle / strandedHeadOf', () => {
  it('names the lane branch and the head it stranded, and reads the head back', () => {
    const title = strandTaskTitle(LANE, LANDED, CONFLICT);

    expect(title).toBe(
      `STRANDED SYNC-BACK: flight ended with its commits parked on ${LANE} at 4371d22b1c2e — ${CONFLICT}`,
    );
    expect(strandedHeadOf(title)).toBe('4371d22b1c2e');
  });

  it('keeps the title the dedup query matches on — the branch still follows the fixed prefix', () => {
    expect(
      strandTaskTitle(LANE, LANDED, CONFLICT).startsWith(
        `STRANDED SYNC-BACK: flight ended with its commits parked on ${LANE}`,
      ),
    ).toBe(true);
  });

  it('names no head when the lane head could not be read, so the task is never closed on a guess', () => {
    const title = strandTaskTitle(LANE, '', CONFLICT);

    expect(title).toBe(
      `STRANDED SYNC-BACK: flight ended with its commits parked on ${LANE} — ${CONFLICT}`,
    );
    expect(strandedHeadOf(title)).toBeNull();
  });

  it('reads no head from a task filed before the head was recorded, nor from any other title', () => {
    expect(
      strandedHeadOf(
        `STRANDED SYNC-BACK: flight ended with its commits parked on ${LANE} — ${CONFLICT}`,
      ),
    ).toBeNull();
    expect(
      strandedHeadOf('port-owner.ts findPortOwnerPid runs lsof at 4371d22b1c2e — x'),
    ).toBeNull();
  });
});

describe('strandTaskBody', () => {
  const CONTEXT = 'MERGE-ESCALATION CONTEXT — 1 unresolved path\n\n## a.txt';

  it('says rung 4 ran and why it gave up, above the conflict context', () => {
    expect(strandTaskBody(CONTEXT, 'gate-red: 3 tests failed')).toBe(
      `Rung 4 (the merge-escalation agent) ran and did not resolve it — gate-red: 3 tests failed\n\n${CONTEXT}`,
    );
  });

  it('is the conflict context alone when no escalation ran', () => {
    expect(strandTaskBody(CONTEXT, undefined)).toBe(CONTEXT);
  });

  it('still records a failed escalation when there is no context to attach', () => {
    expect(strandTaskBody(null, 'agent-failed: max turns')).toBe(
      'Rung 4 (the merge-escalation agent) ran and did not resolve it — agent-failed: max turns',
    );
  });

  it('is empty when there is neither a context nor an escalation', () => {
    expect(strandTaskBody(null, undefined)).toBeNull();
  });
});

describe('closeLandedStrandTasks', () => {
  let store: Store;

  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
    for (const id of ['p1', 'p2']) {
      store.db
        .prepare(
          `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
           VALUES (?, ?, ?, '/tmp/p', 'flying', 1, 1)`,
        )
        .run(id, id, id);
    }
  });

  function fileStrand(
    id: string,
    head: string,
    status: 'queued' | 'needs_approval' = 'needs_approval',
    projectId = 'p1',
  ): void {
    createTask(store, {
      id,
      projectId,
      title: strandTaskTitle(LANE, head, CONFLICT),
      status,
      severity: 'high',
      source: 'self',
      createdAt: 1,
    });
  }

  function statusOf(id: string): string {
    return (store.db.prepare('SELECT status FROM tasks WHERE id = ?').get(id) as { status: string })
      .status;
  }

  const landed = (sha: string): boolean => LANDED.startsWith(sha);

  it('closes an open strand task whose stranded head has since landed on the flight branch', () => {
    fileStrand('ap-a-strand', LANDED);

    const closed = closeLandedStrandTasks(store, 'p1', landed, 9);

    expect(closed.map((t) => t.id)).toEqual(['ap-a-strand']);
    expect(statusOf('ap-a-strand')).toBe('done');
  });

  it('closes one the operator approved onto the board as well as one still in the inbox', () => {
    fileStrand('ap-b-strand', LANDED, 'queued');

    expect(closeLandedStrandTasks(store, 'p1', landed, 9).map((t) => t.id)).toEqual([
      'ap-b-strand',
    ]);
    expect(statusOf('ap-b-strand')).toBe('done');
  });

  it('leaves open a strand task whose head is still parked — a withheld head kept under a rescue ref never lands by itself', () => {
    fileStrand('ap-c-strand', PARKED);

    expect(closeLandedStrandTasks(store, 'p1', landed, 9)).toEqual([]);
    expect(statusOf('ap-c-strand')).toBe('needs_approval');
  });

  it('leaves a strand task that names no head to the operator, without asking git', () => {
    fileStrand('ap-d-strand', '');
    const asked: string[] = [];

    const closed = closeLandedStrandTasks(
      store,
      'p1',
      (sha) => {
        asked.push(sha);
        return true;
      },
      9,
    );

    expect(closed).toEqual([]);
    expect(asked).toEqual([]);
    expect(statusOf('ap-d-strand')).toBe('needs_approval');
  });

  it("touches neither another project's strand task nor an ordinary task", () => {
    fileStrand('ap-e-strand', LANDED, 'needs_approval', 'p2');
    createTask(store, {
      id: 'web-f',
      projectId: 'p1',
      title: `Refactor the parked on ${LANE} at 4371d22b1c2e — helper`,
      createdAt: 1,
    });

    expect(closeLandedStrandTasks(store, 'p1', () => true, 9)).toEqual([]);
    expect(statusOf('ap-e-strand')).toBe('needs_approval');
    expect(statusOf('web-f')).toBe('queued');
  });

  it('is a no-op the second time — a closed strand task is not reopened or counted again', () => {
    fileStrand('ap-g-strand', LANDED);

    expect(closeLandedStrandTasks(store, 'p1', landed, 9)).toHaveLength(1);
    expect(closeLandedStrandTasks(store, 'p1', landed, 10)).toEqual([]);
  });
});

describe('fly.ts wiring (source census)', () => {
  const flySource = readFileSync(
    fileURLToPath(new URL('../../src/fly.ts', import.meta.url)),
    'utf8',
  );

  it('the flight-end inbox task names the lane head it stranded', () => {
    expect(flySource).toMatch(
      /const strandTitle = strandTaskTitle\(\s*worktreePlan\.branch,\s*await vcs\.head\(\),\s*finalSync\.details,?\s*\);/,
    );
  });

  it('the inbox task body carries why rung 4 gave up, not only the conflict context', () => {
    expect(flySource).toMatch(/const body = strandTaskBody\([^;]*finalSync\.escalation,?\s*\);/);
  });

  it('every rung-4 outcome, resolved or not, is persisted as a merge-escalation event', () => {
    const hook = flySource.slice(
      flySource.indexOf('const escalate: SyncWorktreeEscalationHook'),
      flySource.indexOf('const finalSync: SyncWorktreeBranchResult'),
    );
    const recorded = hook.indexOf("'merge-escalation',");
    expect(recorded).toBeGreaterThan(-1);
    expect(hook).toContain('JSON.stringify(summary)');
    // Recorded before the hook branches on the outcome, so a resolved attempt
    // is counted exactly like a failed one.
    expect(recorded).toBeLessThan(hook.indexOf("outcome.kind === 'resolved'"));
  });

  it('the flight-start self-heal closes landed strand tasks before the board is read', () => {
    const selfHeal = flySource.indexOf('closeLandedStrandTasks(store, projectId,');
    expect(selfHeal).toBeGreaterThan(-1);
    expect(selfHeal).toBeLessThan(flySource.indexOf('FLEET STALE-CLAIM REAPER'));
    expect(flySource).toContain("'merge-base', '--is-ancestor'");
  });
});
