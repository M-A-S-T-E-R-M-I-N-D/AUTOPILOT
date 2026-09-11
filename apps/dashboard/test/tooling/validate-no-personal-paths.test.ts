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
 * Every POSITIVE fixture below is built via runtime string concatenation
 * instead of a literal match in source — otherwise this very file's raw text
 * would trip validate-no-personal-paths.mjs when `pnpm run verify` scans the
 * tree, same reason secret-scan.test.ts builds its own credential fixtures
 * that way. The WSL fixture in particular splits after the trailing slash of
 * "/mnt/" rather than before it — splitting before would still leave a
 * leading-slash run that matches wsl-user-home's optional "mnt/" prefix on
 * its own. The NEGATIVE corpus at the bottom is the deliberate exception:
 * those shapes are safe on disk by definition, so they are written literally
 * wherever TS syntax allows and the tree scan re-asserts the same claim live.
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

  it('exempts a hyphenated CSS property regex source — overflow-y:\\s is not drive y: (the false positive that red-lit main on 2026-09-07)', () => {
    const line = 'expect(css).toMatch(/\\.activity\\s*\\{[^}]*overflow-y:' + '\\s*auto/);';
    expect(findPersonalPaths(line)).toEqual([]);
  });

  it('flags BOTH dead attribution identities so neither can ever be accidentally restored into a tracked file (operator directive 2026-09-07)', () => {
    const oldProject = findPersonalPaths('Signed-off-by: X <mastermind@' + 'autopilot.dev>');
    expect(oldProject.some((f) => f.rule === 'dead-identity')).toBe(true);
    const harness = findPersonalPaths('author: <azu' + 'zster@' + 'gmail.com>');
    expect(harness.some((f) => f.rule === 'dead-identity')).toBe(true);
  });

  it("exempts the operator's declared public identity, and ONLY it, from the personal-email rule", () => {
    expect(findPersonalPaths('maintainer: INTJ Mastermind <intjmstrmnd@' + 'gmail.com>')).toEqual(
      [],
    );
    const other = findPersonalPaths('contact: someone.else@' + 'gmail.com');
    expect(other).toHaveLength(1);
    expect(other[0]!.rule).toBe('personal-email');
  });

  it("exempts the repo's placeholder operator home in its escaped double-backslash form", () => {
    // A JS string literal that embeds an escaped Windows path reads, on disk,
    // as a *doubled* backslash before each segment — exactly the shape
    // SAFE_WINDOWS_DRIVE_PATH is built to exempt (see the .mjs module doc).
    const line = 'C:' + '\\\\Users\\\\operator';
    expect(findPersonalPaths(line)).toEqual([]);
  });

  it("exempts the repo's placeholder operator home in its plain single-backslash form too (the shape a Markdown doc would carry)", () => {
    // The .mjs module doc names `C:\Users\operator` as this repo's own neutral
    // placeholder — but until this test, only the broad windows-drive-path
    // rule exempted it; the specific windows-user-home rule still flagged the
    // single-separator form a docs author would naturally write. Same
    // exemption, both rules: a placeholder carries no username either way.
    const line = 'C:' + '\\Users\\operator';
    expect(findPersonalPaths(line)).toEqual([]);
    const deeper = 'C:' + '\\Users\\operator\\project';
    expect(findPersonalPaths(deeper)).toEqual([]);
  });

  it('still flags a real username that merely starts with the placeholder word', () => {
    const line = 'C:' + '\\Users\\operator2';
    expect(findPersonalPaths(line).map((f) => f.rule)).toEqual([
      'windows-user-home',
      'windows-drive-path',
    ]);
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

/**
 * Guard-precision doctrine (board web-mtqumz0u-j39av4): every scripts/ci
 * scanner ships a NEGATIVE corpus of legit shapes it must NOT flag. Each entry
 * here has a real reason to live in a tracked file AND shares surface with one
 * of the rules — a letter-colon-slash, a `/Users/` or `/home/` segment, an
 * `@provider` tail — so a future "tighten the regex" edit that widens any rule
 * turns this table red before it can red-light main (the `overflow-y:\s` false
 * positive of 2026-09-07 is the case study). Shapes Prettier would never emit
 * — a single-letter object key or ternary branch glued to a regex value with
 * no space after the colon — are deliberately absent: they are not shapes
 * this tree can carry, so enshrining them would only tie the rules' hands.
 * (Nor are they spelled out here: the tree scan reads this comment too.)
 */
describe('findPersonalPaths — negative corpus (legit shapes it must NOT flag)', () => {
  const LEGIT_SHAPES: Array<[label: string, text: string]> = [
    // URL schemes: the letter before each `:` is a scheme tail, not a drive.
    ['an https URL', 'see https://example.com/docs/path'],
    ['an ssh clone URL', 'git clone ssh://git@github.com/org/repo.git'],
    ['a POSIX file:// URL', 'file:///tmp/build/out'],
    ['an scp-style git remote', 'git@github.com:org/repo.git'],
    ['a mailto link', '[mail](mailto:hello@example.com)'],
    ['a data URL', 'data:image/png;base64,AAAA'],
    ['a tel URL', 'tel:+1-555-0100'],
    // `/Users/` and `/home/` as URL path segments hang off a hostname, not a root.
    ['a REST path with a /Users/ segment', 'GET https://api.example.com/Users/123'],
    ['a web URL with a /home/ segment', 'https://example.com/home/page'],
    ['a quoted href ending in /home/', 'href="https://x.com/home/"'],
    ['a Markdown link into /Users/', '[u](https://github.com/Users/foo)'],
    // Bare drive roots are exactly what the FLY-BAR folder picker enumerates.
    ['a bare single-backslash drive root', 'Z:' + '\\'],
    ['a bare escaped drive root', 'C:' + '\\\\'],
    ['a bare forward-slash drive root', 'D:/'],
    ['a bare escaped drive root inside JSON', '"root":"C:' + '\\\\"'],
    [
      "the repo's placeholder home, escaped and deep",
      'C:' + '\\\\Users\\\\operator\\\\repo\\\\sub',
    ],
    ["the repo's placeholder Users dir alone", 'C:' + '\\\\Users'],
    // Regex escape sequences: `\s:` is the letter of an escape, not drive `s:`.
    ['a \\s: regex escape', 'const re = /' + '\\s:\\S/;'],
    ['a \\d: regex escape', '/' + '\\d:\\d/'],
    ['a hyphenated CSS property regex', '/overflow-y:' + '\\s*auto/'],
    // Digits before a colon are never a drive letter.
    ['an ISO timestamp', '2026-09-10T23:15:00Z'],
    ['a clock time before a slash', 'at 12:30/day'],
    // Colons followed by a space, or preceded by a word, are not paths.
    ['a Docker image tag', 'node:22-alpine'],
    ['a YAML key with a slash value', 'url: /api/health'],
    ['a TS type annotation', 'const p: string = a;'],
    ['a regex value on a word key', 'const m = {re:/foo/};'],
    // Non-personal mail providers, including ones that share a prefix with a personal one.
    ['a GitHub no-reply address', 'noreply@github.com'],
    ['an example.org address', 'user@example.org'],
    ['a corporate domain starting with "live"', 'support@liveperson.com'],
    ['a corporate domain starting with "yahoo"', 'press@yahoo-inc.com'],
    ['a corporate domain starting with "proton"', 'hello@protonvpn.com'],
    ["the operator's sanctioned public identity", 'INTJ Mastermind <intjmstrmnd@' + 'gmail.com>'],
    ['a provider name in prose with no local part', 'forward it to gmail.com or outlook.com'],
    ['the dead-identity local part on a neutral domain', 'mastermind@example.com'],
    // The words "Users" and "home" on their own, or as ordinary path segments.
    ['"Users" and "home" in prose', 'the Users table and the home page'],
    ['a relative path through a Users/ directory', 'packages/store/Users/index.ts'],
    ['a file named Users.ts', 'src/Users.ts'],
    ['a relative docs/home/ path', 'docs/home/index.md'],
    ['a lowercase /users/ route', '/users/list'],
    ['"home" as a word tail', 'welcomehome/x'],
    // Mounted drives without a Users segment, UNC shares, and the repo's own slug.
    ['a WSL mount with no Users segment', '/mnt/c/repos/x'],
    ['a Git-Bash mount with no Users segment', '/c/repos/x'],
    ['a UNC share', '\\\\server' + '\\share'],
    ['the banned predecessor name split across two words', 'the sol says nothing'],
    ["the org's GitHub slug", 'M-A-S-T-E-R-M-I-N-D/AUTOPILOT'],
  ];

  it.each(LEGIT_SHAPES)('does not flag %s', (_label, text) => {
    expect(findPersonalPaths(text)).toEqual([]);
  });
});
