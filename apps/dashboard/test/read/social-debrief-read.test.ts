// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `readSocialFlightDebrief` (epic 0016 slice 5/6): the FLIGHT DEBRIEF panel's
 * SOCIAL line reads the `social-debrief` row fly.ts persists at flight end
 * back off a real on-disk store — the latest flight's digest whole, or null
 * (unknown project, no row, a malformed row, a silent later flight, an
 * unreadable store). The bounding rule itself is pinned at the store layer
 * (`packages/store/test/read.test.ts`, `latestSocialDebriefEvent`).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import { readSocialFlightDebrief } from '../../src/read/project-detail.js';
import {
  SOCIAL_DEBRIEF_EVENT,
  type SocialFlightDebrief,
} from '../../src/flight/social-flight-debrief.js';

const DIGEST: SocialFlightDebrief = {
  passesRan: 3,
  skippedForeignTarget: 0,
  skippedGhDisconnected: 1,
  newIssuesAllowed: 1,
  newIssueBudget: 6,
  commentsAllowed: 2,
  commentBudget: 15,
  queued: 1,
  duplicate: 1,
  refused: 0,
};

/** `source.test.ts`'s cleanup: Windows can hold a just-closed SQLite file
 *  busy for a moment, and a temp dir left behind is not a test failure. */
function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EBUSY' && code !== 'EPERM' && code !== 'ENOTEMPTY') throw error;
  }
}

function withStore(seed: (s: Store) => void, read: (dbPath: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'ap-dash-social-debrief-'));
  const dbPath = join(dir, 'a.db');
  try {
    const s = openStore(dbPath);
    try {
      migrate(s);
      s.db
        .prepare(
          `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
           VALUES ('p1', 'alpha', 'alpha', '/tmp/alpha', 'flying', 1, 1)`,
        )
        .run();
      seed(s);
    } finally {
      s.close();
    }
    read(dbPath);
  } finally {
    cleanupDir(dir);
  }
}

function insertDigest(s: Store, payload: string, at: number): void {
  s.db
    .prepare(
      `INSERT INTO events (project_id, firing_id, type, payload, created_at)
       VALUES ('p1', NULL, ?, ?, ?)`,
    )
    .run(SOCIAL_DEBRIEF_EVENT, payload, at);
}

function insertFiring(s: Store, firingId: string, at: number): void {
  s.db
    .prepare(`INSERT INTO metrics (project_id, firing_id, created_at) VALUES ('p1', ?, ?)`)
    .run(firingId, at);
}

describe('readSocialFlightDebrief', () => {
  it('returns null when the DB file does not exist', () => {
    expect(
      readSocialFlightDebrief(join(tmpdir(), 'ap-dash-social-missing-9016', 'x.db'), 'p1'),
    ).toBeNull();
  });

  it("reads the latest flight's persisted digest back whole", () => {
    withStore(
      (s) => {
        insertFiring(s, 'f1', 100);
        insertDigest(s, JSON.stringify(DIGEST), 200);
      },
      (dbPath) => expect(readSocialFlightDebrief(dbPath, 'p1')).toEqual(DIGEST),
    );
  });

  it('returns null for an unknown project, even when another project has a digest', () => {
    withStore(
      (s) => insertDigest(s, JSON.stringify(DIGEST), 200),
      (dbPath) => expect(readSocialFlightDebrief(dbPath, 'nope')).toBeNull(),
    );
  });

  it('returns null once a later flight fired without writing a digest of its own', () => {
    withStore(
      (s) => {
        insertDigest(s, JSON.stringify(DIGEST), 200);
        insertFiring(s, 'f2', 300);
      },
      (dbPath) => expect(readSocialFlightDebrief(dbPath, 'p1')).toBeNull(),
    );
  });

  it('returns null for a malformed row rather than reading a gap as zero', () => {
    withStore(
      (s) => insertDigest(s, '{"passesRan":1}', 200),
      (dbPath) => expect(readSocialFlightDebrief(dbPath, 'p1')).toBeNull(),
    );
  });

  it('degrades to null when the file is not a store at all', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-social-bad-'));
    const dbPath = join(dir, 'a.db');
    try {
      writeFileSync(dbPath, 'not a sqlite database');
      expect(readSocialFlightDebrief(dbPath, 'p1')).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });
});
