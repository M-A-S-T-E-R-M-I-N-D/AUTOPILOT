// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The flight log's "Load older firings" button (board web-msnsndki-dz3vn1,
 * the slice after the GitHub-sync controls): its label, its "Loading…" busy
 * label, and the tip that doubles as its accessible name — `shell.ts`'s
 * flight-log section. All three were plain literals: `textContent` and
 * `setAttribute` calls, invisible to `pnpm i18n:untagged`, stuck in English
 * under the Hebrew locale.
 *
 * The button is rebuilt from state on every re-render (the section's
 * signature includes the per-project loading flag), so the render paints
 * whichever of the idle/busy keys matches the state via tr() AND tags the
 * element with that same key: `renderFleet()` runs a document-wide
 * `translateDom()` sweep on every fleet tick, and a fixed idle tag would
 * repaint "Load older firings" over "Loading…" mid-request. The tip is tagged
 * twice — `data-i18n-tip` for the tooltip, `data-i18n-aria` for the
 * accessible name — because it IS both.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const HEBREW_LETTER = /\p{Script=Hebrew}/u;

function firing(id: string, at: number) {
  return {
    id,
    item: 'web-abc123',
    kind: 'fix',
    sha: null,
    shipped: true,
    gateResult: null,
    cost: 0.01,
    tokensIn: 10,
    tokensOut: 5,
    turns: 2,
    commitSubject: 'fix: ' + id,
    at,
  };
}

const INITIAL_LOG = Array.from({ length: 10 }, (_, i) => firing('f' + (10 - i), 10 - i));

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 1,
  totalBytes: 10,
  languages: [],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: true,
  firings: 12,
  shipped: 12,
  cost: 0.1,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 10,
  flightLog: INITIAL_LOG,
  flightLogHasMore: true,
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 1,
    needsYou: 0,
    firings: 12,
    shipped: 12,
    openFindings: 0,
    cost: 0.1,
  },
  projects: [PROJECT],
  empty: false,
};

/** Boot the project page and reveal the button behind "Show all". */
async function bootRevealed(): Promise<void> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  ) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
  (document.querySelector('[data-flightlog-all="p1"]') as HTMLButtonElement).click();
  await vi.advanceTimersByTimeAsync(10);
}

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

/** Route the older-page endpoint to a stub; everything else keeps serving the fleet state. */
function stubOlderPage(respond: () => Promise<Response>): void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (u: string, init?: RequestInit) => {
    if (String(u).startsWith('/api/firings')) return respond();
    return realFetch(u, init);
  }) as unknown as typeof fetch;
}

function loadMoreButton(): HTMLButtonElement {
  return document.querySelector('[data-flightlog-more="p1"]') as HTMLButtonElement;
}

describe('flight log "Load older firings" button i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Deliberately the FIRST test that boots the shell: every boot registers
  // another delegated click listener on the shared jsdom document, and with
  // several listeners a single click would fire several requests — only the
  // last of which the stub below can resolve.
  it('paints the busy label with the busy key mid-request, so a sweep repaints "Loading…" and not the idle label', async () => {
    await bootRevealed();
    let finish: (r: Response) => void = () => {};
    stubOlderPage(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );

    loadMoreButton().click();
    await vi.advanceTimersByTimeAsync(10);

    const busy = loadMoreButton();
    expect(busy.disabled).toBe(true);
    expect(busy.textContent).toBe('Loading…');
    expect(busy.textContent).toBe(STRINGS.en.flightLogLoadMoreLoading);
    expect(busy.getAttribute('data-i18n')).toBe('flightLogLoadMoreLoading');

    // The language toggle runs the same document-wide translateDom() sweep a
    // fleet tick does — it must repaint the BUSY label, not the idle one.
    switchToHebrew();
    expect(loadMoreButton()).toBe(busy);
    expect(busy.textContent).toBe(STRINGS.he.flightLogLoadMoreLoading);
    expect(busy.textContent).not.toBe(STRINGS.he.flightLogLoadMore);

    finish({
      ok: true,
      json: async () => ({ entries: [firing('f0', 0)], hasMore: true }),
    } as unknown as Response);
    await vi.waitFor(() => expect(loadMoreButton().disabled).toBe(false));
    // Rebuilt on completion, in the locale active THEN — Hebrew.
    expect(loadMoreButton().textContent).toBe(STRINGS.he.flightLogLoadMore);
    expect(loadMoreButton().getAttribute('data-i18n')).toBe('flightLogLoadMore');
  });

  it('tags the label, tip, and accessible name and paints them in English by default', async () => {
    await bootRevealed();
    const btn = loadMoreButton();

    expect(btn.textContent).toBe('Load older firings');
    expect(btn.textContent).toBe(STRINGS.en.flightLogLoadMore);
    expect(btn.getAttribute('data-i18n')).toBe('flightLogLoadMore');
    expect(btn.getAttribute('data-tip')).toBe(
      'Fetch firings older than what the browser already holds — a real server round-trip, not a local reveal',
    );
    expect(btn.getAttribute('data-tip')).toBe(STRINGS.en.flightLogLoadMoreTip);
    expect(btn.getAttribute('data-i18n-tip')).toBe('flightLogLoadMoreTip');
    // The tip IS the accessible name — both tagged from the one key.
    expect(btn.getAttribute('aria-label')).toBe(STRINGS.en.flightLogLoadMoreTip);
    expect(btn.getAttribute('data-i18n-aria')).toBe('flightLogLoadMoreTip');
  });

  it('switching to Hebrew translates the label, tip, and accessible name in place', async () => {
    await bootRevealed();
    const btn = loadMoreButton();

    switchToHebrew();

    expect(loadMoreButton()).toBe(btn);
    expect(btn.textContent).toBe(STRINGS.he.flightLogLoadMore);
    expect(btn.getAttribute('data-tip')).toBe(STRINGS.he.flightLogLoadMoreTip);
    expect(btn.getAttribute('aria-label')).toBe(STRINGS.he.flightLogLoadMoreTip);
  });

  it('a page that boots in Hebrew paints the button in Hebrew at birth', async () => {
    localStorage.setItem('ap-locale', 'he');
    await bootRevealed();
    const btn = loadMoreButton();

    expect(btn.textContent).toBe(STRINGS.he.flightLogLoadMore);
    expect(btn.getAttribute('data-tip')).toBe(STRINGS.he.flightLogLoadMoreTip);
    expect(btn.getAttribute('aria-label')).toBe(STRINGS.he.flightLogLoadMoreTip);
  });

  it('keeps the Hebrew rows native — real Hebrew, not the English text', () => {
    for (const key of [
      'flightLogLoadMore',
      'flightLogLoadMoreLoading',
      'flightLogLoadMoreTip',
    ] as const) {
      expect(STRINGS.he[key]).not.toBe(STRINGS.en[key]);
      expect(HEBREW_LETTER.test(STRINGS.he[key])).toBe(true);
    }
    // The busy label keeps its ellipsis in every locale, the way "Syncing…" does.
    expect(STRINGS.he.flightLogLoadMoreLoading.endsWith('…')).toBe(true);
  });

  it('paints all three via tr(), with none of the old literals left in the assembled bundle', () => {
    const js = clientJs();
    expect(js).toContain("tr('flightLogLoadMoreTip')");
    // Pin the old single-quoted JS literals, not the bare sentences: the
    // English STRINGS table itself ships in this bundle as JSON (double
    // quotes).
    expect(js).not.toContain("'Load older firings'");
    expect(js).not.toContain("'Loading…' : 'Load older firings'");
    expect(js).not.toContain(
      "'Fetch firings older than what the browser already holds — a real server round-trip, not a local reveal'",
    );
  });
});
