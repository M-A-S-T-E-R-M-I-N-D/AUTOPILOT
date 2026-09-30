// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure allowlist logic of scripts/ci/license-check.mjs
 * (board web-mtluaot4-g7kjuu): a copyleft or unrecognized license landing in
 * the dependency graph should fail CI, not slip through silently. `main()`
 * itself stays unimported — same stance
 * apps/dashboard/test/tooling/dependency-audit.test.ts takes for its sibling
 * script.
 */
import { describe, it, expect } from 'vitest';
import {
  isAllowedLicenseId,
  isAllowedLicenseExpression,
  findLicenseViolations,
} from '../../../../scripts/ci/license-check.mjs';

describe('isAllowedLicenseId', () => {
  it.each([
    'MIT',
    'ISC',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'Apache-2.0',
    'MPL-2.0',
    'CC0-1.0',
    '0BSD',
    'BlueOak-1.0.0',
    'Python-2.0',
    'CC-BY-4.0',
  ])('allows %s', (id) => {
    expect(isAllowedLicenseId(id)).toBe(true);
  });

  it('allows the MIT-0 variant', () => {
    expect(isAllowedLicenseId('MIT-0')).toBe(true);
  });

  it('trims surrounding whitespace before the exact match', () => {
    expect(isAllowedLicenseId(' MIT ')).toBe(true);
    expect(isAllowedLicenseId('\tISC\n')).toBe(true);
  });

  it.each(['GPL-3.0', 'AGPL-3.0', 'SSPL-1.0', 'UNLICENSED', ''])('rejects %s', (id) => {
    expect(isAllowedLicenseId(id)).toBe(false);
  });

  it.each([
    ['MITNFA', 'MIT +no-false-attribs — a distinct, more restrictive SPDX id, not plain MIT'],
    ['BSD-4-Clause', 'the advertising-clause BSD variant — GPL-incompatible, excluded by design'],
    ['BSD-Protection', 'a BSD-family id with an added defensive-termination clause'],
    ['CC0-1.0-fake', 'a fabricated id that merely shares the CC0 prefix'],
    ['BlueOakCouncil', 'shares the BlueOak prefix without a version, not the real id'],
  ])(
    'rejects %s (guard-precision: a shared family prefix must not smuggle an unaudited variant past the allowlist — %s)',
    (id) => {
      expect(isAllowedLicenseId(id)).toBe(false);
    },
  );
});

describe('isAllowedLicenseExpression', () => {
  it('passes a bare allowed id', () => {
    expect(isAllowedLicenseExpression('MIT')).toBe(true);
  });

  it('rejects a bare disallowed id', () => {
    expect(isAllowedLicenseExpression('GPL-3.0')).toBe(false);
  });

  it('allows an OR expression when at least one alternative is allowed', () => {
    expect(isAllowedLicenseExpression('(MIT OR WTFPL)')).toBe(true);
  });

  it('allows an OR expression with no surrounding parens', () => {
    expect(isAllowedLicenseExpression('MIT OR Apache')).toBe(true);
  });

  it('allows an OR expression with three alternatives', () => {
    expect(isAllowedLicenseExpression('(BSD-2-Clause OR MIT OR Apache-2.0)')).toBe(true);
  });

  it('rejects an OR expression when every alternative is disallowed', () => {
    expect(isAllowedLicenseExpression('(GPL-3.0 OR AGPL-3.0)')).toBe(false);
  });

  it('requires every term in an AND expression to be allowed', () => {
    expect(isAllowedLicenseExpression('(MIT AND GPL-3.0)')).toBe(false);
    expect(isAllowedLicenseExpression('(MIT AND Apache-2.0)')).toBe(true);
  });

  it('trims whitespace around the whole expression before stripping the wrapping parens', () => {
    // Without the outer trim the leading space would shield the `(` from the
    // anchored strip, and the first AND term would read `(MIT` — not on the list.
    expect(isAllowedLicenseExpression(' (MIT AND Apache-2.0) ')).toBe(true);
  });

  it('strips parens only as the wrapping pair, never a stray one inside the id', () => {
    // `MIT(` and `)MIT` are not `MIT`: an unanchored strip would turn a
    // malformed license field into an allowed id.
    expect(isAllowedLicenseExpression('MIT(')).toBe(false);
    expect(isAllowedLicenseExpression(')MIT')).toBe(false);
  });

  it.each([
    'GPL-3.0-only AND (MIT OR Apache-2.0)',
    '(MIT OR Apache-2.0) AND GPL-3.0-only',
    '((MIT OR GPL-3.0) AND (AGPL-3.0 OR SSPL-1.0))',
  ])(
    'rejects %s: a parenthesised OR with an allowed alternative cannot excuse a disallowed AND term',
    (license) => {
      expect(isAllowedLicenseExpression(license)).toBe(false);
    },
  );

  it.each(['(MIT OR GPL-3.0) AND Apache-2.0', '((MIT OR GPL-3.0) AND (ISC OR AGPL-3.0))'])(
    'allows %s: every AND term has an allowed alternative',
    (license) => {
      expect(isAllowedLicenseExpression(license)).toBe(true);
    },
  );

  it('binds AND tighter than OR, as the SPDX grammar does', () => {
    // (ISC AND MIT) OR GPL-3.0 — the permissive conjunction is a valid pick.
    expect(isAllowedLicenseExpression('ISC AND MIT OR GPL-3.0')).toBe(true);
    // MIT AND (GPL-3.0 OR AGPL-3.0)? No: (MIT AND GPL-3.0) OR AGPL-3.0 — both sides copyleft.
    expect(isAllowedLicenseExpression('MIT AND GPL-3.0 OR AGPL-3.0')).toBe(false);
  });

  it.each([
    'MIT OR (GPL-3.0',
    'MIT OR GPL-3.0)',
    'MIT OR',
    'AND MIT',
    'MIT OR OR ISC',
    'MIT ISC',
    '',
    // A parenthesis or an operator where a license id belongs is not an id.
    'MIT OR )',
    'MIT OR AND',
    // A malformed term after a disallowed one stays malformed, so a later OR
    // alternative cannot rescue it.
    'GPL-3.0 AND OR MIT',
    // An unclosed group must not swallow the next token as its `)`.
    '(MIT ISC',
  ])('fails closed on the malformed expression %j, whatever alternative it names', (license) => {
    expect(isAllowedLicenseExpression(license)).toBe(false);
  });

  it('looks up a WITH exception whole, so an unreviewed exception fails closed', () => {
    expect(isAllowedLicenseExpression('Apache-2.0 WITH LLVM-exception')).toBe(false);
    expect(isAllowedLicenseExpression('MIT OR Apache-2.0 WITH LLVM-exception')).toBe(true);
    expect(isAllowedLicenseExpression('MIT AND Apache-2.0 WITH LLVM-exception')).toBe(false);
  });

  it.each(['MIT OR Apache-2.0 WITH (', 'MIT OR Apache-2.0 WITH )'])(
    'fails closed on %j: the token after WITH must be an exception id, not a parenthesis',
    (license) => {
      expect(isAllowedLicenseExpression(license)).toBe(false);
    },
  );
});

describe('findLicenseViolations', () => {
  it('reports no violations when every license group is allowed', () => {
    const licensesJson = {
      MIT: [{ name: 'lodash', versions: ['4.17.21'], license: 'MIT' }],
      'Apache-2.0': [{ name: 'commander', versions: ['12.0.0'], license: 'Apache-2.0' }],
    };
    expect(findLicenseViolations(licensesJson)).toEqual([]);
  });

  it('reports every package under a disallowed license group', () => {
    const licensesJson = {
      MIT: [{ name: 'lodash', versions: ['4.17.21'], license: 'MIT' }],
      'GPL-3.0': [
        { name: 'evil-copyleft-pkg', versions: ['1.0.0'], license: 'GPL-3.0' },
        { name: 'another-gpl-pkg', versions: ['2.0.0', '2.1.0'], license: 'GPL-3.0' },
      ],
    };
    expect(findLicenseViolations(licensesJson)).toEqual([
      { license: 'GPL-3.0', name: 'evil-copyleft-pkg', versions: ['1.0.0'] },
      { license: 'GPL-3.0', name: 'another-gpl-pkg', versions: ['2.0.0', '2.1.0'] },
    ]);
  });

  it('reports an unknown/missing license as a violation', () => {
    const licensesJson = {
      UNKNOWN: [{ name: 'mystery-pkg', versions: ['0.0.1'] }],
    };
    expect(findLicenseViolations(licensesJson)).toEqual([
      { license: 'UNKNOWN', name: 'mystery-pkg', versions: ['0.0.1'] },
    ]);
  });

  it('reports a package with no versions field with an empty versions list', () => {
    const licensesJson = {
      'GPL-2.0': [{ name: 'versionless-pkg', license: 'GPL-2.0' }],
    };
    expect(findLicenseViolations(licensesJson)).toEqual([
      { license: 'GPL-2.0', name: 'versionless-pkg', versions: [] },
    ]);
  });

  it('does not flag a dual-licensed group with an allowed alternative', () => {
    const licensesJson = {
      '(MIT OR WTFPL)': [
        { name: 'dual-licensed-pkg', versions: ['1.0.0'], license: '(MIT OR WTFPL)' },
      ],
    };
    expect(findLicenseViolations(licensesJson)).toEqual([]);
  });
});
