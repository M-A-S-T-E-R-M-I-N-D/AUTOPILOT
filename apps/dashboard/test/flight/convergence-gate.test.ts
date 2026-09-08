// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import type { GatePort, GateResult } from '@autopilot/engine';
import {
  gateConvergedBranch,
  convergencePlausibilityFloorMs,
  CONVERGENCE_COLD_START_FLOOR_MS,
  MIN_GREEN_HISTORY_SAMPLES,
  CONVERGENCE_FLOOR_RATIO,
} from '../../src/flight/convergence-gate.js';

function fakeGate(result: GateResult): GatePort {
  return { run: async () => result };
}

interface Deps {
  out: ReturnType<typeof vi.fn<(line: string) => void>>;
  recordRed: ReturnType<typeof vi.fn<(check: string, mergeDetails: string, ms: number) => void>>;
  pastGreenDurationsMs: ReturnType<typeof vi.fn<(signature: string) => readonly number[]>>;
  recordGreen: ReturnType<typeof vi.fn<(signature: string, ms: number) => void>>;
  recordUnverifiable: ReturnType<
    typeof vi.fn<(signature: string, ms: number, floorMs: number) => void>
  >;
}

function fakeDeps(history: readonly number[] = []): Deps {
  return {
    out: vi.fn(),
    recordRed: vi.fn(),
    pastGreenDurationsMs: vi.fn(() => history),
    recordGreen: vi.fn(),
    recordUnverifiable: vi.fn(),
  };
}

describe('convergencePlausibilityFloorMs', () => {
  it('falls back to the fixed cold-start floor with no history', () => {
    expect(convergencePlausibilityFloorMs([])).toBe(CONVERGENCE_COLD_START_FLOOR_MS);
  });

  it('still uses the cold-start floor below the minimum sample count', () => {
    const history = Array(MIN_GREEN_HISTORY_SAMPLES - 1).fill(10000);
    expect(convergencePlausibilityFloorMs(history)).toBe(CONVERGENCE_COLD_START_FLOOR_MS);
  });

  it('derives the floor from the rolling median once enough samples exist', () => {
    const history = [8000, 10000, 12000];
    expect(convergencePlausibilityFloorMs(history)).toBe(10000 * CONVERGENCE_FLOOR_RATIO);
  });
});

describe('gateConvergedBranch', () => {
  it('is a silent no-op when the repo has no detected gate commands', async () => {
    const deps = fakeDeps();
    await gateConvergedBranch('main', 'merge details', {
      gate: fakeGate({ ok: true, checks: [] }),
      ...deps,
    });
    expect(deps.out).not.toHaveBeenCalled();
    expect(deps.recordRed).not.toHaveBeenCalled();
    expect(deps.recordGreen).not.toHaveBeenCalled();
    expect(deps.recordUnverifiable).not.toHaveBeenCalled();
  });

  it('logs a visible success line and records history for a plausible green with no prior history (cold start)', async () => {
    const deps = fakeDeps([]);
    await gateConvergedBranch('main', 'merge details', {
      gate: fakeGate({
        ok: true,
        checks: [
          { label: 'typecheck', pass: true, durationMs: 1200 },
          { label: 'build', pass: true, durationMs: 3400 },
        ],
      }),
      ...deps,
    });
    expect(deps.out).toHaveBeenCalledTimes(1);
    expect(deps.out.mock.calls[0]?.[0]).toContain("'main' passes 2 check(s)");
    expect(deps.out.mock.calls[0]?.[0]).toContain('(4600ms)');
    expect(deps.recordRed).not.toHaveBeenCalled();
    expect(deps.recordUnverifiable).not.toHaveBeenCalled();
    expect(deps.recordGreen).toHaveBeenCalledWith('build+typecheck', 4600);
  });

  it('demotes a cold-start green to UNVERIFIABLE when it finishes implausibly fast', async () => {
    const deps = fakeDeps([]);
    await gateConvergedBranch('main', 'merge details', {
      gate: fakeGate({ ok: true, checks: [{ label: 'typecheck', pass: true, durationMs: 5 }] }),
      ...deps,
    });
    expect(deps.out).toHaveBeenCalledTimes(1);
    expect(deps.out.mock.calls[0]?.[0]).toContain('UNVERIFIABLE');
    expect(deps.out.mock.calls[0]?.[0]).toContain('cold-start default');
    expect(deps.recordUnverifiable).toHaveBeenCalledWith(
      'typecheck',
      5,
      CONVERGENCE_COLD_START_FLOOR_MS,
    );
    expect(deps.recordGreen).not.toHaveBeenCalled();
  });

  it('demotes a green to UNVERIFIABLE when it runs far faster than its own rolling median', async () => {
    const history = [9000, 10000, 11000];
    const deps = fakeDeps(history);
    await gateConvergedBranch('main', 'merge details', {
      gate: fakeGate({ ok: true, checks: [{ label: 'typecheck', pass: true, durationMs: 50 }] }),
      ...deps,
    });
    expect(deps.out.mock.calls[0]?.[0]).toContain('UNVERIFIABLE');
    expect(deps.out.mock.calls[0]?.[0]).toContain('10000ms median over 3 past green runs');
    expect(deps.recordUnverifiable).toHaveBeenCalledWith('typecheck', 50, 1000);
    expect(deps.recordGreen).not.toHaveBeenCalled();
  });

  it('trusts a green that runs close to its historical median', async () => {
    const history = [9000, 10000, 11000];
    const deps = fakeDeps(history);
    await gateConvergedBranch('main', 'merge details', {
      gate: fakeGate({ ok: true, checks: [{ label: 'typecheck', pass: true, durationMs: 9500 }] }),
      ...deps,
    });
    expect(deps.out.mock.calls[0]?.[0]).toContain("'main' passes 1 check(s)");
    expect(deps.recordUnverifiable).not.toHaveBeenCalled();
    expect(deps.recordGreen).toHaveBeenCalledWith('typecheck', 9500);
  });

  it('surfaces CONVERGENCE RED and records telemetry naming the failing check', async () => {
    const deps = fakeDeps();
    await gateConvergedBranch('autopilot/flight', 'chore: sync lane into autopilot/flight', {
      gate: fakeGate({
        ok: false,
        checks: [
          { label: 'typecheck', pass: true, durationMs: 900 },
          { label: 'build', pass: false, durationMs: 2100 },
        ],
      }),
      ...deps,
    });
    expect(deps.out.mock.calls[0]?.[0]).toContain('CONVERGENCE RED');
    expect(deps.out.mock.calls[0]?.[0]).toContain('build');
    expect(deps.out.mock.calls[0]?.[0]).toContain('chore: sync lane into autopilot/flight');
    expect(deps.recordRed).toHaveBeenCalledWith(
      'build',
      'chore: sync lane into autopilot/flight',
      3000,
    );
    expect(deps.recordGreen).not.toHaveBeenCalled();
    expect(deps.recordUnverifiable).not.toHaveBeenCalled();
  });

  it('falls back to a generic "gate" label when a red result carries no failing check entry', async () => {
    const deps = fakeDeps();
    await gateConvergedBranch('main', 'merge details', {
      gate: fakeGate({ ok: false, checks: [{ label: 'typecheck', pass: true, durationMs: 10 }] }),
      ...deps,
    });
    expect(deps.recordRed).toHaveBeenCalledWith('gate', 'merge details', 10);
  });
});
