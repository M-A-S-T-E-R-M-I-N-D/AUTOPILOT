// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, createTask, setTaskStatus, type Store } from '@autopilot/store';
import type * as AutopilotStore from '@autopilot/store';
import { createMirrorPassPreviewApi } from '../../src/flight/mirror-pass-execute.js';
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

function shipSha(s: Store, projectId: string, firingId: string, item: string, sha: string): void {
  s.db
    .prepare(
      `INSERT INTO metrics (project_id, firing_id, item, sha, shipped, created_at)
       VALUES (?, ?, ?, ?, 1, 100)`,
    )
    .run(projectId, firingId, item, sha);
}

function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

/** A `CliExec` stub answering `gh issue view <n> --json number,state` from
 *  `states` (issue number -> open/closed), and every other call with a bare
 *  success — mirrors `mirror-pass.ts`'s own test doubles. */
function issueViewExec(states: Readonly<Record<number, 'open' | 'closed'>>): CliExec {
  return vi.fn(async (_bin, args) => {
    if (args[0] === 'issue' && args[1] === 'view') {
      const number = Number(args[2]);
      const state = states[number];
      if (state === undefined) return { code: 1, stdout: '' };
      return { code: 0, stdout: JSON.stringify({ number, state: state.toUpperCase() }) };
    }
    return { code: 0, stdout: '' };
  });
}

describe('createMirrorPassPreviewApi', () => {
  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-preview-unknown-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      expect(await createMirrorPassPreviewApi(dbPath, issueViewExec({}))('nope')).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('plans a close-with-landing-note when a done task landed but its issue is still open', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-preview-close-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'github-42',
        projectId: 'p1',
        title: 'Fix the fleet table keyboard nav',
        createdAt: 100,
      });
      setTaskStatus(s, 'github-42', 'done', 200);
      shipSha(s, 'p1', 'firing-1', 'github-42', 'abc1234');
      s.close();

      const plans = await createMirrorPassPreviewApi(dbPath, issueViewExec({ 42: 'open' }))('p1');

      expect(plans).toHaveLength(1);
      expect(plans?.[0]?.finding).toMatchObject({
        action: 'close-with-landing-note',
        taskId: 'github-42',
        issueNumber: 42,
        sha: 'abc1234',
      });
      expect(plans?.[0]?.commands).toHaveLength(2);
    } finally {
      cleanupDir(dir);
    }
  });

  it('plans a reopen-honestly when the board no longer says done but the issue is closed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-preview-reopen-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'github-7',
        projectId: 'p1',
        title: 'Regression in the search palette',
        createdAt: 100,
      });
      setTaskStatus(s, 'github-7', 'deferred', 200);
      s.close();

      const plans = await createMirrorPassPreviewApi(dbPath, issueViewExec({ 7: 'closed' }))('p1');

      expect(plans?.[0]?.finding).toMatchObject({
        action: 'reopen-honestly',
        taskId: 'github-7',
        issueNumber: 7,
      });
    } finally {
      cleanupDir(dir);
    }
  });

  it('finds nothing to reconcile when the board and the issue already agree, and never mutates', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-preview-insync-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'github-3',
        projectId: 'p1',
        title: 'Already closed the right way',
        createdAt: 100,
      });
      setTaskStatus(s, 'github-3', 'done', 200);
      shipSha(s, 'p1', 'firing-1', 'github-3', 'def5678');
      s.close();

      const exec = issueViewExec({ 3: 'closed' });
      const plans = await createMirrorPassPreviewApi(dbPath, exec)('p1');

      expect(plans).toHaveLength(1);
      expect(plans?.[0]?.finding).toBeNull();
      expect(plans?.[0]?.commands).toHaveLength(0);
      // Read-only: only the `issue view` read happened, no comment/close/reopen write.
      expect(exec).toHaveBeenCalledTimes(1);
    } finally {
      cleanupDir(dir);
    }
  });

  it('ignores a non-github task id — nothing to reconcile it against', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-preview-nongithub-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'web-abc123',
        projectId: 'p1',
        title: 'A self-mined proposal, not from github',
        createdAt: 100,
      });
      s.close();

      const plans = await createMirrorPassPreviewApi(dbPath, issueViewExec({}))('p1');

      expect(plans).toHaveLength(0);
    } finally {
      cleanupDir(dir);
    }
  });

  it('picks the most recently shipped SHA when a task shipped more than once', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-preview-resha-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      createTask(s, {
        id: 'github-9',
        projectId: 'p1',
        title: 'A multi-slice task',
        createdAt: 100,
      });
      setTaskStatus(s, 'github-9', 'done', 200);
      shipSha(s, 'p1', 'firing-1', 'github-9', 'first000');
      shipSha(s, 'p1', 'firing-2', 'github-9', 'second111');
      s.close();

      const plans = await createMirrorPassPreviewApi(dbPath, issueViewExec({ 9: 'open' }))('p1');

      expect(plans?.[0]?.finding).toMatchObject({ sha: 'second111' });
    } finally {
      cleanupDir(dir);
    }
  });

  it('defaults to the real CLI exec when none is injected', () => {
    expect(() => createMirrorPassPreviewApi('/tmp/unused.db')).not.toThrow();
  });

  it('opens the store read-only — a preview never writes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-preview-readonly-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      vi.mocked(openStore).mockClear();
      await createMirrorPassPreviewApi(dbPath, issueViewExec({}))('p1');
      expect(openStore).toHaveBeenLastCalledWith(dbPath, { readonly: true });
    } finally {
      cleanupDir(dir);
    }
  });
});
