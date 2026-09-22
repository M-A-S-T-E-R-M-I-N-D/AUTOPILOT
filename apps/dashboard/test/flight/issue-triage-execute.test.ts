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
/** A repo that HAS the house milestones, so the ritual's `--milestone` flag
 *  is exercised. A repo without them gets no flag at all rather than one
 *  that silently fails, which is what this repo taught (2026-09-22). */
const HOUSE_MILESTONES = 'Foundations\nV1\nHardening\n';

function issuesExec(issues: readonly unknown[] = []): CliExec {
  return vi.fn(async (_bin, args) => {
    if (args[0] === 'issue' && args[1] === 'list') {
      return { code: 0, stdout: JSON.stringify(issues) };
    }
    if (args[0] === 'api' && String(args[1]).endsWith('/milestones')) {
      return { code: 0, stdout: HOUSE_MILESTONES };
    }
    return { code: 0, stdout: '' };
  });
}

/** Bodies that pass the issue-protocol gate (operator, 2026-09-12): every
 *  planner fixture here is filed ON the bug template, so these tests keep
 *  proving dedup/accept/labeling; `issue-triage-protocol.test.ts` proves the
 *  gate itself. The parse fixtures under `fetchOpenIssues` stay raw. */
const templated = (text: string): string =>
  `### What happened?\n${text}\n\n### Steps to reproduce\n1. see above\n\n### Expected behavior\nIt works.\n`;
const TEMPLATED_BODY = templated('');

/** The `gh` verbs that CHANGE something on the tracker. A ritual that must not
 *  write is proved by the absence of these, not by a call count: the read side
 *  gains calls over time (the repo-owner read landed 2026-09-22) and a count
 *  pinned to 1 fails for a reason that has nothing to do with writing. */
function ghWrites(exec: CliExec): string[][] {
  const calls = (exec as unknown as { mock: { calls: [string, string[]][] } }).mock.calls;
  return calls
    .map(([, args]) => args)
    .filter((args) => args[1] === 'edit' || args[1] === 'comment' || args[1] === 'create');
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
        {
          number: 9,
          title: 'Keyboard nav is broken in the fleet table',
          body: templated('aria issue'),
        },
        { number: 10, title: 'Already tracked dashboard crash', body: TEMPLATED_BODY },
        { number: 11, title: 'Add Hebrew RTL support', body: TEMPLATED_BODY },
      ]);

      const plans = await createIssueTriagePreviewApi(dbPath, exec)('p1');

      expect(plans).toHaveLength(3);
      expect(plans?.[0]?.decision.decision).toBe('accept');
      expect(plans?.[1]?.decision).toMatchObject({ decision: 'duplicate', matchedId: 'web-abc' });
      expect(plans?.[2]?.decision).toMatchObject({
        decision: 'duplicate',
        matchedId: 'backlog:0',
      });
      // Read-only: the preview reads (issue list, repo view) and writes nothing.
      expect(ghWrites(exec)).toEqual([]);

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

      const exec = issuesExec([
        { number: 10, title: 'Already tracked dashboard crash', body: TEMPLATED_BODY },
      ]);

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
        {
          number: 9,
          title: 'Keyboard nav is broken in the fleet table',
          body: templated('aria issue'),
        },
      ]);

      const result = await createIssueTriageExecuteApi(dbPath, exec)('p1');

      expect(result?.plans).toHaveLength(1);
      expect(result?.tasksCreated).toBe(1);
      // accept -> label edit + reasoning comment.
      expect(result?.commandResults).toHaveLength(2);
      // By content, not by position: the read side may gain calls (it did,
      // when the repo-owner read landed) without changing what is written.
      expect(exec).toHaveBeenCalledWith('gh', [
        'issue',
        'edit',
        '9',
        '--add-label',
        'pool: accessibility',
        // epic 0019 S2: accepted issues now also earn the house area/priority
        // labels + milestone in the same gh edit — this pin gained them as the
        // KEEPER taxonomy slice landed.
        '--add-label',
        'area: flight-engine',
        '--add-label',
        'priority: high',
        '--milestone',
        'V1',
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
