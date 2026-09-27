// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * PAYLOAD CENSUS (epic 0020 "the legible surface", slice 6 — the epic's
 * failure #1: "facts fetched and discarded at the client boundary." `gh pr
 * list` returned every check's name, state, timing and log url; the panel
 * rendered one word (`checkRuns` on `PrReviewCandidate`, fixed in slice 1).
 * `link-census.test.ts` (slice 5) already guards one narrow slice of this —
 * a fetched `url` with no `href` — this guards a second, independent slice:
 * a whole small display payload where SOME field never reaches the panel
 * that already renders its siblings.
 *
 * This is a deliberately bounded census, not the full sweep the epic
 * describes. `PAYLOAD_INTERFACES` below is a CURATED list, not a disk diff —
 * unlike `link-census.test.ts`'s fully automatic scan, most `flight/*.ts`
 * payload interfaces (`PrReviewCandidate` above all) mix
 * real display fields with fields documented as decision-only /
 * reasoning-only (see e.g. `PrReviewCandidate.viewerIsAuthor`'s own doc
 * comment: "the check can only narrow toward queue-for-human, never force a
 * merge") — a blind "every field must render" sweep would misfire on every
 * one of those. Every field of a censused interface is adjudicated: read off
 * its receiver, or listed in `DERIVED` (reaches the panel through a wrapper
 * field), `IN_PAINTED_TEXT` (stated in prose the panel paints — a triage
 * `reasoning`, a mirror-pass finding's line, a PR card's verdict — checked
 * against the real planner's and client formatter's output, not the source
 * text), `DECISION_ONLY` (consulted only to decide, checked by flipping it
 * under the real planner) or `EXCUSED` (a tracked gap). The
 * `IssueTriageDecision` variants, every `MirrorPass*Finding` and
 * `PrReviewCandidate` itself (slice c of the split below) are censused
 * through that adjudication.
 *
 * A read counts only when it is taken off a name the renderer binds THIS
 * payload to (`check.url`, not the PR's own `plan.pr.url`), in code rather
 * than a comment — VERDICT ap-mtui8t6l-0 caught a bare `\.url\b` match
 * holding three fields green with their real reads deleted
 * (docs/debriefs/2026-09-27-verdict-ap-mtui8t6l-0-payload-census-split-confirmed.md).
 * This is still a source-text inference; the render-and-diff census is the
 * sound follow-up that can retire the receiver lists.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { planIssueTriage, type IssueTriageDecision } from '../../src/flight/issue-triage.js';
import {
  planMirrorPassCountsDrift,
  planMirrorPassLandingNote,
  planMirrorPassLinkDrift,
  planMirrorPassReconcile,
  planMirrorPassStaleClaimReaper,
  planMirrorPassVersionDrift,
} from '../../src/flight/mirror-pass.js';
import {
  PRIORITY_LABEL_BAND,
  planMirrorPassPriorityFollow,
} from '../../src/flight/mirror-pass-priority.js';
import {
  planPrReview,
  planPrReviewCommands,
  type PrReviewCandidate,
} from '../../src/flight/pr-review.js';
import { mirrorPassItems } from '../../src/web/mirror-pass-panel.js';

const FLIGHT_DIR = fileURLToPath(new URL('../../src/flight/', import.meta.url));
const FEATURES_DIR = fileURLToPath(new URL('../../src/web/features/', import.meta.url));

/**
 * The renderer's own text plus every local helper it splices in via a
 * relative `.js` import (the "vanilla + `.toString()` splice architecture"
 * — see e.g. `web/features/publicity.ts` importing `publicityAffordanceTip`
 * from `../publicity-panel.js` and inlining `.toString()`'s output). A
 * field read only inside a spliced helper is still a field that reaches
 * the browser — checking the renderer file alone would false-positive on
 * exactly that shape. One level deep only: enough for every splice this
 * codebase currently does. Comments are stripped ({@link stripComments}).
 */
function rendererSourceWithLocalImports(rendererPath: string): string {
  const own = readFileSync(rendererPath, 'utf8');
  let combined = own;
  for (const importMatch of own.matchAll(/from ['"](\.[^'"]+)\.js['"]/g)) {
    const specifier = importMatch[1];
    if (specifier === undefined) continue;
    const importedPath = resolve(dirname(rendererPath), `${specifier}.ts`);
    if (existsSync(importedPath)) combined += `\n${readFileSync(importedPath, 'utf8')}`;
  }
  return stripComments(combined);
}

/**
 * `source` with its block and line comments removed, so a doc comment that
 * names a field (`entries[].claims[]`) never passes for a read of it. It is
 * deliberately naive: it also strips comment syntax inside the template-
 * literal client JS (right — those are comments in the shipped script too),
 * and a `/*` or `//` inside a string literal over-strips the rest of it.
 * Over-stripping only ever removes reads, so the coverage check fails closed
 * (red), never open; only the "still unread" honesty checks could miss a
 * read hidden that way, the lesser risk. `://` is spared so a URL literal
 * keeps the rest of its line.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/.*$/gm, '');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when `source` reads `field` off one of `receivers` — `check.url`,
 * `entry.issue.url`, `affordance?.reasoning` — and never on a bare `.url`
 * off some other object (`plan.pr.url`, a DOM node's `desc.id`) or a longer
 * path that merely ends in a receiver's name (`plan.check.url`). A renderer
 * that renames its receiver turns the census red, which is the safe way to
 * be wrong (VERDICT ap-mtui8t6l-0, slice a).
 */
function fieldIsRead(source: string, receivers: readonly string[], field: string): boolean {
  // An empty alternation would match a bare `.field` again: fail closed.
  if (receivers.length === 0) return false;
  const receiver = receivers.map(escapeRegExp).join('|');
  return new RegExp(`(?<![\\w$.])(?:${receiver})\\??\\.${escapeRegExp(field)}\\b`).test(source);
}

interface PayloadInterface {
  readonly file: string;
  readonly interfaceName: string;
  /** The names the renderer and its spliced helpers bind this payload to. */
  readonly receivers: readonly string[];
  /** The `web/features/` renderer, when it is not named after `file`. */
  readonly renderer?: string;
  /** The one spliced function that paints this payload, when a sibling
   *  payload's formatter binds the same receiver name — reads anywhere else
   *  in the renderer do not count. */
  readonly formatter?: string;
}

/** The mirror-pass findings the panel lists as `#<issueNumber> — <comment>`. */
const MIRROR_PASS_ISSUE_FINDINGS = [
  'MirrorPassCloseFinding',
  'MirrorPassCloseByAssigneeFinding',
  'MirrorPassReopenFinding',
  'MirrorPassUnverifiedFinding',
  'MirrorPassSettleFinding',
  'MirrorPassLandingNoteFinding',
  'MirrorPassStaleClaimFinding',
] as const;

/** The doc-vs-tree findings the panel builds its own sentence for. */
const MIRROR_PASS_DRIFT_FINDINGS = [
  'MirrorPassVersionDriftFinding',
  'MirrorPassCountsDriftFinding',
  'MirrorPassBrokenLinkFinding',
] as const;

/** Curated (file, interface) pairs — see the file header for why this is a
 *  hand-picked list rather than a disk diff. Each entry's flight file must
 *  have a `web/features/` renderer already (same-named unless `renderer`
 *  names it), so "reaches the panel" has somewhere real to check against. */
const PAYLOAD_INTERFACES: readonly PayloadInterface[] = [
  { file: 'pool-client.ts', interfaceName: 'PoolIssue', receivers: ['issue', 'entry.issue'] },
  { file: 'publicity.ts', interfaceName: 'PublicityAffordance', receivers: ['affordance'] },
  // `PrCheckRun` is the sub-shape `statusCheckRollup` feeds the pipeline
  // strip through, and every one of its fields is display-only by its own
  // doc comment.
  { file: 'pr-review.ts', interfaceName: 'PrCheckRun', receivers: ['check', 'c'] },
  // Its parent mixes a handful of display fields with ~20 guard inputs. The
  // card reads `plan.pr`, and the spliced `web/pr-review-panel.ts` helpers
  // it hands `plan.pr` to (`humanMergeReadiness`, the tips) bind it as `pr`;
  // each guard input is adjudicated one by one below — most reach the card
  // only as the verdict's `reasoning` (the badge tip), never as a raw read.
  { file: 'pr-review.ts', interfaceName: 'PrReviewCandidate', receivers: ['plan.pr', 'pr'] },
  // Every `IssueTriageDecision` variant (`IssueTriageDossier` and its four
  // siblings). The panel reads `decision` (badge, icon, counts) and
  // `reasoning` off `plan.decision`; each variant's other fields are
  // adjudicated one by one in `IN_PAINTED_TEXT` / `EXCUSED` below.
  ...[
    'IssueTriageDuplicate',
    'IssueTriageAccept',
    'IssueTriageSkip',
    'IssueTriageDossier',
    'IssueTriageNeedsFormat',
  ].map((interfaceName) => ({
    file: 'issue-triage.ts',
    interfaceName,
    receivers: ['plan.decision', 'p.decision'],
  })),
  // Every `MirrorPass*Finding` the MIRROR PASS panel lists. The panel's
  // spliced formatters (`web/mirror-pass-panel.ts`) read an issue-backed
  // finding as `p.finding` and a doc-drift finding as `d`, so each entry is
  // scoped to its own formatter: the priority-follow line's
  // `p.finding.taskId` is no read of a reconcile finding's `taskId`. Each
  // field a line states only in prose is adjudicated in `IN_PAINTED_TEXT`.
  ...MIRROR_PASS_ISSUE_FINDINGS.map((interfaceName) => ({
    file: 'mirror-pass.ts',
    interfaceName,
    receivers: ['p.finding'],
    formatter: 'mirrorPassReconcileItems',
  })),
  ...MIRROR_PASS_DRIFT_FINDINGS.map((interfaceName) => ({
    file: 'mirror-pass.ts',
    interfaceName,
    receivers: ['d'],
    formatter: 'mirrorPassDriftItems',
  })),
  {
    file: 'mirror-pass-priority.ts',
    interfaceName: 'MirrorPassPriorityFollowFinding',
    receivers: ['p.finding'],
    renderer: 'mirror-pass.ts',
    formatter: 'mirrorPassPriorityFollowItems',
  },
];

const PR_CARD_SIZE_GAP =
  'the PR card shows no diff size (GitHub’s own +N −M, N files); only an over-cap line total or a ' +
  'truncated-list mismatch ever reaches the reasoning — tracked UX gap, not a decision-only field';

/** `${file}#${interfaceName}#${field}` -> why this one field is excused
 *  from the "every field reaches the renderer" rule — a genuine tracked
 *  gap, never a silent carve-out (same discipline as `link-census.test.ts`'s
 *  `NOT_YET_RENDERED`). Remove an entry the day its panel ships the field,
 *  or — for a dead input — the day the flight module stops declaring it. */
const EXCUSED: Readonly<Record<string, string>> = {
  'pr-review.ts#PrReviewCandidate#touchedPaths':
    'the PR card never lists the files a PR touches — a security-hard queue does not even name the ' +
    'guarded path it hit — tracked UX gap, not a decision-only field',
  'pr-review.ts#PrReviewCandidate#additions': PR_CARD_SIZE_GAP,
  'pr-review.ts#PrReviewCandidate#deletions': PR_CARD_SIZE_GAP,
  'pr-review.ts#PrReviewCandidate#changedFiles': PR_CARD_SIZE_GAP,
  'pr-review.ts#PrReviewCandidate#labels':
    'the PR card does not show a PR’s labels; a hold label reaches the reasoning only as "carries a ' +
    'hold label", never by name — tracked UX gap, not a decision-only field',
  'pool-client.ts#PoolIssue#labels':
    'the panel does not yet show a pool issue’s labels — tracked UX gap, not a decision-only field',
  'pool-client.ts#PoolIssue#assignees':
    'the panel does not yet show who a pool issue is assigned to — tracked UX gap, not a decision-only field',
  'issue-triage.ts#IssueTriageDuplicate#matchedId':
    'the preview names the matched task only by title (inside reasoning), never by id — tracked UX gap: ' +
    'a duplicate does not yet link to the board task or backlog entry it matched',
};

/** A field that reaches the panel only through a same-named field of a
 *  wrapper interface the flight module derives from it server-side. */
interface DerivedRead {
  /** The wrapper interface, in the same flight file, that carries it. */
  readonly via: string;
  /** The names the renderer binds that wrapper to. */
  readonly receivers: readonly string[];
  readonly why: string;
}

/** `${file}#${interfaceName}#${field}` -> the derived field that carries it
 *  to the panel. Same key shape as `EXCUSED`, but this is a real read, not
 *  a gap: remove an entry the day the renderer reads the raw field. */
const DERIVED: Readonly<Record<string, DerivedRead>> = {
  'pool-client.ts#PoolIssue#claims': {
    via: 'PoolBrowseEntry',
    receivers: ['entry'],
    why:
      'planPoolBrowseBatch measures issueClaims(issue) into PoolBrowseEntry.claims, and the panel ' +
      'paints that ledger (poolClaimLedgerText(entry.claims)), never the raw claim list',
  },
};

/** A field the panel shows only inside a line of prose it paints — a
 *  triage decision's `reasoning`, a mirror-pass finding's rendered line —
 *  so it reaches the browser as text, never as a raw read. */
interface TextFold {
  /** The text(s) the painted line must contain for the field's `value`. */
  readonly shown: (value: unknown) => readonly string[];
  readonly why: string;
  /** The field's own real payload, when the interface's one fixture cannot
   *  paint it: a PR's reasoning states only the FIRST guard that stops it. */
  readonly fixture?: () => PaintedFixture;
}

const AS_TEXT = (value: unknown): readonly string[] => [String(value)];
const EACH_AS_TEXT = (value: unknown): readonly string[] =>
  (value as readonly unknown[]).map(String);

/** A PR every guard in `planPrReview` clears — so any one override below
 *  stops it at exactly that override's own guard. */
const GREEN_PR: PrReviewCandidate = {
  number: 12,
  title: 'Fix a typo in the README',
  url: 'https://github.com/o/r/pull/12',
  gateStatus: 'pass',
  mergeable: true,
  touchedPaths: ['README.md'],
  additions: 1,
  deletions: 1,
  changedFiles: 1,
  headRefOid: 'abc1234def',
  baseRefName: 'main',
  renamedFromPaths: [],
  unresolvedReviewThreads: 0,
};

/** `overrides` on {@link GREEN_PR}, and the verdict reasoning the real
 *  planner reaches for it — the text the card paints as its badge tip. */
function prReviewFixture(overrides: Partial<PrReviewCandidate>): PaintedFixture {
  const pr: PrReviewCandidate = { ...GREEN_PR, ...overrides };
  return { payload: pr, painted: planPrReview(pr).reasoning };
}

/** A `PrReviewCandidate` field the verdict reasoning states, painted off
 *  the one override that makes its guard the one that speaks. */
function prFold(
  overrides: Partial<PrReviewCandidate>,
  shown: TextFold['shown'],
  why: string,
): TextFold {
  return { shown, why, fixture: () => prReviewFixture(overrides) };
}

/** A guard flag (set to `true` in `overrides`) the reasoning states as a
 *  sentence only when it is set. */
function prFlagFold(overrides: Partial<PrReviewCandidate>, phrase: string, why: string): TextFold {
  return prFold(
    overrides,
    (value) => [value === true ? phrase : `<flag unset: ${String(value)}>`],
    why,
  );
}

/** What the reasoning says for each gate verdict. */
const GATE_STATUS_PHRASES: Readonly<Record<string, string>> = {
  pass: 'gate passed',
  fail: 'the gate failed',
  pending: 'the gate is still running',
  unreported: 'no gating check has reported',
};

/** What each mirror-pass `action` tag makes the painted line say the pass
 *  will do. The tag itself is never painted, only the sentence it picks. */
const MIRROR_PASS_ACTION_PHRASES: Readonly<Record<string, string>> = {
  'close-with-landing-note': '— closing.',
  'close-by-assignee': 'Closing —',
  'reopen-honestly': 'Reopening —',
  'note-unverified': 'Leaving this open',
  'settle-claimed': 'settling the AUTOPILOT board task',
  'note-landing-sha': 'noting for the record',
  'reap-stale-claim': 'Freeing it up',
  'file-version-drift-issue': 'but the tree is actually at',
  'file-counts-drift-issue': 'third-party packages, but the tree has',
  'file-broken-link-issue': 'no longer resolve',
  'set-priority-from-label': 'will be pinned to follow',
};

const MIRROR_PASS_ACTION_FOLD: TextFold = {
  shown: (value) => [
    MIRROR_PASS_ACTION_PHRASES[String(value)] ?? `<no phrase for action ${String(value)}>`,
  ],
  why: 'the tag is never painted; the sentence it picks says what the pass will do',
};

/** Every taskId a mirror-pass planner emits is `github-<n>` for the issue it
 *  mirrors (a non-GitHub task never gets a finding), so the painted `#<n>`
 *  names the board task exactly. */
const GITHUB_TASK_ID_FOLD: TextFold = {
  shown: (value) => [String(value).replace(/^github-(\d+)$/, '#$1 — ')],
  why: 'a mirrored task id is always github-<n> for its issue, and the line opens with #<n>',
};

const MIRROR_PASS_PAYLOADS = PAYLOAD_INTERFACES.filter(({ interfaceName }) =>
  interfaceName.startsWith('MirrorPass'),
);

/** `${file}#${interfaceName}#${field}` -> how the field shows up in the text
 *  the panel paints. Unlike the other lists this is checked against
 *  BEHAVIOR: the honesty case runs the real planner (and, for a mirror-pass
 *  finding, the real client formatter) and looks for `shown(value)` in the
 *  text it produced, so a template that stops mentioning a field turns the
 *  census red. Remove an entry the day the renderer reads the raw field. */
const IN_PAINTED_TEXT: Readonly<Record<string, TextFold>> = {
  ...Object.fromEntries(
    MIRROR_PASS_PAYLOADS.map(({ file, interfaceName }) => [
      `${file}#${interfaceName}#action`,
      MIRROR_PASS_ACTION_FOLD,
    ]),
  ),
  ...Object.fromEntries(
    MIRROR_PASS_ISSUE_FINDINGS.filter((name) => name !== 'MirrorPassStaleClaimFinding').map(
      (interfaceName) => [`mirror-pass.ts#${interfaceName}#taskId`, GITHUB_TASK_ID_FOLD],
    ),
  ),
  'mirror-pass.ts#MirrorPassCloseFinding#sha': {
    shown: (value) => [`Landed in ${String(value)}`],
    why: 'the line names the landing commit the issue closes on',
  },
  'mirror-pass.ts#MirrorPassCloseByAssigneeFinding#assignee': {
    shown: (value) => [`@${String(value)}`],
    why: 'the line names the assignee whose word closes the issue',
  },
  'mirror-pass.ts#MirrorPassLandingNoteFinding#sha': {
    shown: (value) => [`Landed in ${String(value)}`],
    why: 'the line names the landing commit it notes',
  },
  'mirror-pass.ts#MirrorPassStaleClaimFinding#assignee': {
    shown: (value) => [`@${String(value)}`],
    why: 'the line names the quiet claimant it frees the issue from',
  },
  'mirror-pass.ts#MirrorPassStaleClaimFinding#quietDays': {
    shown: (value) => [`quiet for ${String(value)} days`],
    why: 'the line says how long the claimant has been quiet',
  },
  'mirror-pass.ts#MirrorPassStaleClaimFinding#assigned': {
    shown: (value) => [value === false ? 'Releasing @' : 'Unassigning @'],
    why: 'the verb says whether an assignment is undone or a comment-only claim is released',
  },
  'mirror-pass-priority.ts#MirrorPassPriorityFollowFinding#priority': {
    shown: (value) => [
      `"${Object.keys(PRIORITY_LABEL_BAND).find((label) => PRIORITY_LABEL_BAND[label] === value) ?? `<no label for band ${String(value)}>`}"`,
    ],
    why: 'the band is the one its quoted priority label maps to, and the line quotes that label',
  },
  'issue-triage.ts#IssueTriageDuplicate#matchedTitle': {
    shown: (value) => [`"${String(value)}"`],
    why: 'the reasoning quotes the existing title the issue overlaps',
  },
  'issue-triage.ts#IssueTriageDuplicate#score': {
    shown: (value) => [`${Math.round(Number(value) * 100)}%`],
    why: 'the reasoning states the overlap as a whole percentage',
  },
  'issue-triage.ts#IssueTriageAccept#releasedFromHumansAfterDays': {
    shown: (value) => [`unclaimed for ${String(value)} days`],
    why: 'the reasoning says how long the good-first-issue reservation sat unclaimed',
  },
  'issue-triage.ts#IssueTriageAccept#dimension': {
    shown: (value) => [`"pool: ${String(value)}"`],
    why: 'the reasoning names the pool label it will set',
  },
  'issue-triage.ts#IssueTriageAccept#area': {
    shown: AS_TEXT,
    why: 'the reasoning names the area label it will set',
  },
  'issue-triage.ts#IssueTriageAccept#priority': {
    shown: AS_TEXT,
    why: 'the reasoning names the priority label it will set',
  },
  'issue-triage.ts#IssueTriageAccept#milestone': {
    shown: (value) => [`milestone "${String(value)}"`],
    why: 'the reasoning names the milestone it will set',
  },
  'issue-triage.ts#IssueTriageNeedsFormat#kind': {
    shown: (value) => [`the ${String(value)} template`],
    why: 'the reasoning names which template the body was filed off',
  },
  'issue-triage.ts#IssueTriageNeedsFormat#missing': {
    shown: (value) => (value as readonly string[]).map((heading) => `"${heading}"`),
    why: 'the reasoning quotes every missing template section',
  },
  'pr-review.ts#PrReviewCandidate#gateStatus': prFold(
    { gateStatus: 'fail' },
    (value) => [GATE_STATUS_PHRASES[String(value)] ?? `<no phrase for gate ${String(value)}>`],
    'the verdict says what the gate did; the pipeline strip shows the checks behind it',
  ),
  'pr-review.ts#PrReviewCandidate#touchedPathsUnassessed': prFlagFold(
    { touchedPathsUnassessed: true },
    'gh did not report a usable files list',
    'the verdict says the security sweep had no complete files list to check',
  ),
  'pr-review.ts#PrReviewCandidate#alreadyApplied': prFlagFold(
    { alreadyApplied: true },
    'its changes are already present in the current tree',
    'the verdict says the diff is already in the tree',
  ),
  'pr-review.ts#PrReviewCandidate#hasBinaryDiff': prFlagFold(
    { hasBinaryDiff: true },
    'its diff carries binary content',
    'the verdict says the diff carries bytes byte-review cannot read',
  ),
  'pr-review.ts#PrReviewCandidate#viewerIsAuthor': prFlagFold(
    { viewerIsAuthor: true },
    'was authored by the same GitHub identity this ritual reviews under',
    'the verdict says the PR is the reviewing identity’s own',
  ),
  'pr-review.ts#PrReviewCandidate#baseRefName': prFold(
    { baseRefName: 'develop' },
    (value) => [`merges into the '${String(value)}' branch`],
    'the verdict names the non-canonical base the PR merges into',
  ),
  'pr-review.ts#PrReviewCandidate#labelsUnassessed': prFlagFold(
    { labelsUnassessed: true },
    "gh's label report was unreadable",
    'the verdict says the hold-label sweep never ran',
  ),
  'pr-review.ts#PrReviewCandidate#reviewChangesRequested': prFlagFold(
    { reviewChangesRequested: true },
    'carries a standing changes-requested review from a reviewer other than this ritual',
    'the verdict says a human reviewer’s standing “not yet” holds it',
  ),
  'pr-review.ts#PrReviewCandidate#reviewChangesRequestedUnverified': prFlagFold(
    { reviewChangesRequestedUnverified: true },
    'the gh viewer lookup failed',
    'the verdict says whose standing review it is could not be verified',
  ),
  'pr-review.ts#PrReviewCandidate#latestReviewsUnassessed': prFlagFold(
    { latestReviewsUnassessed: true },
    "gh's latest-reviews report was unreadable",
    'the verdict says the changes-requested sweep never ran',
  ),
  'pr-review.ts#PrReviewCandidate#autoMergeArmed': prFlagFold(
    { autoMergeArmed: true },
    "has GitHub's own auto-merge armed",
    'the verdict says GitHub’s own auto-merge is armed',
  ),
  'pr-review.ts#PrReviewCandidate#conflictingPaths': prFold(
    { mergeable: false, conflictingPaths: ['docs/README.md', 'package.json'] },
    (value) => [`merge conflicts against the base branch in: ${EACH_AS_TEXT(value).join(', ')}`],
    'the verdict names every file to resolve',
  ),
  'pr-review.ts#PrReviewCandidate#renamedFromPaths': prFold(
    { renamedFromPaths: ['packages/engine/src/guard.ts'] },
    EACH_AS_TEXT,
    'the verdict names each guarded path a rename moved out of — the only renames that decide anything',
  ),
  'pr-review.ts#PrReviewCandidate#deletedTestPaths': prFold(
    { deletedTestPaths: ['apps/dashboard/test/flight/old.test.ts'] },
    EACH_AS_TEXT,
    'the verdict names every test file the PR deletes',
  ),
  'pr-review.ts#PrReviewCandidate#unresolvedReviewThreads': prFold(
    { unresolvedReviewThreads: 2 },
    (value) => [`carries ${String(value)} unresolved review thread(s)`],
    'the verdict counts the unresolved review threads',
  ),
};

/** A field the flight module consults only to DECIDE — which commands a
 *  verdict plans — with nothing a maintainer would read in it. Checked
 *  against BEHAVIOR like `IN_PAINTED_TEXT`: the honesty case runs the real
 *  planner with the field present and absent and requires the two outputs
 *  to differ, so a field nothing consults any more cannot shelter here
 *  (that is how the dead `PrReviewCandidate.ownComments` was caught, then
 *  removed from the fetch). Remove an entry the day the renderer reads the
 *  field. */
interface DecisionRead {
  readonly outputs: () => { readonly withField: unknown; readonly withoutField: unknown };
  readonly why: string;
}

const DECISION_ONLY: Readonly<Record<string, DecisionRead>> = {
  'pr-review.ts#PrReviewCandidate#ownRequestChangesBody': {
    outputs: () => {
      const red: PrReviewCandidate = { ...GREEN_PR, gateStatus: 'fail' };
      const decision = planPrReview(red);
      return {
        withField: planPrReviewCommands(
          { ...red, ownRequestChangesBody: decision.reasoning },
          decision,
        ),
        withoutField: planPrReviewCommands(red, decision),
      };
    },
    why:
      'a request-changes verdict the ritual’s own standing review already says verbatim plans no ' +
      're-post — a dedup key, not a fact about the PR',
  },
};

const TRIAGE_NOW = Date.parse('2026-09-27T00:00:00Z');
const DAY_MS = 86_400_000;
const CONFORMING_BUG_BODY =
  '### What happened?\nx\n### Steps to reproduce\nx\n### Expected behavior\nx';

/** One real `planIssueTriage` decision per `IssueTriageDecision` variant,
 *  each built so every optional field of its interface is present — the
 *  fixtures `IN_PAINTED_TEXT`'s honesty case reads the folded values from. */
function triageDecisionsByInterface(): Readonly<Record<string, IssueTriageDecision>> {
  const accept = planIssueTriage(
    {
      number: 7,
      title: 'Crash when the security scanner reads a symlink',
      body: CONFORMING_BUG_BODY,
      labels: ['good first issue'],
      createdAt: new Date(TRIAGE_NOW - 20 * DAY_MS).toISOString(),
    },
    [],
    [],
    undefined,
    TRIAGE_NOW,
    undefined,
    ['Foundations', 'V1', 'Hardening'],
  );
  const duplicate = planIssueTriage(
    { number: 8, title: 'Keyboard nav is broken in the fleet table', body: '' },
    [{ id: 'web-abc', title: 'Keyboard nav is broken in the fleet table view' }],
    [],
  );
  const needsFormat = planIssueTriage({ number: 9, title: 'Crash on startup', body: '' }, [], []);
  const dossier = planIssueTriage(
    { number: 10, title: 'Partner application', body: '', labels: ['partner-application'] },
    [],
    [],
  );
  const skip = planIssueTriage(
    { number: 11, title: 'Taken', body: '', assignees: ['octocat'] },
    [],
    [],
  );
  return {
    IssueTriageAccept: accept,
    IssueTriageDuplicate: duplicate,
    IssueTriageNeedsFormat: needsFormat,
    IssueTriageDossier: dossier,
    IssueTriageSkip: skip,
  };
}

/** A real payload and the text the panel paints for it. */
interface PaintedFixture {
  readonly payload: object | null;
  readonly painted: string;
}

type MirrorPassPreviews = Parameters<typeof mirrorPassItems>[0];

const NO_DRIFT = { versionDrift: null, countsDrift: null, linkDrift: null } as const;

/** `payload` and the lines the real client formatter paints for `previews`. */
function mirrorPassFixture(
  payload: object | null,
  previews: Partial<MirrorPassPreviews>,
): PaintedFixture {
  const items = mirrorPassItems({
    reconcile: null,
    landingNote: null,
    drift: null,
    staleClaims: null,
    ...previews,
  });
  return { payload, painted: items.map((item) => item.text).join('\n') };
}

/** One real planner finding per censused `MirrorPass*Finding`, each with
 *  every optional field present, painted through `mirrorPassItems` exactly
 *  as the MIRROR PASS panel paints it. */
function mirrorPassFixturesByInterface(): Readonly<Record<string, PaintedFixture>> {
  const done = { id: 'github-42', status: 'done', landedSha: 'abc1234' } as const;
  const notDone = { ...done, status: 'in_progress' } as const;
  const open = { number: 42, state: 'open' } as const;
  const closed = { number: 42, state: 'closed' } as const;
  const reconcile = (finding: ReturnType<typeof planMirrorPassReconcile>) =>
    mirrorPassFixture(finding, { reconcile: [{ finding }] });
  const close = planMirrorPassReconcile(done, open);
  const closeByAssignee = planMirrorPassReconcile(
    { ...done, doneVerified: false },
    { ...open, assignees: ['octocat'] },
    'octocat',
  );
  const unverified = planMirrorPassReconcile({ ...done, doneVerified: false }, open);
  const reopen = planMirrorPassReconcile(notDone, closed);
  const settle = planMirrorPassReconcile({ ...notDone, humanCloses: true }, closed);
  const landingNote = planMirrorPassLandingNote(done, closed, []);
  const staleClaim = planMirrorPassStaleClaimReaper(
    {
      number: 43,
      state: 'open',
      assignee: 'octocat',
      lastActivityAt: TRIAGE_NOW - 20 * DAY_MS,
      assigned: false,
    },
    TRIAGE_NOW,
  );
  const versionDrift = planMirrorPassVersionDrift('The current version **0.1.0**.', '0.55.0');
  const countsDrift = planMirrorPassCountsDrift('Built on 12 packages.', 34);
  const linkDrift = planMirrorPassLinkDrift(['docs/GONE.md'], () => false);
  const priorityFollow = planMirrorPassPriorityFollow(
    { id: 'github-44', status: 'queued', landedSha: null, priority: null, priorityPinned: false },
    { number: 44, state: 'open' },
    ['priority: high'],
  );
  return {
    MirrorPassCloseFinding: reconcile(close),
    MirrorPassCloseByAssigneeFinding: reconcile(closeByAssignee),
    MirrorPassUnverifiedFinding: reconcile(unverified),
    MirrorPassReopenFinding: reconcile(reopen),
    MirrorPassSettleFinding: reconcile(settle),
    MirrorPassLandingNoteFinding: mirrorPassFixture(landingNote, {
      landingNote: [{ finding: landingNote }],
    }),
    MirrorPassStaleClaimFinding: mirrorPassFixture(staleClaim, {
      staleClaims: [{ finding: staleClaim }],
    }),
    MirrorPassVersionDriftFinding: mirrorPassFixture(versionDrift, {
      drift: { ...NO_DRIFT, versionDrift },
    }),
    MirrorPassCountsDriftFinding: mirrorPassFixture(countsDrift, {
      drift: { ...NO_DRIFT, countsDrift },
    }),
    MirrorPassBrokenLinkFinding: mirrorPassFixture(linkDrift, {
      drift: { ...NO_DRIFT, linkDrift },
    }),
    MirrorPassPriorityFollowFinding: mirrorPassFixture(priorityFollow, {
      priorityFollow: [{ finding: priorityFollow }],
    }),
  };
}

/** Every interface `IN_PAINTED_TEXT` folds a field of, with its fixture: a
 *  triage decision paints its own `reasoning`; a mirror-pass finding paints
 *  the line the client formatter builds from it. */
function paintedFixturesByInterface(): Readonly<Record<string, PaintedFixture>> {
  const triage = Object.entries(triageDecisionsByInterface()).map(([interfaceName, decision]) => [
    interfaceName,
    { payload: decision, painted: decision.reasoning },
  ]);
  return { ...Object.fromEntries(triage), ...mirrorPassFixturesByInterface() };
}

function rendererPath(entry: PayloadInterface): string {
  return `web/features/${entry.renderer ?? entry.file}`;
}

/** The text of the top-level function `name` in `source`, from its
 *  `function` keyword to the first line that is a bare `}`. A missing
 *  function yields '', which fails the census closed. */
function functionSource(source: string, name: string): string {
  return new RegExp(`function ${escapeRegExp(name)}\\b[\\s\\S]*?\\n\\}`).exec(source)?.[0] ?? '';
}

function censusSources(entry: PayloadInterface) {
  const renderer = rendererSourceWithLocalImports(`${FEATURES_DIR}${entry.renderer ?? entry.file}`);
  return {
    flight: readFileSync(`${FLIGHT_DIR}${entry.file}`, 'utf8'),
    renderer: entry.formatter === undefined ? renderer : functionSource(renderer, entry.formatter),
  };
}

/** Top-level `readonly field: ...` / `readonly field?: ...` names declared
 *  directly on `interfaceName` in `source` — one level, no descent into
 *  nested object-literal types (no censused interface has one). */
function interfaceFields(source: string, interfaceName: string): readonly string[] {
  const pattern = new RegExp(`export interface ${interfaceName}[^{]*\\{([\\s\\S]*?)\\n\\}`);
  const match = pattern.exec(source);
  if (match === null || match[1] === undefined) return [];
  const fields: string[] = [];
  for (const fieldMatch of match[1].matchAll(/^\s*readonly (\w+)\??:/gm)) {
    const name = fieldMatch[1];
    if (name !== undefined) fields.push(name);
  }
  return fields;
}

describe('payload census matcher — a read counts only off the payload’s own receiver', () => {
  it('does not count a same-named field read off another object', () => {
    // The PR's own url kept `PrCheckRun.url` green with every `check.url` gone.
    expect(fieldIsRead("chip.setAttribute('href', plan.pr.url);", ['check', 'c'], 'url')).toBe(
      false,
    );
    // A DOM element's `id` kept `PublicityAffordance.id` green.
    expect(fieldIsRead('desc.id = descId;', ['affordance'], 'id')).toBe(false);
    // A longer path that merely ends in a receiver's name is not that receiver.
    expect(fieldIsRead('var u = plan.check.url;', ['check'], 'url')).toBe(false);
  });

  it('does not count a field named only in a comment', () => {
    // A doc comment kept `PoolIssue.claims` green with the ledger read gone.
    const source = stripComments(
      '/** paints `entry.claims` as the ledger */\n' +
        'var ledger = poolClaimLedgerText([]); // entry.claims was here\n',
    );
    expect(fieldIsRead(source, ['entry'], 'claims')).toBe(false);
  });

  it('counts a read off the payload’s own receiver, nested receiver paths included', () => {
    expect(
      fieldIsRead("if (check.url) chip.setAttribute('href', check.url);", ['check'], 'url'),
    ).toBe(true);
    expect(fieldIsRead("gating.filter((c) => c.state === 'pass')", ['check', 'c'], 'state')).toBe(
      true,
    );
    expect(fieldIsRead('el("a", "", entry.issue.title)', ['issue', 'entry.issue'], 'title')).toBe(
      true,
    );
    expect(fieldIsRead('var tip = affordance?.reasoning;', ['affordance'], 'reasoning')).toBe(true);
  });

  it('scopes a read to the one formatter that paints the payload', () => {
    const source =
      'export function reconcile(plans) {\n  return plans.map((p) => p.finding.comment);\n}\n' +
      'export function follow(plans) {\n  return plans.map((p) => p.finding.taskId);\n}\n';
    expect(fieldIsRead(functionSource(source, 'reconcile'), ['p.finding'], 'taskId')).toBe(false);
    expect(fieldIsRead(functionSource(source, 'follow'), ['p.finding'], 'taskId')).toBe(true);
    expect(functionSource(source, 'missing')).toBe('');
  });

  it('keeps the rest of a line after a URL literal when it strips comments', () => {
    expect(stripComments("a.href = 'https://github.com/' + check.url; // the log")).toContain(
      'check.url',
    );
  });
});

describe('payload census — every field of a censused display payload reaches its renderer', () => {
  it('finds every censused interface at the field-count the exclusion list expects', () => {
    for (const { file, interfaceName } of PAYLOAD_INTERFACES) {
      const source = readFileSync(`${FLIGHT_DIR}${file}`, 'utf8');
      const fields = interfaceFields(source, interfaceName);
      expect(
        fields.length,
        `${file}#${interfaceName}: interface not found or has no fields`,
      ).toBeGreaterThan(0);
    }
  });

  it('renders (or explicitly excuses) every field of each censused payload interface', () => {
    const offenders: string[] = [];
    for (const entry of PAYLOAD_INTERFACES) {
      const { flight, renderer } = censusSources(entry);
      for (const field of interfaceFields(flight, entry.interfaceName)) {
        const key = `${entry.file}#${entry.interfaceName}#${field}`;
        if (key in EXCUSED || key in IN_PAINTED_TEXT || key in DECISION_ONLY) continue;
        const derived = DERIVED[key];
        const readers = derived === undefined ? entry.receivers : derived.receivers;
        if (!fieldIsRead(renderer, readers, field)) {
          offenders.push(
            `${key}: fetched but ${rendererPath(entry)} never reads ${readers.join('|')}.${field} — ` +
              `fetched and discarded at the client boundary (or the renderer renamed its receiver: ` +
              `update receivers in PAYLOAD_INTERFACES)`,
          );
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('keeps the exclusion list honest — every excused field still exists and is still unread', () => {
    for (const [key, reason] of Object.entries(EXCUSED)) {
      expect(reason.length).toBeGreaterThan(0);
      const { entry, field } = censusedKey(key);
      const { flight, renderer } = censusSources(entry);
      expect(
        interfaceFields(flight, entry.interfaceName),
        `${key}: interface no longer declares this field — remove the exclusion`,
      ).toContain(field);
      expect(
        fieldIsRead(renderer, entry.receivers, field),
        `${key}: ${rendererPath(entry)} now reads this field — remove the exclusion`,
      ).toBe(false);
    }
  });

  it('keeps the derived-read list honest — each wrapper still carries the field it derives', () => {
    for (const [key, derived] of Object.entries(DERIVED)) {
      expect(derived.why.length, key).toBeGreaterThan(0);
      expect(key in EXCUSED, `${key}: both excused and derived`).toBe(false);
      expect(key in IN_PAINTED_TEXT, `${key}: both derived and painted as text`).toBe(false);
      const { entry, field } = censusedKey(key);
      const { flight, renderer } = censusSources(entry);
      expect(interfaceFields(flight, entry.interfaceName), key).toContain(field);
      expect(
        interfaceFields(flight, derived.via),
        `${key}: ${derived.via} no longer carries ${field} — the derivation this entry names is gone`,
      ).toContain(field);
      expect(
        fieldIsRead(renderer, entry.receivers, field),
        `${key}: ${rendererPath(entry)} now reads the raw field — remove the derived entry`,
      ).toBe(false);
    }
  });

  it('builds one real triage decision per censused IssueTriageDecision variant', () => {
    const decisions = triageDecisionsByInterface();
    expect(decisions['IssueTriageAccept']?.decision).toBe('accept');
    expect(decisions['IssueTriageDuplicate']?.decision).toBe('duplicate');
    expect(decisions['IssueTriageNeedsFormat']?.decision).toBe('needs-format');
    expect(decisions['IssueTriageDossier']?.decision).toBe('dossier');
    expect(decisions['IssueTriageSkip']?.decision).toBe('skip');
  });

  it('starts every PR fold from a PR the real planner merges, so each override is its own guard', () => {
    expect(planPrReview(GREEN_PR).decision).toBe('merge');
    for (const [key, fold] of Object.entries(IN_PAINTED_TEXT)) {
      if (!key.startsWith('pr-review.ts#PrReviewCandidate#')) continue;
      expect(fold.fixture, `${key}: a PR fold needs its own fixture`).toBeDefined();
      expect(planPrReview(fold.fixture?.().payload as PrReviewCandidate).decision, key).not.toBe(
        'merge',
      );
    }
  });

  it('keeps the decision-only list honest — each field still moves the real planner', () => {
    for (const [key, read] of Object.entries(DECISION_ONLY)) {
      expect(read.why.length, key).toBeGreaterThan(0);
      expect(
        key in EXCUSED || key in IN_PAINTED_TEXT || key in DERIVED,
        `${key}: adjudicated twice`,
      ).toBe(false);
      const { entry, field } = censusedKey(key);
      const { flight, renderer } = censusSources(entry);
      expect(interfaceFields(flight, entry.interfaceName), key).toContain(field);
      expect(
        fieldIsRead(renderer, entry.receivers, field),
        `${key}: ${rendererPath(entry)} now reads the field — remove the decision-only entry`,
      ).toBe(false);
      const { withField, withoutField } = read.outputs();
      expect(
        withField,
        `${key}: flipping ${field} no longer moves the planner — dead, not decision-only`,
      ).not.toEqual(withoutField);
    }
  });

  it('builds one real, painted finding per censused MirrorPass*Finding interface', () => {
    const fixtures = mirrorPassFixturesByInterface();
    for (const entry of MIRROR_PASS_PAYLOADS) {
      const { interfaceName } = entry;
      // The one `action` literal the interface itself declares.
      const tag = new RegExp(
        `export interface ${interfaceName}\\b[^{]*\\{\\s*readonly action: '([^']+)'`,
      ).exec(censusSources(entry).flight)?.[1];
      expect(tag, `${interfaceName}: no action tag declared`).toBeDefined();
      expect(fixtures[interfaceName]?.payload, interfaceName).toHaveProperty('action', tag);
      expect(fixtures[interfaceName]?.painted.split('\n'), interfaceName).toHaveLength(1);
    }
  });

  it('keeps the painted-text list honest — the real planner and formatter still show each field', () => {
    const fixtures = paintedFixturesByInterface();
    for (const [key, fold] of Object.entries(IN_PAINTED_TEXT)) {
      expect(fold.why.length, key).toBeGreaterThan(0);
      expect(key in EXCUSED, `${key}: both excused and folded into painted text`).toBe(false);
      const { entry, field } = censusedKey(key);
      const { flight, renderer } = censusSources(entry);
      expect(interfaceFields(flight, entry.interfaceName), key).toContain(field);
      expect(
        fieldIsRead(renderer, entry.receivers, field),
        `${key}: ${rendererPath(entry)} now reads the raw field — remove the painted-text entry`,
      ).toBe(false);
      const fixture = fold.fixture?.() ?? fixtures[entry.interfaceName];
      expect(fixture, `${key}: no fixture for ${entry.interfaceName}`).toBeDefined();
      const payload = fixture?.payload as Readonly<Record<string, unknown>> | null | undefined;
      expect(payload, `${key}: the fixture payload does not carry ${field}`).toHaveProperty(field);
      for (const text of fold.shown(payload?.[field])) {
        expect(
          fixture?.painted,
          `${key}: the painted text no longer shows ${field} — it no longer reaches the panel`,
        ).toContain(text);
      }
    }
  });
});

/** The censused interface and field a `${file}#${interfaceName}#${field}`
 *  key names — failing the test when the key is malformed or its interface
 *  is not in `PAYLOAD_INTERFACES`. */
function censusedKey(key: string): { readonly entry: PayloadInterface; readonly field: string } {
  const [file, interfaceName, field] = key.split('#');
  const entry = PAYLOAD_INTERFACES.find(
    (candidate) => candidate.file === file && candidate.interfaceName === interfaceName,
  );
  expect(entry, `${key}: ${interfaceName} is not in PAYLOAD_INTERFACES`).toBeDefined();
  expect(field, key).toBeDefined();
  return { entry: entry as PayloadInterface, field: field as string };
}
