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
  parseConvergenceUnverifiableEvents,
  parseE2eLandBlockEvents,
  parseGuardVerificationFailedEvents,
  parseLandedEvents,
  alarmCutoffs,
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
      { family: 'fix: *', spendUsd: 4.5, firings: 3, unpriced: 0 },
    ]);
  });

  it('carries the firings the sweep could not price, and reads an older payload as none (epic 0036)', () => {
    insertEvent('family-runaway', '{"family":"wire *","spendUsd":4.5,"firings":3}', 100);
    insertEvent(
      'family-runaway',
      '{"family":"fix: *","spendUsd":60,"firings":14,"unpriced":2}',
      200,
    );
    expect(parseFamilyRunaways(store, PROJECT_ID)).toEqual([
      { family: 'fix: *', spendUsd: 60, firings: 14, unpriced: 2 },
      { family: 'wire *', spendUsd: 4.5, firings: 3, unpriced: 0 },
    ]);
  });

  it('keeps only the first (newest, since rows arrive newest-first by insertion order) row per family', () => {
    // familyRunawayEvents orders by `id DESC` (insertion order), not created_at —
    // the row inserted LAST is the one the dedup keeps.
    insertEvent('family-runaway', '{"family":"fix: *","spendUsd":4.5,"firings":3}', 100);
    insertEvent('family-runaway', '{"family":"fix: *","spendUsd":9,"firings":5}', 200);
    expect(parseFamilyRunaways(store, PROJECT_ID)).toEqual([
      { family: 'fix: *', spendUsd: 9, firings: 5, unpriced: 0 },
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

  it('drops the collisions older than the cutoff it is given — a landing reconciles them (2026-10-01)', () => {
    insertEvent('intent-collision', '{"file":"a.ts","sibling":"fleet-2","intent":"old"}', 100);
    insertEvent('intent-collision', '{"file":"a.ts","sibling":"fleet-3","intent":"new"}', 300);
    expect(parseIntentCollisions(store, PROJECT_ID, 200)).toEqual([
      { file: 'a.ts', sibling: 'fleet-3', intent: 'new' },
    ]);
    expect(parseIntentCollisions(store, PROJECT_ID, 301)).toEqual([]);
    expect(parseIntentCollisions(store, PROJECT_ID, 0)).toHaveLength(2);
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

  it("surfaces the failing command's outputTail when the payload carries one as a string", () => {
    insertEvent(
      'convergence-red',
      '{"check":"pnpm run test","merge":"fast-forwarded","outputTail":" FAIL  x.test.ts > a"}',
      100,
    );
    expect(parseConvergenceRedEvents(store, PROJECT_ID)).toStrictEqual([
      { check: 'pnpm run test', details: 'fast-forwarded', outputTail: ' FAIL  x.test.ts > a' },
    ]);
  });

  it('ignores a non-string outputTail rather than surfacing it', () => {
    insertEvent('convergence-red', '{"check":"c","merge":"m","outputTail":7}', 100);
    expect(parseConvergenceRedEvents(store, PROJECT_ID)).toStrictEqual([
      { check: 'c', details: 'm' },
    ]);
  });

  it('skips a malformed JSON payload', () => {
    insertEvent('convergence-red', 'not json', 100);
    expect(parseConvergenceRedEvents(store, PROJECT_ID)).toEqual([]);
  });

  it('parses the optional `ms` duration when the payload carries one', () => {
    insertEvent(
      'convergence-red',
      '{"check":"full-gate","merge":"conflict in shell.ts","ms":3000}',
      100,
    );
    expect(parseConvergenceRedEvents(store, PROJECT_ID)).toEqual([
      { check: 'full-gate', details: 'conflict in shell.ts', ms: 3000 },
    ]);
  });

  it('leaves `ms` absent for a row persisted before duration was tracked', () => {
    insertEvent('convergence-red', '{"check":"full-gate","merge":"conflict in shell.ts"}', 100);
    const [entry] = parseConvergenceRedEvents(store, PROJECT_ID);
    expect(entry).not.toHaveProperty('ms');
  });
});

describe('parseConvergenceUnverifiableEvents', () => {
  it('parses a well-formed convergence-unverifiable payload', () => {
    insertEvent(
      'convergence-unverifiable',
      '{"signature":"typecheck+lint","ms":12,"floorMs":160}',
      100,
    );
    expect(parseConvergenceUnverifiableEvents(store, PROJECT_ID)).toEqual([
      { signature: 'typecheck+lint', ms: 12, floorMs: 160 },
    ]);
  });

  it('skips a payload missing a required field', () => {
    insertEvent('convergence-unverifiable', '{"signature":"typecheck+lint","ms":12}', 100);
    expect(parseConvergenceUnverifiableEvents(store, PROJECT_ID)).toEqual([]);
  });

  it('skips a malformed JSON payload', () => {
    insertEvent('convergence-unverifiable', 'not json', 100);
    expect(parseConvergenceUnverifiableEvents(store, PROJECT_ID)).toEqual([]);
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

describe('parseGuardVerificationFailedEvents', () => {
  it('parses a well-formed guard-verify-failed payload', () => {
    insertEvent('guard-verify-failed', '{"reason":"guard-hook script not found"}', 100);
    expect(parseGuardVerificationFailedEvents(store, PROJECT_ID)).toEqual([
      { reason: 'guard-hook script not found' },
    ]);
  });

  it('skips a malformed JSON payload', () => {
    insertEvent('guard-verify-failed', 'not json', 100);
    expect(parseGuardVerificationFailedEvents(store, PROJECT_ID)).toEqual([]);
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

describe('only live alarms reach the Health panel (2026-09-29)', () => {
  const HOUR = 60 * 60 * 1000;

  it('cuts at the latest landing, and 48 hours back', () => {
    const now = 1_000 * HOUR;
    expect(alarmCutoffs(store, PROJECT_ID, now)).toEqual({
      sinceLanding: 0,
      fresh: now - 48 * HOUR,
      reconciled: now - 48 * HOUR,
    });
    insertEvent('landed', '{"details":"landed"}', now - 5 * HOUR);
    insertEvent('landed', '{"details":"landed"}', now - 2 * HOUR);
    expect(alarmCutoffs(store, PROJECT_ID, now).sinceLanding).toBe(now - 2 * HOUR + 1);
  });

  it('a landing reconciles sync-back refusals and intent collisions — the later of the two cutoffs (2026-10-01)', () => {
    // A refusal from the evening before and a collision from that night
    // outlived three landings on the Health panel: both wore the 48-hour
    // window while the landing after them had already converged every lane
    // and stranded what would not merge onto the board.
    const now = 1_000 * HOUR;
    insertEvent('landed', '{"details":"landed"}', now - 2 * HOUR);
    expect(alarmCutoffs(store, PROJECT_ID, now).reconciled).toBe(now - 2 * HOUR + 1);
    // A project that has not landed in days still gets the 48-hour bound.
    insertEvent('landed', '{"details":"landed"}', now - 2 * HOUR);
    const stale = alarmCutoffs(store, PROJECT_ID, now + 100 * HOUR);
    expect(stale.reconciled).toBe(stale.fresh);
  });

  it('every alarm parser drops the rows older than its cutoff and keeps the rest', () => {
    const rows: [string, string, (since: number) => unknown[]][] = [
      [
        'near-miss-recurring',
        '{"nearMissClass":"guardDenials","streak":3}',
        (s) => parseNearMissRecurring(store, PROJECT_ID, s),
      ],
      [
        'guard-denial',
        '{"kind":"containment","target":"x"}',
        (s) => parseGuardDenialEvents(store, PROJECT_ID, s),
      ],
      [
        'sync-back-refusal',
        '{"details":"d"}',
        (s) => parseSyncBackRefusalEvents(store, PROJECT_ID, s),
      ],
      ['land-gate-alarm', '{"details":"d"}', (s) => parseLandGateAlarmEvents(store, PROJECT_ID, s)],
      [
        'convergence-red',
        '{"check":"c","merge":"m"}',
        (s) => parseConvergenceRedEvents(store, PROJECT_ID, s),
      ],
      [
        'convergence-unverifiable',
        '{"signature":"s","ms":1,"floorMs":2}',
        (s) => parseConvergenceUnverifiableEvents(store, PROJECT_ID, s),
      ],
      ['e2e-land-block', '{"detail":"d"}', (s) => parseE2eLandBlockEvents(store, PROJECT_ID, s)],
      [
        'guard-verify-failed',
        '{"reason":"r"}',
        (s) => parseGuardVerificationFailedEvents(store, PROJECT_ID, s),
      ],
    ];
    for (const [type, payload, parse] of rows) {
      insertEvent(type, payload, 100);
      insertEvent(type, payload, 300);
      expect(parse(0), type).toHaveLength(type === 'near-miss-recurring' ? 1 : 2);
      expect(parse(200), type).toHaveLength(1);
      expect(parse(301), type).toHaveLength(0);
    }
  });
});
