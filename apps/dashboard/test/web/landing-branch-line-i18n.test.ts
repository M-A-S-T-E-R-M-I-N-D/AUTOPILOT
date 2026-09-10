// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The LANDING panel's branch line (`landing.ts`'s `renderLandingBody()`: the
 * "branch → base" row above the commit list) carried three hardcoded English
 * tips ("Currently checked-out branch", "Merge direction: branch into base",
 * "Branch this would merge into") and three hardcoded aria-labels — two of
 * them built by concatenating a fixed "branch: " / "base branch: " prefix
 * onto the live ref name in plain JavaScript — while the panel's title,
 * status lines, debrief labels and Execute button had already been swept by
 * an earlier i18n slice (board web-msnsndki-dz3vn1).
 *
 * The panel is fetched once per open and NEVER swept after its body renders
 * (no translateDom() follows renderLandingBody), so every tip and aria here
 * is painted via tr() at build time AND tagged — `[data-i18n-tip]` on the
 * fixed tips, `[data-i18n-aria]` on the arrow's fixed aria, and
 * `[data-i18n-aria-template]`/`[data-i18n-name]` on the two `{name}`
 * prefixes (the shape `cardActivityAria`/`actMetaAria` established) — so a
 * mid-session locale switch flips all six in place. Drives the REAL client
 * bundle in jsdom against a mocked /api/state + /api/landing, the same
 * harness as landing-roving-tabindex.test.ts.
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
  firings: 0,
  shipped: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 1, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

const BRANCH = 'autopilot/flight';
const BASE = 'main';

const LANDING = {
  branch: BRANCH,
  base: BASE,
  commits: [{ shortSha: 'a1b2c3d', subject: 'feat: add landing card', files: ['a.ts'] }],
  diffstat: { filesChanged: 1, insertions: 4, deletions: 1 },
  overlaps: [],
};

const KEYS = [
  'landingBranchTip',
  'landingBranchAria',
  'landingBranchArrowTip',
  'landingBranchArrowAria',
  'landingBaseTip',
  'landingBaseAria',
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
    expect(document.querySelector('.landing-branch')).not.toBeNull();
  });
}

function clickLocale(locale: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${locale}"]`) as HTMLButtonElement).click();
}

function he(key: StringKey): string {
  return STRINGS.he[key];
}

function branchLine(): { branch: HTMLElement; arrow: HTMLElement; base: HTMLElement } {
  return {
    branch: q('.landing-branch-name'),
    arrow: q('.landing-branch-arrow'),
    base: q('.landing-base-name'),
  };
}

function expectHebrew(): void {
  const { branch, arrow, base } = branchLine();
  expect(branch.getAttribute('data-tip')).toBe(he('landingBranchTip'));
  expect(branch.getAttribute('aria-label')).toBe(
    he('landingBranchAria').replaceAll('{name}', BRANCH),
  );
  expect(arrow.getAttribute('data-tip')).toBe(he('landingBranchArrowTip'));
  expect(arrow.getAttribute('aria-label')).toBe(he('landingBranchArrowAria'));
  expect(base.getAttribute('data-tip')).toBe(he('landingBaseTip'));
  expect(base.getAttribute('aria-label')).toBe(he('landingBaseAria').replaceAll('{name}', BASE));
}

describe('LANDING panel branch line i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('all six keys exist in every locale, and the Hebrew table actually translates', () => {
    for (const key of KEYS) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale][key], `${locale}.${key}`).toBeTruthy();
      }
      expect(he(key), key).not.toBe(STRINGS.en[key]);
    }
    for (const key of ['landingBranchAria', 'landingBaseAria'] as const) {
      expect(STRINGS.en[key]).toContain('{name}');
      expect(STRINGS.he[key]).toContain('{name}');
    }
  });

  it('tags each field with its tip/aria keys, English byte-identical to before', async () => {
    await openLanding();

    const { branch, arrow, base } = branchLine();
    expect(branch.textContent).toBe(BRANCH);
    expect(branch.getAttribute('data-tip')).toBe('Currently checked-out branch');
    expect(branch.getAttribute('data-i18n-tip')).toBe('landingBranchTip');
    expect(branch.getAttribute('aria-label')).toBe('branch: ' + BRANCH);
    expect(branch.getAttribute('data-i18n-aria-template')).toBe('landingBranchAria');
    expect(branch.getAttribute('data-i18n-name')).toBe(BRANCH);

    expect(arrow.textContent).toBe('→');
    expect(arrow.getAttribute('data-tip')).toBe('Merge direction: branch into base');
    expect(arrow.getAttribute('data-i18n-tip')).toBe('landingBranchArrowTip');
    expect(arrow.getAttribute('aria-label')).toBe('merges into');
    expect(arrow.getAttribute('data-i18n-aria')).toBe('landingBranchArrowAria');

    expect(base.textContent).toBe(BASE);
    expect(base.getAttribute('data-tip')).toBe('Branch this would merge into');
    expect(base.getAttribute('data-i18n-tip')).toBe('landingBaseTip');
    expect(base.getAttribute('aria-label')).toBe('base branch: ' + BASE);
    expect(base.getAttribute('data-i18n-aria-template')).toBe('landingBaseAria');
    expect(base.getAttribute('data-i18n-name')).toBe(BASE);
  });

  it('switching to Hebrew flips all three tips and aria-labels in place, with no re-render', async () => {
    await openLanding();
    const before = branchLine();

    clickLocale('he');

    // Same nodes — the sweep repainted them; nothing rebuilt the line.
    const after = branchLine();
    expect(after.branch).toBe(before.branch);
    expect(after.arrow).toBe(before.arrow);
    expect(after.base).toBe(before.base);
    expectHebrew();
  });

  it('a saved Hebrew locale paints the line in Hebrew when it is first built — the panel is never swept after its fetch', async () => {
    localStorage.setItem('ap-locale', 'he');
    await openLanding();

    expect(document.documentElement.lang).toBe('he');
    expectHebrew();
  });

  it('switching back to English restores the exact original tips and aria-labels', async () => {
    await openLanding();

    clickLocale('he');
    clickLocale('en');

    const { branch, arrow, base } = branchLine();
    expect(branch.getAttribute('data-tip')).toBe('Currently checked-out branch');
    expect(branch.getAttribute('aria-label')).toBe('branch: ' + BRANCH);
    expect(arrow.getAttribute('data-tip')).toBe('Merge direction: branch into base');
    expect(arrow.getAttribute('aria-label')).toBe('merges into');
    expect(base.getAttribute('data-tip')).toBe('Branch this would merge into');
    expect(base.getAttribute('aria-label')).toBe('base branch: ' + BASE);
  });
});
