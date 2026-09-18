// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { flightEndStatus } from '../../src/flight/flight-end.js';

describe('flightEndStatus — what a project is left as when ONE of its flights ends', () => {
  it('a solo flight ending leaves the project at rest', () => {
    expect(flightEndStatus({ paused: false, siblingLive: false })).toBe('registered');
  });

  it('a lane ending while a sibling still flies leaves the project FLYING — the round is not over', () => {
    expect(flightEndStatus({ paused: false, siblingLive: true })).toBe('flying');
  });

  it('a pause is an operator hold and wins over both', () => {
    expect(flightEndStatus({ paused: true, siblingLive: false })).toBe('paused');
    expect(flightEndStatus({ paused: true, siblingLive: true })).toBe('paused');
  });
});
