// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure activity-feed grouping/lookup/label
 * helpers (`web/activity-log.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2. `activity-feed.test.ts` and `act-label-tooltip.
 * test.ts` already regression-test this logic indirectly through the
 * rendered DOM in `clientJs()`; these tests exercise the real functions
 * directly instead.
 */

import { describe, it, expect } from 'vitest';
import {
  groupByFiring,
  firingLogEntry,
  actMeta,
  activityLiveLabel,
} from '../../src/web/activity-log.js';

describe('groupByFiring', () => {
  it('buckets activity entries by firingId, preserving first-seen order', () => {
    const acts = [
      { tool: 'Edit', firingId: 'f2' },
      { tool: 'Read', firingId: 'f1' },
      { tool: 'Grep', firingId: 'f2' },
      { tool: 'Bash', firingId: 'f1' },
    ];
    const groups = groupByFiring(acts);
    expect(groups.map((g) => g.firingId)).toEqual(['f2', 'f1']);
    expect(groups[0]!.entries.map((a) => a.tool)).toEqual(['Edit', 'Grep']);
    expect(groups[1]!.entries.map((a) => a.tool)).toEqual(['Read', 'Bash']);
  });

  it('collects entries with no firingId under "unattributed"', () => {
    const acts = [{ tool: 'Edit' }, { tool: 'Read', firingId: null }];
    const groups = groupByFiring(acts);
    expect(groups).toEqual([{ firingId: 'unattributed', entries: acts }]);
  });

  it('returns an empty array for empty input', () => {
    expect(groupByFiring([])).toEqual([]);
  });
});

describe('firingLogEntry', () => {
  it('returns the flight-log row matching the given firing id', () => {
    const c = { flightLog: [{ id: 'f1' }, { id: 'f2' }] };
    expect(firingLogEntry(c, 'f2')).toEqual({ id: 'f2' });
  });

  it('returns null when no row matches (still live, or predates the flight log)', () => {
    const c = { flightLog: [{ id: 'f1' }] };
    expect(firingLogEntry(c, 'f9')).toBeNull();
  });

  it('returns null for a null/undefined/empty flight log', () => {
    expect(firingLogEntry({ flightLog: null }, 'f1')).toBeNull();
    expect(firingLogEntry({ flightLog: undefined }, 'f1')).toBeNull();
    expect(firingLogEntry({ flightLog: [] }, 'f1')).toBeNull();
  });
});

describe('actMeta', () => {
  const fmtTokens = (n: number): string => `${n}tok`;

  it('joins model and token-usage into one chip when both are present', () => {
    expect(actMeta({ model: 'claude-sonnet-5', tokensIn: 120, tokensOut: 45 }, fmtTokens)).toBe(
      'claude-sonnet-5 · 165tok tok',
    );
  });

  it('shows only the model when token counts are absent', () => {
    expect(actMeta({ model: 'claude-sonnet-5' }, fmtTokens)).toBe('claude-sonnet-5');
  });

  it('shows only tokens when the model is absent', () => {
    expect(actMeta({ tokensIn: 10, tokensOut: 5 }, fmtTokens)).toBe('15tok tok');
  });

  it('omits the token segment when tokensIn + tokensOut is zero', () => {
    expect(actMeta({ model: 'claude-sonnet-5', tokensIn: 0, tokensOut: 0 }, fmtTokens)).toBe(
      'claude-sonnet-5',
    );
  });

  it('returns null when the entry carries neither model nor tokens (predates capture)', () => {
    expect(actMeta({}, fmtTokens)).toBeNull();
  });
});

describe('activityLiveLabel', () => {
  it('badges a firing actually in progress as live', () => {
    expect(activityLiveLabel(true)).toEqual({
      text: '● live activity',
      className: 'act-label act-label-live',
      tip: 'A firing is running right now — this feed updates live as it acts',
    });
  });

  it('frames the feed as a debrief once nothing is live', () => {
    expect(activityLiveLabel(false)).toEqual({
      text: 'last flight — debrief',
      className: 'act-label',
      tip: 'A recap of the last completed firing, not a live view — nothing is flying right now',
    });
  });
});
