// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The "Budget: $N" SOUL line (board ap-muo35gzl-2, MASTER-PLAN §5.4) is parsed
 * and clamped by pure engine functions (`packages/engine/src/config.ts`,
 * tested there). This locks the wiring those tests cannot see: fly.ts reads
 * the line from the project's OWN SOUL once, under the fleet-wide per-firing
 * budget the operator launched with and over the fly bar's own floor, then
 * hands the one number to the engine's spend cap, the routed-budget lockstep
 * and TOTAL-SPEND mode's stop decision — so a capped project never spends,
 * nor is judged against, a budget it no longer has.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const flySource = readFileSync(fileURLToPath(new URL('../../src/fly.ts', import.meta.url)), 'utf8');

describe('fly.ts wires the "Budget: $N" SOUL line', () => {
  it('reads it from the project’s own SOUL, under the fleet-wide budget and over the floor', () => {
    expect(flySource).toContain(
      'const firingBudgetUsd = Math.max(FLY_BUDGET_FLOOR_USD, firingMaxBudgetUsd(soulOwn, budgetUsd));',
    );
    // The same floor the fly bar's own figure is held to — one constant, not two literals.
    expect(flySource).toMatch(/const budgetUsd = Math\.max\(\s*FLY_BUDGET_FLOOR_USD,/);
  });

  it('hands the one number to the engine cap, the routed-budget lockstep and the total-spend stop', () => {
    expect(flySource).toMatch(/maxBudgetUsd: firingBudgetUsd,\n\s+maxTurns,\n/);
    expect(flySource).toContain('firingBudgetUsd * budgetMultiplierForModel(routedModel)');
    expect(flySource).toContain(
      'totalBudgetExhausted(spentSoFar, totalBudgetUsd, firingBudgetUsd)',
    );
    // The fleet-wide figure reaches a firing only through that one number.
    expect(flySource).not.toContain('maxBudgetUsd: budgetUsd');
    expect(flySource).not.toContain('budgetUsd * budgetMultiplierForModel');
    expect(flySource).not.toContain('totalBudgetExhausted(spentSoFar, totalBudgetUsd, budgetUsd)');
  });

  it('tells the flight log when a project’s SOUL tightened the fleet’s figure', () => {
    expect(flySource).toContain("PER firing (this project's SOUL caps the fleet's $${budgetUsd})");
  });
});
