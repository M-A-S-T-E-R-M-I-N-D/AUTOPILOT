// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * WHEN A TRACKING ISSUE STOPS TELLING THE TRUTH (operator, 2026-09-15:
 * "if it is already done then it is worth closing, no? why does the agent
 * not notice that by itself?").
 *
 * They were looking at issue #49, the tracking issue for epic 0021. Its
 * body listed eight slices, two of them as half-done, and named the unified
 * Keeper queue as the next thing to build. The epic doc listed **eleven**,
 * all of them shipped, including that queue. The issue had been right when
 * it was written on 2026-09-12 and had simply never been touched since.
 *
 * Nothing noticed, and the reason is precise. `mirror-pass.ts` reconciles
 * issues against BOARD TASKS: a `github-<n>` task id maps to an issue
 * number, and a gate-verified firing that shipped the task proposes closing
 * the issue. An epic tracking issue is not a board task. Its source of
 * truth is a document — `docs/epics/NNNN-*.md` — and nothing compared the
 * two. So the one class of issue that summarises many landings was the one
 * class nothing kept honest.
 *
 * This module is that comparison. It is deliberately narrow: it does not
 * judge whether an epic is finished, only whether its issue still AGREES
 * with its doc. "Is this done?" needs a human; "do these two documents say
 * different things?" does not, and is the part that silently rots.
 *
 * Pure: markdown in, a finding or nothing out. The caller fetches the issue
 * and reads the file, and — per the project's standing rule — the finding
 * becomes a proposal on the board, never an automatic edit or close. An
 * issue is a public artifact, and closing one is a decision.
 */

/** The `docs/epics/NNNN-slug.md` path an epic issue names in its body. */
export function epicDocPathFromIssueBody(body: string): string | null {
  const match = /docs\/epics\/(\d{4}-[a-z0-9-]+\.md)/i.exec(body);
  return match === null ? null : `docs/epics/${match[1]}`;
}

/** One slice table's shape, as far as this comparison cares. */
export interface SliceTally {
  /** Rows in the table. */
  readonly total: number;
  /** Rows whose State cell says the slice shipped AND names nothing left. */
  readonly shipped: number;
}

/**
 * Counts a markdown slice table.
 *
 * A row counts as shipped when its State cell says "shipped" and does not
 * also say something remains. Epic 0021's slice 3 reads "second cut shipped
 * … Remaining: drag-to-reorder", and calling that done would be exactly the
 * flattery this module exists to prevent.
 *
 * Two deliberate limits, both found by running it against this repository's
 * own docs rather than guessing:
 *
 *  - The first cut excluded cells containing "open", "next" or "todo" too.
 *    That misfired immediately: epic 0021's slice 4 describes an exit action
 *    literally named **Open**, and its slice 3 says undo/redo "shipped
 *    next". Prose in a State cell is not a state, so only "remaining" — a
 *    word that has no other job there — still disqualifies.
 *  - Slices phrased another way entirely ("in this epic's first landing")
 *    are not counted as shipped. That UNDER-counts, which is the safe
 *    direction: {@link findEpicDrift} compares two tables with this same
 *    parser, so a wording it does not know costs it a finding rather than
 *    inventing one.
 */
export function tallySlices(markdown: string): SliceTally {
  let total = 0;
  let shipped = 0;
  for (const line of markdown.split('\n')) {
    const row = line.trim();
    // A slice row starts with `| <number> |`; the header and its `|---|`
    // separator do not.
    if (!/^\|\s*\d+\s*\|/.test(row)) continue;
    total += 1;
    const cells = row.split('|').filter((c) => c.trim() !== '');
    const state = (cells[cells.length - 1] ?? '').toLowerCase();
    if (/shipped/.test(state) && !/remaining/.test(state)) shipped += 1;
  }
  return { total, shipped };
}

export interface EpicDrift {
  readonly issueNumber: number;
  readonly docPath: string;
  readonly issueTally: SliceTally;
  readonly docTally: SliceTally;
  /** One sentence naming the disagreement, for the proposal's title. */
  readonly summary: string;
}

/**
 * Compares a tracking issue's own slice table against its epic doc's.
 *
 * Only ONE direction is a finding: the doc ahead of the issue. A doc that
 * trails its issue means someone wrote the issue first, which is how epics
 * usually start and is not drift. Reporting both would make this noisy in
 * exactly the situation where nothing is wrong.
 */
export function findEpicDrift(
  issueNumber: number,
  issueBody: string,
  docPath: string,
  docMarkdown: string,
): EpicDrift | null {
  const issueTally = tallySlices(issueBody);
  const docTally = tallySlices(docMarkdown);
  if (issueTally.total === 0 || docTally.total === 0) return null;

  const moreSlices = docTally.total > issueTally.total;
  const moreShipped = docTally.shipped > issueTally.shipped;
  if (!moreSlices && !moreShipped) return null;

  const parts: string[] = [];
  if (moreSlices) parts.push(`${docTally.total} slices against the issue's ${issueTally.total}`);
  if (moreShipped)
    parts.push(`${docTally.shipped} shipped against the issue's ${issueTally.shipped}`);
  return {
    issueNumber,
    docPath,
    issueTally,
    docTally,
    summary: `#${issueNumber} is behind ${docPath}: the doc lists ${parts.join(', and ')}`,
  };
}
