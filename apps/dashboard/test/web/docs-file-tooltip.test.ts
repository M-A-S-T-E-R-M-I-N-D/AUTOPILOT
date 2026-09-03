// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): every clickable chip
 * explains itself on hover/focus except `.docs-file` — the docs panel's file
 * buttons carried no data-tip/aria-label at all, unlike every sibling chip
 * (flight-slice chips, task severity/dimension chips, landing diffstat chips).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
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
  flightLog: [],
  activity: [],
  tasks: [],
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

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (url: unknown) => {
    const href = String(url);
    if (href.includes('/api/docs')) {
      return {
        ok: true,
        json: async () => ({ files: ['README.md', 'docs/MASTER-PLAN.md'] }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

describe('docs panel file chips', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('explains each doc file on hover/focus via data-tip, without duplicating it into aria-label', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const files = Array.from(document.querySelectorAll('.docs-file'));
    expect(files).toHaveLength(2);
    expect(files[0]?.getAttribute('data-tip')).toBe('Open README.md');
    // D1 ATTRIBUTE PAYLOAD (epic 0015, web-mtd1wmqc-v7h6cq): no aria-label
    // duplicating the tip — the button's own text (the filename) already
    // gives it an accessible name; the full "Open …"/"Currently viewing …"
    // sentence rides aria-describedby into a visually-hidden span instead.
    expect(files[0]?.hasAttribute('aria-label')).toBe(false);
    const descId = files[0]?.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    const desc = document.getElementById(descId ?? '');
    expect(desc?.classList.contains('sr-only')).toBe(true);
    expect(desc?.textContent).toBe('Open README.md');
    expect(files[1]?.getAttribute('data-tip')).toBe('Open docs/MASTER-PLAN.md');
    expect(files[1]?.hasAttribute('aria-label')).toBe(false);
  });
});
