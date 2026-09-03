// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the first-run tour
 * dialog's own Skip/Back/Next buttons carried no [data-tip], while the
 * masthead "Tour" button that opens the dialog already explains itself.
 * Skip has a real non-obvious consequence — closeTour() marks the tour seen
 * (TOUR_SEEN_KEY), so it never auto-opens again — which hover/focus should
 * say BEFORE the click. `tourStepMeta` (web/tour.ts) still carries the
 * pinned English skipTip/backTip/nextTip strings `tour.test.ts` cross-checks
 * against `STRINGS.en`, but the guided-tour i18n slice (web-msnsndki-dz3vn1)
 * moved the actual rendered [data-tip] onto `tr(...)` lookups keyed off
 * `meta.isLast` rather than reading those fields directly — the wiring
 * assertions below follow that, checking the same generated-text style as
 * fly-bar-tooltips.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { TOUR_STEPS, tourStepMeta } from '../../src/web/tour.js';
import { clientJs } from '../../src/web/shell.js';

describe('tourStepMeta button tips', () => {
  it('tips Skip with the never-auto-opens-again consequence on a non-last step', () => {
    const meta = tourStepMeta(0);
    expect(meta.skipTip).toBe(
      'Dismisses the tour and marks it seen — it will not auto-open again, but the masthead Tour button reopens it any time.',
    );
  });

  it('tips Close (last step) without the dismissal warning — nothing was skipped', () => {
    const meta = tourStepMeta(TOUR_STEPS.length - 1);
    expect(meta.skipTip).toBe('Closes the tour — the masthead Tour button reopens it any time.');
  });

  it('tips Back and Next as step moves that keep the tour open', () => {
    const meta = tourStepMeta(1);
    expect(meta.backTip).toBe('Steps back to the previous term.');
    expect(meta.nextTip).toBe('Advances to the next term — the tour stays open.');
  });
});

describe('the tour dialog Skip/Back/Next buttons explain themselves on hover/focus', () => {
  const out = clientJs();

  it('wires the i18n skip/close tip onto the Skip/Close button', () => {
    expect(out).toContain(
      "skip.setAttribute('data-tip', tr(meta.isLast ? 'tourSkipTipLast' : 'tourSkipTipMid'));",
    );
  });

  it('wires the i18n back tip onto the Back button', () => {
    expect(out).toContain("back.setAttribute('data-tip', tr('tourBackTip'));");
  });

  it('wires the i18n next tip onto the Next button', () => {
    expect(out).toContain("next.setAttribute('data-tip', tr('tourNextTip'));");
  });
});
