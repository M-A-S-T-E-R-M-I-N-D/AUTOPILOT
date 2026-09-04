// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import { inboxTaskTitle, inboxTaskId, triageInboxEntries } from '../../src/flight/inbox-triage.js';

function project(s: Store, id: string, rootPath: string): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', NULL, ?, ?)`,
    )
    .run(id, id, id, rootPath, 100, 100);
}

function tasks(
  s: Store,
  projectId: string,
): { id: string; title: string; status: string; source: string }[] {
  return s.db
    .prepare('SELECT id, title, status, source FROM tasks WHERE project_id = ? ORDER BY id')
    .all(projectId) as { id: string; title: string; status: string; source: string }[];
}

function taskBody(s: Store, projectId: string, id: string): string | null {
  return (
    s.db.prepare('SELECT body FROM tasks WHERE project_id = ? AND id = ?').get(projectId, id) as {
      body: string | null;
    }
  ).body;
}

function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

describe('inboxTaskTitle', () => {
  it('uses the first non-blank line of the note', () => {
    expect(
      inboxTaskTitle({ name: 'note.md', content: '\n\n  ship faster please  \nmore detail below' }),
    ).toBe('ship faster please');
  });

  it('falls back to the filename when the note is blank', () => {
    expect(inboxTaskTitle({ name: 'note.md', content: '\n \n' })).toBe('note.md');
  });

  it('truncates a long first line', () => {
    const long = 'x'.repeat(500);
    expect(inboxTaskTitle({ name: 'note.md', content: long }).length).toBe(200);
  });
});

describe('inboxTaskId', () => {
  it('is a content-addressed, slugified id prefixed with inbox-', () => {
    expect(inboxTaskId('2026-08-12T00-00-00-000Z-dashboard.md')).toBe(
      'inbox-2026-08-12t00-00-00-000z-dashboard-md',
    );
  });

  it('is stable for the same filename', () => {
    expect(inboxTaskId('note.md')).toBe(inboxTaskId('note.md'));
  });
});

describe('triageInboxEntries', () => {
  it('creates a queued, inbox-sourced task per note and archives the file', () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-triage-repo-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-triage-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);

      const inboxDir = join(repo, 'INBOX');
      mkdirSync(inboxDir, { recursive: true });
      writeFileSync(join(inboxDir, 'note.md'), 'ship faster please\n', 'utf8');

      triageInboxEntries(
        s,
        'p1',
        repo,
        [{ name: 'note.md', content: 'ship faster please\n' }],
        () => 100,
      );

      const rows = tasks(s, 'p1');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        title: 'ship faster please',
        status: 'queued',
        source: 'inbox',
      });

      expect(existsSync(join(inboxDir, 'note.md'))).toBe(false);
      expect(readdirSync(join(inboxDir, '.triaged'))).toEqual(['note.md']);
      s.close();
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it("persists the note's full content on the task record, not just its title line", () => {
    // The archived file lives only in the gitignored INBOX/.triaged/ of the
    // worktree that triaged it — invisible to the rest of the fleet. Once a
    // note's first line becomes the (200-char-capped) title, the body is the
    // ONLY place the rest of the note survives anywhere fleet-wide.
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-triage-body-repo-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-triage-body-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      mkdirSync(join(repo, 'INBOX'), { recursive: true });

      const content = 'ship faster please\n\nmore detail on why this matters below.';
      triageInboxEntries(s, 'p1', repo, [{ name: 'note.md', content }], () => 100);

      expect(taskBody(s, 'p1', inboxTaskId('note.md'))).toBe(content);
      s.close();
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('never triages the same note twice, even if called again with the same entry', () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-triage-repeat-repo-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-triage-repeat-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      mkdirSync(join(repo, 'INBOX'), { recursive: true });

      const entry = { name: 'note.md', content: 'first note\n' };
      triageInboxEntries(s, 'p1', repo, [entry], () => 100);
      // Simulate a second firing re-reading a directory where archiving already
      // happened — same filename, same content, run through triage again.
      triageInboxEntries(s, 'p1', repo, [entry], () => 200);

      expect(tasks(s, 'p1')).toHaveLength(1);
      s.close();
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('is a no-op for an empty entry list (no INBOX dir created)', () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-triage-empty-repo-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-triage-empty-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);

      triageInboxEntries(s, 'p1', repo, []);

      expect(tasks(s, 'p1')).toHaveLength(0);
      expect(existsSync(join(repo, 'INBOX'))).toBe(false);
      s.close();
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });
});
