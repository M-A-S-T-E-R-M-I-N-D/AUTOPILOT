// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { openStore, migrate, type Store } from '@autopilot/store';
import type { GitVcs } from '@autopilot/engine';
import {
  runFamilyRunawaySweep,
  runFleetWisdomSweep,
  runSoulMiningSweep,
  runStaleClaimSweep,
  runDocFreshnessSweep,
  runVerifyBySweep,
  runReconciliationProposalSweep,
  runClosedTaskAuditSweep,
  runStoreBackupSweep,
} from '../../src/flight/post-flight-sweeps.js';
import { DOC_SUBJECTS } from '../../src/flight/doc-freshness.js';
import type { AuditVcs } from '../../src/flight/closed-task-audit.js';
import type { CliExec } from '../../src/connection/cli-probe.js';
import { RUNAWAY_SPEND_USD, RUNAWAY_FIRINGS } from '../../src/flight/triage-factors.js';
import {
  CHECKPOINT_SOUL_AMENDMENT_MARKER,
  CHECKPOINT_STREAK_THRESHOLD,
} from '../../src/flight/soul-mining.js';
import { FLEET_WISDOM_GENERALIZATION_THRESHOLD } from '../../src/flight/fleet-wisdom-mining.js';

/**
 * runFamilyRunawaySweep (post-flight-sweeps.ts) had zero direct coverage —
 * only its pure helpers (triage-factors.ts's familyEconomicsFromRows/
 * isRunaway) were tested. This proves the sweep's own DB-facing contract: it
 * reads metrics rows, folds them by commit-subject family, and writes an
 * 'events' row (never more than a proposal — never touches tasks/board) only
 * once BOTH runaway thresholds are trailing-crossed.
 */
describe('runFamilyRunawaySweep', () => {
  let store: Store;

  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', 1, 1)`,
      )
      .run();
  });

  afterEach(() => store.db.close());

  function shipSlice(firingId: string, commitSubject: string, costUsd: number): void {
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, commit_subject, completion, cost_usd, created_at)
         VALUES ('p1', ?, ?, 'slice', ?, 1)`,
      )
      .run(firingId, commitSubject, costUsd);
  }

  function events(): { type: string; payload: string }[] {
    return store.db.prepare('SELECT type, payload FROM events').all() as {
      type: string;
      payload: string;
    }[];
  }

  it('writes a family-runaway event once a commit-subject family trailing-crosses BOTH thresholds', () => {
    const perFiringCost = RUNAWAY_SPEND_USD / RUNAWAY_FIRINGS + 1; // crosses spend once firings crosses too
    const firings = RUNAWAY_FIRINGS + 1;
    for (let i = 0; i < firings; i++) {
      shipSlice(
        `f-${i}`,
        `feat(dashboard): mutation testing widens to widget-${i}.ts`,
        perFiringCost,
      );
    }

    runFamilyRunawaySweep(store, 'p1', () => 12345);

    const rows = events();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe('family-runaway');
    const payload = JSON.parse(rows[0]?.payload ?? '{}') as {
      family: string;
      spendUsd: number;
      firings: number;
    };
    expect(payload.family).toBe('mutation testing widens to *');
    expect(payload.firings).toBe(firings);
    expect(payload.spendUsd).toBeCloseTo(perFiringCost * firings);
  });

  it('writes no event when a family stays under the thresholds', () => {
    for (let i = 0; i < 3; i++) {
      shipSlice(`f-${i}`, `feat(dashboard): small fix to widget-${i}.ts`, 1);
    }

    runFamilyRunawaySweep(store, 'p1', () => 12345);

    expect(events()).toEqual([]);
  });

  it('is best-effort — a query failure never throws', () => {
    store.db.close();
    expect(() => runFamilyRunawaySweep(store, 'p1', () => 12345)).not.toThrow();
  });
});

/**
 * runDocFreshnessSweep (board web-mtzv4f1k-pmtfwh): DOC_SUBJECTS names paths
 * that only ever exist in THIS engine repo, so a flight over an UNRELATED
 * target repo must never mine that engine-repo drift and attach it to the
 * flown project's board — a flight over a temp calculator repo (calc-story,
 * 2026-09-13) got four AUTOPILOT docs/epics proposed against the wrong
 * project this way. The sweep must only run when the flight IS the engine
 * repo flying itself (`target === engineRepo`).
 */
describe('runDocFreshnessSweep', () => {
  let store: Store;
  let engineRepo: string;

  function gitSync(repo: string, args: string[]): string {
    return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  }

  function commitAt(dir: string, file: string, content: string, epochSeconds: number): void {
    const fullPath = join(dir, file);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
    gitSync(dir, ['add', '-A']);
    const date = `${epochSeconds} +0000`;
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', file], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
  }

  function docFreshTasks(): { id: string; status: string }[] {
    return store.db
      .prepare("SELECT id, status FROM tasks WHERE project_id = 'p1' AND id LIKE 'docfresh-%'")
      .all() as { id: string; status: string }[];
  }

  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', 1, 1)`,
      )
      .run();

    engineRepo = mkdtempSync(join(tmpdir(), 'autopilot-doc-freshness-sweep-'));
    gitSync(engineRepo, ['init', '-q']);
    gitSync(engineRepo, ['config', 'user.email', 'test@autopilot.dev']);
    gitSync(engineRepo, ['config', 'user.name', 'Test']);
    gitSync(engineRepo, ['config', 'commit.gpgsign', 'false']);
    const [firstEntry] = DOC_SUBJECTS;
    if (!firstEntry) throw new Error('DOC_SUBJECTS must not be empty');
    commitAt(engineRepo, firstEntry.doc, 'v1', 1_700_000_000);
    const [firstSubject] = firstEntry.subjects;
    if (!firstSubject) throw new Error('DOC_SUBJECTS[0] must have a subject');
    commitAt(engineRepo, firstSubject, 'v1', 1_700_000_100);
  });

  afterEach(() => {
    store.db.close();
    rmSync(engineRepo, { recursive: true, force: true });
  });

  it('mines and proposes engine-repo drift when the flight IS the engine repo flying itself', () => {
    runDocFreshnessSweep(store, 'p1', () => 12345, engineRepo, engineRepo);

    expect(docFreshTasks()).toHaveLength(1);
  });

  it('proposes nothing when the flight target is a different repo than the engine checkout', () => {
    const target = mkdtempSync(join(tmpdir(), 'autopilot-doc-freshness-target-'));
    try {
      runDocFreshnessSweep(store, 'p1', () => 12345, target, engineRepo);

      expect(docFreshTasks()).toEqual([]);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it('is best-effort — a query failure never throws', () => {
    store.db.close();
    expect(() =>
      runDocFreshnessSweep(store, 'p1', () => 12345, engineRepo, engineRepo),
    ).not.toThrow();
  });
});

/**
 * runVerifyBySweep (board web-mtzv4f1k-pmtfwh, same foreign-target class as
 * runDocFreshnessSweep above): docs/RESEARCH-LIBRARY.md is THIS engine
 * repo's own doc, but the sweep read it straight off `process.cwd()` with no
 * check on whether the flight's TARGET is actually the engine repo flying
 * itself — flying an unrelated project would still mine the engine's own
 * verify-by notes and attach the proposal to the wrong project's board, the
 * exact bug class docfresh's `target === engineRepo` guard exists to close.
 */
describe('runVerifyBySweep', () => {
  let store: Store;
  let engineRepo: string;
  const NOW = Date.parse('2026-09-20T00:00:00Z');

  function verifyByTasks(): { id: string; status: string }[] {
    return store.db
      .prepare("SELECT id, status FROM tasks WHERE project_id = 'p1' AND id LIKE 'verifyby-%'")
      .all() as { id: string; status: string }[];
  }

  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', 1, 1)`,
      )
      .run();

    engineRepo = mkdtempSync(join(tmpdir(), 'autopilot-verify-by-sweep-'));
    mkdirSync(join(engineRepo, 'docs'), { recursive: true });
    writeFileSync(
      join(engineRepo, 'docs', 'RESEARCH-LIBRARY.md'),
      '## Some topic (2026-08-01, verify by 2026-08-15)\n\nBody text.\n',
    );
  });

  afterEach(() => {
    store.db.close();
    rmSync(engineRepo, { recursive: true, force: true });
  });

  it('proposes a re-verification when the flight IS the engine repo flying itself', () => {
    runVerifyBySweep(store, 'p1', () => NOW, engineRepo, engineRepo);

    expect(verifyByTasks()).toHaveLength(1);
  });

  it('proposes nothing when the flight target is a different repo than the engine checkout', () => {
    const target = mkdtempSync(join(tmpdir(), 'autopilot-verify-by-target-'));
    try {
      runVerifyBySweep(store, 'p1', () => NOW, target, engineRepo);

      expect(verifyByTasks()).toEqual([]);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it('is best-effort — a query failure never throws', () => {
    store.db.close();
    expect(() => runVerifyBySweep(store, 'p1', () => NOW, engineRepo, engineRepo)).not.toThrow();
  });
});

/**
 * runFleetWisdomSweep (post-flight-sweeps.ts) had zero direct coverage —
 * only its pure decision (fleet-wisdom-mining.ts's mineFleetWisdom) was
 * tested. This proves the sweep's own DB-facing contract: it reads every
 * project's SOUL plus the fleet row from the SAME store, and writes a
 * pending fleet.wisdom_proposed only once a registered learning has
 * generalized across enough distinct projects.
 */
describe('runFleetWisdomSweep', () => {
  let store: Store;

  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
  });

  afterEach(() => store.db.close());

  function seedProjectSoul(slug: string, soul: string): void {
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, soul, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'flying', ?, 1, 1)`,
      )
      .run(slug, slug, slug, `/tmp/${slug}`, soul);
  }

  function fleetRow(): { wisdom: string; wisdomProposed: string | null } {
    return store.db
      .prepare(`SELECT wisdom, wisdom_proposed AS wisdomProposed FROM fleet WHERE id = 'fleet'`)
      .get() as { wisdom: string; wisdomProposed: string | null };
  }

  it('proposes fleet wisdom once a learning generalizes across the threshold of distinct projects', () => {
    for (let i = 0; i < FLEET_WISDOM_GENERALIZATION_THRESHOLD; i++) {
      seedProjectSoul(`p${i}`, `${CHECKPOINT_SOUL_AMENDMENT_MARKER}\n- some note\n`);
    }

    runFleetWisdomSweep(store, () => 12345);

    const row = fleetRow();
    expect(row.wisdomProposed).not.toBeNull();
    expect(row.wisdomProposed).toContain(CHECKPOINT_SOUL_AMENDMENT_MARKER);
    expect(row.wisdomProposed).toContain(String(FLEET_WISDOM_GENERALIZATION_THRESHOLD));
  });

  it('proposes nothing when fewer than the threshold of distinct projects carry the marker', () => {
    for (let i = 0; i < FLEET_WISDOM_GENERALIZATION_THRESHOLD - 1; i++) {
      seedProjectSoul(`p${i}`, `${CHECKPOINT_SOUL_AMENDMENT_MARKER}\n- some note\n`);
    }

    runFleetWisdomSweep(store, () => 12345);

    expect(fleetRow().wisdomProposed).toBeNull();
  });

  it('is best-effort — a query failure never throws', () => {
    store.db.close();
    expect(() => runFleetWisdomSweep(store, () => 12345)).not.toThrow();
  });
});

/**
 * runSoulMiningSweep (post-flight-sweeps.ts) had zero direct coverage — only
 * its pure decisions (soul-mining.ts's mineSoulAmendment/pruneSoulAmendment/
 * mineNoopSoulAmendment/pruneNoopSoulAmendment) were tested. This proves the
 * sweep's own DB-facing contract: it reads a project's soul/soul_proposed
 * plus its most recent metrics.gate_result rows from the SAME store, and
 * writes a pending projects.soul_proposed only once a registered learning's
 * gate-result streak has actually happened.
 */
describe('runSoulMiningSweep', () => {
  let store: Store;

  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, soul, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', '# SOUL', 1, 1)`,
      )
      .run();
  });

  afterEach(() => store.db.close());

  function shipGateResult(firingId: string, gateResult: string, createdAt: number): void {
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, gate_result, created_at)
         VALUES ('p1', ?, ?, ?)`,
      )
      .run(firingId, gateResult, createdAt);
  }

  function soulProposed(): string | null {
    return (
      store.db
        .prepare(`SELECT soul_proposed AS soulProposed FROM projects WHERE id = 'p1'`)
        .get() as {
        soulProposed: string | null;
      }
    ).soulProposed;
  }

  it('proposes a SOUL amendment once the newest firings all checkpointed', () => {
    for (let i = 0; i < CHECKPOINT_STREAK_THRESHOLD; i++) {
      shipGateResult(`f-${i}`, 'checkpointed', i + 1);
    }

    runSoulMiningSweep(store, 'p1', () => 12345);

    expect(soulProposed()).toContain(CHECKPOINT_SOUL_AMENDMENT_MARKER);
  });

  it('proposes nothing when the checkpoint streak has not happened', () => {
    shipGateResult('f-0', 'shipped', 1);
    for (let i = 1; i < CHECKPOINT_STREAK_THRESHOLD; i++) {
      shipGateResult(`f-${i}`, 'checkpointed', i + 1);
    }

    runSoulMiningSweep(store, 'p1', () => 12345);

    expect(soulProposed()).toBeNull();
  });

  it('proposes nothing when a proposal is already pending', () => {
    store.db.prepare(`UPDATE projects SET soul_proposed = 'pending draft' WHERE id = 'p1'`).run();
    for (let i = 0; i < CHECKPOINT_STREAK_THRESHOLD; i++) {
      shipGateResult(`f-${i}`, 'checkpointed', i + 1);
    }

    runSoulMiningSweep(store, 'p1', () => 12345);

    expect(soulProposed()).toBe('pending draft');
  });

  it('is best-effort — a query failure never throws', () => {
    store.db.close();
    expect(() => runSoulMiningSweep(store, 'p1', () => 12345)).not.toThrow();
  });
});

/**
 * runStaleClaimSweep — the flight-end half of the claims ledger (operator,
 * 2026-09-13: "a system that really releases the claims"). Role honesty
 * first: a guest identity never even lists the pool; the maintainer frees
 * exactly the claims quiet past the window, note first, unassign only when
 * there is an assignee to remove.
 */
describe('runStaleClaimSweep', () => {
  const NOW = Date.parse('2026-09-30T00:00:00Z');

  function poolExec(
    login: string,
    ownerLogin: string,
    issues: ReadonlyArray<{
      number: number;
      assignees: readonly string[];
      comments: ReadonlyArray<{ author: string; createdAt: string; body: string }>;
    }>,
    calls: Array<readonly string[]>,
  ): CliExec {
    return vi.fn(async (_bin, args) => {
      calls.push(args);
      if (args[0] === 'api' && args[1] === 'user')
        return { code: 0, stdout: JSON.stringify({ login }) };
      if (args[0] === 'repo' && args[1] === 'view') {
        return {
          code: 0,
          stdout: JSON.stringify({
            nameWithOwner: `${ownerLogin}/hello-world`,
            url: `https://github.com/${ownerLogin}/hello-world`,
            isPrivate: false,
          }),
        };
      }
      const shaped = (issue: (typeof issues)[number]) => ({
        number: issue.number,
        title: `issue #${issue.number}`,
        url: `https://github.com/${ownerLogin}/hello-world/issues/${issue.number}`,
        labels: [{ name: 'pool: ux' }],
        assignees: issue.assignees.map((l) => ({ login: l })),
        comments: issue.comments.map((c) => ({
          author: { login: c.author },
          createdAt: c.createdAt,
          body: c.body,
        })),
      });
      if (args[0] === 'issue' && args[1] === 'list') {
        return { code: 0, stdout: JSON.stringify(issues.map(shaped)) };
      }
      if (args[0] === 'issue' && args[1] === 'view') {
        const issue = issues.find((i) => i.number === Number(args[2]));
        if (!issue) return { code: 1, stdout: '' };
        return {
          code: 0,
          stdout: JSON.stringify({
            ...shaped(issue),
            state: 'OPEN',
            updatedAt: '2026-09-01T00:00:00Z',
          }),
        };
      }
      return { code: 0, stdout: '' };
    });
  }

  it('a guest identity never lists the pool, let alone writes', async () => {
    const calls: Array<readonly string[]> = [];
    const exec = poolExec('guest', 'owner', [], calls);

    expect(await runStaleClaimSweep(() => NOW, exec)).toEqual([]);

    expect(calls.some((a) => a[0] === 'issue')).toBe(false);
  });

  it('the maintainer releases a comment-only claim quiet past 14 days with a note alone', async () => {
    const calls: Array<readonly string[]> = [];
    const exec = poolExec(
      'owner',
      'owner',
      [
        {
          number: 27,
          assignees: [],
          comments: [
            {
              author: 'gabibi555',
              createdAt: '2026-09-11T14:23:10Z',
              body: 'Claimed by gabibi555 via the pool client.',
            },
          ],
        },
        {
          number: 30,
          assignees: ['fresh'],
          comments: [
            {
              author: 'fresh',
              createdAt: '2026-09-29T00:00:00Z',
              body: 'Claimed by fresh via the pool client.',
            },
          ],
        },
      ],
      calls,
    );

    const released = await runStaleClaimSweep(() => NOW, exec);

    expect(released.map((r) => [r.number, r.assignee])).toEqual([[27, 'gabibi555']]);
    const writes = calls.filter((a) => a[0] === 'issue' && (a[1] === 'comment' || a[1] === 'edit'));
    expect(writes).toEqual([
      [
        'issue',
        'comment',
        '27',
        '--body',
        expect.stringMatching(/^Releasing @gabibi555 — quiet for 18 days/),
      ],
    ]);
  });

  it('unassigns an assigned stale claim after the note', async () => {
    const calls: Array<readonly string[]> = [];
    const exec = poolExec(
      'owner',
      'owner',
      [
        {
          number: 5,
          assignees: ['quiet-one'],
          comments: [
            {
              author: 'quiet-one',
              createdAt: '2026-08-01T00:00:00Z',
              body: 'Claimed by quiet-one via the pool client.',
            },
          ],
        },
      ],
      calls,
    );

    await runStaleClaimSweep(() => NOW, exec);

    expect(
      calls
        .filter((a) => a[0] === 'issue' && a[1] !== 'list' && a[1] !== 'view')
        .map((a) => a.slice(0, 4)),
    ).toEqual([
      ['issue', 'comment', '5', '--body'],
      ['issue', 'edit', '5', '--remove-assignee'],
    ]);
  });

  it('never throws — a broken gh is a silent no-op', async () => {
    const exec: CliExec = vi.fn(async () => {
      throw new Error('gh exploded');
    });
    expect(await runStaleClaimSweep(() => NOW, exec)).toEqual([]);
  });
});

/**
 * runReconciliationProposalSweep (post-flight-sweeps.ts) had zero direct
 * coverage — only its pure helper (read/reconcile.ts's
 * findReconciliationCandidates) was tested. This proves the sweep's own
 * wiring: it reads the project's open (queued/in_progress) tasks, scores
 * them against recent commit subjects, and prints one console line per
 * candidate — proposal-only, it never mutates the store.
 */
describe('runReconciliationProposalSweep', () => {
  let store: Store;

  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', 1, 1)`,
      )
      .run();
  });

  afterEach(() => store.db.close());

  function seedTask(id: string, title: string, status: string): void {
    store.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, status, source, created_at, updated_at)
         VALUES (?, 'p1', ?, ?, 'self', 1, 1)`,
      )
      .run(id, title, status);
  }

  function fakeVcs(commits: ReadonlyArray<{ shortSha: string; subject: string }>): GitVcs {
    return {
      recentCommits: async () => commits.map((c) => ({ ...c, files: [] })),
    } as unknown as GitVcs;
  }

  it('logs a possible-ship line for an open task whose title matches a recent commit subject', async () => {
    seedTask('t1', 'add dark mode toggle to settings panel', 'queued');
    const vcs = fakeVcs([
      { shortSha: 'abc1234', subject: 'add dark mode toggle to settings panel' },
    ]);
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    await runReconciliationProposalSweep(store, 'p1', vcs);

    const lines = write.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes('t1') && l.includes('abc1234'))).toBe(true);
    write.mockRestore();
  });

  it('never proposes an already-done task, even when its title matches perfectly', async () => {
    seedTask('t2', 'add dark mode toggle to settings panel', 'done');
    const vcs = fakeVcs([
      { shortSha: 'abc1234', subject: 'add dark mode toggle to settings panel' },
    ]);
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    await runReconciliationProposalSweep(store, 'p1', vcs);

    const lines = write.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes('t2'))).toBe(false);
    write.mockRestore();
  });

  it('is best-effort — a query failure never throws', async () => {
    store.db.close();
    await expect(runReconciliationProposalSweep(store, 'p1', fakeVcs([]))).resolves.toBeUndefined();
  });
});

/**
 * runClosedTaskAuditSweep (post-flight-sweeps.ts) had zero direct coverage —
 * only its pure decision (closed-task-audit.ts's findClosedTaskAuditFindings)
 * was tested. This proves the sweep's own wiring: it reads the project's DONE
 * tasks from the store, re-checks each DELIVERABLE clause against the
 * current tree, and proposes a `closedaudit-<taskId>` task through the same
 * approval gate every other self-mined sweep uses.
 */
describe('runClosedTaskAuditSweep', () => {
  let store: Store;

  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', 1, 1)`,
      )
      .run();
  });

  afterEach(() => store.db.close());

  function seedDoneTask(id: string, title: string): void {
    store.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, status, source, created_at, updated_at)
         VALUES (?, 'p1', ?, 'done', 'self', 1, 1)`,
      )
      .run(id, title);
  }

  function closedAuditTasks(): { id: string; status: string }[] {
    return store.db
      .prepare("SELECT id, status FROM tasks WHERE project_id = 'p1' AND id LIKE 'closedaudit-%'")
      .all() as { id: string; status: string }[];
  }

  function fakeVcs(haystack: string): AuditVcs {
    const lower = haystack.toLowerCase();
    return {
      async containsText(pattern: string): Promise<boolean> {
        return lower.includes(pattern.toLowerCase());
      },
      async filesContainingText(pattern: string): Promise<readonly string[]> {
        return lower.includes(pattern.toLowerCase()) ? ['apps/dashboard/src/web/generic.ts'] : [];
      },
    };
  }

  it("proposes a re-check when a done task's DELIVERABLE clause no longer checks out", async () => {
    seedDoneTask('t1', 'add a tooltip DELIVERABLE: adds a tooltip to the button');

    await runClosedTaskAuditSweep(
      store,
      'p1',
      fakeVcs('nothing relevant here') as unknown as GitVcs,
      () => 12345,
    );

    expect(closedAuditTasks()).toEqual([{ id: 'closedaudit-t1', status: 'needs_approval' }]);
  });

  it('proposes nothing when the DELIVERABLE clause still checks out', async () => {
    seedDoneTask('t2', 'add a tooltip DELIVERABLE: adds a tooltip to the button');

    await runClosedTaskAuditSweep(
      store,
      'p1',
      fakeVcs('a tooltip renders on hover') as unknown as GitVcs,
      () => 12345,
    );

    expect(closedAuditTasks()).toEqual([]);
  });

  it('is best-effort — a query failure never throws', async () => {
    store.db.close();
    await expect(
      runClosedTaskAuditSweep(store, 'p1', fakeVcs('') as unknown as GitVcs, () => 12345),
    ).resolves.toBeUndefined();
  });
});

/**
 * runStoreBackupSweep (post-flight-sweeps.ts) had zero direct coverage —
 * only the snapshot primitives it calls (@autopilot/store's
 * createSnapshot/pruneSnapshots) were tested. This proves the sweep's own
 * wiring: it derives the backup directory from `dbPath`, snapshots the live
 * store into it, and degrades to a logged skip rather than throwing when the
 * backup itself can't be created.
 */
describe('runStoreBackupSweep', () => {
  let store: Store;
  let tmpDir: string;

  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', 1, 1)`,
      )
      .run();
    tmpDir = mkdtempSync(join(tmpdir(), 'autopilot-store-backup-sweep-'));
  });

  afterEach(() => {
    store.db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('snapshots the live store into a backups/ dir next to dbPath', async () => {
    const dbPath = join(tmpDir, 'live.db');

    await runStoreBackupSweep(store, dbPath, () => 1_700_000_000_000);

    const files = readdirSync(join(tmpDir, 'backups'));
    expect(files).toHaveLength(1);
  });

  it('is best-effort — a directory that cannot be created never throws', async () => {
    const blockerFile = join(tmpDir, 'not-a-dir');
    writeFileSync(blockerFile, 'x');
    const dbPath = join(blockerFile, 'sub', 'live.db');

    await expect(
      runStoreBackupSweep(store, dbPath, () => 1_700_000_000_000),
    ).resolves.toBeUndefined();
  });
});
