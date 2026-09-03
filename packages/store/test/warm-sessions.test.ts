// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openStore, migrate, type Store } from '../src/index.js';
import { warmSessionSavings, extendedFiringSavings } from '../src/warm-sessions.js';

let store: Store;

let firingSeq = 0;

interface FiringTelemetry {
  readonly tokensIn?: number;
  readonly cacheRead?: number;
  readonly cacheWrite?: number;
  readonly cost?: number;
  readonly turns?: number;
}

function insertFiring(
  projectId: string,
  resumed: 0 | 1 | null,
  telemetry: FiringTelemetry = {},
  extended: 1 | null = null,
): void {
  firingSeq += 1;
  store.db
    .prepare(
      `INSERT INTO metrics (project_id, firing_id, resumed, extended, input_tokens, cache_read_tokens,
                             cache_write_tokens, cost_usd, turns, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      projectId,
      `ws-${firingSeq}`,
      resumed,
      extended,
      telemetry.tokensIn ?? 0,
      telemetry.cacheRead ?? 0,
      telemetry.cacheWrite ?? 0,
      telemetry.cost ?? 0,
      telemetry.turns ?? 0,
      1000,
    );
}

function insertProject(id: string): void {
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'registered', 1, 1)`,
    )
    .run(id, id, id, `/tmp/${id}`);
}

beforeEach(() => {
  store = openStore(':memory:');
  migrate(store);
  insertProject('p1');
  insertProject('p2');
});

afterEach(() => {
  store.close();
});

describe('warmSessionSavings', () => {
  it('returns empty groups and null deltas when no firings are recorded', () => {
    const empty = {
      firings: 0,
      avgFreshInputTokens: null,
      avgCacheReadTokens: null,
      avgCacheWriteTokens: null,
      avgCostUsd: null,
      avgTurns: null,
      avgCostPerTurn: null,
    };
    expect(warmSessionSavings(store.db, 'p1')).toEqual({
      resumed: empty,
      coldFallback: empty,
      cold: empty,
      freshInputDeltaPerFiring: null,
      costDeltaPerFiring: null,
      costPerTurnDeltaPerFiring: null,
    });
  });

  it('separates resumed, cold-fallback and never-requested firings into their groups', () => {
    insertFiring('p1', 1);
    insertFiring('p1', 1);
    insertFiring('p1', 0);
    insertFiring('p1', null);
    insertFiring('p1', null);
    insertFiring('p1', null);

    const savings = warmSessionSavings(store.db, 'p1');
    expect(savings.resumed.firings).toBe(2);
    expect(savings.coldFallback.firings).toBe(1);
    expect(savings.cold.firings).toBe(3);
  });

  it('ignores firings recorded for other projects', () => {
    insertFiring('p1', 1);
    insertFiring('p2', 1);
    insertFiring('p2', null);

    const savings = warmSessionSavings(store.db, 'p1');
    expect(savings.resumed.firings).toBe(1);
    expect(savings.cold.firings).toBe(0);
  });

  it('computes per-group averages over token, cost and turn columns', () => {
    insertFiring('p1', 1, { tokensIn: 100, cacheRead: 2000, cacheWrite: 50, cost: 1, turns: 10 });
    insertFiring('p1', 1, { tokensIn: 300, cacheRead: 4000, cacheWrite: 150, cost: 3, turns: 30 });

    const savings = warmSessionSavings(store.db, 'p1');
    expect(savings.resumed).toEqual({
      firings: 2,
      avgFreshInputTokens: 200,
      avgCacheReadTokens: 3000,
      avgCacheWriteTokens: 100,
      avgCostUsd: 2,
      avgTurns: 20,
      avgCostPerTurn: 0.1, // (1/10 + 3/30) / 2
    });
  });

  it('averages cost-per-turn per firing, not group-total cost over group-total turns', () => {
    // A cheap-but-few-turns firing and an expensive-but-many-turns firing average
    // to the same $2 avgCostUsd either way an aggregator computes it, but the
    // per-firing cost/turn ratios (0.5 and 0.05) are wildly different — averaging
    // the per-firing ratios (the confound-controlled metric) must not collapse to
    // group-cost/group-turns (2/22 ≈ 0.09), which would hide that difference.
    insertFiring('p1', 1, { cost: 1, turns: 2 });
    insertFiring('p1', 1, { cost: 3, turns: 60 });

    const savings = warmSessionSavings(store.db, 'p1');
    expect(savings.resumed.avgCostPerTurn).toBeCloseTo((1 / 2 + 3 / 60) / 2);
    expect(savings.resumed.avgCostPerTurn).not.toBeCloseTo(2 / 62);
  });

  it('excludes a zero-turn firing from avgCostPerTurn instead of dividing by zero', () => {
    insertFiring('p1', 1, { cost: 1, turns: 0 });
    insertFiring('p1', 1, { cost: 4, turns: 10 });

    const savings = warmSessionSavings(store.db, 'p1');
    expect(savings.resumed.avgCostPerTurn).toBe(0.4); // only the turns:10 firing counts
  });

  it('reports a cost-per-turn delta that can disagree with the raw cost delta (the confound it controls for)', () => {
    // Resumed pays MORE raw cost per firing (higher avg turns) but LESS per turn —
    // the whole point of a confound-controlled metric is to surface that.
    insertFiring('p1', 1, { cost: 4, turns: 40 }); // $0.10/turn
    insertFiring('p1', null, { cost: 1, turns: 5 }); // $0.20/turn

    const savings = warmSessionSavings(store.db, 'p1');
    expect(savings.costDeltaPerFiring).toBe(-3); // cold cheaper per firing...
    expect(savings.costPerTurnDeltaPerFiring).toBeCloseTo(0.1); // ...but resumed cheaper per turn
  });

  it('reports positive deltas when resumed firings pay less fresh input and cost than cold ones', () => {
    insertFiring('p1', 1, { tokensIn: 100, cost: 1 });
    insertFiring('p1', null, { tokensIn: 500, cost: 4 });
    insertFiring('p1', null, { tokensIn: 700, cost: 6 });

    const savings = warmSessionSavings(store.db, 'p1');
    expect(savings.freshInputDeltaPerFiring).toBe(500);
    expect(savings.costDeltaPerFiring).toBe(4);
  });

  it('excludes cold-fallback firings from the cold baseline the deltas compare against', () => {
    insertFiring('p1', 1, { tokensIn: 100, cost: 1 });
    insertFiring('p1', 0, { tokensIn: 9000, cost: 90 });
    insertFiring('p1', null, { tokensIn: 500, cost: 4 });

    const savings = warmSessionSavings(store.db, 'p1');
    expect(savings.freshInputDeltaPerFiring).toBe(400);
    expect(savings.costDeltaPerFiring).toBe(3);
  });

  it('leaves deltas null when either comparison group has no firings', () => {
    insertFiring('p1', 1, { tokensIn: 100, cost: 1 });

    const savings = warmSessionSavings(store.db, 'p1');
    expect(savings.freshInputDeltaPerFiring).toBeNull();
    expect(savings.costDeltaPerFiring).toBeNull();
    expect(savings.costPerTurnDeltaPerFiring).toBeNull();
  });
});

describe('extendedFiringSavings', () => {
  it('returns empty groups and null deltas when no firings are recorded', () => {
    const empty = {
      firings: 0,
      avgFreshInputTokens: null,
      avgCacheReadTokens: null,
      avgCacheWriteTokens: null,
      avgCostUsd: null,
      avgTurns: null,
      avgCostPerTurn: null,
    };
    expect(extendedFiringSavings(store.db, 'p1')).toEqual({
      extended: empty,
      ordinary: empty,
      costDeltaPerFiring: null,
      costPerTurnDeltaPerFiring: null,
    });
  });

  it('separates extended firings from every other recorded firing', () => {
    insertFiring('p1', null, {}, 1);
    insertFiring('p1', null, {}, 1);
    insertFiring('p1', null, {}, null);
    insertFiring('p1', 1, {}, null); // a resumed (not extended) firing still counts as ordinary

    const savings = extendedFiringSavings(store.db, 'p1');
    expect(savings.extended.firings).toBe(2);
    expect(savings.ordinary.firings).toBe(2);
  });

  it('ignores firings recorded for other projects', () => {
    insertFiring('p1', null, {}, 1);
    insertFiring('p2', null, {}, 1);
    insertFiring('p2', null, {}, null);

    const savings = extendedFiringSavings(store.db, 'p1');
    expect(savings.extended.firings).toBe(1);
    expect(savings.ordinary.firings).toBe(0);
  });

  it('computes per-group averages over token, cost and turn columns', () => {
    insertFiring(
      'p1',
      null,
      { tokensIn: 100, cacheRead: 2000, cacheWrite: 50, cost: 1, turns: 10 },
      1,
    );
    insertFiring(
      'p1',
      null,
      { tokensIn: 300, cacheRead: 4000, cacheWrite: 150, cost: 3, turns: 30 },
      1,
    );

    const savings = extendedFiringSavings(store.db, 'p1');
    expect(savings.extended).toEqual({
      firings: 2,
      avgFreshInputTokens: 200,
      avgCacheReadTokens: 3000,
      avgCacheWriteTokens: 100,
      avgCostUsd: 2,
      avgTurns: 20,
      avgCostPerTurn: 0.1, // (1/10 + 3/30) / 2
    });
  });

  it('excludes a zero-turn firing from avgCostPerTurn instead of dividing by zero', () => {
    insertFiring('p1', null, { cost: 1, turns: 0 }, 1);
    insertFiring('p1', null, { cost: 4, turns: 10 }, 1);

    const savings = extendedFiringSavings(store.db, 'p1');
    expect(savings.extended.avgCostPerTurn).toBe(0.4); // only the turns:10 firing counts
  });

  it('reports a cost-per-turn delta that can disagree with the raw cost delta (the confound it controls for)', () => {
    insertFiring('p1', null, { cost: 4, turns: 40 }, 1); // $0.10/turn
    insertFiring('p1', null, { cost: 1, turns: 5 }, null); // $0.20/turn

    const savings = extendedFiringSavings(store.db, 'p1');
    expect(savings.costDeltaPerFiring).toBe(-3); // ordinary cheaper per firing...
    expect(savings.costPerTurnDeltaPerFiring).toBeCloseTo(0.1); // ...but extended cheaper per turn
  });

  it('leaves deltas null when either comparison group has no firings', () => {
    insertFiring('p1', null, { tokensIn: 100, cost: 1 }, 1);

    const savings = extendedFiringSavings(store.db, 'p1');
    expect(savings.costDeltaPerFiring).toBeNull();
    expect(savings.costPerTurnDeltaPerFiring).toBeNull();
  });
});
