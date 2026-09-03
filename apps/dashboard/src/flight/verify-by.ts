// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { slugify } from '@autopilot/onboarding';

/**
 * VERIFY-BY enforcement (web-msnsqj1f-azaeee): `docs/RESEARCH-LIBRARY.md`
 * carries dated "verify by YYYY-MM-DD" notes on its section headings (e.g.
 * "## Anthropic models & routing (2026-08-07, verify by 2026-09-01)") but
 * nothing ever reads them — a note can sit silently stale forever. This
 * parses the heading lines and PROPOSES (never rewrites the doc) which
 * notes are due, the same "print it, let the operator act" contract
 * `findReconciliationCandidates` uses for board/git reconciliation. Pure
 * and doc-shape-only: a heading with no parseable "verify by <date>" (e.g.
 * "verify per its Appendix 4 half-lives") is skipped rather than guessed.
 *
 * `verifyByIdPrefix`/`verifyByTaskId` (BOARD web-mt1qajrv-ukabrc, the lesson-
 * bank half of the SOUL/LESSON PRUNE ritual) let `fly.ts`'s post-flight
 * sweep turn a due note into an actual `needs_approval` board task instead
 * of only the `out()` console line above — a line in a flight's live output
 * is easy to miss entirely, while a board task is the durable, dashboard-
 * actionable surface every other self-mined proposal already uses. The id
 * is keyed on the note's TITLE plus its OWN verify-by date (never a re-run
 * timestamp) — the identity-not-timestamp dedup doctrine the DOC-FRESHNESS
 * 40-duplicate-proposal incident (RESEARCH-LIBRARY.md, 2026-08-20) recorded:
 * while the doc's date field is unedited, every flight re-derives the exact
 * same id, so `createTask`'s primary-key conflict is itself the dedup guard;
 * once a human edits the entry's date (resolving it, whether by re-verifying
 * or pushing it out), the id changes and a fresh due date mints fresh.
 */

/** One research-library section whose verify-by date has arrived (or passed). */
export interface VerifyByNote {
  readonly title: string;
  readonly verifyByDate: string;
  /** 0 the day it's due, positive once it's overdue. */
  readonly daysOverdue: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// A heading line whose trailing parenthetical is captured whole, e.g.
// "## Anthropic models & routing (2026-08-07, verify by 2026-09-01)". The
// title capture requires a non-whitespace first character so a heading can
// never yield a whitespace-only title.
const HEADING_WITH_PARENTHETICAL = /^##\s+(\S.*?)\s*\(([^)]*)\)\s*$/gm;
const VERIFY_BY_DATE = /verify by (\d{4}-\d{2}-\d{2})/i;

/**
 * Every "## title (..., verify by YYYY-MM-DD...)" section in `markdown`
 * whose verify-by date is today or earlier relative to `nowMs`, sorted most
 * overdue first. A malformed date (fails `Date.parse`) is skipped, not
 * thrown — a typo in the doc must never crash the sweep.
 */
export function findDueVerifyByNotes(markdown: string, nowMs: number): readonly VerifyByNote[] {
  const due: VerifyByNote[] = [];
  for (const match of markdown.matchAll(HEADING_WITH_PARENTHETICAL)) {
    // No `.trim()` needed: the regex's `\S` prefix excludes leading
    // whitespace from the capture, and the greedy `\s*` before the
    // parenthetical always absorbs trailing whitespace itself rather than
    // leaving it in the lazily-matched capture group.
    const title = match[1];
    const parenthetical = match[2];
    // Stryker disable next-line ConditionalExpression, LogicalOperator:
    // `title` can never be falsy here (the regex's `\S` prefix guarantees a
    // non-whitespace first character), and an empty `parenthetical` always
    // fails VERIFY_BY_DATE below and gets skipped by the `!verifyByDate`
    // guard just the same — so this guard's outcome is unobservable. Both
    // halves still need the falsy check for TS narrowing (`match[1]`/`[2]`
    // are `string | undefined` per `noUncheckedIndexedAccess`) before
    // `title`/`parenthetical` are used as plain `string`s below.
    if (!title || !parenthetical) continue;

    const dateMatch = VERIFY_BY_DATE.exec(parenthetical);
    const verifyByDate = dateMatch?.[1];
    // Stryker disable next-line ConditionalExpression: this guard only exists
    // to narrow `verifyByDate` from `string | undefined` to `string` for the
    // push below. If it didn't fire, the template literal two lines down
    // would parse `"undefinedT00:00:00Z"`, always NaN, and the
    // `daysOverdue >= 0` check further down discards NaN results the same
    // way — so the branch itself is unobservable.
    if (!verifyByDate) continue;

    const verifyByMs = Date.parse(`${verifyByDate}T00:00:00Z`);
    const daysOverdue = Math.floor((nowMs - verifyByMs) / MS_PER_DAY);
    if (daysOverdue >= 0) {
      due.push({ title, verifyByDate, daysOverdue });
    }
  }
  return due.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/** The id prefix every proposal for a research-library section titled
 *  `title` starts with — the section's whole dedup identity, same
 *  `docFreshnessIdPrefix` convention `doc-freshness.ts` established. */
export function verifyByIdPrefix(title: string): string {
  return `verifyby-${slugify(title)}-`;
}

/** The proposal task id for `note` — identity (title) plus the note's OWN
 *  due date, never a sweep-run timestamp, so an unedited entry re-derives
 *  the same id every flight instead of minting a fresh one each time. */
export function verifyByTaskId(note: VerifyByNote): string {
  return `${verifyByIdPrefix(note.title)}${note.verifyByDate}`;
}

/**
 * Prune counterpart to the mint side above (board web-mt1qajrv-ukabrc,
 * the lesson-bank half of SOUL/LESSON PRUNE): the mint-side dedup guard
 * (`fly.ts`'s `openVerifyByProposal` LIKE-prefix check) refuses to propose
 * again while ANY open proposal for a note's title already exists — correct
 * for suppressing duplicates of the SAME due date, but it means once the
 * doc's own date field is edited (re-verified and pushed out, or simply
 * corrected), the id `verifyByTaskId` computes changes too, and the OLD
 * proposal — now describing a due date the doc no longer asserts — never
 * gets superseded: it just sits `needs_approval` forever, and its stale
 * presence keeps blocking a fresh, accurate proposal from ever being minted.
 * Given the ids of every currently-open ('needs_approval') verify-by
 * proposal and the notes `findDueVerifyByNotes` currently reports as due,
 * returns the ids that no longer match ANY current note — safe to retire.
 */
export function findStaleVerifyByProposalIds(
  openProposalIds: readonly string[],
  due: readonly VerifyByNote[],
): readonly string[] {
  const dueIds = new Set(due.map(verifyByTaskId));
  return openProposalIds.filter((id) => !dueIds.has(id));
}
