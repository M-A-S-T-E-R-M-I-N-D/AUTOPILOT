// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { onboardingInfo, ONBOARDING_STEPS } from '../src/info.js';

describe('onboardingInfo', () => {
  it('backs up before any git action — MYTH/LEGACY/safety-branch come first', () => {
    const steps = onboardingInfo().steps;
    expect(steps[0]).toBe('backup-myth');
    expect(steps[1]).toBe('baseline-legacy');
    expect(steps[2]).toBe('safety-branch');
  });

  it('includes gate detection and index building', () => {
    expect(ONBOARDING_STEPS).toContain('detect-gate');
    expect(ONBOARDING_STEPS).toContain('build-index');
  });

  it('returns the exact ritual step order, with generate-soul last', () => {
    expect(onboardingInfo().steps).toStrictEqual([
      'backup-myth',
      'baseline-legacy',
      'safety-branch',
      'detect-gate',
      'map-architecture',
      'build-index',
      'generate-soul',
    ]);
  });

  it('reports its own package name and version', () => {
    expect(onboardingInfo()).toMatchObject({
      name: '@autopilot/onboarding',
      version: '0.1.0',
    });
  });
});
