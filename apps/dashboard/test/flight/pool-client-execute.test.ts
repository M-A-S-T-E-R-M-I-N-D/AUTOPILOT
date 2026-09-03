// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import {
  createPoolClientPreviewApi,
  createPoolClientExecuteApi,
} from '../../src/flight/pool-client-execute.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

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

function project(s: Store, id: string): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', NULL, ?, ?)`,
    )
    .run(id, id, id, '/tmp/' + id, 100, 100);
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

  it('also queues a local board task when a known project id is given', async () =>
    withTempDb(async (dbPath) => {
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');
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
});
