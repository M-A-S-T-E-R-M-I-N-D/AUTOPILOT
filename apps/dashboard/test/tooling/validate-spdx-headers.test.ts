// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure hasSpdxHeader() check of scripts/ci/validate-spdx-headers.mjs,
 * the CI gate that fails a run if a tracked source file lacks an SPDX license
 * header near its top. `main()` itself stays unimported — it shells out to
 * `git ls-files` and reads the whole tree, same stance
 * apps/dashboard/test/tooling/secret-scan.test.ts takes for its sibling script.
 */
import { describe, it, expect } from 'vitest';
import {
  hasSpdxHeader,
  invalidSpdxTags,
  HEADER_SCAN_LINES,
} from '../../../../scripts/ci/validate-spdx-headers.mjs';

describe('hasSpdxHeader', () => {
  // REUSE-IgnoreStart — the SPDX strings below are TEST FIXTURES fed to
  // hasSpdxHeader, not this file's own declaration (lines 1-2 are); the
  // REUSE parser otherwise reads the trailing bracket-quote into the
  // expression, the same failure shape generate-donate-doc.mjs hit.
  it('accepts a real two-line SPDX header at the top of a file (legit shape, must NOT flag)', () => {
    const text = [
      '// SPDX-FileCopyrightText: 2026 Example',
      '// SPDX-License-Identifier: Apache-2.0',
      '',
      'export const x = 1;',
    ].join('\n');
    expect(hasSpdxHeader(text)).toBe(true);
  });

  it('accepts a header preceded by a shebang line (legit shape, must NOT flag)', () => {
    const text = [
      '#!/usr/bin/env node',
      '// SPDX-FileCopyrightText: 2026 Example',
      '// SPDX-License-Identifier: Apache-2.0',
      '',
      'main();',
    ].join('\n');
    expect(hasSpdxHeader(text)).toBe(true);
  });

  it('rejects a file with no SPDX header at all', () => {
    const text = ['export const x = 1;', 'export const y = 2;'].join('\n');
    expect(hasSpdxHeader(text)).toBe(false);
  });

  it('rejects a file whose only SPDX mention falls past the scan window', () => {
    const filler = Array.from({ length: HEADER_SCAN_LINES }, (_, i) => `// line ${i}`);
    const text = [...filler, '// SPDX-License-Identifier: Apache-2.0'].join('\n');
    expect(hasSpdxHeader(text)).toBe(false);
  });

  it('accepts a header on the very last line inside the scan window (boundary)', () => {
    const filler = Array.from({ length: HEADER_SCAN_LINES - 1 }, (_, i) => `// line ${i}`);
    const text = [...filler, '// SPDX-License-Identifier: Apache-2.0'].join('\n');
    expect(hasSpdxHeader(text)).toBe(true);
  });
  // REUSE-IgnoreEnd

  it('rejects an empty file', () => {
    expect(hasSpdxHeader('')).toBe(false);
  });

  it('does not false-positive on the mere substring "SPDX" without the license-identifier tag', () => {
    const text = ['// This file discusses SPDX conventions in prose.', 'export const x = 1;'].join(
      '\n',
    );
    expect(hasSpdxHeader(text)).toBe(false);
  });
});

describe('invalidSpdxTags — the REUSE red that sat on main (2026-09-27)', () => {
  // REUSE-IgnoreStart — every licence tag in this block is a FIXTURE.
  it('passes real headers in every comment style, including compound expressions', () => {
    const text = [
      '// SPDX-License-Identifier: Apache-2.0',
      '/* SPDX-License-Identifier: Apache-2.0 AND ISC */',
      '<!-- SPDX-License-Identifier: MIT OR Apache-2.0 -->',
      '# SPDX-License-Identifier: GPL-2.0-or-later WITH Classpath-exception-2.0',
      'SPDX-License-Identifier: (MIT OR Apache-2.0)',
    ].join('\n');
    expect(invalidSpdxTags(text)).toEqual([]);
  });

  it('flags the tag written as a string literal in a test — the exact shape that failed reuse lint', () => {
    const text = [
      '// SPDX-License-Identifier: Apache-2.0',
      "    expect(header).toContain('SPDX-License-Identifier: Apache-2.0 AND ISC');",
    ].join('\n');
    expect(invalidSpdxTags(text)).toEqual([{ line: 2, expression: "Apache-2.0 AND ISC');" }]);
  });

  it('skips everything inside a REUSE ignore block, and resumes after it', () => {
    const text = [
      // The markers are assembled, not written out: a literal end marker
      // here would close THIS file's ignore block, for reuse lint too.
      `// REUSE-Ignore${'Start'}`,
      "const tag = 'SPDX-License-Identifier:';",
      `// REUSE-Ignore${'End'}`,
      "const again = 'SPDX-License-Identifier: MIT';",
    ].join('\n');
    expect(invalidSpdxTags(text)).toEqual([{ line: 4, expression: "MIT';" }]);
  });

  it("reads a tag before either HTML comment end, --> and --!>, and before C's */", () => {
    const text = [
      '<!-- SPDX-License-Identifier: MIT -->',
      '<!-- SPDX-License-Identifier: MIT --!>',
      '/* SPDX-License-Identifier: MIT */',
    ].join('\n');
    expect(invalidSpdxTags(text)).toEqual([]);
  });

  it('flags an empty expression', () => {
    expect(invalidSpdxTags('// SPDX-License-Identifier:')).toEqual([{ line: 1, expression: '' }]);
  });
  // REUSE-IgnoreEnd
});
