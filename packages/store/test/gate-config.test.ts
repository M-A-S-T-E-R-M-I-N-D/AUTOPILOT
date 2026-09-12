// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openStore, migrate, setProjectGateConfig, type Store } from '../src/index.js';

/** The flight plan editor's one store write (epic 0021 slice 3, second cut):
 *  `gate_config` is rewritten in place, `updated_at` moves, nothing else
 *  changes, and an unknown project is refused. */
describe('setProjectGateConfig', () => {
  let store: Store;
  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'registered', '{"ecosystem":"js"}', 1, 1)`,
      )
      .run();
  });
  afterEach(() => store.close());

  it('rewrites the stored plan and moves updated_at', () => {
    const next = JSON.stringify({
      ecosystem: 'js',
      test: { bin: 'pnpm', args: ['test'], label: 'pnpm test' },
    });
    expect(setProjectGateConfig(store, 'p1', next, 7)).toBe(true);
    const row = store.db
      .prepare('SELECT gate_config, updated_at, status FROM projects WHERE id = ?')
      .get('p1') as { gate_config: string; updated_at: number; status: string };
    expect(row).toEqual({ gate_config: next, updated_at: 7, status: 'registered' });
  });

  it('returns false for an unknown project', () => {
    expect(setProjectGateConfig(store, 'ghost', '{}', 1)).toBe(false);
  });
});
