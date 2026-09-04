// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { releaseMaturityOf, isMaturityChoice } from '../../src/release/maturity.js';

describe('releaseMaturityOf', () => {
  it('classifies major version zero as an alpha pre-release (SemVer 2.0.0 §4)', () => {
    const maturity = releaseMaturityOf('0.22.0');
    expect(maturity.phase).toBe('alpha');
    expect(maturity.prerelease).toBe(true);
    expect(maturity.source).toBe('zero-major');
    expect(maturity.reasoning).toContain('major version zero');
  });

  it('honors an explicit pre-release suffix over the zero-major rule vocabulary', () => {
    expect(releaseMaturityOf('1.0.0-alpha.1')).toMatchObject({
      phase: 'alpha',
      prerelease: true,
      source: 'prerelease-suffix',
    });
    expect(releaseMaturityOf('2.0.0-beta')).toMatchObject({ phase: 'beta', prerelease: true });
    expect(releaseMaturityOf('1.0.0-rc.2')).toMatchObject({ phase: 'rc', prerelease: true });
  });

  it('treats an unrecognized pre-release identifier as an alpha, still a pre-release', () => {
    expect(releaseMaturityOf('1.0.0-next.3')).toMatchObject({
      phase: 'alpha',
      prerelease: true,
      source: 'prerelease-suffix',
    });
  });

  it('classifies >= 1.0.0 with no suffix as stable — no --prerelease', () => {
    expect(releaseMaturityOf('1.0.0')).toMatchObject({
      phase: 'stable',
      prerelease: false,
      source: 'stable-version',
    });
    expect(releaseMaturityOf('12.3.4').prerelease).toBe(false);
  });

  it('lets an operator override win over every detection rule', () => {
    expect(releaseMaturityOf('0.22.0', 'stable')).toMatchObject({
      phase: 'stable',
      prerelease: false,
      source: 'override',
    });
    expect(releaseMaturityOf('3.0.0', 'beta')).toMatchObject({
      phase: 'beta',
      prerelease: true,
      source: 'override',
    });
  });

  it('degrades an unreadable version to the pre-release floor instead of guessing stable', () => {
    const maturity = releaseMaturityOf('not-a-version');
    expect(maturity.prerelease).toBe(true);
    expect(maturity.phase).toBe('alpha');
    expect(maturity.reasoning).toContain('not-a-version');
  });
});

describe('isMaturityChoice', () => {
  it('accepts the five valid choices and rejects everything else', () => {
    for (const valid of ['auto', 'alpha', 'beta', 'rc', 'stable']) {
      expect(isMaturityChoice(valid)).toBe(true);
    }
    expect(isMaturityChoice('gamma')).toBe(false);
    expect(isMaturityChoice('')).toBe(false);
    expect(isMaturityChoice(undefined)).toBe(false);
    expect(isMaturityChoice(1)).toBe(false);
  });
});
