// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The "Model: <name>" SOUL line (board ap-muo35gzl-2, MASTER-PLAN §5.4) is
 * parsed by a pure engine function (`packages/engine/src/config.ts`, tested
 * there) and applied by the scoreboard's router (`flight/model-scoreboard.ts`,
 * tested there). This locks the wiring those tests cannot see: fly.ts reads
 * the line from the project's OWN SOUL once, hands the one name to the flight
 * default (free picks, which routing never touches), to the router for every
 * routed firing and to the router's by-hand fallback — always UNDER the
 * operator's flight-wide env pins — and announces the pin once at takeoff,
 * since a free pick prints no 🧭 routing line.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const flySource = readFileSync(fileURLToPath(new URL('../../src/fly.ts', import.meta.url)), 'utf8');

describe('fly.ts wires the "Model: <name>" SOUL line', () => {
  it('reads it once from the project’s own SOUL, beside the other overrides', () => {
    expect(flySource).toContain('const soulModel = soulModelPin(soulOwn);');
    expect(flySource.match(/soulModelPin\(/g)).toHaveLength(1);
  });

  it('makes it the flight default under AUTOPILOT_MODEL, so a free pick flies on it too', () => {
    expect(flySource).toContain(
      "primaryModel: process.env['AUTOPILOT_MODEL'] ?? soulModel ?? 'sonnet',",
    );
  });

  it('hands it to the router for every routed firing, and to the router’s fallback at the same rank', () => {
    expect(flySource).toMatch(
      /routeTaskModel\(\s*store,\s*projectId,\s*tier,\s*topAvailable\.id,\s*process\.env,\s*now\(\),\s*instanceId \?\? 'base',\s*soulModel,\s*\)/,
    );
    expect(flySource).toMatch(
      /routedModel =\s*tierOverride\(tier, process\.env\) \?\?\s*soulModel \?\?\s*resolvePrimaryModelForTier\(tier, process\.env, topAvailable\.id\);/,
    );
    // The scoreboard is never consulted behind the pin's back.
    expect(flySource).not.toMatch(/routedModel = resolvePrimaryModelForTier\(/);
  });

  it('announces the pin at takeoff, naming the env lever that beats it when one is set', () => {
    expect(flySource).toContain(
      "Model: this project's SOUL pins ${soulModel}, but the flight-wide",
    );
    expect(flySource).toContain(
      "Model: this project's SOUL pins its firings to ${soulModel} in place of routing",
    );
  });
});
