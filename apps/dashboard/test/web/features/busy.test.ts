// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * BUSY STATES (web/features/busy.ts) — the ritual scrim's laws, run in the
 * real bundle under jsdom: an outward write opens one modal scrim and
 * freezes everything else; Minimize collapses it to a pill and un-freezes
 * the page while every OTHER write button stays refused with a spoken
 * reason; the landing job paints real, determinate steps and closes on
 * finished; a settled ritual releases the lock.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../../src/web/shell.js';
import { busyJs } from '../../../src/web/features/busy.js';
import { coreFeatureModulesJs } from '../../../src/web/chunks.js';
import { layoutCss } from '../../../src/web/layout-css.js';

type FetchMock = ReturnType<typeof vi.fn>;

interface RitualWindow {
  ritualFetch: (kind: string, url: string, init?: unknown, opts?: unknown) => Promise<unknown>;
  ritualFollowLandingJob: (pid: string, job: unknown) => void;
}

const win = (): RitualWindow => globalThis as unknown as RitualWindow;

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function jsonResponse(status: number, body: unknown) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    clone() {
      return res;
    },
  };
  return res;
}

function boot(): FetchMock {
  document.open();
  document.write(renderShell(''));
  document.close();
  const fetchMock = vi.fn(async () =>
    jsonResponse(200, { generatedAt: 1, totals: {}, projects: [], empty: true }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  // The bundle is one classic script: its function declarations are locals
  // of this Function body, so the two entry points are handed out explicitly.
  new Function(
    clientJs() +
      ';\nglobalThis.ritualFetch = ritualFetch; globalThis.ritualFollowLandingJob = ritualFollowLandingJob;',
  )();
  return fetchMock;
}

const scrim = (): HTMLElement => document.getElementById('ritual-scrim') as HTMLElement;
const pill = (): HTMLElement => document.getElementById('ritual-pill') as HTMLElement;
const note = (): string => document.getElementById('ritual-note')?.textContent ?? '';
const fleetInert = (): boolean => document.getElementById('fleet')?.hasAttribute('inert') ?? false;
const escape = (): void => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
};

describe('the ritual scrim', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rides the core chunk and defines the drop-in as a hoisted global', () => {
    expect(coreFeatureModulesJs()).toContain('function ritualFetch(');
    expect(busyJs()).toContain("document.addEventListener('click'");
  });

  it('opens one modal scrim, freezes every sibling, and resolves the same Response', async () => {
    const fetchMock = boot();
    const gate = deferred<unknown>();
    fetchMock.mockImplementationOnce(() => gate.promise);

    const pending = win().ritualFetch(
      'release',
      '/api/release/execute',
      { method: 'POST' },
      { subject: 'demo' },
    );

    const s = scrim();
    expect(s.hidden).toBe(false);
    expect(s.getAttribute('role')).toBe('dialog');
    expect(s.getAttribute('aria-modal')).toBe('true');
    expect(document.documentElement.getAttribute('data-busy')).toBe('release');
    expect(document.getElementById('ritual-title')?.textContent).toBe(
      STRINGS.en.ritualRelease + ' · demo',
    );
    expect(fleetInert()).toBe(true);
    expect(s.hasAttribute('inert')).toBe(false);
    expect(document.querySelector('.ritual-progress')?.hasAttribute('data-indeterminate')).toBe(
      true,
    );
    expect(document.activeElement?.className).toBe('ritual-minimize');

    const res = jsonResponse(200, { ok: true, details: 'released v1.2.3' });
    gate.resolve(res);
    expect(await pending).toBe(res);
    await vi.advanceTimersByTimeAsync(0);

    expect(s.getAttribute('data-ritual-state')).toBe('done');
    expect(note()).toBe('released v1.2.3');
    expect(document.documentElement.hasAttribute('data-busy')).toBe(false);
    expect(fleetInert()).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.hidden).toBe(true);
  });

  it('reads a failure off the response and keeps the scrim until closed', async () => {
    const fetchMock = boot();
    fetchMock.mockImplementationOnce(async () => jsonResponse(429, { error: 'Too many requests' }));

    await win().ritualFetch('claim', '/api/pool-client/execute', { method: 'POST' });
    await vi.advanceTimersByTimeAsync(0);

    expect(scrim().getAttribute('data-ritual-state')).toBe('failed');
    expect(note()).toBe('Too many requests');
    expect(scrim().hidden).toBe(false);
    (document.querySelector('.ritual-minimize') as HTMLButtonElement).click();
    expect(scrim().hidden).toBe(true);
  });

  it('Minimize collapses to the pill, un-freezes the page, and refuses every other write button with a reason', () => {
    const fetchMock = boot();
    const gate = deferred<unknown>();
    fetchMock.mockImplementationOnce(() => gate.promise);
    const other = document.createElement('button');
    other.className = 'release-execute';
    const otherHandler = vi.fn();
    other.addEventListener('click', otherHandler);
    document.body.appendChild(other);

    void win().ritualFetch(
      'landing',
      '/api/landing/execute',
      { method: 'POST' },
      { follow: true, subject: 'demo' },
    );
    (document.querySelector('.ritual-minimize') as HTMLButtonElement).click();

    expect(scrim().hidden).toBe(true);
    expect(pill().hidden).toBe(false);
    expect(pill().textContent).toContain(STRINGS.en.ritualWritesPaused);
    expect(fleetInert()).toBe(false);
    expect(document.documentElement.getAttribute('data-busy')).toBe('landing');

    other.click();
    expect(otherHandler).not.toHaveBeenCalled();
    const toast = document.querySelector('.ritual-toast') as HTMLElement;
    expect(toast.hidden).toBe(false);
    expect(toast.textContent).toContain(STRINGS.en.ritualLanding);

    pill().click();
    expect(scrim().hidden).toBe(false);
    expect(fleetInert()).toBe(true);
  });

  it('Escape minimizes a running ritual and closes a settled one', async () => {
    const fetchMock = boot();
    const gate = deferred<unknown>();
    fetchMock.mockImplementationOnce(() => gate.promise);
    const pending = win().ritualFetch('mirror-pass', '/api/mirror-pass/execute', {
      method: 'POST',
    });

    escape();
    expect(scrim().hidden).toBe(true);
    expect(pill().hidden).toBe(false);

    pill().click();
    gate.resolve(jsonResponse(200, { outcomes: [] }));
    await pending;
    await vi.advanceTimersByTimeAsync(0);
    expect(scrim().getAttribute('data-ritual-state')).toBe('done');
    escape();
    expect(scrim().hidden).toBe(true);
  });

  it('the landing job paints real, determinate steps and closes on finished', async () => {
    const fetchMock = boot();
    const gate = deferred<unknown>();
    fetchMock.mockImplementationOnce(() => gate.promise);
    void win().ritualFetch(
      'landing',
      '/api/landing/execute',
      { method: 'POST' },
      { follow: true, subject: 'demo' },
    );

    win().ritualFollowLandingJob('demo', {
      phase: 'gate',
      note: 'running the full gate before merging',
      stepIndex: 2,
      stepTotal: 4,
      steps: [
        { label: 'pnpm run lint', state: 'pass', durationMs: 18748 },
        { label: 'pnpm run test', state: 'running' },
      ],
    });

    const bar = document.querySelector('.ritual-progress') as HTMLElement;
    expect(bar.hasAttribute('data-indeterminate')).toBe(false);
    expect(bar.getAttribute('aria-valuenow')).toBe('38');
    expect(bar.getAttribute('aria-valuetext')).toBe('step 2 of 4');
    const steps = [...document.querySelectorAll('.ritual-step')].map((li) => [
      li.getAttribute('data-state'),
      li.textContent,
    ]);
    expect(steps).toEqual([
      ['pass', 'pnpm run lint19s'],
      ['running', 'pnpm run test'],
    ]);
    expect(note()).toBe('running the full gate before merging');

    // The POST resolving does NOT close a followed ritual — the job does.
    gate.resolve(jsonResponse(200, { ok: true, reason: 'landed' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(scrim().getAttribute('data-ritual-state')).toBe('running');

    win().ritualFollowLandingJob('demo', {
      phase: 'finished',
      steps: [],
      result: { ok: true, details: 'landed autopilot/flight onto main' },
    });
    expect(scrim().getAttribute('data-ritual-state')).toBe('done');
    expect(note()).toBe('landed autopilot/flight onto main');
    expect(document.documentElement.hasAttribute('data-busy')).toBe(false);
  });

  it('a second press joins the running ritual instead of stacking a second scrim', () => {
    const fetchMock = boot();
    const gate = deferred<unknown>();
    fetchMock.mockImplementation(() => gate.promise);
    void win().ritualFetch('release', '/api/release/execute', { method: 'POST' }, { subject: 'a' });
    void win().ritualFetch(
      'claim',
      '/api/pool-client/execute',
      { method: 'POST' },
      { subject: 'b' },
    );

    expect(document.querySelectorAll('#ritual-scrim')).toHaveLength(1);
    expect(document.getElementById('ritual-title')?.textContent).toBe(
      STRINGS.en.ritualRelease + ' · a',
    );
  });

  it('a dropped request fails a plain ritual but only notes "reconnecting" on a followed one', async () => {
    const fetchMock = boot();
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('connection reset');
    });
    await expect(
      win().ritualFetch('release', '/api/release/execute', { method: 'POST' }),
    ).rejects.toThrow();
    expect(scrim().getAttribute('data-ritual-state')).toBe('failed');
    expect(note()).toBe(STRINGS.en.ritualRequestFailed);
    (document.querySelector('.ritual-minimize') as HTMLButtonElement).click();

    fetchMock.mockImplementationOnce(async () => {
      throw new Error('mid-restart');
    });
    await expect(
      win().ritualFetch('landing', '/api/landing/execute', { method: 'POST' }, { follow: true }),
    ).rejects.toThrow();
    expect(scrim().getAttribute('data-ritual-state')).toBe('running');
    expect(note()).toBe(STRINGS.en.ritualReconnecting);
  });
});

describe('the stylesheet carries the scrim', () => {
  const css = layoutCss();

  it('glass field, solid under reduced transparency, sweep only while indeterminate', () => {
    expect(css).toContain('.ritual-scrim { position: fixed; inset: 0; z-index: 80;');
    expect(css).toContain('@media (prefers-reduced-transparency: reduce) { .ritual-scrim {');
    expect(css).toContain('.ritual-progress[data-indeterminate] .ritual-progress-fill');
  });

  it('dims every write button while a ritual runs', () => {
    expect(css).toContain('html[data-busy] :is(.landing-execute, .release-execute');
  });
});

describe('STRINGS carries the ritual words in every locale', () => {
  it('names each ritual kind and the escape', () => {
    const keys = [
      'ritualLanding',
      'ritualRelease',
      'ritualClaim',
      'ritualMinimize',
      'ritualClose',
      'ritualWaitToast',
    ] as const;
    for (const key of keys) {
      expect(STRINGS.en[key]).toBeTruthy();
      expect(STRINGS.he[key]).toBeTruthy();
      expect(STRINGS.he[key]).not.toBe(STRINGS.en[key]);
    }
    expect(STRINGS.en.ritualWaitToast).toContain('{title}');
    expect(STRINGS.he.ritualWaitToast).toContain('{title}');
  });
});
