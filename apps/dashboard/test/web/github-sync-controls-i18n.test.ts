// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's two GitHub-sync controls (board web-msnsndki-dz3vn1,
 * the follow-up the settings-hints slice named): the "Sync to GitHub"
 * button's label and its opt-in "Make public instead (visible to everyone)"
 * checkbox text — `shell.ts`'s `renderProjectPage()`. Both were built with
 * `textContent`/`createTextNode` calls, invisible to `pnpm i18n:untagged`.
 *
 * The button is not a plain tag-and-forget: its click handler swaps the
 * label to `githubSyncing` for the request's duration, and `renderFleet()`
 * runs a document-wide `translateDom()` sweep on every fleet tick — a
 * `data-i18n="githubSync"` tag left in place would repaint the idle label
 * over "Syncing…" mid-request. So the handler swaps the TAG to the busy key
 * along with the text (a sweep or a language flip mid-request repaints the
 * busy label, in the current locale) and restores the idle key on completion,
 * painting it in whatever locale is active then rather than the text it
 * captured at click time.
 *
 * The checkbox text sits in its own tagged `<span>` rather than tagging the
 * `<label>`: `translateDom()` writes `textContent`, which on the label itself
 * would wipe the checkbox out along with the words.
 *
 * Epic 0025 (board web-mtywp7zq-55f3o9): the button led with a ⇪ baked into
 * its STRINGS label as an icon; it leads with the vendored cloud-upload stroke
 * now, so every label write (busy, idle, sweep) must keep that icon.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

const HEBREW_LETTER = /\p{Script=Hebrew}/u;

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
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
  lastActivityAt: 1,
  activity: [],
  flightLog: [],
  tasks: [],
  anomalies: [],
  soulReviewed: true,
  soulProposed: null,
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0,
  },
  projects: [PROJECT],
  empty: false,
};

async function boot(): Promise<void> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  ) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

/** Route one endpoint to a stub; everything else keeps serving the fleet state. */
function stubEndpoint(url: string, respond: () => Promise<Response>): void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (u: string, init?: RequestInit) => {
    if (u === url) return respond();
    return realFetch(u, init);
  }) as unknown as typeof fetch;
}

function syncButton(): HTMLButtonElement {
  return document.querySelector('[data-github-sync="p1"]') as HTMLButtonElement;
}

/** The button's vendored icons — exactly one cloud-upload, as its first child. */
function expectOneLeadingIcon(btn: HTMLButtonElement): void {
  expect(btn.querySelectorAll('svg.icon')).toHaveLength(1);
  expect(btn.firstElementChild?.getAttribute('class')).toBe('icon icon-cloud-upload');
}

function publicLabel(): HTMLLabelElement {
  return document.querySelector('label.github-sync-public') as HTMLLabelElement;
}

function publicText(): HTMLElement | null {
  return publicLabel().querySelector('[data-i18n="githubSyncPublicLabel"]');
}

describe('project page GitHub-sync controls i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Deliberately the FIRST test that boots the shell: every boot() registers
  // another delegated click listener on the shared jsdom document, and with
  // several listeners a single click would fire several requests — only the
  // last of which the stub below can resolve.
  it('keeps the busy label through a mid-request sweep, then restores the idle label in the locale active at completion', async () => {
    await boot();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let finish: (r: Response) => void = () => {};
    stubEndpoint(
      '/api/github-sync/execute',
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const btn = syncButton();

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe(STRINGS.en.githubSyncing);
    expect(btn.getAttribute('data-i18n')).toBe('githubSyncing');
    expectOneLeadingIcon(btn);

    // The language toggle runs the same document-wide translateDom() sweep a
    // fleet tick does — it must repaint the BUSY label, not the idle one.
    switchToHebrew();
    expect(btn.textContent).toBe(STRINGS.he.githubSyncing);
    expect(btn.textContent).not.toBe(STRINGS.he.githubSync);
    expectOneLeadingIcon(btn);

    finish({
      status: 200,
      json: async () => ({ ok: true, url: 'https://github.com/x/alpha' }),
    } as unknown as Response);
    await vi.waitFor(() => expect(btn.disabled).toBe(false));
    expect(btn.textContent).toBe(STRINGS.he.githubSync);
    expect(btn.getAttribute('data-i18n')).toBe('githubSync');
    expectOneLeadingIcon(btn);
  });

  it('tags the button and the checkbox text and paints them in English by default', async () => {
    await boot();

    const btn = syncButton();
    expect(btn.textContent).toBe('Sync to GitHub');
    expect(btn.textContent).toBe(STRINGS.en.githubSync);
    expect(btn.getAttribute('data-i18n')).toBe('githubSync');

    const text = publicText();
    expect(text?.textContent).toBe('Make public instead (visible to everyone)');
    expect(text?.textContent).toBe(STRINGS.en.githubSyncPublicLabel);
    // The checkbox itself stays inside the label, beside (not inside) the
    // tagged text — the reason the text has its own element.
    const box = publicLabel().querySelector('input[type="checkbox"][data-github-public="p1"]');
    expect(box).toBeTruthy();
    expect(text?.contains(box)).toBe(false);
  });

  it('switching to Hebrew translates both controls in place and keeps the checkbox', async () => {
    await boot();
    const btn = syncButton();
    const text = publicText();

    switchToHebrew();

    expect(syncButton()).toBe(btn);
    expect(btn.textContent).toBe(STRINGS.he.githubSync);
    expectOneLeadingIcon(btn);
    expect(publicText()).toBe(text);
    expect(text?.textContent).toBe(STRINGS.he.githubSyncPublicLabel);
    expect(publicLabel().querySelector('input[type="checkbox"]')).toBeTruthy();
  });

  it('a page that boots in Hebrew paints both controls in Hebrew at birth', async () => {
    localStorage.setItem('ap-locale', 'he');
    await boot();

    expect(syncButton().textContent).toBe(STRINGS.he.githubSync);
    expect(publicText()?.textContent).toBe(STRINGS.he.githubSyncPublicLabel);
  });

  it('keeps the Hebrew rows native — real Hebrew, not the English text', () => {
    for (const key of ['githubSync', 'githubSyncPublicLabel'] as const) {
      expect(STRINGS.he[key]).not.toBe(STRINGS.en[key]);
      expect(HEBREW_LETTER.test(STRINGS.he[key])).toBe(true);
    }
    // The button keeps the GitHub name in every locale.
    expect(STRINGS.he.githubSync).toContain('GitHub');
  });

  it('drops the ⇪ from the label in every locale (epic 0025)', () => {
    for (const table of Object.values(STRINGS)) {
      expect(table.githubSync).not.toContain('⇪');
      expect(table.githubSync).toBe(table.githubSync.trim());
    }
  });

  it('leads with a decorative cloud-upload stroke instead of a baked ⇪ (epic 0025)', async () => {
    await boot();

    const btn = syncButton();
    const icon = btn.firstElementChild;
    expect(icon?.tagName.toLowerCase()).toBe('svg');
    expect(icon?.getAttribute('class')).toBe('icon icon-cloud-upload');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(btn.textContent).not.toContain('⇪');
  });

  it('keeps the icon when a sync fails and the idle label comes back', async () => {
    await boot();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubEndpoint('/api/github-sync/execute', () => Promise.reject(new Error('offline')));
    const btn = syncButton();

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(btn.disabled).toBe(false));

    expect(btn.textContent).toBe(STRINGS.en.githubSync);
    expect(btn.getAttribute('data-i18n')).toBe('githubSync');
    expectOneLeadingIcon(btn);
  });

  it('sits the icon a gap before the label, like the Start over button', () => {
    expect(layoutCss()).toContain('.github-sync button > .icon { margin-inline-end: 0.35em; }');
  });

  it('paints both via tr(), with neither old literal left in the assembled bundle', () => {
    const js = clientJs();
    expect(js).toContain("tr('githubSync')");
    expect(js).toContain("tr('githubSyncPublicLabel')");
    // Pin the old single-quoted JS literals, not the bare sentences: the
    // English STRINGS table itself ships in this bundle as JSON (double
    // quotes), and the release feature's source comment names the checkbox
    // by its first words.
    expect(js).not.toContain("'⇪ Sync to GitHub'");
    expect(js).not.toContain("' Make public instead (visible to everyone)'");
  });
});
