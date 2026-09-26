// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE MODEL SCOREBOARD (operator, 2026-09-25): the fleet benchmarks its own
 * models per tier, staffs each tier from the result, and re-explores on its
 * own when an alias starts serving a newer model.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import {
  aliasOf,
  tierStats,
  leaderOf,
  chooseModel,
  routeTaskModel,
  readRoutedFirings,
  laneOfFiring,
  renderScoreboard,
  tierOverride,
  MIN_ARM_FIRINGS,
  TIER_CANDIDATES,
  type RoutedFiring,
  type ArmStats,
} from '../../src/flight/model-scoreboard.js';

function arm(modelId: string, firings: number, shipped: number, costUsd: number): ArmStats {
  return { modelId, firings, shipped, costUsd };
}

function runs(
  tier: RoutedFiring['tier'],
  modelId: string,
  n: number,
  shipped: number,
  costEach: number,
): RoutedFiring[] {
  return Array.from({ length: n }, (_, i) => ({
    tier,
    modelId,
    shipped: i < shipped,
    costUsd: costEach,
  }));
}

describe('aliasOf', () => {
  it('reads the family off a served model id', () => {
    expect(aliasOf('claude-opus-5-5')).toBe('opus');
    expect(aliasOf('claude-fable-5-1')).toBe('fable');
    expect(aliasOf('claude-haiku-4-5-20251001')).toBe('haiku');
    expect(aliasOf('local-llama')).toBeNull();
  });
});

describe('tierStats', () => {
  it("counts only the tier's firings of each alias's CURRENT model", () => {
    const firings = [
      ...runs('escalated', 'claude-opus-5-5', 4, 3, 2),
      ...runs('default', 'claude-opus-5-5', 5, 5, 1),
      ...runs('escalated', 'claude-fable-5-1', 2, 2, 5),
    ];
    const s = tierStats(firings, 'escalated', ['fable', 'opus']);
    expect(s.get('opus')).toEqual(arm('claude-opus-5-5', 4, 3, 8));
    expect(s.get('fable')).toEqual(arm('claude-fable-5-1', 2, 2, 10));
  });

  it('starts a newer model of an alias from nothing — an older record does not vouch for it', () => {
    const firings = [
      ...runs('escalated', 'claude-opus-5-5', 20, 18, 2),
      ...runs('escalated', 'claude-opus-6', 1, 1, 2),
    ];
    const s = tierStats(firings, 'escalated', ['opus']);
    expect(s.get('opus')).toEqual(arm('claude-opus-6', 1, 1, 2));
  });

  it('reports an alias not served yet as empty', () => {
    expect(tierStats([], 'default', ['sonnet']).get('sonnet')).toEqual(
      arm(null as unknown as string, 0, 0, 0),
    );
  });
});

describe('leaderOf — the operator rule', () => {
  it('prefers the cheaper model when its ship rate is within 5 points of the best', () => {
    const stats = new Map([
      ['fable', arm('claude-fable-5-1', 20, 18, 90)], // 90%, $5.00
      ['opus', arm('claude-opus-5-5', 20, 17, 51)], // 85%, $3.00
    ]);
    expect(leaderOf(stats)).toBe('opus');
  });

  it('keeps the better model when the cheaper one ships more than 5 points less', () => {
    const stats = new Map([
      ['fable', arm('claude-fable-5-1', 20, 18, 90)], // 90%
      ['opus', arm('claude-opus-5-5', 20, 16, 40)], // 80%
    ]);
    expect(leaderOf(stats)).toBe('fable');
  });
});

describe('chooseModel', () => {
  const thin = new Map([
    ['sonnet', arm('claude-sonnet-5', 40, 28, 90)],
    ['opus', arm('claude-opus-5-5', 3, 2, 10)],
  ]);
  const measured = new Map([
    ['sonnet', arm('claude-sonnet-5', 40, 28, 90)], // 70%, $3.21
    ['opus', arm('claude-opus-5-5', 20, 14, 35)], // 70%, $2.50
  ]);
  const ids = Array.from({ length: 300 }, (_, i) => `web-task-${i}`);

  it('explores while any candidate is thin, sending every decision to the thinnest candidate (2026-09-26)', () => {
    const picks = ids.map((id) => chooseModel('default', id, thin));
    expect(new Set(picks.map((p) => p.model))).toEqual(new Set(['opus']));
    expect(picks.every((p) => p.phase === 'explore')).toBe(true);
    expect(picks[0]!.reason).toContain(`opus 3/${MIN_ARM_FIRINGS}`);
  });

  it('breaks a tie between equally thin candidates by the task hash, stably', () => {
    const tied = new Map([
      ['sonnet', arm('claude-sonnet-5', 2, 2, 4)],
      ['opus', arm('claude-opus-5-5', 2, 2, 4)],
      ['fable', arm('claude-fable-5-1', 9, 9, 40)],
    ]);
    const picks = ids.map((id) => chooseModel('default', id, tied).model);
    expect(new Set(picks)).toEqual(new Set(['sonnet', 'opus']));
    expect(chooseModel('default', ids[7]!, tied).model).toBe(picks[7]);
  });

  it('exploits once all are measured: the leader takes most tasks, the other is still watched', () => {
    const picks = ids.map((id) => chooseModel('default', id, measured).model);
    const toLeader = picks.filter((m) => m === 'opus').length;
    expect(toLeader).toBeGreaterThan(210);
    expect(toLeader).toBeLessThan(270);
    expect(picks).toContain('sonnet');
  });
});

describe('tierOverride', () => {
  it('pins a tier by its own variable, or every tier by AUTOPILOT_MODEL', () => {
    expect(tierOverride('escalated', { AUTOPILOT_ESCALATED_MODEL: 'opus' })).toBe('opus');
    expect(tierOverride('default', { AUTOPILOT_DEFAULT_MODEL: 'sonnet' })).toBe('sonnet');
    expect(tierOverride('mechanical', { AUTOPILOT_MECHANICAL_MODEL: 'haiku' })).toBe('haiku');
    expect(
      tierOverride('mechanical', { AUTOPILOT_MODEL: 'opus', AUTOPILOT_MECHANICAL_MODEL: 'haiku' }),
    ).toBe('opus');
    expect(tierOverride('default', {})).toBeUndefined();
  });
});

describe('the store side: decisions recorded, firings matched', () => {
  let dir: string;
  let store: Store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ap-scoreboard-'));
    store = openStore(join(dir, 'db.sqlite'));
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', NULL, 1, 1)`,
      )
      .run();
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function firing(id: string, item: string, model: string, shipped: 0 | 1, at: number): void {
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, item, kind, sha, shipped, gate_result, cost_usd, model, created_at)
         VALUES ('p1', ?, ?, 'feat', NULL, ?, 'passed', 2, ?, ?)`,
      )
      .run(id, item, shipped, model, at);
  }

  it("records each decision, and matches each firing to its lane's latest decision before it", () => {
    const now = 10 * 24 * 60 * 60 * 1000;
    const first = routeTaskModel(store, 'p1', 'escalated', 't-1', {}, now);
    expect(TIER_CANDIDATES.escalated).toContain(first.model);
    firing('p1:firing-1', 't-1', 'claude-opus-5-5', 1, now + 10);
    routeTaskModel(store, 'p1', 'default', 't-1', { AUTOPILOT_DEFAULT_MODEL: 'sonnet' }, now + 20);
    firing('p1:firing-2', 't-1', 'claude-sonnet-5', 0, now + 30);
    firing('p1:firing-3', 't-unrouted', 'claude-sonnet-5', 1, now + 40);
    expect(readRoutedFirings(store, 'p1', now + 50)).toEqual([
      { tier: 'escalated', modelId: 'claude-opus-5-5', shipped: true, costUsd: 2 },
      { tier: 'default', modelId: 'claude-sonnet-5', shipped: false, costUsd: 2 },
      // the same lane's next firing flew under that lane's latest decision
      { tier: 'default', modelId: 'claude-sonnet-5', shipped: true, costUsd: 2 },
    ]);
  });

  it("matches a firing to its own lane's latest decision, even when it reports another task (2026-09-26)", () => {
    const now = 10 * 24 * 60 * 60 * 1000;
    routeTaskModel(
      store,
      'p1',
      'default',
      't-1',
      { AUTOPILOT_DEFAULT_MODEL: 'opus' },
      now,
      'fleet-2',
    );
    routeTaskModel(
      store,
      'p1',
      'escalated',
      't-2',
      { AUTOPILOT_ESCALATED_MODEL: 'fable' },
      now + 1,
      'base',
    );
    // fleet-2 reported a different task than it was routed for; base reported none
    firing('p1--fleet-2:firing-5', 't-other', 'claude-opus-5-5', 1, now + 10);
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, item, kind, sha, shipped, gate_result, cost_usd, model, created_at)
         VALUES ('p1', 'p1:firing-6', NULL, 'feat', NULL, 0, 'no-commit', 1, 'claude-fable-5-1', ?)`,
      )
      .run(now + 20);
    expect(readRoutedFirings(store, 'p1', now + 30)).toEqual([
      { tier: 'default', modelId: 'claude-opus-5-5', shipped: true, costUsd: 2 },
      { tier: 'escalated', modelId: 'claude-fable-5-1', shipped: false, costUsd: 1 },
    ]);
  });

  it('reads the lane off a firing id', () => {
    expect(laneOfFiring('fly-autopilot:firing-9')).toBe('base');
    expect(laneOfFiring('fly-autopilot--fleet-3:firing-9')).toBe('fleet-3');
  });

  it('prints a scoreboard for every tier', () => {
    const lines = renderScoreboard([
      ...runs('escalated', 'claude-fable-5-1', 15, 12, 5),
      ...runs('escalated', 'claude-opus-5-5', 15, 12, 3),
    ]);
    const text = lines.join('\n');
    expect(text).toContain('escalated: leader opus');
    expect(text).toContain('default: exploring');
    expect(TIER_CANDIDATES.default).toEqual(['sonnet', 'opus', 'fable']);
    expect(text).toContain('claude-opus-5-5');
    expect(text).toContain('not served yet');
  });
});
