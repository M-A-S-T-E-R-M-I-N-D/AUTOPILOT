// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { touchedFilesInPatch } from '../../src/flight/patch-files.js';

describe('touchedFilesInPatch', () => {
  it('extracts the b/ path of a plain edit', () => {
    const patch =
      'diff --git a/apps/dashboard/src/web/shell.ts b/apps/dashboard/src/web/shell.ts\n+<button>Add</button>';
    expect(touchedFilesInPatch(patch)).toEqual(['apps/dashboard/src/web/shell.ts']);
  });

  it('returns an empty array for text with no diff header at all', () => {
    expect(touchedFilesInPatch('not a real patch, just prose')).toEqual([]);
  });

  it('ignores a "diff --git" occurrence that is not at the start of a line', () => {
    const patch =
      'not a header diff --git a/apps/dashboard/src/web/shell.ts b/apps/dashboard/src/web/shell.ts\n+plus content';
    expect(touchedFilesInPatch(patch)).toEqual([]);
  });

  it('uses the CURRENT (b/) path of a file renamed into a directory, not the old a/ path', () => {
    const patch =
      'diff --git a/apps/dashboard/src/utils.ts b/apps/dashboard/src/web/utils.ts\n' +
      'similarity index 100%\n' +
      'rename from apps/dashboard/src/utils.ts\n' +
      'rename to apps/dashboard/src/web/utils.ts';
    expect(touchedFilesInPatch(patch)).toEqual(['apps/dashboard/src/web/utils.ts']);
  });

  it('uses the CURRENT (b/) path of a file renamed out of a directory, not the old a/ path', () => {
    const patch =
      'diff --git a/apps/dashboard/src/web/utils.ts b/apps/dashboard/src/utils.ts\n' +
      'similarity index 100%\n' +
      'rename from apps/dashboard/src/web/utils.ts\n' +
      'rename to apps/dashboard/src/utils.ts';
    expect(touchedFilesInPatch(patch)).toEqual(['apps/dashboard/src/utils.ts']);
  });

  it('handles a diff header git quotes (e.g. a non-ASCII filename)', () => {
    // Git wraps both sides in double quotes and octal-escapes non-ASCII
    // bytes whenever a path isn't plain ASCII — the "a/" prefix ends up
    // INSIDE the quotes, so the plain `a\/\S+` pattern never matches.
    const patch =
      'diff --git "a/apps/dashboard/src/web/caf\\303\\251.ts" "b/apps/dashboard/src/web/caf\\303\\251.ts"\n' +
      'index d95f3ad..637f034 100644\n' +
      '--- "a/apps/dashboard/src/web/caf\\303\\251.ts"\n' +
      '+++ "b/apps/dashboard/src/web/caf\\303\\251.ts"';
    expect(touchedFilesInPatch(patch)).toEqual(['apps/dashboard/src/web/caf\\303\\251.ts']);
  });

  it('extracts every touched file from a multi-file patch', () => {
    const patch =
      'diff --git a/src/a.ts b/src/a.ts\n+change a\n' +
      'diff --git a/src/b.ts b/src/b.ts\n+change b';
    expect(touchedFilesInPatch(patch)).toEqual(['src/a.ts', 'src/b.ts']);
  });
});
