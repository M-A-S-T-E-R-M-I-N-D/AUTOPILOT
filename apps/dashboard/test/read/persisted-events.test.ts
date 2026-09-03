// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openStore, migrate, type Store } from '@autopilot/store';
import {
  parseFamilyRunaways,
  parseIntentCollisions,
  parseNearMissRecurring,
  parseGuardDenialEvents,
  parseSyncBackRefusalEvents,
  parseLandGateAlarmEvents,
  parseConvergenceRedEvents,
  parseE2eLandBlockEvents,
  parseLandedEvents,
} from '../../src/read/persisted-events.js';

let store: Store;
const PROJECT_ID = 'p1';

function project(id: string): void {
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', ?, ?)`,
    )
    .run(id, id, id, `/tmp/${id}`, 100, 100);
}

function insertEvent(
  type: string,
  payload: string | null,
  createdAt: number,
  projectId: string = PROJECT_ID,
): void {
  store.db
    .prepare(
      `INSERT INTO events (project_id, firing_id, type, payload, created_at)
       VALUES (?, NULL, ?, ?, ?)`,
    )
    .run(projectId, type, payload, createdAt);
}

beforeEach(() => {
  store = openStore(':memory:');
  migrate(store);
  project(PROJECT_ID);
});

afterEach(() => {
  store.close();
});

describe('parseFamilyRunaways', () => {
  it('parses a well-formed family-runaway payload', () => {
    insertEvent('family-runaway', '{"family":"fix: *","spendUsd":4.5,"firings":3}', 100);
    expect(parseFamilyRunaways(store, PROJECT_ID)).toEqual([
      { family: 'fix: *', spendUsd: 4.5, firings: 3 },
    ]);
  });

  it('keeps only the first (newest, since rows arrive newest-first by insertion order) row per family', () => {
    // familyRunawayEvents orders by `id DESC` (insertion order), not created_at —
    // the row inserted LAST is the one the dedup keeps.
    insertEvent('family-runaway', '{"family":"fix: *","spendUsd":4.5,"firings":3}', 100);
    insertEvent('family-runaway', '{"family":"fix: *","spendUsd":9,"firings":5}', 200);
    expect(parseFamilyRunaways(store, PROJECT_ID)).toEqual([
      { family: 'fix: *', spendUsd: 9, firings: 5 },
    ]);
  });

  it('skips a malformed JSON payload', () => {
    insertEvent('family-runaway', 'not json', 100);
    expect(parseFamilyRunaways(store, PROJECT_ID)).toEqual([]);
  });

  it('skips a payload missing a required field', () => {
    insertEvent('family-runaway', '{"family":"fix: *","firings":3}', 100);
    expect(parseFamilyRunaways(store, PROJECT_ID)).toEqual([]);
  });

  it('returns an empty array when there are no family-runaway events', () => {
    expect(parseFamilyRunaways(store, PROJECT_ID)).toEqual([]);
  });
});

describe('parseIntentCollisions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses a well-formed intent-collision payload', () => {
    insertEvent(
      'intent-collision',
      '{"file":"a.ts","sibling":"fleet-2","intent":"claim"}',
      Date.now(),
    );
    expect(parseIntentCollisions(store, PROJECT_ID)).toEqual([
      { file: 'a.ts', sibling: 'fleet-2', intent: 'claim' },
    ]);
  });

  it('dedups by file+sibling keeping the row inserted last (newest by id order)', () => {
    // intentCollisionEvents orders by `id DESC` (insertion order) — the row
    // inserted LAST is the one the dedup keeps.
    insertEvent(
      'intent-collision',
      '{"file":"a.ts","sibling":"fleet-2","intent":"older"}',
      Date.now() - 1000,
    );
    insertEvent(
      'intent-collision',
      '{"file":"a.ts","sibling":"fleet-2","intent":"newer"}',
      Date.now(),
    );
    expect(parseIntentCollisions(store, PROJECT_ID)).toEqual([
      { file: 'a.ts', sibling: 'fleet-2', intent: 'newer' },
    ]);
  });

  it('drops a collision older than the 48h freshness window', () => {
    const staleAt = Date.now() - 49 * 60 * 60 * 1000;
    insertEvent(
      'intent-collision',
      '{"file":"a.ts","sibling":"fleet-2","intent":"stale"}',
      staleAt,
    );
    expect(parseIntentCollisions(store, PROJECT_ID)).toEqual([]);
  });

  it('keeps a collision inside the 48h freshness window', () => {
    const freshAt = Date.now() - 47 * 60 * 60 * 1000;
    insertEvent(
      'intent-collision',
      '{"file":"a.ts","sibling":"fleet-2","intent":"fresh"}',
      freshAt,
    );
    expect(parseIntentCollisions(store, PROJECT_ID)).toHaveLength(1);
  });

  it('skips a malformed JSON payload', () => {
    insertEvent('intent-collision', 'not json', Date.now());
    expect(parseIntentCollisions(store, PROJECT_ID)).toEqual([]);
  });
});

describe('parseNearMissRecurring', () => {
  it('parses a well-formed near-miss-recurring payload', () => {
    insertEvent('near-miss-recurring', '{"nearMissClass":"guardDenials","streak":3}', 100);
    expect(parseNearMissRecurring(store, PROJECT_ID)).toEqual([
      { nearMissClass: 'guardDenials', streak: 3 },
    ]);
  });

  it('keeps only the row inserted last (newest by id order) per class', () => {
    // nearMissRecurringEvents orders by `id DESC` (insertion order) — the row
    // inserted LAST is the one the dedup keeps.
    insertEvent('near-miss-recurring', '{"nearMissClass":"guardDenials","streak":3}', 100);
    insertEvent('near-miss-recurring', '{"nearMissClass":"guardDenials","streak":5}', 200);
    expect(parseNearMissRecurring(store, PROJECT_ID)).toEqual([
      { nearMissClass: 'guardDenials', streak: 5 },
    ]);
  });

  it('skips an unrecognized nearMissClass value', () => {
    insertEvent('near-miss-recurring', '{"nearMissClass":"madeUp","streak":3}', 100);
    expect(parseNearMissRecurring(store, PROJECT_ID)).toEqual([]);
  });

  it('skips a malformed JSON payload', () => {
    insertEvent('near-miss-recurring', 'not json', 100);
    expect(parseNearMissRecurring(store, PROJECT_ID)).toEqual([]);
  });
});

describe('parseGuardDenialEvents', () => {
  it('parses a well-formed guard-denial payload', () => {
    insertEvent('guard-denial', '{"kind":"containment","target":"/etc/passwd"}', 100);
    expect(parseGuardDenialEvents(store, PROJECT_ID)).toEqual([
      { kind: 'containment', target: '/etc/passwd' },
    ]);
  });

  it('does not dedup — a repeated kind+target across firings is a separate real denial', () => {
    insertEvent('guard-denial', '{"kind":"containment","target":"x"}', 200);
    insertEvent('guard-denial', '{"kind":"containment","target":"x"}', 100);
    expect(parseGuardDenialEvents(store, PROJECT_ID)).toHaveLength(2);
  });

  it('skips an unrecognized kind value', () => {
    insertEvent('guard-denial', '{"kind":"madeUp","target":"x"}', 100);
    expect(parseGuardDenialEvents(store, PROJECT_ID)).toEqual([]);
  });

  it('skips a malformed JSON payload', () => {
    insertEvent('guard-denial', 'not json', 100);
    expect(parseGuardDenialEvents(store, PROJECT_ID)).toEqual([]);
  });
});

describe('parseSyncBackRefusalEvents', () => {
  it('parses a well-formed sync-back-refusal payload', () => {
    insertEvent('sync-back-refusal', '{"details":"rerere replay failed"}', 100);
    expect(parseSyncBackRefusalEvents(store, PROJECT_ID)).toEqual([
      { details: 'rerere replay failed' },
    ]);
  });

  it('skips a malformed JSON payload', () => {
    insertEvent('sync-back-refusal', 'not json', 100);
    expect(parseSyncBackRefusalEvents(store, PROJECT_ID)).toEqual([]);
  });
});

describe('parseLandGateAlarmEvents', () => {
  it('parses a well-formed land-gate-alarm payload', () => {
    insertEvent('land-gate-alarm', '{"details":"typecheck failed post-merge"}', 100);
    expect(parseLandGateAlarmEvents(store, PROJECT_ID)).toEqual([
      { details: 'typecheck failed post-merge' },
    ]);
  });

  it('skips a malformed JSON payload', () => {
    insertEvent('land-gate-alarm', 'not json', 100);
    expect(parseLandGateAlarmEvents(store, PROJECT_ID)).toEqual([]);
  });
});

describe('parseConvergenceRedEvents', () => {
  it('parses a well-formed convergence-red payload, surfacing `merge` as `details`', () => {
    insertEvent('convergence-red', '{"check":"full-gate","merge":"conflict in shell.ts"}', 100);
    expect(parseConvergenceRedEvents(store, PROJECT_ID)).toEqual([
      { check: 'full-gate', details: 'conflict in shell.ts' },
    ]);
  });

  it('skips a payload missing a required field', () => {
    insertEvent('convergence-red', '{"check":"full-gate"}', 100);
    expect(parseConvergenceRedEvents(store, PROJECT_ID)).toEqual([]);
  });

  it('skips a malformed JSON payload', () => {
    insertEvent('convergence-red', 'not json', 100);
    expect(parseConvergenceRedEvents(store, PROJECT_ID)).toEqual([]);
  });
});

describe('parseE2eLandBlockEvents', () => {
  it('parses a well-formed e2e-land-block payload', () => {
    insertEvent('e2e-land-block', '{"detail":"critical journey failed"}', 100);
    expect(parseE2eLandBlockEvents(store, PROJECT_ID)).toEqual([
      { detail: 'critical journey failed' },
    ]);
  });

  it('skips a malformed JSON payload', () => {
    insertEvent('e2e-land-block', 'not json', 100);
    expect(parseE2eLandBlockEvents(store, PROJECT_ID)).toEqual([]);
  });
});

describe('parseLandedEvents', () => {
  it('parses a well-formed landed payload, carrying created_at as `at`', () => {
    insertEvent('landed', '{"details":"merged to main"}', 100);
    expect(parseLandedEvents(store, PROJECT_ID)).toEqual([{ details: 'merged to main', at: 100 }]);
  });

  it('does not dedup — each landing is its own real event', () => {
    insertEvent('landed', '{"details":"merged to main"}', 200);
    insertEvent('landed', '{"details":"merged to main"}', 100);
    expect(parseLandedEvents(store, PROJECT_ID)).toHaveLength(2);
  });

  it('skips a malformed JSON payload', () => {
    insertEvent('landed', 'not json', 100);
    expect(parseLandedEvents(store, PROJECT_ID)).toEqual([]);
  });
});
