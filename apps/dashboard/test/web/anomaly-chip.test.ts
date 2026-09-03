// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The anomaly-thresholds read model (read/anomalies.ts) is only a real
 * feature once it has a keyboard-reachable, self-explaining expression on
 * the fleet card — this is that expression's regression test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 6,
  shipped: 1,
  cost: 9,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 0.16,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
  anomalies: [
    {
      kind: 'cost-spike',
      evidence: 'Firing cost $5.00 vs ~$1.00 average of the last 5 firings.',
    },
    {
      kind: 'gate-fail-streak',
      evidence: '3 consecutive firings reverted by the gate.',
    },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 1,
    needsYou: 0,
    firings: 6,
    shipped: 1,
    openFindings: 0,
    cost: 9,
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

describe('anomaly chips on the fleet card', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders one keyboard-reachable, self-explaining chip per detected anomaly', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const chips = Array.from(document.querySelectorAll('.card-head-badges .chip-anomaly'));
    expect(chips.length).toBe(2);
    for (const chip of chips) {
      expect(chip.getAttribute('tabindex')).toBe('0');
      expect(chip.getAttribute('data-tip')).toBeTruthy();
      expect(chip.getAttribute('aria-label')).toBeTruthy();
    }
    expect(chips[0]?.getAttribute('data-tip')).toContain('$5.00');
    expect(chips[1]?.getAttribute('data-tip')).toContain('3 consecutive');
    // D1 ATTRIBUTE PAYLOAD (epic 0015, web-mtd1wmqc-v7h6cq): the aria-label
    // names the rule concisely and must NOT re-ship the tip's evidence
    // sentence as a second attribute on every chip.
    expect(chips[0]?.getAttribute('aria-label')).toBe('anomaly: ⚠ cost spike');
    expect(chips[0]?.getAttribute('aria-label')).not.toContain('$5.00');
    expect(chips[1]?.getAttribute('aria-label')).toBe('anomaly: ⚠ gate fail streak');
    expect(chips[1]?.getAttribute('aria-label')).not.toContain('3 consecutive');
  });

  it('renders no anomaly chips for a project with a clean flight log', async () => {
    const clean = { ...PROJECT, anomalies: [] };
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(
      async () =>
        ({ ok: true, json: async () => ({ ...STATE, projects: [clean] }) }) as unknown as Response,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelectorAll('.chip-anomaly').length).toBe(0);
  });
});
