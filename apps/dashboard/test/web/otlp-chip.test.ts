// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `flight/otlp.ts` (env-driven OTLP export, BACKLOG-999 ap-msksw1me-0) has
 * carried real export logic since it landed, but nothing in the dashboard UI
 * ever told the operator it was on — this is that expression's regression
 * test. `FleetView.otlpConfigured` (read/fleet.ts) is a fixed fact about the
 * dashboard process's own env (server/main.ts wiring), not per-project data.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

function boot(state: unknown): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('the OTLP export status chip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is hidden while no OTLP endpoint is configured', async () => {
    boot(STATE);
    await vi.advanceTimersByTimeAsync(1);

    const chip = document.getElementById('otlp-chip');
    expect(chip?.hidden).toBe(true);
  });

  it('shows a keyboard-reachable, self-explaining chip once the fleet state says OTLP is configured', async () => {
    boot({ ...STATE, otlpConfigured: true });
    await vi.advanceTimersByTimeAsync(1);

    const chip = document.getElementById('otlp-chip');
    expect(chip?.hidden).toBe(false);
    expect(chip?.getAttribute('tabindex')).toBe('0');
    expect(chip?.getAttribute('data-tip')).toBeTruthy();
    expect(chip?.getAttribute('aria-label')).toBeTruthy();
  });

  // EPIC 0017 slice 2 (board web-mtq019qd-u6pa1v): "Claude/gh/OTLP into ONE
  // traffic-light pill with detail popover" — Claude and gh already share
  // the Connect popover; the OTLP chip was the last of the three left
  // scattered in the masthead as its own separate control. It now lives
  // inside the Connect popover body instead, so opening ONE pill reveals
  // all three, not three chips competing for masthead real estate.
  it('lives inside the Connect popover body, not as its own scattered masthead chip', () => {
    boot(STATE);

    const connect = document.getElementById('connect');
    const chip = document.getElementById('otlp-chip');
    expect(connect?.contains(chip)).toBe(true);
  });
});
