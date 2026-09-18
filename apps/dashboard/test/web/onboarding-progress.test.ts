// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Operator, 2026-09-18: "I don't understand or know how I can open it again
 * to get an overview, to check that I really have everything and what my
 * rank is." The ladder hid itself for good once both ticks were earned and
 * for the day after "Remind me later", with no way back but the tour's
 * hand-over. The more menu now carries MY PROGRESS: it reopens the ladder
 * at any time — snoozed or finished — with every tick, the badges and the
 * standing, and a finished ladder says so instead of pretending there is
 * still something to do.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

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

/** The four marks no poll can tell, plus the GitHub one — every step done
 *  once the fleet also has a flown project. */
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
const progressBtn = (): HTMLButtonElement =>
  document.getElementById('progress-btn') as HTMLButtonElement;

describe('MY PROGRESS reopens the ladder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('the more menu carries the entry, with its words in both locales', () => {
    const page = renderShell();
    expect(page).toContain('id="progress-btn"');
    expect(page).toContain('data-i18n="progressBtn"');
    expect(page).toContain(`data-tip="${STRINGS.en.progressBtnTip}"`);
    for (const key of ['progressBtn', 'progressBtnTip', 'obComplete'] as const) {
      expect(STRINGS.en[key], key).toBeTruthy();
      expect(STRINGS.he[key], key).toBeTruthy();
    }
  });

  it('a FINISHED ladder starts MINIMIZED — rank at the top, steps folded — and expands complete on request', async () => {
    localStorage.setItem('ap-ob-marks', JSON.stringify(ALL_MARKS));
    await boot([FLOWN_PROJECT]);
    expect(panel().hidden).toBe(false);
    expect(panel().classList.contains('is-collapsed')).toBe(true);
    expect((document.getElementById('ob-body') as HTMLElement).hidden).toBe(true);

    progressBtn().click();

    expect(panel().hidden).toBe(false);
    expect(panel().classList.contains('is-collapsed')).toBe(false);
    expect((document.getElementById('ob-body') as HTMLElement).hidden).toBe(false);
    const done = document.getElementById('ob-complete') as HTMLElement;
    expect(done.hidden).toBe(false);
    expect(done.textContent).toBe(STRINGS.en.obComplete);
    const steps = Array.from(document.querySelectorAll('#ob-steps .ob-step'));
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) expect(step.classList.contains('is-done')).toBe(true);
    expect(document.activeElement?.id).toBe('ob-title');
  });

  it('a SNOOZED ladder is minimised, expands on request with the snooze cleared, and "Remind me later" minimises it again', async () => {
    localStorage.setItem('ap-ob-snooze', 'forever');
    await boot([]);
    expect(panel().hidden).toBe(false);
    expect(panel().classList.contains('is-collapsed')).toBe(true);

    progressBtn().click();

    expect(panel().classList.contains('is-collapsed')).toBe(false);
    expect(localStorage.getItem('ap-ob-snooze')).toBeNull();
    expect((document.getElementById('ob-complete') as HTMLElement).hidden).toBe(true);

    (document.getElementById('ob-snooze') as HTMLButtonElement).click();
    expect(panel().hidden).toBe(false);
    expect(panel().classList.contains('is-collapsed')).toBe(true);
  });

  it('an unfinished, unsnoozed ladder still shows open on its own — the entry changes nothing there', async () => {
    await boot([]);
    expect(panel().hidden).toBe(false);
    expect(panel().classList.contains('is-collapsed')).toBe(false);
    expect((document.getElementById('ob-complete') as HTMLElement).hidden).toBe(true);
  });
});
