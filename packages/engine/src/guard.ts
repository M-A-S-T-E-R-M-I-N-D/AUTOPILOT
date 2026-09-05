// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Flight escape PREVENTION (docs/FLIGHT-CONTAINMENT.md, layer 2). The detection
 * audit (containment.ts) catches an escape after the fact; this layer BLOCKS the
 * escaping Bash command before it runs, via Claude Code's official PreToolUse
 * hook: the flight is spawned with `--settings` pointing at a generated settings
 * file whose hook pipes every Bash command through a path guard. Any reference
 * to an absolute path outside the target repo, a home-directory credential
 * location, or a bare `cd` (which lands in HOME) is denied with the documented
 * `permissionDecision: "deny"` JSON — enforced by the harness, not by asking the
 * model nicely.
 *
 * Honest scope: this is a TEXTUAL guard over the command string. It blocks the
 * whole class of observed escapes (absolute-path `cd`/`git -C`/reads outside the
 * target) but cannot statically resolve every relative-path dance; the detection
 * audit remains the backstop, and the OS-level sandbox (macOS/Linux/WSL2 only —
 * "Native Windows is not supported", per the official sandboxing docs) is the
 * end-state on platforms that have it.
 *
 * The same hook also enforces the SOUL's "additive git only" rule (never
 * force-push, reset --hard, rebase, delete a branch, touch main, or rewrite
 * history) — previously prompt-only, now denied here too.
 */

import { fileURLToPath } from 'node:url';

export interface ContainmentVerdict {
  readonly allowed: boolean;
  readonly reason: string | null;
}

/**
 * Absolute path of the compiled guard-hook entry (sibling of this module in
 * dist/) — what the generated settings reference. Meaningful at runtime from the
 * built package; callers writing settings should use this, never hardcode.
 */
export function guardHookScriptPath(): string {
  return fileURLToPath(new URL('./guard-hook.js', import.meta.url));
}

/**
 * Normalize a path for comparison: forward slashes, lowercase, no trailing
 * slash, no leading `./` — the same `./`-prefix stripping
 * `comparablePath()` (apps/dashboard/src/flight/intent-claims.ts) applies,
 * since both compare a declared `.autopilot-intent` primary-file claim
 * (which may carry that prefix) against a set of paths that never do.
 */
function norm(p: string): string {
  const s = p.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  return s.endsWith('/') && s.length > 1 ? s.slice(0, -1) : s;
}

/** Map a git-bash drive path (`/c/x`) onto its drive-letter form. */
function gitBashToDrive(p: string): string {
  const m = /^\/([a-z])\/(.*)$/.exec(p);
  return m ? `${m[1]}:/${m[2]}` : p;
}

function isUnderRoot(pathToken: string, root: string): boolean {
  const p = gitBashToDrive(norm(pathToken));
  const r = norm(root);
  return p === r || p.startsWith(`${r}/`);
}

// POSIX device files — not real filesystem locations (writing discards the
// data, reading yields EOF or the current stream), so they can neither leak
// project data nor reach anywhere outside the target. Exempt from the
// outside-root check so ordinary redirects like `pnpm test 2>/dev/null` work.
const SAFE_DEVICE_PATH = /^\/dev\/(?:null|stdin|stdout|stderr|tty)$/i;

// Home-directory references — where credentials live; never legitimate in-flight.
const HOME_REF =
  /(?:^|[\s"'`;|&<>(=])~(?:[\\/]|$|[\s"'`;|&<>)])|\$\{?HOME\}?|%USERPROFILE%|%APPDATA%|%HOMEPATH%/;

// A bare `cd` (no argument) changes to HOME — outside any target by definition.
// A newline is a command separator too (the Bash tool can send a multi-line
// script as one string), so it must count as a boundary alongside && / || / ;.
const BARE_CD = /(?:^|&&|\|\||;|[\r\n])\s*cd\s*(?:$|&&|\|\||;|[\r\n])/;

// A `Signed-off-by:` trailer typed into a commit message. `git commit -s`
// writes this line itself from the configured identity, so its presence in
// the command text means the message is asserting an authorship address of
// its own choosing — see commitSignoffDenial for why that is refused.
const HAND_TYPED_SIGNOFF = /Signed-off-by\s*:/i;

// Boundary characters that can precede a path token in shell text, and the
// characters that end one. Built as plain strings (backtick included) to stay
// readable; doubled backslashes survive the string → RegExp round-trip.
const BOUNDARY = '(?:^|[\\s"\'`;|&<>(=])';
const TOKEN_BODY = '[^\\s"\'`;|&<>)]*';
const DRIVE_PATH_RE = new RegExp(`${BOUNDARY}([A-Za-z]:[\\\\/]${TOKEN_BODY})`, 'g');
const SLASH_PATH_RE = new RegExp(`${BOUNDARY}(\\/[A-Za-z0-9_.~-]${TOKEN_BODY})`, 'g');
// UNC paths (\\host\share, //host/share) are absolute too — on native Windows
// \\localhost\c$\... reaches the ENTIRE local filesystem without ever using a
// drive-letter or single-slash form, so leaving them unextracted was a guard
// bypass. The host segment must be followed by another separator (\\host\...,
// //host/...) so a bare `//` comment marker or quoted escape text like '\n'
// never false-positives as a path; a URL's `//` sits after `:` (not a
// boundary), so it never matches either. Built as plain strings like BOUNDARY
// above — doubled backslashes survive the string → RegExp round-trip.
const UNC_HOST = '[^\\s"\'`;|&<>)\\\\/]+';
const UNC_PATH_RE = new RegExp(`${BOUNDARY}((?:\\\\\\\\|//)${UNC_HOST}[\\\\/]${TOKEN_BODY})`, 'g');

// Flags whose argument is a TEXT PATTERN (regex/glob) that grep/rg/find/sed
// filter with — the shell never opens that string as a path, so a
// slash-shaped pattern there (e.g. grep -v "/dist/") is not a filesystem
// escape, unlike the same string passed to `cat`, `cd`, or `git -C`.
const PATTERN_ONLY_FLAGS = new Set(['-v', '-e', '--include', '--exclude', '--exclude-dir']);

// …but ONLY for commands whose flags actually mean "pattern". `-v` on cat
// means show-nonprinting and its next argument IS a file path — an unscoped
// exemption would let `cat -v "/outside/secret"` slip the guard entirely.
const PATTERN_COMMANDS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'sed', 'awk', 'find']);

// sed/awk take their SCRIPT as the first POSITIONAL argument far more often
// than the `-e`/flag form above — a leading `/regex/` address (e.g.
// `/^<<<<<<</,/^>>>>>>>/d`, standard idiom for stripping merge-conflict
// markers, web-mtjqs32x-m7yq1o) is completely ordinary sed syntax and is
// textually indistinguishable from a path only because it starts with `/`.
// Unlike grep's positional argument (denied by design just above — a bare
// quoted string there is a real search target, not a self-evidently-a-script
// syntax) or find's positional argument (a real directory to search), sed and
// awk have no legitimate use for a bare leading quoted argument OTHER than
// the script, so the first one is always exempt.
const SCRIPT_FIRST_ARG_COMMANDS = new Set(['sed', 'awk']);
// Only simple flags (`-i`, `-i.bak`, `-n`, `--posix`, …) may sit between the
// command word and the script — any bare word or an earlier quote there
// means this quoted argument is NOT the first positional one, so it must
// still be checked as a real path (a file argument, not the script).
const FLAGS_ONLY_RE = /^(?:\s+-{1,2}[A-Za-z][\w.-]*)*\s*$/;

/**
 * True when the quoted string at `index` is the first positional argument to
 * a `sed`/`awk` invocation — i.e. its script, not a file path. Mirrors
 * {@link precededByPatternOnlyFlag}'s command-word extraction.
 */
function isSedAwkScriptArgument(command: string, index: number): boolean {
  const before = command.slice(0, index);
  const segment = before.split(/\||&&|;/).pop() ?? '';
  const word = /^\s*(?:\S+=\S+\s+)*([^\s"'`]+)/.exec(segment)?.[1] ?? '';
  const bin = word.split(/[\\/]/).pop() ?? '';
  if (!SCRIPT_FIRST_ARG_COMMANDS.has(bin.toLowerCase())) return false;
  const afterCommandWord = segment.slice(segment.lastIndexOf(word) + word.length);
  return FLAGS_ONLY_RE.test(afterCommandWord);
}

/**
 * True when the quoted string at `index` is the argument of a pattern-only
 * flag AND the pipeline segment it sits in is run by a known pattern command
 * (grep/rg/sed/…). Both conditions must hold — command-agnostic flag matching
 * is a guard bypass (`cat -v "/etc/passwd"` must stay denied).
 */
function precededByPatternOnlyFlag(command: string, index: number): boolean {
  const before = command.slice(0, index).trimEnd();
  // Stryker disable next-line StringLiteral: only reachable when `before` has
  // no trailing char the regex's `[^\s"'`]` class accepts (empty, or ending
  // in a quote/backtick) — the fallback value only feeds `PATTERN_ONLY_FLAGS.
  // has(token)` below, and neither '' nor any placeholder text is ever a
  // member, so the literal fallback text is unobservable. Provably
  // equivalent, not killable.
  const token = (/([^\s"'`]+)$/.exec(before)?.[1] ?? '').replace(/=$/, '');
  if (!PATTERN_ONLY_FLAGS.has(token)) return false;
  // The command word of the CURRENT pipeline segment (after the last |, &&, ||, ;).
  // Stryker disable next-line StringLiteral: `.split()` always returns an
  // array of length >= 1 (splitting a string that contains none of the
  // delimiters just yields the whole string as its one element), so
  // `.pop()` can never return undefined here — the fallback is dead code.
  // Provably equivalent, not killable.
  const segment = before.split(/\||&&|;/).pop() ?? '';
  // Stryker disable next-line OptionalChaining,StringLiteral: reaching this
  // line already required `token` to be an exact PATTERN_ONLY_FLAGS member
  // (line above), which means the trailing run of `before` that produced it
  // contains no `|`/`&`/`;` (those chars would have been swept into `token`
  // too, since its char class doesn't exclude them, and no flag name
  // contains one) — so `segment` (computed by splitting on those same
  // delimiters) always starts at-or-after that run, and this regex always
  // finds it: `.exec()` can never return null here, so both the optional
  // chaining and its fallback text are unobservable. Provably equivalent,
  // not killable.
  const word = /^\s*(?:\S+=\S+\s+)*([^\s"'`]+)/.exec(segment)?.[1] ?? '';
  // Stryker disable next-line StringLiteral: same reasoning as `segment`
  // above — `.split()` always yields >= 1 element, so `.pop()` never
  // returns undefined. Provably equivalent, not killable.
  const bin = word.split(/[\\/]/).pop() ?? '';
  return PATTERN_COMMANDS.has(bin.toLowerCase());
}

/** Extract candidate absolute-path tokens (quoted first, then bare). */
function extractAbsolutePaths(command: string): string[] {
  const found: string[] = [];

  // 1) Quoted segments — a quoted path may contain spaces; take it whole,
  // unless it's the argument to a pattern-only flag (see above).
  let rest = command;
  for (const m of command.matchAll(/"[^"]+"|'[^']+'/g)) {
    const q = m[0];
    rest = rest.replace(q, ' ');
    if (precededByPatternOnlyFlag(command, m.index ?? 0)) continue;
    if (isSedAwkScriptArgument(command, m.index ?? 0)) continue;
    const inner = q.slice(1, -1);
    // Third alternative: a quoted backslash-UNC path ("\\host\share\..." —
    // host segment then another separator, same shape UNC_PATH_RE requires,
    // so quoted escape text like "\\n" stays inert). The //host form already
    // enters through the /^\// test above.
    if (/^[A-Za-z]:[\\/]/.test(inner) || /^\//.test(inner) || /^\\\\[^\\/\s"']+[\\/]/.test(inner)) {
      found.push(inner);
    }
  }

  // 2) Bare drive-letter absolute paths in the unquoted remainder.
  // Stryker disable next-line StringLiteral: DRIVE_PATH_RE's capture group is
  // not optional — every match has a group 1 — so `m[1]` is never undefined
  // and the `?? ''` fallback text is unobservable. Provably equivalent, not
  // killable.
  for (const m of rest.matchAll(DRIVE_PATH_RE)) found.push(m[1] ?? '');

  // 3) Bare leading-slash paths (/etc/x, /c/Users) in the remainder.
  // Stryker disable next-line StringLiteral: same reasoning as DRIVE_PATH_RE
  // above — SLASH_PATH_RE's capture group is mandatory too, so `m[1]` is
  // never undefined here either. Provably equivalent, not killable.
  for (const m of rest.matchAll(SLASH_PATH_RE)) found.push(m[1] ?? '');

  // 4) Bare UNC paths (//host/share, \\host\share) in the remainder — see
  // UNC_PATH_RE above; norm() folds both spellings to //host/..., which can
  // never sit under a drive-letter root and is prefix-compared against a
  // UNC target root like any other path.
  // Stryker disable next-line StringLiteral: same mandatory-capture-group
  // reasoning as DRIVE_PATH_RE/SLASH_PATH_RE above — `m[1]` is never
  // undefined. Provably equivalent, not killable.
  for (const m of rest.matchAll(UNC_PATH_RE)) found.push(m[1] ?? '');

  // Stryker disable next-line MethodExpression,ConditionalExpression,EqualityOperator:
  // every push site above is a mandatory (non-optional) regex capture group
  // or a quoted-slice of length >= 1 — `m[1]` on a matched DRIVE_PATH_RE/
  // SLASH_PATH_RE result and `q.slice(1, -1)` on a `[^"]+`/`[^']+` match are
  // never empty — so this filter never actually removes anything from
  // `found`; it exists only as defense against the (also unreachable) `?? ''`
  // fallbacks above. Provably equivalent, not killable.
  return found.filter((p) => p.length > 0);
}

// Destructive git operations the SOUL "additive git only" rule forbids
// (prompt.ts: "NEVER force-push, reset --hard, rebase, or touch the main
// branch") — enforced HERE too, at the hook layer, instead of trusting the
// model to obey the prompt. Flags are matched with a preceding/following
// boundary so `-f` doesn't false-positive inside an unrelated token, and the
// short-flag patterns tolerate combined forms (`-fd`, `-Dr`). These are only
// ever tested against `rest` (checkDestructiveGit's `[, sub, rest = ''] = m`),
// which is either empty or — because `rest` is exactly whatever followed the
// greedily-matched `\S+` subcommand token — always STARTS with the whitespace
// that separated it from `sub`. A leading `^` alternative here can therefore
// never be the one that fires: plain `\s` covers every reachable case.
// The short-flag alternative is a bundled cluster (`-[A-Za-z]*f[A-Za-z]*`,
// same shape as DELETE_BRANCH_RE's bundling below) rather than a bare `-f`:
// git's own option parser accepts `-f` bundled with any other single-letter
// push flags (`git push -fd`, `-uf`, …), and a bare-`-f`-only pattern let
// exactly that bundled form sail through unmatched — the same bypass class
// DELETE_BRANCH_RE was already hardened against for `branch -D`.
const FORCE_PUSH_RE = /\s(?:--force|--force-with-lease(?:=\S+)?|-[A-Za-z]*f[A-Za-z]*)(?=\s|$)/;
// `git push` has a SECOND, flag-less spelling of force-push: prefixing the
// refspec itself with `+` (`git push origin +main`, `git push origin
// +feature:feature`) means "allow non-fast-forward" for that ref, identical
// in effect to --force. Only FORCE_PUSH_RE was ever tested against a `push`
// subcommand, so this sailed straight through — the same bypass shape
// PUSH_REFSPEC_DELETE_RE closed for the `:branch` empty-refspec delete form.
// The `+` must be the first character of its token (preceded by whitespace)
// so it can only be the refspec-prefix form, never a `+` occurring elsewhere
// mid-token.
const PUSH_FORCE_REFSPEC_RE = /\s\+\S/;
// `git push` deletes a remote branch two ways: the explicit `-d`/`--delete`
// flag, or the empty-refspec form `git push <remote> :<branch>` (an empty
// source ref before the colon means "push nothing", i.e. delete the
// destination). Only FORCE_PUSH_RE was ever tested against a `push`
// subcommand, so `git push origin --delete main` sailed straight through —
// the exact "delete a branch, touch main" outcome ADDITIVE_GIT_ONLY forbids,
// reachable via `push` instead of the already-guarded `branch -D`. The
// refspec form requires the colon to be the FIRST character of its token
// (preceded by whitespace, not by a source ref name) so an ordinary
// `HEAD:refs/heads/main` push — colon preceded by "D", not whitespace —
// stays unmatched. The short-flag alternative bundles the same way
// FORCE_PUSH_RE's does, for the same reason (`-fd`/`-df` bypassed a
// bare-`-d` pattern too).
const PUSH_DELETE_RE = /\s(?:--delete|-[A-Za-z]*d[A-Za-z]*)(?=\s|$)/;
const PUSH_REFSPEC_DELETE_RE = /\s:\S/;
const HARD_RESET_RE = /\s--hard(?=\s|$)/;
// The `D[A-Za-z]*` branch alone matches `-D`/`-Da`/`-aD`; the other two
// alternatives close a real bypass: `git branch -fd`/`-df` is git's own
// bundled short-flag form of `--force --delete`, equivalent to `-D`, but
// neither letter alone (case-sensitively) is a `D` — without the extra
// alternatives a bundled lowercase force+delete pair sailed through unmatched.
const DELETE_BRANCH_RE =
  /\s-[A-Za-z]*(?:D[A-Za-z]*|f[A-Za-z]*d[A-Za-z]*|d[A-Za-z]*f[A-Za-z]*)(?=\s|$)/;
const BRANCH_DELETE_LONG_RE = /\s(?:-d|--delete)(?=\s|$)/;
const BRANCH_FORCE_RE = /\s(?:-f|--force)(?=\s|$)/;
const FORCE_CLEAN_RE = /\s(?:-[A-Za-z]*f[A-Za-z]*|--force)(?=\s|$)/;
const MAIN_TARGET_RE = /\smain(?=\s|$)/;

const ADDITIVE_GIT_ONLY =
  'additive git only — never force-push, reset --hard, rebase, delete a branch, touch main, or rewrite history';

// Git accepts global options BEFORE the subcommand (`git -C <path> reset
// --hard`, `git -c k=v push -f`, `git --no-pager log`, …). Naive "first token
// after git" subcommand extraction is fooled by these — `sub` would capture
// `-C` itself and none of the destructive checks below would ever fire, a
// total bypass of this guard while staying inside the target repo. Stripped
// here so the real subcommand is always what gets matched.
const GIT_GLOBAL_OPT_WITH_ARG_RE =
  /^\s*(?:-C|-c|--git-dir|--work-tree|--namespace|--super-prefix|--exec-path|--config-env)(?:=\S*|\s+\S+)/;
// The lookahead's `$` alternative only matters when the bare option is the
// very LAST thing in the string — but that means nothing follows it, so
// there is no subcommand left to mis-detect whether or not it gets stripped
// here (the outer `sub` capture in checkDestructiveGit falls through to
// "not destructive" either way). `\s` alone covers every reachable case.
const GIT_GLOBAL_OPT_BARE_RE = /^\s*(?:--[A-Za-z][\w-]*(?:=\S*)?|-[A-Za-z])(?=\s)/;

/** Strip any leading git global options, leaving `<subcommand><rest>`. */
function stripGitGlobalOptions(afterGit: string): string {
  let s = afterGit;
  for (;;) {
    const withArg = GIT_GLOBAL_OPT_WITH_ARG_RE.exec(s);
    if (withArg) {
      s = s.slice(withArg[0].length);
      continue;
    }
    const bare = GIT_GLOBAL_OPT_BARE_RE.exec(s);
    if (bare) {
      s = s.slice(bare[0].length);
      continue;
    }
    return s;
  }
}

/**
 * Decide whether a git invocation is one of the destructive operations the
 * SOUL forbids. Matched per pipeline segment (split on && / || / | / ; / newline)
 * so a flag on one command can't leak onto an unrelated earlier one.
 */
function checkDestructiveGit(command: string): ContainmentVerdict {
  for (const segment of command.split(/&&|\|+|;|\r?\n/)) {
    // No trailing `$` here on purpose: `([\s\S]*)` already greedily consumes
    // to the true end of `segment` with nothing after it in the pattern to
    // backtrack for, so a `$` anchor can never change what gets captured —
    // it would be a permanently-unkillable mutant, so it is simply not
    // written. The leading `^` stays: it IS load-bearing (it is what stops
    // e.g. "echo git reset --hard" from having "git reset --hard" detected
    // starting mid-string). Same reasoning rules out `\s+` (one-or-more) in
    // favor of plain `\s` (exactly one) after "git": any whitespace beyond
    // the first just rides along inside the capture, and every consumer of
    // it (stripGitGlobalOptions's own `^\s*` branches, and the `^\s*(\S+)`
    // extraction below) strips leading whitespace again before use — so a
    // `+` here could never change `sub`/`rest`, another permanently-
    // unkillable mutant simply not written.
    const gitMatch = /^\s*git\s([\s\S]*)/.exec(segment);
    if (!gitMatch) continue;
    // Stryker disable next-line Regex,StringLiteral: unlike gitMatch above,
    // BOTH anchors on this regex are redundant. Leading `^`: `\s*` already
    // skips any leading whitespace from position 0, and `(\S+)` then matches
    // the first non-whitespace run wherever it is — an unanchored search can
    // never find an earlier or different leftmost match than that, because
    // there IS no earlier possible start. Trailing `$`: same reasoning as
    // gitMatch's regex above, `([\s\S]*)` already consumes to the true end.
    // And `gitMatch[1]` is a mandatory (always-matching) capture group from
    // gitMatch above, never undefined, so the `?? ''` fallback is
    // unreachable too. Provably equivalent, not killable.
    const m = /^\s*(\S+)([\s\S]*)/.exec(stripGitGlobalOptions(gitMatch[1] ?? ''));
    if (!m) continue;
    // Stryker disable next-line StringLiteral: `m[2]` — destructured here as
    // `rest` — is `([\s\S]*)`, a mandatory capture group from the regex
    // above (always matches, possibly as an empty string) and so never
    // undefined; the `= ''` default is unreachable. Provably equivalent, not
    // killable.
    const [, sub, rest = ''] = m;
    if (sub === 'push' && (FORCE_PUSH_RE.test(rest) || PUSH_FORCE_REFSPEC_RE.test(rest))) {
      return { allowed: false, reason: `\`git push --force\` is ${ADDITIVE_GIT_ONLY}` };
    }
    if (sub === 'push' && (PUSH_DELETE_RE.test(rest) || PUSH_REFSPEC_DELETE_RE.test(rest))) {
      return { allowed: false, reason: `\`git push --delete\` is ${ADDITIVE_GIT_ONLY}` };
    }
    if (sub === 'reset' && HARD_RESET_RE.test(rest)) {
      return { allowed: false, reason: `\`git reset --hard\` is ${ADDITIVE_GIT_ONLY}` };
    }
    if (sub === 'rebase') {
      return { allowed: false, reason: `\`git rebase\` is ${ADDITIVE_GIT_ONLY}` };
    }
    if (
      sub === 'branch' &&
      (DELETE_BRANCH_RE.test(rest) ||
        (BRANCH_DELETE_LONG_RE.test(rest) && BRANCH_FORCE_RE.test(rest)))
    ) {
      return { allowed: false, reason: `\`git branch -D\` is ${ADDITIVE_GIT_ONLY}` };
    }
    if ((sub === 'checkout' || sub === 'switch') && MAIN_TARGET_RE.test(rest)) {
      return { allowed: false, reason: `\`git ${sub} main\` is ${ADDITIVE_GIT_ONLY}` };
    }
    if (sub === 'clean' && FORCE_CLEAN_RE.test(rest)) {
      return { allowed: false, reason: `\`git clean -f\` is ${ADDITIVE_GIT_ONLY}` };
    }
    if (sub === 'filter-branch') {
      return { allowed: false, reason: `\`git filter-branch\` is ${ADDITIVE_GIT_ONLY}` };
    }
  }
  return { allowed: true, reason: null };
}

/**
 * True when a Bash command contains a real `git commit` invocation, in any
 * pipeline segment — global options before the subcommand are stripped
 * first, same as {@link checkDestructiveGit}, so `git -C . commit` is still
 * recognized. `--dry-run` never actually creates a commit, so it's exempt —
 * scanning staged files for a commit that was never going to happen would
 * only produce false warnings.
 */
export function isGitCommitCommand(command: string): boolean {
  for (const segment of command.split(/&&|\|+|;|\r?\n/)) {
    const gitMatch = /^\s*git\s([\s\S]*)/.exec(segment);
    if (!gitMatch) continue;
    const m = /^\s*(\S+)([\s\S]*)/.exec(stripGitGlobalOptions(gitMatch[1] ?? ''));
    if (!m) continue;
    const [, sub, rest = ''] = m;
    if (sub === 'commit' && !/\s--dry-run(?=\s|$)/.test(rest)) return true;
  }
  return false;
}

/**
 * The reason a `git commit` must be refused for hand-writing its own
 * `Signed-off-by:` trailer, or null when there is nothing to refuse.
 *
 * `git commit -s` derives the trailer from the repo's configured identity. A
 * trailer typed into the message body instead carries whatever address the
 * message happened to name — and an agent composing that line from context
 * has no reliable way to know which of the identities it can see is the one
 * git would have used. Observed in the wild across a single flight: of five
 * `git commit` invocations, four hand-wrote the trailer, three of those named
 * the right address and one named a maintainer's personal email, which then
 * had to be scrubbed out of the branch before anything could be pushed. The
 * failure is silent (the commit-msg hook checks Conventional Commits, not
 * trailer provenance) and non-deterministic, so it survives spot-checking.
 *
 * Denying the tool call is the fix rather than a prompt instruction: the
 * agent receives this reason as the tool result and can simply re-run with
 * `-s`, and no prompt revision — hence no gated `FIRING_PROMPT_VERSION`
 * bump (`docs/MODEL-CARD.md` §2) — is needed to make it hold.
 *
 * Scans the WHOLE command rather than only the `git commit` segment on
 * purpose: the observed failures all used a heredoc message
 * (`git commit -m "$(cat <<'EOF' … EOF)"`), whose trailer line is separated
 * from the `git commit` token by the very newlines
 * {@link isGitCommitCommand} splits on — a per-segment scan would miss
 * exactly the shape that leaks. The cost is a false deny on a compound that
 * both commits and greps for the literal in one call; the reason text says
 * to split those, which is cheap next to letting a wrong address through.
 *
 * Returns the reason string rather than a {@link ContainmentVerdict} so the
 * caller has no unreachable `?? 'blocked'` fallback to suppress.
 */
export function commitSignoffDenial(command: string): string | null {
  if (!isGitCommitCommand(command)) return null;
  if (!HAND_TYPED_SIGNOFF.test(command)) return null;
  return (
    'the commit message hand-writes a `Signed-off-by:` trailer. Git derives that trailer from ' +
    'the repository identity when you pass `-s`; a hand-typed one carries whatever address the ' +
    'message names, which has published a personal email into DCO trailers before. Remove the ' +
    'line from the message and run `git commit -s` instead. If you were only reading a trailer ' +
    'rather than writing one, run that in a separate call.'
  );
}

// PRE-COMMIT SIBLING SCAN (SLICE-RELAY DUP 2/3, docs/EVALUATION-2026-08-20-sota.md
// lever 4; DUP 1/3 was auto-declaring an intent claim the instant a board pick
// succeeds). The FLEET digest a firing's prompt carries is built ONCE, at prompt
// build time — a long-running firing can outlive it, so by the time the agent
// actually runs `git commit` a sibling may since have declared (or landed) a
// claim on the very file about to be committed, invisible to the prompt that
// started the firing. This re-reads sibling state at the moment of the commit
// itself, via the SAME PreToolUse deny mechanism as the containment checks
// above: a denial here IS "inject a warning turn" — Claude Code hands the
// agent the deny reason as that tool call's result, and the firing gets a
// chance to reshape before ever recording the collision in history (the
// existing post-ship verify in fly.ts, readSiblingIntentClaims/
// detectIntentCollisions, stays as the backstop for whatever slips past this).
// ---------------------------------------------------------------------------

/** A sibling's standing intent claim, resolved to a comparable primary-file path. */
export interface SiblingPrimaryClaim {
  readonly branch: string;
  readonly primaryFile: string;
}

/**
 * Decide whether the files about to be committed land on a sibling's
 * standing primary-file claim. Pure — takes already-gathered staged files
 * and claims, same split as every other check in this file: the actual git/
 * filesystem read (a fresh `git worktree list` plus each sibling's
 * `.autopilot-intent`) lives in adapters/sibling-commit-scan.ts, called only
 * from the guard-hook shim.
 */
export function checkPreCommitSiblingOverlap(
  stagedFiles: readonly string[],
  siblingClaims: readonly SiblingPrimaryClaim[],
): ContainmentVerdict {
  const staged = new Set(stagedFiles.map(norm));
  for (const claim of siblingClaims) {
    if (staged.has(norm(claim.primaryFile))) {
      return {
        allowed: false,
        reason:
          `PRE-COMMIT SIBLING SCAN: ${claim.primaryFile} is claimed right now by sibling ` +
          `${claim.branch} — a fresh re-check at commit time (not just this firing's starting ` +
          'prompt) found the overlap. Do not commit this file — reshape the unit to avoid it, or ' +
          'pick different work.',
      };
    }
  }
  return { allowed: true, reason: null };
}

// SUICIDE GUARD, BACKSTOP layer (web-msp5g6nf-owl9jp; root-caused: a firing ran
// the dashboard's own stop command live and killed the host process that was
// running it, taking the flight down too). The PRIMARY defense now lives IN
// the tool: `DashboardControl.stop()`/`restart()` (apps/dashboard/src/control/
// control.ts) refuse outright when AUTOPILOT_FLIGHT=1, which every flight's
// process tree carries — no invocation shape can slip past a check made by
// the thing that actually performs the action. This regex match on the raw
// Bash command TEXT stays as a last-resort layer: it fires before the CLI
// process even spawns (cheaper) and it's the only layer that covers a bare
// `kill`/`taskkill`/`pkill`/`killall`/`Stop-Process` of an arbitrary pid or
// name, which the env-var check can't — but text patterns are guessable and
// bypassable, so treat this as defense-in-depth, not the guarantee. Matched
// per pipeline segment like the destructive-git checks above.
const DASHBOARD_STOP_RESTART_RE =
  /dashboard[:/](?:stop|restart)\b|control[\\/]cli(?:\.[jt]s)?["']?\s+(?:stop|restart)\b|\b(?:stop|restart)-dashboard\.(?:cmd|sh)\b|\bautopilot-dashboard["']?\s+(?:stop|restart)\b/i;
// A leading `sudo` (optionally with its own flags, e.g. `-n`/`-u root`) was a
// total bypass of the START anchor below: `sudo kill 1234` never matched
// because the first word at position 0 was "sudo", not one of the kill
// words. `(?:-\S+\s+)*` absorbs any number of sudo's own flags (each
// followed by whitespace) between `sudo` and the real command, mirroring the
// same "handle the general shape, not just the one bypass sample" approach
// stripGitGlobalOptions takes for git's global options above.
const PROCESS_KILL_RE =
  /^\s*(?:sudo\s+(?:-\S+\s+)*)?(?:taskkill|killall|pkill|kill|stop-process)(?=[\s"'`;|&<>)]|$)/i;

const SUICIDE_GUARD =
  'SUICIDE GUARD: a prior flight killed its own dashboard host this way — this action is never legitimate from a flight';

// A quoted argument (a commit message, a grep pattern, …) is inert text, not
// something the shell executes — matching the patterns above against it would
// flag e.g. `git commit -m "explains pnpm dashboard:stop"` as if it actually
// invoked the CLI. Stripped before testing, same spirit as the absolute-path
// extraction above.
function stripQuoted(segment: string): string {
  return segment.replace(/"[^"]*"|'[^']*'/g, ' ');
}

// GIT HELP BROWSER ESCAPE (board web-mtbozqli-y0wn2i, observed 2026-08-27): a
// `git ... --help`/`-h`/`git help ...` invocation is textually harmless — it
// touches no files — but on the Windows git-for-windows install these flights
// run under, git's `help.format` default opens the local HTML docs in the
// OPERATOR'S OWN default browser, not a pager in the flight's own terminal. A
// lane ran `git revert --help` and popped a browser window on the operator's
// desktop mid-flight: a real escape of the flight's headless boundary, even
// though no file or git state was touched. An unattended flight has no
// legitimate reason to open a GUI window outside its own process tree.
// Matched per pipeline segment like the destructive-git checks above; quoted
// text (e.g. a commit message that happens to mention "--help") is stripped
// first so it can never be mistaken for a live flag.
const GIT_HELP_FLAG_RE = /(?:^|\s)(?:--help|-h)(?=\s|$)/;
const GIT_HELP_OPENS_BROWSER =
  "opens the local HTML docs in the operator's own default browser on Windows (git's `help.format` default) — a flight must never pop a GUI window on the operator's desktop";

function checkGitHelpEscape(command: string): ContainmentVerdict {
  for (const segment of command.split(/&&|\|+|;|\r?\n/)) {
    const unquoted = stripQuoted(segment);
    const gitMatch = /^\s*git\s([\s\S]*)/.exec(unquoted);
    if (!gitMatch) continue;
    const afterGit = gitMatch[1] ?? '';
    const sub = /^\s*(\S+)/.exec(stripGitGlobalOptions(afterGit))?.[1] ?? '';
    if (sub === 'help' || GIT_HELP_FLAG_RE.test(afterGit)) {
      return { allowed: false, reason: `\`git help\` ${GIT_HELP_OPENS_BROWSER}` };
    }
  }
  return { allowed: true, reason: null };
}

function checkProcessControl(command: string): ContainmentVerdict {
  // Split on a bare LF too (`\r?\n`), matching checkDestructiveGit: on
  // macOS/Linux/WSL2 a multi-line command uses plain `\n`, and PROCESS_KILL_RE
  // is `^`-anchored — without splitting the LF, a later-line `kill`/`pkill`
  // sits mid-string, never matches, and the SUICIDE GUARD is bypassed.
  for (const segment of command.split(/&&|\|+|;|\r?\n/)) {
    const unquoted = stripQuoted(segment);
    if (PROCESS_KILL_RE.test(unquoted)) {
      return {
        allowed: false,
        reason: `process-kill commands (kill/taskkill/pkill/killall/Stop-Process) are denied — ${SUICIDE_GUARD}`,
      };
    }
    if (DASHBOARD_STOP_RESTART_RE.test(unquoted)) {
      return {
        allowed: false,
        reason: `stopping or restarting the dashboard from a flight is denied — ${SUICIDE_GUARD}`,
      };
    }
  }
  return { allowed: true, reason: null };
}

/**
 * Decide whether one Bash command stays inside the target repo. Pure text
 * analysis — no filesystem access — so it is deterministic and fast enough to
 * run on every command.
 */
export function checkCommandContainment(command: string, targetRoot: string): ContainmentVerdict {
  const gitVerdict = checkDestructiveGit(command);
  if (!gitVerdict.allowed) return gitVerdict;
  const gitHelpVerdict = checkGitHelpEscape(command);
  if (!gitHelpVerdict.allowed) return gitHelpVerdict;
  const processVerdict = checkProcessControl(command);
  if (!processVerdict.allowed) return processVerdict;
  if (HOME_REF.test(command)) {
    return {
      allowed: false,
      reason: 'the command references the home directory (credentials live there)',
    };
  }
  if (BARE_CD.test(command)) {
    return { allowed: false, reason: 'a bare `cd` changes to HOME, outside the target' };
  }
  for (const token of extractAbsolutePaths(command)) {
    if (SAFE_DEVICE_PATH.test(token)) continue;
    if (!isUnderRoot(token, targetRoot)) {
      return {
        allowed: false,
        reason: `absolute path outside the target repo: ${token} (target: ${targetRoot})`,
      };
    }
  }
  return { allowed: true, reason: null };
}

// ---------------------------------------------------------------------------
// READ HYGIENE (SOTA-MAP B7): generated, vendored, and build-output paths are
// context poison — one Read of a bundled artifact burns tens of thousands of
// cache-read tokens for zero signal (measured: cacheRead is ~55% of firing
// cost). Deterministic tier-1 denial, with a reason that redirects the agent
// to the source it actually needs.
// ---------------------------------------------------------------------------

const WASTE_SEGMENT = /(?:^|\/)(dist|coverage|node_modules|\.git)(?:\/|$)/;

/** True when a path (or glob pattern) clearly targets generated/vendored output. */
function isWastedReadTarget(p: string): boolean {
  return WASTE_SEGMENT.test(norm(gitBashToDrive(p)));
}

/**
 * Decide whether one Read/Grep/Glob call targets generated or vendored output.
 * Checks the explicit path fields and the Glob pattern — pure text, fail-open
 * on anything ambiguous (the goal is saving context, not blocking work).
 */
export function checkReadHygiene(
  toolInput: { readonly file_path?: unknown; readonly path?: unknown; readonly pattern?: unknown },
  isGlob: boolean,
): ContainmentVerdict {
  // Stryker disable next-line ArrayDeclaration: Stryker's seeded placeholder
  // ("Stryker was here") never matches WASTE_SEGMENT (no dist/coverage/
  // node_modules/.git segment), so appending it changes the loop's iteration
  // count but never its output — every possible input still evaluates to the
  // same allowed/denied verdict. Provably equivalent, not killable.
  const candidates: string[] = [];
  if (typeof toolInput.file_path === 'string') candidates.push(toolInput.file_path);
  if (typeof toolInput.path === 'string') candidates.push(toolInput.path);
  // A Glob PATTERN names paths ("dist/**", "**/node_modules/**"); a Grep
  // pattern is content regex — never a path — so only Glob patterns count.
  if (isGlob && typeof toolInput.pattern === 'string') candidates.push(toolInput.pattern);
  for (const c of candidates) {
    if (isWastedReadTarget(c)) {
      return {
        allowed: false,
        reason: `generated/vendored path (${c}) — read the SOURCE instead; build output, coverage, node_modules and .git carry no signal worth their tokens`,
      };
    }
  }
  return { allowed: true, reason: null };
}

// ---------------------------------------------------------------------------
// WEBFETCH SSRF GUARD (THREAT-MODEL.md T6): WebFetch reaches the open
// internet — including this machine's own loopback interface, where the
// dashboard's own API listens (T8: "any local process reaching localhost at
// the dashboard port has the same access an operator does") and, on a cloud
// VM, the instance-metadata endpoint (169.254.169.254) that leaks
// provisioning credentials. Two layers judge the same well-known SSRF target
// shapes: `checkWebFetchTarget` below is pure URL-literal analysis, same
// honest scope as the rest of this file (zero I/O); `checkWebFetchDnsRebinding`
// further down actually resolves the hostname, closing the case where a
// hostname NAMES no private address but resolves to one. Neither closes a
// true TOCTOU DNS-rebinding attack (a second, independent lookup performed
// by Claude Code's own WebFetch fetch, moments after this guard's check,
// returning a different address) — this guard cannot pin the resolved IP for
// that downstream request, since it isn't the one making it. The detection
// audit remains the backstop for that residual class, same as the Bash guard
// above.
// ---------------------------------------------------------------------------

const LOOPBACK_HOST_RE = /^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])$/i;
const PRIVATE_IPV4_RE =
  /^(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2})$/;
const PRIVATE_IPV6_RE = /^\[(?:f[cd][0-9a-f]{2}:|fe80:)/i;

/**
 * Whether a hostname (or a DNS-resolved address, bracketed if IPv6) is
 * loopback, an RFC 1918 private range, or link-local — shared by the
 * URL-literal check below and `checkWebFetchDnsRebinding`'s resolved-address
 * check, so both judge the exact same address space.
 */
function isLoopbackOrPrivateHost(host: string): boolean {
  return LOOPBACK_HOST_RE.test(host) || PRIVATE_IPV4_RE.test(host) || PRIVATE_IPV6_RE.test(host);
}

/**
 * Decide whether a WebFetch URL targets a loopback, private, or link-local
 * address. Fails open on an unparsable URL — the fetch itself will reject a
 * malformed target; this guard's job is judging real targets, not validating
 * syntax.
 */
export function checkWebFetchTarget(url: string): ContainmentVerdict {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: true, reason: null };
  }
  if (isLoopbackOrPrivateHost(parsed.hostname)) {
    return {
      allowed: false,
      reason:
        `WebFetch target ${url} is a loopback/private-network address — never a legitimate ` +
        "flight target (the dashboard's own API and the local network are outside the flight's remit)",
    };
  }
  return { allowed: true, reason: null };
}

/** One DNS-resolved address for a WebFetch hostname — `family` mirrors `dns.promises.lookup`'s own result shape so guard-hook.ts can pass the real resolver in directly, no adapter needed. */
export interface ResolvedAddress {
  readonly address: string;
  readonly family: number;
}

/** Resolves a hostname to its real addresses — injected so this stays unit-testable without a real DNS dependency; guard-hook.ts is the only real caller, wiring `dns.promises.lookup`. */
export type DnsResolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;

/**
 * Narrows the DNS-rebinding gap `checkWebFetchTarget` leaves open on purpose
 * (THREAT-MODEL.md T6): a hostname that resolves to a loopback/private/
 * link-local address names no such address itself, so it sails past the
 * literal check above. Judging that needs real I/O, so — unlike the rest of
 * this file — this check is async and lives behind an injected resolver;
 * `guard-hook.ts` is the only real caller, using the real `dns.promises.lookup`
 * at the moment of the tool call. Honest scope: this closes the "hostname
 * simply resolves to a private address" case, not a true TOCTOU rebinding
 * attack — a target with a zero-TTL DNS record could still answer with a
 * public address here and a private one moments later when Claude Code's own
 * WebFetch implementation performs its OWN, independent lookup to actually
 * fetch; this guard has no way to pin that downstream request to the address
 * it resolved. Fails open on an unparsable URL or a DNS resolution error
 * (NXDOMAIN, timeout): neither is evidence the target is local, and the
 * detection audit remains the backstop for whatever this can't observe.
 */
export async function checkWebFetchDnsRebinding(
  url: string,
  resolveAddresses: DnsResolver,
): Promise<ContainmentVerdict> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: true, reason: null };
  }
  let addresses: readonly ResolvedAddress[];
  try {
    addresses = await resolveAddresses(parsed.hostname);
  } catch {
    return { allowed: true, reason: null };
  }
  const bad = addresses.find(({ address, family }) =>
    isLoopbackOrPrivateHost(family === 6 ? `[${address}]` : address),
  );
  if (bad === undefined) return { allowed: true, reason: null };
  return {
    allowed: false,
    reason:
      `WebFetch target ${url} resolves to ${bad.address}, a loopback/private-network address — ` +
      'DNS rebinding to a local/internal target is never a legitimate flight fetch',
  };
}

interface HookInput {
  readonly tool_name?: unknown;
  readonly tool_input?: {
    readonly command?: unknown;
    readonly file_path?: unknown;
    readonly path?: unknown;
    readonly pattern?: unknown;
    readonly notebook_path?: unknown;
    readonly url?: unknown;
  };
}

/** The official PreToolUse deny JSON, given a human-readable reason — shared
 *  by every check in this file plus the pre-commit sibling scan below, which
 *  runs OUTSIDE evaluateHookInput (it needs a fresh git read, not just the
 *  raw payload text) but must print the identical decision shape. */
export function buildDenyDecision(reason: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
}

/**
 * Pull the Bash command string out of a raw PreToolUse payload, or null for
 * any non-Bash tool call or malformed JSON. Exposed so the pre-commit
 * sibling scan (guard-hook.ts) — which only needs to recognize a `git
 * commit` invocation — doesn't duplicate evaluateHookInput's own parsing.
 */
export function extractBashCommand(raw: string): string | null {
  let input: HookInput;
  try {
    input = JSON.parse(raw) as HookInput;
  } catch {
    return null;
  }
  if (input.tool_name !== 'Bash') return null;
  const command = input.tool_input?.command;
  return typeof command === 'string' ? command : null;
}

/**
 * Pull the WebFetch URL out of a raw PreToolUse payload, or null for any
 * non-WebFetch tool call, malformed JSON, or a missing/non-string `url`.
 * Exposed so `guard-hook.ts` can run the DNS-rebinding check (which needs
 * real I/O, so it can't live inside the pure `evaluateHookInput`) without
 * re-deriving this same parsing.
 */
export function extractWebFetchUrl(raw: string): string | null {
  let input: HookInput;
  try {
    input = JSON.parse(raw) as HookInput;
  } catch {
    return null;
  }
  if (input.tool_name !== 'WebFetch') return null;
  const url = input.tool_input?.url;
  return typeof url === 'string' ? url : null;
}

/**
 * Evaluate one PreToolUse hook payload (the JSON Claude Code pipes to stdin).
 * Returns the official deny JSON to print, or null for "no decision" (normal
 * permission flow continues). Malformed input fails OPEN — a wedged parser must
 * not brick every command; the detection audit remains the backstop.
 */
export function evaluateHookInput(raw: string, targetRoot: string): string | null {
  let input: HookInput;
  try {
    input = JSON.parse(raw) as HookInput;
  } catch {
    return null;
  }
  const deny = buildDenyDecision;

  // Read/Grep/Glob/Write/Edit/NotebookEdit: containment first (these tools
  // were never path-guarded — only Bash was — so `Read /etc/passwd` or
  // `Edit /etc/passwd` sailed past the Bash guard), then read hygiene (B7) on
  // generated/vendored output for the read-only trio (Write/Edit/NotebookEdit
  // have no analogous waste concern). NotebookEdit is disallowed by default
  // (config.ts DEFAULT_DISALLOWED_TOOLS) — this is defense-in-depth against
  // config drift, closing the same class of hole for its `notebook_path`
  // field before it can ever be relied on.
  if (
    input.tool_name === 'Read' ||
    input.tool_name === 'Grep' ||
    input.tool_name === 'Glob' ||
    input.tool_name === 'Write' ||
    input.tool_name === 'Edit' ||
    input.tool_name === 'NotebookEdit'
  ) {
    const ti = input.tool_input ?? {};
    for (const field of [ti.file_path, ti.path, ti.notebook_path]) {
      if (typeof field !== 'string') continue;
      // A file-tool path field is a literal filesystem path (no shell-escape
      // ambiguity), so a bare leading \\ IS a UNC path — no host-then-
      // separator shape check needed here, unlike the Bash-text extraction.
      const looksAbsolute =
        /^[A-Za-z]:[\\/]/.test(field) || /^\//.test(field) || /^\\\\/.test(field);
      if (!looksAbsolute || SAFE_DEVICE_PATH.test(field)) continue;
      if (!isUnderRoot(field, targetRoot)) {
        return deny(
          `CONTAINMENT: this flight is confined to ${targetRoot} — ${input.tool_name} of a path ` +
            `outside the target repo: ${field}. Work only inside the target repository.`,
        );
      }
    }
    if (input.tool_name === 'Read' || input.tool_name === 'Grep' || input.tool_name === 'Glob') {
      const verdict = checkReadHygiene(ti, input.tool_name === 'Glob');
      if (verdict.allowed) return null;
      return deny(
        // Stryker disable next-line StringLiteral: checkReadHygiene's only
        // `allowed: false` return site always sets an explicit non-null
        // `reason` string — having just failed the `verdict.allowed` check
        // above, `verdict.reason` can never be null here, so the
        // `?? 'blocked'` fallback is unreachable. Provably equivalent, not
        // killable.
        `READ HYGIENE: ${verdict.reason ?? 'blocked'}. Consult the repo source or official docs.`,
      );
    }
    return null;
  }

  if (input.tool_name === 'WebFetch') {
    const url = input.tool_input?.url;
    if (typeof url !== 'string') return null;
    const verdict = checkWebFetchTarget(url);
    if (verdict.allowed) return null;
    return deny(
      // Stryker disable next-line StringLiteral: checkWebFetchTarget's only
      // `allowed: false` return site always sets an explicit non-null
      // `reason` string — having just failed the `verdict.allowed` check
      // above, `verdict.reason` can never be null here, so the
      // `?? 'blocked'` fallback is unreachable. Provably equivalent, not
      // killable.
      `SSRF GUARD: ${verdict.reason ?? 'blocked'}.`,
    );
  }

  if (input.tool_name !== 'Bash') return null;
  const command = input.tool_input?.command;
  if (typeof command !== 'string') return null;

  // Trailer provenance before containment: a hand-typed `Signed-off-by:` is
  // not a containment breach, so it needs its own prefix and its own reason
  // rather than being folded into the CONTAINMENT message below.
  const signoffReason = commitSignoffDenial(command);
  if (signoffReason !== null) return deny(`DCO TRAILER: ${signoffReason}`);

  const verdict = checkCommandContainment(command, targetRoot);
  if (verdict.allowed) return null;

  return deny(
    // Stryker disable next-line StringLiteral: every `allowed: false` return
    // site inside checkCommandContainment (via checkDestructiveGit,
    // checkProcessControl, or its own HOME_REF/BARE_CD/absolute-path checks)
    // sets an explicit non-null `reason` string — having just failed the
    // `verdict.allowed` check above, `verdict.reason` can never be null
    // here, so the `?? 'blocked'` fallback is unreachable. Provably
    // equivalent, not killable.
    `CONTAINMENT: this flight is confined to ${targetRoot} — ${verdict.reason ?? 'blocked'}. ` +
      'Work only inside the target repository.',
  );
}

/** The generated `--settings` payload shape (the documented hooks schema). */
export interface FlightSettings {
  readonly hooks: {
    readonly PreToolUse: readonly {
      readonly matcher: string;
      readonly hooks: readonly {
        readonly type: 'command';
        readonly command: string;
        readonly timeout: number;
      }[];
    }[];
  };
}

const GUARD_TIMEOUT_S = 20;

/**
 * Build the settings object a flight passes via `--settings`: PreToolUse hooks
 * that run the guard script with the target root — Bash goes through the
 * containment + destructive-git checks, Read/Grep/Glob/Write/Edit/NotebookEdit
 * through path containment (Read/Grep/Glob additionally through the B7
 * read-hygiene check), WebFetch through the SSRF target guard. Command-line-
 * scoped, so it layers on top of (never edits) the user's own settings files.
 */
export function buildFlightSettings(targetRoot: string, guardScriptPath: string): FlightSettings {
  const guardCommand = {
    type: 'command' as const,
    command: `node "${guardScriptPath.replace(/\\/g, '/')}" "${targetRoot.replace(/\\/g, '/')}"`,
    timeout: GUARD_TIMEOUT_S,
  };
  return {
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: [guardCommand] },
        { matcher: 'Read|Grep|Glob|Write|Edit|NotebookEdit', hooks: [guardCommand] },
        { matcher: 'WebFetch', hooks: [guardCommand] },
      ],
    },
  };
}
