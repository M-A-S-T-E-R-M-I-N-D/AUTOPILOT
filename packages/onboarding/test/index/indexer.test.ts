// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openStore, migrate, SqliteSearchStore, type Store } from '@autopilot/store';
import { refreshProjectIndex } from '../../src/index/indexer.js';
import { FsFileSource } from '../../src/adapters/fs-file-source.js';
import { SqliteIndexStore } from '../../src/adapters/sqlite-index-store.js';

function seedProject(store: Store, root: string): string {
  const id = randomUUID();
  const now = Date.now();
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES (?, ?, 'p', ?, 'flying', ?, ?)`,
    )
    .run(id, `s-${id.slice(0, 8)}`, root, now, now);
  return id;
}

describe('refreshProjectIndex (real fs + real sqlite)', () => {
  let dir: string;
  let store: Store;
  let pid: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-idx-'));
    store = openStore(':memory:');
    migrate(store);
    pid = seedProject(store, dir);
    writeFileSync(join(dir, 'a.ts'), 'export const a = 1;');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'b.ts'), 'export const b = 2;');
    // A heavy dir that must be ignored, never indexed.
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'node_modules', 'junk.js'), 'junk');
    // AUTOPILOT's own working dir — must NEVER be indexed (live DB + secrets).
    mkdirSync(join(dir, '.autopilot'));
    writeFileSync(join(dir, '.autopilot', 'autopilot.db'), 'SQLite binary…');
    writeFileSync(
      join(dir, '.autopilot', 'connection.json'),
      '{"mode":"api-key","apiKey":"sk-secret"}',
    );
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function refresh() {
    return refreshProjectIndex(new FsFileSource(dir), new SqliteIndexStore(store), pid);
  }

  it('cold-builds the index over the real tree, ignoring node_modules and .autopilot', async () => {
    const diff = await refresh();
    expect(diff.added.map((e) => e.path).sort()).toEqual(['a.ts', 'src/b.ts']);
    expect(diff.added.some((e) => e.path.includes('node_modules'))).toBe(false);
    // The live DB + connection.json (secrets) are never walked or indexed.
    expect(diff.added.some((e) => e.path.includes('.autopilot'))).toBe(false);
    const loaded = new SqliteIndexStore(store).load(pid);
    expect(loaded?.entries).toHaveLength(2);
  });

  it('skips an unreadable file instead of aborting the whole index', async () => {
    // A FileSource whose read throws for one path (locked/deleted mid-walk).
    const flaky = {
      list: () => Promise.resolve(['ok.ts', 'locked.ts']),
      read: (p: string) =>
        p === 'locked.ts'
          ? Promise.reject(new Error('EBUSY: resource busy or locked'))
          : Promise.resolve(new TextEncoder().encode('export const ok = 1;')),
    };
    const diff = await refreshProjectIndex(flaky, new SqliteIndexStore(store), pid);
    expect(diff.added.map((e) => e.path)).toEqual(['ok.ts']); // locked.ts skipped, no throw
    expect(new SqliteIndexStore(store).load(pid)?.entries).toHaveLength(1);
  });

  it('incrementally updates: one edit → exactly one changed, tree hash advances', async () => {
    const before = new SqliteIndexStore(store);
    await refresh();
    const treeBefore = before.load(pid)?.treeHash;

    writeFileSync(join(dir, 'a.ts'), 'export const a = 999;');
    const diff = await refresh();
    expect(diff.changed.map((e) => e.path)).toEqual(['a.ts']);
    expect(diff.added).toHaveLength(0);
    expect(before.load(pid)?.treeHash).not.toBe(treeBefore);
  });

  it('reflects an add and a remove', async () => {
    await refresh();
    writeFileSync(join(dir, 'c.ts'), 'export const c = 3;');
    expect((await refresh()).added.map((e) => e.path)).toEqual(['c.ts']);

    rmSync(join(dir, 'src', 'b.ts'), { force: true });
    expect((await refresh()).removed).toContain('src/b.ts');
  });

  it('re-locking with no change is a no-op resume (empty diff, stable tree hash)', async () => {
    await refresh();
    const treeHash = new SqliteIndexStore(store).load(pid)?.treeHash;
    const diff = await refresh();
    expect(diff.added).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(new SqliteIndexStore(store).load(pid)?.treeHash).toBe(treeHash);
  });
});

describe('refreshProjectIndex + full-text content index (M4 RAG)', () => {
  let dir: string;
  let store: Store;
  let pid: string;
  let search: SqliteSearchStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-idx-'));
    store = openStore(':memory:');
    migrate(store);
    pid = seedProject(store, dir);
    search = new SqliteSearchStore(store);
    writeFileSync(join(dir, 'cart.ts'), 'export function addToCart(item) { return item; }');
    writeFileSync(join(dir, 'pay.ts'), 'export function payInvoice(amount) { return amount; }');
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function refresh() {
    return refreshProjectIndex(new FsFileSource(dir), new SqliteIndexStore(store), pid, search);
  }

  it('makes the repo searchable — substring code search finds the file', async () => {
    await refresh();
    expect(search.documentCount(pid)).toBe(2);
    const hits = search.search(pid, 'cart');
    expect(hits.map((h) => h.path)).toEqual(['cart.ts']);
  });

  it('only re-indexes the changed slice (unchanged files are not rewritten)', async () => {
    await refresh();
    writeFileSync(join(dir, 'cart.ts'), 'export function emptyCart() { return []; }');
    await refresh();
    // Old identifier gone, new one searchable; pay.ts still there, count stable.
    expect(search.search(pid, 'addToCart')).toHaveLength(0);
    expect(search.search(pid, 'emptyCart')).toHaveLength(1);
    expect(search.documentCount(pid)).toBe(2);
  });

  it('drops a removed file from the search index', async () => {
    await refresh();
    rmSync(join(dir, 'pay.ts'), { force: true });
    await refresh();
    expect(search.search(pid, 'payInvoice')).toHaveLength(0);
    expect(search.documentCount(pid)).toBe(1);
  });

  it('skips binary files (a NUL byte marks it non-text)', async () => {
    writeFileSync(join(dir, 'logo.bin'), Buffer.from([0x89, 0x00, 0x01, 0x02, 0x03]));
    await refresh();
    // cart.ts + pay.ts indexed; the binary is not.
    expect(search.documentCount(pid)).toBe(2);
  });
});
