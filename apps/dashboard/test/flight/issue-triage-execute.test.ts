// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, createTask, type Store } from '@autopilot/store';
import type * as AutopilotStore from '@autopilot/store';
import {
  createIssueTriagePreviewApi,
  createIssueTriageExecuteApi,
} from '../../src/flight/issue-triage-execute.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

vi.mock('@autopilot/store', async (importOriginal) => {
  const actual = await importOriginal<typeof AutopilotStore>();
  return { ...actual, openStore: vi.fn(actual.openStore) };
});

function project(s: Store, id: string, rootPath: string): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', NULL, ?, ?)`,
    )
    .run(id, id, id, rootPath, 100, 100);
}

function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

/** A `CliExec` stub that answers `gh issue list` with `issues` and every
 *  other call (label edit, comment) with a bare success. */
function issuesExec(issues: readonly unknown[] = []): CliExec {
  return vi.fn(async (_bin, args) => {
    if (args[0] === 'issue' && args[1] === 'list') {
      return { code: 0, stdout: JSON.stringify(issues) };
    }
    return { code: 0, stdout: '' };
  });
}

describe('createIssueTriagePreviewApi', () => {
  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-preview-unknown-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      expect(await createIssueTriagePreviewApi(dbPath, issuesExec())('nope')).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('plans a decision for every open issue against the board and backlog file, never mutating anything', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-preview-repo-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-preview-db-'));
    try {
      writeFileSync(join(repo, 'BACKLOG.md'), '- [ ] Add Hebrew RTL support\n');

      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      createTask(s, {
        id: 'web-abc',
        projectId: 'p1',
        title: 'Already tracked dashboard crash',
        createdAt: 100,
      });
      s.close();

      const exec = issuesExec([
        { number: 9, title: 'Keyboard nav is broken in the fleet table', body: 'aria issue' },
        { number: 10, title: 'Already tracked dashboard crash', body: '' },
        { number: 11, title: 'Add Hebrew RTL support', body: '' },
      ]);

      const plans = await createIssueTriagePreviewApi(dbPath, exec)('p1');

      expect(plans).toHaveLength(3);
      expect(plans?.[0]?.decision.decision).toBe('accept');
      expect(plans?.[1]?.decision).toMatchObject({ decision: 'duplicate', matchedId: 'web-abc' });
      expect(plans?.[2]?.decision).toMatchObject({
        decision: 'duplicate',
        matchedId: 'backlog:0',
      });
      // Read-only: only the `issue list` read happened, no label/comment write.
      expect(exec).toHaveBeenCalledTimes(1);

      const verify = openStore(dbPath);
      const rows = verify.db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number };
      expect(rows.n).toBe(1);
      verify.close();
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('counts a needs_approval proposal as still-open for dedup, same as a queued task', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-preview-proposal-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-preview-proposal-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      createTask(s, {
        id: 'web-proposal',
        projectId: 'p1',
        title: 'Already tracked dashboard crash',
        status: 'needs_approval',
        createdAt: 100,
      });
      s.close();

      const exec = issuesExec([{ number: 10, title: 'Already tracked dashboard crash', body: '' }]);

      const plans = await createIssueTriagePreviewApi(dbPath, exec)('p1');

      expect(plans?.[0]?.decision).toMatchObject({
        decision: 'duplicate',
        matchedId: 'web-proposal',
      });
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('defaults to the real CLI exec when none is injected', () => {
    expect(() => createIssueTriagePreviewApi('/tmp/unused.db')).not.toThrow();
  });

  it('opens the store read-only — a preview never writes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-preview-readonly-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      vi.mocked(openStore).mockClear();
      await createIssueTriagePreviewApi(dbPath, issuesExec())('p1');
      expect(openStore).toHaveBeenLastCalledWith(dbPath, { readonly: true });
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('createIssueTriageExecuteApi', () => {
  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-execute-unknown-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      expect(await createIssueTriageExecuteApi(dbPath, issuesExec())('nope')).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('runs the full ritual: labels/comments accepted issues via gh and creates their board tasks', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-execute-repo-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-execute-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      const exec = issuesExec([
        { number: 9, title: 'Keyboard nav is broken in the fleet table', body: 'aria issue' },
      ]);

      const result = await createIssueTriageExecuteApi(dbPath, exec)('p1');

      expect(result?.plans).toHaveLength(1);
      expect(result?.tasksCreated).toBe(1);
      // accept -> label edit + reasoning comment.
      expect(result?.commandResults).toHaveLength(2);
      expect(exec).toHaveBeenNthCalledWith(2, 'gh', [
        'issue',
        'edit',
        '9',
        '--add-label',
        'pool: accessibility',
      ]);

      const verify = openStore(dbPath);
      const rows = verify.db
        .prepare('SELECT id, source FROM tasks WHERE project_id = ?')
        .all('p1') as { id: string; source: string }[];
      expect(rows).toEqual([{ id: 'github-9', source: 'github' }]);
      verify.close();
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('defaults to the real CLI exec when none is injected', () => {
    expect(() => createIssueTriageExecuteApi('/tmp/unused.db')).not.toThrow();
  });

  it('opens the store read-write — it creates board tasks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-execute-readwrite-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      vi.mocked(openStore).mockClear();
      await createIssueTriageExecuteApi(dbPath, issuesExec())('p1');
      expect(openStore).toHaveBeenLastCalledWith(dbPath);
    } finally {
      cleanupDir(dir);
    }
  });
});
