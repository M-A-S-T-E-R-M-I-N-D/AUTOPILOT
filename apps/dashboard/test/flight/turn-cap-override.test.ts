// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The "Turns: N" SOUL line (board ap-muo35gzl-2, MASTER-PLAN §5.4) is parsed
 * and clamped by pure engine functions (`packages/engine/src/config.ts`,
 * tested there). This locks the wiring those tests cannot see: fly.ts reads
 * the line from the project's OWN SOUL once, under the fleet-wide
 * FLY_MAX_TURNS ceiling, then hands the one number to the engine's cap, the
 * firing prompt's TURN BUDGET, and the turn-cap death feedback — so the agent
 * is told the ceiling it actually dies at, never a ceiling it no longer has.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const flySource = readFileSync(fileURLToPath(new URL('../../src/fly.ts', import.meta.url)), 'utf8');

describe('fly.ts wires the "Turns: N" SOUL line', () => {
  it('reads it from the project’s own SOUL, under the fleet-wide ceiling', () => {
    expect(flySource).toContain('const maxTurns = firingMaxTurns(soulOwn, FLY_MAX_TURNS);');
  });

  it('hands the one number to the engine cap, the prompt, and the turn-cap death feedback', () => {
    expect(flySource).toMatch(/maxBudgetUsd: budgetUsd,\n\s+maxTurns,\n/);
    expect(flySource).toMatch(/buildFiringPrompt\(\{[^}]*\n\s+maxTurns,/s);
    expect(flySource).toContain('DIED AT THE TURN CAP (${maxTurns} turns)');
    // The fleet-wide constant reaches a firing only through that one number.
    expect(flySource).not.toContain('maxTurns: FLY_MAX_TURNS');
    expect(flySource).not.toContain('(${FLY_MAX_TURNS} turns)');
  });
});
