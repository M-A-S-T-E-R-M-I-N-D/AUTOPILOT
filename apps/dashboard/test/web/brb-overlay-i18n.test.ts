// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The BE-RIGHT-BACK reconnect overlay's two text nodes (board
 * web-msnsndki-dz3vn1; `pnpm i18n:untagged` listed both lines): the
 * full-screen card `setBrbVisible()` builds once `refresh()` has failed
 * `BRB_FAIL_THRESHOLD` polls in a row (BOARD web-msqgho43-yeqne3) — the one
 * surface a reader sees precisely when nothing else on the page can repaint.
 *
 * Two new keys: `brbTitle` ("Be right back") and `brbSub`. The card is built
 * lazily, exactly once, then only toggled via `hidden`, so it cannot ride
 * `renderFleet()`'s per-tick `translateDom()` sweep (no tick succeeds while
 * it shows). It paints via `tr()` in the locale active at birth and is kept
 * current by the language toggle's document-wide sweep — which reaches
 * hidden nodes too, so a card hidden by a heal and re-shown after a locale
 * switch comes back in the new locale, not the one it was born in.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { BRB_FAIL_THRESHOLD } from '../../src/web/be-right-back.js';

const HEBREW_LETTER = /\p{Script=Hebrew}/u;

/** `shell.ts`'s `REFRESH_MS` — the no-SSE polling fallback jsdom takes (it
 *  has no `EventSource`). Not exported, so pinned here; one poll per tick. */
const POLL_MS = 3000;

const EMPTY_STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [],
  empty: true,
};

/** A `/api/state` mock with a flippable link: `online` answers with an empty
 *  fleet, offline rejects the way a dead server does. */
function linkedFetch(link: { online: boolean }): typeof fetch {
  return vi.fn(async () => {
    if (!link.online) throw new Error('connection refused');
    return { ok: true, json: async () => EMPTY_STATE } as unknown as Response;
  }) as unknown as typeof fetch;
}

async function boot(link: { online: boolean }): Promise<void> {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = linkedFetch(link);
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

/** Let enough polls fail (or succeed) to cross the overlay threshold. */
async function polls(n: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(POLL_MS * n + 1);
}

/** Boot straight into a sustained outage: the first paint fails and the
 *  fallback polls keep failing until the overlay threshold is met. */
async function bootOffline(): Promise<void> {
  await boot({ online: false });
  await polls(BRB_FAIL_THRESHOLD);
}

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

function overlay(): HTMLElement | null {
  return document.querySelector('.brb-overlay');
}

describe('be-right-back overlay i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tags the title and subtitle and paints them in English by default', async () => {
    await bootOffline();

    const card = overlay();
    expect(card).not.toBeNull();
    expect(card?.hidden).toBe(false);
    const title = card?.querySelector('.brb-title');
    expect(title?.textContent).toBe('Be right back');
    expect(title?.getAttribute('data-i18n')).toBe('brbTitle');
    expect(title?.textContent).toBe(STRINGS.en.brbTitle);
    const sub = card?.querySelector('.brb-sub');
    expect(sub?.textContent).toBe('Building something cool while we reconnect…');
    expect(sub?.getAttribute('data-i18n')).toBe('brbSub');
    expect(sub?.textContent).toBe(STRINGS.en.brbSub);
  });

  it('switching to Hebrew while the overlay shows translates it in place', async () => {
    await bootOffline();
    const before = overlay()?.querySelector('.brb-title');
    switchToHebrew();

    const after = overlay()?.querySelector('.brb-title');
    expect(after).toBe(before);
    expect(after?.textContent).toBe(STRINGS.he.brbTitle);
    expect(overlay()?.querySelector('.brb-sub')?.textContent).toBe(STRINGS.he.brbSub);
  });

  it('a page that boots in Hebrew paints the overlay in Hebrew the moment it appears', async () => {
    localStorage.setItem('ap-locale', 'he');
    await bootOffline();

    expect(overlay()?.querySelector('.brb-title')?.textContent).toBe(STRINGS.he.brbTitle);
    expect(overlay()?.querySelector('.brb-sub')?.textContent).toBe(STRINGS.he.brbSub);
  });

  it('a card hidden by a heal and re-shown after a locale switch comes back in the new locale', async () => {
    const link = { online: false };
    await boot(link);
    await polls(BRB_FAIL_THRESHOLD);
    const born = overlay();
    expect(born?.hidden).toBe(false);

    // Heal: one good poll hides the card (it is kept, not destroyed).
    link.online = true;
    await polls(1);
    expect(overlay()).toBe(born);
    expect(born?.hidden).toBe(true);

    // The reader switches language while nothing is wrong…
    switchToHebrew();

    // …then the link drops again: the SAME card returns, now in Hebrew.
    link.online = false;
    await polls(BRB_FAIL_THRESHOLD);
    expect(overlay()).toBe(born);
    expect(born?.hidden).toBe(false);
    expect(born?.querySelector('.brb-title')?.textContent).toBe(STRINGS.he.brbTitle);
    expect(born?.querySelector('.brb-sub')?.textContent).toBe(STRINGS.he.brbSub);
  });

  it('keeps the Hebrew rows native — real Hebrew, not the English text', () => {
    for (const key of ['brbTitle', 'brbSub'] as const) {
      expect(STRINGS.he[key]).not.toBe(STRINGS.en[key]);
      expect(HEBREW_LETTER.test(STRINGS.he[key])).toBe(true);
    }
    // The subtitle keeps its trailing ellipsis: the card is a waiting state.
    expect(STRINGS.he.brbSub.endsWith('…')).toBe(true);
  });
});
