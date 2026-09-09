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
 * across all states — the same evidence a later dedup slice needs before it
 * can tell a genuine new finding from something this identity already said.
 * Comment-level inventory (the finer-grained half `ownComments` already
 * gives `pr-review.ts` for its own PRs) is a follow-up slice: `gh` has no
 * single "list my comments across the repo" read the way it has `issue
 * list --author`/`pr list --author`, and synthesizing one (paging every
 * issue/PR's comment list) is real scope of its own, not "core".
 *
 * The protocol engine ({@link planSocialProtocol}) is the epic's law 4 made
 * mechanical: candidate actions are admitted in order up to each kind's cap,
 * then queued — never dropped, never forced through over the cap. A caller
 * (a later slice) supplies the candidates (from mirror-pass findings,
 * issue-triage answers, etc.) and the caps (visible in the flight log, per
 * the law's own wording); this module never invents either.
 */

import type { CliExec } from '../connection/cli-probe.js';
import { ghExec } from './gh-exec.js';
import { fetchRepoIdentity } from './publicity.js';
import { fetchViewerLogin } from './pr-review.js';

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

/** Fetches one kind of submission (`gh issue list`/`gh pr list --author
 *  <login> --state all`) and parses it into {@link SocialSubmission}s.
 *  Fails closed to an empty list on a non-zero exit, unparseable stdout, a
 *  non-array payload, or an entry missing a required field — a submission
 *  this call cannot read is simply absent from the inventory, never a
 *  crash, the same shape `publicity.ts`'s `fetchRepoIdentity` and
 *  `pr-review.ts`'s `fetchViewerLogin` already fail closed with. */
async function fetchSubmissionsOfKind(
  exec: CliExec,
  kind: SocialSubmissionKind,
  login: string,
): Promise<readonly SocialSubmission[]> {
  const { code, stdout } = await exec('gh', [
    SUBMISSION_NOUN[kind],
    'list',
    '--author',
    login,
    '--state',
    'all',
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

/** Composes {@link resolveSocialIdentity} and {@link fetchOwnSubmissions}
 *  behind one call — the injectable-`exec`-with-a-real-default seam
 *  `publicity.ts`'s `createPublicityPreviewApi` and `pr-review.ts`'s
 *  `fetchOpenPrCandidateReport` already establish. An unresolved identity
 *  skips the submissions read entirely (there is no login to inventory
 *  against) rather than issuing a doomed `gh ... --author undefined` call. */
export interface SocialPassReport {
  readonly identity: SocialIdentity | undefined;
  readonly ownSubmissions: readonly SocialSubmission[];
}

export async function fetchSocialPassReport(exec: CliExec = ghExec): Promise<SocialPassReport> {
  const identity = await resolveSocialIdentity(exec);
  const ownSubmissions =
    identity === undefined ? [] : await fetchOwnSubmissions(exec, identity.login);
  return { identity, ownSubmissions };
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
 *  wait for a human or a later pass — never dropped, never forced through. */
export interface SocialProtocolVerdict {
  readonly allowed: readonly SocialCandidateAction[];
  readonly queued: readonly SocialCandidateAction[];
}

/** Admits `candidates` into `allowed` in order, per kind, up to `caps`' cap
 *  for that kind — first-come-first-admitted within a pass, matching the
 *  order the caller proposed them in. Pure: no I/O, no randomness, so a
 *  cap-overflow scenario is deterministically reproducible in a test, the
 *  epic's own slice 6 red-team requirement ("cap overflow" fixture). */
export function planSocialProtocol(
  candidates: readonly SocialCandidateAction[],
  caps: SocialProtocolCaps,
): SocialProtocolVerdict {
  const allowed: SocialCandidateAction[] = [];
  const queued: SocialCandidateAction[] = [];
  let newIssueCount = 0;
  let commentCount = 0;
  for (const candidate of candidates) {
    if (candidate.kind === 'new-issue') {
      if (newIssueCount < caps.maxNewIssues) {
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
  return { allowed, queued };
}
