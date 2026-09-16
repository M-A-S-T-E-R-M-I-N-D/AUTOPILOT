// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The masthead "Tour" button opens a dismissible, keyboard-accessible dialog
 * walking through AUTOPILOT's core vocabulary (firing/slice/gate/flight). It
 * also auto-opens once for a genuinely fresh profile — an empty fleet that has
 * never dismissed it (see shell.ts's maybeAutoOpenTour) — gated on the empty
 * fleet rather than only the localStorage flag so a returning user who cleared
 * storage but still has projects flying never gets it shoved in front of them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

function state(empty = true) {
  return {
    generatedAt: 1,
    totals: {
      projects: empty ? 0 : 1,
      flying: empty ? 0 : 1,
      needsYou: 0,
      firings: 0,
      shipped: 0,
      openFindings: 0,
      cost: 0,
    },
    projects: [],
    empty,
  };
}

function tourBtn(): HTMLButtonElement {
  return document.getElementById('tour-btn') as HTMLButtonElement;
}

function mockFleet(fetchState: ReturnType<typeof state>): void {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => fetchState,
  })) as unknown as typeof fetch;
}

/** The stop's title, without the "Step N of M" counter the heading also
 *  carries — an aria-modal dialog hides outside live regions, so the count
 *  belongs in the accessible name rather than a live region (WCAG 4.1.3). */
function stopTitle(): string {
  const h = document.getElementById('tour-title');
  if (!h) return '';
  const counter = h.querySelector('.tour-step-count');
  return (h.textContent ?? '').replace(counter?.textContent ?? '', '').trim();
}

describe('first-run guided tour — auto-open', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    document.open();
    document.write(renderShell());
    document.close();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens automatically the first time the fleet loads empty', async () => {
    mockFleet(state(true));
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.tour-dialog')).not.toBeNull();
    // NOT "Lock on a folder": at this instant #flightbar still carries its
    // server-rendered `hidden` — only the onboarding "lock on" micro-task
    // (obLockOn) drops it — so the Fly bar is not on screen. The walk starts
    // at the checklist that IS on screen, and which is what reveals the Fly
    // bar. Stopping on the hidden input instead measured a 0x0 spotlight ring
    // and dimmed the whole cockpit (operator-reported 2026-09-17).
    expect(stopTitle()).toBe('Your progress');
  });

  it('does not auto-open once the tour has already been dismissed', async () => {
    localStorage.setItem('ap-tour-seen', '1');
    mockFleet(state(true));
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.tour-dialog')).toBeNull();
  });

  it('does not auto-open when the fleet already has projects', async () => {
    mockFleet(state(false));
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.tour-dialog')).toBeNull();
  });
});

describe('first-run guided tour — manual open', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    // Seed as already-dismissed so these tests exercise the manual "Tour"
    // button in isolation, independent of the auto-open behavior above.
    localStorage.setItem('ap-tour-seen', '1');
    document.open();
    document.write(renderShell());
    document.close();
    mockFleet(state(true));
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1); // flush the immediate first paint
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not appear until the Tour button is clicked', () => {
    expect(document.querySelector('.tour-dialog')).toBeNull();
  });

  it('opens on click with the first step focused, and steps through Next/Back', () => {
    tourBtn().click();

    let dialog = document.querySelector('.tour-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute('role')).toBe('dialog');
    expect(dialog!.getAttribute('aria-modal')).toBe('true');
    expect(stopTitle()).toBe('Lock on a folder');
    // First step: no Back button, focus lands on Next (the last focusable).
    expect(dialog!.querySelector('button.tour-next')).not.toBeNull();
    expect(document.activeElement?.textContent).toBe('Next');

    (dialog!.querySelector('button.tour-next') as HTMLButtonElement).click();
    dialog = document.querySelector('.tour-dialog');
    expect(stopTitle()).toBe('Let it size the flight');

    const back = Array.from(dialog!.querySelectorAll('button')).find(
      (b) => b.textContent === 'Back',
    );
    expect(back).toBeDefined();
    back!.click();
    expect(stopTitle()).toBe('Lock on a folder');
  });

  it('walks every stop in order and swaps Next for Close on the last', () => {
    tourBtn().click();
    const titles: string[] = [];
    for (let i = 0; i < 20; i++) {
      const next = document.querySelector(
        '.tour-dialog button.tour-next',
      ) as HTMLButtonElement | null;
      titles.push(stopTitle());
      if (!next) break;
      next.click();
    }
    // "Search the code" is absent by design: #search-q lives inside the
    // #searchbar section, which syncSearchProjects only un-hides once the
    // fleet has projects — and this fixture's fleet is empty. A stop whose
    // target has no box on this page is stepped over rather than spotlighted
    // with a 0x0 ring (operator-reported 2026-09-17).
    expect(titles).toEqual([
      'Lock on a folder',
      'Let it size the flight',
      'Fire',
      'Your progress',
      'The fleet',
      'Ask about this page',
      'Connections',
      'Report from here',
    ]);
    expect(document.querySelector('.tour-dialog button.tour-next')).toBeNull();
    const buttons = Array.from(document.querySelectorAll('.tour-dialog button')).map(
      (b) => b.textContent,
    );
    expect(buttons).toContain('Close');
  });

  it('closes on Escape, marks the tour seen, and restores focus to the Tour button', () => {
    tourBtn().focus();
    tourBtn().click();
    expect(document.querySelector('.tour-dialog')).not.toBeNull();

    document
      .querySelector('.tour-overlay')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );

    expect(document.querySelector('.tour-dialog')).toBeNull();
    expect(localStorage.getItem('ap-tour-seen')).toBe('1');
    expect(document.activeElement).toBe(tourBtn());
  });

  it('traps Tab focus within the dialog (wraps from last back to first)', () => {
    tourBtn().click();
    const dialog = document.querySelector('.tour-dialog')!;
    const buttons = Array.from(dialog.querySelectorAll('button')) as HTMLButtonElement[];
    const last = buttons[buttons.length - 1]!;
    const first = buttons[0]!;
    last.focus();

    document
      .querySelector('.tour-overlay')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));

    expect(document.activeElement).toBe(first);
  });

  it('can be reopened after being dismissed', () => {
    tourBtn().click();
    document
      .querySelector('.tour-overlay')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    expect(document.querySelector('.tour-dialog')).toBeNull();

    tourBtn().click();
    expect(document.querySelector('.tour-dialog')).not.toBeNull();
    expect(stopTitle()).toBe('Lock on a folder');
  });

  it('the stylesheet actually hides a [hidden] overlay — the closed tour must not keep dimming the page', () => {
    // Field report (2026-08-14): completing the tour set `hidden` and cleared
    // the dialog, but `.tour-overlay { display: flex }` beats the hidden
    // attribute's UA default, so the full-screen backdrop stayed and the whole
    // page kept dimming. jsdom does not compute the real cascade, so this pins
    // the rule at the stylesheet level — removing it is a visible regression.
    expect(layoutCss()).toContain('.tour-overlay[hidden] { display: none; }');
  });
});
