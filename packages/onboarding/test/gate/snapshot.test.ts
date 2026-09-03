// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { makeFsSnapshot } from '../../src/gate/snapshot.js';

const snap = makeFsSnapshot({
  files: ['package.json', 'src/index.ts', 'tsconfig.json', '.eslintrc.cjs', 'go.mod', 'a.json'],
  contents: { 'package.json': '{"name":"x"}' },
});

describe('makeFsSnapshot', () => {
  it('has() checks exact paths', () => {
    expect(snap.has('package.json')).toBe(true);
    expect(snap.has('missing')).toBe(false);
  });

  it('hasSuffix() matches any file suffix', () => {
    expect(snap.hasSuffix('.ts')).toBe(true);
    expect(snap.hasSuffix('.rs', '.py')).toBe(false);
    // A file matching only ONE of several suffixes must still count — proves
    // this checks "any suffix" (.some), not "every suffix" (.every).
    expect(snap.hasSuffix('.ts', '.py')).toBe(true);
  });

  it('hasGlob() matches basenames and nested paths', () => {
    expect(snap.hasGlob('tsconfig*.json')).toBe(true);
    expect(snap.hasGlob('.eslintrc*')).toBe(true);
    expect(snap.hasGlob('src/*.ts')).toBe(true);
    expect(snap.hasGlob('jest.config.*')).toBe(false);
    // Matches via the basename-only branch: 'index.ts' has no slash, so it
    // can only match 'src/index.ts' by stripping the directory prefix first.
    expect(snap.hasGlob('index.ts')).toBe(true);
    // '?' must become a single-char wildcard, not vanish: 'a.json' matches
    // '?.json' (one char + '.json') but not the literal string '.json'.
    expect(snap.hasGlob('?.json')).toBe(true);
    expect(snap.hasGlob('.json')).toBe(false);
  });

  it('read() returns pre-loaded content or null', () => {
    expect(snap.read('package.json')).toContain('name');
    expect(snap.read('go.mod')).toBeNull();
  });
});
