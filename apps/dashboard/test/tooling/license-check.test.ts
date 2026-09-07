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

  it('allows the MIT-0 variant via the MIT family prefix', () => {
    expect(isAllowedLicenseId('MIT-0')).toBe(true);
  });

  it.each(['GPL-3.0', 'AGPL-3.0', 'SSPL-1.0', 'UNLICENSED', ''])('rejects %s', (id) => {
    expect(isAllowedLicenseId(id)).toBe(false);
  });
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

  it('does not flag a dual-licensed group with an allowed alternative', () => {
    const licensesJson = {
      '(MIT OR WTFPL)': [
        { name: 'dual-licensed-pkg', versions: ['1.0.0'], license: '(MIT OR WTFPL)' },
      ],
    };
    expect(findLicenseViolations(licensesJson)).toEqual([]);
  });
});
