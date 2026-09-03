// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { compareSemver, ltsChipMeta } from '../src/lts-check.js';

describe('compareSemver', () => {
  it('reports zero for identical versions', () => {
    expect(compareSemver('0.13.0', '0.13.0')).toBe(0);
  });

  it('reports negative when a is behind b', () => {
    expect(compareSemver('0.12.0', '0.13.0')).toBeLessThan(0);
    expect(compareSemver('0.13.0', '0.13.1')).toBeLessThan(0);
    expect(compareSemver('0.13.0', '1.0.0')).toBeLessThan(0);
  });

  it('reports positive when a is ahead of b', () => {
    expect(compareSemver('0.13.0', '0.12.0')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0', '0.99.99')).toBeGreaterThan(0);
  });

  it('treats a missing patch segment as zero', () => {
    expect(compareSemver('1.2', '1.2.0')).toBe(0);
    expect(compareSemver('1.2', '1.2.1')).toBeLessThan(0);
  });
});

describe('ltsChipMeta', () => {
  it('reports "unknown" with only the running version when there is no latest tag', () => {
    expect(ltsChipMeta('0.13.0', null)).toEqual({
      status: 'unknown',
      text: 'you run v0.13.0',
    });
  });

  it('reports "up-to-date" when the running version matches the latest tag', () => {
    expect(ltsChipMeta('0.13.0', 'v0.13.0')).toEqual({
      status: 'up-to-date',
      text: 'up to date — v0.13.0',
    });
  });

  it('strips a leading "v" from the latest tag before comparing', () => {
    expect(ltsChipMeta('0.13.0', '0.13.0')).toEqual({
      status: 'up-to-date',
      text: 'up to date — v0.13.0',
    });
  });

  it('reports "update-available" naming both versions when upstream is ahead', () => {
    expect(ltsChipMeta('0.12.0', 'v0.13.0')).toEqual({
      status: 'update-available',
      text: 'v0.13.0 available — you run v0.12.0',
    });
  });

  it('reports "ahead" when the running version is ahead of upstream\'s latest release', () => {
    expect(ltsChipMeta('0.14.0', 'v0.13.0')).toEqual({
      status: 'ahead',
      text: 'you run v0.14.0 (ahead of upstream v0.13.0)',
    });
  });
});
