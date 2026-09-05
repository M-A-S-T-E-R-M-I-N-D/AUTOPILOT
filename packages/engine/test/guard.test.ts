// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { isAbsolute } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  buildDenyDecision,
  checkCommandContainment,
  checkPreCommitSiblingOverlap,
  checkWebFetchDnsRebinding,
  checkWebFetchTarget,
  evaluateHookInput,
  extractBashCommand,
  extractWebFetchUrl,
  buildFlightSettings,
  guardHookScriptPath,
  commitSignoffDenial,
  isGitCommitCommand,
} from '../src/guard.js';

/**
 * Build a drive-letter path at runtime so the repo's no-personal-paths scanner
 * (which flags literal `<letter>:<slash>` sequences in source) stays clean —
 * the guard's whole job is analyzing such paths, so fixtures must contain them
 * at RUNTIME without embedding them in the source text.
 */
const p = (drive: string, rest: string): string => `${drive}:${rest}`;

const ROOT = p('Z', '/work/sbx');
const OUTSIDE = p('Z', '/elsewhere/otherrepo');

function check(command: string): { allowed: boolean; reason: string | null } {
  return checkCommandContainment(command, ROOT);
}

describe('checkCommandContainment', () => {
  it('allows ordinary relative commands (the normal flight vocabulary)', () => {
    expect(check('pnpm test').allowed).toBe(true);
    expect(check('git status').allowed).toBe(true);
    expect(check('node --check src/math.js').allowed).toBe(true);
    expect(check('git add -A && git commit -m "feat: x"').allowed).toBe(true);
    expect(check('cd src && npm run build').allowed).toBe(true);
    expect(check('grep -rn "TODO" src/').allowed).toBe(true);
  });

  it('allows absolute paths INSIDE the target (any slash style, any case)', () => {
    expect(check(`cd "${ROOT}" && git status`).allowed).toBe(true);
    const winStyle = p('z', String.raw`\work\sbx\src`);
    expect(check(`cd "${winStyle}"`).allowed).toBe(true);
    expect(check(`cat ${ROOT}/package.json`).allowed).toBe(true);
  });

  it('denies the EXACT observed escape shape: cd to an absolute path outside the target', () => {
    const v = check(`cd "${OUTSIDE}" && git add -A && git commit -m "x"`);
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain(OUTSIDE);
  });

  it('denies windows-style absolute paths outside the target', () => {
    expect(check(`type ${p('C', String.raw`\Users\someone\secrets.txt`)}`).allowed).toBe(false);
    expect(check(`git -C ${p('D', '/other/repo')} commit -m x`).allowed).toBe(false);
  });

  it('denies quoted absolute paths outside the target (spaces inside quotes)', () => {
    const spaced = p('C', String.raw`\My Projects\other repo\file.txt`);
    expect(check(`cat "${spaced}"`).allowed).toBe(false);
  });

  it('denies unix-style and git-bash-style absolute paths outside the target', () => {
    expect(check('cat /etc/passwd').allowed).toBe(false);
    expect(check('ls /c/Users').allowed).toBe(false);
    expect(check('rg secret --path=/var/data').allowed).toBe(false);
  });

  it('denies UNC paths in every shape — bare //host/share, bare \\\\host\\share, quoted \\\\host\\share', () => {
    // On native Windows a UNC path reaches ANY host/share — including
    // \\localhost\c$\..., the entire local filesystem — without ever using a
    // drive-letter or single-slash form, so all three token shapes must be
    // extracted and judged like any other absolute path.
    expect(check(String.raw`cat //srv/share/secret.txt`).allowed).toBe(false);
    expect(check(String.raw`type \\srv\share\secret.txt`).allowed).toBe(false);
    expect(check(String.raw`git -C "\\localhost\c$\other repo" status`).allowed).toBe(false);
  });

  it('UNC extraction does not false-positive on URLs, comment markers, or quoted escape text', () => {
    // "//" mid-token (after "https:") has no preceding boundary; a bare "//"
    // or a quoted '\n' escape has no host segment followed by a separator.
    expect(check('curl https://example.com/x').allowed).toBe(true);
    expect(check('grep -rn "https://example.com" src/').allowed).toBe(true);
    expect(check(String.raw`printf '\n' && echo //`).allowed).toBe(true);
  });

  it('evaluateHookInput denies a backslash-UNC file_path on file tools (same hole, file-tool branch)', () => {
    const raw = JSON.stringify({
      tool_name: 'Read',
      tool_input: { file_path: String.raw`\\srv\share\creds.txt` },
    });
    const out = evaluateHookInput(raw, ROOT);
    expect(out).not.toBeNull();
    expect(out).toContain('CONTAINMENT');
  });

  it('resolves a git-bash path referring to the target root itself (drive-letter match, multi-segment remainder)', () => {
    // gitBashToDrive("/z/work/sbx/notes.txt") resolves to the drive-letter
    // form of that same path, which IS inside ROOT — exercises the transform
    // on a multi-character, multi-segment remainder (not just one trailing char).
    expect(check('cat /z/work/sbx/notes.txt').allowed).toBe(true);
  });

  it('the git-bash drive pattern only matches at the START of the token, not a later "/x/" occurring mid-path', () => {
    // Without a leading segment matching /[a-z]/ at position 0, this must stay
    // a plain (outside-root) unix path — even though "/z/work/sbx/..." occurs
    // later in the string and WOULD match the drive pattern on its own.
    expect(check('cat /foo/z/work/sbx/secret.txt').allowed).toBe(false);
  });

  it('the git-bash drive pattern requires the WHOLE remainder to be captured, even across an embedded newline in a quoted arg', () => {
    // The drive letter here MUST match ROOT's ("z") — a truncated match that
    // stops at the newline would transform this into exactly ROOT's own
    // drive-letter path (so wrongly ALLOWED); the correct, anchored regex can
    // never complete the match at all (`.*` can't cross the `\n` and still
    // reach `$`), so the token is left as an unrecognized unix-style path and
    // correctly judged outside root.
    const withNewline = 'cat "/z/work/sbx\nSECRET_STUFF"';
    expect(check(withNewline).allowed).toBe(false);
  });

  it('norm() strips exactly one trailing slash from the target root before comparing', () => {
    const rootWithSlash = `${ROOT}/`;
    expect(checkCommandContainment(`cat "${ROOT}/file.txt"`, rootWithSlash).allowed).toBe(true);
    expect(checkCommandContainment(`cd "${ROOT}"`, rootWithSlash).allowed).toBe(true);
  });

  it('norm() only strips a trailing slash when the string is longer than one character', () => {
    // root = "/" alone: real norm() leaves it as "/" (length 1, not > 1), so
    // isUnderRoot requires an exact match against "/" or a prefix of "//" —
    // "/x" satisfies neither, so it is judged OUTSIDE this (degenerate) root.
    expect(checkCommandContainment('cat /x', '/').allowed).toBe(false);
  });

  it('denies home-directory references', () => {
    expect(check('cat ~/.ssh/id_rsa').allowed).toBe(false);
    expect(check('echo $HOME/.claude/.credentials.json').allowed).toBe(false);
    expect(check(String.raw`type %USERPROFILE%\.claude\.credentials.json`).allowed).toBe(false);
  });

  it('denies a home-directory reference at the very START of the command (no preceding boundary char)', () => {
    expect(check('~/.ssh/id_rsa').allowed).toBe(false);
  });

  it('denies a home-directory reference at the very END of the command (nothing follows the tilde)', () => {
    expect(check('echo ~').allowed).toBe(false);
  });

  it('denies a home-directory reference terminated by a shell metacharacter other than a slash', () => {
    expect(check('echo ~;ls').allowed).toBe(false);
  });

  it('denies a home-directory reference terminated by whitespace specifically (not just any non-slash char)', () => {
    expect(check('echo ~ foo').allowed).toBe(false);
  });

  it('the home-directory and bare-cd denial reasons are specific', () => {
    expect(check('cat ~/.ssh/id_rsa').reason).toContain('home directory');
    expect(check('cd').reason).toContain('HOME');
  });

  it('the outside-root denial reason names both the offending token and the target root', () => {
    const v = check('cat /etc/passwd');
    expect(v.reason).toContain('/etc/passwd');
    expect(v.reason).toContain(ROOT);
  });

  it('denies a bare `cd` (which goes to HOME)', () => {
    expect(check('cd').allowed).toBe(false);
    expect(check('cd && ls').allowed).toBe(false);
    // but `cd <dir>` stays allowed
    expect(check('cd src').allowed).toBe(true);
  });

  it('denies a bare `cd` on its own line in a multi-line command (newline is a separator too)', () => {
    expect(check('echo hi\ncd\nls -la').allowed).toBe(false);
    expect(check('echo hi\ncd').allowed).toBe(false);
    expect(check('cd\nls -la').allowed).toBe(false);
    expect(check('echo hi\r\ncd\r\nls -la').allowed).toBe(false);
    // but `cd <dir>` on its own line stays allowed
    expect(check('echo hi\ncd src\nls').allowed).toBe(true);
  });

  it('does NOT treat "cd" fused onto a preceding letter as a bare cd (a real separator boundary is required)', () => {
    expect(check('abcd').allowed).toBe(true);
  });

  it('allows extra whitespace between a separator and a bare `cd` (still denied, not merely tolerated)', () => {
    expect(check('echo hi &&   cd').allowed).toBe(false);
  });

  it('does not false-positive on URLs, git format strings, or flags', () => {
    expect(check('git log --format=%h%x1f%s -1').allowed).toBe(true);
    // A URL is not a filesystem path — the PATH guard must not block it
    // (network policy is a separate, future control).
    expect(check('curl https://example.com/api').allowed).toBe(true);
  });

  it('does not false-positive on quoted grep/rg/sed filter patterns', () => {
    // The exact shape that broke: excluding a build-output directory by name.
    expect(check('grep -rn "TODO" apps packages | grep -v "/dist/"').allowed).toBe(true);
    expect(check('rg secret --exclude "/node_modules/"').allowed).toBe(true);
    expect(check('rg secret --exclude-dir="/coverage/"').allowed).toBe(true);
    expect(check('sed -e "/dist/d" notes.txt').allowed).toBe(true);
    // But the SAME string still denies when passed to a path-consuming command.
    expect(check('cat "/dist/"').allowed).toBe(false);
  });

  it('does not false-positive on a sed/awk SCRIPT passed as the first positional argument, no flag required (web-mtjqs32x-m7yq1o)', () => {
    // The exact false positive: a conflict-marker-stripping sed address range
    // starts with `/`, which is standard sed idiom (its script IS the first
    // positional argument — no `-e` needed), not a path.
    expect(check("sed '/^<<<<<<</,/^>>>>>>>/d' notes.txt").allowed).toBe(true);
    expect(check("sed -i '/^<<<<<<</,/^>>>>>>>/d' notes.txt").allowed).toBe(true);
    expect(check("awk '/dist/ {print}' notes.txt").allowed).toBe(true);
    // But a SECOND quoted argument to sed/awk (a real file path) still denies
    // — only the first positional argument is the script.
    expect(check(`sed '/^<<<<<<</,/^>>>>>>>/d' "${OUTSIDE}/notes.txt"`).allowed).toBe(false);
  });

  it('recognizes --include and every PATTERN_COMMANDS binary, not just the ones above', () => {
    expect(check('grep --include "/dist/" -rn TODO .').allowed).toBe(true);
    expect(check('egrep -e "/dist/" file.txt').allowed).toBe(true);
    expect(check('fgrep -e "/dist/" file.txt').allowed).toBe(true);
    expect(check('awk -e "/dist/" file.txt').allowed).toBe(true);
    expect(check('find . -e "/dist/"').allowed).toBe(true);
  });

  it('the pattern-flag exemption is COMMAND-SCOPED (no cat -v bypass)', () => {
    // `-v` on cat means show-nonprinting; its argument IS a file path — the
    // flag exemption must not turn cat into a guard bypass.
    expect(check('cat -v "/etc/passwd"').allowed).toBe(false);
    expect(check(`cat -v "${OUTSIDE}/secret.txt"`).allowed).toBe(false);
    expect(check('ls -e "/etc/"').allowed).toBe(false);
    // While the same flags on real pattern commands stay exempt, even piped.
    expect(check('git log | grep -v "/vendor/"').allowed).toBe(true);
    expect(check('find . -name x | grep -e "/build/"').allowed).toBe(true);
  });

  it('the pattern-flag exemption requires an ACTUAL pattern-only flag, not just a pattern-command name', () => {
    // Without any -v/-e/--include/etc flag preceding it, a quoted argument to
    // grep is a real search target, not a filter pattern that happens to
    // look like a path — must still be denied like any other command.
    expect(check('grep "/dist/" file.txt').allowed).toBe(false);
  });

  it('the `=` stripped from a flag token is the TRAILING one specifically, not merely the first `=` found', () => {
    // "-=v" is not a recognized flag, so this stays denied — but a
    // first-occurrence (rather than trailing-anchored) `=` strip would turn
    // it into "-v", which IS in PATTERN_ONLY_FLAGS, wrongly exempting it.
    expect(check('grep -=v "/dist/"').allowed).toBe(false);
  });

  it('the pattern-command word is found even when it is trapped inside an earlier (already-closed) quoted span', () => {
    // `before` here is the literal text `"grep" -v` — the closing quote
    // right at position 0 must not let an unanchored word-regex reach past
    // it and misread "grep" as the command name.
    expect(check('"grep" -v "/dist/"').allowed).toBe(false);
  });

  it('skips a leading VAR=value environment-variable assignment when identifying the pattern command', () => {
    expect(check('FOO=bar grep -v "/dist/"').allowed).toBe(true);
    // and tolerates more than one space between the assignment and the word
    expect(check('FOO=bar  grep -v "/dist/"').allowed).toBe(true);
  });

  it('recognizes a single-quoted (not just double-quoted) pattern argument for the flag exemption', () => {
    expect(check("grep -v '/dist/'").allowed).toBe(true);
  });

  it('denies a quoted absolute path with nothing preceding it (the quote is the very first character)', () => {
    expect(check('"/etc/passwd"').allowed).toBe(false);
  });

  it('denies a bare absolute path fused directly onto a closing quote with no space between them', () => {
    expect(check('x"y"/etc/passwd').allowed).toBe(false);
  });

  it('a quoted argument is only treated as an absolute path when it STARTS with the pattern, not merely contains it', () => {
    // Ordinary descriptive text (a commit message) mentioning a path-shaped
    // substring mid-string is not itself a path argument.
    expect(check(`git commit -m "notes mention ${p('C', '/other/place')}"`).allowed).toBe(true);
    expect(check('git commit -m "see docs/readme for details"').allowed).toBe(true);
  });

  it('does not false-positive on POSIX device files (they carry no filesystem data)', () => {
    expect(check('pnpm test 2>/dev/null').allowed).toBe(true);
    expect(check('cmd >/dev/null 2>&1').allowed).toBe(true);
    expect(check('echo hi >/dev/stderr').allowed).toBe(true);
    expect(check('cat /dev/null').allowed).toBe(true);
    // but a real path that merely starts with /dev/ is still checked normally
    expect(check('cat /dev/nullish-secrets.txt').allowed).toBe(false);
    // and a path that merely ENDS with a device-file name (e.g. nested under
    // /etc/) must not be exempted either — the device path must be exact.
    expect(check('cat /etc/dev/null').allowed).toBe(false);
  });

  it('denies force-push (the SOUL "additive git only" rule, enforced not just prompted)', () => {
    expect(check('git push --force').allowed).toBe(false);
    expect(check('git push -f origin autopilot/flight').allowed).toBe(false);
    expect(check('git push --force-with-lease').allowed).toBe(false);
    expect(check('git push --force-with-lease=origin/main').allowed).toBe(false);
    // an ordinary push stays allowed
    expect(check('git push origin autopilot/flight').allowed).toBe(true);
    expect(check('git push').allowed).toBe(true);
  });

  it('denies force-push spelled as a `+refspec` prefix (no flag at all)', () => {
    // git's OTHER force-push syntax: a leading `+` on the refspec itself
    // means "allow non-fast-forward" for that ref, identical in effect to
    // --force, and needs no flag FORCE_PUSH_RE would ever see.
    expect(check('git push origin +main').allowed).toBe(false);
    expect(check('git push origin +feature:feature').allowed).toBe(false);
    expect(check('git push +HEAD:refs/heads/main').allowed).toBe(false);
    // an ordinary refspec push, with no leading `+`, stays allowed
    expect(check('git push origin HEAD:refs/heads/autopilot/flight').allowed).toBe(true);
  });

  it('denies `git push` with `-f` bundled into another short flag cluster (`-uf`/`-fu`)', () => {
    expect(check('git push -uf origin main').allowed).toBe(false);
    expect(check('git push -fu origin main').allowed).toBe(false);
    // a bundled short flag with no `f` in it must stay allowed
    expect(check('git push -u origin main').allowed).toBe(true);
  });

  it('denies `git push` forcing via the refspec `+` prefix, with no `-f`/`--force` flag at all', () => {
    expect(check('git push origin +feature:main').allowed).toBe(false);
    expect(check('git push origin +feature').allowed).toBe(false);
  });

  it('denies deleting a remote branch via `git push` (--delete/-d or the empty-refspec `:branch` form)', () => {
    expect(check('git push origin --delete main').allowed).toBe(false);
    expect(check('git push origin -d some-branch').allowed).toBe(false);
    expect(check('git push origin :main').allowed).toBe(false);
    // a normal refspec push, where the colon separates a non-empty source
    // ref from the destination, must stay allowed
    expect(check('git push origin HEAD:refs/heads/autopilot/flight').allowed).toBe(true);
  });

  it('denies `git push` with `-d` bundled into another short flag cluster (`-vd`/`-dv`), same bypass class as `-uf`', () => {
    expect(check('git push -vd origin some-branch').allowed).toBe(false);
    expect(check('git push -dv origin some-branch').allowed).toBe(false);
  });

  it('denies a destructive git / process-kill hidden AFTER a single pipe (the shell runs the RHS)', () => {
    // The segment split claimed to be "per pipeline segment" but omitted the
    // bare `|` operator, so a destructive command placed after a pipe rode
    // through as one segment starting with the harmless LHS.
    expect(check('echo x | git push --force').allowed).toBe(false);
    expect(check('true | git reset --hard HEAD~1').allowed).toBe(false);
    expect(check('yes | git clean -fdx').allowed).toBe(false);
    expect(check('echo done | kill 1234').allowed).toBe(false);
    // legitimate pipelines whose git side is non-destructive stay allowed
    expect(check('git log | grep fix').allowed).toBe(true);
    expect(check('git diff | cat').allowed).toBe(true);
  });

  it('denies `git reset --hard`', () => {
    expect(check('git reset --hard').allowed).toBe(false);
    expect(check('git reset --hard HEAD~1').allowed).toBe(false);
    // a soft/mixed reset stays allowed
    expect(check('git reset --soft HEAD~1').allowed).toBe(true);
    expect(check('git reset HEAD').allowed).toBe(true);
  });

  it('denies `git rebase` outright', () => {
    expect(check('git rebase main').allowed).toBe(false);
    expect(check('git rebase -i HEAD~3').allowed).toBe(false);
  });

  it('denies force-deleting a branch (`-D`) but allows a safe merged delete (`-d`)', () => {
    expect(check('git branch -D old-feature').allowed).toBe(false);
    expect(check('git branch -d old-feature').allowed).toBe(true);
    expect(check('git branch --list').allowed).toBe(true);
  });

  it('denies `-D` combined with other letters in the same short-flag cluster (letters on either side of D)', () => {
    expect(check('git branch -aD feature').allowed).toBe(false);
    expect(check('git branch -Da feature').allowed).toBe(false);
  });

  it('denies `git branch -D` with nothing after it (the flag is the last token)', () => {
    expect(check('git branch -D').allowed).toBe(false);
  });

  it('denies the bundled short-flag force+delete form (`-fd`/`-df`), which real git treats as `-D`', () => {
    expect(check('git branch -fd old-feature').allowed).toBe(false);
    expect(check('git branch -df old-feature').allowed).toBe(false);
  });

  it('denies the long-form delete/force pair as the LAST tokens in the command (each flag hits end-of-string)', () => {
    expect(check('git branch --force --delete').allowed).toBe(false);
    expect(check('git branch --delete --force').allowed).toBe(false);
  });

  it('denies the long-form equivalents of `-D` / `-f` (`--delete --force`, `git clean --force`)', () => {
    expect(check('git branch --delete --force old-feature').allowed).toBe(false);
    expect(check('git branch --force --delete old-feature').allowed).toBe(false);
    // --delete alone is still the safe merged-only delete
    expect(check('git branch --delete old-feature').allowed).toBe(true);
    expect(check('git clean --force').allowed).toBe(false);
  });

  it('denies checking out or switching TO main', () => {
    expect(check('git checkout main').allowed).toBe(false);
    expect(check('git switch main').allowed).toBe(false);
    // checking out a feature branch, or a file named main.ts, stays allowed
    expect(check('git checkout autopilot/flight').allowed).toBe(true);
    expect(check('git checkout -- src/main.ts').allowed).toBe(true);
  });

  it('denies checking out main even when followed by more arguments (whitespace boundary, not just end-of-string)', () => {
    expect(check('git checkout main --force').allowed).toBe(false);
  });

  it('denies force-cleaning untracked files (`-f`)', () => {
    expect(check('git clean -f').allowed).toBe(false);
    expect(check('git clean -fd').allowed).toBe(false);
    expect(check('git clean -xdf').allowed).toBe(false);
    // a dry-run clean stays allowed
    expect(check('git clean -n').allowed).toBe(true);
  });

  it('denies `git clean -f` even when followed by an argument (whitespace boundary, not just end-of-string)', () => {
    expect(check('git clean -f untracked/').allowed).toBe(false);
  });

  it('denies `git filter-branch` (history rewrite)', () => {
    expect(check('git filter-branch --tree-filter "rm secret" HEAD').allowed).toBe(false);
  });

  it("denies `git --help`/`-h`/`git help` (opens the operator's browser mid-flight, board web-mtbozqli-y0wn2i)", () => {
    expect(check('git revert --help').allowed).toBe(false);
    expect(check('git --help').allowed).toBe(false);
    expect(check('git -h').allowed).toBe(false);
    expect(check('git help').allowed).toBe(false);
    expect(check('git help log').allowed).toBe(false);
    expect(check('git log --help').allowed).toBe(false);
    expect(check('git log -h').allowed).toBe(false);
    // ordinary commands without a help flag stay allowed
    expect(check('git log --oneline -5').allowed).toBe(true);
    expect(check('git status').allowed).toBe(true);
  });

  it('the git-help denial reason names the browser-escape rationale', () => {
    expect(check('git revert --help').reason).toContain('browser');
    expect(check('git revert --help').reason).toContain('git help');
  });

  it('does not false-positive on "-h"/"--help" text inside a quoted argument (e.g. a commit message)', () => {
    expect(check('git commit -m "document the -h flag and --help text"').allowed).toBe(true);
  });

  it('catches `git --help` buried in a multi-command chain, same as the destructive-git checks', () => {
    expect(check('pnpm test && git log --help').allowed).toBe(false);
  });

  it('does not false-positive on ordinary additive git commands', () => {
    expect(check('git add -A && git commit -m "feat: x"').allowed).toBe(true);
    expect(check('git merge --no-ff feature-branch').allowed).toBe(true);
    expect(check('git log --oneline -5').allowed).toBe(true);
    expect(check('git diff main...HEAD').allowed).toBe(true);
  });

  it('catches a destructive op buried in a multi-command chain', () => {
    expect(check('pnpm test && git add -A && git push --force').allowed).toBe(false);
    expect(check('git reset --hard\ngit status').allowed).toBe(false);
  });

  it('catches a destructive op on a later line even when the FIRST line is not a git command at all', () => {
    // Unlike the case above (where "git reset --hard" is already the first
    // segment), this requires the per-segment split to actually happen on a
    // bare newline — without it, the whole multi-line string fails to match
    // "starts with git" at all and the destructive op goes undetected.
    expect(check('echo hi\ngit reset --hard').allowed).toBe(false);
  });

  it('does NOT detect a destructive op when "git" merely appears mid-segment, not as the segment\'s own command', () => {
    // "git" here is just curl's argument text, not the invoked command — the
    // git-match regex must anchor to the START of the segment.
    expect(check('echo git reset --hard').allowed).toBe(true);
  });

  it('a subcommand other than the guarded one is not mistaken for it merely because it also carries a similarly-shaped flag', () => {
    // Each `sub === '<subcommand>'` check must actually gate on the
    // subcommand — not fire just because `rest` happens to match that
    // subcommand's flag pattern under an unrelated subcommand.
    expect(check('git checkout --hard').allowed).toBe(true);
    expect(check('git checkout -D').allowed).toBe(true);
    expect(check('git branch main').allowed).toBe(true);
    expect(check('git status -f').allowed).toBe(true);
  });

  it('a git invocation with nothing after "git" (or only trailing whitespace) is not treated as destructive', () => {
    expect(check('git').allowed).toBe(true);
    expect(check('git ').allowed).toBe(true);
  });

  it('every destructive-git denial reason names the specific command it caught', () => {
    expect(check('git push --force').reason).toContain('`git push --force`');
    expect(check('git push --force').reason).toContain('additive git only');
    expect(check('git reset --hard').reason).toContain('`git reset --hard`');
    expect(check('git rebase main').reason).toContain('`git rebase`');
    expect(check('git branch -D old').reason).toContain('`git branch -D`');
    expect(check('git checkout main').reason).toContain('`git checkout main`');
    expect(check('git switch main').reason).toContain('`git switch main`');
    expect(check('git clean -f').reason).toContain('`git clean -f`');
    expect(check('git filter-branch --tree-filter "x" HEAD').reason).toContain(
      '`git filter-branch`',
    );
  });

  it('denies stopping or restarting the dashboard from a flight (SUICIDE GUARD)', () => {
    // The exact root-caused incident: a flight ran the dashboard's own stop
    // command and killed the host process that was running it.
    expect(check('pnpm dashboard:stop').allowed).toBe(false);
    expect(check('pnpm run dashboard:stop').allowed).toBe(false);
    expect(check('pnpm dashboard:restart').allowed).toBe(false);
    expect(check('node apps/dashboard/dist/control/cli.js stop').allowed).toBe(false);
    expect(check(String.raw`node apps\dashboard\dist\control\cli.js restart`).allowed).toBe(false);
    expect(check('STOP-DASHBOARD.cmd').allowed).toBe(false);
    expect(check('RESTART-DASHBOARD.cmd').allowed).toBe(false);
    // macOS/Linux equivalents (web-msnsqj7t-pwdyra cross-OS parity) — the
    // textual backstop must recognize both launcher tiers, not just .cmd.
    expect(check('./STOP-DASHBOARD.sh').allowed).toBe(false);
    expect(check('./RESTART-DASHBOARD.sh').allowed).toBe(false);
    expect(check('bash STOP-DASHBOARD.sh').allowed).toBe(false);
    expect(check('autopilot-dashboard stop').allowed).toBe(false);
    // but checking status or starting stays allowed — those don't tear anything down
    expect(check('pnpm dashboard:status').allowed).toBe(true);
    expect(check('node apps/dashboard/dist/control/cli.js status').allowed).toBe(true);
  });

  it('recognizes the control-cli stop/restart shape even without a .js/.ts extension', () => {
    expect(check('node apps/dashboard/dist/control/cli stop').allowed).toBe(false);
  });

  it('recognizes the control-cli and autopilot-dashboard shapes with multiple spaces before stop/restart', () => {
    expect(check('node apps/dashboard/dist/control/cli.js  stop').allowed).toBe(false);
    expect(check('autopilot-dashboard  stop').allowed).toBe(false);
  });

  it('a stray quote character right after the command name does not defeat detection (optional quote group)', () => {
    expect(check('node apps/dashboard/dist/control/cli.js" stop').allowed).toBe(false);
    expect(check('autopilot-dashboard" stop').allowed).toBe(false);
  });

  it('denies direct process-kill commands outright (no legitimate use from a flight)', () => {
    expect(check('kill 1234').allowed).toBe(false);
    expect(check('kill -9 1234').allowed).toBe(false);
    expect(check('taskkill /PID 1234 /F').allowed).toBe(false);
    expect(check('pkill -f dashboard').allowed).toBe(false);
    expect(check('Stop-Process -Id 1234').allowed).toBe(false);
    // buried in a chain, still caught
    expect(check('pnpm test && taskkill /PID 1234 /F').allowed).toBe(false);
    // but the word merely appearing in ordinary text (e.g. a commit message) is fine
    expect(check('git commit -m "add a kill switch for retries"').allowed).toBe(true);
    // and a script merely named with the word stays allowed (not a bare kill command)
    expect(check('node scripts/kill-switch-check.mjs').allowed).toBe(true);
  });

  it('the suicide-guard reasons are specific about which class of command they caught', () => {
    expect(check('kill 1234').reason).toContain('process-kill');
    expect(check('kill 1234').reason).toContain('SUICIDE GUARD');
    expect(check('pnpm dashboard:stop').reason).toContain('stopping or restarting the dashboard');
    expect(check('pnpm dashboard:stop').reason).toContain('SUICIDE GUARD');
  });

  it('a bare process-kill command is caught across a \\r\\n line separator too', () => {
    expect(check('pnpm test\r\ntaskkill /PID 1234 /F').allowed).toBe(false);
  });

  it('a bare process-kill command on a later line is still caught with a plain \\n separator (no \\r required)', () => {
    // Assert the SUICIDE-GUARD reason, not just `.allowed`: with a slashed
    // argument (`/PID`, `/F`) the absolute-path layer would deny this anyway,
    // masking whether checkProcessControl ever split on the bare `\n`.
    expect(check('echo hi\ntaskkill /PID 1234 /F').reason).toContain('SUICIDE GUARD');
  });

  it('a bare process-kill with NO slash-shaped argument is still caught across a plain \\n separator (isolates the newline split from the path check)', () => {
    // `kill 1234` carries no `/`-shaped token, so the absolute-path layer never
    // fires — only checkProcessControl can catch it, and only if it splits on
    // the bare LF the way its sibling checkDestructiveGit does. Regression for
    // the LF-vs-CRLF split gap that let a plain-newline kill slip through.
    const v = check('echo hi\nkill 1234');
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain('SUICIDE GUARD');
  });

  it('PROCESS_KILL_RE only matches the kill word at the START of the (unquoted) segment, not anywhere within it', () => {
    expect(check('echo hi kill later').allowed).toBe(true);
  });

  it('PROCESS_KILL_RE does not let a non-whitespace prefix fuse onto the kill word ("xkill" is not "kill")', () => {
    expect(check('xkill 1234').allowed).toBe(true);
  });

  it('recognizes a single-quoted (not just double-quoted) phrase as inert text, not a live kill/dashboard-stop command', () => {
    expect(check("git commit -m 'mentions pnpm dashboard:stop here'").allowed).toBe(true);
  });

  it('a bare process-kill command with NOTHING after it (true end of string) is still caught', () => {
    expect(check('kill').allowed).toBe(false);
  });

  it('stripping a quoted argument next to "taskkill" does not fuse it onto trailing digits (must stay a real word boundary)', () => {
    // stripQuoted must replace the quoted span with a SPACE, not delete it —
    // otherwise "taskkill" fuses onto whatever follows the stripped quotes and
    // stops being recognized as the bare command at all.
    expect(check('taskkill"x"1234').allowed).toBe(false);
  });

  it('denies "killall" (kills every process matching a name, same suicide risk as kill/pkill/taskkill)', () => {
    expect(check('killall dashboard').allowed).toBe(false);
    expect(check('killall -9 node').allowed).toBe(false);
    // buried in a chain, still caught
    expect(check('pnpm test && killall node').allowed).toBe(false);
    // reason is specific, same as the other process-kill commands
    expect(check('killall dashboard').reason).toContain('process-kill');
    expect(check('killall dashboard').reason).toContain('SUICIDE GUARD');
    // but a script merely named with the word stays allowed (not a bare command)
    expect(check('node scripts/killall-check.mjs').allowed).toBe(true);
  });

  it('denies a `sudo`-prefixed process-kill (privilege-escalation prefix that would otherwise slip past the START anchor)', () => {
    expect(check('sudo kill 1234').allowed).toBe(false);
    expect(check('sudo pkill -f dashboard').allowed).toBe(false);
    expect(check('sudo killall node').allowed).toBe(false);
    // sudo with a boolean flag before the command (e.g. -n for non-interactive) too
    expect(check('sudo -n kill -9 1234').allowed).toBe(false);
    // buried in a chain, still caught
    expect(check('pnpm test && sudo kill 1234').allowed).toBe(false);
    // reason is specific, same as the unprefixed form
    expect(check('sudo kill 1234').reason).toContain('process-kill');
    expect(check('sudo kill 1234').reason).toContain('SUICIDE GUARD');
    // case-insensitive, like the rest of PROCESS_KILL_RE
    expect(check('SUDO KILL 1234').allowed).toBe(false);
  });

  it('does not false-positive on the phrases appearing inside a QUOTED argument (e.g. a commit message describing this very guard)', () => {
    expect(
      check(
        'git commit -m "fix(engine): deny pnpm dashboard:stop and dashboard:restart from flights"',
      ).allowed,
    ).toBe(true);
    expect(check('git commit -m "add a kill switch for retries"').allowed).toBe(true);
  });

  it('a global-option token appearing mid-argument (not at the true front) must not be mistaken for a leading global option', () => {
    // "-C" here is a plain argument to `reset`, not a leading global option —
    // an unanchored strip would corrupt parsing and let `reset --hard` through
    // by mis-identifying the subcommand.
    expect(check('git reset -C x --hard').allowed).toBe(false);
  });

  it('`=value` global-option stripping consumes the WHOLE value, not just its first character', () => {
    expect(check('git --git-dir=customdir reset --hard').allowed).toBe(false);
  });

  it('space-separated global-option stripping tolerates more than one space before the value', () => {
    expect(check('git -C   . reset --hard').allowed).toBe(false);
  });

  it('bare global-option stripping tolerates leading whitespace left over from a prior strip', () => {
    expect(check('git -c a=b  --no-pager reset --hard').allowed).toBe(false);
  });

  it('bare global-option stripping consumes a trailing `=value` on options outside the fixed with-arg list', () => {
    expect(check('git --foo=bar reset --hard').allowed).toBe(false);
  });

  it('bare global-option stripping recognizes any single-dash letter flag, not just -C/-c', () => {
    expect(check('git -x reset --hard').allowed).toBe(false);
  });

  it('is not fooled by git GLOBAL options ahead of the subcommand (a documented bypass shape)', () => {
    // `-C <dir>` (short and long space-separated global options) used to make
    // the guard read the FLAG as the subcommand, letting the real destructive
    // op straight through.
    expect(check('git -C . reset --hard').allowed).toBe(false);
    expect(check('git -C src push --force').allowed).toBe(false);
    expect(check('git -c user.name=x -c user.email=y push -f').allowed).toBe(false);
    expect(check('git --no-pager reset --hard').allowed).toBe(false);
    // and a global option ahead of an ORDINARY subcommand still stays allowed
    expect(check('git -C . status').allowed).toBe(true);
    expect(check('git --no-pager log --oneline -5').allowed).toBe(true);
    expect(check('git -c core.pager=cat commit -m "feat: x"').allowed).toBe(true);
  });
});

describe('evaluateHookInput', () => {
  const deny = (cmd: string): string | null =>
    evaluateHookInput(JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd } }), ROOT);

  it('returns null (no decision) for a contained command', () => {
    expect(deny('pnpm test')).toBeNull();
  });

  it('returns the official PreToolUse deny JSON for an escaping command', () => {
    const out = deny(`cd "${OUTSIDE}" && git commit -m x`);
    expect(out).not.toBeNull();
    const parsed = JSON.parse(out ?? '{}') as {
      hookSpecificOutput: {
        hookEventName: string;
        permissionDecision: string;
        permissionDecisionReason: string;
      };
    };
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('outside');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
      'Work only inside the target repository',
    );
  });

  it('denies a contained commit that hand-writes its own DCO trailer, under its own prefix', () => {
    // Contained — cwd never leaves ROOT — so this can only be caught by the
    // trailer check, not by containment, and must not borrow CONTAINMENT's
    // wording (the agent's next move is `-s`, not "work inside the repo").
    const out = deny('git commit -m "fix: x\n\nSigned-off-by: A <a@example.com>"');
    expect(out).not.toBeNull();
    const reason = (
      JSON.parse(out ?? '{}') as { hookSpecificOutput: { permissionDecisionReason: string } }
    ).hookSpecificOutput.permissionDecisionReason;
    expect(reason).toContain('DCO TRAILER:');
    expect(reason).toContain('git commit -s');
    expect(reason).not.toContain('CONTAINMENT');
  });

  it('a WebFetch with no `url` field is no-decision (the WebFetch branch itself only inspects `url`)', () => {
    // NOT a test of the tool_name fallthrough below — WebFetch IS in the
    // guarded set. `file_path` is simply not a field that branch inspects.
    expect(
      evaluateHookInput(
        JSON.stringify({ tool_name: 'WebFetch', tool_input: { file_path: '/etc/passwd' } }),
        ROOT,
      ),
    ).toBeNull();
  });

  it('ignores tools outside the guarded set entirely (the tool_name fallthrough, no decision)', () => {
    // Task/TodoWrite/mcp__* etc. never hit any tool_name branch above, so
    // evaluateHookInput falls through the `tool_name !== 'Bash'` check with no
    // Bash containment applied — even when the payload carries a `command`
    // field shaped like an escape.
    expect(
      evaluateHookInput(JSON.stringify({ tool_name: 'Task', tool_input: {} }), ROOT),
    ).toBeNull();
    expect(
      evaluateHookInput(
        JSON.stringify({
          tool_name: 'mcp__example__tool',
          tool_input: { command: `cd "${OUTSIDE}" && git commit -m x` },
        }),
        ROOT,
      ),
    ).toBeNull();
  });

  it('a non-guarded tool is ignored even when its payload happens to carry a `command` field shaped like an escape', () => {
    // The tool_name gate must fire BEFORE the command shape is ever
    // inspected — a WebFetch (or any other non-Bash) payload must not be run
    // through Bash containment just because it has a `command`-named field.
    expect(
      evaluateHookInput(
        JSON.stringify({ tool_name: 'WebFetch', tool_input: { command: 'git push --force' } }),
        ROOT,
      ),
    ).toBeNull();
  });

  const evalTool = (tool_name: string, tool_input: Record<string, unknown>): string | null =>
    evaluateHookInput(JSON.stringify({ tool_name, tool_input }), ROOT);
  const reasonOf = (out: string | null): string =>
    (JSON.parse(out ?? '{}') as { hookSpecificOutput?: { permissionDecisionReason?: string } })
      .hookSpecificOutput?.permissionDecisionReason ?? '';

  it('CONTAINS the Read tool too — an absolute path outside the target is denied (the hole Bash-only guarding left)', () => {
    const out = evalTool('Read', { file_path: '/etc/passwd' });
    expect(out).not.toBeNull();
    expect(reasonOf(out)).toContain('CONTAINMENT');
    expect(reasonOf(out)).toContain('outside the target repo: /etc/passwd');
    expect(reasonOf(out)).toContain('Work only inside the target repository');
    // inside the target stays allowed
    expect(evalTool('Read', { file_path: `${ROOT}/src/index.ts` })).toBeNull();
  });

  it('recognizes a drive-letter absolute path (not just a leading-slash one) via evaluateHookInput too', () => {
    const out = evalTool('Read', { file_path: p('C', '/data/someone/secrets.txt') });
    expect(out).not.toBeNull();
    expect(reasonOf(out)).toContain('CONTAINMENT');
  });

  it("a path-shaped substring that does not start at the field value's beginning is not treated as absolute", () => {
    // A relative path that merely CONTAINS a drive-letter pattern later on —
    // only a value that STARTS with it counts. Built at runtime so the
    // no-personal-paths gate (which bans drive-path LITERALS in source) never
    // sees one; the guard under test receives the exact same string.
    const relativeWithDrivePattern = ['notes/', 'C', ':/x'].join('');
    expect(evalTool('Read', { file_path: relativeWithDrivePattern })).toBeNull();
  });

  it('a non-string field value (e.g. an array instead of a string) is skipped, not coerced through the path regexes', () => {
    expect(evalTool('Read', { file_path: ['/etc/passwd'] })).toBeNull();
  });

  it('CONTAINS Write and Edit too — the same escape hole the Read fix left open', () => {
    for (const tool of ['Write', 'Edit']) {
      const out = evalTool(tool, { file_path: '/etc/passwd' });
      expect(out).not.toBeNull();
      expect(reasonOf(out)).toContain('CONTAINMENT');
      // inside the target stays allowed, and no read-hygiene verdict applies
      expect(evalTool(tool, { file_path: `${ROOT}/src/index.ts` })).toBeNull();
      expect(evalTool(tool, { file_path: `${ROOT}/dist/guard.js` })).toBeNull();
    }
  });

  it('CONTAINS NotebookEdit too — same hole, keyed on notebook_path not file_path (defense-in-depth: it is disallowed by default, but a config drift must not reopen this)', () => {
    const out = evalTool('NotebookEdit', { notebook_path: '/etc/passwd' });
    expect(out).not.toBeNull();
    expect(reasonOf(out)).toContain('CONTAINMENT');
    // inside the target stays allowed, and no read-hygiene verdict applies
    expect(evalTool('NotebookEdit', { notebook_path: `${ROOT}/notes.ipynb` })).toBeNull();
    expect(evalTool('NotebookEdit', { notebook_path: `${ROOT}/dist/notes.ipynb` })).toBeNull();
  });

  it('READ HYGIENE (B7): denies Read/Grep/Glob into generated and vendored output', () => {
    expect(reasonOf(evalTool('Read', { file_path: `${ROOT}/dist/guard.js` }))).toContain(
      'generated/vendored path',
    );
    expect(reasonOf(evalTool('Read', { file_path: 'coverage/lcov.info' }))).toContain(
      'generated/vendored path',
    );
    expect(reasonOf(evalTool('Grep', { pattern: 'foo', path: 'node_modules/lodash' }))).toContain(
      'generated/vendored path',
    );
    expect(reasonOf(evalTool('Glob', { pattern: 'dist/**/*.js' }))).toContain(
      'generated/vendored path',
    );
    expect(reasonOf(evalTool('Read', { file_path: '.git/config' }))).toContain(
      'generated/vendored path',
    );
    // a path ending EXACTLY at the segment name (no trailing slash) is caught too
    expect(reasonOf(evalTool('Read', { file_path: 'src/dist' }))).toContain(
      'generated/vendored path',
    );
  });

  it('read hygiene fails OPEN on source paths and content-only patterns', () => {
    expect(evalTool('Read', { file_path: 'src/guard.ts' })).toBeNull();
    // a Grep PATTERN is content regex, not a path — "dist" as content is fine
    expect(evalTool('Grep', { pattern: 'dist', path: 'src' })).toBeNull();
    // "distribution" / "recovery" only CONTAIN the words — no path segment match
    expect(evalTool('Read', { file_path: 'src/distribution.ts' })).toBeNull();
    expect(evalTool('Glob', { pattern: 'src/**/*.ts' })).toBeNull();
  });

  it('read hygiene tolerates a Glob call with no pattern field at all (isGlob alone does not imply one was provided)', () => {
    expect(evalTool('Glob', {})).toBeNull();
  });

  it('fails open on malformed input (the detection audit still backstops)', () => {
    expect(evaluateHookInput('not json at all', ROOT)).toBeNull();
    expect(evaluateHookInput(JSON.stringify({ tool_name: 'Bash' }), ROOT)).toBeNull();
  });

  it('denies a WebFetch targeting the loopback interface (the dashboard own API)', () => {
    const out = evalTool('WebFetch', { url: 'http://127.0.0.1:4173/api/fly', prompt: 'x' });
    expect(out).not.toBeNull();
    expect(reasonOf(out)).toContain('SSRF GUARD');
    expect(reasonOf(out)).toContain('loopback');
  });

  it('denies a WebFetch targeting localhost, [::1], or a private/link-local IPv4 range', () => {
    expect(evalTool('WebFetch', { url: 'http://localhost:3000/', prompt: 'x' })).not.toBeNull();
    expect(evalTool('WebFetch', { url: 'http://[::1]/', prompt: 'x' })).not.toBeNull();
    expect(evalTool('WebFetch', { url: 'http://10.0.0.5/', prompt: 'x' })).not.toBeNull();
    expect(evalTool('WebFetch', { url: 'http://192.168.1.1/', prompt: 'x' })).not.toBeNull();
    expect(evalTool('WebFetch', { url: 'http://172.16.0.1/', prompt: 'x' })).not.toBeNull();
    // 169.254.169.254 is the cloud instance-metadata endpoint — the classic
    // SSRF-to-credential-theft target; must be denied like any other
    // link-local address.
    expect(
      evalTool('WebFetch', { url: 'http://169.254.169.254/latest/meta-data/', prompt: 'x' }),
    ).not.toBeNull();
  });

  it('allows a WebFetch targeting an ordinary public URL', () => {
    expect(evalTool('WebFetch', { url: 'https://example.com/docs', prompt: 'x' })).toBeNull();
    expect(evalTool('WebFetch', { url: 'https://8.8.8.8/', prompt: 'x' })).toBeNull();
  });

  it('WebFetch fails open on a malformed URL or a missing url field', () => {
    expect(evalTool('WebFetch', { url: 'not a url', prompt: 'x' })).toBeNull();
    expect(evalTool('WebFetch', { prompt: 'x' })).toBeNull();
  });
});

describe('checkWebFetchTarget', () => {
  it('denies loopback, private, and link-local hosts; allows public hosts', () => {
    expect(checkWebFetchTarget('http://127.0.0.1/').allowed).toBe(false);
    expect(checkWebFetchTarget('http://0.0.0.0/').allowed).toBe(false);
    expect(checkWebFetchTarget('http://LOCALHOST/').allowed).toBe(false);
    expect(checkWebFetchTarget('http://169.254.169.254/').allowed).toBe(false);
    expect(checkWebFetchTarget('https://example.com/').allowed).toBe(true);
  });

  it('fails open on an unparsable URL', () => {
    expect(checkWebFetchTarget('%%%not a url%%%').allowed).toBe(true);
  });
});

function resolvesTo(addresses: readonly { address: string; family: number }[]) {
  return async () => addresses;
}

describe('checkWebFetchDnsRebinding', () => {
  it('denies when the resolved address is a private IPv4 range (DNS rebinding past the literal check)', async () => {
    const verdict = await checkWebFetchDnsRebinding(
      'https://attacker-controlled.example/',
      resolvesTo([{ address: '10.0.0.5', family: 4 }]),
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('10.0.0.5');
    expect(verdict.reason).toContain('loopback/private-network');
  });

  it('denies when the resolved address is loopback IPv6', async () => {
    const verdict = await checkWebFetchDnsRebinding(
      'https://attacker-controlled.example/',
      resolvesTo([{ address: '::1', family: 6 }]),
    );
    expect(verdict.allowed).toBe(false);
  });

  it('denies when the resolved address is link-local IPv6 (fe80::/10)', async () => {
    const verdict = await checkWebFetchDnsRebinding(
      'https://attacker-controlled.example/',
      resolvesTo([{ address: 'fe80::1', family: 6 }]),
    );
    expect(verdict.allowed).toBe(false);
  });

  it('allows when every resolved address is public', async () => {
    const verdict = await checkWebFetchDnsRebinding(
      'https://example.com/',
      resolvesTo([{ address: '93.184.216.34', family: 4 }]),
    );
    expect(verdict.allowed).toBe(true);
  });

  it('denies when ANY of several resolved addresses is private, not just the first', async () => {
    const verdict = await checkWebFetchDnsRebinding(
      'https://example.com/',
      resolvesTo([
        { address: '93.184.216.34', family: 4 },
        { address: '192.168.1.1', family: 4 },
      ]),
    );
    expect(verdict.allowed).toBe(false);
  });

  it('fails open on an unparsable URL — the resolver is never even called', async () => {
    let called = false;
    const verdict = await checkWebFetchDnsRebinding('%%%not a url%%%', async () => {
      called = true;
      return [];
    });
    expect(verdict.allowed).toBe(true);
    expect(called).toBe(false);
  });

  it('fails open when DNS resolution itself errors (NXDOMAIN, timeout) — not evidence of a local target', async () => {
    const verdict = await checkWebFetchDnsRebinding('https://nonexistent.example/', async () => {
      throw new Error('ENOTFOUND');
    });
    expect(verdict.allowed).toBe(true);
  });
});

describe('extractWebFetchUrl', () => {
  it('extracts the url from a WebFetch payload', () => {
    const raw = JSON.stringify({
      tool_name: 'WebFetch',
      tool_input: { url: 'https://example.com/' },
    });
    expect(extractWebFetchUrl(raw)).toBe('https://example.com/');
  });

  it('returns null for a non-WebFetch tool, malformed JSON, or a missing/non-string url', () => {
    expect(
      extractWebFetchUrl(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } })),
    ).toBeNull();
    expect(extractWebFetchUrl('not json at all')).toBeNull();
    expect(
      extractWebFetchUrl(JSON.stringify({ tool_name: 'WebFetch', tool_input: {} })),
    ).toBeNull();
    expect(
      extractWebFetchUrl(JSON.stringify({ tool_name: 'WebFetch', tool_input: { url: 42 } })),
    ).toBeNull();
  });
});

describe('buildFlightSettings', () => {
  it('emits the official hooks shape: Bash + Read|Grep|Glob|Write|Edit|NotebookEdit + WebFetch matchers → node guard command', () => {
    const s = buildFlightSettings(ROOT, p('Z', '/engine/dist/guard-hook.js'));
    const groups = s.hooks.PreToolUse;
    expect(groups).toHaveLength(3);
    expect(groups[0]?.matcher).toBe('Bash');
    expect(groups[1]?.matcher).toBe('Read|Grep|Glob|Write|Edit|NotebookEdit');
    expect(groups[2]?.matcher).toBe('WebFetch');
    for (const g of groups) {
      const hook = g.hooks[0];
      expect(hook?.type).toBe('command');
      expect(hook?.command).toContain('guard-hook.js');
      expect(hook?.command).toContain(ROOT);
      expect(hook?.timeout).toBeGreaterThan(0);
    }
  });

  it('quotes both the script path and the target (spaces survive)', () => {
    const root = p('C', '/My Projects/repo');
    const script = p('C', '/tools/guard-hook.js');
    expect(buildFlightSettings(root, script).hooks.PreToolUse[0]?.hooks[0]?.command).toBe(
      `node "${script}" "${root}"`,
    );
  });

  it('CONVERTS backslashes to forward slashes in both paths, rather than merely stripping them', () => {
    const root = p('C', String.raw`\My Projects\repo`);
    const script = p('C', String.raw`\tools\guard-hook.js`);
    const cmd = buildFlightSettings(root, script).hooks.PreToolUse[0]?.hooks[0]?.command;
    expect(cmd).toBe(`node "${p('C', '/tools/guard-hook.js')}" "${p('C', '/My Projects/repo')}"`);
  });
});

describe('guardHookScriptPath', () => {
  it('resolves the compiled guard-hook.js as an absolute filesystem path, not a file:// URL', () => {
    const scriptPath = guardHookScriptPath();
    expect(scriptPath.endsWith('guard-hook.js')).toBe(true);
    expect(isAbsolute(scriptPath)).toBe(true);
    expect(scriptPath.startsWith('file:')).toBe(false);
  });
});

describe('isGitCommitCommand', () => {
  it('recognizes a plain commit', () => {
    expect(isGitCommitCommand('git commit -m "feat: x"')).toBe(true);
  });

  it('recognizes a commit staged in the same pipeline as add', () => {
    expect(isGitCommitCommand('git add -A && git commit -m "feat: x"')).toBe(true);
  });

  it('recognizes a commit behind global options (the same bypass shape checkDestructiveGit closes)', () => {
    expect(isGitCommitCommand('git -C . commit -m "feat: x"')).toBe(true);
    expect(isGitCommitCommand('git --no-pager commit -m "feat: x"')).toBe(true);
  });

  it('ignores unrelated git subcommands and non-git commands', () => {
    expect(isGitCommitCommand('git status')).toBe(false);
    expect(isGitCommitCommand('pnpm test')).toBe(false);
    expect(isGitCommitCommand('echo "git commit -m x"')).toBe(false);
  });

  it('exempts --dry-run — no real commit is ever created', () => {
    expect(isGitCommitCommand('git commit --dry-run -m "feat: x"')).toBe(false);
  });
});

describe('commitSignoffDenial', () => {
  it('refuses a commit whose message hand-writes the trailer', () => {
    const reason = commitSignoffDenial(
      'git commit -m "fix: x\n\nSigned-off-by: Someone <someone@example.com>"',
    );
    expect(reason).toContain('hand-writes a `Signed-off-by:` trailer');
    expect(reason).toContain('git commit -s');
  });

  it('refuses the heredoc shape the real leak used — the trailer sits on its own line', () => {
    // Regression: every observed leak composed the message through a heredoc,
    // so the trailer is separated from the `git commit` token by newlines.
    // A per-segment scan splits on those and would see two innocent halves.
    const reason = commitSignoffDenial(
      [
        "git commit -m \"$(cat <<'EOF'",
        'fix: x',
        '',
        'Signed-off-by: A <a@example.com>',
        'EOF',
        ')"',
      ].join('\n'),
    );
    expect(reason).not.toBeNull();
  });

  it('allows a commit that lets git write the trailer', () => {
    expect(commitSignoffDenial('git commit -s -m "fix: x"')).toBeNull();
    expect(commitSignoffDenial('git add -A && git commit -s -m "fix: x"')).toBeNull();
  });

  it('is silent on commands that are not commits, however they mention the trailer', () => {
    expect(commitSignoffDenial("git log -1 --format='%B' | grep 'Signed-off-by:'")).toBeNull();
    expect(
      commitSignoffDenial('git commit --dry-run -m "Signed-off-by: A <a@example.com>"'),
    ).toBeNull();
  });

  it('matches the trailer case-insensitively and across loose spacing', () => {
    expect(
      commitSignoffDenial('git commit -m "x\n\nsigned-off-by : A <a@example.com>"'),
    ).not.toBeNull();
  });
});

describe('checkPreCommitSiblingOverlap', () => {
  it('allows a commit with no staged/claim overlap', () => {
    const v = checkPreCommitSiblingOverlap(
      ['src/a.ts'],
      [{ branch: 'fleet-2', primaryFile: 'src/b.ts' }],
    );
    expect(v.allowed).toBe(true);
  });

  it('allows a commit when no sibling has a standing claim', () => {
    expect(checkPreCommitSiblingOverlap(['src/a.ts'], []).allowed).toBe(true);
  });

  it('denies a commit that stages a file a sibling claims right now, naming the sibling', () => {
    const v = checkPreCommitSiblingOverlap(
      ['README.md', 'src/parser.ts'],
      [{ branch: 'fleet-3', primaryFile: 'src/parser.ts' }],
    );
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain('src/parser.ts');
    expect(v.reason).toContain('fleet-3');
    expect(v.reason).toContain('PRE-COMMIT SIBLING SCAN');
  });

  it('matches across separator style and case, like detectIntentCollisions', () => {
    const v = checkPreCommitSiblingOverlap(
      [String.raw`src\Parser.ts`],
      [{ branch: 'fleet-3', primaryFile: 'src/parser.ts' }],
    );
    expect(v.allowed).toBe(false);
  });

  it('matches a claim declared with a leading ./ prefix, like detectIntentCollisions', () => {
    const v = checkPreCommitSiblingOverlap(
      ['src/parser.ts'],
      [{ branch: 'fleet-3', primaryFile: './src/parser.ts' }],
    );
    expect(v.allowed).toBe(false);
  });
});

describe('extractBashCommand', () => {
  it('extracts the command from a Bash tool call', () => {
    const raw = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' } });
    expect(extractBashCommand(raw)).toBe('git status');
  });

  it('returns null for a non-Bash tool call', () => {
    const raw = JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/x' } });
    expect(extractBashCommand(raw)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(extractBashCommand('not json')).toBeNull();
  });
});

describe('buildDenyDecision', () => {
  it('shapes the official PreToolUse deny JSON', () => {
    const parsed = JSON.parse(buildDenyDecision('because')) as {
      hookSpecificOutput: {
        hookEventName: string;
        permissionDecision: string;
        permissionDecisionReason: string;
      };
    };
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toBe('because');
  });
});
