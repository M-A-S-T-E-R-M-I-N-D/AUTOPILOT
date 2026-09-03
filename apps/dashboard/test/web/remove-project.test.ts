// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression: the Remove button disabled itself and set text to "Removing…", then
 * called refresh() regardless of the HTTP status — fetch only rejects on a network
 * failure, not a 4xx/5xx response. Because renderFleet skips its rebuild when the
 * fleet data is unchanged (see live-render.test.ts), a failed delete left the
 * button permanently disabled with no way to retry and no error shown.
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
  fileCount: 2,
  totalBytes: 100,
  languages: [],
  topDirs: [],
  hotFiles: [],
  gate: null,
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
};

function state() {
  return {
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
}

describe('remove a project', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.open();
    document.write(renderShell());
    document.close();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('re-enables the button when the delete request fails (non-ok status)', async () => {
    globalThis.fetch = vi.fn((url: string) => {
      if (url === '/api/project/delete') {
        return Promise.resolve({ ok: false, status: 404 } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => state() } as unknown as Response);
    }) as unknown as typeof fetch;

    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1); // flush the immediate first paint

    const button = document.querySelector('[data-remove]') as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    button!.click();
    await vi.advanceTimersByTimeAsync(1);

    expect(button!.disabled).toBe(false);
    expect(button!.textContent).toBe('Remove');
  });

  it('confirms with the translated, project-named message before deleting', async () => {
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => state() }) as unknown as Response,
    ) as unknown as typeof fetch;

    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const button = document.querySelector('[data-remove]') as HTMLButtonElement;
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(confirmSpy).toHaveBeenCalledWith(
      STRINGS.en.removeProjectConfirm.replace('{name}', 'Alpha'),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/project/delete',
      expect.objectContaining({ body: JSON.stringify({ id: 'p1' }) }),
    );
  });
});
