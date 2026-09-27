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

  it('keeps a path that contains a space, which git leaves unquoted in the header', () => {
    // core.quotePath quotes only control, non-ASCII, `"` and `\` bytes. A
    // space stays bare in `diff --git`; only the ---/+++ lines mark it, with
    // a trailing TAB.
    const patch =
      'diff --git a/docs/User Guide.md b/docs/User Guide.md\n' +
      'index d95f3ad..637f034 100644\n' +
      '--- a/docs/User Guide.md\t\n' +
      '+++ b/docs/User Guide.md\t\n' +
      '@@ -1 +1 @@\n-old\n+new';
    expect(touchedFilesInPatch(patch)).toEqual(['docs/User Guide.md']);
  });

  it('splits an edit header whose path itself contains " b/" at its two equal halves', () => {
    const patch = 'diff --git a/docs/a b/x.md b/docs/a b/x.md\n+change';
    expect(touchedFilesInPatch(patch)).toEqual(['docs/a b/x.md']);
  });

  it('takes a spaced rename target from its "rename to" line, not a header split guess', () => {
    const patch =
      'diff --git a/docs/a b/x.md b/docs/a b/y.md\n' +
      'similarity index 100%\n' +
      'rename from docs/a b/x.md\n' +
      'rename to docs/a b/y.md';
    expect(touchedFilesInPatch(patch)).toEqual(['docs/a b/y.md']);
  });

  it('takes a copy target from its "copy to" line', () => {
    const patch =
      'diff --git a/docs/a b/x.md b/docs/a b/copy.md\n' +
      'similarity index 100%\n' +
      'copy from docs/a b/x.md\n' +
      'copy to docs/a b/copy.md';
    expect(touchedFilesInPatch(patch)).toEqual(['docs/a b/copy.md']);
  });

  it('keeps a spaced b/ path whole when git quoted only the a/ side of a rename', () => {
    // Git quotes each side on its own, so a rename away from a non-ASCII
    // name can pair a quoted a/ side with a bare b/ side.
    const patch =
      'diff --git "a/docs/caf\\303\\251.md" b/docs/Plain Name.md\n' +
      'similarity index 100%\n' +
      'rename from "docs/caf\\303\\251.md"\n' +
      'rename to docs/Plain Name.md';
    expect(touchedFilesInPatch(patch)).toEqual(['docs/Plain Name.md']);
  });

  it('drops the CR of a CRLF header line, quoted or bare', () => {
    const patch =
      'diff --git a/src/a b.ts b/src/a b.ts\r\n+change\r\n' +
      'diff --git "a/caf\\303\\251.ts" "b/caf\\303\\251.ts"\r\n+change';
    expect(touchedFilesInPatch(patch)).toEqual(['src/a b.ts', 'caf\\303\\251.ts']);
  });

  it('does not read a "rename to" line from the NEXT file block', () => {
    const patch =
      'diff --git a/src/a.ts b/src/a.ts\n+change a\n' +
      'diff --git a/src/old.ts b/src/new.ts\n' +
      'similarity index 100%\n' +
      'rename from src/old.ts\n' +
      'rename to src/new.ts';
    expect(touchedFilesInPatch(patch)).toEqual(['src/a.ts', 'src/new.ts']);
  });
});
