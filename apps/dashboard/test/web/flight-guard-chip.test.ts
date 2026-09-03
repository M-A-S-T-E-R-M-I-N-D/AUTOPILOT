// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The containment/read-hygiene guard (packages/engine/src/adapters/claude-cli.ts's
 * `guardDenialsFromEvent`) has been counting PreToolUse denials since the
 * headless-surfacing sweep (board web-msnqqjmd-9bx0wd) started, but nothing in
 * the dashboard UI ever told the operator a firing bounced off the boundary —
 * this is that expression's regression test. `FlightEntry.guardDenials`
 * (read/fleet.ts, read/source.ts) is derived purely from the already-captured
 * `FiringRecord.guardDenials` telemetry — no new instrumentation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  gate: 'js · vitest run',
  backedUp: true,
  firings: 2,
  shipped: 1,
  cost: 0.42,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 0.5,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  activity: [],
  tasks: [],
  flightLog: [
    {
      id: 'f2',
      shipped: true,
      item: null,
      completion: null,
      commitSubject: 'fix: bounced off the boundary',
      cost: 0.2,
      sha: 'sha0002',
      at: Date.now() - 10_000,
      kind: 'fix',
      gateResult: 'passed',
      guardDenials: 2,
    },
    {
      id: 'f1',
      shipped: true,
      item: null,
      completion: null,
      commitSubject: 'fix: clean firing, no denials',
      cost: 0.22,
      sha: 'sha0001',
      at: Date.now() - 20_000,
      kind: 'fix',
      gateResult: 'passed',
      guardDenials: 0,
    },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 2,
    shipped: 1,
    openFindings: 0,
    cost: 0.42,
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

describe('the guard-denial flight-log chip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows a keyboard-reachable, self-explaining chip on a firing the guard bounced', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const rows = Array.from(document.querySelectorAll('.flightlog > li'));
    const deniedRow = rows[0];
    const chip = deniedRow?.querySelector('.flight-guard-chip');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain('2');
    // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): the
    // chip doesn't lead the row's header (the verdict dot does), so it starts
    // at -1 — reachable via the row's roving group, not its own Tab stop.
    expect(chip?.getAttribute('tabindex')).toBe('-1');
    expect(chip?.getAttribute('data-tip')).toBeTruthy();
    expect(chip?.getAttribute('aria-label')).toBeTruthy();
  });

  it('omits the chip on a firing with no guard denials', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const rows = Array.from(document.querySelectorAll('.flightlog > li'));
    const cleanRow = rows[1];
    expect(cleanRow?.querySelector('.flight-guard-chip')).toBeNull();
  });
});
