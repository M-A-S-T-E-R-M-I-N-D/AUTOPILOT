// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure findShaCitations() extractor of
 * scripts/ci/check-doc-commit-refs.mjs, the CI gate that fails a run if a doc
 * cites a commit SHA unreachable from HEAD. `main()` itself stays unimported —
 * it shells out to `git ls-files` / `git merge-base` and reads the whole tree,
 * same stance apps/dashboard/test/tooling/secret-scan.test.ts takes for its
 * sibling script.
 */
import { describe, it, expect } from 'vitest';
import { findShaCitations } from '../../../../scripts/ci/check-doc-commit-refs.mjs';

describe('findShaCitations', () => {
  it('returns no citations for clean text', () => {
    expect(findShaCitations('Just some prose with no code spans at all.')).toEqual([]);
  });

  it('extracts a backtick-quoted 7-char SHA followed by a closing backtick', () => {
    expect(findShaCitations('Fixed in `abc1234` yesterday.')).toEqual([
      { line: 1, sha: 'abc1234' },
    ]);
  });

  it('extracts a backtick-quoted SHA followed by trailing prose inside the same span', () => {
    expect(findShaCitations('`abc1234 fix(x): the message` landed the change.')).toEqual([
      { line: 1, sha: 'abc1234' },
    ]);
  });

  it('extracts a full 40-char SHA', () => {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    expect(findShaCitations('See `' + sha + '` for the patch.')).toEqual([{ line: 1, sha }]);
  });

  it('reports 1-indexed line numbers for a citation past the first line', () => {
    const text = 'intro\nmore prose\nfixed by `deadbee` today';
    expect(findShaCitations(text)).toEqual([{ line: 3, sha: 'deadbee' }]);
  });

  it('collects one citation per matching span across multiple lines', () => {
    const text = '`aaaaaaa` first\nprose\n`bbbbbbb` second';
    expect(findShaCitations(text)).toEqual([
      { line: 1, sha: 'aaaaaaa' },
      { line: 3, sha: 'bbbbbbb' },
    ]);
  });

  it('does not flag a bare unquoted hex word in prose — a URL fragment or article slug, not a citation (the false positive this scanner is deliberately narrow to avoid)', () => {
    const text = 'See the writeup ending in 71923df63d01 for background.';
    expect(findShaCitations(text)).toEqual([]);
  });

  it('does not flag a hex-looking word inside a longer identifier with no backtick boundary', () => {
    expect(findShaCitations('commit_abc1234_backup.tar.gz')).toEqual([]);
  });

  it('does not flag a hex run longer than 40 chars inside a single code span — a SHA-256 content hash or lockfile digest, not a truncated commit SHA', () => {
    const hash64 = 'a'.repeat(64);
    expect(findShaCitations('digest `' + hash64 + '` matches.')).toEqual([]);
  });

  it('does not flag a backtick-quoted hex run shorter than 7 chars', () => {
    expect(findShaCitations('`ab12` is too short to be a SHA.')).toEqual([]);
  });

  it('does not flag backtick-quoted non-hex content', () => {
    expect(findShaCitations('run `pnpm install` first.')).toEqual([]);
  });

  it('does not flag prose that merely mentions commits without a code span', () => {
    expect(findShaCitations('The commit fixed the bug, see the changelog above.')).toEqual([]);
  });
});
