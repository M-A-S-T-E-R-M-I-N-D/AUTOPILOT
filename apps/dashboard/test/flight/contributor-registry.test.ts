// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  parseContributorRegistry,
  loadContributorRegistry,
  tierForLogin,
  isAtLeastTier,
  DEFAULT_STANDING_TIER,
  STANDING_TIER_RANK,
  CONTRIBUTOR_REGISTRY_FILE_PATH,
  type ContributorRegistryReader,
} from '../../src/flight/contributor-registry.js';

const REAL_REGISTRY_TABLE = `
# Trusted contributors — the standing registry

| Handle               | Tier           | Since      | Evidence                                                            |
| -------------------- | -------------- | ---------- | -------------------------------------------------------------------- |
| @M-A-S-T-E-R-M-I-N-D | Maintainer     | genesis    | founder                                                             |
| @gabibi555           | Active partner | 2026-09-07 | application #29 — KEEPER dossier + maintainer decision on the issue |

_Active-partner applications: open the 🤝 template._
`;

describe('parseContributorRegistry', () => {
  it('parses the real TRUSTED-CONTRIBUTORS.md table shape', () => {
    expect(parseContributorRegistry(REAL_REGISTRY_TABLE)).toEqual([
      { login: 'M-A-S-T-E-R-M-I-N-D', tier: 'Maintainer', since: 'genesis', evidence: 'founder' },
      {
        login: 'gabibi555',
        tier: 'Active partner',
        since: '2026-09-07',
        evidence: 'application #29 — KEEPER dossier + maintainer decision on the issue',
      },
    ]);
  });

  it('strips the leading @ from handles', () => {
    const entries = parseContributorRegistry(REAL_REGISTRY_TABLE);
    expect(entries.every((e) => !e.login.startsWith('@'))).toBe(true);
  });

  it('skips a table row before the real Handle header instead of misreading it', () => {
    const markdown = `
| Foo | Bar | Baz | Qux |
| --- | --- | --- | --- |
| a   | b   | c   | d   |

| Handle | Tier | Since | Evidence |
| --- | --- | --- | --- |
| @real | Active partner | 2026-01-01 | evidence |
`;
    expect(parseContributorRegistry(markdown)).toEqual([
      { login: 'real', tier: 'Active partner', since: '2026-01-01', evidence: 'evidence' },
    ]);
  });

  it('drops a row with the wrong column count instead of throwing', () => {
    const markdown = `
| Handle | Tier | Since | Evidence |
| --- | --- | --- | --- |
| @onlythree | Tier | Since |
| @good | Active partner | 2026-01-01 | evidence |
`;
    expect(parseContributorRegistry(markdown)).toEqual([
      { login: 'good', tier: 'Active partner', since: '2026-01-01', evidence: 'evidence' },
    ]);
  });

  it('drops a row with an empty handle or tier cell', () => {
    const markdown = `
| Handle | Tier | Since | Evidence |
| --- | --- | --- | --- |
|  | Active partner | 2026-01-01 | evidence |
| @nohandle |  | 2026-01-01 | evidence |
`;
    expect(parseContributorRegistry(markdown)).toEqual([]);
  });

  it('returns an empty list when there is no recognizable table', () => {
    expect(parseContributorRegistry('# Just a heading\n\nSome prose, no table here.')).toEqual([]);
  });

  it('returns an empty list for empty input', () => {
    expect(parseContributorRegistry('')).toEqual([]);
  });
});

describe('loadContributorRegistry', () => {
  it('reads CONTRIBUTOR_REGISTRY_FILE_PATH by default and parses its table', () => {
    const readFile: ContributorRegistryReader = vi.fn().mockReturnValue(REAL_REGISTRY_TABLE);

    const registry = loadContributorRegistry(readFile);

    expect(registry).toHaveLength(2);
    expect(readFile).toHaveBeenCalledWith(CONTRIBUTOR_REGISTRY_FILE_PATH);
  });

  it('degrades to an empty registry when the file cannot be read', () => {
    const readFile: ContributorRegistryReader = vi.fn().mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    expect(loadContributorRegistry(readFile)).toEqual([]);
  });

  it('accepts a custom path for the injectable reader', () => {
    const readFile: ContributorRegistryReader = vi.fn().mockReturnValue('');

    loadContributorRegistry(readFile, 'config/trusted.md');

    expect(readFile).toHaveBeenCalledWith('config/trusted.md');
  });
});

describe('tierForLogin', () => {
  const registry = parseContributorRegistry(REAL_REGISTRY_TABLE);

  it('finds a known login case-insensitively', () => {
    expect(tierForLogin('gabibi555', registry)).toBe('Active partner');
    expect(tierForLogin('GaBiBi555', registry)).toBe('Active partner');
  });

  it('tolerates an @-prefixed login on lookup', () => {
    expect(tierForLogin('@gabibi555', registry)).toBe('Active partner');
  });

  it('defaults an unlisted login to DEFAULT_STANDING_TIER', () => {
    expect(tierForLogin('someone-not-in-the-registry', registry)).toBe(DEFAULT_STANDING_TIER);
    expect(DEFAULT_STANDING_TIER).toBe('Newcomer');
  });
});

describe('isAtLeastTier', () => {
  it('orders the standing ladder low to high', () => {
    expect(STANDING_TIER_RANK).toEqual([
      'Newcomer',
      'Contributor',
      'Active partner',
      'Maintainer-delegate',
      'Maintainer',
    ]);
  });

  it('accepts a tier equal to the minimum', () => {
    expect(isAtLeastTier('Active partner', 'Active partner')).toBe(true);
  });

  it('accepts a tier above the minimum', () => {
    expect(isAtLeastTier('Maintainer', 'Active partner')).toBe(true);
  });

  it('rejects a tier below the minimum', () => {
    expect(isAtLeastTier('Newcomer', 'Active partner')).toBe(false);
    expect(isAtLeastTier('Contributor', 'Active partner')).toBe(false);
  });

  it('rejects an unrecognized tier rather than guessing', () => {
    expect(isAtLeastTier('Founder Emeritus', 'Newcomer')).toBe(false);
  });

  it('rejects checks against an unrecognized minimum', () => {
    expect(isAtLeastTier('Maintainer', 'Founder Emeritus')).toBe(false);
  });
});
