// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the fleet card's Details
 * panel headings. The project page's panel headings lead with a stroke icon
 * (project-detail-heading-icons.test.ts), but the seven section headings
 * `DETAIL_SECTION_BUILDERS` renders (Languages, Top directories, Hot files,
 * Flight log, Activity, Per-firing trace, Metrics) headed with bare words.
 * Each now leads with its own decorative vendored icon.
 *
 * The STRINGS key stays on the `<h3>` itself, as detail-panel-i18n.test.ts
 * pins, and `setSweptText()` keeps a leading `svg.icon` through every sweep,
 * the way the project page's chart headings keep theirs
 * (project-detail-heading-icons.test.ts). Hot files, Flight log and
 * Per-firing trace keep their own `aria-label`, so the icon adds nothing to
 * their accessible name.
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
  // One firing shows the Flight log and the Per-firing trace.
  flightLog: [{ id: 'f1', at: 1, cost: 0, turns: 1 }],
  activity: [
    { tool: 'Read', target: 'src/a.ts', kind: 'file', phase: 'orient', at: 1, firingId: 'f1' },
  ],
  tasks: [],
  anomalies: [],
  soulReviewed: true,
  soulProposed: null,
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

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

const HEADINGS = [
  { key: 'languages', icon: 'code-xml' },
  { key: 'topDirectories', icon: 'folder-tree' },
  { key: 'hotFiles', icon: 'weight' },
  { key: 'flightLog', icon: 'scroll-text' },
  { key: 'activity', icon: 'activity' },
  { key: 'firingTrace', icon: 'list-tree' },
  { key: 'metrics', icon: 'gauge' },
] as const;

function heading(key: string): Element | null {
  return document.querySelector('.detail-section > h3.detail-h[data-i18n="' + key + '"]');
}

describe('the fleet card Details panel headings (epic 0025 slice 2)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(HEADINGS)('$key leads with the decorative $icon icon beside its words', async (h) => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const title = heading(h.key);
    expect(title).not.toBeNull();
    const icon = title?.firstElementChild;
    expect(icon?.getAttribute('class')).toBe('icon icon-' + h.icon);
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.querySelectorAll('path, circle').length).toBeGreaterThan(0);
    expect(title?.querySelectorAll('svg')).toHaveLength(1);
    expect(title?.textContent).toBe(STRINGS.en[h.key]);
  });

  it('switching to Hebrew translates all seven headings and keeps their icons', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    for (const h of HEADINGS) {
      const title = heading(h.key);
      expect(title?.textContent).toBe(STRINGS.he[h.key]);
      expect(title?.firstElementChild?.getAttribute('class')).toBe('icon icon-' + h.icon);
    }
  });

  it('the tipped headings keep their own aria-label, so the icon names nothing', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    for (const [key, aria] of [
      ['hotFiles', 'hotFilesAria'],
      ['flightLog', 'flightLogAria'],
      ['firingTrace', 'firingTraceAria'],
    ] as const) {
      expect(heading(key)?.getAttribute('aria-label')).toBe(STRINGS.en[aria]);
    }
  });
});
