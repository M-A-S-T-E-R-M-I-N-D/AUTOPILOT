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

/** Which side of its target a stop's card prefers to sit on. */
export type TourPlacement = 'top' | 'bottom' | 'start' | 'end' | 'center';

/** One guided-tour stop: what it points AT, and what it says about it.
 *
 *  The tour used to be four paragraphs of vocabulary in the middle of the
 *  screen — it defined "firing" and "gate" and then stopped, never once
 *  showing you where those things live (operator, 2026-09-15: "I meant the
 *  tour should really go one by one and point out exactly how to use every
 *  part of the interface"). Every stop now anchors to a real control, and
 *  the vocabulary is taught ON the thing it names. */
export interface TourStep {
  readonly title: string;
  readonly body: string;
  /** CSS selector for the element this stop points at. A stop whose target
   *  is absent from the current page is SKIPPED, never rendered pointing at
   *  nothing — see {@link presentStops}. */
  readonly selector: string;
  readonly placement: TourPlacement;
}

/** One tour step's STRINGS key pair, index-parallel to {@link TOUR_STEPS} —
 *  `tour.test.ts` asserts each pair's English value matches its step. */
export interface TourStepStringKeys {
  readonly titleKey: StringKey;
  readonly bodyKey: StringKey;
}

/** The guided tour, in order: a walk across the real interface, left to
 *  right through the thing you actually do. The four words the old tour
 *  defined in the abstract — firing, gate, slice, flight — are still all
 *  here, each taught on the control that embodies it. */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    title: 'Lock on a folder',
    body: 'Point AUTOPILOT at a git repository. Everything it does happens inside that folder, on its own branch — it never pushes and never merges on its own.',
    selector: '#fly-folder',
    placement: 'bottom',
  },
  {
    title: 'Let it size the flight',
    body: 'The clover measures this machine — idle cores, free memory, even whether the disk is a platter or flash — and fills in how many lanes and firings it can carry without freezing your own work.',
    selector: '#fly-lucky',
    placement: 'bottom',
  },
  {
    title: 'Fire',
    body: 'One firing: the agent orients, does ONE task, runs your project’s own gate — typecheck, lint, test, build — and commits only if it passes. Red means the change is reverted, never shipped broken. A flight is many firings, bounded by the budget you set.',
    selector: '#fly-go',
    placement: 'bottom',
  },
  {
    title: 'Your progress',
    body: 'The checklist tracks what you have done and what it earned. Two ticks: one for flying something, one for contributing back. It puts itself away when you ask, and for good once both are earned.',
    selector: '#onboarding',
    placement: 'top',
  },
  {
    title: 'The fleet',
    body: 'One card per project: what it cost, what shipped, how the gate ruled, and which commit is on HEAD. A firing that advances a task without finishing it is a slice — the task stays open and the next firing resumes it.',
    selector: '#fleet',
    placement: 'top',
  },
  {
    title: 'Search the code',
    body: 'Find matching code across a project — or ask this same box a question and get an answer built from the indexed source, with citations.',
    selector: '#search-q',
    placement: 'bottom',
  },
  {
    title: 'Ask about this page',
    body: 'Ask about whatever is on screen. It answers read-only by default, and can escalate to a real agentic session when the answer needs going and looking.',
    selector: '#ask-fab',
    placement: 'start',
  },
  {
    title: 'Connections',
    body: 'Claude is what flies the work. GitHub is how a finding or a fix leaves this machine — both live behind this one control.',
    selector: '#connect-summary',
    placement: 'bottom',
  },
  {
    title: 'Report from here',
    body: 'Turn whatever is on screen into an issue, with the page captured alongside it. It is the fastest way to tell us something is wrong — and you always see the draft before anything is filed.',
    selector: '#report-btn',
    placement: 'bottom',
  },
];

/** Index-parallel to {@link TOUR_STEPS} — see {@link TourStepStringKeys}. */
export const TOUR_STEP_KEYS: readonly TourStepStringKeys[] = [
  { titleKey: 'tourLockOnTitle', bodyKey: 'tourLockOnBody' },
  { titleKey: 'tourLuckyTitle', bodyKey: 'tourLuckyBody' },
  { titleKey: 'tourFireTitle', bodyKey: 'tourFireBody' },
  { titleKey: 'tourLadderTitle', bodyKey: 'tourLadderBody' },
  { titleKey: 'tourFleetTitle', bodyKey: 'tourFleetBody' },
  { titleKey: 'tourSearchTitle', bodyKey: 'tourSearchBody' },
  { titleKey: 'tourAskTitle', bodyKey: 'tourAskBody' },
  { titleKey: 'tourConnectTitle', bodyKey: 'tourConnectBody' },
  { titleKey: 'tourReportTitle', bodyKey: 'tourReportBody' },
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

/** A rectangle in viewport coordinates. */
export interface TourRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Where the tour card ends up, and which side it actually landed on. */
export interface TourAnchor {
  readonly x: number;
  readonly y: number;
  readonly placement: TourPlacement;
}

/** Gap between the highlighted target and the card, and the margin the card
 *  keeps from the viewport edge. */
export const TOUR_GAP_PX = 14;
export const TOUR_MARGIN_PX = 12;

/** Only the stops whose target actually exists on this page.
 *
 *  A tour that points at nothing is worse than no tour: the Fly bar is
 *  absent on some subjects, the checklist disappears once both ticks are
 *  earned, and a card pointing at empty space reads as a bug. `isPresent`
 *  takes the selector so the caller can pass a real `querySelector`. */
export function presentStops(
  steps: readonly TourStep[],
  isPresent: (selector: string) => boolean,
): readonly TourStep[] {
  return steps.filter((step) => isPresent(step.selector));
}

/**
 * Places the card beside its target without covering it.
 *
 * Covering the thing you are pointing at is the classic coach-mark bug, and
 * WCAG 2.4.11 (Focus Not Obscured) makes it an accessibility failure rather
 * than a cosmetic one. So a placement that would overflow the viewport
 * FLIPS to the opposite side rather than sliding over the target, and only
 * falls back to centre when neither side fits.
 */
export function anchorPosition(
  target: TourRect,
  card: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
  preferred: TourPlacement,
): TourAnchor {
  const clamp = (value: number, max: number): number =>
    Math.max(TOUR_MARGIN_PX, Math.min(value, max - TOUR_MARGIN_PX));

  const fits: Readonly<Record<TourPlacement, boolean>> = {
    top: target.y - TOUR_GAP_PX - card.height >= TOUR_MARGIN_PX,
    bottom:
      target.y + target.height + TOUR_GAP_PX + card.height <= viewport.height - TOUR_MARGIN_PX,
    start: target.x - TOUR_GAP_PX - card.width >= TOUR_MARGIN_PX,
    end: target.x + target.width + TOUR_GAP_PX + card.width <= viewport.width - TOUR_MARGIN_PX,
    center: true,
  };
  const opposite: Readonly<Record<TourPlacement, TourPlacement>> = {
    top: 'bottom',
    bottom: 'top',
    start: 'end',
    end: 'start',
    center: 'center',
  };

  const placement: TourPlacement = fits[preferred]
    ? preferred
    : fits[opposite[preferred]]
      ? opposite[preferred]
      : 'center';

  if (placement === 'center') {
    return {
      x: clamp((viewport.width - card.width) / 2, viewport.width - card.width),
      y: clamp((viewport.height - card.height) / 2, viewport.height - card.height),
      placement,
    };
  }
  if (placement === 'top' || placement === 'bottom') {
    const y =
      placement === 'top'
        ? target.y - TOUR_GAP_PX - card.height
        : target.y + target.height + TOUR_GAP_PX;
    return {
      x: clamp(target.x + target.width / 2 - card.width / 2, viewport.width - card.width),
      y: clamp(y, viewport.height - card.height),
      placement,
    };
  }
  const x =
    placement === 'start'
      ? target.x - TOUR_GAP_PX - card.width
      : target.x + target.width + TOUR_GAP_PX;
  return {
    x: clamp(x, viewport.width - card.width),
    y: clamp(target.y + target.height / 2 - card.height / 2, viewport.height - card.height),
    placement,
  };
}
