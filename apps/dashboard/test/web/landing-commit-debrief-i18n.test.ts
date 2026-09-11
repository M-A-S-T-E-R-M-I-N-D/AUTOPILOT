// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The LANDING panel's commit rows (`landing.ts`'s `landingCommitRow()`) and
 * flight-debrief best/worst lines (`flightDebriefSection()`) carried the
 * panel's last hardcoded English after the branch-line slice
 * (landing-branch-line-i18n.test.ts): the sha's "Abbreviated commit hash"
 * tip and "commit <sha>" aria, the subject's "What this commit changed" tip,
 * the files span's "<n> files changed" aria, and the debrief's "The most
 * cost-efficient shipped firing this flight" / "The priciest firing that did
 * not ship this flight" tips with their "best firing: " / "worst firing: "
 * aria prefixes — all built in plain JavaScript (board web-msnsndki-dz3vn1).
 *
 * The panel is fetched once per open and NEVER swept after its body renders
 * (no translateDom() follows renderLandingBody), so every tip and aria here
 * is painted via tr() at build time AND tagged — `[data-i18n-tip]` on the
 * fixed tips, `[data-i18n-aria-template]` + `[data-i18n-name]` on the three
 * `{name}` prefixes (sha, best, worst), and `[data-i18n-aria-template]` +
 * `[data-i18n-args]` on the files count's `{n}` (the `flightGuardChipAria`
 * shape) — so a mid-session locale switch flips all of them in place. The
 * subject's aria IS the subject text (a live value) and stays untagged.
 * Drives the REAL client bundle in jsdom against a mocked /api/state +
 * /api/landing, the same harness as landing-branch-line-i18n.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: false,
  firings: 2,
  shipped: 1,
  cost: 3,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: 0.5,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  // One shipped firing (the debrief's "best") and one unshipped firing (its
  // "worst") so BOTH debrief lines render.
  flightLog: [
    {
      shipped: true,
      gateResult: null,
      died: null,
      cost: 1,
      durationMs: 100,
      guardDenials: 0,
      autoformatRescued: false,
    },
    {
      shipped: false,
      gateResult: null,
      died: null,
      cost: 2,
      durationMs: 50,
      guardDenials: 0,
      autoformatRescued: false,
    },
  ],
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 1, needsYou: 0, firings: 2, shipped: 1, openFindings: 0, cost: 3 },
  projects: [PROJECT],
  empty: false,
};

const SHA = 'a1b2c3d';
const SUBJECT = 'feat: add landing card';
const FILES = ['a.ts', 'b.ts'];

const LANDING = {
  branch: 'autopilot/flight',
  base: 'main',
  commits: [{ shortSha: SHA, subject: SUBJECT, files: FILES }],
  diffstat: { filesChanged: 2, insertions: 4, deletions: 1 },
  overlaps: [],
};

const KEYS = [
  'landingCommitShaTip',
  'landingCommitShaAria',
  'landingCommitSubjectTip',
  'landingCommitFilesAria',
  'landingDebriefBestTip',
  'landingDebriefBestAria',
  'landingDebriefWorstTip',
  'landingDebriefWorstAria',
] as const;

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/landing')) {
      return { ok: true, json: async () => ({ landing: LANDING }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

function q(selector: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(selector);
  expect(node, selector).not.toBeNull();
  return node as HTMLElement;
}

async function openLanding(): Promise<void> {
  boot();
  await vi.waitFor(() => {
    expect(document.querySelector('.landing-commit-sha')).not.toBeNull();
  });
}

function clickLocale(locale: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${locale}"]`) as HTMLButtonElement).click();
}

function he(key: StringKey): string {
  return STRINGS.he[key];
}

interface Nodes {
  sha: HTMLElement;
  subject: HTMLElement;
  files: HTMLElement;
  best: HTMLElement;
  worst: HTMLElement;
}

function nodes(): Nodes {
  return {
    sha: q('.landing-commit-sha'),
    subject: q('.landing-commit-subject'),
    files: q('.landing-commit-files'),
    best: q('.flight-debrief-best [tabindex]'),
    worst: q('.flight-debrief-worst [tabindex]'),
  };
}

function expectEnglish(): void {
  const { sha, subject, files, best, worst } = nodes();
  expect(sha.getAttribute('data-tip')).toBe('Abbreviated commit hash');
  expect(sha.getAttribute('aria-label')).toBe('commit ' + SHA);
  expect(subject.getAttribute('data-tip')).toBe('What this commit changed');
  expect(subject.getAttribute('aria-label')).toBe(SUBJECT);
  expect(files.getAttribute('aria-label')).toBe(FILES.length + ' files changed');
  expect(best.getAttribute('data-tip')).toBe('The most cost-efficient shipped firing this flight');
  expect(best.getAttribute('aria-label')).toBe('best firing: ' + best.textContent);
  expect(worst.getAttribute('data-tip')).toBe('The priciest firing that did not ship this flight');
  expect(worst.getAttribute('aria-label')).toBe('worst firing: ' + worst.textContent);
}

function expectHebrew(): void {
  const { sha, subject, files, best, worst } = nodes();
  expect(sha.getAttribute('data-tip')).toBe(he('landingCommitShaTip'));
  expect(sha.getAttribute('aria-label')).toBe(he('landingCommitShaAria').replaceAll('{name}', SHA));
  expect(subject.getAttribute('data-tip')).toBe(he('landingCommitSubjectTip'));
  // The subject's aria is the subject itself — a live value, never swept.
  expect(subject.getAttribute('aria-label')).toBe(SUBJECT);
  expect(files.getAttribute('aria-label')).toBe(
    he('landingCommitFilesAria').replaceAll('{n}', String(FILES.length)),
  );
  expect(best.getAttribute('data-tip')).toBe(he('landingDebriefBestTip'));
  expect(best.getAttribute('aria-label')).toBe(
    he('landingDebriefBestAria').replaceAll('{name}', best.textContent ?? ''),
  );
  expect(worst.getAttribute('data-tip')).toBe(he('landingDebriefWorstTip'));
  expect(worst.getAttribute('aria-label')).toBe(
    he('landingDebriefWorstAria').replaceAll('{name}', worst.textContent ?? ''),
  );
}

describe('LANDING panel commit-row + debrief best/worst i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('all eight keys exist in every locale, and the Hebrew table actually translates', () => {
    for (const key of KEYS) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale][key], `${locale}.${key}`).toBeTruthy();
      }
      expect(he(key), key).not.toBe(STRINGS.en[key]);
    }
    for (const key of [
      'landingCommitShaAria',
      'landingDebriefBestAria',
      'landingDebriefWorstAria',
    ] as const) {
      expect(STRINGS.en[key]).toContain('{name}');
      expect(STRINGS.he[key]).toContain('{name}');
    }
    expect(STRINGS.en.landingCommitFilesAria).toContain('{n}');
    expect(STRINGS.he.landingCommitFilesAria).toContain('{n}');
  });

  it('tags each field with its tip/aria keys, English byte-identical to before', async () => {
    await openLanding();
    expectEnglish();

    const { sha, subject, files, best, worst } = nodes();
    expect(sha.textContent).toBe(SHA);
    expect(sha.getAttribute('data-i18n-tip')).toBe('landingCommitShaTip');
    expect(sha.getAttribute('data-i18n-aria-template')).toBe('landingCommitShaAria');
    expect(sha.getAttribute('data-i18n-name')).toBe(SHA);

    expect(subject.textContent).toBe(SUBJECT);
    expect(subject.getAttribute('data-i18n-tip')).toBe('landingCommitSubjectTip');
    expect(subject.hasAttribute('data-i18n-aria')).toBe(false);
    expect(subject.hasAttribute('data-i18n-aria-template')).toBe(false);

    expect(files.getAttribute('data-i18n-aria-template')).toBe('landingCommitFilesAria');
    expect(JSON.parse(files.getAttribute('data-i18n-args') ?? '{}')).toEqual({ n: FILES.length });

    expect(best.textContent).toBeTruthy();
    expect(best.getAttribute('data-i18n-tip')).toBe('landingDebriefBestTip');
    expect(best.getAttribute('data-i18n-aria-template')).toBe('landingDebriefBestAria');
    expect(best.getAttribute('data-i18n-name')).toBe(best.textContent);

    expect(worst.textContent).toBeTruthy();
    expect(worst.getAttribute('data-i18n-tip')).toBe('landingDebriefWorstTip');
    expect(worst.getAttribute('data-i18n-aria-template')).toBe('landingDebriefWorstAria');
    expect(worst.getAttribute('data-i18n-name')).toBe(worst.textContent);
  });

  it('switching to Hebrew flips every tip and aria-label in place, with no re-render', async () => {
    await openLanding();
    const before = nodes();

    clickLocale('he');

    // Same nodes — the sweep repainted them; nothing rebuilt the panel.
    const after = nodes();
    expect(after.sha).toBe(before.sha);
    expect(after.subject).toBe(before.subject);
    expect(after.files).toBe(before.files);
    expect(after.best).toBe(before.best);
    expect(after.worst).toBe(before.worst);
    expectHebrew();
  });

  it('a saved Hebrew locale paints the rows in Hebrew when they are first built — the panel is never swept after its fetch', async () => {
    localStorage.setItem('ap-locale', 'he');
    await openLanding();

    expect(document.documentElement.lang).toBe('he');
    expectHebrew();
  });

  it('switching back to English restores the exact original tips and aria-labels', async () => {
    await openLanding();

    clickLocale('he');
    clickLocale('en');

    expectEnglish();
  });
});
