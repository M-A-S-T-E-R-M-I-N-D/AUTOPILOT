// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  parseSocialFlightToggle,
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
