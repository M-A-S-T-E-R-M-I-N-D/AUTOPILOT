// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * AUTO MODE (operator, 2026-09-26): proposals enter the pool without the
 * operator's ✓ — per project, off until turned on, never for the titles
 * only a person can decide.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, type Store } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import {
  AUTO_APPROVED_EVENT,
  isAutoApprovable,
  isAutoApproveOn,
  recordAutoApproved,
  setAutoApprove,
} from '../src/auto-approve.js';

describe('auto mode', () => {
  let dir: string;
  let store: Store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ap-auto-approve-'));
    store = openStore(join(dir, 'db.sqlite'));
    migrate(store);
    for (const id of ['p1', 'p2']) {
      store.db
        .prepare(
          `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
           VALUES (?, ?, ?, '/tmp/x', 'registered', NULL, 1, 1)`,
        )
        .run(id, id, id);
    }
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('is off until the operator turns it on, per project', () => {
    expect(isAutoApproveOn(store, 'p1')).toBe(false);
    expect(setAutoApprove(store, 'p1', true, 10)).toBe(true);
    expect(isAutoApproveOn(store, 'p1')).toBe(true);
    expect(isAutoApproveOn(store, 'p2')).toBe(false);
  });

  it('follows the latest setting, even two in the same millisecond', () => {
    setAutoApprove(store, 'p1', true, 10);
    setAutoApprove(store, 'p1', false, 20);
    expect(isAutoApproveOn(store, 'p1')).toBe(false);
    setAutoApprove(store, 'p1', true, 20);
    expect(isAutoApproveOn(store, 'p1')).toBe(true);
  });

  it('refuses an unknown project instead of throwing', () => {
    expect(setAutoApprove(store, 'nope', true, 1)).toBe(false);
  });

  it('reads a malformed setting as off', () => {
    store.db
      .prepare(
        "INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES ('p1', NULL, 'auto-approve-setting', '{oops', 5)",
      )
      .run();
    expect(isAutoApproveOn(store, 'p1')).toBe(false);
  });

  it('records each auto-approval for the audit trail, not as an operator label', () => {
    recordAutoApproved(store, 'p1', 't1', 'fix the thing', 7);
    const rows = store.db
      .prepare('SELECT type, payload FROM events WHERE project_id = ?')
      .all('p1') as { type: string; payload: string }[];
    expect(rows).toEqual([
      {
        type: AUTO_APPROVED_EVENT,
        payload: JSON.stringify({ taskId: 't1', title: 'fix the thing' }),
      },
    ]);
  });
});

describe('isAutoApprovable', () => {
  it.each([
    ['fix: the gate retries a load crash', true],
    ['VERDICT split ap-1 into two', true],
    ['a task that mentions OPERATOR mid-title', true],
    ['OPERATOR: upgrade node', false],
    ['VERDICT blocked ap-1 waits on ADR 0010', false],
    ['VERDICT confirm blocked ap-1', false],
    ['VERDICT close ap-1 ap-2', false],
    ['verdict close ap-1', false],
  ])('%s → %s', (title, expected) => {
    expect(isAutoApprovable(title)).toBe(expected);
  });
});
