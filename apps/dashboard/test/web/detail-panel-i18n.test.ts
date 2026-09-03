// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The fleet card's "Details" panel (`shell.ts`'s `updateDetailPanel()` /
 * `DETAIL_SECTION_BUILDERS`) is the much larger client-rendered surface
 * `packages/tokens/src/strings.ts`'s doc comment names as still needing
 * work after the masthead/SOUL/PR-review slices — this covers this slice's
 * first bite: the plain static headings that carry no separate
 * `aria-label` of their own (board web-msnsndki-dz3vn1).
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
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [{ dir: 'src', files: 3 }],
  hotFiles: ['src/a.ts'],
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
  activity: [
    { tool: 'Read', target: 'src/a.ts', kind: 'file', phase: 'orient', at: 1, firingId: 'f1' },
  ],
  tasks: [],
  anomalies: [],
  soulReviewed: true,
  soulProposed: null,
};

function stateWith(projectOverrides: Record<string, unknown>) {
  return {
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
    projects: [{ ...PROJECT, ...projectOverrides }],
    empty: false,
  };
}

function boot(state: unknown): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('fleet card Details panel i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tags the <details> "Details" summary with its STRINGS key', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('details.detail > summary')?.getAttribute('data-i18n')).toBe(
      'detailsSummary',
    );
  });

  it('tags the facts list Gate/Backup labels with their STRINGS keys', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    const dts = [...document.querySelectorAll('.facts dt')];
    const keys = dts.map((dt) => dt.getAttribute('data-i18n'));
    expect(keys).toContain('gate');
    expect(keys).toContain('backup');
  });

  it('tags the Languages/Top directories/Activity/Metrics section headings with their STRINGS keys', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    const headings = [...document.querySelectorAll('.detail-h')];
    const tagged = Object.fromEntries(
      headings.map((h) => [h.getAttribute('data-i18n'), h.textContent]),
    );
    expect(tagged['languages']).toBe('Languages');
    expect(tagged['topDirectories']).toBe('Top directories');
    expect(tagged['activity']).toBe('Activity');
    expect(tagged['metrics']).toBe('Metrics');
  });

  it('tags the Inbox heading (project page tasks section) with its STRINGS key', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    const headings = [...document.querySelectorAll('.detail-h')];
    const inboxH = headings.find((h) => h.getAttribute('data-i18n') === 'inbox');
    expect(inboxH?.textContent).toBe('Inbox');
  });

  it('switching to Hebrew translates the Details panel headings', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expect(document.querySelector('details.detail > summary')?.textContent).toBe(
      STRINGS.he.detailsSummary,
    );
    const headings = [...document.querySelectorAll('.detail-h')];
    const tagged = Object.fromEntries(
      headings.map((h) => [h.getAttribute('data-i18n'), h.textContent]),
    );
    expect(tagged['languages']).toBe(STRINGS.he.languages);
    expect(tagged['topDirectories']).toBe(STRINGS.he.topDirectories);
    expect(tagged['activity']).toBe(STRINGS.he.activity);
    expect(tagged['metrics']).toBe(STRINGS.he.metrics);
    expect(tagged['inbox']).toBe(STRINGS.he.inbox);
  });

  it('tags Hot files/Flight log/Per-firing trace headings with data-i18n + data-i18n-aria', async () => {
    boot(stateWith({ flightLog: [{ id: 'f1', at: 1, cost: 0, turns: 1 }] }));
    await vi.advanceTimersByTimeAsync(1);

    const headings = [...document.querySelectorAll('.detail-h')];
    const byKey = Object.fromEntries(headings.map((h) => [h.getAttribute('data-i18n'), h]));
    expect(byKey['hotFiles']?.getAttribute('data-i18n-aria')).toBe('hotFilesAria');
    expect(byKey['flightLog']?.getAttribute('data-i18n-aria')).toBe('flightLogAria');
    expect(byKey['firingTrace']?.getAttribute('data-i18n-aria')).toBe('firingTraceAria');
  });

  it('tags the Tasks heading with "tasks" normally and "tasksFocusMode" when a task is focused', async () => {
    boot(stateWith({ tasks: [{ id: 't1', title: 'x', status: 'open' }] }));
    await vi.advanceTimersByTimeAsync(1);

    const normalHeading = [...document.querySelectorAll('.detail-h')].find(
      (h) =>
        h.getAttribute('data-i18n') === 'tasks' || h.getAttribute('data-i18n') === 'tasksFocusMode',
    );
    expect(normalHeading?.getAttribute('data-i18n')).toBe('tasks');

    boot(stateWith({ tasks: [{ id: 't1', title: 'x', status: 'open', focus: true }] }));
    await vi.advanceTimersByTimeAsync(1);

    const focusHeading = [...document.querySelectorAll('.detail-h')].find(
      (h) =>
        h.getAttribute('data-i18n') === 'tasks' || h.getAttribute('data-i18n') === 'tasksFocusMode',
    );
    expect(focusHeading?.getAttribute('data-i18n')).toBe('tasksFocusMode');
  });

  it('tags the Firing activity heatmap heading with its STRINGS key', async () => {
    boot(stateWith({ flightLog: [{ id: 'f1', at: 1, cost: 0, turns: 1 }] }));
    await vi.advanceTimersByTimeAsync(1);

    const heading = [...document.querySelectorAll('.heatmap-wrap .detail-h')][0];
    expect(heading?.getAttribute('data-i18n')).toBe('firingActivity');
    expect(heading?.textContent).toBe('Firing activity');
  });

  it('switching to Hebrew translates the Firing activity heatmap heading', async () => {
    boot(stateWith({ flightLog: [{ id: 'f1', at: 1, cost: 0, turns: 1 }] }));
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const heading = document.querySelector('.heatmap-wrap .detail-h');
    expect(heading?.textContent).toBe(STRINGS.he.firingActivity);
  });

  it('switching to Hebrew translates Hot files/Flight log/Per-firing trace text + aria-label', async () => {
    boot(stateWith({ flightLog: [{ id: 'f1', at: 1, cost: 0, turns: 1 }] }));
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const headings = [...document.querySelectorAll('.detail-h')];
    const byKey = Object.fromEntries(headings.map((h) => [h.getAttribute('data-i18n'), h]));
    expect(byKey['hotFiles']?.textContent).toBe(STRINGS.he.hotFiles);
    expect(byKey['hotFiles']?.getAttribute('aria-label')).toBe(STRINGS.he.hotFilesAria);
    expect(byKey['flightLog']?.textContent).toBe(STRINGS.he.flightLog);
    expect(byKey['flightLog']?.getAttribute('aria-label')).toBe(STRINGS.he.flightLogAria);
    expect(byKey['firingTrace']?.textContent).toBe(STRINGS.he.firingTrace);
    expect(byKey['firingTrace']?.getAttribute('aria-label')).toBe(STRINGS.he.firingTraceAria);
  });
});
