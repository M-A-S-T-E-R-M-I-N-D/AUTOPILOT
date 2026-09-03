// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure normalize()/matches() comparator of
 * scripts/github/verify-branch-protection.mjs. `main()` itself stays
 * unimported — it shells out to `gh api` and reads the repo config, same
 * stance apps/dashboard/test/tooling/secret-scan.test.ts takes for its
 * sibling script.
 */
import { describe, it, expect } from 'vitest';
import { normalize, matches } from '../../../../scripts/github/verify-branch-protection.mjs';

describe('normalize', () => {
  it('unwraps a plain { enabled } object', () => {
    expect(normalize({ enabled: true })).toBe(true);
  });

  it('unwraps a { url, enabled } object — GitHub live shape for enforce_admins', () => {
    expect(normalize({ url: 'https://api.github.com/...', enabled: false })).toBe(false);
  });

  it('unwraps a { url, enabled } object — GitHub live shape for required_signatures', () => {
    expect(normalize({ url: 'https://api.github.com/...', enabled: true })).toBe(true);
  });

  it('passes through non-wrapper objects unchanged', () => {
    const value = { required_approving_review_count: 1 };
    expect(normalize(value)).toBe(value);
  });

  it('passes through primitives and null unchanged', () => {
    expect(normalize(null)).toBeNull();
    expect(normalize(undefined)).toBeUndefined();
    expect(normalize(true)).toBe(true);
  });
});

describe('matches', () => {
  it('reports no drift when desired false matches a { url, enabled: false } live value', () => {
    expect(matches(false, { url: 'https://api.github.com/...', enabled: false })).toBe(true);
  });

  it('reports drift when desired false does not match a { url, enabled: true } live value', () => {
    expect(matches(false, { url: 'https://api.github.com/...', enabled: true })).toBe(false);
  });

  it('reports no drift when desired null and live is absent', () => {
    expect(matches(null, undefined)).toBe(true);
  });

  it('reports no drift when desired is an object and live is present', () => {
    expect(
      matches({ required_approving_review_count: 1 }, { required_approving_review_count: 1 }),
    ).toBe(true);
  });
});
