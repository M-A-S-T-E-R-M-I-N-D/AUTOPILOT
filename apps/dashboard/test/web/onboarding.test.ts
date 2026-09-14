// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE ONBOARDING LADDER (epic 0032): what the checklist claims is true.
 *
 * The rules worth pinning are the ones a refactor would quietly break — that
 * level 2 is never proposed while level 1 is open, that the social surface
 * answers to level 1's tick and not to a preference, and that every step's
 * text and icon actually exist in both locales.
 */

import { describe, it, expect } from 'vitest';
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_IDS,
  computeOnboarding,
  type OnboardingSignals,
} from '../../src/web/onboarding.js';
import { ICON_NAMES } from '../../src/web/icons.js';
import { STRINGS, LOCALE_NAMES } from '@autopilot/tokens';

const NOTHING: OnboardingSignals = {
  sampleAdded: false,
  projectCount: 0,
  firingCount: 0,
  readBack: false,
  githubConnected: false,
  findingPublished: false,
  fixSubmitted: false,
};
const FLOWN: OnboardingSignals = {
  ...NOTHING,
  sampleAdded: true,
  projectCount: 1,
  firingCount: 3,
  readBack: true,
};
const EVERYTHING: OnboardingSignals = {
  ...FLOWN,
  githubConnected: true,
  findingPublished: true,
  fixSubmitted: true,
};

describe('the ladder’s shape', () => {
  it('lists every id exactly once, level 1 before level 2', () => {
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([...ONBOARDING_STEP_IDS]);
    const levels = ONBOARDING_STEPS.map((s) => s.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it('gives every step an icon that exists and text that both locales carry', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(ICON_NAMES, `${step.id} icon`).toContain(step.icon);
      for (const locale of LOCALE_NAMES) {
        expect(STRINGS[locale][step.titleKey]?.trim()).toBeTruthy();
        expect(STRINGS[locale][step.bodyKey]?.trim()).toBeTruthy();
        if (step.actionKey) expect(STRINGS[locale][step.actionKey]?.trim()).toBeTruthy();
      }
    }
  });
});

describe('computeOnboarding', () => {
  it('starts a fresh profile at the very first step, with nothing earned', () => {
    const state = computeOnboarding(NOTHING);
    expect(state.percent).toBe(0);
    expect(state.currentStep?.id).toBe('add-sample');
    expect(state.levels.map((l) => l.complete)).toEqual([false, false]);
    expect(state.socialUnlocked).toBe(false);
    expect(state.complete).toBe(false);
  });

  it('never proposes a level-2 step while a level-1 step is still open', () => {
    // The awkward real case: someone connected GitHub on day one but has not
    // flown anything. The nudge must still be "press Fire", not "submit a fix".
    const state = computeOnboarding({ ...NOTHING, githubConnected: true, sampleAdded: true });
    expect(state.currentStep?.id).toBe('lock-on');
    expect(state.steps.filter((s) => s.current)).toHaveLength(1);
    expect(state.steps.find((s) => s.step.id === 'connect-github')?.done).toBe(true);
  });

  it('lights the Pilot tick and opens the social surface after a real flight', () => {
    const state = computeOnboarding(FLOWN);
    expect(state.levels[0]).toMatchObject({ complete: true, done: 4, total: 4 });
    expect(state.socialUnlocked).toBe(true);
    // …and moves the nudge on to level 2's first step, not past it.
    expect(state.currentStep?.id).toBe('connect-github');
    expect(state.complete).toBe(false);
  });

  it('earns both ticks and stops nudging when the whole ladder is done', () => {
    const state = computeOnboarding(EVERYTHING);
    expect(state.complete).toBe(true);
    expect(state.percent).toBe(100);
    expect(state.currentStep).toBeUndefined();
    expect(state.steps.every((s) => s.current === false)).toBe(true);
  });

  it('counts progress across BOTH levels, so the meter never lies about what is left', () => {
    expect(computeOnboarding(FLOWN).percent).toBe(57);
  });
});
