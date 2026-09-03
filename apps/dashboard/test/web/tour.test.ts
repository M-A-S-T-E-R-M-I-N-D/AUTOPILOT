// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the guided tour's pure step data/logic
 * (`web/tour.ts`) — extracted out of `fleetJs()`'s inline `paintTour()`
 * (epic 0002 "shell decomposition"), where `tourStep === TOUR_STEPS.length -
 * 1` had no direct test coverage of either boundary before this.
 */

import { describe, it, expect } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { TOUR_STEPS, TOUR_STEP_KEYS, tourStepMeta } from '../../src/web/tour.js';

describe('tourStepMeta', () => {
  it('marks the first step as first, not last, with a "Skip" label', () => {
    const meta = tourStepMeta(0);
    expect(meta.step).toBe(TOUR_STEPS[0]);
    expect(meta.isFirst).toBe(true);
    expect(meta.isLast).toBe(false);
    expect(meta.skipLabel).toBe('Skip');
  });

  it('marks a middle step as neither first nor last', () => {
    const meta = tourStepMeta(1);
    expect(meta.step).toBe(TOUR_STEPS[1]);
    expect(meta.isFirst).toBe(false);
    expect(meta.isLast).toBe(false);
    expect(meta.skipLabel).toBe('Skip');
  });

  it('marks the last step as last, not first, with a "Close" label', () => {
    const lastIndex = TOUR_STEPS.length - 1;
    const meta = tourStepMeta(lastIndex);
    expect(meta.step).toBe(TOUR_STEPS[lastIndex]);
    expect(meta.isFirst).toBe(false);
    expect(meta.isLast).toBe(true);
    expect(meta.skipLabel).toBe('Close');
  });
});

describe('TOUR_STEPS', () => {
  it('has a non-empty title and body for every step', () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });
});

describe('TOUR_STEP_KEYS (board web-msnsndki-dz3vn1)', () => {
  it('has exactly one key pair per TOUR_STEPS entry, in the same order', () => {
    expect(TOUR_STEP_KEYS.length).toBe(TOUR_STEPS.length);
  });

  it("each key pair resolves to its step's exact English text in STRINGS", () => {
    TOUR_STEPS.forEach((step, i) => {
      const keys = TOUR_STEP_KEYS[i]!;
      expect(STRINGS.en[keys.titleKey]).toBe(step.title);
      expect(STRINGS.en[keys.bodyKey]).toBe(step.body);
    });
  });
});

describe('served tour chrome text mirrors STRINGS.en (board web-msnsndki-dz3vn1)', () => {
  it('Skip/Close labels and tips match tourStepMeta at the first/last boundary', () => {
    const first = tourStepMeta(0);
    const last = tourStepMeta(TOUR_STEPS.length - 1);
    expect(STRINGS.en.tourSkip).toBe(first.skipLabel);
    expect(STRINGS.en.tourClose).toBe(last.skipLabel);
    expect(STRINGS.en.tourSkipTipMid).toBe(first.skipTip);
    expect(STRINGS.en.tourSkipTipLast).toBe(last.skipTip);
  });

  it('Back/Next labels and tips match tourStepMeta on a middle step', () => {
    const mid = tourStepMeta(1);
    expect(STRINGS.en.tourBack).toBe('Back');
    expect(STRINGS.en.tourBackTip).toBe(mid.backTip);
    expect(STRINGS.en.tourNext).toBe('Next');
    expect(STRINGS.en.tourNextTip).toBe(mid.nextTip);
  });
});
