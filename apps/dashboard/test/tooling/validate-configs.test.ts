// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure findUnpinnedActions() check of
 * scripts/ci/validate-configs.mjs (check #8, OpenSSF Scorecard
 * "Pinned-Dependencies"), the CI gate that fails a run if a
 * `.github/workflows/*.yml` step floats on a mutable tag/branch instead of a
 * full commit SHA. `main()` itself stays unimported — it shells out to
 * `git ls-files` and reads the whole tree, same stance
 * apps/dashboard/test/tooling/secret-scan.test.ts takes for its sibling
 * script.
 */
import { describe, it, expect } from 'vitest';
import { findUnpinnedActions } from '../../../../scripts/ci/validate-configs.mjs';

describe('findUnpinnedActions', () => {
  it('returns no findings for text with no uses: steps at all', () => {
    expect(findUnpinnedActions('name: CI\non:\n  push:\n')).toEqual([]);
  });

  it('accepts a full 40-hex commit SHA pin (legit shape, must NOT flag)', () => {
    const text = '      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1';
    expect(findUnpinnedActions(text)).toEqual([]);
  });

  it('accepts an UPPERCASE 40-hex commit SHA pin (legit shape, must NOT flag)', () => {
    const text = '      - uses: actions/checkout@3D3C42E5AAC5BA805825DA76410C181273BA90B1';
    expect(findUnpinnedActions(text)).toEqual([]);
  });

  it('accepts a local action with no upstream ref to pin (legit shape, must NOT flag)', () => {
    expect(findUnpinnedActions('      - uses: ./.github/actions/my-local-action')).toEqual([]);
  });

  it('accepts a docker:// action with no upstream ref to pin (legit shape, must NOT flag)', () => {
    expect(findUnpinnedActions('      - uses: docker://alpine:3.18')).toEqual([]);
  });

  it('flags a floating version tag instead of a commit SHA', () => {
    const text = '      - uses: actions/checkout@v7';
    expect(findUnpinnedActions(text)).toEqual([
      { ref: 'actions/checkout@v7', reason: 'is not pinned to a full commit SHA (found "v7")' },
    ]);
  });

  it('flags a floating branch ref instead of a commit SHA', () => {
    const text = '      - uses: actions/checkout@main';
    expect(findUnpinnedActions(text)).toEqual([
      {
        ref: 'actions/checkout@main',
        reason: 'is not pinned to a full commit SHA (found "main")',
      },
    ]);
  });

  it('flags an action with no @ref at all', () => {
    const text = '      - uses: actions/checkout';
    expect(findUnpinnedActions(text)).toEqual([
      { ref: 'actions/checkout', reason: 'has no @ref — pin it to a full commit SHA' },
    ]);
  });

  it('flags a short/invalid hex string that is not a full 40-char SHA', () => {
    const text = '      - uses: actions/checkout@abc123';
    expect(findUnpinnedActions(text)).toEqual([
      {
        ref: 'actions/checkout@abc123',
        reason: 'is not pinned to a full commit SHA (found "abc123")',
      },
    ]);
  });

  it('collects one finding per unpinned step across multiple lines, carrying the matched ref as evidence', () => {
    const text = [
      '      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
      '      - uses: pnpm/action-setup@v6',
      '      - uses: ./.github/actions/local',
      '      - uses: actions/setup-node@main',
    ].join('\n');
    expect(findUnpinnedActions(text)).toEqual([
      { ref: 'pnpm/action-setup@v6', reason: 'is not pinned to a full commit SHA (found "v6")' },
      {
        ref: 'actions/setup-node@main',
        reason: 'is not pinned to a full commit SHA (found "main")',
      },
    ]);
  });
});
