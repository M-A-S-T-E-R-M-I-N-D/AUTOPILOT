// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

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

  it('parses a CRLF-terminated file identically to LF — a Windows checkout must not lose standing', () => {
    const crlf = REAL_REGISTRY_TABLE.replace(/\n/g, '\r\n');

    expect(parseContributorRegistry(crlf)).toEqual(parseContributorRegistry(REAL_REGISTRY_TABLE));
    expect(parseContributorRegistry(crlf)).toHaveLength(2);
  });

  it('anchors on the Handle header case-insensitively', () => {
    const markdown = `
| HANDLE | TIER | SINCE | EVIDENCE |
| --- | --- | --- | --- |
| @shouty | Active partner | 2026-01-01 | evidence |
`;
    expect(parseContributorRegistry(markdown)).toEqual([
      { login: 'shouty', tier: 'Active partner', since: '2026-01-01', evidence: 'evidence' },
    ]);
  });

  it('drops a bare @ handle — an empty login must never become a registry row', () => {
    const markdown = `
| Handle | Tier | Since | Evidence |
| --- | --- | --- | --- |
| @ | Maintainer | 2026-01-01 | evidence |
| @kept | Active partner | 2026-01-01 | evidence |
`;
    expect(parseContributorRegistry(markdown)).toEqual([
      { login: 'kept', tier: 'Active partner', since: '2026-01-01', evidence: 'evidence' },
    ]);
  });

  it('drops a colon-aligned separator row instead of reading it as a handle', () => {
    const markdown = `
| Handle | Tier | Since | Evidence |
|:-------|:----:|------:|:---------|
| @aligned | Maintainer-delegate | 2026-01-01 | evidence |
`;
    expect(parseContributorRegistry(markdown)).toEqual([
      { login: 'aligned', tier: 'Maintainer-delegate', since: '2026-01-01', evidence: 'evidence' },
    ]);
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

  it('a registry that fails to load grants nobody standing — even a founder login reads as Newcomer and passes no tier check', () => {
    const readFile: ContributorRegistryReader = vi.fn().mockImplementation(() => {
      throw new Error('EACCES');
    });

    const registry = loadContributorRegistry(readFile);
    const tier = tierForLogin('M-A-S-T-E-R-M-I-N-D', registry);

    expect(tier).toBe(DEFAULT_STANDING_TIER);
    expect(isAtLeastTier(tier, 'Contributor')).toBe(false);
    expect(isAtLeastTier(tier, DEFAULT_STANDING_TIER)).toBe(true);
  });
});

describe('the checked-in registry file', () => {
  it('names the path CONTRIBUTOR-STANDING.md documents', () => {
    expect(CONTRIBUTOR_REGISTRY_FILE_PATH).toBe(join('.github', 'TRUSTED-CONTRIBUTORS.md'));
  });

  it('still parses into ladder tiers with no duplicate logins — a reformatted table must not silently demote everyone', () => {
    const registry = loadContributorRegistry(
      (path) => readFileSync(path, 'utf8'),
      join(REPO_ROOT, CONTRIBUTOR_REGISTRY_FILE_PATH),
    );

    expect(registry.length).toBeGreaterThan(0);
    for (const entry of registry) {
      expect(entry.login).not.toBe('');
      expect(entry.login.startsWith('@')).toBe(false);
      expect(STANDING_TIER_RANK).toContain(entry.tier);
    }
    const logins = registry.map((entry) => entry.login.toLowerCase());
    expect(new Set(logins).size).toBe(logins.length);
    expect(registry.some((entry) => entry.tier === 'Maintainer')).toBe(true);
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

  it('every ladder tier meets the Newcomer floor, and only Maintainer meets Maintainer', () => {
    for (const tier of STANDING_TIER_RANK) {
      expect(isAtLeastTier(tier, DEFAULT_STANDING_TIER)).toBe(true);
      expect(isAtLeastTier(tier, 'Maintainer')).toBe(tier === 'Maintainer');
    }
  });

  it('is case-sensitive on tier names — a lower-cased registry tier never passes', () => {
    expect(isAtLeastTier('active partner', 'Newcomer')).toBe(false);
    expect(isAtLeastTier('MAINTAINER', 'Newcomer')).toBe(false);
  });
});
