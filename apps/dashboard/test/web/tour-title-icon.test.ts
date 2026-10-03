// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the guided tour's dialog
 * title. The Ask sheet leads with the `message-circle` its floating button
 * draws, and the browse-folder modal, the command palette and the report
 * dialog each head with a stroke icon, but every tour stop headed with bare
 * words beside its "Step N of M" counter. It leads with the `compass` the
 * overflow menu's Tour item draws now, so the dialog reads as that item's own.
 * No shape is newly vendored.
 *
 * The icon is decorative, so the name the dialog takes through
 * `aria-labelledby` stays the stop's words and its counter. `paintTour()`
 * rebuilds the title with `tr()` on every stop, so each stop and a Hebrew
 * page paint the same icon beside their own words.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [],
  empty: true,
};

async function bootAndOpen(locale?: 'he'): Promise<void> {
  document.open();
  document.write(renderShell());
  document.close();
  // Seeded as already-dismissed so only the Tour item opens the dialog.
  localStorage.setItem('ap-tour-seen', '1');
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
  if (locale)
    (document.querySelector('[data-lang-btn="' + locale + '"]') as HTMLButtonElement).click();
  (document.getElementById('tour-btn') as HTMLButtonElement).click();
}

function expectCompassTitle(): HTMLElement {
  const title = document.getElementById('tour-title') as HTMLElement;
  expect(title.tagName).toBe('H2');
  const icon = title.firstElementChild;
  expect(icon?.getAttribute('class')).toBe('icon icon-compass');
  expect(icon?.getAttribute('aria-hidden')).toBe('true');
  expect(icon?.querySelectorAll('path, circle').length).toBeGreaterThan(0);
  expect(title.querySelectorAll('svg')).toHaveLength(1);
  // The counter still trails the words, so the accessible name keeps it.
  expect(title.lastElementChild?.className).toBe('tour-step-count');
  return title;
}

describe('the guided tour dialog title (epic 0025 slice 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('leads with the compass the Tour item draws, decorative beside its words', async () => {
    await bootAndOpen();

    expect(document.querySelector('#tour-btn > svg')?.getAttribute('class')).toBe(
      'icon icon-compass',
    );
    const title = expectCompassTitle();
    const counter = title.querySelector('.tour-step-count')?.textContent ?? '';
    expect(title.textContent).toBe(STRINGS.en.tourLockOnTitle + counter);
    expect(document.querySelector('.tour-dialog')?.getAttribute('aria-labelledby')).toBe(
      'tour-title',
    );
  });

  it('keeps the icon on every stop the walk paints', async () => {
    await bootAndOpen();

    let stops = 0;
    for (let i = 0; i < 20; i++) {
      expectCompassTitle();
      stops++;
      const next = document.querySelector(
        '.tour-dialog button.tour-next',
      ) as HTMLButtonElement | null;
      if (!next) break;
      next.click();
    }
    expect(stops).toBeGreaterThan(1);
    expect(document.getElementById('tour-title')?.textContent).toContain(
      STRINGS.en.tourReportTitle,
    );
  });

  it('paints Hebrew words beside the same icon', async () => {
    await bootAndOpen('he');

    const title = expectCompassTitle();
    const counter = title.querySelector('.tour-step-count')?.textContent ?? '';
    expect(title.textContent).toBe(STRINGS.he.tourLockOnTitle + counter);
  });
});
