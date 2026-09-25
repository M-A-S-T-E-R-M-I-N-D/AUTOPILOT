// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure diff-parsing pieces of scripts/ci/secret-scan-history.mjs,
 * the pre-push gate that scans every commit about to be pushed — not just the
 * final tree state secret-scan.mjs sees — so a secret added in one commit and
 * removed in a later one still gets caught before GitHub push protection sees
 * it. `main()` and its git-plumbing helpers stay unimported — they shell out
 * to `git rev-list`/`git diff-tree`, same stance
 * apps/dashboard/test/tooling/secret-scan.test.ts takes for its sibling `main()`.
 *
 * Fixtures build each secret shape via runtime string concatenation instead of
 * a literal match in source, same reason secret-scan.test.ts does: otherwise
 * this file's raw text would trip secret-scan.mjs when `pnpm run verify`
 * scans the tree.
 */
import { describe, it, expect } from 'vitest';
import { parseAddedLines, scanPatch } from '../../../../scripts/ci/secret-scan-history.mjs';

function patch(lines: string[]): string {
  return lines.join('\n');
}

describe('parseAddedLines', () => {
  it('returns no lines for a patch with no hunks', () => {
    expect(parseAddedLines('')).toEqual([]);
  });

  it('extracts one added line at the hunk start line number', () => {
    const text = patch([
      'diff --git a/src/config.js b/src/config.js',
      'index 1111111..2222222 100644',
      '--- a/src/config.js',
      '+++ b/src/config.js',
      '@@ -1,1 +1,2 @@',
      ' const a = 1;',
      '+const b = 2;',
    ]);
    expect(parseAddedLines(text)).toEqual([
      { file: 'src/config.js', line: 2, text: 'const b = 2;' },
    ]);
  });

  it('advances line numbers across context lines within a hunk', () => {
    const text = patch([
      'diff --git a/src/config.js b/src/config.js',
      'index 1111111..2222222 100644',
      '--- a/src/config.js',
      '+++ b/src/config.js',
      '@@ -1,3 +1,4 @@',
      ' const a = 1;',
      ' const b = 2;',
      '+const c = 3;',
      ' const d = 4;',
    ]);
    expect(parseAddedLines(text)).toEqual([
      { file: 'src/config.js', line: 3, text: 'const c = 3;' },
    ]);
  });

  it('does not advance the line number for removed lines', () => {
    const text = patch([
      'diff --git a/src/config.js b/src/config.js',
      'index 1111111..2222222 100644',
      '--- a/src/config.js',
      '+++ b/src/config.js',
      '@@ -1,2 +1,2 @@',
      '-const old = 1;',
      '+const fresh = 1;',
      ' const b = 2;',
    ]);
    expect(parseAddedLines(text)).toEqual([
      { file: 'src/config.js', line: 1, text: 'const fresh = 1;' },
    ]);
  });

  it('tracks separate files and resets the line counter per file', () => {
    const text = patch([
      'diff --git a/a.js b/a.js',
      'index 1111111..2222222 100644',
      '--- a/a.js',
      '+++ b/a.js',
      '@@ -1,1 +1,2 @@',
      ' const a = 1;',
      '+const a2 = 2;',
      'diff --git a/b.js b/b.js',
      'index 3333333..4444444 100644',
      '--- a/b.js',
      '+++ b/b.js',
      '@@ -5,1 +5,2 @@',
      ' const b = 1;',
      '+const b2 = 2;',
    ]);
    expect(parseAddedLines(text)).toEqual([
      { file: 'a.js', line: 2, text: 'const a2 = 2;' },
      { file: 'b.js', line: 6, text: 'const b2 = 2;' },
    ]);
  });

  it('ignores a binary file diff entirely', () => {
    const text = patch([
      'diff --git a/logo.png b/logo.png',
      'index 1111111..2222222 100644',
      'Binary files a/logo.png and b/logo.png differ',
    ]);
    expect(parseAddedLines(text)).toEqual([]);
  });

  it('does not misparse an added line whose own text starts with "+++ b/"', () => {
    const text = patch([
      'diff --git a/notes.md b/notes.md',
      'index 1111111..2222222 100644',
      '--- a/notes.md',
      '+++ b/notes.md',
      '@@ -1,1 +1,2 @@',
      ' # notes',
      '+++ b/still-just-content',
    ]);
    // Preamble ends at the real '+++ b/notes.md' header; this line is content.
    expect(parseAddedLines(text)).toEqual([
      { file: 'notes.md', line: 2, text: '++ b/still-just-content' },
    ]);
  });

  it('handles a new file with no prior content', () => {
    const text = patch([
      'diff --git a/new.js b/new.js',
      'new file mode 100644',
      'index 0000000..2222222',
      '--- /dev/null',
      '+++ b/new.js',
      '@@ -0,0 +1,1 @@',
      '+const only = 1;',
    ]);
    expect(parseAddedLines(text)).toEqual([{ file: 'new.js', line: 1, text: 'const only = 1;' }]);
  });

  it('numbers consecutive added lines consecutively', () => {
    // Every other fixture adds exactly one line per hunk, which would let a
    // parser that moved the counter the wrong way after a push go unnoticed —
    // the line it reports for a finding is what a human uses to locate it.
    const text = patch([
      'diff --git a/src/config.js b/src/config.js',
      'index 1111111..2222222 100644',
      '--- a/src/config.js',
      '+++ b/src/config.js',
      '@@ -1,1 +1,4 @@',
      ' const a = 1;',
      '+const b = 2;',
      '+const c = 3;',
      '+const d = 4;',
    ]);
    expect(parseAddedLines(text)).toEqual([
      { file: 'src/config.js', line: 2, text: 'const b = 2;' },
      { file: 'src/config.js', line: 3, text: 'const c = 3;' },
      { file: 'src/config.js', line: 4, text: 'const d = 4;' },
    ]);
  });

  it('parses hunk headers that omit a count of one, the way git prints them', () => {
    // `git diff-tree -p` writes `@@ -0,0 +1 @@` for a one-line new file and
    // `@@ -1 +1,2 @@` when the old side is a single line — the `,1` is
    // dropped, not written. The other fixtures spell the count out.
    const text = patch([
      'diff --git a/new.js b/new.js',
      'new file mode 100644',
      'index 0000000..2222222',
      '--- /dev/null',
      '+++ b/new.js',
      '@@ -0,0 +1 @@',
      '+const only = 1;',
      'diff --git a/one.js b/one.js',
      'index 3333333..4444444 100644',
      '--- a/one.js',
      '+++ b/one.js',
      '@@ -1 +1,2 @@',
      ' const a = 1;',
      '+const b = 2;',
    ]);
    expect(parseAddedLines(text)).toEqual([
      { file: 'new.js', line: 1, text: 'const only = 1;' },
      { file: 'one.js', line: 2, text: 'const b = 2;' },
    ]);
  });

  it('treats an added line that quotes a diff header mid-line as content, not a header', () => {
    // The look-alike negative for FILE_HEADER_RE's `^` anchor: a doc that
    // quotes `diff --git a/x b/y` must not reset the file the parser is in,
    // or every line after it would be attributed to the quoted path.
    const text = patch([
      'diff --git a/docs/git.md b/docs/git.md',
      'index 1111111..2222222 100644',
      '--- a/docs/git.md',
      '+++ b/docs/git.md',
      '@@ -1,1 +1,3 @@',
      ' # git',
      '+each file opens with diff --git a/x b/y and then its hunks',
      '+so the header is easy to spot',
    ]);
    expect(parseAddedLines(text)).toEqual([
      {
        file: 'docs/git.md',
        line: 2,
        text: 'each file opens with diff --git a/x b/y and then its hunks',
      },
      { file: 'docs/git.md', line: 3, text: 'so the header is easy to spot' },
    ]);
  });

  it('keeps an added line that precedes every header instead of dropping it', () => {
    // `git diff-tree -p` never emits one — every patch opens with a
    // `diff --git` header — but the parser's initial state (no file yet, not
    // inside a preamble) decides what happens to text it cannot place, and
    // the safe answer for a secret gate is to hand it on to be scanned, under
    // an empty file name, rather than to swallow it.
    expect(parseAddedLines('+orphan')).toEqual([{ file: '', line: 0, text: 'orphan' }]);
  });
});

describe('scanPatch', () => {
  it('returns no findings for a clean patch', () => {
    const text = patch([
      'diff --git a/a.js b/a.js',
      'index 1111111..2222222 100644',
      '--- a/a.js',
      '+++ b/a.js',
      '@@ -1,1 +1,2 @@',
      ' const a = 1;',
      '+const b = 2;',
    ]);
    expect(scanPatch(text)).toEqual([]);
  });

  it('flags a secret introduced on an added line, with commit-relative file:line', () => {
    const key = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    const text = patch([
      'diff --git a/src/config.js b/src/config.js',
      'index 1111111..2222222 100644',
      '--- a/src/config.js',
      '+++ b/src/config.js',
      '@@ -1,1 +1,2 @@',
      ' const a = 1;',
      `+const key = "${key}";`,
    ]);
    expect(scanPatch(text)).toEqual([
      expect.objectContaining({ file: 'src/config.js', line: 2, rule: 'aws-access-key-id' }),
    ]);
  });

  it('does not flag a secret that only ever appears on a removed line', () => {
    const key = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    const text = patch([
      'diff --git a/src/config.js b/src/config.js',
      'index 1111111..2222222 100644',
      '--- a/src/config.js',
      '+++ b/src/config.js',
      '@@ -1,1 +1,1 @@',
      `-const key = "${key}";`,
      '+const key = "removed";',
    ]);
    expect(scanPatch(text)).toEqual([]);
  });

  it('skips a file on the shared secret-scan.mjs exclusion list', () => {
    const key = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    const text = patch([
      'diff --git a/scripts/ci/secret-scan.mjs b/scripts/ci/secret-scan.mjs',
      'index 1111111..2222222 100644',
      '--- a/scripts/ci/secret-scan.mjs',
      '+++ b/scripts/ci/secret-scan.mjs',
      '@@ -1,1 +1,2 @@',
      ' const a = 1;',
      `+// example: ${key}`,
    ]);
    expect(scanPatch(text)).toEqual([]);
  });

  it('skips a file on the shared binary-extension list even when its diff carries text hunks', () => {
    // parseAddedLines already drops a `Binary files ... differ` diff for lack
    // of hunks; this pins the OTHER path, where git (or `--text`) shows a
    // textual hunk for a file whose extension secret-scan.mjs treats as binary
    // — scanPatch honours that list itself, so the two gates agree.
    const key = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    const text = patch([
      'diff --git a/assets/logo.png b/assets/logo.png',
      'index 1111111..2222222 100644',
      '--- a/assets/logo.png',
      '+++ b/assets/logo.png',
      '@@ -1,1 +1,2 @@',
      ' PNG',
      `+${key}`,
    ]);
    expect(scanPatch(text)).toEqual([]);
  });

  it('collects findings across multiple files in one commit', () => {
    const aws = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    const npm = 'npm_' + 'B'.repeat(36);
    const text = patch([
      'diff --git a/a.js b/a.js',
      'index 1111111..2222222 100644',
      '--- a/a.js',
      '+++ b/a.js',
      '@@ -1,1 +1,2 @@',
      ' const a = 1;',
      `+const aws = "${aws}";`,
      'diff --git a/b.js b/b.js',
      'index 3333333..4444444 100644',
      '--- a/b.js',
      '+++ b/b.js',
      '@@ -1,1 +1,2 @@',
      ' const b = 1;',
      `+const token = "${npm}";`,
    ]);
    expect(scanPatch(text)).toEqual([
      expect.objectContaining({ file: 'a.js', rule: 'aws-access-key-id' }),
      expect.objectContaining({ file: 'b.js', rule: 'npm-token' }),
    ]);
  });
});
