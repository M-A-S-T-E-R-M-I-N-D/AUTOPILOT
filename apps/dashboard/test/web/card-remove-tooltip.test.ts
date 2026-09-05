// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: the fleet card's "Remove" button already
 * carried a full aria-label but — like the phase-rail and task-board action
 * buttons before it — never got the matching [data-tip] partner, so sighted
 * mouse/keyboard users saw nothing on hover/focus even though screen readers
 * announced it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

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
  document.write(renderShell(''));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('fleet card remove button explains itself on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives the remove button a data-tip and a concise, non-duplicating aria-label', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const rm = document.querySelector('[data-remove="p1"]');
    expect(rm).toBeTruthy();
    expect(rm?.getAttribute('data-tip')).toBe('Remove Alpha from the dashboard');
    // D1 ATTRIBUTE PAYLOAD (epic 0015, web-mtd1wmqc-v7h6cq): aria-label
    // names the action + target concisely — it must NOT duplicate the tip's
    // full "from the dashboard" sentence verbatim (same split 189137e0 gave
    // the task-row chips).
    expect(rm?.getAttribute('aria-label')).toBe('Remove Alpha');
    expect(rm?.getAttribute('aria-label')).not.toBe(rm?.getAttribute('data-tip'));
  });

  it('reverts to the localized label, not a hardcoded English literal, when the delete request fails', async () => {
    document.open();
    document.write(renderShell(''));
    document.close();
    document.documentElement.lang = 'he';
    globalThis.fetch = vi.fn(async (url: unknown) => {
      if (typeof url === 'string' && url.includes('/api/project/delete')) {
        return { ok: false, json: async () => STATE } as unknown as Response;
      }
      return { ok: true, json: async () => STATE } as unknown as Response;
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const rm = document.querySelector('[data-remove="p1"]') as HTMLButtonElement;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    rm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);

    expect(rm.disabled).toBe(false);
    expect(rm.textContent).toBe(STRINGS.he.removeCard);
  });

  it("uses tr('removing') for the in-flight label, not a hardcoded literal", () => {
    expect(clientJs()).toContain("b.textContent = tr('removing');");
  });
});
