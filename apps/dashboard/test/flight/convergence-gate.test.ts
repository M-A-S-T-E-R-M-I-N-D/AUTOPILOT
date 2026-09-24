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
  indentedTail,
  firstLine,
} from '../../src/flight/convergence-gate.js';

function fakeGate(result: GateResult): GatePort {
  return { run: async () => result };
}

interface Deps {
  out: ReturnType<typeof vi.fn<(line: string) => void>>;
  recordRed: ReturnType<
    typeof vi.fn<(check: string, mergeDetails: string, ms: number, outputTail?: string) => void>
  >;
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

  it('a gate result with no checks field at all is the same silent no-op', async () => {
    const deps = fakeDeps();
    await gateConvergedBranch('main', 'merge details', { gate: fakeGate({ ok: true }), ...deps });
    expect(deps.out).not.toHaveBeenCalled();
    expect(deps.recordGreen).not.toHaveBeenCalled();
    expect(deps.recordUnverifiable).not.toHaveBeenCalled();
  });

  it('a green that lands exactly on the floor is trusted — the floor is a strict below', async () => {
    const deps = fakeDeps([]);
    await gateConvergedBranch('main', 'merge details', {
      gate: fakeGate({
        ok: true,
        checks: [{ label: 'typecheck', pass: true, durationMs: CONVERGENCE_COLD_START_FLOOR_MS }],
      }),
      ...deps,
    });
    expect(deps.recordGreen).toHaveBeenCalledWith('typecheck', CONVERGENCE_COLD_START_FLOOR_MS);
    expect(deps.recordUnverifiable).not.toHaveBeenCalled();
  });

  it('the UNVERIFIABLE line says how fast, what floor, and where the floor came from — cold start and rolling median alike', async () => {
    const cold = fakeDeps([]);
    await gateConvergedBranch('main', 'merge details', {
      gate: fakeGate({ ok: true, checks: [{ label: 'typecheck', pass: true, durationMs: 40 }] }),
      ...cold,
    });
    expect(cold.out.mock.calls[0]?.[0]).toBe(
      "  ⚠ convergence UNVERIFIABLE: 'main' reported 1 check(s) passing in 40ms — below the 250ms plausibility floor (cold-start default, not enough history yet) — too fast to trust the checks actually ran.",
    );
    const warm = fakeDeps([1000, 1000, 1000]);
    await gateConvergedBranch('main', 'merge details', {
      gate: fakeGate({ ok: true, checks: [{ label: 'typecheck', pass: true, durationMs: 50 }] }),
      ...warm,
    });
    expect(warm.out.mock.calls[0]?.[0]).toBe(
      "  ⚠ convergence UNVERIFIABLE: 'main' reported 1 check(s) passing in 50ms — below the 100ms plausibility floor (10% of the 1000ms median over 3 past green runs) — too fast to trust the checks actually ran.",
    );
    expect(warm.recordUnverifiable).toHaveBeenCalledWith('typecheck', 50, 100);
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
    expect(deps.out.mock.calls[0]?.[0]).toBe(
      "  ⛔ CONVERGENCE RED: 'autopilot/flight' fails build AFTER this sync-back — " +
        'a merge produced this head: either side, or the two together, broke this check. chore: sync lane into autopilot/flight',
    );
    expect(deps.recordRed).toHaveBeenCalledWith(
      'build',
      'chore: sync lane into autopilot/flight',
      3000,
      undefined,
    );
    expect(deps.recordGreen).not.toHaveBeenCalled();
    expect(deps.recordUnverifiable).not.toHaveBeenCalled();
  });

  it("quotes the failing command's own last lines under the alarm and persists them — the test that broke, not just the check", async () => {
    const deps = fakeDeps();
    const tail =
      ' FAIL  apps/dashboard/test/web/x.test.ts > paints > in Hebrew\nAssertionError: expected 1 to be 2\n\n';
    await gateConvergedBranch('autopilot/flight', 'fast-forwarded', {
      gate: fakeGate({
        ok: false,
        checks: [
          { label: 'typecheck', pass: true, durationMs: 1 },
          { label: 'pnpm run test', pass: false, durationMs: 2, outputTail: tail },
        ],
      }),
      ...deps,
    });
    expect(deps.out.mock.calls[0]?.[0]).toBe(
      "  ⛔ CONVERGENCE RED: 'autopilot/flight' fails pnpm run test AFTER this sync-back — " +
        "no merge ran: this lane's own commit fails a check its per-firing gate does not run. fast-forwarded\n" +
        '       FAIL  apps/dashboard/test/web/x.test.ts > paints > in Hebrew\n' +
        '      AssertionError: expected 1 to be 2',
    );
    expect(deps.recordRed).toHaveBeenCalledWith('pnpm run test', 'fast-forwarded', 3, tail);
  });

  it('a gate that crashed is UNJUDGED, not red — logged with the crash reason, persisted under a label that says so', async () => {
    const deps = fakeDeps();
    const tail = ' ✓ still running…\n';
    await gateConvergedBranch('autopilot/flight', 'fast-forwarded', {
      gate: fakeGate({
        ok: false,
        crashed: true,
        details:
          'pnpm run test failed (crashed: timeout) — gate could not verify the commit\n ✓ still running…',
        checks: [
          { label: 'pnpm run typecheck', pass: true, durationMs: 100 },
          { label: 'pnpm run test', pass: false, durationMs: 600000, outputTail: tail },
        ],
      }),
      ...deps,
    });
    expect(deps.out.mock.calls[0]?.[0]).toBe(
      "  ⚠ convergence UNJUDGED: 'autopilot/flight' — the gate crashed before it could judge the merged head after this sync-back " +
        '(pnpm run test failed (crashed: timeout) — gate could not verify the commit). fast-forwarded',
    );
    expect(deps.recordRed).toHaveBeenCalledWith(
      'pnpm run test (crashed, no verdict)',
      'fast-forwarded',
      600100,
      tail,
    );
    expect(deps.recordGreen).not.toHaveBeenCalled();
    expect(deps.recordUnverifiable).not.toHaveBeenCalled();
  });

  it('a crash with no failing check entry and no details still says so, generically', async () => {
    const deps = fakeDeps();
    await gateConvergedBranch('main', 'merge details', {
      gate: fakeGate({
        ok: false,
        crashed: true,
        checks: [{ label: 'typecheck', pass: true, durationMs: 7 }],
      }),
      ...deps,
    });
    expect(deps.out.mock.calls[0]?.[0]).toContain('(no detail). merge details');
    expect(deps.recordRed).toHaveBeenCalledWith(
      'gate (crashed, no verdict)',
      'merge details',
      7,
      undefined,
    );
  });

  it('a red that did not crash is still a red, whatever crashed is set to', async () => {
    const deps = fakeDeps();
    await gateConvergedBranch('main', 'merge details', {
      gate: fakeGate({
        ok: false,
        crashed: false,
        checks: [{ label: 'build', pass: false, durationMs: 3 }],
      }),
      ...deps,
    });
    expect(deps.out.mock.calls[0]?.[0]).toContain('CONVERGENCE RED');
    expect(deps.recordRed).toHaveBeenCalledWith('build', 'merge details', 3, undefined);
  });

  it("firstLine takes the first line of a gate's details, or says there is none", () => {
    expect(firstLine('one\ntwo')).toBe('one');
    expect(firstLine('only')).toBe('only');
    expect(firstLine(undefined)).toBe('no detail');
    expect(firstLine('')).toBe('');
  });

  it('indentedTail indents every line and drops trailing blank lines only', () => {
    expect(indentedTail('a\n b\n\n')).toBe('      a\n       b');
    expect(indentedTail('\nx')).toBe('      \n      x');
  });

  it('falls back to a generic "gate" label when a red result carries no failing check entry', async () => {
    const deps = fakeDeps();
    await gateConvergedBranch('main', 'merge details', {
      gate: fakeGate({ ok: false, checks: [{ label: 'typecheck', pass: true, durationMs: 10 }] }),
      ...deps,
    });
    expect(deps.recordRed).toHaveBeenCalledWith('gate', 'merge details', 10, undefined);
  });
});
