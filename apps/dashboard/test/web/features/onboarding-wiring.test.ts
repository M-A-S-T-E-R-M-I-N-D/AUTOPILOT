// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE LADDER'S WIRING (operator, 2026-09-15). Three defects reported live,
 * each pinned here as source the bundle really carries:
 *
 *  1. "I click Connect to GitHub and nothing happens." Connect is a masthead
 *     <details> popover, not one of the subject panels, so the generic
 *     subject opener found no element and the button did nothing at all.
 *  2. "I think I am already connected." The step read a `data-connected`
 *     attribute that NOTHING in the codebase ever sets, so it could never
 *     tick no matter how connected the machine was.
 *  3. "The tour was supposed to be connected to the onboarding." The tour
 *     taught four words and then stopped, leaving a reader with vocabulary
 *     and nothing to press.
 *
 * Asserting on the generated client text (the `fly-status-i18n.test.ts`
 * convention) rather than booting a DOM: what matters is that the wiring
 * reaches the right element and the right endpoint, and a string census
 * says that without simulating a popover.
 */

import { describe, it, expect } from 'vitest';
import { onboardingJs } from '../../../src/web/features/onboarding.js';
import { tourJs } from '../../../src/web/features/tour.js';
import { renderShell } from '../../../src/web/shell.js';

const ob = onboardingJs();
const tour = tourJs();

describe('the GitHub step reads the connection, not a DOM attribute nobody sets', () => {
  it('asks the same endpoint the Connect panel asks', () => {
    expect(ob).toContain("fetch('/api/connection/gh'");
    expect(ob).toContain('s.authenticated === true');
  });

  it('no longer sniffs the invented data-connected attribute', () => {
    // The bug: this attribute appears nowhere else in the product. A census
    // for it here is what stops a future refactor reintroducing the guess.
    expect(ob).not.toContain('dataset.connected');
    expect(ob).not.toContain('data-connected');
  });

  it('re-syncs when the answer lands, since the model is computed synchronously', () => {
    expect(ob).toContain('syncOnboarding(obLastState);');
  });

  it('asks once, not on every repaint', () => {
    expect(ob).toContain('obGhAsked');
  });
});

describe('the GitHub step opens the thing it is asking about', () => {
  it('opens the Connect popover by id and focuses the sign-in control', () => {
    expect(ob).toContain("document.getElementById('connect')");
    expect(ob).toContain('panel.open = true;');
    expect(ob).toContain("document.getElementById('gh-login')");
  });

  it('no longer routes the step through the subject opener that found nothing', () => {
    expect(ob).not.toContain("obOpenSubject('connect')");
  });

  it('the element it opens really exists in the shell', () => {
    const html = renderShell();
    expect(html).toContain('id="connect"');
    expect(html).toContain('id="connect-summary"');
  });
});

describe('the tour and the ladder are one path', () => {
  it('the tour’s last step hands over to the checklist', () => {
    expect(tour).toContain("tr('tourToLadder')");
    // Its own class: reusing tour-next would make any 'advance' walk exit
    // the dialog, which is exactly what it did the first time.
    expect(tour).toContain("'tour-start'");
    expect(tour).toContain("typeof obFocusLadder === 'function'");
  });

  it('the hand-over target exists, and clears a stale snooze so it is visible', () => {
    expect(ob).toContain('function obFocusLadder()');
    expect(ob).toContain('localStorage.removeItem(OB_SNOOZE_KEY)');
  });

  it('it lands on the step being nudged about, not the top of the panel', () => {
    expect(ob).toContain('.ob-step.is-current .ob-step-action');
  });

  it('the ladder links back to the tour, and the control exists in the shell', () => {
    expect(ob).toContain("document.getElementById('ob-tour-link')");
    expect(ob).toContain("typeof openTour === 'function'");
    expect(renderShell()).toContain('id="ob-tour-link"');
  });
});
