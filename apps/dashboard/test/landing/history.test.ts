// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `landing/history.ts` — the durable half of "what happened to my landing?",
 * read back from the `landed` events row the land itself wrote. This is what
 * a dashboard that was RESTARTED BY the land it is being asked about answers
 * from.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, migrate } from '@autopilot/store';
import { readRecentLandingOutcome } from '../../src/landing/history.js';

const dirs: string[] = [];

function storeWithEvent(
  type: string,
  projectId: string,
  payload: string,
  createdAt: number,
): string {
  const dir = mkdtempSync(join(tmpdir(), 'autopilot-landing-history-'));
  dirs.push(dir);
  const dbPath = join(dir, 'autopilot.db');
  const store = openStore(dbPath);
  try {
    migrate(store);
    store.db
      .prepare(
        'INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(projectId, projectId, projectId, dir, 'registered', createdAt, createdAt);
    store.db
      .prepare(
        'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, NULL, ?, ?, ?)',
      )
      .run(projectId, type, payload, createdAt);
  } finally {
    store.close();
  }
  return dbPath;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readRecentLandingOutcome', () => {
  it('recovers a recent land with the details the land itself recorded', () => {
    const now = 1_000_000;
    const dbPath = storeWithEvent(
      'landed',
      'p1',
      JSON.stringify({ details: 'landed autopilot/flight onto main' }),
      now - 1_000,
    );

    expect(readRecentLandingOutcome(dbPath, 'p1', now)).toEqual({
      ok: true,
      reason: 'landed',
      details: 'landed autopilot/flight onto main',
      restarting: false,
    });
  });

  it('ignores a land older than the window — an old success is history, not news about this press', () => {
    const now = 1_000_000;
    const dbPath = storeWithEvent('landed', 'p1', JSON.stringify({ details: 'old' }), now - 60_000);

    expect(readRecentLandingOutcome(dbPath, 'p1', now, 30_000)).toBeNull();
  });

  it("ignores another project's land", () => {
    const now = 1_000_000;
    const dbPath = storeWithEvent('landed', 'other', JSON.stringify({ details: 'x' }), now);

    expect(readRecentLandingOutcome(dbPath, 'p1', now)).toBeNull();
  });

  it('ignores non-landed events — a gate alarm is not a land', () => {
    const now = 1_000_000;
    const dbPath = storeWithEvent(
      'land-gate-alarm',
      'p1',
      JSON.stringify({ details: 'typecheck failed' }),
      now,
    );

    expect(readRecentLandingOutcome(dbPath, 'p1', now)).toBeNull();
  });

  it('still reports the land when its payload is malformed — the row itself is the proof', () => {
    const now = 1_000_000;
    const dbPath = storeWithEvent('landed', 'p1', 'not json at all', now);

    expect(readRecentLandingOutcome(dbPath, 'p1', now)?.ok).toBe(true);
  });

  it('degrades to null on an unreadable store rather than throwing into the status endpoint', () => {
    expect(readRecentLandingOutcome(join(tmpdir(), 'no-such-autopilot-db.db'), 'p1', 1)).toBeNull();
  });
});
