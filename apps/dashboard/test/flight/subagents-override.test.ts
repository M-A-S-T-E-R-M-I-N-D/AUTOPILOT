// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The "Subagents: off" SOUL line (board ap-muo35gzl-2, MASTER-PLAN §5.4) is
 * parsed and applied by pure engine functions (`packages/engine/src/config.ts`,
 * `prompt.ts`, both tested there). This locks the wiring those tests cannot
 * see: fly.ts reads the line from the project's OWN SOUL once, then hands the
 * one verdict to both the CLI's tool grant and the firing prompt, so the
 * prompt never promises a tool the grant denies.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const flySource = readFileSync(fileURLToPath(new URL('../../src/fly.ts', import.meta.url)), 'utf8');

describe('fly.ts wires the "Subagents: off" SOUL line', () => {
  it('reads it from the project’s own SOUL, not the fleet-wisdom-layered one', () => {
    expect(flySource).toContain('const subagentsEnabled = !soulOptsOutOfSubagents(soulOwn);');
  });

  it('hands the same verdict to the tool grant and the firing prompt', () => {
    expect(flySource).toContain('...firingToolGrant(subagentsEnabled),');
    expect(flySource).toMatch(/buildFiringPrompt\(\{[^}]*\bsubagentsEnabled,/s);
  });
});
