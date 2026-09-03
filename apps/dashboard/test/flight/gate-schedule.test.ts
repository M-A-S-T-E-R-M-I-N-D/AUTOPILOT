// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import type { GateSpec } from '@autopilot/onboarding';
import {
  FULL_TEST_EVERY_N_FIRINGS,
  fullGateSpec,
  isFullTestRunDue,
  perFiringGateSpec,
  selectTestCommand,
} from '../../src/flight/gate-schedule.js';

describe('isFullTestRunDue', () => {
  it('is due on the very first firing (prior count 0)', () => {
    expect(isFullTestRunDue(0)).toBe(true);
  });

  it('is not due for firings between scheduled full runs', () => {
    for (let n = 1; n < FULL_TEST_EVERY_N_FIRINGS; n++) {
      expect(isFullTestRunDue(n)).toBe(false);
    }
  });

  it('is due again every FULL_TEST_EVERY_N_FIRINGS firings', () => {
    expect(isFullTestRunDue(FULL_TEST_EVERY_N_FIRINGS)).toBe(true);
    expect(isFullTestRunDue(FULL_TEST_EVERY_N_FIRINGS * 3)).toBe(true);
  });
});

const FULL = { bin: 'pnpm', args: ['run', 'test'], label: 'pnpm run test' };
const IMPACTED = {
  bin: 'pnpm',
  args: ['run', 'test:impacted'],
  label: 'pnpm run test:impacted',
};

describe('selectTestCommand', () => {
  it('picks the full command when no testImpacted was detected', () => {
    expect(selectTestCommand({ test: FULL }, 2)).toBe(FULL);
  });

  it('picks the impacted command on the fast path between scheduled full runs', () => {
    expect(selectTestCommand({ test: FULL, testImpacted: IMPACTED }, 1)).toBe(IMPACTED);
  });

  it('picks the full command when a scheduled full run is due, even with testImpacted detected', () => {
    expect(selectTestCommand({ test: FULL, testImpacted: IMPACTED }, 0)).toBe(FULL);
    expect(
      selectTestCommand({ test: FULL, testImpacted: IMPACTED }, FULL_TEST_EVERY_N_FIRINGS),
    ).toBe(FULL);
  });

  it('returns undefined when neither test nor testImpacted was detected', () => {
    expect(selectTestCommand({}, 1)).toBeUndefined();
  });
});

const LINT = { bin: 'pnpm', args: ['run', 'lint'], label: 'pnpm run lint' };
const DETECTED: GateSpec = { ecosystem: 'js', test: FULL, testImpacted: IMPACTED, lint: LINT };

describe('fullGateSpec', () => {
  it("keeps the detector's raw test command regardless of the impacted-tests schedule", () => {
    expect(fullGateSpec(DETECTED).test).toBe(FULL);
  });

  it('leaves every other detected command untouched', () => {
    expect(fullGateSpec(DETECTED)).toEqual(DETECTED);
  });
});

describe('perFiringGateSpec', () => {
  it('substitutes the impacted command on the fast path between scheduled full runs', () => {
    expect(perFiringGateSpec(DETECTED, 1).test).toBe(IMPACTED);
  });

  it('keeps the full command when a scheduled full run is due', () => {
    expect(perFiringGateSpec(DETECTED, 0).test).toBe(FULL);
  });

  it('leaves lint and other non-test commands untouched', () => {
    expect(perFiringGateSpec(DETECTED, 1).lint).toBe(LINT);
  });
});
