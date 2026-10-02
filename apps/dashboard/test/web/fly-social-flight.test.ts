// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0016 "The GitHub Social Flight", slice 3/6's fly-bar toggle (board
 * web-mtpzzx7v-72q2dv): `StartFlightInput.socialFlight` already carried one
 * flight's own `AUTOPILOT_SOCIAL_FLIGHT` override from the HTTP body to the
 * spawned child, but nothing an operator could click ever set it. Drives the
 * REAL client bundle in jsdom (the same harness `fly-lanes.test.ts` uses)
 * through the Social pass select to prove the launch body actually carries
 * the choice — and that leaving it on the default sends exactly the body
 * every launch sent before this control existed.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { flyJs } from '../../src/web/features/fly.js';
import { parseSocialFlightToggle } from '../../src/flight/social-flight-trigger.js';

interface RecordedCall {
  readonly href: string;
  readonly method: string;
  readonly body: Record<string, unknown> | null;
}

const FLEET_STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [] as unknown[],
  empty: true,
};

function mockFetch(calls: RecordedCall[]): void {
  globalThis.fetch = ((input: unknown, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : (input as Request).url;
    const method = (init && init.method) || 'GET';
    if (href.includes('/api/fly') && method === 'GET') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ running: false, paused: false }),
      } as unknown as Response);
    }
    if (href.endsWith('/api/fly') || href.endsWith('/api/fleet')) {
      calls.push({
        href,
        method,
        body:
          init && typeof init.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : null,
      });
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ started: true, ok: true, lines: ['fleet: 2 lane(s)'] }),
      } as unknown as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(FLEET_STATE),
    } as unknown as Response);
  }) as unknown as typeof fetch;
}

async function boot(calls: RecordedCall[]): Promise<void> {
  mockFetch(calls);
  document.open();
  document.write(renderShell());
  document.close();
  new Function(clientJs())();
  await vi.waitFor(() => {
    expect(document.getElementById('fly-go')).not.toBeNull();
  });
}

function socialSelect(): HTMLSelectElement {
  return document.getElementById('fly-social') as HTMLSelectElement;
}

function fillAndSubmit(): void {
  (document.getElementById('fly-folder') as HTMLInputElement).value = '/srv/projects/checkout-web';
  (document.getElementById('fly-go') as HTMLButtonElement).click();
}

async function singleLaunch(calls: RecordedCall[]): Promise<RecordedCall | undefined> {
  await vi.waitFor(() => {
    expect(calls.some((c) => c.href.endsWith('/api/fly') && c.method === 'POST')).toBe(true);
  });
  return calls.find((c) => c.href.endsWith('/api/fly') && c.method === 'POST');
}

describe('FLY-BAR Social pass select (epic 0016 slice 3, board web-mtpzzx7v-72q2dv)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a labelled select inside the launch settings, offering the default plus the four toggle values', async () => {
    await boot([]);
    const select = socialSelect();
    expect(select).not.toBeNull();
    expect(document.getElementById('fly-options')?.contains(select)).toBe(true);
    expect(document.querySelector('label[for="fly-social"]')?.textContent?.trim()).toBe(
      STRINGS.en.socialPass,
    );
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      '',
      'off',
      'start',
      'end',
      'full',
    ]);
    expect(select.value).toBe('');
  });

  it('is axe-clean with the launch settings open (the static-shell axe pass sees them hidden)', async () => {
    await boot([]);
    (document.getElementById('fly-options-toggle') as HTMLButtonElement).click();
    expect(document.getElementById('fly-options')?.hidden).toBe(false);

    const results = await axe.run(document.getElementById('flightbar') as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  it('offers only values the server-side fail-closed parse keeps as they are', () => {
    // A value the parse would rewrite to 'off' would launch something other
    // than what the operator picked — every non-default option must survive it.
    for (const value of ['off', 'start', 'end', 'full']) {
      expect(parseSocialFlightToggle(value)).toBe(value);
    }
  });

  it('left on the default sends the same launch body as before, with no socialFlight key', async () => {
    const calls: RecordedCall[] = [];
    await boot(calls);
    fillAndSubmit();

    const launch = await singleLaunch(calls);
    expect(launch?.body).toEqual({
      folder: '/srv/projects/checkout-web',
      firings: 1,
      budgetUsd: 10,
    });
  });

  it('a chosen value rides the single-flight launch body as socialFlight', async () => {
    const calls: RecordedCall[] = [];
    await boot(calls);
    socialSelect().value = 'full';
    fillAndSubmit();

    const launch = await singleLaunch(calls);
    expect(launch?.body).toEqual({
      folder: '/srv/projects/checkout-web',
      firings: 1,
      budgetUsd: 10,
      socialFlight: 'full',
    });
  });

  it('rides the total-spend launch body too', async () => {
    const calls: RecordedCall[] = [];
    await boot(calls);
    (document.getElementById('fly-mode') as HTMLSelectElement).value = 'total';
    socialSelect().value = 'off';
    fillAndSubmit();

    const launch = await singleLaunch(calls);
    expect(launch?.body).toMatchObject({ totalBudgetUsd: 30, socialFlight: 'off' });
  });

  it('refuses a chosen value with lanes above 1 instead of silently launching the fleet without it', async () => {
    const calls: RecordedCall[] = [];
    await boot(calls);
    (document.getElementById('fly-lanes') as HTMLInputElement).value = '2';
    socialSelect().value = 'start';
    fillAndSubmit();

    await vi.waitFor(() => {
      expect(document.getElementById('fly-status')?.textContent).toBe(
        STRINGS.en.socialPassSingleLane,
      );
    });
    expect(calls.some((c) => c.href.endsWith('/api/fleet') || c.href.endsWith('/api/fly'))).toBe(
      false,
    );
  });

  it('explains itself on hover/focus, in every locale', () => {
    expect(flyJs()).toContain("setTip(socialEl, 'flySocialTip');");
    expect(STRINGS.en.flySocialTip).toContain('gh');
    for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
      for (const key of [
        'socialPass',
        'socialPassDefault',
        'socialPassOff',
        'socialPassStart',
        'socialPassEnd',
        'socialPassFull',
        'flySocialTip',
        'socialPassSingleLane',
      ] as const) {
        expect(STRINGS[locale][key], `${locale}.${key}`).toBeTruthy();
      }
    }
  });
});
