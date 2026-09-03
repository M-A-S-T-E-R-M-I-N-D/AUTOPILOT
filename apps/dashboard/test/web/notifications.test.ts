// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the Notifications channel's pure decision logic
 * (`web/notifications.ts`, board web-msnsndlk-exw3t9).
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_NOTIFY_SETTINGS,
  parseNotifySettings,
  minutesOf,
  isQuietHour,
  latestLanded,
  activeNotifyKeys,
  newNotifyEvents,
  type NotifyProjectLike,
  type NotifySettings,
} from '../../src/web/notifications.js';

describe('parseNotifySettings', () => {
  it('returns the all-off default for null/empty input', () => {
    expect(parseNotifySettings(null)).toEqual(DEFAULT_NOTIFY_SETTINGS);
    expect(parseNotifySettings('')).toEqual(DEFAULT_NOTIFY_SETTINGS);
    expect(parseNotifySettings(undefined)).toEqual(DEFAULT_NOTIFY_SETTINGS);
  });

  it('returns the default for malformed JSON rather than throwing', () => {
    expect(parseNotifySettings('{not json')).toEqual(DEFAULT_NOTIFY_SETTINGS);
  });

  it('returns the default for valid JSON that is not an object', () => {
    expect(parseNotifySettings('42')).toEqual(DEFAULT_NOTIFY_SETTINGS);
    expect(parseNotifySettings('null')).toEqual(DEFAULT_NOTIFY_SETTINGS);
    expect(parseNotifySettings('[1,2]')).toEqual(DEFAULT_NOTIFY_SETTINGS);
  });

  it('parses a well-formed settings blob', () => {
    expect(
      parseNotifySettings(
        JSON.stringify({ enabled: true, quietStart: '22:00', quietEnd: '07:00' }),
      ),
    ).toEqual({ enabled: true, quietStart: '22:00', quietEnd: '07:00' });
  });

  it('defends each field independently against the wrong type', () => {
    expect(
      parseNotifySettings(JSON.stringify({ enabled: 'yes', quietStart: 5, quietEnd: null })),
    ).toEqual({ enabled: false, quietStart: '', quietEnd: '' });
  });
});

describe('minutesOf', () => {
  it('converts a well-formed HH:MM to minutes since midnight', () => {
    expect(minutesOf('09:05')).toBe(545);
    expect(minutesOf('00:00')).toBe(0);
    expect(minutesOf('23:59')).toBe(1439);
  });

  it('returns null for an empty or malformed string', () => {
    expect(minutesOf('')).toBeNull();
    expect(minutesOf('9:00')).toBeNull();
    expect(minutesOf('abc')).toBeNull();
  });

  it('returns null for an out-of-range hour or minute', () => {
    expect(minutesOf('24:00')).toBeNull();
    expect(minutesOf('10:60')).toBeNull();
  });
});

describe('isQuietHour', () => {
  it('is never quiet with no window configured', () => {
    expect(isQuietHour(0, DEFAULT_NOTIFY_SETTINGS)).toBe(false);
    expect(isQuietHour(12 * 60, DEFAULT_NOTIFY_SETTINGS)).toBe(false);
  });

  it('handles a same-day window (does not wrap midnight)', () => {
    const settings = { enabled: true, quietStart: '09:00', quietEnd: '17:00' };
    expect(isQuietHour(8 * 60 + 59, settings)).toBe(false);
    expect(isQuietHour(9 * 60, settings)).toBe(true);
    expect(isQuietHour(16 * 60 + 59, settings)).toBe(true);
    expect(isQuietHour(17 * 60, settings)).toBe(false);
  });

  it('handles a window that wraps past midnight', () => {
    const settings = { enabled: true, quietStart: '22:00', quietEnd: '07:00' };
    expect(isQuietHour(21 * 60 + 59, settings)).toBe(false);
    expect(isQuietHour(22 * 60, settings)).toBe(true);
    expect(isQuietHour(0, settings)).toBe(true);
    expect(isQuietHour(6 * 60 + 59, settings)).toBe(true);
    expect(isQuietHour(7 * 60, settings)).toBe(false);
  });

  it('treats a malformed start/end as no window configured', () => {
    expect(isQuietHour(0, { enabled: true, quietStart: 'nope', quietEnd: '07:00' })).toBe(false);
    expect(isQuietHour(0, { enabled: true, quietStart: '25:00', quietEnd: '07:00' })).toBe(false);
  });

  it('treats an equal start/end as no window configured', () => {
    expect(isQuietHour(9 * 60, { enabled: true, quietStart: '09:00', quietEnd: '09:00' })).toBe(
      false,
    );
  });
});

function project(overrides: Partial<NotifyProjectLike>): NotifyProjectLike {
  return { id: 'p1', name: 'demo', status: 'idle', anomalies: [], ...overrides };
}

describe('latestLanded', () => {
  it('returns the newest (first) entry when landedEvents is present', () => {
    const events = [
      { details: 'newest', at: 200 },
      { details: 'oldest', at: 100 },
    ];
    expect(latestLanded(project({ landedEvents: events }))).toEqual(events[0]);
  });

  it('returns undefined for an empty landedEvents array', () => {
    expect(latestLanded(project({ landedEvents: [] }))).toBeUndefined();
  });

  it('returns undefined when landedEvents is absent', () => {
    expect(latestLanded(project({}))).toBeUndefined();
  });
});

describe('activeNotifyKeys', () => {
  it('keys a needs-you project', () => {
    const keys = activeNotifyKeys([project({ id: 'p1', status: 'needs_you' })]);
    expect(keys.has('needs-you:p1')).toBe(true);
  });

  it('keys a death-cluster anomaly', () => {
    const keys = activeNotifyKeys([
      project({ id: 'p1', anomalies: [{ kind: 'death-cluster', evidence: '2 of 3 died' }] }),
    ]);
    expect(keys.has('death-cluster:p1')).toBe(true);
  });

  it('ignores an unrelated status or anomaly kind', () => {
    const keys = activeNotifyKeys([
      project({ id: 'p1', status: 'flying', anomalies: [{ kind: 'cost-spike', evidence: 'x' }] }),
    ]);
    expect(keys.size).toBe(0);
  });

  it('keys a project by its newest landed event only', () => {
    const keys = activeNotifyKeys([
      project({
        id: 'p1',
        landedEvents: [
          { details: 'newest', at: 200 },
          { details: 'older', at: 100 },
        ],
      }),
    ]);
    expect(keys.has('landed:p1:200')).toBe(true);
    expect(keys.has('landed:p1:100')).toBe(false);
  });

  it('ignores a project with no landed events', () => {
    const keys = activeNotifyKeys([project({ id: 'p1', landedEvents: [] })]);
    expect(keys.size).toBe(0);
  });
});

describe('newNotifyEvents', () => {
  it('fires a needs-you event for a project not in `seen`', () => {
    const events = newNotifyEvents(
      [project({ id: 'p1', name: 'demo', status: 'needs_you' })],
      new Set(),
    );
    expect(events).toEqual([
      {
        key: 'needs-you:p1',
        title: 'demo needs you',
        body: 'Blocked on a decision only you can make.',
      },
    ]);
  });

  it('fires a death-cluster event carrying the real evidence text', () => {
    const events = newNotifyEvents(
      [
        project({
          id: 'p1',
          name: 'demo',
          anomalies: [{ kind: 'death-cluster', evidence: '2 of 3 firings died.' }],
        }),
      ],
      new Set(),
    );
    expect(events).toEqual([
      { key: 'death-cluster:p1', title: 'demo: firings are dying', body: '2 of 3 firings died.' },
    ]);
  });

  it('stays silent for a condition already in `seen` — no re-fire while it holds', () => {
    const events = newNotifyEvents(
      [project({ id: 'p1', status: 'needs_you' })],
      new Set(['needs-you:p1']),
    );
    expect(events).toEqual([]);
  });

  it('fires again once a condition has cleared and reappeared (a fresh seen set)', () => {
    const projects = [project({ id: 'p1', status: 'needs_you' })];
    expect(newNotifyEvents(projects, new Set())).toHaveLength(1);
  });

  it('emits one event per project when several conditions are new at once', () => {
    const events = newNotifyEvents(
      [
        project({ id: 'p1', status: 'needs_you' }),
        project({ id: 'p2', anomalies: [{ kind: 'death-cluster', evidence: 'dying' }] }),
      ],
      new Set(),
    );
    expect(events.map((e) => e.key).sort()).toEqual(['death-cluster:p2', 'needs-you:p1']);
  });

  it('fires a flight-landed event carrying the real details text', () => {
    const events = newNotifyEvents(
      [
        project({
          id: 'p1',
          name: 'demo',
          landedEvents: [{ details: 'merged 3 files.', at: 100 }],
        }),
      ],
      new Set(),
    );
    expect(events).toEqual([
      { key: 'landed:p1:100', title: 'demo landed', body: 'merged 3 files.' },
    ]);
  });

  it('falls back to a generic body when a landed event carries no details', () => {
    const events = newNotifyEvents(
      [project({ id: 'p1', name: 'demo', landedEvents: [{ details: '', at: 100 }] })],
      new Set(),
    );
    expect(events).toEqual([
      { key: 'landed:p1:100', title: 'demo landed', body: 'Merged into base.' },
    ]);
  });

  it('stays silent for a landed event already in `seen` — reload never replays old history', () => {
    const events = newNotifyEvents(
      [project({ id: 'p1', landedEvents: [{ details: 'merged.', at: 100 }] })],
      new Set(['landed:p1:100']),
    );
    expect(events).toEqual([]);
  });

  it('fires again once a NEWER landing supersedes the last-seen one', () => {
    const events = newNotifyEvents(
      [
        project({
          id: 'p1',
          name: 'demo',
          landedEvents: [
            { details: 'merged again.', at: 200 },
            { details: 'merged.', at: 100 },
          ],
        }),
      ],
      new Set(['landed:p1:100']),
    );
    expect(events).toEqual([{ key: 'landed:p1:200', title: 'demo landed', body: 'merged again.' }]);
  });
});

describe('notificationsJs bundle scope', () => {
  // The client receives these functions as `.toString()` text concatenated
  // into one classic script — a module-scope helper the source file closes
  // over (like `latestLanded`) does NOT come along for free. Evaluating the
  // emitted text and CALLING activeNotifyKeys is the only test shape that
  // catches a missing embed; importing from the TS module never can.
  it('emitted script evaluates activeNotifyKeys for a landed project without ReferenceError', async () => {
    const { notificationsJs } = await import('../../src/web/features/notifications.js');
    const scope = new Function(
      'document',
      'localStorage',
      `${notificationsJs()}; return activeNotifyKeys;`,
    );
    const activeInBundle = scope(
      { getElementById: () => null },
      { getItem: () => null, setItem: () => undefined },
    ) as (projects: readonly NotifyProjectLike[]) => Set<string>;
    const keys = activeInBundle([
      {
        id: 'p1',
        name: 'p1',
        status: 'flying',
        anomalies: [],
        landedEvents: [{ details: 'merged', at: 5 }],
      },
    ]);
    expect(keys.has('landed:p1:5')).toBe(true);
  });

  // Same bug class as the `latestLanded` embed above, found live 2026-08-27:
  // isQuietHour closes over `minutesOf`, a module-private helper that
  // .toString() does NOT carry into the bundle. The fix for `latestLanded`
  // was instance-specific, so this sibling stayed broken and every fleet tick
  // threw ReferenceError for any user with notifications enabled — swallowed
  // by the SSE handler's bare catch{}, so the dashboard just froze.
  it('emitted script evaluates isQuietHour without ReferenceError (minutesOf must be embedded)', async () => {
    const { notificationsJs } = await import('../../src/web/features/notifications.js');
    const scope = new Function(
      'document',
      'localStorage',
      `${notificationsJs()}; return isQuietHour;`,
    );
    const quietInBundle = scope(
      { getElementById: () => null },
      { getItem: () => null, setItem: () => undefined },
    ) as (nowMinutes: number, settings: NotifySettings) => boolean;

    const window = { enabled: true, quietStart: '22:00', quietEnd: '07:00' };
    expect(quietInBundle(23 * 60, window)).toBe(true);
    expect(quietInBundle(12 * 60, window)).toBe(false);
  });
});
