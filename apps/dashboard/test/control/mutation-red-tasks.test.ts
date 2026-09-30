// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE NIGHTLY MUTATION RUN REACHES THE BOARD (operator, 2026-09-27: "the
 * fault keeps coming back"): mutation.yml was red night after night and
 * nothing filed a task.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, setAutoApprove, type Store } from '@autopilot/store';
import {
  mutationRedTaskTitle,
  parseMutationLog,
  readLatestMutationRed,
  syncMutationRedTasks,
  type MutationRedConfig,
} from '../../src/control/mutation-red-tasks.js';

const TS = '2026-09-28T17:30:46.8569373Z ';

/** A shard's job log as the Actions API returns it: every line time-stamped. */
function shardLog(): string {
  return [
    '> node scripts/ci/run-all-mutation.mjs -- --shard 1/6',
    'run-all-mutation: shard 1/6 — 22 of 130 config(s)',
    '[Survived] MethodExpression',
    'scripts/ci/audit-board-flood.mjs:54:16',
    "-     const flat = (body ?? '').replace(/\\s+/g, ' ').trim();",
    "+     const flat = (body ?? '').replace(/\\s+/g, ' ');",
    'Tests ran:',
    '[Survived] Regex',
    'scripts/ci/audit-board-flood.mjs:54:37',
    "-     const flat = (body ?? '').replace(/\\s+/g, ' ').trim();",
    "+     const flat = (body ?? '').replace(/\\s/g, ' ').trim();",
    'run-all-mutation: FAILED — stryker.ci-audit-board-flood.config.mjs: exit 1 — below the break threshold: a mutant survived (continuing; summary at the end)',
    '[Survived] ConditionalExpression',
    'apps/dashboard/src/flight/lock.ts:88:9',
    '-   if (info === null) return [];',
    '+   if (false) return [];',
    'run-all-mutation: FAILED — stryker.dashboard-lock.config.mjs: exit 1 — below the break threshold: a mutant survived (continuing; summary at the end)',
    'run-all-mutation: 20/22 passed',
    'run-all-mutation: FAILED stryker.ci-audit-board-flood.config.mjs — exit 1 — below the break threshold: a mutant survived',
    'run-all-mutation: FAILED stryker.dashboard-lock.config.mjs — exit 1 — below the break threshold: a mutant survived',
  ]
    .map((line) => TS + line)
    .join('\n');
}

describe('parseMutationLog', () => {
  it('gives each failing config the survivors printed just before its FAILED line', () => {
    expect(parseMutationLog(shardLog())).toEqual([
      {
        config: 'stryker.ci-audit-board-flood.config.mjs',
        survivors: [
          {
            mutator: 'MethodExpression',
            location: 'scripts/ci/audit-board-flood.mjs:54',
            replacement: "const flat = (body ?? '').replace(/\\s+/g, ' ');",
          },
          {
            mutator: 'Regex',
            location: 'scripts/ci/audit-board-flood.mjs:54',
            replacement: "const flat = (body ?? '').replace(/\\s/g, ' ').trim();",
          },
        ],
      },
      {
        config: 'stryker.dashboard-lock.config.mjs',
        survivors: [
          {
            mutator: 'ConditionalExpression',
            location: 'apps/dashboard/src/flight/lock.ts:88',
            replacement: 'if (false) return [];',
          },
        ],
      },
    ]);
  });

  it('reads a green shard as no red configs, and strips colour codes', () => {
    expect(parseMutationLog(`${TS}run-all-mutation: 22/22 passed`)).toEqual([]);
    const coloured = `${TS}\u001b[31mrun-all-mutation: FAILED — stryker.engine-gate.config.mjs: exit 1\u001b[0m`;
    expect(parseMutationLog(coloured).map((r) => r.config)).toEqual([
      'stryker.engine-gate.config.mjs',
    ]);
  });
});

describe('readLatestMutationRed', () => {
  it('reads nothing past the run list when the latest run passed, and says when it started', () => {
    const gh = vi.fn((_args: readonly string[]) =>
      JSON.stringify([{ databaseId: 9, conclusion: 'success', createdAt: '2026-09-29T15:33:26Z' }]),
    );
    expect(readLatestMutationRed(gh, 'o/r')).toEqual({
      evidenceAt: Date.parse('2026-09-29T15:33:26Z'),
      red: [],
    });
    expect(gh).toHaveBeenCalledTimes(1);
    expect(gh.mock.calls[0]![0]).toContain('databaseId,conclusion,createdAt,headSha');
  });

  it('takes a run with no readable start as the oldest possible', () => {
    const gh = () => JSON.stringify([{ databaseId: 9, conclusion: 'success', createdAt: 'soon' }]);
    expect(readLatestMutationRed(gh, 'o/r')?.evidenceAt).toBe(0);
  });

  /** The 2026-09-30 timeline: a 14:59 dispatch judged a head landed at 11:46;
   *  the fix had closed its task at 12:02. */
  const RUN = { databaseId: 9, conclusion: 'failure', createdAt: '2026-09-30T14:59:03Z' };
  const HEAD = '82f45dd788135592f72e5d0dd0c1a4880b05e7b1';
  const HEAD_COMMITTED = '2026-09-30T11:46:53Z';
  function redRunGh(commit: (sha: string) => string) {
    return vi.fn((args: readonly string[]): string => {
      if (args[0] === 'run') return JSON.stringify([{ ...RUN, headSha: HEAD }]);
      if (args[1] === `repos/o/r/commits/${HEAD}`) return commit(HEAD);
      if (args[1] === 'repos/o/r/actions/runs/9/jobs?per_page=50') {
        return JSON.stringify({ jobs: [{ id: 1, conclusion: 'failure' }] });
      }
      if (args[1] === 'repos/o/r/actions/jobs/1/logs') return shardLog();
      throw new Error(`unexpected gh call: ${args.join(' ')}`);
    });
  }

  it("dates a red run's evidence by the commit it judged, not by when it started (2026-09-30)", () => {
    // The run's start is the wrong bound: the fix at 12:02 was older than the
    // 14:59 start and newer than everything the run saw, so the watch filed
    // the config again and the next nightly closed it.
    const gh = redRunGh(() =>
      JSON.stringify({ sha: HEAD, commit: { committer: { date: HEAD_COMMITTED } } }),
    );
    const run = readLatestMutationRed(gh, 'o/r');
    expect(run?.evidenceAt).toBe(Date.parse(HEAD_COMMITTED));
    expect(run?.judged).toBe('82f45dd788');
    expect(run?.red.map((r) => r.config)).toEqual([
      'stryker.ci-audit-board-flood.config.mjs',
      'stryker.dashboard-lock.config.mjs',
    ]);
    expect(gh).toHaveBeenCalledTimes(4);
  });

  it("falls back to the run's start when the judged commit cannot be read", () => {
    const unreadable = readLatestMutationRed(
      redRunGh(() => {
        throw new Error('HTTP 404');
      }),
      'o/r',
    );
    expect(unreadable?.evidenceAt).toBe(Date.parse(RUN.createdAt));
    expect(unreadable?.red).toHaveLength(2);
    const undated = readLatestMutationRed(
      redRunGh(() => JSON.stringify({ sha: HEAD, commit: {} })),
      'o/r',
    );
    expect(undated?.evidenceAt).toBe(Date.parse(RUN.createdAt));
    // The head itself was readable, so the tasks can still name it.
    expect(undated?.judged).toBe('82f45dd788');
  });

  it('names no judged commit when the run reports a head that is not a commit id', () => {
    const gh = vi.fn((args: readonly string[]): string => {
      if (args[0] === 'run') return JSON.stringify([{ ...RUN, headSha: 'main; rm -rf /' }]);
      if (args[1] === 'repos/o/r/actions/runs/9/jobs?per_page=50') {
        return JSON.stringify({ jobs: [{ id: 1, conclusion: 'failure' }] });
      }
      if (args[1] === 'repos/o/r/actions/jobs/1/logs') return shardLog();
      throw new Error(`unexpected gh call: ${args.join(' ')}`);
    });
    const run = readLatestMutationRed(gh, 'o/r');
    expect(run?.red).toHaveLength(2);
    expect(run).not.toHaveProperty('judged');
    expect(gh).toHaveBeenCalledTimes(3);
  });

  it('is null when there is no completed run', () => {
    expect(readLatestMutationRed(() => '[]', 'o/r')).toBeNull();
  });

  it('reads the log of every failed job of a red run, and only those', () => {
    const gh = vi.fn((args: readonly string[]) => {
      if (args[0] === 'run') return JSON.stringify([{ databaseId: 9, conclusion: 'failure' }]);
      if (args[1] === 'repos/o/r/actions/runs/9/jobs?per_page=50') {
        return JSON.stringify({
          jobs: [
            { id: 1, conclusion: 'failure' },
            { id: 2, conclusion: 'success' },
          ],
        });
      }
      if (args[1] === 'repos/o/r/actions/jobs/1/logs') return shardLog();
      throw new Error(`unexpected gh call: ${args.join(' ')}`);
    });
    const run = readLatestMutationRed(gh, 'o/r');
    expect(run?.red.map((r) => r.config)).toEqual([
      'stryker.ci-audit-board-flood.config.mjs',
      'stryker.dashboard-lock.config.mjs',
    ]);
    expect(run).not.toHaveProperty('judged');
    expect(gh).toHaveBeenCalledTimes(3);
  });
});

describe('mutationRedTaskTitle', () => {
  it('names the commit the run judged when there is one, and keeps the config where the dedup reads it', () => {
    const none: MutationRedConfig = { config: 'stryker.engine-stream.config.mjs', survivors: [] };
    expect(mutationRedTaskTitle(none)).toBe(
      'MUTATION RED: stryker.engine-stream.config.mjs: mutants survived the nightly run — make the tests kill them',
    );
    expect(mutationRedTaskTitle(none, '0a2aed739c')).toBe(
      'MUTATION RED: stryker.engine-stream.config.mjs: mutants survived the nightly run on 0a2aed739c — make the tests kill them',
    );
  });
});

describe('syncMutationRedTasks', () => {
  let dir: string;
  let store: Store;
  const red = (config: string): MutationRedConfig => ({
    config,
    survivors: [{ mutator: 'Regex', location: 'scripts/ci/x.mjs:3', replacement: '/\\s/' }],
  });
  const tasks = (): { title: string; status: string; body: string }[] =>
    store.db.prepare('SELECT title, status, body FROM tasks ORDER BY title').all() as {
      title: string;
      status: string;
      body: string;
    }[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ap-mutred-'));
    store = openStore(join(dir, 'db.sqlite'));
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'registered', NULL, 1, 1)`,
      )
      .run();
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('files one task per red config, once, and auto mode sends it to the pool', () => {
    setAutoApprove(store, 'p1', true, 1);
    const reds = [red('stryker.ci-a.config.mjs'), red('stryker.engine-b.config.mjs')];
    expect(syncMutationRedTasks(store, 'p1', reds, 10)).toEqual({ filed: 2, closed: 0 });
    expect(syncMutationRedTasks(store, 'p1', reds, 20)).toEqual({ filed: 0, closed: 0 });
    expect(tasks().map((t) => [t.title, t.status])).toEqual([
      [mutationRedTaskTitle(reds[0]!), 'queued'],
      [mutationRedTaskTitle(reds[1]!), 'queued'],
    ]);
    expect(tasks()[0]!.body).toContain('- scripts/ci/x.mjs:3 — Regex: `/\\s/`');
    expect(tasks()[0]!.body).toContain(
      'pnpm exec stryker run config/mutation/stryker.ci-a.config.mjs',
    );
    expect(tasks()[0]!.body).not.toContain('git log');
  });

  it('names the commit its run judged and the git log that shows a fix landed since (2026-09-30)', () => {
    // Four tasks topped the board after their fixes had landed: the run had
    // judged a head from before them. Nothing on a task said which head, so
    // the firing that drew them spent its turns finding that out.
    const rateLimit: MutationRedConfig = {
      config: 'stryker.dashboard-rate-limit.config.mjs',
      survivors: [
        {
          mutator: 'ConditionalExpression',
          location: 'apps/dashboard/src/server/rate-limit.ts:49',
          replacement: 'x',
        },
        {
          mutator: 'EqualityOperator',
          location: 'apps/dashboard/src/server/rate-limit.ts:49',
          replacement: 'y',
        },
        { mutator: 'Regex', location: 'apps/dashboard/src/server/window.ts:7', replacement: 'z' },
      ],
    };
    syncMutationRedTasks(store, 'p1', [rateLimit], 10, 5, '2cf6e9195c');
    const [task] = tasks();
    expect(task!.title).toBe(mutationRedTaskTitle(rateLimit, '2cf6e9195c'));
    // Each file once, and by name wherever it sits: the fix is usually a test.
    expect(task!.body).toContain(
      "The run judged 2cf6e9195c. Check `git log --oneline 2cf6e9195c..HEAD -- '*/rate-limit.*' '*/window.*'` first:",
    );
    // A later run judging another head is the same config's task, not a second one.
    expect(syncMutationRedTasks(store, 'p1', [rateLimit], 20, 15, 'aaaaaaaaaa')).toEqual({
      filed: 0,
      closed: 0,
    });
    expect(syncMutationRedTasks(store, 'p1', [], 30, 25, 'bbbbbbbbbb')).toEqual({
      filed: 0,
      closed: 1,
    });
  });

  it('checks the whole history since the judged commit when the log listed no survivors', () => {
    syncMutationRedTasks(
      store,
      'p1',
      [{ config: 'stryker.engine-gate.config.mjs', survivors: [] }],
      10,
      5,
      '0a2aed739c',
    );
    expect(tasks()[0]!.body).toContain('`git log --oneline 0a2aed739c..HEAD` first:');
  });

  it("does not refile a config fixed after the run's evidence was cut, but does once a later run is still red (2026-09-30)", () => {
    // Every landing re-read the same pre-fix nightly run and re-filed nine
    // configs the lanes had just closed as fixed.
    const run = [red('stryker.engine-gate.config.mjs')];
    syncMutationRedTasks(store, 'p1', run, 10, 5);
    const id = (store.db.prepare('SELECT id FROM tasks').get() as { id: string }).id;
    store.db.prepare("UPDATE tasks SET status = 'done', updated_at = 50 WHERE id = ?").run(id);
    // A landing at 100 reads the run whose evidence was cut at 5, before the fix at 50.
    expect(syncMutationRedTasks(store, 'p1', run, 100, 5)).toEqual({ filed: 0, closed: 0 });
    // The next nightly run judged a head cut at 200, after the fix, and is still red.
    expect(syncMutationRedTasks(store, 'p1', run, 300, 200)).toEqual({ filed: 1, closed: 0 });
  });

  it('closes the task of a config the latest run no longer lists as red', () => {
    syncMutationRedTasks(
      store,
      'p1',
      [red('stryker.ci-a.config.mjs'), red('stryker.engine-b.config.mjs')],
      10,
    );
    expect(syncMutationRedTasks(store, 'p1', [red('stryker.engine-b.config.mjs')], 20)).toEqual({
      filed: 0,
      closed: 1,
    });
    expect(tasks().map((t) => t.status)).toEqual(['done', 'needs_approval']);
  });

  it('lists at most 40 survivors and says how many more there are', () => {
    const many: MutationRedConfig = {
      config: 'stryker.ci-big.config.mjs',
      survivors: Array.from({ length: 45 }, (_, i) => ({
        mutator: 'Regex',
        location: `scripts/ci/big.mjs:${i + 1}`,
        replacement: 'x',
      })),
    };
    syncMutationRedTasks(store, 'p1', [many], 10);
    const body = tasks()[0]!.body;
    expect(body).toContain('scripts/ci/big.mjs:40 ');
    expect(body).not.toContain('scripts/ci/big.mjs:41 ');
    expect(body).toContain('- …and 5 more');
    expect(tasks()[0]!.title).toContain('45 mutant(s) survived');
  });
});
