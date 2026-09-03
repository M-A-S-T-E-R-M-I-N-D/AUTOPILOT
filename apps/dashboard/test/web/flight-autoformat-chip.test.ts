// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `RemediatingGate` (`packages/engine/src/adapters/remediating-gate.ts`) has
 * mechanically fixed formatting failures and re-shipped the firing since it
 * landed, but nothing in the dashboard UI ever told the operator it happened —
 * this is that expression's regression test (headless-surfacing sweep,
 * web-msnqqjmd-9bx0wd). `FlightEntry.autoformatRescued` (read/fleet.ts,
 * read/source.ts) is derived purely from already-captured gate-check
 * telemetry — no new instrumentation.
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
      commitSubject: 'fix: rescued by autoformat',
      cost: 0.2,
      sha: 'sha0002',
      at: Date.now() - 10_000,
      kind: 'fix',
      gateResult: 'passed',
      autoformatRescued: true,
    },
    {
      id: 'f1',
      shipped: true,
      item: null,
      completion: null,
      commitSubject: 'fix: clean gate, no remediation',
      cost: 0.22,
      sha: 'sha0001',
      at: Date.now() - 20_000,
      kind: 'fix',
      gateResult: 'passed',
      autoformatRescued: false,
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

describe('the autoformat-rescue flight-log chip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows a keyboard-reachable, self-explaining chip on a rescued firing', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const rows = Array.from(document.querySelectorAll('.flightlog > li'));
    const rescuedRow = rows[0];
    const chip = rescuedRow?.querySelector('.flight-autoformat-chip');
    expect(chip).not.toBeNull();
    // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): the
    // chip doesn't lead the row's header (the verdict dot does), so it starts
    // at -1 — reachable via the row's roving group, not its own Tab stop.
    expect(chip?.getAttribute('tabindex')).toBe('-1');
    expect(chip?.getAttribute('data-tip')).toBeTruthy();
    expect(chip?.getAttribute('aria-label')).toBeTruthy();
  });

  it('omits the chip on a firing that shipped without remediation', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const rows = Array.from(document.querySelectorAll('.flightlog > li'));
    const cleanRow = rows[1];
    expect(cleanRow?.querySelector('.flight-autoformat-chip')).toBeNull();
  });
});
