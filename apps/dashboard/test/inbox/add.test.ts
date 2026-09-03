// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import { createInboxAddApi } from '../../src/inbox/add.js';

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

describe('createInboxAddApi', () => {
  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-inbox-unknown-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();
      const api = createInboxAddApi(dbPath);
      expect(await api('nope', 'hello')).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('writes the message into <root>/INBOX/ as a timestamped file', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-inbox-repo-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-inbox-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      const api = createInboxAddApi(dbPath, () => 1_700_000_000_000);
      const result = await api('p1', 'context for the next firing');
      expect(result?.ok).toBe(true);
      expect(result?.file).toMatch(/^2023-11-14T22-13-20-000Z-dashboard\.md$/);

      const files = readdirSync(join(repo, 'INBOX'));
      expect(files).toEqual([result?.file]);
      const content = readFileSync(join(repo, 'INBOX', files[0] as string), 'utf8');
      expect(content).toBe('context for the next firing\n');
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('creates the INBOX/ folder when it does not already exist', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-inbox-nofolder-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-inbox-db2-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      const api = createInboxAddApi(dbPath);
      const result = await api('p1', 'first note ever');
      expect(result?.ok).toBe(true);
      expect(readdirSync(join(repo, 'INBOX'))).toHaveLength(1);
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });
});
