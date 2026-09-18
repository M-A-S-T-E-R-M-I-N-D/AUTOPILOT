// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Operator, 2026-09-18: "the panel should have a bit of margin — I dislike
 * the interaction of the round corners with the borders without any gap.
 * Also we can have a minimized version that keeps your status at the top;
 * if we exit or minimize, it retains our rank, or the decision to go
 * SOCIAL by logging in to GitHub."
 *
 * The ladder never hides any more. Minimised, it keeps its head — the
 * title and the badges, which ARE the rank — plus one strip line: how far
 * along, and whether the social half is open (GitHub connected) or one
 * press away. The head's own button and MY PROGRESS bring the steps back;
 * the choice is remembered per browser; a finished ladder starts minimised.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

const FLOWN_PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'registered',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 3,
  shipped: 1,
  cost: 1,
  tokensIn: 100,
  tokensOut: 50,
  shipRate: 0.33,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
  anomalies: [],
};

function state(projects: unknown[]) {
  return {
    generatedAt: 1,
    totals: {
      projects: projects.length,
      flying: 0,
      needsYou: 0,
      firings: 3,
      shipped: 1,
      openFindings: 0,
      cost: 1,
    },
    projects,
    empty: projects.length === 0,
  };
}

const ALL_MARKS = {
  'add-sample': 1,
  'read-back': 1,
  'connect-github': 1,
  'publish-finding': 1,
  'submit-fix': 1,
};

async function boot(projects: unknown[]): Promise<void> {
  document.open();
  document.write(renderShell());
  document.close();
  const payload = state(projects);
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => payload }) as Response);
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

const panel = (): HTMLElement => document.getElementById('onboarding') as HTMLElement;
const body = (): HTMLElement => document.getElementById('ob-body') as HTMLElement;
const strip = (): HTMLElement => document.getElementById('ob-strip') as HTMLElement;
const minimize = (): HTMLButtonElement =>
  document.getElementById('ob-minimize') as HTMLButtonElement;
const collapsed = (): boolean => panel().classList.contains('is-collapsed');

describe('the ladder minimises instead of hiding', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('the head button folds the steps, keeps the badges and the strip, flips its aria state, and is remembered', async () => {
    await boot([]);
    expect(collapsed()).toBe(false);
    expect(minimize().getAttribute('aria-expanded')).toBe('true');
    expect(minimize().getAttribute('aria-label')).toBe(STRINGS.en.obMinimize);

    minimize().click();

    expect(collapsed()).toBe(true);
    expect(body().hidden).toBe(true);
    expect(strip().hidden).toBe(false);
    expect(document.getElementById('ob-badges')?.closest('[hidden]')).toBeNull();
    expect(minimize().getAttribute('aria-expanded')).toBe('false');
    expect(minimize().getAttribute('aria-label')).toBe(STRINGS.en.obExpand);
    expect(localStorage.getItem('ap-ob-collapsed')).toBe('1');

    minimize().click();
    expect(collapsed()).toBe(false);
    expect(body().hidden).toBe(false);
    expect(localStorage.getItem('ap-ob-collapsed')).toBe('0');
  });

  it('a remembered minimise survives a reload; expanding again clears a snooze too', async () => {
    localStorage.setItem('ap-ob-collapsed', '1');
    localStorage.setItem('ap-ob-snooze', 'forever');
    await boot([]);
    expect(collapsed()).toBe(true);

    minimize().click();

    expect(collapsed()).toBe(false);
    expect(localStorage.getItem('ap-ob-snooze')).toBeNull();
  });

  it('the strip says how far along, and that the social half is open once GitHub is connected', async () => {
    localStorage.setItem('ap-ob-marks', JSON.stringify(ALL_MARKS));
    await boot([FLOWN_PROJECT]);
    expect(collapsed()).toBe(true);
    const text = document.getElementById('ob-strip-text')!;
    expect(text.textContent).toBe(STRINGS.en.obStripDone.replace('{total}', '7'));
    expect((document.getElementById('ob-strip-social-on') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('ob-strip-social') as HTMLElement).hidden).toBe(true);
    const badges = Array.from(document.querySelectorAll('#ob-badges .ob-badge'));
    expect(badges.length).toBe(2);
    expect(badges.every((b) => b.classList.contains('is-earned'))).toBe(true);
  });

  it('without GitHub the strip offers the way to go social, and pressing it opens the Connect popover', async () => {
    localStorage.setItem('ap-ob-collapsed', '1');
    await boot([]);
    const text = document.getElementById('ob-strip-text')!;
    expect(text.textContent).toBe(
      STRINGS.en.obProgress.replace('{done}', '0').replace('{total}', '7'),
    );
    const social = document.getElementById('ob-strip-social') as HTMLButtonElement;
    expect(social.hidden).toBe(false);
    expect(social.textContent).toBe(STRINGS.en.obSocialOff);
    expect((document.getElementById('ob-strip-social-on') as HTMLElement).hidden).toBe(true);

    social.click();

    expect((document.getElementById('connect') as HTMLDetailsElement).open).toBe(true);
  });

  it('the panel is inset by the page gutter, so its rounded corners never touch the rail or sidebar borders', () => {
    const css = layoutCss();
    expect(css).toContain('.onboarding { margin: var(--space-3) var(--page-inline) 0;');
    expect(css).toContain('.onboarding.is-collapsed .ob-tip');
    expect(css).toContain('.ob-body[hidden] { display: none; }');
  });

  it('every new word exists in both locales', () => {
    for (const key of [
      'obMinimize',
      'obExpand',
      'obMinimizeTip',
      'obStripDone',
      'obSocialOn',
      'obSocialOff',
    ] as const) {
      expect(STRINGS.en[key], key).toBeTruthy();
      expect(STRINGS.he[key], key).toBeTruthy();
    }
  });
});
