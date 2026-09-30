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
      startedAt: Date.parse('2026-09-29T15:33:26Z'),
      red: [],
    });
    expect(gh).toHaveBeenCalledTimes(1);
    expect(gh.mock.calls[0]![0]).toContain('databaseId,conclusion,createdAt');
  });

  it('takes a run with no readable start as the oldest possible', () => {
    const gh = () => JSON.stringify([{ databaseId: 9, conclusion: 'success', createdAt: 'soon' }]);
    expect(readLatestMutationRed(gh, 'o/r')?.startedAt).toBe(0);
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
    expect(readLatestMutationRed(gh, 'o/r')?.red.map((r) => r.config)).toEqual([
      'stryker.ci-audit-board-flood.config.mjs',
      'stryker.dashboard-lock.config.mjs',
    ]);
    expect(gh).toHaveBeenCalledTimes(3);
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
  });

  it('does not refile a config fixed after the run it reads began, but does once a later run is still red (2026-09-30)', () => {
    // Every landing re-read the same pre-fix nightly run and re-filed nine
    // configs the lanes had just closed as fixed.
    const run = [red('stryker.engine-gate.config.mjs')];
    syncMutationRedTasks(store, 'p1', run, 10, 5);
    const id = (store.db.prepare('SELECT id FROM tasks').get() as { id: string }).id;
    store.db.prepare("UPDATE tasks SET status = 'done', updated_at = 50 WHERE id = ?").run(id);
    // A landing at 100 reads the run that began at 5, before the fix at 50.
    expect(syncMutationRedTasks(store, 'p1', run, 100, 5)).toEqual({ filed: 0, closed: 0 });
    // The next nightly run began at 200, after the fix, and is still red.
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
