// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The KEEPER PR review panel's failure-honest outage notice (BOARD
 * web-mss50ia0-s6vtbd, "PLATFORM 4/7"): a failed `gh pr list` read used to
 * collapse to the same empty `plans` a genuinely empty queue returns, so the
 * panel HID as if nothing were open to review — the preview-surface half of
 * the same unverified-assertion class `flight/pr-review.ts`'s
 * `PrReviewCandidateReport` closed at the fetch layer. With
 * `fetchFailed: true` on the response, the panel now stays visible and says
 * the list could not be read.
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

function boot(prReviewResponse: unknown): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async (url: string) => {
    if (String(url).startsWith('/api/pr-review')) {
      return { ok: true, json: async () => prReviewResponse } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

describe('KEEPER PR review fetch-failed notice (PLATFORM 4/7)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps the panel visible with the outage notice when the read failed', async () => {
    boot({ plans: [], fetchFailed: true });
    await vi.advanceTimersByTimeAsync(1);

    const section = document.getElementById('pr-review-panel');
    expect(section?.hidden).toBe(false);
    const notice = document.querySelector('.pr-review-fetch-failed');
    expect(notice?.textContent).toBe(STRINGS.en.prReviewFetchFailed);
    expect(notice?.getAttribute('data-i18n')).toBe('prReviewFetchFailed');
    // No plans arrived, so no Apply buttons may render off an outage.
    expect(document.querySelector('.pr-review-execute')).toBeNull();
  });

  it('still hides the panel on a CONFIRMED empty queue (no fetchFailed)', async () => {
    boot({ plans: [] });
    await vi.advanceTimersByTimeAsync(1);

    expect(document.getElementById('pr-review-panel')?.hidden).toBe(true);
    expect(document.querySelector('.pr-review-fetch-failed')).toBeNull();
  });

  it('translates the notice when the locale switches to Hebrew', async () => {
    boot({ plans: [], fetchFailed: true });
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expect(document.querySelector('.pr-review-fetch-failed')?.textContent).toBe(
      STRINGS.he.prReviewFetchFailed,
    );
  });
});
