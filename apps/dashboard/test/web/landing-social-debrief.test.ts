// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The FLIGHT DEBRIEF panel's SOCIAL line (epic 0016 slice 5/6, board
 * web-mtpzzxw4-au1b6x: "a SOCIAL section in the debrief (what was
 * said/filed/closed, caps consumed)"). fly.ts persists the flight's SOCIAL
 * digest as a `social-debrief` event; `GET /api/landing` serves the latest
 * flight's one beside `landing`; `flightDebriefSocialItems`
 * (`web/flight-debrief.ts`) turns it into chips. The pure half is pinned
 * against the real English table; the rendered half drives the REAL client
 * bundle in jsdom against a mocked /api/state + /api/landing — the
 * landing-commit-debrief-i18n.test.ts harness — including a saved Hebrew
 * locale and an axe pass over the panel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import {
  flightDebriefSocialItems,
  type FlightDebriefTranslator,
  type SocialFlightDebriefLike,
} from '../../src/web/flight-debrief.js';

const waitFor = <T>(probe: () => T | Promise<T>): Promise<T> =>
  vi.waitFor(probe, { timeout: 5000 });

const DIGEST: SocialFlightDebriefLike = {
  passesRan: 2,
  skippedForeignTarget: 0,
  skippedGhDisconnected: 1,
  newIssuesAllowed: 1,
  newIssueBudget: 4,
  commentsAllowed: 0,
  commentBudget: 10,
  queued: 1,
  duplicate: 0,
  refused: 2,
};

const SILENT_PASSES: SocialFlightDebriefLike = {
  ...DIGEST,
  passesRan: 0,
  skippedGhDisconnected: 0,
  skippedForeignTarget: 3,
  newIssuesAllowed: 0,
  newIssueBudget: 0,
  commentBudget: 0,
  queued: 0,
  refused: 0,
};

/** The real `tr()`'s substitution over one locale's real table. */
function trFor(locale: keyof typeof STRINGS): FlightDebriefTranslator {
  return (key, subs) =>
    STRINGS[locale][key].replace(/\{(\w+)\}/g, (whole, name: string) =>
      subs && subs[name] !== undefined ? String(subs[name]) : whole,
    );
}

describe('flightDebriefSocialItems', () => {
  it("renders the flight log's SOCIAL line as chips, in its order", () => {
    const items = flightDebriefSocialItems(DIGEST, trFor('en'));
    expect(items.map((i) => i[0])).toEqual([
      '2 social passes',
      'caps: 1/4 new issues, 0/10 comments',
      '1 queued, 0 duplicate, 2 refused',
      '1 skipped (gh not connected)',
      'nothing posted',
    ]);
    // Every chip explains itself, and its aria-label is its own text.
    for (const [text, tip, aria] of items) {
      expect(tip.length).toBeGreaterThan(0);
      expect(aria).toBe(text);
    }
  });

  it('shows caps and verdicts only when a pass ran — a 0/0 budget is not a reading', () => {
    const items = flightDebriefSocialItems(SILENT_PASSES, trFor('en'));
    expect(items.map((i) => i[0])).toEqual([
      '0 social passes',
      '3 skipped (foreign target)',
      'nothing posted',
    ]);
  });

  it('takes the singular for exactly one pass', () => {
    expect(flightDebriefSocialItems({ ...DIGEST, passesRan: 1 }, trFor('en'))[0]?.[0]).toBe(
      '1 social pass',
    );
  });

  it('every SOCIAL key is translated in Hebrew, placeholders kept', () => {
    const keys = [
      'landingDebriefSocialLabel',
      'flightDebriefSocialPassSingular',
      'flightDebriefSocialPassPlural',
      'flightDebriefSocialPassTip',
      'flightDebriefSocialCaps',
      'flightDebriefSocialCapsTip',
      'flightDebriefSocialVerdicts',
      'flightDebriefSocialVerdictsTip',
      'flightDebriefSocialSkippedForeign',
      'flightDebriefSocialSkippedForeignTip',
      'flightDebriefSocialSkippedGh',
      'flightDebriefSocialSkippedGhTip',
      'flightDebriefSocialReadOnly',
      'flightDebriefSocialReadOnlyTip',
    ] as const;
    for (const key of keys) {
      expect(STRINGS.he[key], key).toBeTruthy();
      expect(STRINGS.he[key], key).not.toBe(STRINGS.en[key]);
      const placeholders = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(placeholders(STRINGS.he[key]), key).toEqual(placeholders(STRINGS.en[key]));
    }
  });
});

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
  firings: 1,
  shipped: 1,
  cost: 1,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
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
  ],
  activity: [],
  tasks: [],
};

const LANDING = {
  branch: 'autopilot/flight',
  base: 'main',
  commits: [{ shortSha: 'a1b2c3d', subject: 'feat: x', files: ['a.ts'] }],
  diffstat: { filesChanged: 1, insertions: 1, deletions: 0 },
  overlaps: [],
};

function boot(landingBody: unknown, flightLog: readonly unknown[] = PROJECT.flightLog): void {
  const state = {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 1,
      needsYou: 0,
      firings: 1,
      shipped: 1,
      openFindings: 0,
      cost: 1,
    },
    projects: [{ ...PROJECT, flightLog }],
    empty: false,
  };
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/landing')) {
      return { ok: true, json: async () => landingBody } as unknown as Response;
    }
    return { ok: true, json: async () => state } as unknown as Response;
  });
  new Function(clientJs())();
}

function socialLine(): HTMLElement {
  const line = document.querySelector<HTMLElement>('.flight-debrief-social');
  expect(line).not.toBeNull();
  return line as HTMLElement;
}

describe('FLIGHT DEBRIEF SOCIAL line, rendered', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the served digest under the debrief, icon-led, every chip tipped', async () => {
    boot({ landing: LANDING, socialDebrief: DIGEST });
    await waitFor(() => socialLine());
    const line = socialLine();
    expect(line.closest('.flight-debrief')).not.toBeNull();
    expect(line.querySelector('svg.icon-message-circle')).not.toBeNull();
    expect(line.querySelector('.flight-debrief-label')?.textContent).toBe('Social: ');
    const chips = [...line.querySelectorAll<HTMLElement>('.chip')];
    expect(chips.map((c) => c.textContent)).toEqual([
      '2 social passes',
      'caps: 1/4 new issues, 0/10 comments',
      '1 queued, 0 duplicate, 2 refused',
      '1 skipped (gh not connected)',
      'nothing posted',
    ]);
    expect(chips[chips.length - 1]?.getAttribute('data-tip')).toBe(
      STRINGS.en.flightDebriefSocialReadOnlyTip,
    );
    // One roving tab stop for the whole line, like the debrief's other chip rows.
    expect(chips.filter((c) => c.getAttribute('tabindex') === '0')).toHaveLength(1);
  });

  it('renders no SOCIAL line when the flight served no digest', async () => {
    boot({ landing: LANDING });
    await waitFor(() => {
      expect(document.querySelector('.flight-debrief')).not.toBeNull();
    });
    expect(document.querySelector('.flight-debrief-social')).toBeNull();
  });

  it('still debriefs a flight that fired nothing but ran its social passes', async () => {
    boot({ landing: null, socialDebrief: DIGEST }, []);
    await waitFor(() => socialLine());
    const debrief = socialLine().closest('.flight-debrief') as HTMLElement;
    expect(debrief.querySelector('.flight-debrief-title')).not.toBeNull();
    expect(debrief.querySelector('.flight-debrief-chips')).toBeNull();
  });

  it('a saved Hebrew locale paints the line in Hebrew when it is first built', async () => {
    localStorage.setItem('ap-locale', 'he');
    boot({ landing: LANDING, socialDebrief: DIGEST });
    await waitFor(() => socialLine());
    const line = socialLine();
    expect(line.querySelector('.flight-debrief-label')?.textContent).toBe(
      STRINGS.he.landingDebriefSocialLabel,
    );
    const chips = [...line.querySelectorAll<HTMLElement>('.chip')];
    expect(chips[chips.length - 1]?.textContent).toBe(STRINGS.he.flightDebriefSocialReadOnly);
  });

  it('is axe-clean', async () => {
    boot({ landing: LANDING, socialDebrief: DIGEST });
    await waitFor(() => socialLine());
    const results = await axe.run(socialLine().closest('.flight-debrief') as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
