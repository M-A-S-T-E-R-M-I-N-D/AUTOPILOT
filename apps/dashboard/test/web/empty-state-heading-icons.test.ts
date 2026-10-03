// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the two empty-state
 * headings. The fleet page's "No projects flying yet" is the first thing a
 * fresh install shows, and a stale project link lands on "Project not found";
 * both headed with bare words while every dialog title and panel heading
 * beside them leads with a stroke icon.
 *
 * The empty fleet leads with the `layout-grid` the rail's Fleet link draws,
 * the grid of cards with none in it yet, so the heading reads as that place's
 * own. "Project not found" leads with a newly vendored `search-x`, Lucide's
 * no-results shape. Each icon is decorative, so the heading's text stays the
 * words alone, and `setSweptText()` keeps the icon across a locale switch and
 * every later tick's sweep.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const EMPTY_STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [],
  empty: true,
};

async function boot(project?: string): Promise<void> {
  document.open();
  document.write(renderShell(project));
  document.close();
  localStorage.setItem('ap-tour-seen', '1');
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => EMPTY_STATE }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

function expectIconHeading(name: string, key: string): HTMLElement {
  const heading = document.querySelector('#fleet .empty h2') as HTMLElement;
  expect(heading).not.toBeNull();
  expect(heading.getAttribute('data-i18n')).toBe(key);
  const icon = heading.firstElementChild;
  expect(icon?.getAttribute('class')).toBe('icon icon-' + name);
  expect(icon?.getAttribute('aria-hidden')).toBe('true');
  expect(icon?.querySelectorAll('path, circle, rect').length).toBeGreaterThan(0);
  expect(heading.querySelectorAll('svg')).toHaveLength(1);
  return heading;
}

describe('the empty-state headings (epic 0025 slice 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('the empty fleet leads with the layout-grid the rail’s Fleet link draws', async () => {
    await boot();

    expect(
      document
        .querySelector('#subject-nav a[data-subject-link="fleet"] > svg')
        ?.getAttribute('class'),
    ).toBe('icon icon-layout-grid');
    const heading = expectIconHeading('layout-grid', 'fleetEmptyTitle');
    expect(heading.textContent).toBe(STRINGS.en.fleetEmptyTitle);
  });

  it('keeps the empty fleet’s icon through a Hebrew switch and a later tick', async () => {
    await boot();
    switchToHebrew();

    expect(expectIconHeading('layout-grid', 'fleetEmptyTitle').textContent).toBe(
      STRINGS.he.fleetEmptyTitle,
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(expectIconHeading('layout-grid', 'fleetEmptyTitle').textContent).toBe(
      STRINGS.he.fleetEmptyTitle,
    );
  });

  it('"Project not found" leads with the search-x no-results shape', async () => {
    await boot('missing-project');

    const heading = expectIconHeading('search-x', 'projectNotFound');
    expect(heading.textContent).toBe(STRINGS.en.projectNotFound);
  });

  it('keeps the not-found icon beside Hebrew words, tick after tick', async () => {
    await boot('missing-project');
    switchToHebrew();

    expect(expectIconHeading('search-x', 'projectNotFound').textContent).toBe(
      STRINGS.he.projectNotFound,
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(expectIconHeading('search-x', 'projectNotFound').textContent).toBe(
      STRINGS.he.projectNotFound,
    );
  });
});
