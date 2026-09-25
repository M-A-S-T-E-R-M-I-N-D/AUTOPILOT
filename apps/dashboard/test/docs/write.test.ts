// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import { createDocsWriteApi } from '../../src/docs/write.js';

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

describe('createDocsWriteApi', () => {
  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-docs-write-unknown-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();
      const api = createDocsWriteApi(dbPath);
      expect(await api('nope', 'docs/foo.md', 'hi', 'alice', 'docs-reader')).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('writes an allow-listed path with the provenance line appended', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-docs-write-repo-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-docs-write-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      const api = createDocsWriteApi(dbPath, () => 1_700_000_000_000);
      const result = await api('p1', 'docs/foo.md', '# Foo\n', 'alice', 'docs-reader');
      expect(result).toEqual({ ok: true, path: 'docs/foo.md' });

      const content = readFileSync(join(repo, 'docs', 'foo.md'), 'utf8');
      expect(content).toBe(
        '# Foo\n\n<!-- edited via dashboard by alice on 2023-11-14T22:13:20.000Z from docs-reader -->\n',
      );
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('creates nested directories under docs/ that do not exist yet', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-docs-write-nested-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-docs-write-db2-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      const api = createDocsWriteApi(dbPath);
      const result = await api('p1', 'docs/epics/9999-new.md', '# New\n', 'bob', 'docs-reader');
      expect(result?.ok).toBe(true);
      expect(existsSync(join(repo, 'docs', 'epics', '9999-new.md'))).toBe(true);
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('refuses a path outside the allow-list and writes nothing', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-docs-write-refuse-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-docs-write-db3-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      const api = createDocsWriteApi(dbPath);
      const result = await api('p1', 'apps/dashboard/src/server/server.ts', 'x', 'eve', 'docs-reader');
      expect(result?.ok).toBe(false);
      expect((result as { reason: string }).reason).toContain('allow-list');
      expect(existsSync(join(repo, 'apps'))).toBe(false);
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('refuses a traversal attempt and writes nothing', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-docs-write-traverse-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-docs-write-db4-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      const api = createDocsWriteApi(dbPath);
      const result = await api('p1', 'docs/../../../etc/passwd', 'x', 'eve', 'docs-reader');
      expect(result?.ok).toBe(false);
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('refuses binary content and writes nothing', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-docs-write-binary-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-docs-write-db5-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      const api = createDocsWriteApi(dbPath);
      const result = await api('p1', 'README.md', 'a\u0000b', 'eve', 'docs-reader');
      expect(result?.ok).toBe(false);
      expect(existsSync(join(repo, 'README.md'))).toBe(false);
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });
});
