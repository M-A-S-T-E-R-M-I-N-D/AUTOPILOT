// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The SOUL evolution loop's "unreviewed" flag (packages/store schema v13,
 * B5 closure) is only a real feature once it has a keyboard-reachable,
 * self-explaining, and actually-clickable expression on the fleet card —
 * this is that expression's regression test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  topDirs: [],
  hotFiles: [],
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
};

function stateWith(projectOverrides: Record<string, unknown>) {
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
    projects: [{ ...PROJECT, ...projectOverrides }],
    empty: false,
  };
}

function boot(state: unknown): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('SOUL-unreviewed badge on the fleet card', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders a keyboard-reachable, self-explaining button when the SOUL is unreviewed', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    const btn = document.querySelector('.card-head-badges [data-soul-review]');
    expect(btn).not.toBeNull();
    expect(btn?.tagName).toBe('BUTTON');
    expect(btn?.getAttribute('data-soul-review')).toBe('p1');
    expect(btn?.getAttribute('data-tip')).toBeTruthy();
    expect(btn?.textContent).toBe('◐ SOUL unreviewed');
  });

  it('does not duplicate the tip into aria-label — the badge keeps its own short name and rides the full explanation via aria-describedby', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    const btn = document.querySelector('.card-head-badges [data-soul-review]');
    expect(btn).not.toBeNull();
    const tip = btn?.getAttribute('data-tip');
    expect(tip).toBeTruthy();

    // No aria-label duplicating (or overriding) the button's own visible-text
    // accessible name with the long tip sentence.
    expect(btn?.hasAttribute('aria-label')).toBe(false);

    const descId = btn?.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    const desc = document.getElementById(descId as string);
    expect(desc?.className).toBe('sr-only');
    expect(desc?.textContent).toBe(tip);
  });

  it('renders no badge once the SOUL has been reviewed', async () => {
    boot(stateWith({ soulReviewed: true }));
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('[data-soul-review]')).toBeNull();
  });

  it('clicking the badge POSTs to /api/project/soul-reviewed and disables itself', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    const btn = document.querySelector('[data-soul-review]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(btn.disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/project/soul-reviewed',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'p1' }),
      }),
    );
  });
});
