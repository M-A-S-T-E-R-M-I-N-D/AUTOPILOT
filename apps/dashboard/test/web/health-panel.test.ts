// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's Health section (board ap-mui2h3rw-0, slice 1 of the
 * MASTER-PLAN §7 "Anomalies / Health" screen): every anomaly the detectors
 * flagged for the project, each with the evidence that fired it, what it
 * means, and the proposed fix — the same words the card's chip popovers
 * carry, listed in one place instead of hidden one chip at a time. A healthy
 * project says so rather than showing nothing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const COST_SPIKE = {
  kind: 'cost-spike',
  evidence: 'Firing cost $4.20 vs ~$0.90 average of the last 5 firings.',
};
const GATE_FAIL_STREAK = {
  kind: 'gate-fail-streak',
  evidence: '3 consecutive firings reverted by the gate.',
};

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [{ language: 'typescript', files: 2, bytes: 100 }],
  topDirs: [{ dir: 'src', files: 2 }],
  hotFiles: ['src/a.ts'],
  gate: 'js · vitest run',
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
  tasks: [],
  anomalies: [COST_SPIKE, GATE_FAIL_STREAK],
};

function stateWith(project: Record<string, unknown>) {
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
    projects: [project],
    empty: false,
  };
}

function boot(project: Record<string, unknown> = PROJECT): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => stateWith(project) }) as unknown as Response,
  );
  new Function(clientJs())();
}

function panel(): HTMLElement | null {
  return document.querySelector<HTMLElement>('main#fleet .health-panel');
}

describe('the project Health section', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lives on the Data tab under its own heading', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const section = panel();
    expect(section).not.toBeNull();
    expect(section?.getAttribute('data-subject')).toBe('data');
    const heading = section?.querySelector('h3.health-title [data-i18n="healthTitle"]');
    expect(heading?.textContent).toBe(STRINGS.en.healthTitle);
  });

  it('lists every detected anomaly with its evidence, meaning and proposed fix', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const items = Array.from(panel()?.querySelectorAll('.health-item') ?? []);
    expect(items).toHaveLength(2);

    const [spike, streak] = items;
    expect(spike?.querySelector('.health-item-title')?.textContent).toBe('cost spike');
    expect(spike?.querySelector('.health-what')?.textContent).toBe(STRINGS.en.anomalyWhatCostSpike);
    expect(spike?.querySelector('.health-evidence')?.textContent).toContain(COST_SPIKE.evidence);
    expect(spike?.querySelector('.health-fix')?.textContent).toContain(
      STRINGS.en.anomalyActionCostSpike,
    );
    expect(spike?.querySelector('.health-fix')?.textContent).toContain(STRINGS.en.anomalyPopAction);

    expect(streak?.querySelector('.health-item-title')?.textContent).toBe('gate fail streak');
    expect(streak?.querySelector('.health-fix')?.textContent).toContain(
      STRINGS.en.anomalyActionGateFailStreak,
    );
  });

  it('tags the translatable words so a language switch repaints them', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const spike = panel()?.querySelector('.health-item');
    expect(spike?.querySelector('.health-what')?.getAttribute('data-i18n')).toBe(
      'anomalyWhatCostSpike',
    );
    expect(spike?.querySelector('.health-fix [data-i18n="anomalyActionCostSpike"]')).not.toBeNull();
  });

  it('says the project is healthy when nothing fired, instead of showing nothing', async () => {
    boot({ ...PROJECT, anomalies: [] });
    await vi.advanceTimersByTimeAsync(1);

    const section = panel();
    expect(section).not.toBeNull();
    expect(section?.querySelectorAll('.health-item')).toHaveLength(0);
    expect(section?.querySelector('.health-clear')?.textContent).toBe(STRINGS.en.healthClear);
  });

  it('treats a project with no anomalies field (older read paths) as healthy', async () => {
    const { anomalies: _anomalies, ...withoutAnomalies } = PROJECT;
    boot(withoutAnomalies);
    await vi.advanceTimersByTimeAsync(1);

    expect(panel()).not.toBeNull();
    expect(panel()?.querySelector('.health-clear')?.textContent).toBe(STRINGS.en.healthClear);
  });
});

describe('the project Health section — accessibility', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is axe-clean with anomalies listed', async () => {
    boot();
    await vi.waitFor(() => {
      expect(panel()?.querySelectorAll('.health-item')).toHaveLength(2);
    });

    const results = await axe.run(panel() as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
