// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure data + step logic for the first-run guided tour — client-only (no
 * server counterpart), so it lives in `web/` rather than `shared/` (epic
 * 0002 "shell decomposition", slice 2). The tour dialog itself
 * (`paintTour`/`openTour`/`closeTour`/`onTourKeydown`) lives in
 * `web/features/tour.ts`: it's pure DOM/focus-trap wiring with no computable
 * logic left once the step content and first/last-step derivation move out
 * here.
 *
 * `web/features/tour.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()`/`JSON.stringify()` — see
 * `tourJs()` — instead of hand-retyping it, so the two copies can no longer
 * drift apart.
 *
 * `TOUR_STEPS`'s English `title`/`body` stay the tested source of truth
 * (`tour.test.ts`), but the served dialog itself is i18n'd (board
 * web-msnsndki-dz3vn1): `paintTour()` builds its text imperatively
 * (`el()`, `.textContent =`), with no persistent DOM node a `[data-i18n]`
 * sweep could reach, so it renders via `tr(key)` instead — the same pattern
 * `@autopilot/tokens`' confirm-dialog keys established. `TOUR_STEP_KEYS`
 * is the index-parallel `{titleKey, bodyKey}` mapping into that table.
 */
import type { StringKey } from '@autopilot/tokens';

/** One guided-tour step's dialog content. */
export interface TourStep {
  readonly title: string;
  readonly body: string;
}

/** One tour step's STRINGS key pair, index-parallel to {@link TOUR_STEPS} —
 *  `tour.test.ts` asserts each pair's English value matches its step. */
export interface TourStepStringKeys {
  readonly titleKey: StringKey;
  readonly bodyKey: StringKey;
}

/** The first-run guided tour's steps, in order — AUTOPILOT's core vocabulary
 *  (firing/slice/gate/flight) in plain language. */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    title: 'Firing',
    body: 'One autonomous work session: the agent orients, does the work, runs the gate, then commits — and stops. A flight is made of many firings.',
  },
  {
    title: 'Slice',
    body: 'A firing that advances a task without finishing it. The task stays open and the next firing resumes it — nothing is lost waiting on one giant firing.',
  },
  {
    title: 'Gate',
    body: 'The project’s own checks — typecheck, lint, test, build — run before every commit. A red gate means the change is reverted, never shipped broken.',
  },
  {
    title: 'Flight',
    body: 'A run of firings against one project, bounded by a budget you set (a firing count or a $ total), until it finishes or you pause it.',
  },
];

/** Index-parallel to {@link TOUR_STEPS} — see {@link TourStepStringKeys}. */
export const TOUR_STEP_KEYS: readonly TourStepStringKeys[] = [
  { titleKey: 'tourFiringTitle', bodyKey: 'tourFiringBody' },
  { titleKey: 'tourSliceTitle', bodyKey: 'tourSliceBody' },
  { titleKey: 'tourGateTitle', bodyKey: 'tourGateBody' },
  { titleKey: 'tourFlightTitle', bodyKey: 'tourFlightBody' },
];

/** One tour step's rendered content plus the first/last-step derivations
 *  `paintTour()` needs for its skip label and back/next button visibility. */
export interface TourStepMeta {
  readonly step: TourStep;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  /** 'Close' on the last step (nothing left to skip past), 'Skip' otherwise. */
  readonly skipLabel: string;
  /** The Skip/Close button's [data-tip] (App-wide interactivity audit v2,
   *  web-msm66jlc-gm4oom). Skipping mid-tour has a non-obvious consequence —
   *  `closeTour()` marks the tour seen, so it never auto-opens again — that
   *  hover/focus should state BEFORE the click; on the last step nothing is
   *  being skipped, so the tip drops the warning. */
  readonly skipTip: string;
  /** The Back button's [data-tip] — only rendered on non-first steps. */
  readonly backTip: string;
  /** The Next button's [data-tip] — only rendered on non-last steps. */
  readonly nextTip: string;
}

/**
 * Derives one tour step's render metadata from its index into
 * {@link TOUR_STEPS} — `paintTour()` previously recomputed `tourStep ===
 * TOUR_STEPS.length - 1` twice (once for the skip button's label, once for
 * the next button's visibility), with no direct test coverage of either
 * boundary.
 */
export function tourStepMeta(stepIndex: number): TourStepMeta {
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;
  return {
    step: TOUR_STEPS[stepIndex]!,
    isFirst,
    isLast,
    skipLabel: isLast ? 'Close' : 'Skip',
    skipTip: isLast
      ? 'Closes the tour — the masthead Tour button reopens it any time.'
      : 'Dismisses the tour and marks it seen — it will not auto-open again, but the masthead Tour button reopens it any time.',
    backTip: 'Steps back to the previous term.',
    nextTip: 'Advances to the next term — the tour stays open.',
  };
}
