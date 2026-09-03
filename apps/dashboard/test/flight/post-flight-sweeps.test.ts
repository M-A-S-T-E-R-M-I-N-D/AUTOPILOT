// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openStore, migrate, type Store } from '@autopilot/store';
import {
  runFamilyRunawaySweep,
  runFleetWisdomSweep,
  runSoulMiningSweep,
} from '../../src/flight/post-flight-sweeps.js';
import { RUNAWAY_SPEND_USD, RUNAWAY_FIRINGS } from '../../src/flight/triage-factors.js';
import {
  CHECKPOINT_SOUL_AMENDMENT_MARKER,
  CHECKPOINT_STREAK_THRESHOLD,
} from '../../src/flight/soul-mining.js';
import { FLEET_WISDOM_GENERALIZATION_THRESHOLD } from '../../src/flight/fleet-wisdom-mining.js';

/**
 * runFamilyRunawaySweep (post-flight-sweeps.ts) had zero direct coverage —
 * only its pure helpers (triage-factors.ts's familyEconomicsFromRows/
 * isRunaway) were tested. This proves the sweep's own DB-facing contract: it
 * reads metrics rows, folds them by commit-subject family, and writes an
 * 'events' row (never more than a proposal — never touches tasks/board) only
 * once BOTH runaway thresholds are trailing-crossed.
 */
describe('runFamilyRunawaySweep', () => {
  let store: Store;

  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', 1, 1)`,
      )
      .run();
  });

  afterEach(() => store.db.close());

  function shipSlice(firingId: string, commitSubject: string, costUsd: number): void {
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, commit_subject, completion, cost_usd, created_at)
         VALUES ('p1', ?, ?, 'slice', ?, 1)`,
      )
      .run(firingId, commitSubject, costUsd);
  }

  function events(): { type: string; payload: string }[] {
    return store.db.prepare('SELECT type, payload FROM events').all() as {
      type: string;
      payload: string;
    }[];
  }

  it('writes a family-runaway event once a commit-subject family trailing-crosses BOTH thresholds', () => {
    const perFiringCost = RUNAWAY_SPEND_USD / RUNAWAY_FIRINGS + 1; // crosses spend once firings crosses too
    const firings = RUNAWAY_FIRINGS + 1;
    for (let i = 0; i < firings; i++) {
      shipSlice(
        `f-${i}`,
        `feat(dashboard): mutation testing widens to widget-${i}.ts`,
        perFiringCost,
      );
    }

    runFamilyRunawaySweep(store, 'p1', () => 12345);

    const rows = events();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe('family-runaway');
    const payload = JSON.parse(rows[0]?.payload ?? '{}') as {
      family: string;
      spendUsd: number;
      firings: number;
    };
    expect(payload.family).toBe('mutation testing widens to *');
    expect(payload.firings).toBe(firings);
    expect(payload.spendUsd).toBeCloseTo(perFiringCost * firings);
  });

  it('writes no event when a family stays under the thresholds', () => {
    for (let i = 0; i < 3; i++) {
      shipSlice(`f-${i}`, `feat(dashboard): small fix to widget-${i}.ts`, 1);
    }

    runFamilyRunawaySweep(store, 'p1', () => 12345);

    expect(events()).toEqual([]);
  });

  it('is best-effort — a query failure never throws', () => {
    store.db.close();
    expect(() => runFamilyRunawaySweep(store, 'p1', () => 12345)).not.toThrow();
  });
});

/**
 * runFleetWisdomSweep (post-flight-sweeps.ts) had zero direct coverage —
 * only its pure decision (fleet-wisdom-mining.ts's mineFleetWisdom) was
 * tested. This proves the sweep's own DB-facing contract: it reads every
 * project's SOUL plus the fleet row from the SAME store, and writes a
 * pending fleet.wisdom_proposed only once a registered learning has
 * generalized across enough distinct projects.
 */
describe('runFleetWisdomSweep', () => {
  let store: Store;

  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
  });

  afterEach(() => store.db.close());

  function seedProjectSoul(slug: string, soul: string): void {
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, soul, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'flying', ?, 1, 1)`,
      )
      .run(slug, slug, slug, `/tmp/${slug}`, soul);
  }

  function fleetRow(): { wisdom: string; wisdomProposed: string | null } {
    return store.db
      .prepare(`SELECT wisdom, wisdom_proposed AS wisdomProposed FROM fleet WHERE id = 'fleet'`)
      .get() as { wisdom: string; wisdomProposed: string | null };
  }

  it('proposes fleet wisdom once a learning generalizes across the threshold of distinct projects', () => {
    for (let i = 0; i < FLEET_WISDOM_GENERALIZATION_THRESHOLD; i++) {
      seedProjectSoul(`p${i}`, `${CHECKPOINT_SOUL_AMENDMENT_MARKER}\n- some note\n`);
    }

    runFleetWisdomSweep(store, () => 12345);

    const row = fleetRow();
    expect(row.wisdomProposed).not.toBeNull();
    expect(row.wisdomProposed).toContain(CHECKPOINT_SOUL_AMENDMENT_MARKER);
    expect(row.wisdomProposed).toContain(String(FLEET_WISDOM_GENERALIZATION_THRESHOLD));
  });

  it('proposes nothing when fewer than the threshold of distinct projects carry the marker', () => {
    for (let i = 0; i < FLEET_WISDOM_GENERALIZATION_THRESHOLD - 1; i++) {
      seedProjectSoul(`p${i}`, `${CHECKPOINT_SOUL_AMENDMENT_MARKER}\n- some note\n`);
    }

    runFleetWisdomSweep(store, () => 12345);

    expect(fleetRow().wisdomProposed).toBeNull();
  });

  it('is best-effort — a query failure never throws', () => {
    store.db.close();
    expect(() => runFleetWisdomSweep(store, () => 12345)).not.toThrow();
  });
});

/**
 * runSoulMiningSweep (post-flight-sweeps.ts) had zero direct coverage — only
 * its pure decisions (soul-mining.ts's mineSoulAmendment/pruneSoulAmendment/
 * mineNoopSoulAmendment/pruneNoopSoulAmendment) were tested. This proves the
 * sweep's own DB-facing contract: it reads a project's soul/soul_proposed
 * plus its most recent metrics.gate_result rows from the SAME store, and
 * writes a pending projects.soul_proposed only once a registered learning's
 * gate-result streak has actually happened.
 */
describe('runSoulMiningSweep', () => {
  let store: Store;

  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, soul, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', '# SOUL', 1, 1)`,
      )
      .run();
  });

  afterEach(() => store.db.close());

  function shipGateResult(firingId: string, gateResult: string, createdAt: number): void {
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, gate_result, created_at)
         VALUES ('p1', ?, ?, ?)`,
      )
      .run(firingId, gateResult, createdAt);
  }

  function soulProposed(): string | null {
    return (
      store.db
        .prepare(`SELECT soul_proposed AS soulProposed FROM projects WHERE id = 'p1'`)
        .get() as {
        soulProposed: string | null;
      }
    ).soulProposed;
  }

  it('proposes a SOUL amendment once the newest firings all checkpointed', () => {
    for (let i = 0; i < CHECKPOINT_STREAK_THRESHOLD; i++) {
      shipGateResult(`f-${i}`, 'checkpointed', i + 1);
    }

    runSoulMiningSweep(store, 'p1', () => 12345);

    expect(soulProposed()).toContain(CHECKPOINT_SOUL_AMENDMENT_MARKER);
  });

  it('proposes nothing when the checkpoint streak has not happened', () => {
    shipGateResult('f-0', 'shipped', 1);
    for (let i = 1; i < CHECKPOINT_STREAK_THRESHOLD; i++) {
      shipGateResult(`f-${i}`, 'checkpointed', i + 1);
    }

    runSoulMiningSweep(store, 'p1', () => 12345);

    expect(soulProposed()).toBeNull();
  });

  it('proposes nothing when a proposal is already pending', () => {
    store.db.prepare(`UPDATE projects SET soul_proposed = 'pending draft' WHERE id = 'p1'`).run();
    for (let i = 0; i < CHECKPOINT_STREAK_THRESHOLD; i++) {
      shipGateResult(`f-${i}`, 'checkpointed', i + 1);
    }

    runSoulMiningSweep(store, 'p1', () => 12345);

    expect(soulProposed()).toBe('pending draft');
  });

  it('is best-effort — a query failure never throws', () => {
    store.db.close();
    expect(() => runSoulMiningSweep(store, 'p1', () => 12345)).not.toThrow();
  });
});
