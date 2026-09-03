// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the DORA-for-agents panel's, the
 * parallel-gate-savings panel's, the fleet-wide header bar's, each
 * project card's/Metrics panel's, and the CURRENT ROUND panel's tile-item
 * math (`web/stat-tiles.ts`) — the DORA/gate-parallel pair extracted under
 * epic 0002 "shell decomposition", slice 2, twenty-seventh cut; the
 * fleet-wide `totalsTileItems`/`statTileItems` pair under the twenty-eighth
 * cut; the `cardStatItems`/`metricsStatItems` pair under the thirty-fifth
 * cut; the `roundSinceLabel`/`roundStatItems` pair under the forty-ninth
 * cut; `cardMetaItems` under the sixty-first cut. `dora-tiles.test.ts`/
 * `gate-parallel-tiles.test.ts`/`fleet-stat-tiles.test.ts`/
 * `stat-chip-tooltips.test.ts`/`round-panel.test.ts` already
 * regression-test this logic indirectly through the rendered DOM in
 * `clientJs()`; these tests exercise the real functions directly instead.
 * `statTileAriaLabel` (seventy-fifth cut) closes a real gap: `dora-tiles
 * .test.ts`/`gate-parallel-tiles.test.ts`/`fleet-stat-tiles.test.ts` only
 * ever assert `aria-label` is truthy, never its actual
 * `"label: value — tip"` format, and `renderTotals`'s `.total` cells had
 * no `aria-label` coverage at all.
 */

import { describe, it, expect } from 'vitest';
import {
  doraTileItems,
  gateParallelTileItems,
  warmSessionTileItems,
  evaluationTrendTileItems,
  totalsTileItems,
  statTileItems,
  statTileAriaLabel,
  cardStatItems,
  cardMetaItems,
  metricsStatItems,
  modelMixItems,
  modelMixChipMeta,
  liveWorkerItems,
  liveWorkerChipMeta,
  roundSinceLabel,
  roundStatItems,
} from '../../src/web/stat-tiles.js';
import { fmtDuration, fmtCost, fmtTokens, fmtBytes } from '../../src/web/format.js';

describe('doraTileItems', () => {
  const SNAPSHOT = {
    landingFrequency: { windowDays: 7, landings: 3, perDay: 3 / 7 },
    taskLeadTime: { tasksCompleted: 2, medianLeadTimeMs: 90 * 60 * 1000 },
    changeFailureRate: { shipped: 4, rate: 0.25 },
    mttr: { resolved: 1, medianRecoveryMs: 45 * 60 * 1000 },
  };

  it('formats all four tiles in fixed render order', () => {
    expect(doraTileItems(SNAPSHOT, fmtDuration)).toEqual([
      ['0.4', 'landings / day', 'Shipped, gate-verified firings per day, trailing 7 days'],
      [
        '1h 30m',
        'task lead time',
        'Median time from a board task being created to the firing that completed it (2 completed)',
      ],
      [
        '25%',
        'change failure rate',
        'Shipped commits that were reverts, trailing 30 days (4 shipped)',
      ],
      [
        '45m 0s',
        'MTTR',
        'Median time from a checkpoint (turn-budget escape hatch) to the firing that resumed it (1 resolved)',
      ],
    ]);
  });

  it('falls back to an em dash instead of a fake 0 when a rate has no data yet', () => {
    const items = doraTileItems(
      {
        landingFrequency: { windowDays: 7, perDay: 0 },
        taskLeadTime: { tasksCompleted: 0, medianLeadTimeMs: null },
        changeFailureRate: { shipped: 0, rate: null },
        mttr: { resolved: 0, medianRecoveryMs: null },
      },
      fmtDuration,
    );
    expect(items.map((item) => item[0])).toEqual(['0.0', '—', '—', '—']);
  });
});

describe('gateParallelTileItems', () => {
  it('formats all three tiles in fixed render order', () => {
    expect(
      gateParallelTileItems(
        { sampledFirings: 3, savedMs: 4000, savedPct: 4000 / 9000 },
        fmtDuration,
      ),
    ).toEqual([
      [
        '3',
        'sampled firings',
        'Firings with ≥2 concurrently-run typecheck/lint/format checks recorded',
      ],
      [
        '4s',
        'wall-clock saved',
        'Sum of (sequential cost − observed concurrent cost) across sampled firings',
      ],
      [
        '44%',
        'saved vs sequential',
        'Wall-clock saved as a share of what running those checks one after another would have cost',
      ],
    ]);
  });

  it('falls back to an em dash instead of a fake 0% when there are no sampled firings', () => {
    const items = gateParallelTileItems(
      { sampledFirings: 0, savedMs: 0, savedPct: null },
      fmtDuration,
    );
    expect(items[2]?.[0]).toBe('—');
  });
});

describe('warmSessionTileItems', () => {
  it('formats all four tiles in fixed render order', () => {
    expect(
      warmSessionTileItems({
        resumed: { firings: 4 },
        cold: { firings: 10 },
        freshInputDeltaPerFiring: 1234.6,
        costDeltaPerFiring: 1.5,
        costPerTurnDeltaPerFiring: 0.1234,
      }),
    ).toEqual([
      [
        '4',
        'resumed firings',
        'Firings that ran on a resumed CLI session instead of a cold spawn (10 cold to compare against)',
      ],
      [
        '1235 tok',
        'fresh input saved / firing',
        'Average fresh (uncached) input tokens a cold firing pays minus what a resumed one pays',
      ],
      [
        '$1.50',
        'cost saved / firing',
        'Average cost of a cold firing minus a resumed one — positive means resume is cheaper',
      ],
      [
        '$0.123',
        'cost saved / turn',
        'Confound-controlled: average of each firing’s own cost/turn ratio, cold minus resumed — ' +
          'isolates resume’s effect from the two groups running different average turn counts',
      ],
    ]);
  });

  it('falls back to em dashes instead of fake zeros when either comparison group is empty', () => {
    const items = warmSessionTileItems({
      resumed: { firings: 1 },
      cold: { firings: 0 },
      freshInputDeltaPerFiring: null,
      costDeltaPerFiring: null,
      costPerTurnDeltaPerFiring: null,
    });
    expect(items[1]?.[0]).toBe('—');
    expect(items[2]?.[0]).toBe('—');
    expect(items[3]?.[0]).toBe('—');
  });
});

describe('evaluationTrendTileItems', () => {
  it('formats all four tiles in fixed render order', () => {
    expect(
      evaluationTrendTileItems({ approved: 7, rejected: 3, rate: 0.7, direction: 'improving' }, 12),
    ).toEqual([
      [
        '70%',
        'approval rate',
        'Share of operator-reviewed proposals (task approve/reject, SOUL ratify/unratify/dismiss) ' +
          'approved, trailing 12 weeks',
      ],
      ['7', 'approved', 'Operator-approved proposals in the trailing window'],
      ['3', 'rejected', 'Operator-rejected proposals in the trailing window'],
      [
        'improving',
        'trend',
        'Later half of the window’s weekly approval rate vs the earlier half — a move inside ' +
          '±5 points reads as steady, not a trend',
      ],
    ]);
  });

  it('renders "steady" for a flat direction, not the raw "flat" value', () => {
    const items = evaluationTrendTileItems(
      { approved: 5, rejected: 5, rate: 0.5, direction: 'flat' },
      12,
    );
    expect(items[3]?.[0]).toBe('steady');
  });

  it('falls back to an em dash and "not enough data" when there are no operator verdicts yet', () => {
    const items = evaluationTrendTileItems(
      { approved: 0, rejected: 0, rate: null, direction: null },
      12,
    );
    expect(items[0]?.[0]).toBe('—');
    expect(items[3]?.[0]).toBe('not enough data');
    expect(items[3]?.[2]).toBe(
      'Fewer than two weeks with any operator verdicts yet — too little data for a direction',
    );
  });
});

describe('totalsTileItems', () => {
  const TOTALS = {
    projects: 4,
    flying: 1,
    firings: 20,
    shipped: 15,
    cost: 12.5,
    openFindings: 3,
    needsYou: 2,
    costPerShipped: 12.5 / 15,
    shipRate: 15 / 20,
    currentStreak: 5,
    avgTurns: 8.2,
    cacheReadShare: 0.6,
  };

  it('formats all seven raw-count tiles in fixed render order', () => {
    expect(totalsTileItems(TOTALS, fmtCost)).toEqual([
      ['4', 'projects', 'Distinct projects AUTOPILOT is tracking'],
      ['1', 'flying', 'Projects with a firing running right now'],
      ['20', 'firings', 'Total engine firings across all projects'],
      ['15', 'shipped', 'Firings that passed the gate and committed'],
      ['$12.50', 'cost', 'Total spend across every firing'],
      ['3', 'open findings', 'Unresolved review findings across all projects'],
      ['2', 'need you', 'Items waiting on a decision from you'],
    ]);
  });

  it('omits the real-cost tile (cost semantics v3) when unconfigured — realCost null', () => {
    const items = totalsTileItems({ ...TOTALS, realCost: null }, fmtCost);
    expect(items).toHaveLength(7);
    expect(items.some((i) => i[1] === 'real cost')).toBe(false);
  });

  it('appends an eighth real-cost tile once realCost is a number', () => {
    const items = totalsTileItems({ ...TOTALS, realCost: 3.2 }, fmtCost);
    expect(items).toHaveLength(8);
    expect(items[7]).toEqual([
      '$3.20',
      'real cost',
      'Total spend apportioned by real subscription share instead of API list price (cost semantics v3)',
    ]);
  });
});

describe('statTileItems', () => {
  it('formats all five derived-rate tiles in fixed render order', () => {
    const items = statTileItems(
      {
        projects: 4,
        flying: 1,
        firings: 20,
        shipped: 15,
        cost: 12.5,
        openFindings: 3,
        needsYou: 2,
        costPerShipped: 1,
        shipRate: 0.75,
        currentStreak: 5,
        avgTurns: 8.25,
        cacheReadShare: 0.6,
      },
      fmtCost,
    );
    expect(items).toEqual([
      ['$1.00', 'cost / shipped', 'Average spend per firing that actually shipped'],
      ['75%', 'ship rate', 'Shipped firings as a share of all firings, fleet-wide'],
      ['5', 'streak', 'Consecutive shipped firings, newest first, across the whole fleet'],
      ['8.3', 'avg turns', 'Average assistant turns per firing, fleet-wide'],
      ['60%', 'cache-read share', 'Share of processed context tokens served from cache'],
    ]);
  });

  it('falls back to an em dash instead of a fake 0 when a rate has no firings yet', () => {
    const items = statTileItems(
      {
        projects: 0,
        flying: 0,
        firings: 0,
        shipped: 0,
        cost: 0,
        openFindings: 0,
        needsYou: 0,
        costPerShipped: null,
        shipRate: null,
        currentStreak: 0,
        avgTurns: null,
        cacheReadShare: null,
      },
      fmtCost,
    );
    expect(items.map((item) => item[0])).toEqual(['—', '—', '0', '—', '—']);
  });

  it('falls back to an em dash instead of throwing when a rate is missing entirely (undefined, not just null)', () => {
    // Regression: several DOM-render fixtures build a partial `totals` object
    // that omits these fields outright — `.toFixed()` on `undefined` throws
    // and aborts the whole render pipeline, which a strict `=== null` check
    // alone would miss.
    const items = statTileItems(
      {
        projects: 0,
        flying: 0,
        firings: 0,
        shipped: 0,
        cost: 0,
        openFindings: 0,
        needsYou: 0,
        currentStreak: 0,
      } as never,
      fmtCost,
    );
    expect(items.map((item) => item[0])).toEqual(['—', '—', '0', '—', '—']);
  });
});

describe('statTileAriaLabel', () => {
  it('joins label, value, and tip into the "label: value — tip" format', () => {
    expect(statTileAriaLabel(['5', 'streak', 'Consecutive shipped firings'])).toBe(
      'streak: 5 — Consecutive shipped firings',
    );
  });
});

describe('cardStatItems', () => {
  it('formats the three always-present tiles in fixed render order', () => {
    expect(cardStatItems({ firings: 20, shipped: 15, shipRate: 0.75 })).toEqual([
      ['20', 'firings', 'Total engine firings for this project'],
      ['15', 'shipped', 'Firings that passed the gate and committed'],
      ['75%', 'ship rate', 'Shipped firings as a share of all firings for this project'],
    ]);
  });

  it('falls back to an em dash instead of a fake 0% when ship rate has no data yet', () => {
    const items = cardStatItems({ firings: 0, shipped: 0, shipRate: null });
    expect(items[2]).toEqual([
      '—',
      'ship rate',
      'Shipped firings as a share of all firings for this project',
    ]);
  });

  it('adds a fourth "recent form" tile once the project has recent-ship-rate history', () => {
    const items = cardStatItems({ firings: 20, shipped: 15, shipRate: 0.75, recentShipRate: 0.4 });
    expect(items).toHaveLength(4);
    expect(items[3]).toEqual(['40%', 'recent form', 'Ship rate over the last 5 firings']);
  });

  it('omits the "recent form" tile when recentShipRate is null or undefined', () => {
    expect(
      cardStatItems({ firings: 1, shipped: 1, shipRate: 1, recentShipRate: null }),
    ).toHaveLength(3);
    expect(cardStatItems({ firings: 1, shipped: 1, shipRate: 1 })).toHaveLength(3);
  });
});

describe('cardMetaItems', () => {
  it('formats the language/file-count/size chips in fixed render order', () => {
    expect(
      cardMetaItems({ primaryLanguage: 'typescript', fileCount: 12, totalBytes: 4096 }, fmtBytes),
    ).toEqual([
      ['typescript', 'Primary language detected in this project', 'Primary language: typescript'],
      ['12 files', 'Number of source files AUTOPILOT is tracking', 'File count: 12'],
      ['4.0 KB', 'Total size of tracked source files', 'Total size: 4.0 KB'],
    ]);
  });
});

describe('metricsStatItems', () => {
  it('formats all three tiles in fixed render order', () => {
    expect(
      metricsStatItems(
        { cost: 12.5, tokensIn: 1000, tokensOut: 500, shipRate: 0.75 },
        fmtCost,
        fmtTokens,
      ),
    ).toEqual([
      ['$12.50', 'total cost', 'Total spend across every firing for this project'],
      [fmtTokens(1500), 'tokens', 'Total input + output tokens processed across every firing'],
      ['75%', 'ship rate', 'Shipped firings as a share of all firings for this project'],
    ]);
  });

  it('treats missing tokensIn/tokensOut as zero instead of throwing', () => {
    const items = metricsStatItems({ cost: 0, shipRate: null }, fmtCost, fmtTokens);
    expect(items[1]?.[0]).toBe(fmtTokens(0));
  });

  it('falls back to an em dash instead of a fake 0% when ship rate has no data yet', () => {
    const items = metricsStatItems({ cost: 0, shipRate: null }, fmtCost, fmtTokens);
    expect(items[2]?.[0]).toBe('—');
  });
});

describe('modelMixItems', () => {
  it('tallies firings per model, sorted by count descending', () => {
    const log = [
      { model: 'claude-sonnet-5' },
      { model: 'claude-haiku-4-5-20251001' },
      { model: 'claude-sonnet-5' },
      { model: 'claude-sonnet-5' },
    ];
    expect(modelMixItems(log)).toEqual([
      { model: 'claude-sonnet-5', count: 3, pct: 0.75 },
      { model: 'claude-haiku-4-5-20251001', count: 1, pct: 0.25 },
    ]);
  });

  it('excludes firings with no recorded model from both the count and the percentage denominator', () => {
    const log = [{ model: 'claude-sonnet-5' }, { model: null }, {}];
    expect(modelMixItems(log)).toEqual([{ model: 'claude-sonnet-5', count: 1, pct: 1 }]);
  });

  it('returns an empty array when every firing predates model tracking', () => {
    expect(modelMixItems([{ model: null }, {}])).toEqual([]);
  });

  it('returns an empty array for an empty flight log', () => {
    expect(modelMixItems([])).toEqual([]);
  });
});

describe('modelMixChipMeta', () => {
  it('rounds the percentage and names the model in text/tip/aria-label', () => {
    const item = { model: 'claude-sonnet-5', count: 2, pct: 2 / 3 };
    expect(modelMixChipMeta(item, 3)).toEqual([
      'claude-sonnet-5 67%',
      '2 of 3 tracked firing(s) ran claude-sonnet-5',
      'model mix: claude-sonnet-5 67%',
    ]);
  });

  it('rounds down when the share falls below the midpoint', () => {
    const item = { model: 'claude-haiku-4-5-20251001', count: 1, pct: 1 / 3 };
    expect(modelMixChipMeta(item, 3)[0]).toBe('claude-haiku-4-5-20251001 33%');
  });

  it('renders 100% when a single model ran every tracked firing', () => {
    const item = { model: 'claude-sonnet-5', count: 1, pct: 1 };
    expect(modelMixChipMeta(item, 1)).toEqual([
      'claude-sonnet-5 100%',
      '1 of 1 tracked firing(s) ran claude-sonnet-5',
      'model mix: claude-sonnet-5 100%',
    ]);
  });
});

describe('liveWorkerItems', () => {
  it('keeps only projects with a live firing, in source order', () => {
    const cards = [
      {
        id: 'p1',
        name: 'Alpha',
        lives: [{ model: 'claude-sonnet-5', phase: 'gate', callsign: 'red-fox' }],
      },
      { id: 'p2', name: 'Bravo', lives: [] },
      { id: 'p3', name: 'Charlie', lives: [{ model: null, phase: 'edit', callsign: 'blue-owl' }] },
    ];
    expect(liveWorkerItems(cards)).toEqual([
      {
        projectId: 'p1',
        projectName: 'Alpha',
        model: 'claude-sonnet-5',
        phase: 'gate',
        callsign: 'red-fox',
        laneCount: 1,
      },
      {
        projectId: 'p3',
        projectName: 'Charlie',
        model: null,
        phase: 'edit',
        callsign: 'blue-owl',
        laneCount: 1,
      },
    ]);
  });

  it('emits one item per concurrent lane for a project running several at once (board web-mtbp0t86-rnimyi)', () => {
    const cards = [
      {
        id: 'p1',
        name: 'Alpha',
        lives: [
          { model: 'claude-sonnet-5', phase: 'gate', callsign: 'red-fox' },
          { model: 'claude-opus-4-8', phase: 'do', callsign: 'gold-hawk' },
        ],
      },
    ];
    expect(liveWorkerItems(cards)).toEqual([
      {
        projectId: 'p1',
        projectName: 'Alpha',
        model: 'claude-sonnet-5',
        phase: 'gate',
        callsign: 'red-fox',
        laneCount: 2,
      },
      {
        projectId: 'p1',
        projectName: 'Alpha',
        model: 'claude-opus-4-8',
        phase: 'do',
        callsign: 'gold-hawk',
        laneCount: 2,
      },
    ]);
  });

  it('returns an empty array when nothing is flying', () => {
    expect(
      liveWorkerItems([
        { id: 'p1', name: 'Alpha', lives: [] },
        { id: 'p2', name: 'Bravo', lives: [] },
      ]),
    ).toEqual([]);
  });

  it('returns an empty array for an empty project list', () => {
    expect(liveWorkerItems([])).toEqual([]);
  });
});

describe('liveWorkerChipMeta', () => {
  const OFFICE_TIPS = { gate: 'GATE — typecheck + test + build must pass' };

  it('includes the model in text/tip/aria-label when one is captured', () => {
    const item = {
      projectId: 'p1',
      projectName: 'Alpha',
      model: 'claude-sonnet-5',
      phase: 'gate',
      callsign: 'red-fox',
      laneCount: 1,
    };
    expect(liveWorkerChipMeta(item, OFFICE_TIPS)).toEqual({
      text: 'Alpha · claude-sonnet-5',
      tip: 'Alpha (red-fox) is flying — GATE — typecheck + test + build must pass, model: claude-sonnet-5',
      ariaLabel: 'flying now: Alpha, model claude-sonnet-5, phase gate',
    });
  });

  it('falls back to "model not yet captured"/no-model text when model is null', () => {
    const item = {
      projectId: 'p3',
      projectName: 'Charlie',
      model: null,
      phase: 'gate',
      callsign: 'blue-owl',
      laneCount: 1,
    };
    expect(liveWorkerChipMeta(item, OFFICE_TIPS)).toEqual({
      text: 'Charlie',
      tip: 'Charlie (blue-owl) is flying — GATE — typecheck + test + build must pass, model not yet captured',
      ariaLabel: 'flying now: Charlie, phase gate',
    });
  });

  it('falls back to a generic phase tip when the phase is not in OFFICE_TIPS', () => {
    const item = {
      projectId: 'p4',
      projectName: 'Delta',
      model: null,
      phase: 'mystery',
      callsign: 'gold-hawk',
      laneCount: 1,
    };
    expect(liveWorkerChipMeta(item, OFFICE_TIPS).tip).toBe(
      'Delta (gold-hawk) is flying — phase not yet classified from recent activity, model not yet captured',
    );
  });

  it('disambiguates with the callsign in text/aria-label once a project has more than one live lane (board web-mtbp0t86-rnimyi)', () => {
    const item = {
      projectId: 'p1',
      projectName: 'Alpha',
      model: 'claude-sonnet-5',
      phase: 'gate',
      callsign: 'red-fox',
      laneCount: 2,
    };
    expect(liveWorkerChipMeta(item, OFFICE_TIPS)).toEqual({
      text: 'Alpha (red-fox) · claude-sonnet-5',
      tip: 'Alpha (red-fox) is flying — GATE — typecheck + test + build must pass, model: claude-sonnet-5',
      ariaLabel: 'flying now: Alpha (red-fox), model claude-sonnet-5, phase gate',
    });
  });
});

describe('roundSinceLabel', () => {
  const fmtAgo = (ts: number) => 'AGO(' + ts + ')';

  it('builds the "since <tag>" text/aria-label pair from the injected fmtAgo', () => {
    expect(roundSinceLabel({ roundStartAt: 42, tagName: 'v1.2.0' } as never, fmtAgo)).toEqual({
      text: 'since v1.2.0 · AGO(42)',
      ariaLabel: 'round boundary: since v1.2.0, AGO(42)',
    });
  });

  it('returns null when the project has no release tags yet', () => {
    expect(roundSinceLabel({ roundStartAt: null, tagName: null } as never, fmtAgo)).toBeNull();
  });
});

describe('roundStatItems', () => {
  it('formats the three always-present chips in fixed render order', () => {
    expect(roundStatItems({ firings: 4, shipped: 3, cost: 1.5, shipRate: null }, fmtCost)).toEqual([
      ['4', 'Firings this round', '4 firings this round'],
      ['3', 'Shipped this round', '3 shipped this round'],
      ['$1.50', 'Spend this round', 'cost this round: $1.50'],
    ]);
  });

  it('adds a fourth "ship rate" chip once the round has a defined rate', () => {
    const items = roundStatItems({ firings: 4, shipped: 3, cost: 1.5, shipRate: 0.75 }, fmtCost);
    expect(items).toHaveLength(4);
    expect(items[3]).toEqual(['75%', 'Ship rate this round', 'ship rate this round: 75%']);
  });

  it('omits the "ship rate" chip when the round has no firings yet', () => {
    expect(
      roundStatItems({ firings: 0, shipped: 0, cost: 0, shipRate: null }, fmtCost),
    ).toHaveLength(3);
  });
});
