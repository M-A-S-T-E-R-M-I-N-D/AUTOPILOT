// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The fleet landmark's own two text surfaces that were still raw English
 * `el()` text nodes (board web-msnsndki-dz3vn1; `pnpm i18n:untagged` listed
 * all three lines): the masthead's "flying now" chip-strip label
 * (`renderLiveWorkers()`), and the "No projects flying yet" empty state
 * `renderFleet()` builds when the fleet is empty — the very first thing a
 * fresh install shows.
 *
 * Three new keys: `liveWorkersLabel` (the strip's visible label — distinct
 * from the section's fuller `liveWorkers` aria-label, "Who's flying now"),
 * `fleetEmptyTitle` and `fleetEmptyHint`. The empty state's
 * `<code>pnpm dashboard:demo</code>` is a shell command, identical in every
 * locale, so it stays a plain literal on purpose.
 *
 * Both surfaces ride `renderFleet()`'s per-tick `translateDom()` sweep (the
 * strip is rebuilt every tick; the empty state is built once behind the
 * `fleetShowingEmpty` guard and then only swept) and the language toggle's
 * own document-wide sweep.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const HEBREW_LETTER = /\p{Script=Hebrew}/u;

const FLYING_PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: false,
  firings: 0,
  shipped: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: null,
  activity: [
    {
      tool: 'Bash',
      target: 'pnpm run test',
      kind: 'command',
      phase: 'gate',
      at: 1,
      firingId: 'f-p1',
    },
  ],
  flightLog: [],
  tasks: [],
};

function totals(projects: number, flying: number) {
  return { projects, flying, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 };
}

const FLYING_STATE = {
  generatedAt: 1,
  totals: totals(1, 1),
  projects: [FLYING_PROJECT],
  empty: false,
};

const EMPTY_STATE = {
  generatedAt: 1,
  totals: totals(0, 0),
  projects: [],
  empty: true,
};

async function boot(state: unknown): Promise<void> {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

describe('fleet landmark i18n — "flying now" strip label + empty state (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tags the "flying now" strip label with liveWorkersLabel', async () => {
    await boot(FLYING_STATE);

    const label = document.querySelector('#live-workers .live-workers-label');
    expect(label?.textContent).toBe('flying now');
    expect(label?.getAttribute('data-i18n')).toBe('liveWorkersLabel');
    expect(label?.textContent).toBe(STRINGS.en.liveWorkersLabel);
  });

  it('tags the empty-state heading and hint; the demo command stays a plain literal', async () => {
    await boot(EMPTY_STATE);

    const h2 = document.querySelector('#fleet .empty h2');
    expect(h2?.textContent).toBe('No projects flying yet');
    expect(h2?.getAttribute('data-i18n')).toBe('fleetEmptyTitle');
    const hint = document.querySelector('#fleet .empty p');
    expect(hint?.textContent).toBe(
      'Onboard a repo to watch it here. To see the dashboard populated now, run:',
    );
    expect(hint?.getAttribute('data-i18n')).toBe('fleetEmptyHint');
    const cmd = document.querySelector('#fleet .empty code');
    expect(cmd?.textContent).toBe('pnpm dashboard:demo');
    expect(cmd?.hasAttribute('data-i18n')).toBe(false);
  });

  it('switching to Hebrew translates the strip label', async () => {
    await boot(FLYING_STATE);
    switchToHebrew();

    const label = document.querySelector('#live-workers .live-workers-label');
    expect(label?.textContent).toBe(STRINGS.he.liveWorkersLabel);
  });

  it('switching to Hebrew translates the empty state and leaves the command alone', async () => {
    await boot(EMPTY_STATE);
    switchToHebrew();

    expect(document.querySelector('#fleet .empty h2')?.textContent).toBe(
      STRINGS.he.fleetEmptyTitle,
    );
    expect(document.querySelector('#fleet .empty p')?.textContent).toBe(STRINGS.he.fleetEmptyHint);
    expect(document.querySelector('#fleet .empty code')?.textContent).toBe('pnpm dashboard:demo');
  });

  it('an empty state that survives a tick unchanged still lands in the active locale', async () => {
    await boot(EMPTY_STATE);
    switchToHebrew();
    const before = document.querySelector('#fleet .empty h2');
    // The fleetShowingEmpty guard skips the rebuild on every later empty tick
    // (DOM identity survives) — the per-tick sweep must still leave it in
    // Hebrew rather than letting a stale English heading through.
    await vi.advanceTimersByTimeAsync(5000);

    const after = document.querySelector('#fleet .empty h2');
    expect(after).toBe(before);
    expect(after?.textContent).toBe(STRINGS.he.fleetEmptyTitle);
  });

  it('a page that boots in Hebrew paints the strip label and empty state in Hebrew from the first tick', async () => {
    localStorage.setItem('ap-locale', 'he');
    await boot(EMPTY_STATE);
    expect(document.querySelector('#fleet .empty h2')?.textContent).toBe(
      STRINGS.he.fleetEmptyTitle,
    );

    localStorage.setItem('ap-locale', 'he');
    await boot(FLYING_STATE);
    expect(document.querySelector('#live-workers .live-workers-label')?.textContent).toBe(
      STRINGS.he.liveWorkersLabel,
    );
  });

  it('keeps the Hebrew rows native — real Hebrew, not the English text', () => {
    for (const key of ['liveWorkersLabel', 'fleetEmptyTitle', 'fleetEmptyHint'] as const) {
      expect(STRINGS.he[key]).not.toBe(STRINGS.en[key]);
      expect(HEBREW_LETTER.test(STRINGS.he[key])).toBe(true);
    }
    // The hint ends with the colon that introduces the command line below it.
    expect(STRINGS.he.fleetEmptyHint.endsWith(':')).toBe(true);
  });
});
