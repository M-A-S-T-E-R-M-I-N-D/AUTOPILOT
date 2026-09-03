// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { MIGRATIONS } from '../src/schema.js';
import {
  PROJECT_STATUSES,
  TASK_STATUSES,
  SEVERITIES,
  DIMENSIONS,
  TASK_SOURCES,
  VERSION_TIERS,
  COMMIT_KINDS,
} from '../src/types.js';

/**
 * The domain allow-lists live in two places — the `as const` tuples in types.ts
 * and the hand-written `CHECK (... IN (...))` literals in the frozen migration
 * SQL. TypeScript cannot see inside the SQL string, so nothing else binds them.
 * These tests fail the moment either side drifts, keeping the migration
 * immutable (it is checksum-frozen) while catching desync in CI.
 */
function inList(values: readonly string[]): string {
  return '(' + values.map((v) => `'${v}'`).join(',') + ')';
}

const migrationSql = MIGRATIONS.map((m) => m.up).join('\n');

describe('enum ↔ CHECK-constraint parity', () => {
  const cases: [string, readonly string[]][] = [
    ['PROJECT_STATUSES', PROJECT_STATUSES],
    ['TASK_STATUSES', TASK_STATUSES],
    ['SEVERITIES', SEVERITIES],
    ['DIMENSIONS', DIMENSIONS],
    ['TASK_SOURCES', TASK_SOURCES],
    ['VERSION_TIERS', VERSION_TIERS],
    ['COMMIT_KINDS', COMMIT_KINDS],
  ];

  it.each(cases)('%s exactly matches its CHECK IN(...) list in the schema', (_name, values) => {
    expect(migrationSql).toContain(inList(values));
  });
});
