// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The fleet page's two SOUL-loop review buttons that were still raw English
 * `el()` text nodes (board web-msnsndki-dz3vn1; `pnpm i18n:untagged` listed
 * all three): the card head's "◐ SOUL unreviewed" badge-button
 * (`soulReviewBtn()`), and the FLEET WISDOM banner's ✓ ratify / ✗ dismiss
 * pair (`fleetWisdomPanel()`).
 *
 * The fleet-wisdom pair reuses the project-scoped `soulProposalPanel()`'s
 * `soulRatify` / `soulDismiss` keys — same glyph, same verb, same table row —
 * so only the badge-button needs a new key (`soulUnreviewed`). Both surfaces
 * ride the fleet page's per-tick `translateDom()` sweep already (the banner
 * host `#fleet-wisdom` is persistent chrome; the cards are re-rendered per
 * tick), and the language toggle's own document-wide sweep.
 *
 * The buttons' data-tip / aria-label / aria-describedby wiring is untouched:
 * the `[data-i18n]` sweep swaps text content only.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [{ dir: 'src', files: 3 }],
  hotFiles: ['src/a.ts'],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 6,
  shipped: 1,
  cost: 9,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 0.16,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
  anomalies: [],
  soulReviewed: false,
  soulProposed: null,
};

function stateWith(overrides: Record<string, unknown>) {
  return {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 1,
      needsYou: 0,
      firings: 6,
      shipped: 1,
      openFindings: 0,
      cost: 9,
    },
    projects: [PROJECT],
    empty: false,
    wisdomProposed: null,
    ...overrides,
  };
}

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

describe('SOUL-unreviewed badge + fleet-wisdom ratify/dismiss i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tags the ◐ SOUL unreviewed badge-button with soulUnreviewed', async () => {
    await boot(stateWith({}));

    const btn = document.querySelector('button[data-soul-review="p1"]');
    expect(btn?.textContent).toBe('◐ SOUL unreviewed');
    expect(btn?.getAttribute('data-i18n')).toBe('soulUnreviewed');
    expect(btn?.textContent).toBe(STRINGS.en.soulUnreviewed);
  });

  it('tags the fleet-wisdom ✓ ratify / ✗ dismiss buttons with the shared soulRatify / soulDismiss keys', async () => {
    await boot(stateWith({ wisdomProposed: 'checkpoint before the turn cap' }));

    const ratify = document.querySelector('.fleet-wisdom-panel [data-fleet-wisdom-ratify]');
    expect(ratify?.textContent).toBe('✓ ratify');
    expect(ratify?.getAttribute('data-i18n')).toBe('soulRatify');
    const dismiss = document.querySelector('.fleet-wisdom-panel [data-fleet-wisdom-dismiss]');
    expect(dismiss?.textContent).toBe('✗ dismiss');
    expect(dismiss?.getAttribute('data-i18n')).toBe('soulDismiss');
  });

  it('switching to Hebrew translates the badge-button and keeps its aria-describedby tip', async () => {
    await boot(stateWith({}));
    switchToHebrew();

    const btn = document.querySelector('button[data-soul-review="p1"]');
    expect(btn?.textContent).toBe(STRINGS.he.soulUnreviewed);
    const descId = btn?.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    expect(document.getElementById(descId as string)?.textContent).toBe(
      btn?.getAttribute('data-tip'),
    );
  });

  it('switching to Hebrew translates the fleet-wisdom pair and keeps their tip/aria pairing', async () => {
    await boot(stateWith({ wisdomProposed: 'checkpoint before the turn cap' }));
    switchToHebrew();

    const ratify = document.querySelector('.fleet-wisdom-panel [data-fleet-wisdom-ratify]');
    const dismiss = document.querySelector('.fleet-wisdom-panel [data-fleet-wisdom-dismiss]');
    expect(ratify?.textContent).toBe(STRINGS.he.soulRatify);
    expect(dismiss?.textContent).toBe(STRINGS.he.soulDismiss);
    for (const btn of [ratify, dismiss]) {
      const tip = btn?.getAttribute('data-tip');
      expect(tip).toBeTruthy();
      expect(btn?.getAttribute('aria-label')).toBe(tip);
    }
  });

  it('a fleet-wisdom banner that survives a tick unchanged still lands in the active locale', async () => {
    await boot(stateWith({ wisdomProposed: 'checkpoint before the turn cap' }));
    switchToHebrew();
    // The banner's own dirty check skips the re-render when the text is
    // unchanged (DOM identity survives) — the per-tick sweep must still
    // leave it in Hebrew rather than letting a stale English label through.
    await vi.advanceTimersByTimeAsync(5000);

    const ratify = document.querySelector('.fleet-wisdom-panel [data-fleet-wisdom-ratify]');
    expect(ratify?.textContent).toBe(STRINGS.he.soulRatify);
  });

  it('keeps the Hebrew badge label marked like its English twin and naming SOUL', () => {
    expect(STRINGS.he.soulUnreviewed.startsWith('◐ ')).toBe(true);
    expect(STRINGS.he.soulUnreviewed).toContain('SOUL');
    expect(STRINGS.he.soulUnreviewed).not.toBe(STRINGS.en.soulUnreviewed);
  });
});
