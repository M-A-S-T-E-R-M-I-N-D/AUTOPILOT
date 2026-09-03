// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Board/git reconciliation (BACKLOG-999 "Board hygiene", ap-msksw1mf-3): only a
 * flight's METRICS line marks a board task done, so shipped work done in an
 * interactive session (no METRICS line) leaves its task open even after the
 * commit lands. This proposes candidates — "this shipped, mark done?" — by
 * scoring an open task's title against a commit subject with the same
 * token-overlap idea fleet.ts's headline resolver (`finishedFlightSummaries`)
 * uses to turn a flight into a human summary. Pure and proposal-only: nothing
 * here mutates the store: a caller (e.g. a future session-end hook) decides
 * what to do with the candidates.
 */

import type { TaskEntry } from './fleet.js';

/** One commit worth checking against the open board — sha + subject, plus the files it touched (if known). */
export interface CommitEntry {
  readonly sha: string;
  readonly subject: string;
  /** Changed file paths, when the caller has them — enables the path-match fallback signal below. */
  readonly files?: readonly string[];
}

/** A proposed "this shipped, mark done?" pairing — never applied automatically. */
export interface ReconciliationCandidate {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly commitSha: string;
  readonly commitSubject: string;
  /**
   * Token-overlap score in (0, 1] — higher is a stronger title↔subject match,
   * for a `matchedVia: 'subject'` candidate. A `'path'` candidate's score is
   * not a comparable Jaccard value (see `filePathMatchesTitle`) — it is set to
   * the match threshold so it sorts alongside boundary-confidence subject
   * matches; `matchedVia` is the real reliability signal for those.
   */
  readonly score: number;
  /** Which signal produced this pairing — subject text, or a shared file-path token. */
  readonly matchedVia: 'subject' | 'path';
}

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

// Stryker disable next-line Regex: the `+` quantifier is unobservable — the
// `.filter(t => t.length > 0 ...)` below drops every empty string a
// per-character split would add, leaving the same non-empty tokens either way.
const WORD_SPLIT_PATTERN = /[^a-z0-9]+/;

/** Lowercase, split on non-alphanumerics, drop stopwords and numeric-only tokens. */
function titleTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(WORD_SPLIT_PATTERN)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
  return new Set(tokens);
}

/**
 * Jaccard similarity between two strings' token sets, in [0, 1]: shared tokens
 * divided by the total distinct tokens across both. Union (not the smaller
 * set) is the denominator on purpose — a task title padded with extra words
 * beyond what a commit subject covers should score lower than an exact
 * match, not tie with it.
 */
export function titleMatchScore(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  // Stryker disable next-line ConditionalExpression,LogicalOperator: whichever
  // side is empty, `shared` stays 0 and `union` stays positive (the other
  // side's size), so `shared / union` already evaluates to 0 below — this
  // guard's OR/AND shape and each `=== 0` branch are unobservable except for
  // preventing a 0/0 NaN, which the untouched operand alone still catches.
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) {
    if (tb.has(t)) shared++;
  }
  const union = ta.size + tb.size - shared;
  return shared / union;
}

/** Below this token-overlap score, a title/subject pairing is treated as unrelated. */
const DEFAULT_MATCH_THRESHOLD = 0.5;

/**
 * Structural tokens that show up in nearly every commit's file paths in this
 * monorepo (directory scaffolding, extensions) — filtered out before path
 * matching so they can never manufacture a match on their own. Only entries
 * of `MIN_DISTINCTIVE_PATH_TOKEN_LENGTH` or longer belong here: a shorter
 * noise word (e.g. 'ts', 'src') would already be excluded by that length
 * gate on every path that reaches it, so listing it here would be dead —
 * unreachable and thus unkillable by any mutation test.
 */
const PATH_NOISE_TOKENS = new Set([
  'test',
  'tests',
  'apps',
  'packages',
  'dist',
  'index',
  'docs',
  'json',
]);

/** A token shorter than this is too generic (loop, off, env, …) to trust as file-path match evidence on its own. */
const MIN_DISTINCTIVE_PATH_TOKEN_LENGTH = 4;

/**
 * Distinctive (non-noise) tokens across a commit's changed file paths. Does
 * NOT apply `MIN_DISTINCTIVE_PATH_TOKEN_LENGTH` here — `filePathMatchesTitle`
 * below re-checks every candidate token's length before ever consulting this
 * set, so a length filter here would be a second, unobservable copy of that
 * same gate (any short token this function let through could never pass the
 * consumer's own length check either).
 */
function distinctiveFileTokens(files: readonly string[]): Set<string> {
  const tokens = new Set<string>();
  for (const file of files) {
    // BASENAME ONLY. A directory says where a file LIVES; only its own name
    // says what it IS. Tokenizing the whole path made every board task match
    // every spec-touching commit through the shared `epics` segment of
    // "EPIC-SPEC: docs/epics/00xx-….md" — 13 of 16 DETECTED BACKLOG rows
    // pointed at one unrelated extraction commit (2026-08-24 live incident).
    const basename = file.slice(file.lastIndexOf('/') + 1);
    for (const token of titleTokens(basename)) {
      if (!PATH_NOISE_TOKENS.has(token)) {
        tokens.add(token);
      }
    }
  }
  return tokens;
}

/**
 * Whether a task's title shares a distinctive identifier with a commit's
 * changed file paths (e.g. "otlp" in both a task title and a touched
 * `flight/otlp.ts`) — a fallback signal for a commit whose subject is generic
 * boilerplate that never names the feature it shipped, the way a WIP
 * checkpoint commit's subject does ("wip(autopilot): checkpoint — firing N
 * died mid-unit…"). Deliberately a boolean signal rather than folded into
 * `titleMatchScore`'s Jaccard math: a checkpoint subject's own noise tokens
 * (wip, checkpoint, firing, died, …) would dilute a blended score below any
 * usable threshold even when the file-path evidence is unambiguous.
 */
export function filePathMatchesTitle(title: string, files: readonly string[]): boolean {
  // No `files.length === 0` fast path — an empty `files` array already makes
  // `distinctiveFileTokens` return an empty set, which the check below
  // catches identically; a separate guard here would only be an
  // unobservable duplicate of it.
  const fileTokens = distinctiveFileTokens(files);
  // Stryker disable next-line ConditionalExpression: skipping this guard when
  // `fileTokens` is genuinely empty still returns false — `.has()` on an
  // empty set can never match any title token, so the loop below falls
  // through to `return false` regardless. The BooleanLiteral mutant (this
  // branch returning `true`) remains live and tested.
  if (fileTokens.size === 0) return false;
  for (const token of titleTokens(title)) {
    if (token.length >= MIN_DISTINCTIVE_PATH_TOKEN_LENGTH && fileTokens.has(token)) return true;
  }
  return false;
}

/**
 * Open (non-`done`) tasks whose title plausibly matches a recent commit —
 * the reconciliation the "Board hygiene" backlog item asks for. Each task is
 * matched first against its single best-scoring commit subject among those
 * clearing `threshold`; when no subject clears it, the changed-file-path
 * signal is tried as a fallback. A task matched by neither is omitted rather
 * than guessed. Results are sorted strongest match first.
 */
export function findReconciliationCandidates(
  tasks: readonly Pick<TaskEntry, 'id' | 'title' | 'status'>[],
  commits: readonly CommitEntry[],
  threshold: number = DEFAULT_MATCH_THRESHOLD,
): readonly ReconciliationCandidate[] {
  const candidates: ReconciliationCandidate[] = [];
  for (const task of tasks) {
    if (task.status === 'done') continue;

    let best: { commit: CommitEntry; score: number } | null = null;
    for (const commit of commits) {
      const score = titleMatchScore(task.title, commit.subject);
      if (score < threshold) continue;
      if (!best || score > best.score) best = { commit, score };
    }
    if (best) {
      candidates.push({
        taskId: task.id,
        taskTitle: task.title,
        commitSha: best.commit.sha,
        commitSubject: best.commit.subject,
        score: best.score,
        matchedVia: 'subject',
      });
      continue;
    }

    const pathMatch = commits.find((c) => c.files && filePathMatchesTitle(task.title, c.files));
    if (pathMatch) {
      candidates.push({
        taskId: task.id,
        taskTitle: task.title,
        commitSha: pathMatch.sha,
        commitSubject: pathMatch.subject,
        score: threshold,
        matchedVia: 'path',
      });
    }
  }
  // No `.slice()` before sort — `candidates` is a local accumulator with no
  // other reference, so sorting it in place is unobservable from the caller.
  return candidates.sort((x, y) => y.score - x.score);
}
