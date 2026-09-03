// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure findPersonalPaths() rule engine of
 * scripts/ci/validate-no-personal-paths.mjs, the CI gate that fails a run if a
 * tracked file leaks a user-home path or a personal-provider email address.
 * `main()` itself stays unimported — it shells out to `git ls-files` and reads
 * the whole tree, same stance apps/dashboard/test/tooling/secret-scan.test.ts
 * takes for its sibling script.
 *
 * Every fixture below is built via runtime string concatenation instead of a
 * literal match in source — otherwise this very file's raw text would trip
 * validate-no-personal-paths.mjs when `pnpm run verify` scans the tree, same
 * reason secret-scan.test.ts builds its own credential fixtures that way. The
 * WSL fixture in particular splits after the trailing slash of "/mnt/" rather
 * than before it — splitting before would still leave a leading-slash run
 * that matches wsl-user-home's optional "mnt/" prefix on its own.
 */
import { describe, it, expect } from 'vitest';
import { findPersonalPaths } from '../../../../scripts/ci/validate-no-personal-paths.mjs';

describe('findPersonalPaths', () => {
  it('returns no findings for clean text', () => {
    expect(findPersonalPaths('const path = "packages/store/src/schema.ts";')).toEqual([]);
  });

  it('detects a Windows user-home path (also caught by the broader drive-path rule)', () => {
    // A single-backslash home path matches BOTH rules: windows-user-home (the
    // specific "Users" shape) and windows-drive-path (the broad catch-all) —
    // it is only exempt from the latter when the username is the repo's own
    // "operator" placeholder (see the exemption test below).
    const line = 'C:' + '\\Users\\jdoe';
    expect(findPersonalPaths(line)).toEqual([
      { line: 1, rule: 'windows-user-home', match: line },
      { line: 1, rule: 'windows-drive-path', match: line },
    ]);
  });

  it('detects a macOS user-home path', () => {
    const line = '/Users' + '/jdoe';
    expect(findPersonalPaths(line)).toEqual([{ line: 1, rule: 'macos-user-home', match: line }]);
  });

  it('detects a Linux user-home path', () => {
    const line = '/home' + '/jdoe';
    expect(findPersonalPaths(line)).toEqual([{ line: 1, rule: 'linux-user-home', match: line }]);
  });

  it('detects a WSL-mounted Windows user-home path', () => {
    const line = '/mnt/' + 'c/Users/jdoe';
    expect(findPersonalPaths(line)).toEqual([{ line: 1, rule: 'wsl-user-home', match: line }]);
  });

  it('detects a non-home drive-absolute path as unsafe', () => {
    const line = 'D:' + '\\secrets';
    expect(findPersonalPaths(line)).toEqual([{ line: 1, rule: 'windows-drive-path', match: line }]);
  });

  it('exempts a bare drive root', () => {
    const line = 'Z:' + '\\';
    expect(findPersonalPaths(line)).toEqual([]);
  });

  it("exempts the repo's placeholder operator home in its escaped double-backslash form", () => {
    // A JS string literal that embeds an escaped Windows path reads, on disk,
    // as a *doubled* backslash before each segment — exactly the shape
    // SAFE_WINDOWS_DRIVE_PATH is built to exempt (see the .mjs module doc).
    const line = 'C:' + '\\\\Users\\\\operator';
    expect(findPersonalPaths(line)).toEqual([]);
  });

  it('detects a personal-provider email address', () => {
    const line = 'someone' + '@gmail.com';
    expect(findPersonalPaths(line)).toEqual([{ line: 1, rule: 'personal-email', match: line }]);
  });

  it('does not flag a non-personal-provider email address', () => {
    expect(findPersonalPaths('someone' + '@company.com')).toEqual([]);
  });

  it('reports 1-indexed line numbers for a match past the first line', () => {
    const home = '/home' + '/jdoe';
    const text = `const a = 1;\nconst b = 2;\nconst leaked = "${home}";`;
    expect(findPersonalPaths(text)).toEqual([{ line: 3, rule: 'linux-user-home', match: home }]);
  });

  it('collects one finding per matching rule across multiple lines', () => {
    const home = '/home' + '/jdoe';
    const email = 'someone' + '@gmail.com';
    const text = `const a = "${home}";\nconst clean = "fine";\nconst b = "${email}";`;
    expect(findPersonalPaths(text)).toEqual([
      { line: 1, rule: 'linux-user-home', match: home },
      { line: 3, rule: 'personal-email', match: email },
    ]);
  });
});
