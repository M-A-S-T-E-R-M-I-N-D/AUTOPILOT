// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 ATTRIBUTE PAYLOAD (epic 0015): the FLEET COORDINATION panel's line
 * items built their aria-label as `meta.text + ' — ' + meta.tip`, but each
 * `<li>`'s own text content already IS `meta.text` — so the aria-label
 * restated the visible text and then duplicated the full data-tip sentence
 * verbatim a second time, the same class of duplication already fixed for
 * the task-chip/search-hit/task-title/phase-pill/backlog-row aria-labels.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [{ language: 'typescript', files: 2, bytes: 100 }],
  topDirs: [{ dir: 'src', files: 2 }],
  hotFiles: ['src/a.ts'],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 1,
  shipped: 1,
  cost: 0.1,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 1,
    needsYou: 0,
    firings: 1,
    shipped: 1,
    openFindings: 0,
    cost: 0.1,
  },
  projects: [PROJECT],
  empty: false,
};

function bootWithCoordination(lines: string[]): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/coordination')) {
      return { ok: true, json: async () => ({ lines }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

describe('the FLEET COORDINATION panel explains itself on hover/focus', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not duplicate the visible line text plus the full tip into aria-label', async () => {
    bootWithCoordination(['- CLAIMED by fleet-2: [t1] Wire up the retry queue']);
    await new Promise((r) => setTimeout(r, 0));

    const line = document.querySelector('.coordination-line');
    expect(line?.textContent).toContain('CLAIMED by fleet-2: [t1] Wire up the retry queue');
    expect(line?.getAttribute('aria-label')).toBeNull();
  });

  it('exposes the tip via aria-describedby into a visually-hidden span instead', async () => {
    bootWithCoordination(['- CLAIMED by fleet-2: [t1] Wire up the retry queue']);
    await new Promise((r) => setTimeout(r, 0));

    const line = document.querySelector('.coordination-line');
    const focusable = line?.querySelector('[tabindex="0"]');
    expect(focusable?.getAttribute('data-tip')).toContain('claimed');
    const descId = focusable?.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    const desc = document.getElementById(descId!);
    expect(desc?.className).toBe('sr-only');
    expect(desc?.textContent).toBe(focusable?.getAttribute('data-tip'));
  });
});
