// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's VERSIONS panel (board ap-mui2h3s1-1, slice 4):
 * `web/versions-panel.ts`'s row model, and `web/features/versions.ts` run
 * inside the real served bundle — the timeline from `GET /api/versions`, a
 * version's "What changed" disclosure from `GET /api/versions/diff`, its
 * Hebrew repaint, and an axe scan with a diff open.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../../src/web/shell.js';
import { versionsJs } from '../../../src/web/features/versions.js';
import { versionRows, type VersionRowTimeline } from '../../../src/web/versions-panel.js';

vi.setConfig({ testTimeout: 120_000 });

const sha = (c: string): string => c.repeat(40);

const TIMELINE: VersionRowTimeline = {
  myth: {
    kind: 'myth',
    sha: sha('a'),
    committedAt: '2026-09-01T10:00:00Z',
    subject: 'initial import',
  },
  legacy: {
    kind: 'legacy',
    sha: sha('b'),
    committedAt: '2026-09-02T10:00:00Z',
    subject: 'lock on',
  },
  flight: [
    { kind: 'flight', sha: sha('d'), committedAt: '2026-09-04T10:00:00Z', subject: 'feat: second' },
    { kind: 'flight', sha: sha('c'), committedAt: '2026-09-03T10:00:00Z', subject: 'fix: first' },
  ],
  truncated: false,
};

const DIFF = {
  files: [
    { path: 'src/a.ts', added: 3, removed: 1 },
    { path: 'logo.png', added: null, removed: null },
  ],
  totals: { files: 2, added: 3, removed: 1 },
  truncated: false,
};

describe('versionRows', () => {
  it('lists the flight log newest first, then LEGACY, then MYTH, each compared with the one below', () => {
    const rows = versionRows(TIMELINE);
    expect(rows.map((r) => [r.kind, r.sha[0], r.diffFrom?.[0] ?? null])).toEqual([
      ['flight', 'd', 'c'],
      ['flight', 'c', 'b'],
      ['legacy', 'b', 'a'],
      ['myth', 'a', null],
    ]);
  });

  it('offers no comparison between two rows on one commit', () => {
    const rows = versionRows({ ...TIMELINE, legacy: { ...TIMELINE.legacy!, sha: sha('a') } });
    expect(rows.find((r) => r.kind === 'legacy')?.diffFrom).toBeNull();
  });

  it('never compares the oldest listed flight row of a truncated log with LEGACY', () => {
    const rows = versionRows({ ...TIMELINE, truncated: true });
    expect(rows.map((r) => r.diffFrom?.[0] ?? null)).toEqual(['c', null, 'a', null]);
  });

  it('lists MYTH alone when there is no LEGACY', () => {
    const rows = versionRows({ myth: TIMELINE.myth, legacy: null, flight: [], truncated: false });
    expect(rows).toEqual([{ ...TIMELINE.myth, diffFrom: null }]);
  });
});

describe('versionsJs', () => {
  it('embeds versionRows real compiled source via .toString()', () => {
    expect(versionsJs()).toContain(versionRows.toString());
  });
});

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
  firings: 1,
  shipped: 1,
  cost: 0.12,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  activity: [],
  tasks: [],
  flightLog: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 1,
    shipped: 1,
    openFindings: 0,
    cost: 0.12,
  },
  projects: [PROJECT],
  empty: false,
};

interface Routes {
  versions?: unknown;
  versionsOk?: boolean;
  diffs?: Array<{ ok: boolean; diff?: unknown }>;
}

/** Boots the real bundle on project p1; returns every URL it fetched. */
function boot(routes: Routes): string[] {
  const urls: string[] = [];
  const diffs = [...(routes.diffs ?? [])];
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    urls.push(url);
    if (url.startsWith('/api/versions/diff')) {
      const next = diffs.shift() ?? { ok: false };
      return { ok: next.ok, json: async () => ({ diff: next.diff ?? null }) };
    }
    if (url.startsWith('/api/versions')) {
      return {
        ok: routes.versionsOk ?? true,
        json: async () => ({ versions: routes.versions ?? null }),
      };
    }
    return { ok: true, json: async () => STATE };
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  return urls;
}

function panel(): HTMLElement {
  return document.querySelector('.versions-panel') as HTMLElement;
}

function firstToggle(): HTMLButtonElement {
  return panel().querySelector('.version-row .diff-toggle') as HTMLButtonElement;
}

describe('the VERSIONS panel in the served bundle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('draws MYTH, LEGACY and the flight log newest first in the Data tab', async () => {
    boot({ versions: TIMELINE });
    await vi.advanceTimersByTimeAsync(1);

    expect(panel().getAttribute('data-subject')).toBe('data');
    expect(panel().querySelector('h3 .heading-text')?.textContent).toBe('Versions');
    const rows = [...panel().querySelectorAll('.version-row')];
    expect(rows.map((r) => r.querySelector('.version-kind')?.textContent)).toEqual([
      'Flight',
      'Flight',
      'LEGACY · lock-on',
      'MYTH · original',
    ]);
    expect(rows.map((r) => r.querySelector('.version-sha')?.textContent)).toEqual([
      'ddddddd',
      'ccccccc',
      'bbbbbbb',
      'aaaaaaa',
    ]);
    // MYTH is the oldest version: nothing to compare it with.
    expect(rows.map((r) => r.querySelector('.diff-toggle') !== null)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it('opens what changed with one diff read, and closes it again', async () => {
    const urls = boot({ versions: TIMELINE, diffs: [{ ok: true, diff: DIFF }] });
    await vi.advanceTimersByTimeAsync(1);

    const toggle = firstToggle();
    const region = document.getElementById(
      toggle.getAttribute('aria-controls') ?? '',
    ) as HTMLElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(region.hidden).toBe(true);

    toggle.click();
    await vi.advanceTimersByTimeAsync(1);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('Hide changes');
    expect(region.hidden).toBe(false);
    expect(urls.filter((u) => u.startsWith('/api/versions/diff'))).toEqual([
      `/api/versions/diff?project=p1&from=${sha('c')}&to=${sha('d')}`,
    ]);
    expect(region.querySelector('p')?.textContent).toBe('Files changed: 2 · +3 −1');
    const files = [...region.querySelectorAll('.version-file')].map((li) => li.textContent);
    expect(files).toEqual(['src/a.ts+3 −1', 'logo.pngbinary']);

    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toBe('What changed');
    expect(region.hidden).toBe(true);

    toggle.click();
    await vi.advanceTimersByTimeAsync(1);
    expect(region.hidden).toBe(false);
    expect(urls.filter((u) => u.startsWith('/api/versions/diff'))).toHaveLength(1);
  });

  it('asks again on the next open after a diff read fails', async () => {
    const urls = boot({ versions: TIMELINE, diffs: [{ ok: false }, { ok: true, diff: DIFF }] });
    await vi.advanceTimersByTimeAsync(1);

    const toggle = firstToggle();
    toggle.click();
    await vi.advanceTimersByTimeAsync(1);
    const region = document.getElementById(
      toggle.getAttribute('aria-controls') ?? '',
    ) as HTMLElement;
    expect(region.textContent).toBe('Changes unavailable.');

    toggle.click();
    toggle.click();
    await vi.advanceTimersByTimeAsync(1);
    expect(urls.filter((u) => u.startsWith('/api/versions/diff'))).toHaveLength(2);
    expect(region.querySelectorAll('.version-file')).toHaveLength(2);
  });

  it('says an un-locked project has no versions yet', async () => {
    boot({ versions: { myth: TIMELINE.myth, legacy: null, flight: [], truncated: false } });
    await vi.advanceTimersByTimeAsync(1);

    const note = panel().querySelector('.versions-body p');
    expect(note?.getAttribute('data-i18n')).toBe('versionsNotLocked');
    expect(panel().querySelector('.version-row')).toBeNull();
  });

  it('says versions are unavailable when the read fails', async () => {
    boot({ versionsOk: false });
    await vi.advanceTimersByTimeAsync(1);

    expect(panel().querySelector('.versions-body p')?.textContent).toBe('Versions unavailable.');
  });

  it('notes a truncated flight log with how many versions it shows', async () => {
    boot({ versions: { ...TIMELINE, truncated: true } });
    await vi.advanceTimersByTimeAsync(1);

    const notes = [...panel().querySelectorAll('.versions-body > p')].map((p) => p.textContent);
    expect(notes).toEqual(['Showing the newest 2 flight versions.']);
  });

  it('switching to Hebrew repaints the chips, the toggle and the total, keeping its numbers', async () => {
    boot({ versions: TIMELINE, diffs: [{ ok: true, diff: DIFF }] });
    await vi.advanceTimersByTimeAsync(1);
    firstToggle().click();
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expect(panel().querySelector('.version-kind')?.textContent).toBe(STRINGS.he.versionsFlight);
    expect(firstToggle().textContent).toBe(STRINGS.he.versionsHideChanges);
    expect(panel().querySelector('.version-diff p')?.textContent).toBe('קבצים שהשתנו: 2 · +3 −1');
  });

  it('is axe-clean in the Data tab with a diff open', async () => {
    boot({ versions: TIMELINE, diffs: [{ ok: true, diff: DIFF }] });
    await vi.advanceTimersByTimeAsync(1);
    (document.querySelector('[data-subject-link="data"]') as HTMLAnchorElement).click();
    firstToggle().click();
    await vi.advanceTimersByTimeAsync(1);
    expect(panel().hasAttribute('data-subject-inactive')).toBe(false);
    expect(panel().querySelectorAll('.version-file')).toHaveLength(2);

    vi.useRealTimers(); // axe.run() schedules on real timers
    const results = await axe.run(panel(), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
