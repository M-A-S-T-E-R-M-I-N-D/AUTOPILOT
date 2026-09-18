// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Operator-reported 2026-09-18, two reports on the guided walk:
 *
 * 1. "The panel with Next and Skip sits behind the dim — it looks dimmed and
 *    dark and cannot be used." `.tour-overlay` is `position: fixed` with a
 *    z-index, i.e. a stacking context of its own; the card inside it carried
 *    `z-index: 52`, but the ring that paints the dim (a 9999px box-shadow)
 *    was a BODY SIBLING at 51 — and 51 outside the overlay beats anything
 *    inside it. The ring now lives inside the overlay, where 51 < 52 means
 *    what it says.
 *
 * 2. "Random elements get marked — the look and the sizes changed." Two
 *    causes, both measurement-timing: the page sets `scroll-behavior:
 *    smooth`, so a default `scrollIntoView` animates and the rect measured
 *    on the next line is the PRE-scroll one; and a ring measured once never
 *    followed a resize or a scroll. The walk now scrolls instantly and
 *    re-measures on both events, without rebuilding the card.
 *
 * 3. A stop inside a closed <details> popover (the "more" menu holds
 *    #report-btn) has no box until the popover opens. The walk opens it for
 *    the stop and gives it back when it leaves.
 *
 * And the census: every stop's selector must name a control the shell
 * actually renders — a stop pointing at nothing reads as a bug.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';
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

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** jsdom has no layout: every rect is 0x0 unless a test says otherwise. */
function measureEverythingAs(box: Box): void {
  Element.prototype.getBoundingClientRect = () =>
    ({
      x: box.x,
      y: box.y,
      left: box.x,
      top: box.y,
      width: box.w,
      height: box.h,
      right: box.x + box.w,
      bottom: box.y + box.h,
      toJSON: () => ({}),
    }) as DOMRect;
}

const nativeRect = Element.prototype.getBoundingClientRect;

function boot(): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => EMPTY_STATE }) as Response);
  new Function(clientJs())();
}

function tourBtn(): HTMLButtonElement {
  return document.getElementById('tour-btn') as HTMLButtonElement;
}

function overlay(): HTMLElement {
  return document.querySelector('.tour-overlay') as HTMLElement;
}

function ring(): HTMLElement {
  return document.getElementById('tour-ring') as HTMLElement;
}

function currentStepIndex(): number {
  const dots = Array.from(document.querySelectorAll('.tour-dot'));
  return dots.findIndex((dot) => dot.getAttribute('aria-current') === 'true');
}

describe('the tour card sits above the dim (report 1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = nativeRect;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('CSS: the ring is ordered below the card, and the overlay yields its backdrop to a CHILD ring', () => {
    const css = layoutCss();
    const zOf = (rule: string): number => {
      const start = css.indexOf(rule);
      expect(start, rule).toBeGreaterThan(-1);
      const block = css.slice(start, css.indexOf('}', start));
      const m = /z-index:\s*(\d+)/.exec(block);
      expect(m, `${rule} carries a z-index`).not.toBeNull();
      return Number(m![1]);
    };
    expect(zOf('.tour-ring {')).toBeLessThan(zOf('.tour-dialog { z-index'));
    // `>` (child), not `~` (sibling): the rule that clears the overlay's own
    // backdrop must see the ring where it now lives.
    expect(css).toContain(
      '.tour-overlay:has(> .tour-ring:not([hidden])) { background: transparent; }',
    );
    expect(css).not.toContain('.tour-overlay:has(~ .tour-ring');
  });

  it('DOM: the ring is appended INSIDE the overlay, never as a body sibling of it', async () => {
    measureEverythingAs({ x: 10, y: 20, w: 100, h: 40 });
    boot();
    await vi.advanceTimersByTimeAsync(1);

    tourBtn().click();

    expect(ring()).not.toBeNull();
    expect(ring().hidden).toBe(false);
    expect(ring().parentElement).toBe(overlay());
    expect(ring().style.transform).toBe('translate(10px, 20px)');
    // The card is a sibling of the ring under the same parent — the ONE
    // stacking context where 51 < 52 is decisive.
    expect(document.querySelector('.tour-dialog')?.parentElement).toBe(overlay());
  });

  it('stepping keeps the same ring node — only the card is rebuilt', async () => {
    measureEverythingAs({ x: 10, y: 20, w: 100, h: 40 });
    boot();
    await vi.advanceTimersByTimeAsync(1);
    tourBtn().click();
    const before = ring();

    (document.querySelector('.tour-dialog button.tour-next') as HTMLButtonElement).click();

    expect(ring()).toBe(before);
    expect(overlay().querySelectorAll('.tour-dialog')).toHaveLength(1);
  });
});

describe('the ring follows the page (report 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = nativeRect;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('scrolls the target into view INSTANTLY, so the rect measured right after is the post-scroll one', async () => {
    measureEverythingAs({ x: 10, y: 20, w: 100, h: 40 });
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    boot();
    await vi.advanceTimersByTimeAsync(1);

    tourBtn().click();

    expect(scrolled).toHaveBeenCalled();
    const options = scrolled.mock.calls[0]![0] as ScrollIntoViewOptions;
    expect(options.behavior).toBe('instant');
    expect(options.block).toBe('center');
  });

  it('re-measures on resize and on scroll without rebuilding the card, and without scrolling the reader back', async () => {
    measureEverythingAs({ x: 10, y: 20, w: 100, h: 40 });
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    boot();
    await vi.advanceTimersByTimeAsync(1);
    tourBtn().click();
    const card = document.querySelector('.tour-dialog');
    const scrollsDuringOpen = scrolled.mock.calls.length;

    measureEverythingAs({ x: 300, y: 400, w: 100, h: 40 });
    window.dispatchEvent(new Event('resize'));
    await vi.advanceTimersByTimeAsync(50);
    expect(ring().style.transform).toBe('translate(300px, 400px)');
    expect(document.querySelector('.tour-dialog')).toBe(card);

    measureEverythingAs({ x: 5, y: 6, w: 100, h: 40 });
    window.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(50);
    expect(ring().style.transform).toBe('translate(5px, 6px)');
    // A reflow is a re-measure, never a scrollIntoView: that would fight
    // the reader's own scrolling and loop on its own scroll event.
    expect(scrolled.mock.calls.length).toBe(scrollsDuringOpen);
  });

  it('does nothing on resize once the tour is closed', async () => {
    measureEverythingAs({ x: 10, y: 20, w: 100, h: 40 });
    boot();
    await vi.advanceTimersByTimeAsync(1);
    tourBtn().click();
    (document.querySelector('.tour-dialog button') as HTMLButtonElement).click(); // Skip

    measureEverythingAs({ x: 300, y: 400, w: 100, h: 40 });
    window.dispatchEvent(new Event('resize'));
    await vi.advanceTimersByTimeAsync(50);

    expect(document.querySelector('.tour-dialog')).toBeNull();
    expect(document.getElementById('tour-ring')).toBeNull();
  });
});

describe('a stop inside a closed popover (report 3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = nativeRect;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens the "more" menu for the report-from-here stop and closes it again when the walk leaves', async () => {
    measureEverythingAs({ x: 10, y: 20, w: 100, h: 40 });
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const more = document.getElementById('more-menu') as HTMLDetailsElement;
    const reportStep = TOUR_STEPS.findIndex((step) => step.selector === '#report-btn');
    expect(reportStep).toBeGreaterThan(-1);
    expect(more.open).toBe(false);

    tourBtn().click();
    for (
      let guard = 0;
      guard < TOUR_STEPS.length && currentStepIndex() !== reportStep;
      guard += 1
    ) {
      (document.querySelector('.tour-dialog button.tour-next') as HTMLButtonElement).click();
    }
    expect(currentStepIndex()).toBe(reportStep);
    expect(more.open).toBe(true);

    (document.querySelector('.tour-dialog button') as HTMLButtonElement).click(); // Skip / Close
    expect(more.open).toBe(false);
  });
});

describe('every tour stop points at a control the shell renders (the census)', () => {
  it('each selector resolves in the server-rendered fleet page or project page', () => {
    const pages = [renderShell(), renderShell('p1')];
    for (const step of TOUR_STEPS) {
      const found = pages.some((html) => {
        document.open();
        document.write(html);
        document.close();
        return document.querySelector(step.selector) !== null;
      });
      expect(found, `${step.selector} (${step.title})`).toBe(true);
    }
  });
});
