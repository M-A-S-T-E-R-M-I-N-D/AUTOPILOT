// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { DynamicGate } from '../../src/adapters/dynamic-gate.js';
import type { GateCommandSpec, GateExec } from '../../src/adapters/gate.js';

const IMPACTED: GateCommandSpec = { bin: 'pnpm', args: ['run', 'test:impacted'], label: 'fast' };
const FULL: GateCommandSpec = { bin: 'pnpm', args: ['run', 'test'], label: 'full' };

describe('DynamicGate', () => {
  it('re-invokes the commands factory on every run() — not just once at construction', async () => {
    // The every-Nth-firing full-suite backstop (gate-schedule.ts) depends on
    // the caller re-evaluating "which firing is this?" per run(). A gate that
    // freezes its command list at construction (plain GateRunner) can never
    // honor a schedule that changes across the SAME flight's firings.
    let firingCount = 1; // not due for a full run yet
    const seen: GateCommandSpec[][] = [];
    const exec: GateExec = (cmd) => {
      seen.push([cmd]);
      return Promise.resolve({ code: 0 });
    };
    const gate = new DynamicGate({
      cwd: '/repo',
      commands: () => [firingCount % 5 === 0 ? FULL : IMPACTED],
      exec,
    });

    await gate.run();
    firingCount = 5; // the next firing crosses the scheduled full-suite boundary
    await gate.run();

    expect(seen).toEqual([[IMPACTED], [FULL]]);
  });

  it('forwards cwd, timeoutMs, and exec into each fresh GateRunner', async () => {
    let seenCwd = '';
    let seenTimeout = 0;
    const exec: GateExec = (_cmd, cwd, timeoutMs) => {
      seenCwd = cwd;
      seenTimeout = timeoutMs;
      return Promise.resolve({ code: 0 });
    };
    const gate = new DynamicGate({
      cwd: '/work',
      commands: () => [IMPACTED],
      timeoutMs: 4321,
      exec,
    });
    await gate.run();
    expect(seenCwd).toBe('/work');
    expect(seenTimeout).toBe(4321);
  });

  it('surfaces the underlying GateRunner result (pass/fail) unchanged', async () => {
    const failing: GateExec = () => Promise.resolve({ code: 1 });
    const gate = new DynamicGate({ cwd: '/repo', commands: () => [FULL], exec: failing });
    const result = await gate.run();
    expect(result.ok).toBe(false);
    expect(result.details).toContain('full failed (exit 1)');
  });
});
