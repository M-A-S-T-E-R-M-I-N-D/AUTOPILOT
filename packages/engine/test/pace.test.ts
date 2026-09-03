// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { nextAdaptivePaceMin, type PaceConfig } from '../src/pace.js';

const CONFIG: PaceConfig = {
  baseSleepMin: 5,
  hourlyCapUsd: 45,
  weeklyCapUsd: 900,
};

describe('nextAdaptivePaceMin', () => {
  it('paces at the base cadence with no observed spend', () => {
    expect(nextAdaptivePaceMin({ lastHourUsd: 0, lastWeekUsd: 0 }, CONFIG)).toBe(5);
  });

  it('paces at the base cadence up to half of either cap', () => {
    expect(nextAdaptivePaceMin({ lastHourUsd: 22.5, lastWeekUsd: 0 }, CONFIG)).toBe(5);
    expect(nextAdaptivePaceMin({ lastHourUsd: 0, lastWeekUsd: 450 }, CONFIG)).toBe(5);
  });

  it('ramps up past the halfway point toward the hourly cap', () => {
    const at75pct = nextAdaptivePaceMin({ lastHourUsd: 33.75, lastWeekUsd: 0 }, CONFIG);
    expect(at75pct).toBeGreaterThan(5);
    expect(at75pct).toBeLessThan(30);
  });

  it('caps the slowdown at 6x base cadence right at the hourly cap', () => {
    expect(nextAdaptivePaceMin({ lastHourUsd: 45, lastWeekUsd: 0 }, CONFIG)).toBe(30);
  });

  it('never paces slower than 6x base cadence, even far over the cap', () => {
    expect(nextAdaptivePaceMin({ lastHourUsd: 500, lastWeekUsd: 0 }, CONFIG)).toBe(30);
  });

  it('the tighter of the two ratios wins (weekly can dominate hourly)', () => {
    // Comfortably under the hourly cap, but the week is nearly spent.
    const paced = nextAdaptivePaceMin({ lastHourUsd: 1, lastWeekUsd: 880 }, CONFIG);
    expect(paced).toBeGreaterThan(5);
  });

  it('a non-positive cap disables that signal instead of dividing by zero', () => {
    const disabledHourly: PaceConfig = { ...CONFIG, hourlyCapUsd: 0 };
    expect(nextAdaptivePaceMin({ lastHourUsd: 1000, lastWeekUsd: 0 }, disabledHourly)).toBe(5);
  });

  it('a non-positive weekly cap disables that signal instead of dividing by zero', () => {
    const disabledWeekly: PaceConfig = { ...CONFIG, weeklyCapUsd: 0 };
    expect(nextAdaptivePaceMin({ lastHourUsd: 0, lastWeekUsd: 100_000 }, disabledWeekly)).toBe(5);
  });

  it('returns baseSleepMin unrounded exactly at the threshold boundary', () => {
    // At ratio === SLOWDOWN_THRESHOLD exactly, the overshoot formula also
    // happens to evaluate to a 1x multiplier — so a fractional baseSleepMin
    // is the only way to tell "returned raw" (<=) apart from "ran through
    // Math.round(baseSleepMin * 1)" (<): both branches coincide for any
    // integer baseSleepMin, so a boundary bug here would go unnoticed
    // without this.
    const fractional: PaceConfig = { baseSleepMin: 5.5, hourlyCapUsd: 100, weeklyCapUsd: 0 };
    expect(nextAdaptivePaceMin({ lastHourUsd: 50, lastWeekUsd: 0 }, fractional)).toBe(5.5);
  });
});
