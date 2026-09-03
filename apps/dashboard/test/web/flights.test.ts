// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the fly bar's per-flight-row filtering and diff-
 * signature math (`web/flights.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2. `multi-flight-cards.test.ts` already
 * regression-tests this logic indirectly through the rendered DOM in
 * `flyJs()`; these tests exercise the real functions directly instead.
 */

import { describe, it, expect } from 'vitest';
import {
  activeFlights,
  flightsSig,
  typedFolderFlightStatus,
  flightRowStatusText,
  flightActionAriaLabel,
  folderOptionsSig,
  parseFlySettingsStore,
  flySettingsFor,
  withFlySettings,
} from '../../src/web/flights.js';

describe('activeFlights', () => {
  it('keeps only folders that are running, paused, or queued', () => {
    const list = [
      { folder: 'a', running: true },
      { folder: 'b', paused: true },
      { folder: 'c', queued: true },
      { folder: 'd', running: false, paused: false, queued: false },
    ];
    expect(activeFlights(list).map((f) => f.folder)).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty array for null/undefined/empty input', () => {
    expect(activeFlights(null)).toEqual([]);
    expect(activeFlights(undefined)).toEqual([]);
    expect(activeFlights([])).toEqual([]);
  });

  it('skips falsy entries in the list', () => {
    const list = [null, { folder: 'a', running: true }, undefined] as never;
    expect(activeFlights(list).map((f) => f.folder)).toEqual(['a']);
  });
});

describe('flightsSig', () => {
  it('differs when a folder enters or leaves the active set', () => {
    const before = flightsSig([{ folder: 'a', running: true }]);
    const after = flightsSig([
      { folder: 'a', running: true },
      { folder: 'b', queued: true },
    ]);
    expect(before).not.toBe(after);
  });

  it('differs when a folder crosses a running/paused/queued state boundary', () => {
    const running = flightsSig([{ folder: 'a', running: true }]);
    const paused = flightsSig([{ folder: 'a', paused: true }]);
    const queued = flightsSig([{ folder: 'a', queued: true }]);
    expect(new Set([running, paused, queued]).size).toBe(3);
  });

  it('is stable for the same active list', () => {
    const list = [
      { folder: 'a', running: true },
      { folder: 'b', queued: true },
    ];
    expect(flightsSig(list)).toBe(flightsSig(list));
  });

  it('is empty for an empty active list', () => {
    expect(flightsSig([])).toBe('');
  });
});

describe('typedFolderFlightStatus', () => {
  it('reports activeHere when the typed folder is running', () => {
    const status = typedFolderFlightStatus([{ folder: 'a', running: true }], 'a');
    expect(status.activeHere).toBe(true);
    expect(status.queuedHere).toBe(false);
  });

  it('reports queuedHere when the typed folder is queued but not running', () => {
    const status = typedFolderFlightStatus([{ folder: 'a', queued: true }], 'a');
    expect(status.activeHere).toBe(false);
    expect(status.queuedHere).toBe(true);
  });

  it('reports both false when the typed folder is absent from the list', () => {
    const status = typedFolderFlightStatus([{ folder: 'a', running: true }], 'b');
    expect(status.activeHere).toBe(false);
    expect(status.queuedHere).toBe(false);
  });

  it('collects every running flight regardless of the typed folder', () => {
    const list = [
      { folder: 'a', running: true },
      { folder: 'b', running: true },
      { folder: 'c', queued: true },
    ];
    const status = typedFolderFlightStatus(list, 'nope');
    expect(status.runningFlights.map((f) => f.folder)).toEqual(['a', 'b']);
  });

  it('returns falsy/empty status for an empty list', () => {
    const status = typedFolderFlightStatus([], 'a');
    expect(status).toEqual({ activeHere: false, queuedHere: false, runningFlights: [] });
  });
});

describe('flightRowStatusText', () => {
  it('describes a running flight in firing-count mode', () => {
    expect(flightRowStatusText({ folder: '/work/a', running: true, firings: 3 })).toBe(
      'Flying /work/a — 3 firing(s)',
    );
  });

  it('defaults firing count to 1 when unset', () => {
    expect(flightRowStatusText({ folder: '/work/a', running: true })).toBe(
      'Flying /work/a — 1 firing(s)',
    );
  });

  it('describes a running flight in total-budget mode', () => {
    expect(flightRowStatusText({ folder: '/work/a', running: true, totalBudgetUsd: 25 })).toBe(
      'Flying /work/a — up to $25 total',
    );
  });

  it('appends the fleet-watchdog suffix when initiatedBy is fleet-watchdog', () => {
    expect(
      flightRowStatusText({
        folder: '/work/a',
        running: true,
        firings: 1,
        initiatedBy: 'fleet-watchdog',
      }),
    ).toBe('Flying /work/a — 1 firing(s) (fleet-watchdog)');
  });

  it('omits the fleet-watchdog suffix for a manually-started flight', () => {
    expect(
      flightRowStatusText({ folder: '/work/a', running: true, initiatedBy: 'operator' }),
    ).not.toContain('fleet-watchdog');
  });

  it('describes a queued flight', () => {
    expect(flightRowStatusText({ folder: '/work/b', queued: true })).toBe(
      'Queued: /work/b — waiting for a flight slot',
    );
  });

  it('describes a paused flight', () => {
    expect(flightRowStatusText({ folder: '/work/c', paused: true })).toBe(
      'Paused /work/c — will not fly until resumed.',
    );
  });
});

describe('flightActionAriaLabel', () => {
  it('describes pausing a running flight', () => {
    expect(flightActionAriaLabel('pause', '/work/a')).toBe('Pause the flight on /work/a');
  });

  it('describes stopping a running flight', () => {
    expect(flightActionAriaLabel('stop', '/work/a')).toBe('Stop the flight on /work/a');
  });

  it('describes cancelling a queued flight', () => {
    expect(flightActionAriaLabel('cancel', '/work/b')).toBe('Cancel the queued flight on /work/b');
  });

  it('describes resuming a paused flight', () => {
    expect(flightActionAriaLabel('resume', '/work/c')).toBe('Resume the flight on /work/c');
  });
});

describe('folderOptionsSig', () => {
  it('changes only when the set of root paths changes', () => {
    const a = folderOptionsSig([{ rootPath: '/work/a' }, { rootPath: '/work/b' }]);
    const same = folderOptionsSig([{ rootPath: '/work/a' }, { rootPath: '/work/b' }]);
    const different = folderOptionsSig([{ rootPath: '/work/a' }, { rootPath: '/work/c' }]);
    expect(same).toBe(a);
    expect(different).not.toBe(a);
  });

  it('distinguishes an empty list from any non-empty one', () => {
    expect(folderOptionsSig([])).not.toBe(folderOptionsSig([{ rootPath: '/work/a' }]));
  });

  it('is order-sensitive, matching the datalist render order it guards', () => {
    const ab = folderOptionsSig([{ rootPath: '/x' }, { rootPath: '/y' }]);
    const ba = folderOptionsSig([{ rootPath: '/y' }, { rootPath: '/x' }]);
    expect(ab).not.toBe(ba);
  });
});

describe('parseFlySettingsStore', () => {
  it('parses a well-formed store', () => {
    const raw = JSON.stringify({ '/work/a': { mode: 'firings', firings: 3, budget: 5 } });
    expect(parseFlySettingsStore(raw)).toEqual({
      '/work/a': { mode: 'firings', firings: 3, budget: 5 },
    });
  });

  it('returns an empty store for null input (nothing saved yet)', () => {
    expect(parseFlySettingsStore(null)).toEqual({});
  });

  it('returns an empty store for malformed JSON rather than throwing', () => {
    expect(parseFlySettingsStore('{not json')).toEqual({});
  });

  it('returns an empty store for a non-object payload (an array)', () => {
    expect(parseFlySettingsStore('[1,2,3]')).toEqual({});
  });

  it('returns an empty store for a non-object payload (a primitive)', () => {
    expect(parseFlySettingsStore('42')).toEqual({});
  });

  it('returns an empty store for a JSON null payload', () => {
    expect(parseFlySettingsStore('null')).toEqual({});
  });
});

describe('flySettingsFor', () => {
  it('returns the settings for a known folder', () => {
    const store = { '/work/a': { mode: 'total' as const, total: 20, budget: 5 } };
    expect(flySettingsFor(store, '/work/a')).toEqual({ mode: 'total', total: 20, budget: 5 });
  });

  it('returns undefined for a folder that was never saved', () => {
    const store = { '/work/a': { mode: 'firings' as const, firings: 2 } };
    expect(flySettingsFor(store, '/work/b')).toBeUndefined();
  });

  it('returns undefined for an empty store', () => {
    expect(flySettingsFor({}, '/work/a')).toBeUndefined();
  });
});

describe('withFlySettings', () => {
  it('adds a new folder to an empty store', () => {
    const next = withFlySettings({}, '/work/a', { mode: 'firings', firings: 4, budget: 8 });
    expect(next).toEqual({ '/work/a': { mode: 'firings', firings: 4, budget: 8 } });
  });

  it('replaces an existing folder’s settings without touching other folders', () => {
    const store = {
      '/work/a': { mode: 'firings' as const, firings: 1, budget: 1 },
      '/work/b': { mode: 'total' as const, total: 30, budget: 10 },
    };
    const next = withFlySettings(store, '/work/a', { mode: 'total', total: 50, budget: 2 });
    expect(next).toEqual({
      '/work/a': { mode: 'total', total: 50, budget: 2 },
      '/work/b': { mode: 'total', total: 30, budget: 10 },
    });
  });

  it('does not mutate the original store', () => {
    const store = { '/work/a': { mode: 'firings' as const, firings: 1, budget: 1 } };
    withFlySettings(store, '/work/b', { mode: 'firings', firings: 2, budget: 2 });
    expect(store).toEqual({ '/work/a': { mode: 'firings', firings: 1, budget: 1 } });
  });
});
