// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import type { Store } from './db.js';
import { MIGRATIONS, LATEST_VERSION, type Migration } from './schema.js';

export interface MigrationResult {
  /** Versions applied by this call (empty when already up to date). */
  readonly applied: number[];
  /** The schema version after this call. */
  readonly version: number;
}

const CREATE_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  checksum   TEXT    NOT NULL,
  applied_at INTEGER NOT NULL
) STRICT;
`;

function checksum(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

/**
 * Apply all pending migrations in a single transaction. Idempotent: a second
 * call applies nothing. If a previously-applied migration's SQL has changed
 * (checksum mismatch) it throws — schema drift must be an explicit new
 * migration, never a silent edit to history.
 */
export function migrate(store: Store): MigrationResult {
  const { db } = store;
  db.exec(CREATE_MIGRATIONS_TABLE);

  const appliedRows = db.prepare('SELECT version, checksum FROM schema_migrations').all() as {
    version: number;
    checksum: string;
  }[];
  const appliedChecksums = new Map(appliedRows.map((r) => [r.version, r.checksum]));

  // Refuse to run against a database migrated by a newer build (downgrade/
  // rollback): an applied version this code does not know about means the
  // on-disk schema shape may differ from what this binary expects.
  const knownVersions = new Set(MIGRATIONS.map((m) => m.version));
  for (const row of appliedRows) {
    if (!knownVersions.has(row.version)) {
      throw new Error(
        `database schema version ${row.version} is newer than this build (latest known ${LATEST_VERSION}); refusing to migrate`,
      );
    }
  }

  const sorted: Migration[] = [...MIGRATIONS].sort((a, b) => a.version - b.version);
  const applied: number[] = [];
  const appliedAt = Date.now();

  const insert = db.prepare(
    'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
  );

  const runPending = db.transaction((migrations: Migration[]) => {
    for (const m of migrations) {
      const sum = checksum(m.up);
      const existing = appliedChecksums.get(m.version);
      if (existing !== undefined) {
        if (existing !== sum) {
          throw new Error(
            `schema drift: migration ${m.version} (${m.name}) checksum changed since it was applied`,
          );
        }
        continue;
      }
      db.exec(m.up);
      insert.run(m.version, m.name, sum, appliedAt);
      applied.push(m.version);
    }
  });

  runPending(sorted);

  return { applied, version: currentVersion(store) };
}

/** The highest applied schema version, or 0 if the database is unmigrated. */
export function currentVersion(store: Store): number {
  const { db } = store;
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  if (!tableExists) return 0;
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as {
    v: number | null;
  };
  return row.v ?? 0;
}
