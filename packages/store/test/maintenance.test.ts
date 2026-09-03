// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { SqliteSearchStore } from '../src/search.js';
import { vacuumStore } from '../src/maintenance.js';

describe('vacuumStore', () => {
  it('reclaims space the FTS5 index leaves behind after documents are removed (EVALUATION-2026-08-27-silent-gate.md §3.8)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-store-vacuum-'));
    const dbPath = join(dir, 'telemetry.db');
    try {
      const store = openStore(dbPath);
      migrate(store);
      const search = new SqliteSearchStore(store);
      for (let i = 0; i < 300; i++) {
        search.indexDocument('p1', `file-${i}.ts`, 'x'.repeat(4000), 'ts');
      }
      search.removeProject('p1');

      const result = vacuumStore(store);

      expect(result.sizeAfterBytes).toBeLessThan(result.sizeBeforeBytes);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is idempotent — vacuuming an already-compact store changes nothing further', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-store-vacuum-'));
    const dbPath = join(dir, 'telemetry.db');
    try {
      const store = openStore(dbPath);
      migrate(store);

      const first = vacuumStore(store);
      const second = vacuumStore(store);

      expect(second.sizeAfterBytes).toBe(first.sizeAfterBytes);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
