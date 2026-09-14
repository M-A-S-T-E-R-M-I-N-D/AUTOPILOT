// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE ONBOARDING LADDER (epic 0032) — pure model.
 *
 * The operator's complaint (2026-09-14) was precise: the guided tour is four
 * paragraphs of vocabulary, while the product behind it has grown into a
 * fleet, a pool, a gate and a social surface. A tour TELLS; this ladder asks
 * the newcomer to DO one small thing at a time, and shows what it earned.
 *
 * Two levels, because there are two kinds of newcomer:
 *
 *   Level 1 — FLY. Add a sample, lock on it, press Fire, read what came back.
 *     Four clicks from install to a real commit made by a real firing.
 *   Level 2 — CONTRIBUTE. Connect GitHub, publish a finding, submit a fix.
 *     Optional. Offered once level 1 is complete, and never nagged: the
 *     client remembers a snooze, this model only says what is TRUE.
 *
 * Each level completed is one tick beside a contributor's name — the two
 * ticks the operator asked for. Level 1's tick is also the key to the social
 * surface: the pool, the discussions and the standing board answer to people
 * who have actually flown something, which is the cheapest honest filter
 * there is against drive-by noise.
 *
 * Pure on purpose. Every "is this done?" answer is derived from a signals
 * snapshot the client assembles out of state it already has (projects,
 * firings, the GitHub connection, its own localStorage marks) — nothing here
 * reads a DOM, a clock or a store, so the whole ladder is unit-testable and
 * cannot drift from what the panel paints.
 */

import type { StringKey } from '@autopilot/tokens';

/** Which ladder a step belongs to. */
export type OnboardingLevel = 1 | 2;

/** Every step's stable id — persisted in marks, so never renamed lightly. */
export const ONBOARDING_STEP_IDS = [
  'add-sample',
  'lock-on',
  'fire',
  'read-back',
  'connect-github',
  'publish-finding',
  'submit-fix',
] as const;
export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

/** One micro-task: a sentence, an icon, and — where one exists — the single
 *  control that performs it, so the checklist can DO the step, not just
 *  describe it. */
export interface OnboardingStep {
  readonly id: OnboardingStepId;
  readonly level: OnboardingLevel;
  /** Short imperative title, e.g. "Add the calculator sample". */
  readonly titleKey: StringKey;
  /** One sentence on what it gets them. */
  readonly bodyKey: StringKey;
  /** Icon name from `web/icons.ts` — every step reads as a symbol first. */
  readonly icon: string;
  /** Label for the step's own action button; absent when the step completes
   *  itself by the operator doing the thing elsewhere (pressing Fire). */
  readonly actionKey?: StringKey;
}

/** The ladder, in order. Order is the teaching: nothing here can be done
 *  before the step above it makes sense. */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'add-sample',
    level: 1,
    titleKey: 'obAddSample',
    bodyKey: 'obAddSampleBody',
    icon: 'sprout',
    actionKey: 'obAddSampleAction',
  },
  {
    id: 'lock-on',
    level: 1,
    titleKey: 'obLockOn',
    bodyKey: 'obLockOnBody',
    icon: 'target',
    actionKey: 'obLockOnAction',
  },
  { id: 'fire', level: 1, titleKey: 'obFire', bodyKey: 'obFireBody', icon: 'rocket' },
  {
    id: 'read-back',
    level: 1,
    titleKey: 'obReadBack',
    bodyKey: 'obReadBackBody',
    icon: 'chart-line',
    actionKey: 'obReadBackAction',
  },
  {
    id: 'connect-github',
    level: 2,
    titleKey: 'obConnectGithub',
    bodyKey: 'obConnectGithubBody',
    icon: 'key-round',
    actionKey: 'obConnectGithubAction',
  },
  {
    id: 'publish-finding',
    level: 2,
    titleKey: 'obPublishFinding',
    bodyKey: 'obPublishFindingBody',
    icon: 'flag',
    actionKey: 'obPublishFindingAction',
  },
  {
    id: 'submit-fix',
    level: 2,
    titleKey: 'obSubmitFix',
    bodyKey: 'obSubmitFixBody',
    icon: 'git-pull-request',
    actionKey: 'obSubmitFixAction',
  },
];

/**
 * What the client knows. Every field is a plain fact it can already answer
 * without a new endpoint: three come from the fleet/connection state it
 * polls, three from marks it writes when an action succeeds.
 */
export interface OnboardingSignals {
  /** A sample copy exists (the add succeeded, or one was already there). */
  readonly sampleAdded: boolean;
  /** At least one project is registered — the Fly bar has a real target. */
  readonly projectCount: number;
  /** Firings recorded across all flights. One is enough. */
  readonly firingCount: number;
  /** The operator opened a finished firing's record (metrics, diff, debrief). */
  readonly readBack: boolean;
  /** `gh` is authenticated for this machine. */
  readonly githubConnected: boolean;
  /** A report from here became a published issue. */
  readonly findingPublished: boolean;
  /** A pull request was opened from a flight's work. */
  readonly fixSubmitted: boolean;
}

/** A step plus whether it is done — what the panel paints. */
export interface OnboardingStepState {
  readonly step: OnboardingStep;
  readonly done: boolean;
  /** The first not-done step of the first incomplete level: the one the
   *  panel highlights and the only one it ever nudges about. */
  readonly current: boolean;
}

/** One level's roll-up: the tick beside a contributor's name. */
export interface OnboardingLevelState {
  readonly level: OnboardingLevel;
  readonly titleKey: StringKey;
  readonly badgeKey: StringKey;
  readonly done: number;
  readonly total: number;
  /** Earned — the level's tick is lit. */
  readonly complete: boolean;
}

export interface OnboardingState {
  readonly steps: readonly OnboardingStepState[];
  readonly levels: readonly OnboardingLevelState[];
  /** Level 1 complete: the social surface opens (pool, discussions, standing). */
  readonly socialUnlocked: boolean;
  /** Both ticks. */
  readonly complete: boolean;
  /** The single step to nudge about, or undefined when the ladder is done. */
  readonly currentStep?: OnboardingStep;
  /** 0–100 across BOTH levels, for the progress meter's `aria-valuenow`. */
  readonly percent: number;
}

export const LEVEL_META: Readonly<
  Record<OnboardingLevel, { readonly titleKey: StringKey; readonly badgeKey: StringKey }>
> = {
  1: { titleKey: 'obLevel1', badgeKey: 'obBadgePilot' },
  2: { titleKey: 'obLevel2', badgeKey: 'obBadgeContributor' },
};

/** Whether one step's condition holds. Kept beside the steps so a new step
 *  cannot be added without deciding what completes it.
 *
 *  Exported only because `features/onboarding.ts` splices `computeOnboarding`
 *  into the served bundle by its compiled source: every binding that function
 *  closes over has to travel with it, or the client throws a ReferenceError
 *  the moment the checklist paints. Same reason `LEVEL_META` is exported. */
export function isStepDone(id: OnboardingStepId, s: OnboardingSignals): boolean {
  switch (id) {
    case 'add-sample':
      return s.sampleAdded;
    case 'lock-on':
      return s.projectCount > 0;
    case 'fire':
      return s.firingCount > 0;
    case 'read-back':
      return s.readBack;
    case 'connect-github':
      return s.githubConnected;
    case 'publish-finding':
      return s.findingPublished;
    case 'submit-fix':
      return s.fixSubmitted;
  }
}

/**
 * Derives the whole ladder from one snapshot.
 *
 * A step already done stays done even if a later signal lapses — a newcomer
 * who fired once and then deleted the sample has still fired, and a checklist
 * that un-ticks itself is a checklist nobody trusts. The caller keeps that
 * durability by persisting the marks it sets; this function is honest about
 * the snapshot it is handed.
 */
export function computeOnboarding(signals: OnboardingSignals): OnboardingState {
  const done = new Map<OnboardingStepId, boolean>(
    ONBOARDING_STEPS.map((step) => [step.id, isStepDone(step.id, signals)]),
  );

  // The nudge target: the first unfinished step of the FIRST unfinished
  // level. Level 2 is never proposed while level 1 is open — one thing at a
  // time is the whole point.
  const firstOpenLevel = ([1, 2] as const).find((level) =>
    ONBOARDING_STEPS.some((step) => step.level === level && done.get(step.id) !== true),
  );
  const currentStep = ONBOARDING_STEPS.find(
    (step) => step.level === firstOpenLevel && done.get(step.id) !== true,
  );

  const steps = ONBOARDING_STEPS.map((step) => ({
    step,
    done: done.get(step.id) === true,
    current: step.id === currentStep?.id,
  }));

  const levels = ([1, 2] as const).map((level) => {
    const own = steps.filter((s) => s.step.level === level);
    const count = own.filter((s) => s.done).length;
    return {
      level,
      titleKey: LEVEL_META[level].titleKey,
      badgeKey: LEVEL_META[level].badgeKey,
      done: count,
      total: own.length,
      complete: count === own.length,
    };
  });

  const doneCount = steps.filter((s) => s.done).length;
  return {
    steps,
    levels,
    socialUnlocked: levels[0]?.complete === true,
    complete: levels.every((l) => l.complete),
    ...(currentStep === undefined ? {} : { currentStep }),
    percent: Math.round((doneCount / ONBOARDING_STEPS.length) * 100),
  };
}
