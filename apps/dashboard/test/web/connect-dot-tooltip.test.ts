// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the masthead
 * CONNECT popover's status dot (`#conn-dot`) used to render `aria-hidden`
 * with no tooltip — its collapsed-state neighbor (`#connect-label`) only
 * ever shows a coarse "Connect"/"Connected" binary, never the finer
 * distinctions `connectStatusMeta`/`connectTestResultMeta` already compute
 * ("CLI missing" / "Not logged in" / "No credential" / the full
 * description + CLI version). It now explains itself on hover/focus like
 * every other status dot in the app (see `status-pill-tooltips.test.ts`,
 * `flightlog-row-tooltips.test.ts`).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [],
  empty: true,
};

function boot(connectionPayload: unknown): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/connection/gh')) {
      return {
        ok: true,
        json: async () => ({ present: false, authenticated: false }),
      } as unknown as Response;
    }
    if (url.includes('/api/connection')) {
      return { ok: true, json: async () => connectionPayload } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

describe('the CONNECT popover status dot explains itself on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is keyboard-reachable with a tooltip and accessible label once connected', async () => {
    boot({
      mode: 'subscription',
      ready: true,
      cliPresent: true,
      cliVersion: '2.1.0',
      description: 'Logged in via subscription',
    });
    await vi.advanceTimersByTimeAsync(1);

    const dot = document.getElementById('conn-dot');
    expect(dot).not.toBeNull();
    expect(dot?.className).toBe('conn-dot on');
    expect(dot?.getAttribute('tabindex')).toBe('0');
    expect(dot?.getAttribute('data-tip')).toBe(
      'Connected - Logged in via subscription - claude 2.1.0',
    );
    expect(dot?.getAttribute('aria-label')).toBe('Claude connection: Connected');
    expect(dot?.hasAttribute('aria-hidden')).toBe(false);
  });

  it('still carries a tooltip and accessible label when not connected', async () => {
    boot({
      mode: 'subscription',
      ready: false,
      cliPresent: true,
      cliVersion: '2.1.0',
      description: 'No subscription session',
    });
    await vi.advanceTimersByTimeAsync(1);

    const dot = document.getElementById('conn-dot');
    expect(dot?.className).toBe('conn-dot off');
    expect(dot?.getAttribute('tabindex')).toBe('0');
    expect(dot?.getAttribute('data-tip')).toBe(
      'Not logged in - No subscription session - claude 2.1.0',
    );
    expect(dot?.getAttribute('aria-label')).toBe('Claude connection: Not logged in');
  });
});
