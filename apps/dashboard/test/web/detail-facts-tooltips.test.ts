// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the detail panel's
 * "Gate" and "Backup" facts showed a short label or jargon (a gate string
 * like "js · vitest run", or "MYTH + LEGACY snapshot") with no explanation,
 * unlike every other stat/chip/pill on the fleet card.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [],
  topDirs: [],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 0,
  shipped: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: null,
  flightLog: [],
  activity: [],
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
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('detail panel facts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('explains the Gate fact on hover/focus via data-tip + aria-label', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const dts = Array.from(document.querySelectorAll('.facts dt'));
    const gateIndex = dts.findIndex((dt) => dt.textContent === 'Gate');
    expect(gateIndex).toBeGreaterThanOrEqual(0);
    const gateDd = document.querySelectorAll('.facts dd')[gateIndex];
    expect(gateDd?.textContent).toBe('js · vitest run');
    expect(gateDd?.getAttribute('data-tip')).toBe(
      'The check AUTOPILOT runs to verify a change before it commits',
    );
    expect(gateDd?.getAttribute('aria-label')).toBe(
      'Gate: js · vitest run — the check AUTOPILOT runs to verify a change before it commits',
    );
  });

  it('explains the Backup fact (MYTH/LEGACY jargon) on hover/focus via data-tip + aria-label', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const dts = Array.from(document.querySelectorAll('.facts dt'));
    const backupIndex = dts.findIndex((dt) => dt.textContent === 'Backup');
    expect(backupIndex).toBeGreaterThanOrEqual(0);
    const backupDd = document.querySelectorAll('.facts dd')[backupIndex];
    expect(backupDd?.textContent).toBe('MYTH + LEGACY snapshot');
    expect(backupDd?.getAttribute('data-tip')).toBe(
      'MYTH is the pristine pre-touch snapshot, LEGACY is the lock-on baseline — both git tags exist before AUTOPILOT changes anything',
    );
    expect(backupDd?.getAttribute('aria-label')).toBe(
      'Backup: MYTH and LEGACY snapshot tags exist before AUTOPILOT changes anything',
    );
  });
});
