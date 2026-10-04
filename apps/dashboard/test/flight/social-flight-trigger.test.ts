// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  isBetweenFirings,
  parseFlyTarget,
  parseSocialFlightToggle,
  parseSocialInterests,
  shouldRunSocialFlight,
} from '../../src/flight/social-flight-trigger.js';

describe('parseSocialFlightToggle', () => {
  it('parses each of the four recognized values as itself', () => {
    expect(parseSocialFlightToggle('off')).toBe('off');
    expect(parseSocialFlightToggle('start')).toBe('start');
    expect(parseSocialFlightToggle('end')).toBe('end');
    expect(parseSocialFlightToggle('full')).toBe('full');
  });

  it('defaults to off when the value is undefined', () => {
    expect(parseSocialFlightToggle(undefined)).toBe('off');
  });

  it('defaults to off for an empty string', () => {
    expect(parseSocialFlightToggle('')).toBe('off');
  });

  it('defaults to off for an unrecognized value', () => {
    expect(parseSocialFlightToggle('always')).toBe('off');
  });

  it('defaults to off for the wrong case (case-sensitive)', () => {
    expect(parseSocialFlightToggle('FULL')).toBe('off');
  });

  it('defaults to off for "interval" — not a valid toggle value', () => {
    expect(parseSocialFlightToggle('interval')).toBe('off');
  });
});

describe('shouldRunSocialFlight', () => {
  it('never runs any phase when the toggle is off', () => {
    expect(shouldRunSocialFlight('off', 'start')).toBe(false);
    expect(shouldRunSocialFlight('off', 'interval')).toBe(false);
    expect(shouldRunSocialFlight('off', 'end')).toBe(false);
  });

  it('runs every phase, including interval, when the toggle is full', () => {
    expect(shouldRunSocialFlight('full', 'start')).toBe(true);
    expect(shouldRunSocialFlight('full', 'interval')).toBe(true);
    expect(shouldRunSocialFlight('full', 'end')).toBe(true);
  });

  it('runs only the start phase when the toggle is start', () => {
    expect(shouldRunSocialFlight('start', 'start')).toBe(true);
    expect(shouldRunSocialFlight('start', 'interval')).toBe(false);
    expect(shouldRunSocialFlight('start', 'end')).toBe(false);
  });

  it('runs only the end phase when the toggle is end', () => {
    expect(shouldRunSocialFlight('end', 'start')).toBe(false);
    expect(shouldRunSocialFlight('end', 'interval')).toBe(false);
    expect(shouldRunSocialFlight('end', 'end')).toBe(true);
  });

  it('never runs interval unless the toggle is full', () => {
    expect(shouldRunSocialFlight('start', 'interval')).toBe(false);
    expect(shouldRunSocialFlight('end', 'interval')).toBe(false);
    expect(shouldRunSocialFlight('off', 'interval')).toBe(false);
  });
});

describe('isBetweenFirings — the interval phase is BETWEEN firings, never after the last', () => {
  it('is true after every firing that still has another planned one after it', () => {
    expect(isBetweenFirings(1, 3)).toBe(true);
    expect(isBetweenFirings(2, 3)).toBe(true);
  });

  it('is false after the last planned firing — the end phase speaks there instead', () => {
    expect(isBetweenFirings(3, 3)).toBe(false);
  });

  it('is false for a one-firing flight, which has no "between" at all', () => {
    expect(isBetweenFirings(1, 1)).toBe(false);
  });

  it('is false, never a negative gap, when completed somehow exceeds planned', () => {
    expect(isBetweenFirings(4, 3)).toBe(false);
  });
});

describe('parseFlyTarget — the standalone "Fly GitHub" target (epic 0016 slice 4/6)', () => {
  it('parses each of the two recognized targets as itself', () => {
    expect(parseFlyTarget('code')).toBe('code');
    expect(parseFlyTarget('github')).toBe('github');
  });

  it('is the code flight every launch before this slice was, when unset or empty', () => {
    expect(parseFlyTarget(undefined)).toBe('code');
    expect(parseFlyTarget('')).toBe('code');
  });

  it('is null — refuse to take off — for a misspelt or unknown target, never a guess either way', () => {
    expect(parseFlyTarget('githb')).toBeNull();
    expect(parseFlyTarget('social')).toBeNull();
  });

  it('is null for the wrong case or stray whitespace (exact values only, like the toggle)', () => {
    expect(parseFlyTarget('GitHub')).toBeNull();
    expect(parseFlyTarget(' github')).toBeNull();
  });
});

describe('parseSocialInterests — the operator interests STANDING 4/5 matches against', () => {
  it('splits a comma-separated list into trimmed keywords, in the order given', () => {
    expect(parseSocialInterests('accessibility, windows ,docs')).toEqual([
      'accessibility',
      'windows',
      'docs',
    ]);
  });

  it('keeps a multi-word keyword as one phrase', () => {
    expect(parseSocialInterests('dark mode, screen reader')).toEqual([
      'dark mode',
      'screen reader',
    ]);
  });

  it('folds case, since the match against issue titles is case-insensitive', () => {
    expect(parseSocialInterests('Windows,CLI')).toEqual(['windows', 'cli']);
  });

  it('drops blank entries left by stray, doubled or trailing commas', () => {
    expect(parseSocialInterests(',docs,, ,windows,')).toEqual(['docs', 'windows']);
  });

  it('keeps the first of any keyword repeated in another case or spacing', () => {
    expect(parseSocialInterests('docs, Docs ,DOCS,windows')).toEqual(['docs', 'windows']);
  });

  it('is empty when the variable is unset — no interests means nothing to suggest', () => {
    expect(parseSocialInterests(undefined)).toEqual([]);
  });

  it('is empty for an empty or all-blank value', () => {
    expect(parseSocialInterests('')).toEqual([]);
    expect(parseSocialInterests('  , ,, ')).toEqual([]);
  });
});
