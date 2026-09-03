// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression coverage for `renderProjectPage()`'s `data-report-region`
 * tagging (REPORT UNIFICATION 2/2, epic 0015) — the eight always-open
 * `reportFromHereSection` panels this file used to pin (BOARD
 * web-mss50ia8-nthtf3, "PLATFORM 5/7") are gone; `renderProjectPage()` now
 * tags each region's own container with `REPORT_REGION_ATTR` directly at
 * render instead. This pins that each of the eight project-page regions
 * (flight console, KEEPER issue triage, detected backlog, docs, this round,
 * next release, landing, tasks) is tagged exactly once with its real
 * `regionId`, and that a right-click inside a tagged region resolves the
 * owning module `web/shell.ts`'s `REPORT_REGIONS` carries for it — the
 * contract `web/features/report-menu.ts`'s dialog and
 * `web/features/report-capture-client.ts`'s resolver depend on.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { REPORT_REGION_ATTR } from '../../src/web/report-capture.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [{ language: 'typescript', files: 2, bytes: 100 }],
  topDirs: [],
  hotFiles: [],
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

const REGIONS: ReadonlyArray<{
  regionId: string;
  regionLabel: string;
  moduleSources: readonly string[];
}> = [
  {
    regionId: 'flight-console',
    regionLabel: 'Flight console',
    moduleSources: ['apps/dashboard/src/web/features/flight-console.ts'],
  },
  {
    regionId: 'issue-triage',
    regionLabel: 'KEEPER issue triage',
    moduleSources: [
      'apps/dashboard/src/web/features/issue-triage.ts',
      'apps/dashboard/src/flight/issue-triage.ts',
    ],
  },
  {
    regionId: 'backlog',
    regionLabel: 'Detected backlog',
    moduleSources: ['apps/dashboard/src/web/features/backlog.ts'],
  },
  {
    regionId: 'docs',
    regionLabel: 'Docs',
    moduleSources: ['apps/dashboard/src/web/features/docs-viewer.ts'],
  },
  {
    regionId: 'round',
    regionLabel: 'This round',
    moduleSources: ['apps/dashboard/src/web/features/round-panel.ts'],
  },
  {
    regionId: 'release',
    regionLabel: 'Next release',
    moduleSources: ['apps/dashboard/src/web/shell.ts', 'packages/engine/src/release.ts'],
  },
  {
    regionId: 'landing',
    regionLabel: 'Landing',
    moduleSources: [
      'apps/dashboard/src/web/features/landing.ts',
      'apps/dashboard/src/landing/execute.ts',
    ],
  },
  {
    regionId: 'tasks',
    regionLabel: 'Tasks',
    moduleSources: ['apps/dashboard/src/web/shell.ts', 'apps/dashboard/src/web/task-queue.ts'],
  },
];

function boot(fetchImpl: typeof fetch): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = fetchImpl;
  new Function(clientJs())();
}

function fallbackFetch(): typeof fetch {
  return vi.fn(async () => ({ ok: true, json: async () => STATE }) as unknown as Response);
}

describe('data-report-region tagging in renderProjectPage (REPORT UNIFICATION 2/2, epic 0015)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as { __autopilotReportCapture?: unknown }).__autopilotReportCapture;
  });

  it('tags exactly one container per region, with its real regionId — no duplicate or missing region', async () => {
    boot(fallbackFetch());
    await vi.advanceTimersByTimeAsync(1);

    for (const region of REGIONS) {
      const matches = document.querySelectorAll(`[${REPORT_REGION_ATTR}="${region.regionId}"]`);
      expect(matches, region.regionId).toHaveLength(1);
    }
    expect(document.querySelectorAll(`[${REPORT_REGION_ATTR}]`)).toHaveLength(REGIONS.length);
  });

  it("tags each region's live section so a right-click there resolves its exact owning module", async () => {
    boot(fallbackFetch());
    await vi.advanceTimersByTimeAsync(1);

    for (const region of REGIONS) {
      const el = document.querySelector(`[${REPORT_REGION_ATTR}="${region.regionId}"]`);
      expect(el, region.regionId).not.toBeNull();

      el!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

      expect(
        (window as { __autopilotReportCapture?: { owningModule?: unknown } })
          .__autopilotReportCapture?.owningModule,
        region.regionId,
      ).toEqual(region);
    }
  });

  it('a right-click outside every tagged region resolves no owning module', async () => {
    boot(fallbackFetch());
    await vi.advanceTimersByTimeAsync(1);

    const back = document.querySelector('.back');
    expect(back).not.toBeNull();
    back!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

    expect(
      (window as { __autopilotReportCapture?: { owningModule?: unknown } }).__autopilotReportCapture
        ?.owningModule,
    ).toBeNull();
  });
});
