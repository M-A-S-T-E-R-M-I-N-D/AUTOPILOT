// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { openStore, migrate, type Store } from '@autopilot/store';
import { SqliteIndexStore } from '../../src/adapters/sqlite-index-store.js';
import { makeEntry, buildIndex, diffIndex } from '../../src/index/core.js';
import type { IndexEntry } from '../../src/index/model.js';

const enc = (s: string) => new TextEncoder().encode(s);
const entry = (path: string, content: string): IndexEntry => makeEntry(path, enc(content));

function seedProject(store: Store): string {
  const id = randomUUID();
  const now = Date.now();
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES (?, ?, 'p', '/x', 'flying', ?, ?)`,
    )
    .run(id, `s-${id.slice(0, 8)}`, now, now);
  return id;
}

describe('SqliteIndexStore', () => {
  it('returns null before any index is saved', () => {
    const store = openStore(':memory:');
    migrate(store);
    const sink = new SqliteIndexStore(store);
    expect(sink.load(seedProject(store))).toBeNull();
    store.close();
  });

  it('cold-saves the full index and loads it back', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    const sink = new SqliteIndexStore(store, () => 1000);

    const entries = [entry('a.ts', '1'), entry('b.ts', '22')];
    const idx = buildIndex(entries);
    sink.save(pid, idx, diffIndex([], entries), '1');

    const loaded = sink.load(pid);
    expect(loaded?.treeHash).toBe(idx.treeHash);
    expect(loaded?.toolVersion).toBe('1');
    expect(loaded?.entries.map((e) => e.path).sort()).toEqual(['a.ts', 'b.ts']);
    store.close();
  });

  it('applies an incremental diff: upserts changed, deletes removed, preserves built_at', () => {
    const store = openStore(':memory:');
    migrate(store);
    const pid = seedProject(store);
    let clock = 1000;
    const sink = new SqliteIndexStore(store, () => clock);

    const v1 = [entry('a.ts', '1'), entry('b.ts', '2'), entry('c.ts', '3')];
    sink.save(pid, buildIndex(v1), diffIndex([], v1), '1');

    clock = 2000;
    const v2 = [entry('a.ts', '1'), entry('b.ts', 'CHANGED'), entry('d.ts', '4')];
    sink.save(pid, buildIndex(v2), diffIndex(v1, v2), '1');

    const loaded = sink.load(pid);
    expect(loaded?.entries.map((e) => e.path).sort()).toEqual(['a.ts', 'b.ts', 'd.ts']); // c removed
    expect(loaded?.treeHash).toBe(buildIndex(v2).treeHash);

    const meta = store.db
      .prepare('SELECT built_at, updated_at FROM project_index_meta WHERE project_id = ?')
      .get(pid) as { built_at: number; updated_at: number };
    expect(meta.built_at).toBe(1000); // preserved from the first build
    expect(meta.updated_at).toBe(2000); // moved on refresh
    store.close();
  });
});
