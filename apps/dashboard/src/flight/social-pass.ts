// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Social Flight's core (epic 0016 "The GitHub Social Flight", slice 1/6
 * — board web-mtpzzx23-n1kqv0): gh identity + role resolve, own-submissions
 * inventory, and a protocol engine enforcing the epic's "Budgeted voice" law
 * (hard caps per pass; exceeding a cap queues for a human rather than
 * spraying). Pure planner + injectable executor, the same `CliExec` seam
 * `publicity.ts`'s `fetchRepoIdentity`/`createPublicityPreviewApi` and
 * `pr-review.ts`'s `fetchViewerLogin`/`fetchOpenPrCandidateReport` already
 * use — {@link resolveSocialIdentity} composes those two existing reads
 * rather than re-resolving `gh api user`/`gh repo view` a second way.
 *
 * Role honesty (the epic's law 5) is decided here, once: the viewer IS the
 * repo owner (case-insensitive login vs `nameWithOwner`'s owner segment) ⇒
 * `'maintainer'`, acting with maintainer verbs; otherwise `'user'`, acting
 * only as themselves. Every later slice (mirror-pass core, weave-in,
 * standalone, tests) reads this one verdict rather than re-deriving role
 * from scratch.
 *
 * Own-submissions inventory ({@link fetchOwnSubmissions}) is the "know what
 * is already ours" law (2): issues and PRs authored by the resolved login,
 * across all states — one of the two evidence sources {@link
 * planSocialProtocol} dedups `'new-issue'` candidates against below.
 * Comment-level inventory (the finer-grained half `ownComments` already
 * gives `pr-review.ts` for its own PRs) is a follow-up slice: `gh` has no
 * single "list my comments across the repo" read the way it has `issue list
 * --author`/`pr list --author`, and synthesizing one (paging every
 * issue/PR's comment list) is real scope of its own, not "core".
 *
 * Open-threads inventory ({@link fetchOpenThreads}) is the slice's other
 * named inventory: every currently open issue and PR in the repo, by
 * ANYONE — not filtered to the resolved identity, and needs no identity to
 * fetch. Law 1, "search before you speak", is broader than law 2's "already
 * ours": a candidate duplicating a still-open finding someone else already
 * filed is exactly as much "already said" as duplicating our own, so it
 * feeds the same dedup corpus as {@link fetchOwnSubmissions}.
 *
 * The protocol engine ({@link planSocialProtocol}) is the epic's law 4 made
 * mechanical: candidate actions are admitted in order up to each kind's cap,
 * then queued — never dropped, never forced through over the cap. It also
 * enforces law 1: a `'new-issue'` candidate whose title matches an issue
 * title drawn from EITHER inventory (via `anti-flood.ts`'s same word-Jaccard
 * similarity) is diverted to `duplicate` before the cap is even checked —
 * never a duplicate, never counted against budget it was never going to
 * spend. A caller (a later slice) supplies the candidates (from mirror-pass
 * findings, issue-triage answers, etc.) and the caps (visible in the flight
 * log, per the law's own wording); this module never invents either.
 */

import type { CliExec } from '../connection/cli-probe.js';
import { ghExec } from './gh-exec.js';
import { fetchRepoIdentity } from './publicity.js';
import { fetchViewerLogin } from './pr-review.js';
import {
  commentSimilarity,
  normalizeCommentText,
  FLOOD_DUPLICATE_RATIO,
  MIN_COMPARE_LENGTH,
} from './anti-flood.js';

/** `'maintainer'` when the resolved identity owns the flown repo (acts with
 *  maintainer verbs — label, triage, answer authoritatively); `'user'`
 *  otherwise (acts only as themselves) — the epic's law 5, "role honesty". */
export type SocialRole = 'maintainer' | 'user';

/** The resolved GitHub identity a social pass acts as, plus the role that
 *  identity earns on THIS repo. */
export interface SocialIdentity {
  readonly login: string;
  readonly nameWithOwner: string;
  readonly role: SocialRole;
}

/** Resolves the acting identity and its role by composing two existing,
 *  independently-tested reads — `pr-review.ts`'s {@link fetchViewerLogin}
 *  (`gh api user`) and `publicity.ts`'s {@link fetchRepoIdentity} (`gh repo
 *  view`) — run concurrently since neither depends on the other. `undefined`
 *  when either read fails to resolve: an unknown login or an unknown repo
 *  owner both leave role undecidable, and a social pass must never guess at
 *  its own identity or verb set. Role is decided by comparing the login
 *  against `nameWithOwner`'s owner segment case-insensitively — GitHub
 *  logins are case-insensitive, and `nameWithOwner` may report either
 *  case for the same account. */
export async function resolveSocialIdentity(exec: CliExec): Promise<SocialIdentity | undefined> {
  const [login, repo] = await Promise.all([fetchViewerLogin(exec), fetchRepoIdentity(exec)]);
  if (login === undefined || repo === undefined) return undefined;
  const ownerSegment = repo.nameWithOwner.split('/')[0];
  const role: SocialRole =
    ownerSegment !== undefined && ownerSegment.toLowerCase() === login.toLowerCase()
      ? 'maintainer'
      : 'user';
  return { login, nameWithOwner: repo.nameWithOwner, role };
}

/** The role-gated dashboard's identity read (`GET /api/social-identity`,
 *  epic 0019 "GitHub steward" law 1 extended to the UI — board
 *  `web-mtt3f7j6-3bj899`) — composes {@link resolveSocialIdentity} behind
 *  one call, the same injectable-exec-with-a-real-default seam
 *  `publicity.ts`'s `createPublicityPreviewApi` uses. */
export type SocialIdentityApi = () => Promise<SocialIdentity | undefined>;

/** Builds the social identity read, defaulting to the real `gh` CLI like
 *  {@link fetchSocialPassReport} does. Never rejects: a thrown `exec`
 *  failure degrades to `undefined` (unresolved identity) rather than
 *  crashing the route — the client already treats an unresolved identity as
 *  "not a maintainer", so the fail-closed default here is also the
 *  fail-safe one for the endpoint. */
export function createSocialIdentityApi(exec: CliExec = ghExec): SocialIdentityApi {
  return async () => {
    try {
      return await resolveSocialIdentity(exec);
    } catch {
      return undefined;
    }
  };
}

/** The two submission kinds `gh`'s `--author` filter can enumerate
 *  end-to-end today (see this module's own doc comment for why comments
 *  are a follow-up slice, not covered here). */
export type SocialSubmissionKind = 'issue' | 'pr';

/** One thing the resolved identity has already submitted to this repo —
 *  the "know what is already ours" evidence (epic law 2). */
export interface SocialSubmission {
  readonly kind: SocialSubmissionKind;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: string;
}

const SUBMISSION_NOUN: Record<SocialSubmissionKind, 'issue' | 'pr'> = { issue: 'issue', pr: 'pr' };

/** Fetches one kind of submission via `gh issue|pr list <extraArgs> --json
 *  number,title,url,state` and parses it into {@link SocialSubmission}s.
 *  Fails closed to an empty list on a non-zero exit, unparseable stdout, a
 *  non-array payload, or an entry missing a required field — a submission
 *  this call cannot read is simply absent from the inventory, never a
 *  crash, the same shape `publicity.ts`'s `fetchRepoIdentity` and
 *  `pr-review.ts`'s `fetchViewerLogin` already fail closed with. Shared by
 *  {@link fetchSubmissionsOfKind} (own, any state) and {@link
 *  fetchOpenThreadsOfKind} (anyone's, open only) — the two inventories the
 *  epic's slice-1 DoD names, differing only in which `gh` filter flags they
 *  pass. */
async function fetchSubmissionList(
  exec: CliExec,
  kind: SocialSubmissionKind,
  extraArgs: readonly string[],
): Promise<readonly SocialSubmission[]> {
  const { code, stdout } = await exec('gh', [
    SUBMISSION_NOUN[kind],
    'list',
    ...extraArgs,
    '--json',
    'number,title,url,state',
  ]);
  if (code !== 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const submissions: SocialSubmission[] = [];
  for (const raw of parsed) {
    if (typeof raw !== 'object' || raw === null) continue;
    const entry = raw as { number?: unknown; title?: unknown; url?: unknown; state?: unknown };
    if (
      typeof entry.number !== 'number' ||
      typeof entry.title !== 'string' ||
      typeof entry.url !== 'string' ||
      typeof entry.state !== 'string' ||
      entry.url === '' ||
      entry.state === ''
    ) {
      continue;
    }
    submissions.push({
      kind,
      number: entry.number,
      title: entry.title,
      url: entry.url,
      state: entry.state,
    });
  }
  return submissions;
}

function fetchSubmissionsOfKind(
  exec: CliExec,
  kind: SocialSubmissionKind,
  login: string,
): Promise<readonly SocialSubmission[]> {
  return fetchSubmissionList(exec, kind, ['--author', login, '--state', 'all']);
}

function fetchOpenThreadsOfKind(
  exec: CliExec,
  kind: SocialSubmissionKind,
): Promise<readonly SocialSubmission[]> {
  return fetchSubmissionList(exec, kind, ['--state', 'open']);
}

/** The resolved identity's full own-submissions inventory: every issue and
 *  PR it authored on this repo, any state, issues before PRs. Runs both
 *  `gh` reads concurrently — neither depends on the other's result. */
export async function fetchOwnSubmissions(
  exec: CliExec,
  login: string,
): Promise<readonly SocialSubmission[]> {
  const [issues, prs] = await Promise.all([
    fetchSubmissionsOfKind(exec, 'issue', login),
    fetchSubmissionsOfKind(exec, 'pr', login),
  ]);
  return [...issues, ...prs];
}

/** The repo's open-threads inventory — every currently open issue and PR,
 *  by ANYONE, not just the resolved identity. The epic's law 1 ("search
 *  before you speak") reaches wider than "know what is already ours" (law
 *  2, {@link fetchOwnSubmissions}): a candidate must not duplicate a still-
 *  open finding someone else already filed either. Needs no identity at
 *  all — unlike {@link fetchOwnSubmissions} it never depends on a resolved
 *  login, so a caller can fetch it even when {@link resolveSocialIdentity}
 *  came back `undefined`. Runs both `gh` reads concurrently, issues before
 *  PRs, the same shape {@link fetchOwnSubmissions} takes. */
export async function fetchOpenThreads(exec: CliExec): Promise<readonly SocialSubmission[]> {
  const [issues, prs] = await Promise.all([
    fetchOpenThreadsOfKind(exec, 'issue'),
    fetchOpenThreadsOfKind(exec, 'pr'),
  ]);
  return [...issues, ...prs];
}

/** Composes {@link resolveSocialIdentity}, {@link fetchOwnSubmissions}, and
 *  {@link fetchOpenThreads} behind one call — the injectable-`exec`-with-a-
 *  real-default seam `publicity.ts`'s `createPublicityPreviewApi` and
 *  `pr-review.ts`'s `fetchOpenPrCandidateReport` already establish. An
 *  unresolved identity skips the own-submissions read entirely (there is no
 *  login to inventory against) rather than issuing a doomed `gh ... --author
 *  undefined` call; the open-threads read has no such dependency and always
 *  runs. */
export interface SocialPassReport {
  readonly identity: SocialIdentity | undefined;
  readonly ownSubmissions: readonly SocialSubmission[];
  readonly openThreads: readonly SocialSubmission[];
}

export async function fetchSocialPassReport(exec: CliExec = ghExec): Promise<SocialPassReport> {
  const [identity, openThreads] = await Promise.all([
    resolveSocialIdentity(exec),
    fetchOpenThreads(exec),
  ]);
  const ownSubmissions =
    identity === undefined ? [] : await fetchOwnSubmissions(exec, identity.login);
  return { identity, ownSubmissions, openThreads };
}

/** A kind of voice the protocol engine budgets separately — the epic's own
 *  examples ("≤N new issues, ≤M comments"), each with its own cap. */
export type SocialCandidateActionKind = 'new-issue' | 'comment';

/** One candidate action a later slice (mirror-pass findings, issue-triage
 *  answers, etc.) proposes for this pass, before the protocol engine
 *  decides whether it fits this pass's budget. */
export interface SocialCandidateAction {
  readonly kind: SocialCandidateActionKind;
  readonly reasoning: string;
  /** The exact title a `'new-issue'` candidate would open with — the
   *  protocol engine's own-submissions duplicate check (epic law 1, "search
   *  before you speak") reads this to decide whether it is already ours.
   *  Unused for `'comment'` candidates; a `'new-issue'` candidate that omits
   *  it simply skips the duplicate check rather than failing closed, since
   *  an untitled candidate cannot be compared. */
  readonly title?: string;
  /** True when this candidate would use a maintainer-only verb — label,
   *  triage, answer authoritatively (epic law 5, "role honesty"). A
   *  candidate marked `true` is refused outright for a non-`'maintainer'`
   *  role, never merely queued: a user identity does not earn maintainer
   *  verbs by waiting for the next pass. Omitted (or `false`) for anything
   *  any role may say — most candidates. */
  readonly requiresMaintainer?: boolean;
  /** The exact text to post — a `'new-issue'` candidate's issue body, or a
   *  `'comment'` candidate's comment body. Deliberately separate from
   *  {@link reasoning}: `reasoning` is this candidate's own internal
   *  "why am I proposing this" record for the protocol engine and the flight
   *  log, not vetted as public-facing prose — {@link planSocialCommand}
   *  never falls back to it, so a candidate that omits `body` fails closed
   *  (builds no command) rather than risking an internal reasoning string
   *  landing in a public GitHub post. */
  readonly body?: string;
  /** The issue/PR number a `'comment'` candidate targets. Unused for
   *  `'new-issue'` (there is no target yet — creating it produces one).
   *  A `'comment'` candidate that omits this fails closed the same way an
   *  omitted `body` does. */
  readonly issueNumber?: number;
}

/** Per-pass hard caps for each budgeted voice kind — the epic's law 4,
 *  made an explicit input so the caller decides the numbers (and can log
 *  them, per the law's "caps visible in the flight log" wording) rather
 *  than this module hiding a constant nobody can see or tune per-pass. */
export interface SocialProtocolCaps {
  readonly maxNewIssues: number;
  readonly maxComments: number;
}

/** The protocol engine's verdict: `allowed` actions fit this pass's budget
 *  and may proceed; `queued` actions exceeded their kind's cap and must
 *  wait for a human or a later pass; `duplicate` actions matched something
 *  already submitted — by this identity, or already open from anyone else —
 *  and must never proceed at all — never dropped silently, never forced
 *  through, but also never re-said; `refused` actions demanded maintainer
 *  verbs the acting identity's role does not hold (epic law 5) — never
 *  allowed, never queued, since no amount of waiting earns a role the
 *  identity does not have. */
export interface SocialProtocolVerdict {
  readonly allowed: readonly SocialCandidateAction[];
  readonly queued: readonly SocialCandidateAction[];
  readonly duplicate: readonly SocialCandidateAction[];
  readonly refused: readonly SocialCandidateAction[];
}

/** A titled `'new-issue'` candidate counts as a duplicate when its title's
 *  word-level Jaccard similarity to an existing issue title — drawn from
 *  `existingIssueTitles`, the union of the identity's own submissions (law
 *  2, "know what is already ours") and every currently open thread (law 1,
 *  "search before you speak" reaches beyond just our own) — clears the same
 *  {@link FLOOD_DUPLICATE_RATIO} threshold `anti-flood.ts` uses for
 *  outgoing comments — one "is this the same thing said twice" bar for
 *  every outgoing voice this identity has, own or someone else's still-open
 *  finding alike. Titles shorter than {@link MIN_COMPARE_LENGTH} after
 *  normalizing are exempted, the same guard `judgeOutgoingComment` applies,
 *  since short text carries too little word-overlap signal to compare
 *  reliably. */
function isDuplicateOfExistingIssue(
  candidate: SocialCandidateAction,
  existingIssueTitles: readonly string[],
): boolean {
  if (candidate.title === undefined) return false;
  const normalized = normalizeCommentText(candidate.title);
  if (normalized.length < MIN_COMPARE_LENGTH) return false;
  return existingIssueTitles.some(
    (title) => commentSimilarity(normalized, title) >= FLOOD_DUPLICATE_RATIO,
  );
}

/** Admits `candidates` into `allowed` in order, per kind, up to `caps`' cap
 *  for that kind — first-come-first-admitted within a pass, matching the
 *  order the caller proposed them in. A candidate marked
 *  {@link SocialCandidateAction.requiresMaintainer} is refused outright when
 *  `role` isn't `'maintainer'` (epic law 5, "role honesty") before either
 *  the duplicate or cap check runs — a role mismatch is a boundary, not a
 *  budget question. A `'new-issue'` candidate that duplicates an issue title
 *  drawn from `ownSubmissions` OR `openThreads` (epic law 1, "search before
 *  you speak"; law 2, "know what is already ours") is diverted to
 *  `duplicate` before the cap is even considered — a duplicate never
 *  consumes budget, since it was never going to be said. Both default to
 *  empty for callers with nothing to dedup against yet; `role` defaults to
 *  the least-privileged `'user'` so a caller that forgets to pass it never
 *  accidentally admits a maintainer-only candidate. Pure: no I/O, no
 *  randomness, so a cap-overflow, a duplicate-issue temptation, and a
 *  role-confusion scenario are all deterministically reproducible in a
 *  test, the epic's own slice 6 red-team requirements. */
export function planSocialProtocol(
  candidates: readonly SocialCandidateAction[],
  caps: SocialProtocolCaps,
  ownSubmissions: readonly SocialSubmission[] = [],
  role: SocialRole = 'user',
  openThreads: readonly SocialSubmission[] = [],
): SocialProtocolVerdict {
  const existingIssueTitles = [...ownSubmissions, ...openThreads]
    .filter((submission) => submission.kind === 'issue')
    .map((submission) => normalizeCommentText(submission.title));

  const allowed: SocialCandidateAction[] = [];
  const queued: SocialCandidateAction[] = [];
  const duplicate: SocialCandidateAction[] = [];
  const refused: SocialCandidateAction[] = [];
  let newIssueCount = 0;
  let commentCount = 0;
  for (const candidate of candidates) {
    if (candidate.requiresMaintainer === true && role !== 'maintainer') {
      refused.push(candidate);
      continue;
    }
    if (candidate.kind === 'new-issue') {
      if (isDuplicateOfExistingIssue(candidate, existingIssueTitles)) {
        duplicate.push(candidate);
      } else if (newIssueCount < caps.maxNewIssues) {
        allowed.push(candidate);
        newIssueCount += 1;
      } else {
        queued.push(candidate);
      }
    } else {
      if (commentCount < caps.maxComments) {
        allowed.push(candidate);
        commentCount += 1;
      } else {
        queued.push(candidate);
      }
    }
  }
  return { allowed, queued, duplicate, refused };
}

/** One `gh` invocation an ALLOWED {@link SocialCandidateAction} compiles
 *  to — the same `{command: 'gh', args, details}` shape `pr-review.ts`'s
 *  `PrReviewCommand` and `issue-triage.ts`'s `IssueTriageCommand` already
 *  use, so {@link executeSocialCommands} is the same one-line `exec` loop
 *  as `executeIssueTriageCommands`. */
export interface SocialCommand {
  readonly command: 'gh';
  readonly args: readonly string[];
  readonly details: string;
}

/** Turns one ALLOWED candidate into the `gh` command that says it — the
 *  epic's "pure planner + injectable executor" DoD's planner half. Fails
 *  closed to `undefined` (builds nothing) rather than guessing when a
 *  candidate lacks the field its kind needs to actually post: a
 *  `'new-issue'` candidate needs both {@link SocialCandidateAction.title}
 *  and {@link SocialCandidateAction.body}; a `'comment'` candidate needs
 *  both {@link SocialCandidateAction.issueNumber} and `body`. A caller is
 *  expected to only ever pass candidates from {@link
 *  SocialProtocolVerdict.allowed} — this makes no verdict of its own, it
 *  only asks "is there enough here to post," never "should this post." */
export function planSocialCommand(candidate: SocialCandidateAction): SocialCommand | undefined {
  if (candidate.body === undefined) return undefined;
  if (candidate.kind === 'new-issue') {
    if (candidate.title === undefined) return undefined;
    return {
      command: 'gh',
      args: ['issue', 'create', '--title', candidate.title, '--body', candidate.body],
      details: `gh issue create — "${candidate.title}"`,
    };
  }
  if (candidate.issueNumber === undefined) return undefined;
  return {
    command: 'gh',
    args: ['issue', 'comment', String(candidate.issueNumber), '--body', candidate.body],
    details: `gh issue comment — posting on #${candidate.issueNumber}`,
  };
}

/** Compiles every ALLOWED candidate into its {@link SocialCommand}, in
 *  order, silently dropping any {@link planSocialCommand} could not build
 *  a command for — the fail-closed candidate simply posts nothing, the
 *  same "absent, never a crash" convention {@link fetchSubmissionList}
 *  already uses for a submission it cannot parse. Pure: no I/O. */
export function planSocialCommands(
  allowed: readonly SocialCandidateAction[],
): readonly SocialCommand[] {
  const commands: SocialCommand[] = [];
  for (const candidate of allowed) {
    const command = planSocialCommand(candidate);
    if (command !== undefined) commands.push(command);
  }
  return commands;
}

/** One {@link SocialCommand} run to completion — paired back with the
 *  command it came from, the same shape `PrReviewCommandResult` and
 *  `IssueTriageCommandResult` already take. */
export interface SocialCommandResult {
  readonly command: SocialCommand;
  readonly code: number;
  readonly stdout: string;
}

/** Runs every {@link SocialCommand} through the injectable `exec` — the
 *  epic's "pure planner + injectable executor" DoD's executor half, the
 *  write-side counterpart to {@link fetchSocialPassReport}'s read wiring.
 *  Unlike `pr-review.ts`'s `executePrReviewCommands` (which stops at the
 *  first failure because an approve-then-merge pair is a real dependency),
 *  every social command here is independent — one candidate's issue-create
 *  failing has no bearing on the next candidate's comment — so this runs
 *  the full list and continues past a failure, the same convention
 *  `issue-triage.ts`'s `executeIssueTriageCommands` already uses for its
 *  own independent per-issue commands. Never called autonomously: like
 *  every other write path in this file's sibling rituals, a caller wires
 *  this in only behind a confirm-guarded HTTP endpoint. */
export async function executeSocialCommands(
  commands: readonly SocialCommand[],
  exec: CliExec,
): Promise<readonly SocialCommandResult[]> {
  const results: SocialCommandResult[] = [];
  for (const command of commands) {
    const { code, stdout } = await exec(command.command, command.args);
    results.push({ command, code, stdout });
  }
  return results;
}
