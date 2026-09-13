// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE VERSION MENU (operator, 2026-09-13: "make sure my dashboard shows the
 * latest version, and that I have a button to reset and always run the
 * latest"): the masthead always shows the running version; its popover
 * reports the newest release and offers "Run the latest" — the rebuild
 * strategy when the checkout is already current, so the button doubles as a
 * clean reset — and "Update to vX" when a newer release exists.
 */

import { describe, it, expect, vi } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { PRODUCT_VERSION } from '../../src/info.js';

interface Call {
  url: string;
  body?: string | undefined;
}

function boot(check: Record<string, unknown>): Call[] {
  const calls: Call[] = [];
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
    if (url.startsWith('/api/update-check')) {
      return { ok: true, json: async () => check } as unknown as Response;
    }
    if (url === '/api/update/execute') {
      const res = {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          reason: 'updated',
          details: 'Updated — restarting onto the new build.',
          restarting: true,
        }),
        clone() {
          return res;
        },
      };
      return res as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  return calls;
}

describe('the version menu', () => {
  it('the masthead shows the running version and the run-the-latest / check-now actions', () => {
    const html = renderShell();
    expect(html).toContain('id="version-menu"');
    expect(html).toContain(`<span id="version-label">v${PRODUCT_VERSION}</span>`);
    expect(html).toContain('id="version-run"');
    expect(html).toContain('data-i18n="versionRunLatest"');
    expect(html).toContain('id="version-check"');
    expect(html).toContain('data-i18n-tip="versionRunTip"');
    expect(html).toContain('name="masthead-popover"');
  });

  it('reports the newest release, marks the chip current, and runs a REBUILD when already current', async () => {
    const calls = boot({
      current: '0.43.0',
      latest: '0.43.0',
      updateAvailable: false,
      checkedAt: 0,
    });

    await vi.waitFor(() => {
      expect(document.getElementById('version-status')?.textContent).toContain(
        'v0.43.0 is the newest release',
      );
    });
    expect(document.getElementById('version-menu')?.getAttribute('data-update')).toBe('current');
    expect(document.getElementById('version-run')?.textContent).toBe(STRINGS.en.versionRunLatest);

    (document.getElementById('version-run') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(calls.some((c) => c.url === '/api/update/execute')).toBe(true);
    });
    expect(calls.find((c) => c.url === '/api/update/execute')?.body).toBe(
      JSON.stringify({ strategy: 'rebuild' }),
    );
    expect(document.getElementById('version-status')?.textContent).toBe(
      STRINGS.en.updateInProgress,
    );
  });

  it('offers a plain update when a newer release exists', async () => {
    boot({ current: '0.43.0', latest: '0.44.0', updateAvailable: true, checkedAt: 0 });

    await vi.waitFor(() => {
      expect(document.getElementById('version-menu')?.getAttribute('data-update')).toBe(
        'available',
      );
    });
    expect(document.getElementById('version-status')?.textContent).toBe(
      'v0.43.0 → v0.44.0 is available',
    );
    expect(document.getElementById('version-run')?.textContent).toBe('Update to v0.44.0');
  });

  it('"Check now" forces a fresh check', async () => {
    const calls = boot({
      current: '0.43.0',
      latest: '0.43.0',
      updateAvailable: false,
      checkedAt: 0,
    });
    await vi.waitFor(() => {
      expect(document.getElementById('version-menu')?.getAttribute('data-update')).toBe('current');
    });

    (document.getElementById('version-check') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(calls.some((c) => c.url === '/api/update-check?force=1')).toBe(true);
    });
  });

  it('carries every word in both locales', () => {
    const keys = [
      'versionChecking',
      'versionLatest',
      'versionAvailable',
      'versionRunLatest',
      'versionRunUpdate',
      'versionCheckNow',
      'versionRunTip',
    ] as const;
    for (const key of keys) {
      expect(STRINGS.he[key]).toBeTruthy();
      expect(STRINGS.he[key]).not.toBe(STRINGS.en[key]);
    }
  });
});
