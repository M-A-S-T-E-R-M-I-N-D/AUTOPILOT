// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * ANTI-FLOOD GUARD — the enforcement half of the edit-over-append law
 * (docs/ATTRIBUTION.md §3, operator directive 2026-09-09: "חשוב לוודא שלא
 * הצפנו ולא מציפים סתם את הלוחות במלא הודעות ותגובות אחת אחרי השניה").
 *
 * The law was written as doctrine; a pilot that means well still floods
 * when a post silently succeeds and the caller retries. Both real
 * incidents are in the audit trail:
 *
 *   - PR #33 carried the SAME approval twice, 16s apart. The first body
 *     held `≥` and `don't`; the Windows shell made the call LOOK like it
 *     failed, so it was retried ASCII-safe — but the first had landed.
 *   - Issue #16 carried three consecutive maintainer messages, the third
 *     of which was also factually wrong. Two is the ceiling.
 *
 * So this is a wrapper, not a rule: {@link withAntiFlood} decorates any
 * `CliExec` and inspects every `gh issue comment` / `gh pr comment` /
 * `gh pr review --body` argv before it runs. Zero call-site edits — every
 * existing executor (issue-triage, pr-review, mirror-pass, pool-client,
 * contributor-dossier, report-from-here) and every future one is covered
 * by decorating the exec they were already handed, the same shape the
 * `withAttribution()` wiring map prescribes for credit.
 *
 * Two tiers, the shape the diff-size gate proved:
 *
 *   - SUPPRESS: the thread already carries a >=90%-similar message from
 *     this identity. The post is a no-op success — the desired end state
 *     already holds, which is what idempotency means (coordination
 *     doctrine primitive 3). Nothing is posted, exit 0.
 *   - FOLD: this identity is already the last commenter AND is already at
 *     the {@link CONSECUTIVE_CEILING}. Rather than stack a third, the new
 *     text is EDITED onto the tail message as a dated `**Update:**`
 *     block — the law's own prescription, executed.
 *   - PASS: anything else runs untouched.
 *
 * Fail-open by design: any error reading the thread (no `gh`, no network,
 * rate limit, a shape change) falls through to the real post. A guard that
 * silently eats a maintainer's reply when GitHub hiccups would be a worse
 * failure than the flood it prevents.
 */

import type { CliExec, CliRun } from '../connection/cli-probe.js';

/** Word-overlap at or above which two same-author messages are the same
 *  message. 0.9 catches a retry that only differs by shell-mangled
 *  punctuation (the #33 shape: 97%) while leaving a genuine follow-up
 *  that reuses vocabulary alone. */
export const FLOOD_DUPLICATE_RATIO = 0.9;

/** Consecutive messages from one identity allowed before the next one
 *  folds into the tail instead of stacking. Two is the ceiling; three is
 *  a cleanup bug (ATTRIBUTION.md §3). */
export const CONSECUTIVE_CEILING = 2;

/** Bodies shorter than this are acks and emoji — too small for word
 *  overlap to mean anything, so they always pass. */
export const MIN_COMPARE_LENGTH = 40;

/** How many of a thread's most recent messages the guard reads. A flood
 *  is a tail phenomenon; re-reading a 200-comment epic on every post
 *  would cost more than it saves. */
export const THREAD_TAIL_WINDOW = 20;

/** One existing message on a thread, as the guard needs to see it. */
export interface ThreadMessage {
  readonly id: number;
  readonly author: string;
  readonly body: string;
}

/** What the guard decided about one outgoing post. */
export type FloodVerdict =
  | { readonly action: 'pass' }
  | { readonly action: 'suppress'; readonly duplicateOf: number; readonly ratio: number }
  | { readonly action: 'fold'; readonly into: number; readonly consecutive: number };

/** A parsed outgoing comment — the argv shapes the fleet actually posts. */
export interface OutgoingComment {
  /** Issue or PR number the body lands on. */
  readonly target: string;
  /** The text about to be posted. */
  readonly body: string;
  /** Index of the body inside the original argv, so a fold can rewrite it. */
  readonly bodyIndex: number;
}

/**
 * Collapses everything two retries of one message can differ by — smart
 * punctuation downgraded to ASCII by a shell, whitespace runs, case,
 * markdown syntax — so a mangled retry still reads as the same text. Kept
 * identical in spirit to `scripts/ci/audit-board-flood.mjs`'s normalize:
 * the auditor finds what this guard failed to stop, so they must agree on
 * what "same message" means.
 */
export function normalizeCommentText(body: string): string {
  return (body ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Word-level Jaccard similarity of two normalized bodies. Word sets, not
 * character diffing: a retry that rewords one clause ("in the meantime" →
 * "meanwhile") is still the same message, and character distance would
 * miss that while word overlap catches it.
 */
export function commentSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const word of setA) if (setB.has(word)) shared += 1;
  return shared / (setA.size + setB.size - shared);
}

/**
 * The whole decision, pure: given a thread's recent messages (oldest
 * first), who we are, and what we are about to say — post it, suppress it
 * as a duplicate, or fold it into our own tail message.
 */
export function judgeOutgoingComment(
  messages: readonly ThreadMessage[],
  identity: string,
  body: string,
): FloodVerdict {
  const normalized = normalizeCommentText(body);
  if (normalized.length < MIN_COMPARE_LENGTH) return { action: 'pass' };

  let best: { id: number; ratio: number } | null = null;
  for (const message of messages) {
    if (message.author !== identity) continue;
    const ratio = commentSimilarity(normalized, normalizeCommentText(message.body));
    if (ratio >= FLOOD_DUPLICATE_RATIO && (!best || ratio > best.ratio)) {
      best = { id: message.id, ratio };
    }
  }
  if (best) return { action: 'suppress', duplicateOf: best.id, ratio: best.ratio };

  let consecutive = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.author !== identity) break;
    consecutive += 1;
  }
  const tail = messages[messages.length - 1];
  if (consecutive >= CONSECUTIVE_CEILING && tail) {
    return { action: 'fold', into: tail.id, consecutive };
  }
  return { action: 'pass' };
}

/**
 * The folded body: the tail message's original text preserved in full,
 * with the new text appended under a dated `**Update:**` heading — the
 * exact form ATTRIBUTION.md §3 prescribes, so a reader keeps one message
 * and GitHub keeps the edit history.
 */
export function foldCommentBody(existing: string, addition: string, at: Date): string {
  const stamp = at.toISOString().slice(0, 10);
  return `${existing.trimEnd()}\n\n**Update (${stamp}):**\n\n${addition.trim()}`;
}

/** `gh issue comment N --body X` / `gh pr comment N --body X` — the two
 *  argv shapes every posting path in the fleet builds. Returns null for
 *  anything else, including `gh pr review`, whose verdict argv this guard
 *  deliberately leaves alone (a review carries state, not just text; a
 *  suppressed approval would strand a PR unapproved). */
export function parseCommentPost(bin: string, args: readonly string[]): OutgoingComment | null {
  if (bin !== 'gh') return null;
  if (args[0] !== 'issue' && args[0] !== 'pr') return null;
  if (args[1] !== 'comment') return null;
  const bodyIndex = args.indexOf('--body');
  if (bodyIndex === -1 || bodyIndex + 1 >= args.length) return null;
  const target = args[2];
  const body = args[bodyIndex + 1];
  if (!target || target.startsWith('-') || body === undefined) return null;
  return { target, body, bodyIndex };
}

/** Options {@link withAntiFlood} takes — all injectable so the guard is
 *  testable without a real `gh`, and `repo`/`now` stay overridable for
 *  fork-local runs and frozen-clock tests. */
export interface AntiFloodOptions {
  /** `owner/name`. Default matches the canonical repo. */
  readonly repo?: string;
  /** Clock for the fold stamp. */
  readonly now?: () => Date;
  /** Called with a one-line note whenever the guard acts, so a run's log
   *  says why a post did not appear. */
  readonly onVerdict?: (note: string) => void;
}

const DEFAULT_REPO = 'M-A-S-T-E-R-M-I-N-D/AUTOPILOT';

async function ghJson(exec: CliExec, path: string): Promise<unknown> {
  const { code, stdout } = await exec('gh', ['api', path]);
  if (code !== 0) throw new Error(`gh api ${path} exited ${code}`);
  return JSON.parse(stdout);
}

async function resolveIdentity(exec: CliExec): Promise<string> {
  const user = (await ghJson(exec, 'user')) as { login?: string };
  if (!user?.login) throw new Error('gh api user returned no login');
  return user.login;
}

async function readThreadTail(
  exec: CliExec,
  repo: string,
  target: string,
): Promise<readonly ThreadMessage[]> {
  const raw = (await ghJson(
    exec,
    `repos/${repo}/issues/${target}/comments?per_page=${THREAD_TAIL_WINDOW}`,
  )) as readonly { id: number; user?: { login?: string }; body?: string }[];
  return raw.map((c) => ({ id: c.id, author: c.user?.login ?? '', body: c.body ?? '' }));
}

/**
 * Decorates a `CliExec` so every `gh issue|pr comment` it runs is checked
 * against the thread first. Everything that is not a comment post — every
 * label, every task, every git call — passes through untouched and
 * un-inspected, so wrapping an exec is safe everywhere.
 */
export function withAntiFlood(exec: CliExec, options: AntiFloodOptions = {}): CliExec {
  const repo = options.repo ?? DEFAULT_REPO;
  const now = options.now ?? (() => new Date());
  const note = options.onVerdict ?? (() => {});

  return async (bin: string, args: readonly string[]): Promise<CliRun> => {
    const post = parseCommentPost(bin, args);
    if (!post) return exec(bin, args);

    let verdict: FloodVerdict;
    let messages: readonly ThreadMessage[];
    try {
      const [identity, tail] = await Promise.all([
        resolveIdentity(exec),
        readThreadTail(exec, repo, post.target),
      ]);
      messages = tail;
      verdict = judgeOutgoingComment(tail, identity, post.body);
    } catch {
      // Fail open — a guard must never eat a message because GitHub blinked.
      return exec(bin, args);
    }

    if (verdict.action === 'suppress') {
      note(
        `anti-flood: suppressed a ${Math.round(verdict.ratio * 100)}% duplicate of comment ` +
          `${verdict.duplicateOf} on ${post.target} — that message is already on the thread.`,
      );
      return { code: 0, stdout: `anti-flood: duplicate of ${verdict.duplicateOf}, nothing posted` };
    }

    const tailMessage = messages[messages.length - 1];
    if (verdict.action === 'fold' && tailMessage) {
      const folded = foldCommentBody(tailMessage.body, post.body, now());
      const edit = await exec('gh', [
        'api',
        '--method',
        'PATCH',
        `repos/${repo}/issues/comments/${tailMessage.id}`,
        '-f',
        `body=${folded}`,
      ]);
      if (edit.code === 0) {
        note(
          `anti-flood: folded into comment ${tailMessage.id} on ${post.target} as a dated ` +
            `Update block — ${verdict.consecutive} consecutive messages was already the ceiling.`,
        );
        return { code: 0, stdout: `anti-flood: folded into ${tailMessage.id}` };
      }
      // The edit failed; posting is better than losing the content.
      return exec(bin, args);
    }

    return exec(bin, args);
  };
}
