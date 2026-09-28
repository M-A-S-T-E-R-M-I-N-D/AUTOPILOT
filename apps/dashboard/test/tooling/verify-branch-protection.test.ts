// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure normalize()/matches() comparator and the findDrift()
 * report of scripts/github/verify-branch-protection.mjs. `main()` itself stays
 * unimported — it shells out to `gh api` and reads the repo config, same
 * stance apps/dashboard/test/tooling/secret-scan.test.ts takes for its
 * sibling script.
 */
import { describe, it, expect } from 'vitest';
import {
  normalize,
  matches,
  findDrift,
} from '../../../../scripts/github/verify-branch-protection.mjs';

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

// The desired lock, shaped like .github/branch-protection.json minus its
// `branch` key, and the same lock as `gh api .../protection` reports it live:
// booleans wrapped as `{ enabled }` (or `{ url, enabled }`), `restrictions`
// absent when nobody is restricted.
const DESIRED = {
  required_status_checks: { strict: true, contexts: ['verify (ubuntu-latest)'] },
  enforce_admins: false,
  restrictions: null,
  required_linear_history: true,
  allow_force_pushes: false,
};

const LIVE = {
  required_status_checks: {
    url: 'https://api.github.com/...',
    strict: true,
    contexts: ['verify (ubuntu-latest)'],
  },
  enforce_admins: { url: 'https://api.github.com/...', enabled: false },
  required_linear_history: { enabled: true },
  allow_force_pushes: { enabled: false },
};

describe('findDrift', () => {
  it('finds no drift when the live protection carries every desired lock', () => {
    expect(findDrift(DESIRED, LIVE)).toEqual([]);
  });

  it('names each drifted key with the unwrapped live value, null for an absent key', () => {
    const { required_status_checks: _dropped, ...withoutChecks } = LIVE;
    const live = { ...withoutChecks, allow_force_pushes: { enabled: true } };
    expect(findDrift(DESIRED, live)).toEqual([
      { key: 'required_status_checks', desired: DESIRED.required_status_checks, live: null },
      { key: 'allow_force_pushes', desired: false, live: true },
    ]);
  });

  // `gh api` output is untrusted: valid JSON that is not a protection object
  // must read as a branch with no locks set, not throw before any DRIFT line.
  it('reads a null live response as no locks set instead of throwing', () => {
    expect(findDrift(DESIRED, null)).toEqual([
      { key: 'required_status_checks', desired: DESIRED.required_status_checks, live: null },
      { key: 'enforce_admins', desired: false, live: null },
      { key: 'required_linear_history', desired: true, live: null },
      { key: 'allow_force_pushes', desired: false, live: null },
    ]);
  });

  it('reads an array or a bare value the same way as a null response', () => {
    const expected = findDrift(DESIRED, {});
    expect(expected).toHaveLength(4);
    expect(findDrift(DESIRED, [])).toEqual(expected);
    expect(findDrift(DESIRED, 'Branch not protected')).toEqual(expected);
    expect(findDrift(DESIRED, 7)).toEqual(expected);
  });
});
