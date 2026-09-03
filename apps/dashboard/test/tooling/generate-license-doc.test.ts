// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  licenseTerms,
  isAllowedLicense,
  flattenLicenseData,
  findDisallowed,
  renderDoc,
} from '../../../../scripts/licenses/generate-doc.mjs';

describe('licenseTerms', () => {
  it('returns a single-element array for a plain license', () => {
    expect(licenseTerms('MIT')).toEqual(['MIT']);
  });

  it('splits a parenthesized dual-license expression on OR', () => {
    expect(licenseTerms('(MIT OR WTFPL)')).toEqual(['MIT', 'WTFPL']);
  });

  it('splits an unparenthesized multi-license expression on OR', () => {
    expect(licenseTerms('(BSD-2-Clause OR MIT OR Apache-2.0)')).toEqual([
      'BSD-2-Clause',
      'MIT',
      'Apache-2.0',
    ]);
  });

  it('is case-insensitive on the OR separator', () => {
    expect(licenseTerms('MIT or Apache-2.0')).toEqual(['MIT', 'Apache-2.0']);
  });
});

describe('isAllowedLicense', () => {
  it('allows every license on the explicit allowlist', () => {
    for (const license of [
      'MIT',
      'MIT-0',
      'ISC',
      'Apache-2.0',
      'MPL-2.0',
      'CC0-1.0',
      '0BSD',
      'BlueOak-1.0.0',
      'Python-2.0',
      'CC-BY-4.0',
    ]) {
      expect(isAllowedLicense(license)).toBe(true);
    }
  });

  it('allows the BSD family generically', () => {
    expect(isAllowedLicense('BSD-2-Clause')).toBe(true);
    expect(isAllowedLicense('BSD-3-Clause')).toBe(true);
  });

  it('allows a dual-license package if any one alternative is allowed', () => {
    // sqlite-vec's real declared license — "Apache" alone (no "-2.0") is not
    // on the allowlist, but "MIT" is, and a dual license is the licensee's
    // choice of either.
    expect(isAllowedLicense('MIT OR Apache')).toBe(true);
  });

  it('rejects a copyleft-strong license', () => {
    expect(isAllowedLicense('GPL-3.0')).toBe(false);
    expect(isAllowedLicense('AGPL-3.0')).toBe(false);
    expect(isAllowedLicense('SSPL-1.0')).toBe(false);
  });

  it('rejects a dual license where no alternative is allowed', () => {
    expect(isAllowedLicense('GPL-3.0 OR Commercial')).toBe(false);
  });

  it('rejects an unknown or missing license instead of defaulting to allowed', () => {
    expect(isAllowedLicense('Custom-Proprietary')).toBe(false);
    expect(isAllowedLicense('')).toBe(false);
    expect(isAllowedLicense(undefined as unknown as string)).toBe(false);
  });
});

describe('flattenLicenseData', () => {
  it('flattens the license-keyed groups into one row per package, sorted by name', () => {
    const data = {
      MIT: [{ name: 'zeta', versions: ['1.0.0'], license: 'MIT' }],
      ISC: [{ name: 'alpha', versions: ['2.0.0'], license: 'ISC' }],
    };

    expect(flattenLicenseData(data)).toEqual([
      { name: 'alpha', versions: ['2.0.0'], license: 'ISC' },
      { name: 'zeta', versions: ['1.0.0'], license: 'MIT' },
    ]);
  });

  it('falls back to the group key when an entry omits its own license field', () => {
    const data = { MIT: [{ name: 'pkg', versions: ['1.0.0'] }] };

    expect(flattenLicenseData(data)).toEqual([
      { name: 'pkg', versions: ['1.0.0'], license: 'MIT' },
    ]);
  });

  it('keeps multiple versions of the same package on one row', () => {
    const data = { MIT: [{ name: 'pkg', versions: ['1.0.0', '2.0.0'], license: 'MIT' }] };

    expect(flattenLicenseData(data)).toEqual([
      { name: 'pkg', versions: ['1.0.0', '2.0.0'], license: 'MIT' },
    ]);
  });
});

describe('findDisallowed', () => {
  it('returns only the packages whose license fails the allowlist', () => {
    const packages = [
      { name: 'ok-pkg', versions: ['1.0.0'], license: 'MIT' },
      { name: 'bad-pkg', versions: ['1.0.0'], license: 'GPL-3.0' },
    ];

    expect(findDisallowed(packages)).toEqual([
      { name: 'bad-pkg', versions: ['1.0.0'], license: 'GPL-3.0' },
    ]);
  });

  it('returns an empty array when every package is allowed', () => {
    const packages = [{ name: 'ok-pkg', versions: ['1.0.0'], license: 'MIT' }];

    expect(findDisallowed(packages)).toEqual([]);
  });
});

describe('renderDoc', () => {
  it('renders a table row per package and a package-count footer', () => {
    const packages = [{ name: 'alpha', versions: ['1.0.0'], license: 'MIT' }];

    const doc = renderDoc(packages);

    expect(doc).toContain('| alpha | 1.0.0 | MIT |');
    expect(doc).toContain('1 packages.');
    expect(doc).toContain('ci:license-check');
  });

  it('joins multiple versions with a comma in the version column', () => {
    const packages = [{ name: 'alpha', versions: ['1.0.0', '2.0.0'], license: 'MIT' }];

    expect(renderDoc(packages)).toContain('| alpha | 1.0.0, 2.0.0 | MIT |');
  });
});
