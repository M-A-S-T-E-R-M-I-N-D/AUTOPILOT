// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import type { GatePort, GateResult } from '@autopilot/engine';
import { gateConvergedBranch } from '../../src/flight/convergence-gate.js';

function fakeGate(result: GateResult): GatePort {
  return { run: async () => result };
}

describe('gateConvergedBranch', () => {
  it('is a silent no-op when the repo has no detected gate commands', async () => {
    const out = vi.fn();
    const recordRed = vi.fn();
    await gateConvergedBranch('main', 'merge details', {
      gate: fakeGate({ ok: true, checks: [] }),
      out,
      recordRed,
    });
    expect(out).not.toHaveBeenCalled();
    expect(recordRed).not.toHaveBeenCalled();
  });

  it('logs a visible success line (check count + total duration) when the merged branch passes', async () => {
    const out = vi.fn();
    const recordRed = vi.fn();
    await gateConvergedBranch('main', 'merge details', {
      gate: fakeGate({
        ok: true,
        checks: [
          { label: 'typecheck', pass: true, durationMs: 1200 },
          { label: 'build', pass: true, durationMs: 3400 },
        ],
      }),
      out,
      recordRed,
    });
    expect(out).toHaveBeenCalledTimes(1);
    expect(out.mock.calls[0]?.[0]).toContain("'main' passes 2 check(s)");
    expect(out.mock.calls[0]?.[0]).toContain('(4600ms)');
    expect(recordRed).not.toHaveBeenCalled();
  });

  it('surfaces CONVERGENCE RED and records telemetry naming the failing check', async () => {
    const out = vi.fn();
    const recordRed = vi.fn();
    await gateConvergedBranch('autopilot/flight', 'chore: sync lane into autopilot/flight', {
      gate: fakeGate({
        ok: false,
        checks: [
          { label: 'typecheck', pass: true, durationMs: 900 },
          { label: 'build', pass: false, durationMs: 2100 },
        ],
      }),
      out,
      recordRed,
    });
    expect(out.mock.calls[0]?.[0]).toContain('CONVERGENCE RED');
    expect(out.mock.calls[0]?.[0]).toContain('build');
    expect(out.mock.calls[0]?.[0]).toContain('chore: sync lane into autopilot/flight');
    expect(recordRed).toHaveBeenCalledWith('build', 'chore: sync lane into autopilot/flight');
  });

  it('falls back to a generic "gate" label when a red result carries no failing check entry', async () => {
    const out = vi.fn();
    const recordRed = vi.fn();
    await gateConvergedBranch('main', 'merge details', {
      gate: fakeGate({ ok: false, checks: [{ label: 'typecheck', pass: true, durationMs: 10 }] }),
      out,
      recordRed,
    });
    expect(recordRed).toHaveBeenCalledWith('gate', 'merge details');
  });
});
