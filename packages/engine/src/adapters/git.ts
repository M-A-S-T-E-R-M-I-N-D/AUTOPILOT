// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VcsPort, CommitRef } from '../ports.js';
import type { HeadReader } from '../containment.js';

// Field separator git emits via `%x1f` in the OUTPUT. We must not put a NUL byte
// in an argv entry (Node's execFile rejects it), so we ask git to emit 0x1F.
const SEP = String.fromCharCode(0x1f);
// Record separator between commits in `recentCommits`'s `--name-only` log —
// distinct from SEP so a record boundary is never confused with a field boundary.
const RECORD_SEP = String.fromCharCode(0x02);

/** A recent commit's identity plus the file paths it touched. */
export interface CommitWithFiles extends CommitRef {
  readonly files: readonly string[];
}

/** File-level impact of a diff (e.g. a flight's pre- vs post-HEAD) — the data a LANDING card's "impact preview" needs. */
export interface DiffStat {
  readonly filesChanged: number;
  readonly insertions: number;
  readonly deletions: number;
}

/** A contiguous span of lines (1-indexed, inclusive) a diff hunk touches — see
 *  {@link GitVcs.changedLineRanges}. A pure insertion is recorded as the
 *  boundary span it touches, `{start: N, end: N + 1}` for "inserted after old
 *  line N" — so `start` is 0 for a top-of-file insertion. */
export interface LineRange {
  readonly start: number;
  readonly end: number;
}

/** Outcome of {@link GitVcs.land} — whether the checked-out branch was merged onto `base` and advanced to it. */
export interface LandResult {
  readonly ok: boolean;
  readonly details: string;
}

/** A git tag's name and creation time (epoch ms) — see {@link GitVcs.lastTag}. */
export interface TagRef {
  readonly name: string;
  readonly at: number;
}

/** Outcome of {@link GitVcs.tag} — whether an annotated tag was created at HEAD. */
export interface CreateTagResult {
  readonly ok: boolean;
  readonly details: string;
}

/** Parses `git diff --shortstat` output; any absent category (e.g. a pure rename) reads as 0. */
function parseShortstat(line: string): DiffStat {
  const files = /(\d+) files? changed/.exec(line);
  const insertions = /(\d+) insertions?\(\+\)/.exec(line);
  const deletions = /(\d+) deletions?\(-\)/.exec(line);
  return {
    filesChanged: files ? Number(files[1]) : 0,
    insertions: insertions ? Number(insertions[1]) : 0,
    deletions: deletions ? Number(deletions[1]) : 0,
  };
}

const OLD_FILE_HEADER = /^--- a\/(.+)$/;
const NEW_FILE_HEADER = /^\+\+\+ b\/(.+)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/;

/** Appends `range` to `file`'s entry in `out`, creating it on first use. */
function pushRange(out: Map<string, LineRange[]>, file: string, range: LineRange): void {
  const ranges = out.get(file) ?? [];
  ranges.push(range);
  out.set(file, ranges);
}

/**
 * Parses a `--unified=0` unified diff into per-file OLD-side line ranges —
 * the "-a,b" span of each hunk header, which is the coordinate system shared
 * by every branch diffed against the same base tip. File identity prefers
 * the `+++ b/…` (post-image) path, falling back to `--- a/…` for a deleted
 * file (whose `+++` line is `/dev/null`) — a pure addition needs no fallback
 * since its own `+++ b/…` line names the new path.
 * A hunk with an explicit `,0` old-side count is a pure insertion — recorded
 * as the old-side boundary span it touches, not dropped (see below).
 *
 * A renamed-and-edited file (only reachable when the caller's git has rename
 * detection on, e.g. `diff.renames` configured true — this repo's own `git
 * diff` call passes no `-M`) gets its hunk ranges recorded under BOTH the old
 * and new path: the same "don't collapse to just the new path" hazard
 * `parseCommitLogWithRenames` (below) already closes for `commitsAhead`,
 * left open here previously — a sibling that renamed a file it also edited
 * silently lost hunk-level narrowing precision (`narrowToHunkOverlap`,
 * `landing.ts`, degraded to its conservative "unmeasurable → keep as
 * warning" fallback instead). Every `--- ` line (not just `--- a/…`) resets
 * `oldPath`, including to `null` for `--- /dev/null` — otherwise a brand-new
 * file immediately following a modified/deleted one in the same diff would
 * inherit that file's stale old path and be mistaken for a rename of it.
 */
function parseHunkRanges(stdout: string): ReadonlyMap<string, readonly LineRange[]> {
  const out = new Map<string, LineRange[]>();
  let oldPath: string | null = null;
  let currentFile: string | null = null;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('--- ')) {
      const oldMatch = OLD_FILE_HEADER.exec(line);
      oldPath = oldMatch ? (oldMatch[1] ?? null) : null;
      continue;
    }
    const newMatch = NEW_FILE_HEADER.exec(line);
    if (newMatch) {
      currentFile = newMatch[1] ?? null;
      continue;
    }
    if (line.startsWith('+++ ')) {
      // "+++ /dev/null" (deleted file) — fall back to the old-side path.
      currentFile = oldPath;
      continue;
    }
    if (currentFile === null) continue;
    const hunkMatch = HUNK_HEADER.exec(line);
    if (!hunkMatch) continue;
    const start = Number(hunkMatch[1]);
    const count = hunkMatch[2] === undefined ? 1 : Number(hunkMatch[2]);
    // A `,0` old-side count is a pure insertion "after line N": no base line
    // changes, but its merge-relevant footprint is the boundary between N and
    // N+1 — git refuses to auto-merge two insertions at the same point, or an
    // insertion abutting another branch's edit, so record that boundary span
    // ({N, N+1}; N is 0 for a top-of-file insertion). Dropped entirely
    // before, which let a file where two siblings edited different lines but
    // both appended at the same point measure as non-overlapping.
    const range = count === 0 ? { start, end: start + 1 } : { start, end: start + count - 1 };
    pushRange(out, currentFile, range);
    if (oldPath !== null && oldPath !== currentFile) pushRange(out, oldPath, range);
  }
  return out;
}

/** Run git with an args array (never a shell string — no injection surface). */
function git(
  repo: string,
  args: readonly string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', repo, ...args],
      // Stryker disable next-line BooleanLiteral: windowsHide only affects
      // whether a console window flashes on Windows — invisible to stdout,
      // stderr, or the exit code this wrapper actually observes.
      { maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number'
            ? (err as unknown as { code: number }).code
            : err
              ? 1
              : 0;
        // Stryker disable next-line StringLiteral: Node's execFile callback
        // always passes `stdout`/`stderr` as strings with no `encoding:
        // 'buffer'` override (verified: even an ENOENT spawn failure or a
        // maxBuffer overrun yields '' or partial text, never
        // null/undefined) — this fallback is unreachable defensive typing,
        // not live behavior.
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', exitCode: code });
      },
    );
  });
}

/** Every failure-path git command in this file writes its real reason to
 *  stderr (verified — see `docs/` git wrapper audit, board web-mss2y67i-3lmwzi)
 *  with an EMPTY stdout; a hook can still print to stdout instead, so stderr
 *  is preferred but stdout is the fallback rather than the other way round. */
function gitFailureReason(result: { readonly stdout: string; readonly stderr: string }): string {
  return result.stderr.trim() || result.stdout.trim();
}

/** Runs `run` with `message` written to a throwaway temp file, passing that
 *  file's path through instead of the message text itself — `git tag -F
 *  <file>`/`git notes add -F <file>` read the message from disk instead of
 *  argv, which sidesteps the OS command-line length limit (Windows'
 *  ~32K-char `CreateProcess` ceiling) an unbounded message can otherwise
 *  blow past. `tag`/`notes` below both used a `-m <message>` argv string
 *  until board web-mt65yd1p-muhrxp: `v0.14.0`'s git-notes attestation lists
 *  one line per commit since the last release tag (1902 of them, for that
 *  release) and hit `spawn ENAMETOOLONG` on Windows. The temp dir is removed
 *  once `run` settles either way, so a rejected git call never leaks it. */
async function withMessageFile<T>(message: string, run: (file: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'autopilot-git-msg-'));
  const file = join(dir, 'message.txt');
  writeFileSync(file, message, 'utf8');
  try {
    return await run(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Git VcsPort adapter (MASTER-PLAN §7). `revertLast` is additive — it adds a
 * `git revert` commit rather than rewriting history, so a gate-failed firing is
 * undone without ever `reset --hard`ing or touching prior commits.
 */
export class GitVcs implements VcsPort {
  constructor(private readonly repo: string) {}

  async head(): Promise<string> {
    const { stdout, exitCode } = await git(this.repo, ['rev-parse', 'HEAD']);
    return exitCode === 0 ? stdout.trim() : '';
  }

  async lastCommit(): Promise<CommitRef | null> {
    const { stdout, exitCode } = await git(this.repo, ['log', '-1', '--format=%h%x1f%s']);
    // Stryker disable next-line ConditionalExpression: `git log` writes every
    // failure (no commits yet, non-repo path) to stderr with an EMPTY stdout
    // — skipping this early return still lands on the `!shortSha` guard below
    // with the same empty split result, returning `null` either way.
    if (exitCode !== 0) return null;
    const [shortSha, subject] = stdout.trim().split(SEP);
    // Stryker disable next-line ConditionalExpression: the only way `stdout`
    // is empty here is the exact failure case caught above, and a genuinely
    // successful `%h%x1f%s` log always yields a non-empty short sha — this
    // guard can never independently observe a different outcome than the one
    // above.
    if (!shortSha) return null;
    // Stryker disable next-line StringLiteral: `%h%x1f%s` always emits the
    // 0x1f separator, so `split(SEP)` always yields a defined second element
    // once `shortSha` (checked above) is truthy — `subject` is never undefined.
    return { shortSha, subject: subject ?? '' };
  }

  /**
   * True when `sha` is reachable from `headAfter` but NOT reachable from
   * `headBefore` — one of the NEW commits THIS firing itself produced, not
   * merely any commit ever committed to the repo (GATE HOLE 5, board
   * web-mtb8hgj2-xhang0). A plain `cat-file -e` existence check is true for
   * any of the repo's thousands of historical commits, so a hallucinated or
   * stale self-reported sha from an unrelated commit would pass as
   * "verified" — this narrows the check to the un-fakeable range the
   * firing actually advanced HEAD across. `headBefore === ''` (unborn HEAD
   * before the repo's very first commit) carries no ancestor constraint:
   * reachability from `headAfter` alone is sufficient.
   */
  async commitInFiringRange(sha: string, headBefore: string, headAfter: string): Promise<boolean> {
    if (headAfter === '') return false;
    const after = await git(this.repo, ['merge-base', '--is-ancestor', sha, headAfter]);
    if (after.exitCode !== 0) return false;
    if (headBefore === '') return true;
    const before = await git(this.repo, ['merge-base', '--is-ancestor', sha, headBefore]);
    return before.exitCode !== 0;
  }

  /**
   * Repo-relative paths whose content differs between `fromRef` and `toRef` —
   * the D4 file lens's grouping signal (`FiringRecord.filesTouched` → the
   * exporter's `autopilot.files` span attribute, epic 0015). `-z` keeps
   * non-ASCII paths raw instead of C-quoted (core.quotePath), so the exact
   * on-disk path rides the wire. An unborn-HEAD `''` ref has no tree to diff
   * against, and any git failure degrades to `[]` — the record honestly omits
   * the field rather than fabricating paths.
   */
  async changedFiles(fromRef: string, toRef: string): Promise<readonly string[]> {
    if (fromRef === '' || toRef === '') return [];
    const { stdout, exitCode } = await git(this.repo, [
      'diff',
      '--name-only',
      '-z',
      fromRef,
      toRef,
    ]);
    if (exitCode !== 0) return [];
    return stdout.split('\0').filter((path) => path.length > 0);
  }

  /**
   * True when `path` is committed at HEAD — the EPIC SPEC convention's
   * existence check (`apps/dashboard/src/flight/epic-spec.ts`): a task title
   * can link a spec file, but only a file actually in the tree at HEAD
   * proves it was committed rather than merely promised. Returns false on a
   * non-repo path or a working-tree-only file rather than throwing.
   */
  async fileExists(path: string): Promise<boolean> {
    const { exitCode } = await git(this.repo, ['cat-file', '-e', `HEAD:${path}`]);
    return exitCode === 0;
  }

  /**
   * True when `pattern` (a literal, case-insensitive substring) appears
   * anywhere in the tracked tree at HEAD — the CLOSED-TASK AUDIT ritual's
   * re-verification primitive (`apps/dashboard/src/flight/closed-task-audit.ts`):
   * a DELIVERABLE clause that grepped clean against its shipping commit's
   * patch only proves the claim true AT SHIP TIME, and a later refactor can
   * delete or rename away the very thing it pointed at with nothing catching
   * the drift. `--fixed-strings` avoids treating the pattern as a regex (the
   * caller always passes plain alphanumeric keywords, but there's no reason
   * to trust that at this layer). Degrades to false on a non-repo path or a
   * genuine no-match, same as `fileExists`.
   */
  async containsText(pattern: string): Promise<boolean> {
    const { exitCode } = await git(this.repo, [
      'grep',
      '--quiet',
      '--ignore-case',
      '--fixed-strings',
      '-e',
      pattern,
      'HEAD',
    ]);
    return exitCode === 0;
  }

  /**
   * Committed paths (relative to the repo root) whose content matches
   * `pattern` at HEAD, same literal/case-insensitive semantics as
   * {@link containsText} — the CLOSED-TASK AUDIT ritual's UX-EXPRESSION
   * re-check needs to know WHERE a keyword still lives, not just whether it
   * lives anywhere: a stray mention surviving in a backend comment after the
   * actual UI panel was ripped out would otherwise pass `containsText`
   * undetected. Each `git grep --name-only` line is `<ref>:<path>`; the
   * fixed `HEAD:` prefix is stripped rather than split generically since a
   * path can itself legally contain a colon. Degrades to `[]` on a
   * non-repo path or a genuine no-match, same as `containsText` degrades to
   * `false`.
   */
  async filesContainingText(pattern: string): Promise<readonly string[]> {
    const { stdout, exitCode } = await git(this.repo, [
      'grep',
      '--ignore-case',
      '--fixed-strings',
      '--name-only',
      '-e',
      pattern,
      'HEAD',
    ]);
    // Stryker disable next-line ConditionalExpression: a non-repo path or a
    // genuine no-match writes to stderr with an EMPTY stdout, and the
    // filter/map pipeline below already reduces an empty stdout to `[]` on
    // its own — skipping this early return reaches the identical result.
    if (exitCode !== 0) return [];
    // No `.trim()`: `--name-only` output is always LF-separated bare paths
    // with no leading/trailing whitespace (verified — same property already
    // established for parseCommitLog below) — only the filter is needed, to
    // drop the trailing empty segment `split('\n')` always yields after the
    // last real line.
    return stdout
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => line.slice('HEAD:'.length));
  }

  async revertLast(sinceRef?: string): Promise<void> {
    // GATE HOLE 3 (board web-mtb8hghd-72z52z): a firing's own commit(s) can
    // be more than one — reverting only `HEAD` would leave earlier commits
    // from the same firing in place. `sinceRef..HEAD` reverts the WHOLE
    // range (one revert commit per original commit, newest first) when the
    // caller supplies the firing's `headBefore`; omitted, it reverts only
    // the tip (RemediatingGate undoing just its own autoformat commit).
    // Falsy — not just undefined. `head()` returns '' for an unborn HEAD (see
    // its own contract above), and firing.ts threads that value straight in as
    // `headBefore`. `'' !== undefined` built the literal range `..HEAD`, which
    // git reads as HEAD..HEAD — "error: empty commit set passed", exit 128 —
    // so the throw escaped runFiring uncaught: the bad commit stayed AND the
    // flight died. With no anchor there is nothing to bound the range by, so
    // revert the tip, which is what this did before the range was introduced.
    const target = sinceRef ? `${sinceRef}..HEAD` : 'HEAD';
    let result = await git(this.repo, ['revert', '--no-edit', target]);
    // REVERT RANGE VS MERGE COMMITS (board web-mtbeu5h9-o3mlll, follow-up to
    // d7f19648): a merge commit anywhere in the range makes plain `revert`
    // refuse — git won't guess which parent is "mainline". `revert` also
    // applies newest-first, so it can have already committed reverts for
    // commits after the merge before choking on it; `--abort` rewinds to the
    // pre-attempt HEAD so the retry below starts clean, not stacked on a
    // half-reverted range.
    if (result.exitCode !== 0 && /is a merge but no -m option was given/.test(result.stderr)) {
      await git(this.repo, ['revert', '--abort']);
      if (sinceRef) {
        // A plain range walks the FULL graph (both merge parents), so a
        // merge's own side-branch commits appear as SEPARATE entries
        // alongside the merge itself — reverting both double-applies the
        // same inverse diff and stalls with "nothing to commit" partway
        // through. The range's FIRST-PARENT chain instead treats each merge
        // as one atomic commit whose `-m 1` inverse already covers
        // everything its side branch introduced, so nothing is reverted
        // twice.
        const chain = await git(this.repo, ['rev-list', '--first-parent', target]);
        const shas = chain.stdout.split('\n').filter((line) => line.length > 0);
        result = await git(this.repo, ['revert', '--no-edit', '-m', '1', ...shas]);
      } else {
        // No range to walk — HEAD itself is the merge, so reverting it alone
        // with an explicit mainline is unambiguous.
        result = await git(this.repo, ['revert', '--no-edit', '-m', '1', target]);
      }
    }
    if (result.exitCode !== 0) {
      // Best-effort cleanup: any failed revert — the dirty-tree case, or a
      // `-m 1` retry that stalls for its own reason — can leave the sequence
      // mid-flight (partial commits + a pending conflict). Abort before
      // throwing so the NEXT firing inherits a clean tree instead of a stuck
      // "revert in progress" state. Safe even when nothing is in progress:
      // git errors harmlessly and the result here is discarded.
      await git(this.repo, ['revert', '--abort']);
      throw new Error(`git revert failed (exit ${result.exitCode}): ${gitFailureReason(result)}`);
    }
  }

  /**
   * Whether the repo already has any git remote configured — the GITHUB SYNC
   * feature's (`github-sync.ts`'s `planGithubSync`) "create vs re-sync"
   * decision input: no remote plans `gh repo create --source --push`, an
   * existing one plans a plain `git push`. Returns false on a non-repo path
   * or a repo with zero remotes rather than throwing.
   */
  async hasRemote(): Promise<boolean> {
    const { stdout, exitCode } = await git(this.repo, ['remote']);
    return exitCode === 0 && stdout.trim().length > 0;
  }

  async isDirty(): Promise<boolean> {
    const { stdout, exitCode } = await git(this.repo, ['status', '--porcelain']);
    // Stryker disable next-line ConditionalExpression, MethodExpression:
    // `git status --porcelain` writes every failure (non-repo path) to
    // stderr with an EMPTY stdout, so `stdout.trim().length > 0` (or the
    // untrimmed equivalent) already evaluates to `false` in every reachable
    // failure case; on success, `--porcelain` output is either genuinely
    // empty (clean tree) or real non-whitespace entries (dirty tree) — never
    // whitespace-only — so trimming never changes whether length is 0.
    return exitCode === 0 && stdout.trim().length > 0;
  }

  /**
   * Stage and commit ONLY the given paths — the scoped-ritual primitive
   * (RITUAL SWEEP fix): a post-flight ritual must never sweep unrelated
   * working-tree state into its own commit the way the whole-tree
   * checkpoint staging would. Returns false (no commit) when the paths hold
   * no changes — a clean ritual is a no-op, not an error; other failures
   * (hook rejection) throw like commitAll.
   */
  async commitPaths(paths: readonly string[], message: string): Promise<boolean> {
    await git(this.repo, ['add', '--', ...paths]);
    // Scope the emptiness probe to the paths, not the whole index: unrelated
    // work a supervising agent (or the operator) pre-staged before the ritual
    // fired leaves the index non-empty, and a whole-index probe would fall
    // through to `git commit -- <paths>` — which finds nothing under the
    // pathspec and throws. Scoped, the clean ritual stays a no-op (RITUAL SWEEP).
    const staged = await git(this.repo, ['diff', '--cached', '--quiet', '--', ...paths]);
    if (staged.exitCode === 0) return false; // nothing staged under these paths
    const { exitCode, stdout, stderr } = await git(this.repo, [
      'commit',
      '--signoff',
      '-m',
      message,
      '--',
      ...paths,
    ]);
    if (exitCode !== 0) {
      throw new Error(
        `git commit (scoped) failed (exit ${exitCode}): ${gitFailureReason({ stdout, stderr })}`,
      );
    }
    return true;
  }

  async commitAll(message: string): Promise<void> {
    await git(this.repo, ['add', '-A']);
    // --signoff: this repo's commit-msg hook enforces a `Signed-off-by:`
    // trailer (commitlint.config.js) on every commit, engine-authored ones
    // included — without it the commit is rejected by the hook and the
    // caller's try/catch (see firing.ts) silently swallows the WIP.
    const { exitCode, stdout, stderr } = await git(this.repo, [
      'commit',
      '--signoff',
      '-m',
      message,
    ]);
    if (exitCode !== 0) {
      throw new Error(
        `git commit (checkpoint) failed (exit ${exitCode}): ${gitFailureReason({ stdout, stderr })}`,
      );
    }
  }

  /** Files changed/insertions/deletions between two refs — degrades to all-zero on an invalid range rather than throwing. */
  async diffstat(fromRef: string, toRef: string): Promise<DiffStat> {
    const { stdout, exitCode } = await git(this.repo, ['diff', '--shortstat', fromRef, toRef]);
    // Stryker disable next-line ConditionalExpression: an invalid ref writes
    // "fatal: ambiguous argument" to stderr with an EMPTY stdout, and
    // `parseShortstat('')` already yields all-zero — skipping this early
    // return reaches the identical result via the fallback regexes below.
    if (exitCode !== 0) return { filesChanged: 0, insertions: 0, deletions: 0 };
    return parseShortstat(stdout);
  }

  /**
   * Per-file line ranges `ref` changed relative to `base`'s CURRENT tree — a
   * plain two-tree diff (`git diff base ref`), not a merge-base-anchored
   * `base...ref`, since every sibling flight branch is compared against the
   * SAME base tip and needs ranges in that one shared coordinate system to
   * be comparable against each other (the landing-time hunk overlap
   * detector's data source, narrowing `commitsAhead`'s file-level warning
   * down to files whose actual changed lines intersect). `--unified=0` keeps
   * each hunk's range tight to only the changed lines, not the context git
   * would otherwise pad it with. Degrades to an empty map on an invalid
   * ref/non-repo path rather than throwing.
   */
  async changedLineRanges(
    base: string,
    ref: string,
  ): Promise<ReadonlyMap<string, readonly LineRange[]>> {
    const { stdout, exitCode } = await git(this.repo, [
      'diff',
      '--unified=0',
      '--no-color',
      base,
      ref,
    ]);
    if (exitCode !== 0) return new Map();
    return parseHunkRanges(stdout);
  }

  /**
   * The last `count` commits (newest first), each with the file paths it
   * touched — feeds the board/git reconciliation proposal (BACKLOG-999 "Board
   * hygiene"): interactive-session work has no METRICS line, so it needs a
   * title↔subject fuzzy match against real commit history instead, with the
   * changed file paths as a fallback signal for a commit whose subject is
   * generic (e.g. a WIP checkpoint — see `reconcile.ts`'s `filePathMatchesTitle`).
   * Degrades to `[]` on an invalid repo rather than throwing.
   */
  async recentCommits(count: number): Promise<readonly CommitWithFiles[]> {
    const { stdout, exitCode } = await git(this.repo, [
      'log',
      `-${count}`,
      `--format=${RECORD_SEP}%h%x1f%s`,
      '--name-only',
    ]);
    // Stryker disable next-line ConditionalExpression: an invalid revision
    // (e.g. no commits yet) writes to stderr with an EMPTY stdout, and
    // `parseCommitLog('')` already yields `[]` — skipping this early return
    // reaches the identical `[]` via the parser's own leading-segment filter.
    if (exitCode !== 0) return [];
    return parseCommitLog(stdout);
  }

  /**
   * Commits reachable from `ref` (default `HEAD`) but not from `base` (newest
   * first), each with the file paths it touched — the "unmerged commits" list
   * a LANDING card needs to preview what a flight branch would bring into
   * `base` before the operator confirms the merge. The optional `ref` widens
   * this past "my own checked-out branch": passing a SIBLING branch name
   * reads that branch's own unlanded commits without checking it out —
   * refs are shared across a repo's linked worktrees, so no worktree path is
   * needed (the landing-time same-file overlap detector's data source,
   * RESEARCH-LIBRARY fleet anti-duplication, defense-stack item 3). Degrades
   * to `[]` when `base` or `ref` doesn't exist (not yet fetched, typo'd) or
   * `ref` is already even with `base`, rather than throwing — an
   * unmergeable-looking preview is just an empty list, not an error.
   *
   * Uses `--name-status` (not `--name-only`, unlike {@link recentCommits}):
   * git's default rename detection collapses a renamed file down to only its
   * NEW path under `--name-only`, which would make the overlap detector
   * blind to a sibling that independently edited the file under its FORMER
   * path — a real same-file collision with an empty set intersection.
   * `parseCommitLogWithRenames` lists BOTH paths for a rename/copy so that
   * intersection still catches it.
   */
  async commitsAhead(base: string, ref = 'HEAD'): Promise<readonly CommitWithFiles[]> {
    const { stdout, exitCode } = await git(this.repo, [
      'log',
      `${base}..${ref}`,
      `--format=${RECORD_SEP}%h%x1f%s`,
      '--name-status',
    ]);
    // Stryker disable next-line ConditionalExpression: a `base` that doesn't
    // exist writes to stderr with an EMPTY stdout, and
    // `parseCommitLogWithRenames('')` already yields `[]` — skipping this
    // early return reaches the identical `[]` via the parser's own
    // leading-segment filter.
    if (exitCode !== 0) return [];
    return parseCommitLogWithRenames(stdout);
  }

  /**
   * The branch HEAD currently points at (e.g. `autopilot/flight`) — the
   * LANDING card's "what am I about to merge" label. Returns `'HEAD'` for a
   * detached HEAD (git's own `--abbrev-ref` behavior) and `''` on a non-repo
   * path rather than throwing.
   */
  async currentBranch(): Promise<string> {
    const { stdout, exitCode } = await git(this.repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
    return exitCode === 0 ? stdout.trim() : '';
  }

  /**
   * Full patch (commit message + diff) for a single ref — the DELIVERABLE
   * verifier's cheap grep target (BACKLOG web-msnqeei0-71zb5a): a
   * `"completion":"complete"` claim on a task whose title carries a
   * DELIVERABLE clause is checked against this text instead of trusted on
   * the agent's word alone. Returns '' on an invalid ref/non-repo path
   * rather than throwing — an unreadable patch just fails the grep, same as
   * a patch that genuinely doesn't mention the clause.
   */
  async showPatch(ref: string): Promise<string> {
    const { stdout, exitCode } = await git(this.repo, ['show', ref]);
    // Stryker disable next-line ConditionalExpression: unlike `rev-parse`,
    // `git show` never echoes its argument back to stdout on failure
    // (verified for both an invalid sha and an unborn-HEAD repo) — stdout is
    // always '' whenever exitCode isn't 0, so this ternary can't be observed
    // to pick the wrong branch.
    return exitCode === 0 ? stdout : '';
  }

  /**
   * Full content of a file as committed at HEAD — the executable-DELIVERABLE
   * predicate evaluator's read target (flight/deliverable-predicates.ts): a
   * measurable claim like "under 300 lines" is counted against the tree the
   * firing actually shipped, not the agent's word. Returns '' for a missing
   * path or non-repo, mirroring showPatch — an unreadable file simply fails
   * the measurement.
   */
  async showFile(path: string): Promise<string> {
    const { stdout, exitCode } = await git(this.repo, ['show', `HEAD:${path}`]);
    // Stryker disable next-line ConditionalExpression: same shape as
    // showPatch above — `git show` writes every failure to stderr with an
    // EMPTY stdout, so the ternary can't be observed picking a wrong branch.
    return exitCode === 0 ? stdout : '';
  }

  /**
   * Tracked files matching any of the given pathspecs (a star-slash-name
   * pattern resolves a bare basename to its committed location) — the
   * predicate evaluator's resolver. `--` guards against a pattern lexing as an option;
   * `-z` NUL-separation survives any filename. Returns [] on a non-repo path
   * or when nothing matches — both are "no committed file", not errors.
   */
  async lsFiles(patterns: readonly string[]): Promise<readonly string[]> {
    const { stdout, exitCode } = await git(this.repo, ['ls-files', '-z', '--', ...patterns]);
    // Stryker disable next-line ConditionalExpression: `git ls-files` writes
    // every failure (non-repo path, bad pathspec) to stderr with an EMPTY
    // stdout, and ''.split('\0') is [''] which the length filter below
    // already discards — skipping this early return reaches the same [].
    if (exitCode !== 0) return [];
    return stdout.split('\0').filter((f) => f.length > 0);
  }

  /**
   * The most recently CREATED tag (by creation date, not name) — the CURRENT
   * ROUND view's boundary (web-msntc6cx-yios2n's "since last release tag"),
   * a non-destructive alternative to wiping firing history for a fresh-looking
   * count. `creatordate` covers annotated and lightweight tags identically
   * (git falls back to the commit date for a lightweight tag automatically).
   * Returns null when the repo has no tags yet or isn't a repo at all —
   * "no round boundary defined" is a normal state, not an error.
   */
  async lastTag(): Promise<TagRef | null> {
    const { stdout, exitCode } = await git(this.repo, [
      'for-each-ref',
      '--sort=-creatordate',
      '--count=1',
      '--format=%(refname:short)\t%(creatordate:unix)',
      'refs/tags',
    ]);
    // Stryker disable next-line ConditionalExpression: a non-repo path writes
    // to stderr with an EMPTY stdout, and the `!line` guard below already
    // returns `null` for that same empty stdout — this guard can't
    // independently observe a different outcome.
    if (exitCode !== 0) return null;
    // Stryker disable next-line MethodExpression: `Number()` already trims
    // surrounding whitespace per the spec (verified: `Number('123\n') ===
    // 123`), and `name` (the field before the tab) never has trailing
    // whitespace to strip — this `.trim()` changes nothing `!line`,
    // `line.split('\t')`, or `Number(atSeconds)` below can observe.
    const line = stdout.trim();
    // Stryker disable next-line ConditionalExpression: the only way `line` is
    // empty is the same no-tags/non-repo case the `exitCode !== 0` guard
    // above already returns `null` for when it fires — and when it's
    // deliberately bypassed to test THIS mutant, an empty `line` still routes
    // to `null` via the `!name` guard below (`''.split('\t')` yields a falsy
    // `name`), so this guard is a redundant backstop either way.
    if (!line) return null;
    const [name, atSeconds] = line.split('\t');
    const at = Number(atSeconds);
    // Stryker disable next-line ConditionalExpression, LogicalOperator:
    // `for-each-ref`'s fixed `%(refname:short)\t%(creatordate:unix)` format
    // guarantees a non-empty name and a numeric creatordate for any tag it
    // lists at all — the only way either half could fail is the empty-stdout
    // case the `!line` guard above already returns `null` for.
    if (!name || !Number.isFinite(at)) return null;
    return { name, at: at * 1000 };
  }

  /**
   * The branch a flight branch would merge into — the LANDING card's "what
   * would this ship on top of" anchor for `commitsAhead`/`diffstat`. Checked
   * as local refs in preference order ('main' then 'master', the two
   * conventional defaults), not `init.defaultBranch` (an ambient/global
   * setting, unset in CI and irrelevant to which branches actually exist in
   * THIS repo). Returns '' when neither exists (e.g. a repo with only the
   * flight branch) rather than throwing.
   */
  async defaultBranch(): Promise<string> {
    for (const candidate of ['main', 'master']) {
      const { exitCode } = await git(this.repo, [
        'rev-parse',
        '--verify',
        '--quiet',
        `refs/heads/${candidate}`,
      ]);
      if (exitCode === 0) return candidate;
    }
    return '';
  }

  /**
   * Lands the checked-out branch onto `base` (BACKLOG web-msnqeegt-ki7dm0,
   * "Landing EXECUTE v3"): checks `base` out, merges the branch in with
   * `--no-ff --signoff` (this repo's own merge convention — see `chore: land
   * ...` in git history — and required by the commit-msg hook's
   * `Signed-off-by:` rule), then force-moves the branch onto the new `base`
   * tip and checks it back out, so the next flight continues from the landed
   * history. Additive: never `reset --hard`s; a merge conflict is
   * `--abort`ed and the tree is returned to the branch untouched. Refuses
   * (`ok: false`, touches nothing) up front when the tree is dirty or there
   * is no branch distinct from `base` checked out — callers are expected to
   * gate this behind a green verification gate (see `executeLanding`).
   */
  async land(base: string, message?: string): Promise<LandResult> {
    const branch = await this.currentBranch();
    if (!branch || branch === base) {
      return {
        ok: false,
        details: `nothing to land: no branch distinct from '${base}' is checked out (got '${branch || '(detached)'}')`,
      };
    }
    if (await this.isDirty()) {
      return { ok: false, details: 'nothing to land: the working tree is dirty' };
    }

    const checkout = await git(this.repo, ['checkout', base]);
    if (checkout.exitCode !== 0) {
      return {
        ok: false,
        details: `checkout of '${base}' failed (exit ${checkout.exitCode}): ${gitFailureReason(checkout)}`,
      };
    }

    const merge = await git(this.repo, [
      'merge',
      '--no-ff',
      '--signoff',
      '-m',
      message ?? `chore: land ${branch} into ${base}`,
      branch,
    ]);
    if (merge.exitCode !== 0) {
      await git(this.repo, ['merge', '--abort']);
      await git(this.repo, ['checkout', branch]);
      return {
        ok: false,
        details: `merge of '${branch}' into '${base}' failed (exit ${merge.exitCode}): ${gitFailureReason(merge)}`,
      };
    }

    const advance = await git(this.repo, ['branch', '-f', branch, base]);
    if (advance.exitCode !== 0) {
      await git(this.repo, ['checkout', branch]);
      return {
        ok: false,
        details: `landed onto '${base}' but failed to fast-forward '${branch}' (exit ${advance.exitCode}): ${gitFailureReason(advance)}`,
      };
    }

    const back = await git(this.repo, ['checkout', branch]);
    if (back.exitCode !== 0) {
      return {
        ok: false,
        details: `landed and advanced '${branch}' but failed to check it back out (exit ${back.exitCode}): ${gitFailureReason(back)}`,
      };
    }

    return { ok: true, details: `landed ${branch} onto ${base}` };
  }

  /**
   * Creates an annotated tag at HEAD (BACKLOG web-msnshavs-z0obmh, "Release
   * automation") — `docs/RELEASING.md`'s "Git tags" table. Name-agnostic:
   * `release.ts`'s `executeRelease` calls this once for the `v<semver>`
   * release tag and, when the caller names a milestone, a second time for
   * the paired `m<N>` tag at the same HEAD (`notes`, just below, covers the
   * attestation leg). Refuses (`ok: false`, touches nothing) when `name`
   * already exists rather than silently overwriting a tag that may anchor a
   * prior release — same fail-loud-on-conflict stance as `land`'s dirty-tree
   * refusal.
   */
  async tag(name: string, message: string): Promise<CreateTagResult> {
    const existing = await git(this.repo, [
      'rev-parse',
      '--verify',
      '--quiet',
      `refs/tags/${name}`,
    ]);
    if (existing.exitCode === 0) {
      return { ok: false, details: `tag '${name}' already exists` };
    }

    const create = await withMessageFile(message, (file) =>
      git(this.repo, ['tag', '-a', name, '-F', file]),
    );
    if (create.exitCode !== 0) {
      return {
        ok: false,
        details: `git tag failed (exit ${create.exitCode}): ${gitFailureReason(create)}`,
      };
    }

    return { ok: true, details: `created annotated tag '${name}' at HEAD` };
  }

  /**
   * Attaches a `git notes add` attestation to `commitish` — `docs/
   * RELEASING.md`'s "Git notes" section, the third leg of the tags / commits
   * / notes version-management triad (BACKLOG web-msnshavs-z0obmh, "Release
   * automation"). Refuses (`ok: false`, touches nothing) when a note already
   * exists at that commit rather than silently overwriting a prior
   * attestation — same fail-loud-on-conflict stance as `tag`.
   */
  async notes(commitish: string, message: string): Promise<CreateTagResult> {
    const existing = await git(this.repo, ['notes', 'show', commitish]);
    if (existing.exitCode === 0) {
      return { ok: false, details: `a note already exists on '${commitish}'` };
    }

    const add = await withMessageFile(message, (file) =>
      git(this.repo, ['notes', 'add', '-F', file, commitish]),
    );
    if (add.exitCode !== 0) {
      return {
        ok: false,
        details: `git notes add failed (exit ${add.exitCode}): ${gitFailureReason(add)}`,
      };
    }

    return { ok: true, details: `attached a note to '${commitish}'` };
  }
}

/**
 * Shared by {@link GitVcs.recentCommits} and {@link GitVcs.commitsAhead} —
 * both emit the same `RECORD_SEP`/`SEP`-delimited `--name-only` log format.
 *
 * No `.trim()` on either the per-record or per-file strings below: the only
 * whitespace `--name-only`'s RECORD_SEP-prefixed format ever produces is a
 * single trailing `\n` (verified — no leading whitespace, no `\r`), and every
 * downstream step already discards it identically whether trimmed first or
 * not (`indexOf('\n')` finds the same header boundary either way; the extra
 * empty string a trailing `\n` adds to `.split('\n')` is filtered out below
 * regardless). And only one guard is needed against the empty leading
 * segment `split(RECORD_SEP)` always yields before any real record (the
 * format string opens with RECORD_SEP) — the final `.filter` here catches it
 * via its empty `shortSha`, so an earlier `record.length > 0` filter would
 * only ever be a redundant backstop.
 *
 * No `headerEnd === -1` special case either: every real record has a
 * trailing `\n` (see above), so `indexOf('\n')` only ever returns -1 for
 * that same empty leading artifact, where `record` is `''` — and `''.slice(0,
 * -1)` and `''.slice(0)` both evaluate to `''` too, the exact same header/
 * files starting point the explicit `[] : record` branches produced.
 */
function parseCommitLog(stdout: string): readonly CommitWithFiles[] {
  return stdout
    .split(RECORD_SEP)
    .map((record) => {
      const headerEnd = record.indexOf('\n');
      const [shortSha, subject] = record.slice(0, headerEnd).split(SEP);
      const files = record
        .slice(headerEnd + 1)
        .split('\n')
        .filter((f) => f.length > 0);
      // Stryker disable next-line StringLiteral: `header.split(SEP)` always
      // has at least the pre-SEP segment as `shortSha`, and once `headerEnd
      // !== -1` (the only way `subject` could be missing at all), the format
      // string guarantees a `%x1f%s` segment exists — both fallbacks are
      // unreachable defensive typing for `string | undefined`.
      return { shortSha: shortSha ?? '', subject: subject ?? '', files };
    })
    .filter((c) => c.shortSha.length > 0);
}

/**
 * Parses `--name-status` log output — used only by {@link GitVcs.commitsAhead}.
 * Same record framing as {@link parseCommitLog} (RECORD_SEP-delimited header,
 * one status line per changed path), but each status line is
 * `<status>\t<path>` for an add/modify/delete, or `<status>\t<old>\t<new>`
 * for a rename/copy (`R`/`C`, each followed by a similarity percentage git
 * strips no differently here) — both paths are pushed for the latter so a
 * rename's OLD path stays visible to a path-based intersection even though
 * git's own rename detection would otherwise report only the new one.
 */
function parseCommitLogWithRenames(stdout: string): readonly CommitWithFiles[] {
  return stdout
    .split(RECORD_SEP)
    .map((record) => {
      const headerEnd = record.indexOf('\n');
      const [shortSha, subject] = record.slice(0, headerEnd).split(SEP);
      const files: string[] = [];
      for (const line of record.slice(headerEnd + 1).split('\n')) {
        if (line.length === 0) continue;
        const [status, first, second] = line.split('\t');
        if (status?.startsWith('R') || status?.startsWith('C')) {
          if (first) files.push(first);
          if (second) files.push(second);
        } else if (first) {
          files.push(first);
        }
      }
      return { shortSha: shortSha ?? '', subject: subject ?? '', files };
    })
    .filter((c) => c.shortSha.length > 0);
}

/**
 * Synchronous HEAD reader for the flight containment audit (a cheap between-firing
 * check). Returns '' when the path is not a git repo or git is unavailable — a
 * non-repo that never changes is simply never a breach.
 */
export class GitHeadReader implements HeadReader {
  headOf(repoPath: string): string {
    try {
      return execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
        // Stryker disable next-line BooleanLiteral: same reasoning as git()'s
        // own windowsHide — invisible to the returned sha or the catch below.
        windowsHide: true,
        // Stryker disable next-line ArrayDeclaration, StringLiteral: Node
        // falls back to default stdio behavior for a missing/invalid array
        // element (verified: `stdio: []` and an invalid stdio[2] value both
        // still return the real HEAD sha here) — neither mutation is
        // observable through this method's string return value.
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return '';
    }
  }
}
