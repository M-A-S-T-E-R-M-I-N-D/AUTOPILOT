// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0036's per-lane pilot, the fly bar's half (GitHub #21 slice S-last):
 * `POST /api/fly` already took `engine` and `engineModel` and refused what the
 * `AUTOPILOT_ENGINE` levers refuse (`firingEngineFromRequest`), but nothing an
 * operator could click ever sent them. Drives the REAL client bundle in jsdom
 * (the harness `fly-social-flight.test.ts` uses) through the Engine select and
 * its model field to prove the launch body carries the choice, and that
 * leaving the select on its default sends exactly the body every launch sent
 * before this control existed.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { flyJs } from '../../src/web/features/fly.js';
import { firingEngineFromRequest } from '../../src/flight/firing-engine.js';

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

const IDLE = { running: false, paused: false };

function mockFetch(calls: RecordedCall[], flyStatus: unknown): void {
  globalThis.fetch = ((input: unknown, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : (input as Request).url;
    const method = (init && init.method) || 'GET';
    if (href.includes('/api/fly') && method === 'GET') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(flyStatus),
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

async function boot(calls: RecordedCall[], flyStatus: unknown = IDLE): Promise<void> {
  mockFetch(calls, flyStatus);
  document.open();
  document.write(renderShell());
  document.close();
  new Function(clientJs())();
  await vi.waitFor(() => {
    expect(document.getElementById('fly-go')).not.toBeNull();
  });
}

function engineSelect(): HTMLSelectElement {
  return document.getElementById('fly-engine') as HTMLSelectElement;
}

function modelInput(): HTMLInputElement {
  return document.getElementById('fly-engine-model') as HTMLInputElement;
}

function chooseEngine(engine: string): void {
  engineSelect().value = engine;
  engineSelect().dispatchEvent(new Event('change'));
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

async function refusedWith(calls: RecordedCall[], message: string): Promise<void> {
  await vi.waitFor(() => {
    expect(document.getElementById('fly-status')?.textContent).toBe(message);
  });
  expect(calls.some((c) => c.href.endsWith('/api/fleet') || c.href.endsWith('/api/fly'))).toBe(
    false,
  );
}

/** The poll answer that gives `folder` a paused row, whose Resume relaunches
 *  it through the same submit path as Fire. */
function pausedFlight(folder: string): unknown {
  return {
    flights: [
      {
        running: false,
        folder,
        firings: 1,
        paused: true,
        startedAt: null,
        totalBudgetUsd: null,
        pid: null,
      },
    ],
  };
}

async function resume(): Promise<void> {
  await vi.waitFor(() => {
    expect(document.querySelector('.fly-flight-resume')).not.toBeNull();
  });
  (document.querySelector('.fly-flight-resume') as HTMLButtonElement).click();
}

describe('FLY-BAR Engine select (epic 0036, GitHub #21 slice S-last)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a labelled select inside the launch settings, offering the default plus the three engines', async () => {
    await boot([]);
    const select = engineSelect();
    expect(select).not.toBeNull();
    expect(document.getElementById('fly-options')?.contains(select)).toBe(true);
    expect(document.querySelector('label[for="fly-engine"]')?.textContent?.trim()).toBe(
      STRINGS.en.engine,
    );
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      '',
      'claude',
      'codex',
      'gemini',
    ]);
    expect(select.value).toBe('');
  });

  it('offers only engines the server-side request parse accepts', () => {
    // An option the server refuses outright would be a dead choice in the UI.
    expect(firingEngineFromRequest('claude', undefined)).toEqual({
      ok: true,
      route: { engine: 'claude' },
    });
    expect(firingEngineFromRequest('codex', 'gpt-5-codex')).toMatchObject({ ok: true });
    expect(firingEngineFromRequest('gemini', 'gemini-2.5-pro')).toMatchObject({ ok: true });
  });

  it('shows the model field only while Codex or Gemini is chosen', async () => {
    await boot([]);
    const label = document.querySelector('label[for="fly-engine-model"]') as HTMLLabelElement;
    expect(document.getElementById('fly-options')?.contains(modelInput())).toBe(true);
    expect(label.textContent?.trim()).toBe(STRINGS.en.engineModel);
    expect(modelInput().hidden).toBe(true);
    expect(label.hidden).toBe(true);

    chooseEngine('codex');
    expect(modelInput().hidden).toBe(false);
    expect(label.hidden).toBe(false);

    chooseEngine('claude');
    expect(modelInput().hidden).toBe(true);

    chooseEngine('gemini');
    expect(modelInput().hidden).toBe(false);

    chooseEngine('');
    expect(modelInput().hidden).toBe(true);
    expect(label.hidden).toBe(true);
  });

  it('is axe-clean with the launch settings open and the model field shown', async () => {
    await boot([]);
    (document.getElementById('fly-options-toggle') as HTMLButtonElement).click();
    chooseEngine('codex');
    expect(document.getElementById('fly-options')?.hidden).toBe(false);

    const results = await axe.run(document.getElementById('flightbar') as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  it('left on the default sends the same launch body as before, with no engine keys', async () => {
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

  it('a chosen Codex engine and its model ride the single-flight launch body', async () => {
    const calls: RecordedCall[] = [];
    await boot(calls);
    chooseEngine('codex');
    modelInput().value = '  gpt-5-codex ';
    fillAndSubmit();

    const launch = await singleLaunch(calls);
    expect(launch?.body).toEqual({
      folder: '/srv/projects/checkout-web',
      firings: 1,
      budgetUsd: 10,
      engine: 'codex',
      engineModel: 'gpt-5-codex',
    });
  });

  it('a Claude choice is sent on its own, without a model it would never read', async () => {
    const calls: RecordedCall[] = [];
    await boot(calls);
    chooseEngine('gemini');
    modelInput().value = 'gemini-2.5-pro';
    chooseEngine('claude');
    fillAndSubmit();

    const launch = await singleLaunch(calls);
    expect(launch?.body).toEqual({
      folder: '/srv/projects/checkout-web',
      firings: 1,
      budgetUsd: 10,
      engine: 'claude',
    });
  });

  it('rides the total-spend launch body too', async () => {
    const calls: RecordedCall[] = [];
    await boot(calls);
    (document.getElementById('fly-mode') as HTMLSelectElement).value = 'total';
    chooseEngine('gemini');
    modelInput().value = 'gemini-2.5-pro';
    fillAndSubmit();

    const launch = await singleLaunch(calls);
    expect(launch?.body).toMatchObject({
      totalBudgetUsd: 30,
      engine: 'gemini',
      engineModel: 'gemini-2.5-pro',
    });
  });

  it('refuses Codex or Gemini with no model, before any request, and focuses the field', async () => {
    const calls: RecordedCall[] = [];
    await boot(calls);
    (document.getElementById('fly-options-toggle') as HTMLButtonElement).click();
    chooseEngine('codex');
    modelInput().value = '   ';
    fillAndSubmit();
    // Read at once: the submit handler focuses the field synchronously, and the
    // onboarding tour may take focus for itself on a later tick.
    expect(document.activeElement).toBe(modelInput());

    await refusedWith(calls, STRINGS.en.engineModelNeeded);
  });

  it('remembers the engine and its model with the folder, as it does the budget', async () => {
    const calls: RecordedCall[] = [];
    await boot(calls);
    chooseEngine('codex');
    modelInput().value = 'gpt-5-codex';
    fillAndSubmit();
    await singleLaunch(calls);

    const stored = JSON.parse(localStorage.getItem('ap-fly-settings') ?? '{}') as Record<
      string,
      unknown
    >;
    expect(stored['/srv/projects/checkout-web']).toMatchObject({
      engine: 'codex',
      engineModel: 'gpt-5-codex',
    });
  });

  it('Resume relaunches a paused folder on the engine it last flew, not the one left in the select', async () => {
    localStorage.setItem(
      'ap-fly-settings',
      JSON.stringify({
        '/work/codex-lane': {
          mode: 'firings',
          firings: 1,
          budget: 10,
          lanes: 1,
          engine: 'codex',
          engineModel: 'gpt-5-codex',
        },
      }),
    );
    const calls: RecordedCall[] = [];
    await boot(calls, pausedFlight('/work/codex-lane'));
    chooseEngine('gemini');
    modelInput().value = 'gemini-2.5-pro';
    await resume();

    const launch = await singleLaunch(calls);
    expect(launch?.body).toEqual({
      folder: '/work/codex-lane',
      firings: 1,
      budgetUsd: 10,
      engine: 'codex',
      engineModel: 'gpt-5-codex',
    });
  });

  it('Resume of a folder last flown on the default sends no engine, whatever the select holds', async () => {
    // Saved before this control existed, or launched on the default.
    localStorage.setItem(
      'ap-fly-settings',
      JSON.stringify({ '/work/old-lane': { mode: 'firings', firings: 2, budget: 5, lanes: 1 } }),
    );
    const calls: RecordedCall[] = [];
    await boot(calls, pausedFlight('/work/old-lane'));
    chooseEngine('codex');
    modelInput().value = 'gpt-5-codex';
    await resume();

    const launch = await singleLaunch(calls);
    expect(launch?.body).toEqual({ folder: '/work/old-lane', firings: 2, budgetUsd: 5 });
    expect(engineSelect().value).toBe('');
    expect(modelInput().hidden).toBe(true);
  });

  it('a chosen engine and its model ride the multi-lane fleet launch body, for every lane', async () => {
    const calls: RecordedCall[] = [];
    await boot(calls);
    (document.getElementById('fly-lanes') as HTMLInputElement).value = '2';
    chooseEngine('gemini');
    modelInput().value = ' gemini-2.5-pro ';
    fillAndSubmit();

    await vi.waitFor(() => {
      expect(calls.some((c) => c.href.endsWith('/api/fleet'))).toBe(true);
    });
    expect(calls.find((c) => c.href.endsWith('/api/fleet'))?.body).toEqual({
      folder: '/srv/projects/checkout-web',
      laneCount: 2,
      firings: 1,
      budgetUsd: 10,
      engine: 'gemini',
      engineModel: 'gemini-2.5-pro',
    });
    expect(calls.some((c) => c.href.endsWith('/api/fly'))).toBe(false);
  });

  it('a fleet on the default or on Claude sends no model, and the default no engine', async () => {
    const calls: RecordedCall[] = [];
    await boot(calls);
    (document.getElementById('fly-lanes') as HTMLInputElement).value = '2';
    chooseEngine('codex');
    modelInput().value = 'gpt-5-codex';
    chooseEngine('claude');
    fillAndSubmit();
    await vi.waitFor(() => {
      expect(calls.some((c) => c.href.endsWith('/api/fleet'))).toBe(true);
    });
    expect(calls.find((c) => c.href.endsWith('/api/fleet'))?.body).toEqual({
      folder: '/srv/projects/checkout-web',
      laneCount: 2,
      firings: 1,
      budgetUsd: 10,
      engine: 'claude',
    });
  });

  it("shows the server's own reason when it refuses a fleet's engine, not a bare failure", async () => {
    const calls: RecordedCall[] = [];
    await boot(calls);
    const reason =
      'AUTOPILOT_ENGINE_MODEL=claude-sonnet-5 names a Claude model, which the Codex CLI cannot run.';
    const served = globalThis.fetch;
    globalThis.fetch = ((input: unknown, init?: RequestInit) => {
      const href = typeof input === 'string' ? input : (input as Request).url;
      if (href.endsWith('/api/fleet')) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: reason }),
        } as unknown as Response);
      }
      return served(input as RequestInfo, init);
    }) as unknown as typeof fetch;
    (document.getElementById('fly-lanes') as HTMLInputElement).value = '2';
    chooseEngine('codex');
    modelInput().value = 'claude-sonnet-5';
    fillAndSubmit();

    await vi.waitFor(() => {
      expect(document.getElementById('fly-status')?.textContent).toBe(reason);
    });
  });

  it('explains itself on hover/focus, in every locale', () => {
    expect(flyJs()).toContain("setTip(engineEl, 'flyEngineTip');");
    expect(flyJs()).toContain("setTip(engineModelEl, 'flyEngineModelTip');");
    expect(STRINGS.en.flyEngineTip).toContain('AUTOPILOT_ENGINE');
    expect(STRINGS.en.flyOptionsAria).toContain('engine');
    for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
      for (const key of [
        'engine',
        'engineDefault',
        'engineClaude',
        'engineCodex',
        'engineGemini',
        'engineModel',
        'engineModelPlaceholder',
        'flyEngineTip',
        'flyEngineModelTip',
        'engineModelNeeded',
      ] as const) {
        expect(STRINGS[locale][key], `${locale}.${key}`).toBeTruthy();
      }
    }
  });
});
