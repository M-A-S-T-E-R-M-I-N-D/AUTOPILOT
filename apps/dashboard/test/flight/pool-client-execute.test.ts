// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import type * as AutopilotStore from '@autopilot/store';
import {
  createPoolClientPreviewApi,
  createPoolClientExecuteApi,
} from '../../src/flight/pool-client-execute.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

// The execute API opens the store itself; wrapping `openStore` lets a test see
// WHEN it was opened (only once a project id is passed) and that it was closed
// again on every exit path — the same wrapper issue-triage-execute.test.ts uses.
vi.mock('@autopilot/store', async (importOriginal) => {
  const actual = await importOriginal<typeof AutopilotStore>();
  return { ...actual, openStore: vi.fn(actual.openStore) };
});

function execFor(issues: unknown[], viewerLogin: string | undefined): CliExec {
  return vi.fn(async (bin, args) => {
    if (args[0] === 'issue' && args[1] === 'list') {
      return { code: 0, stdout: JSON.stringify(issues) };
    }
    if (args[0] === 'api' && args[1] === 'user') {
      return viewerLogin === undefined
        ? { code: 1, stdout: '' }
        : { code: 0, stdout: JSON.stringify({ login: viewerLogin }) };
    }
    return { code: 0, stdout: '' };
  });
}

function project(s: Store, id: string, root: string = '/tmp/' + id): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', NULL, ?, ?)`,
    )
    .run(id, id, id, root, 100, 100);
}

/** A real git checkout whose origin is `remote` — routing reads the project's
 *  actual git remote, so the fixture has to have one. */
function checkoutOf(remote: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ap-pool-checkout-'));
  execFileSync('git', ['init', '-q', dir], { windowsHide: true });
  execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', remote], { windowsHide: true });
  return dir;
}

/** A real git checkout that has NO origin remote — a fresh local `git init`
 *  nobody has pushed anywhere yet, so routing cannot tie it to any issue. */
function checkoutWithoutOrigin(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ap-pool-local-'));
  execFileSync('git', ['init', '-q', dir], { windowsHide: true });
  return dir;
}

/** One open, unassigned pool issue on example/repo — the claimable shape
 *  every execute-path edge below starts from. */
function pooledIssue(number: number = 42): unknown {
  return {
    number,
    title: 'Keyboard nav is broken',
    url: `https://github.com/example/repo/issues/${number}`,
    labels: [{ name: 'pool: accessibility' }],
    assignees: [],
  };
}

/** The Store the API under test opened last — read through the `openStore`
 *  wrapper above, so a test can assert it was closed again. */
function lastOpenedStore(): Store {
  const results = vi.mocked(openStore).mock.results;
  const last = results[results.length - 1];
  if (last === undefined || last.type !== 'return') throw new Error('openStore was never called');
  return last.value as Store;
}

function tasks(s: Store, projectId: string): { id: string; source: string }[] {
  return s.db
    .prepare('SELECT id, source FROM tasks WHERE project_id = ? ORDER BY id')
    .all(projectId) as { id: string; source: string }[];
}

function withTempDb(fn: (dbPath: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'ap-dash-pool-client-execute-db-'));
  return (async () => {
    try {
      await fn(join(dir, 'a.db'));
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  })();
}

describe('createPoolClientPreviewApi', () => {
  it('pairs every open pool issue with its claim decision for the resolved viewer', async () => {
    const exec = execFor(
      [
        {
          number: 7,
          title: 'Fix the thing',
          url: 'https://github.com/example/repo/issues/7',
          labels: [{ name: 'pool: ux' }],
          assignees: [],
        },
      ],
      'octocat',
    );
    const api = createPoolClientPreviewApi(exec);

    const entries = await api();

    expect(entries).toHaveLength(1);
    expect(entries[0]?.issue.number).toBe(7);
    expect(entries[0]?.decision.decision).toBe('claim');
  });

  it('plans a skip for every issue when the viewer identity fails to resolve', async () => {
    const exec = execFor(
      [
        {
          number: 7,
          title: 'Fix the thing',
          url: 'https://github.com/example/repo/issues/7',
          labels: [{ name: 'pool: ux' }],
          assignees: [],
        },
      ],
      undefined,
    );
    const api = createPoolClientPreviewApi(exec);

    const entries = await api();

    expect(entries[0]?.decision.decision).toBe('skip');
  });

  it('defaults to the real CLI exec when none is injected', () => {
    expect(() => createPoolClientPreviewApi()).not.toThrow();
  });
});

describe('createPoolClientExecuteApi', () => {
  it('claims a pooled, unassigned issue by number when no project is given', async () =>
    withTempDb(async (dbPath) => {
      const exec = execFor(
        [
          {
            number: 7,
            title: 'Fix the thing',
            url: 'https://github.com/example/repo/issues/7',
            labels: [{ name: 'pool: ux' }],
            assignees: [],
          },
        ],
        'octocat',
      );
      const api = createPoolClientExecuteApi(dbPath, exec);

      const result = await api(7);

      expect(result.decision.decision).toBe('claim');
      expect(result.commandResults).toHaveLength(2);
      expect(result.taskQueued).toBe(false);
    }));

  it('resolves a skip (never throws/nulls) for an issue no longer in the open pool', async () =>
    withTempDb(async (dbPath) => {
      const exec = execFor([], 'octocat');
      const api = createPoolClientExecuteApi(dbPath, exec);

      const result = await api(404);

      expect(result.decision.decision).toBe('skip');
      expect(result.commandResults).toEqual([]);
      expect(result.taskQueued).toBe(false);
    }));

  it('also queues a local board task on a project that is a checkout of the issue repository', async () =>
    withTempDb(async (dbPath) => {
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', checkoutOf('https://github.com/example/repo.git'));
      s.close();

      const exec = execFor(
        [
          {
            number: 42,
            title: 'Keyboard nav is broken',
            url: 'https://github.com/example/repo/issues/42',
            labels: [{ name: 'pool: accessibility' }],
            assignees: [],
          },
        ],
        'octocat',
      );
      const api = createPoolClientExecuteApi(dbPath, exec);

      const result = await api(42, 'p1');

      expect(result.decision.decision).toBe('claim');
      expect(result.taskQueued).toBe(true);

      const s2 = openStore(dbPath, { readonly: true });
      try {
        expect(tasks(s2, 'p1')).toEqual([{ id: 'github-42', source: 'github' }]);
      } finally {
        s2.close();
      }
    }));

  it('claims on GitHub but refuses to queue the task on a project that is a checkout of another repository', async () =>
    withTempDb(async (dbPath) => {
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'calc', checkoutOf('https://github.com/someone/calculator.git'));
      s.close();
      const exec = execFor(
        [
          {
            number: 42,
            title: 'Keyboard nav is broken',
            url: 'https://github.com/example/repo/issues/42',
            labels: [{ name: 'pool: accessibility' }],
            assignees: [],
          },
        ],
        'octocat',
      );
      const result = await createPoolClientExecuteApi(dbPath, exec)(42, 'calc');
      expect(result.decision.decision).toBe('claim');
      expect(result.taskQueued).toBe(false);
      expect(result.route).toMatchObject({ ok: false, reason: 'not-connected' });
      const s2 = openStore(dbPath, { readonly: true });
      try {
        expect(tasks(s2, 'calc')).toEqual([]);
      } finally {
        s2.close();
      }
    }));

  it('claims the issue but does not queue a task for an unknown project id', async () =>
    withTempDb(async (dbPath) => {
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      const exec = execFor(
        [
          {
            number: 42,
            title: 'Keyboard nav is broken',
            url: 'https://github.com/example/repo/issues/42',
            labels: [{ name: 'pool: accessibility' }],
            assignees: [],
          },
        ],
        'octocat',
      );
      const api = createPoolClientExecuteApi(dbPath, exec);

      const result = await api(42, 'nope');

      expect(result.decision.decision).toBe('claim');
      expect(result.taskQueued).toBe(false);
    }));

  it('defaults to the real CLI exec when none is injected', async () =>
    withTempDb(async (dbPath) => {
      expect(() => createPoolClientExecuteApi(dbPath)).not.toThrow();
    }));

  // EPIC 0019 additive-only law: the claim flow's execute wiring keeps its
  // existing contracts — a plain claim never opens the store, every branch
  // that does open it closes it again, a skip never becomes a board task, and
  // the claim contract's FOCUS rides through the HTTP wiring unchanged.

  it('never opens the store for a plain claim — only a project id pays for it', async () =>
    withTempDb(async (dbPath) => {
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', checkoutOf('https://github.com/example/repo.git'));
      s.close();
      const api = createPoolClientExecuteApi(dbPath, execFor([pooledIssue()], 'octocat'));

      vi.mocked(openStore).mockClear();
      await api(42);
      expect(openStore).not.toHaveBeenCalled();

      await api(42, 'p1');
      expect(openStore).toHaveBeenCalledTimes(1);
      expect(openStore).toHaveBeenLastCalledWith(dbPath);
      expect(lastOpenedStore().db.open).toBe(false);
    }));

  it('closes the store and plans no route when a known project is given but the issue left the open pool', async () =>
    withTempDb(async (dbPath) => {
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', checkoutOf('https://github.com/example/repo.git'));
      s.close();
      const api = createPoolClientExecuteApi(dbPath, execFor([], 'octocat'));

      vi.mocked(openStore).mockClear();
      const result = await api(404, 'p1');

      expect(result.decision.decision).toBe('skip');
      expect(result.issue).toBeUndefined();
      expect(result.commandResults).toEqual([]);
      expect(result).toMatchObject({ taskQueued: false, focused: false });
      expect(result.route).toBeUndefined();
      expect(lastOpenedStore().db.open).toBe(false);
      const s2 = openStore(dbPath, { readonly: true });
      try {
        expect(tasks(s2, 'p1')).toEqual([]);
      } finally {
        s2.close();
      }
    }));

  it('queues nothing on a connected project when the viewer identity cannot be resolved — a skip is never a task', async () =>
    withTempDb(async (dbPath) => {
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', checkoutOf('https://github.com/example/repo.git'));
      s.close();
      const api = createPoolClientExecuteApi(dbPath, execFor([pooledIssue()], undefined));

      const result = await api(42, 'p1');

      expect(result.decision.decision).toBe('skip');
      expect(result.commandResults).toEqual([]);
      expect(result).toMatchObject({ taskQueued: false, focused: false });
      expect(result.route).toEqual({ ok: true, projectId: 'p1' });
      const s2 = openStore(dbPath, { readonly: true });
      try {
        expect(tasks(s2, 'p1')).toEqual([]);
      } finally {
        s2.close();
      }
    }));

  it('claims on GitHub but refuses a registered project whose checkout has no origin remote, naming it', async () =>
    withTempDb(async (dbPath) => {
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'local', checkoutWithoutOrigin());
      s.close();
      const api = createPoolClientExecuteApi(dbPath, execFor([pooledIssue()], 'octocat'));

      const result = await api(42, 'local');

      expect(result.decision.decision).toBe('claim');
      expect(result.commandResults).toHaveLength(2);
      expect(result).toMatchObject({ taskQueued: false, focused: false });
      expect(result.route).toEqual({
        ok: false,
        reason: 'not-connected',
        detail: expect.stringContaining('"local"'),
        candidates: [],
      });
      expect(result.route).toMatchObject({ detail: expect.stringContaining('example/repo') });
      const s2 = openStore(dbPath, { readonly: true });
      try {
        expect(tasks(s2, 'local')).toEqual([]);
      } finally {
        s2.close();
      }
    }));

  it('focuses the task it queues and reports the route it took — the claim contract rides the HTTP wiring', async () =>
    withTempDb(async (dbPath) => {
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', checkoutOf('https://github.com/example/repo.git'));
      s.close();
      const api = createPoolClientExecuteApi(dbPath, execFor([pooledIssue()], 'octocat'));

      const result = await api(42, 'p1');

      expect(result).toMatchObject({
        taskQueued: true,
        focused: true,
        route: { ok: true, projectId: 'p1' },
      });
      const s2 = openStore(dbPath, { readonly: true });
      try {
        const row = s2.db.prepare('SELECT focus FROM tasks WHERE id = ?').get('github-42') as {
          focus: number;
        };
        expect(row.focus).toBe(1);
      } finally {
        s2.close();
      }
    }));

  it('closes the store even when the claim itself throws', async () =>
    withTempDb(async (dbPath) => {
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', checkoutOf('https://github.com/example/repo.git'));
      s.close();
      const exec: CliExec = vi.fn(async () => {
        throw new Error('gh exploded');
      });
      const api = createPoolClientExecuteApi(dbPath, exec);

      vi.mocked(openStore).mockClear();
      await expect(api(42, 'p1')).rejects.toThrow('gh exploded');

      expect(openStore).toHaveBeenCalledTimes(1);
      expect(lastOpenedStore().db.open).toBe(false);
    }));
});
