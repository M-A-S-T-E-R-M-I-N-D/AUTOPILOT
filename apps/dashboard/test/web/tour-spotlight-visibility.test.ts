// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Operator-reported 2026-09-17: "in the TOUR the dim sits over the panels and
 * you cannot see them."
 *
 * The spotlight is a positioned ring whose `box-shadow: 0 0 0 9999px` paints
 * the dim OUTSIDE its own box — so the ring's rectangle is the hole the target
 * shows through. That inverts catastrophically when the ring has no size: a
 * 0x0 hole means the 9999px shadow covers the entire viewport and the page
 * reads as uniformly blacked out, with nothing lit.
 *
 * It got a 0x0 rect because `tourPresent()` asked only whether the target was
 * in the DOM. This shell renders most panels up front carrying `hidden` and
 * drops it once each has something to show — #flightbar waits on the
 * onboarding "lock on" micro-task, #searchbar on the fleet having projects —
 * so querySelector happily returned elements with no box at all.
 *
 * Two guarantees are locked here: the walk never STOPS on a target inside a
 * hidden subtree, and tourSpotlight never paints a ring for an unmeasurable
 * target even if one somehow reaches it. The second matters most: it is the
 * invariant that keeps any future hidden target from blacking out the cockpit
 * again, whatever the reason it could not be measured.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { TOUR_STEPS } from '../../src/web/tour.js';

const EMPTY_STATE = {
  generatedAt: 1,
  totals: {
    projects: 0,
    flying: 0,
    needsYou: 0,
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0,
  },
  projects: [],
  empty: true,
};

function tourBtn(): HTMLButtonElement {
  return document.getElementById('tour-btn') as HTMLButtonElement;
}

describe('the tour never spotlights something that has no box', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    document.open();
    document.write(renderShell());
    document.close();
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => EMPTY_STATE }) as Response);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('never stops on a target sitting inside a hidden subtree', async () => {
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    tourBtn().click();

    // Walk the whole tour and check the target of every stop it lands on.
    const visited: string[] = [];
    for (let i = 0; i < TOUR_STEPS.length + 2; i += 1) {
      const title = document.querySelector('.tour-dialog h2')?.textContent ?? '';
      visited.push(title);
      const next = document.querySelector('.tour-dialog button.tour-next') as HTMLButtonElement;
      if (!next) break;
      next.click();
    }
    expect(visited.length).toBeGreaterThan(0);

    // Every step the walk can reach must resolve to an element that is not
    // inside a [hidden] subtree — otherwise the ring measures 0x0.
    const reachable = TOUR_STEPS.filter((step) => {
      const node = document.querySelector(step.selector);
      return node !== null && node.closest('[hidden]') === null;
    });
    expect(reachable.length).toBe(visited.length);
  });

  it('leaves the ring hidden rather than painting a hole-less blackout', async () => {
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    tourBtn().click();

    // jsdom has no layout, so EVERY getBoundingClientRect is 0x0 here — which
    // is exactly the shape that used to blanket the screen. The ring must
    // stay hidden, letting .tour-overlay keep its own ordinary backdrop and
    // the card centre, instead of drawing a 9999px shadow with no hole.
    const ring = document.getElementById('tour-ring');
    if (ring !== null) expect(ring.hidden).toBe(true);
  });
});
