// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

export const ONBOARDING_VERSION = '0.1.0';

/** The first-lock ritual steps, in order (MASTER-PLAN §3, ACTION-PLAN M2). */
export const ONBOARDING_STEPS = [
  'backup-myth',
  'baseline-legacy',
  'safety-branch',
  'detect-gate',
  'map-architecture',
  'build-index',
  'generate-soul',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingInfo {
  readonly name: string;
  readonly version: string;
  readonly steps: readonly OnboardingStep[];
}

/** Static capability descriptor — the real folder-lock ritual is fully
 *  implemented (see onboard/onboard.ts, adapters/git-backup.ts). */
export function onboardingInfo(): OnboardingInfo {
  return {
    name: '@autopilot/onboarding',
    version: ONBOARDING_VERSION,
    steps: ONBOARDING_STEPS,
  };
}
