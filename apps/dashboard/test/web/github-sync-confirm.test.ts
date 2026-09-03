// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * i18n foundation (board web-msnsndki-dz3vn1): the project detail page's
 * "Sync to GitHub" button's `window.confirm()` message used to be built by
 * `card-actions.ts`'s English-only `githubSyncConfirmMessage`. The click
 * handler now reads the translated text from `STRINGS.githubSyncConfirmPrivate`/
 * `githubSyncConfirmPublic` via `tr(key, name)` instead, the same
 * `{name}`-template pattern `start-over-tooltip.test.ts` already covers for
 * the sibling "Start over" button.
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

describe('github-sync button confirms with the translated message', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('confirms with the private-repo wording by default', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const syncBtn = document.querySelector('[data-github-sync="p1"]') as HTMLButtonElement;
    expect(syncBtn).toBeTruthy();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    syncBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(confirmSpy).toHaveBeenCalledWith(
      STRINGS.en.githubSyncConfirmPrivate.replace('{name}', 'Alpha'),
    );
  });

  it('confirms with the more severe public wording when the checkbox is checked', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const syncBtn = document.querySelector('[data-github-sync="p1"]') as HTMLButtonElement;
    const publicBox = document.querySelector('[data-github-public="p1"]') as HTMLInputElement;
    expect(publicBox).toBeTruthy();
    publicBox.checked = true;
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    syncBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(confirmSpy).toHaveBeenCalledWith(
      STRINGS.en.githubSyncConfirmPublic.replace('{name}', 'Alpha'),
    );
  });

  it('does not fetch when the operator cancels the confirm dialog', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const syncBtn = document.querySelector('[data-github-sync="p1"]') as HTMLButtonElement;
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    syncBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/github-sync/execute', expect.anything());
  });
});
