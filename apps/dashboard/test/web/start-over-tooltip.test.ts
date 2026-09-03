// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2: the project detail page's "Start over"
 * button — unlike its sibling "Remove" button (see card-remove-tooltip.test.ts)
 * — had no [data-tip]/aria-label at all, so neither sighted mouse/keyboard
 * users nor screen readers got any explanation of what the reset actually does.
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

function boot(projectId: string): void {
  document.open();
  document.write(renderShell(projectId));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('start-over button explains itself on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives the start-over button a data-tip matching its aria-label', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const so = document.querySelector('[data-start-over="p1"]');
    expect(so).toBeTruthy();
    expect(so?.getAttribute('data-tip')).toBe("Reset Alpha's firings + ship-rate counters to 0/0");
    expect(so?.getAttribute('data-tip')).toBe(so?.getAttribute('aria-label'));
  });

  it('confirms with the translated, project-named message before resetting', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const so = document.querySelector('[data-start-over="p1"]') as HTMLButtonElement;
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    so.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(confirmSpy).toHaveBeenCalledWith(STRINGS.en.startOverConfirm.replace('{name}', 'Alpha'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/project/reset',
      expect.objectContaining({ body: JSON.stringify({ id: 'p1' }) }),
    );
  });
});
