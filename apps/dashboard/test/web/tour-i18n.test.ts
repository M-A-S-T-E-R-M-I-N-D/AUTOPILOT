// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The first-run guided tour (`web/features/tour.ts`'s `paintTour()`) builds
 * its dialog imperatively on every open/step change — no persistent DOM node
 * a `[data-i18n]` sweep could reach — so it needs its own boot-and-click
 * coverage proving the Hebrew locale actually reaches its text, the same gap
 * `github-sync-confirm.test.ts` closed for the sync confirm dialog (board
 * web-msnsndki-dz3vn1).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const STATE = {
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

function boot(): void {
  document.open();
  document.write(renderShell());
  document.close();
  // Seed as already-dismissed so these tests exercise the manual "Tour"
  // button, independent of the auto-open-on-empty-fleet behavior.
  localStorage.setItem('ap-tour-seen', '1');
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

function openTour(): void {
  (document.getElementById('tour-btn') as HTMLButtonElement).click();
}

describe('guided tour dialog i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the first step in Hebrew, with Skip/Next chrome translated', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    switchToHebrew();
    openTour();

    const dialog = document.querySelector('.tour-dialog');
    expect(dialog).not.toBeNull();
    expect(document.getElementById('tour-title')?.textContent).toBe(STRINGS.he.tourFiringTitle);
    expect(dialog!.querySelector('p')?.textContent).toBe(STRINGS.he.tourFiringBody);

    const buttons = Array.from(dialog!.querySelectorAll('button')).map((b) => b.textContent);
    expect(buttons).toContain(STRINGS.he.tourSkip);
    expect(buttons).toContain(STRINGS.he.tourNext);
    // First step: no Back button yet.
    expect(buttons).not.toContain(STRINGS.he.tourBack);
  });

  it('renders Back/Close chrome in Hebrew on the last step', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    switchToHebrew();
    openTour();
    for (let i = 0; i < 3; i++) {
      (document.querySelector('.tour-dialog button.tour-next') as HTMLButtonElement).click();
    }

    expect(document.getElementById('tour-title')?.textContent).toBe(STRINGS.he.tourFlightTitle);
    const buttons = Array.from(document.querySelectorAll('.tour-dialog button')).map(
      (b) => b.textContent,
    );
    expect(buttons).toContain(STRINGS.he.tourBack);
    expect(buttons).toContain(STRINGS.he.tourClose);
    expect(buttons).not.toContain(STRINGS.he.tourNext);
  });

  it('translates the Skip/Back/Next hover tips (data-tip), not just the visible labels', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    switchToHebrew();
    openTour();
    (document.querySelector('.tour-dialog button.tour-next') as HTMLButtonElement).click();

    const dialog = document.querySelector('.tour-dialog')!;
    const back = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === STRINGS.he.tourBack,
    );
    expect(back?.getAttribute('data-tip')).toBe(STRINGS.he.tourBackTip);
    const skip = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === STRINGS.he.tourSkip,
    );
    expect(skip?.getAttribute('data-tip')).toBe(STRINGS.he.tourSkipTipMid);
  });

  it('still renders the default English text with no locale switch', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    openTour();

    expect(document.getElementById('tour-title')?.textContent).toBe(STRINGS.en.tourFiringTitle);
    const buttons = Array.from(document.querySelectorAll('.tour-dialog button')).map(
      (b) => b.textContent,
    );
    expect(buttons).toContain(STRINGS.en.tourSkip);
    expect(buttons).toContain(STRINGS.en.tourNext);
  });
});
