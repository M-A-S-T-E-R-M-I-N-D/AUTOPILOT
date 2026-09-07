// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * i18n wiring for the project page's process-health stat-tile cluster
 * (`web/features/process-health.ts`, board web-msnsndki-dz3vn1): the DORA,
 * parallel-gate-savings, and warm-sessions panel titles are client-built
 * `el('h3', …)` nodes — `scripts/i18n/find-untagged-strings.mjs` listed all
 * three as untagged. Each must carry its STRINGS key so `translateDom()` (page
 * load AND language switch) renders it in the active locale, the same contract
 * `issue-triage.ts`'s title already meets. All three are built synchronously
 * inside `renderProjectPage()` and ride its page-level sweep — no async
 * re-render path of their own, so no panel-local sweep is needed.
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
  dora: {
    landingFrequency: { windowDays: 7, landings: 3, perDay: 3 / 7 },
    taskLeadTime: {
      tasksCompleted: 2,
      medianLeadTimeMs: 90 * 60 * 1000,
      meanLeadTimeMs: 100 * 60 * 1000,
    },
    changeFailureRate: { shipped: 4, reverts: 1, rate: 0.25 },
    mttr: {
      checkpoints: 1,
      resolved: 1,
      medianRecoveryMs: 45 * 60 * 1000,
      meanRecoveryMs: 45 * 60 * 1000,
    },
  },
  gateParallel: {
    sampledFirings: 3,
    sequentialMs: 9000,
    observedMs: 5000,
    savedMs: 4000,
    savedPct: 4000 / 9000,
  },
  warmSessions: {
    resumed: { firings: 4 },
    cold: { firings: 9 },
    freshInputDeltaPerFiring: 18_500,
    costDeltaPerFiring: 0.42,
    costPerTurnDeltaPerFiring: 0.03,
  },
};

const STATE = {
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

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

const TITLES: ReadonlyArray<readonly [selector: string, key: keyof typeof STRINGS.en]> = [
  ['.dora-title', 'doraTitle'],
  ['.gate-parallel-title', 'gateParallelTitle'],
  ['.warm-sessions-title', 'warmSessionsTitle'],
];

describe('the process-health panel titles i18n wiring (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => localStorage.removeItem('ap-locale'));
  afterEach(() => vi.restoreAllMocks());

  it('tags each of the three panel titles with its STRINGS key', async () => {
    boot();
    await settle();

    for (const [selector, key] of TITLES) {
      const title = document.querySelector(selector);
      expect(title, selector).not.toBeNull();
      expect(title?.textContent, selector).toBe(STRINGS.en[key]);
      expect(title?.getAttribute('data-i18n'), selector).toBe(key);
    }
  });

  it('switching to Hebrew translates all three panel titles', async () => {
    boot();
    await settle();

    switchToHebrew();

    for (const [selector, key] of TITLES) {
      expect(document.querySelector(selector)?.textContent, selector).toBe(STRINGS.he[key]);
    }
  });

  it('keeps DORA in Latin script in Hebrew — it is an acronym, not a word to translate', () => {
    expect(STRINGS.he.doraTitle).toContain('DORA');
    expect(STRINGS.he.doraTitle).not.toBe(STRINGS.en.doraTitle);
    expect(STRINGS.he.gateParallelTitle).not.toBe(STRINGS.en.gateParallelTitle);
    expect(STRINGS.he.warmSessionsTitle).not.toBe(STRINGS.en.warmSessionsTitle);
  });
});
