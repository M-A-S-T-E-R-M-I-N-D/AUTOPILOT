// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * KEEPER Discussions triage ritual (BOARD web-mtlsiac0-v8rksh; docs/epics/0007-
 * platform-maintainer-and-pool.md S8) — the narrowed FIRST SLICE a 2026-09-04
 * feasibility pass scoped after finding `issue-triage.ts`'s four layers (pure
 * decision core → `gh` argv planner → injectable-`CliExec` read/write wiring →
 * CSRF-guarded preview/execute HTTP pair → operator panel) entirely
 * issue-specific: `gh` ships no `discussion` subcommand at all, so both the
 * read query and the eventual reply mutation must be hand-rolled GraphQL
 * against opaque node IDs rather than simple issue numbers. This slice ships
 * the pure decision core — {@link planDiscussionTriage}, mirroring
 * `issue-triage.ts`'s {@link classifyIssueDimension}-driven classification —
 * its read wiring, {@link fetchOpenDiscussions}, through the same injectable
 * `CliExec` `connection/cli-probe.ts` uses, and now {@link
 * draftDiscussionReply}: pure reply-TEXT composition (no `gh`/GraphQL call)
 * for an accepted decision, signed per docs/ATTRIBUTION.md §3's binding
 * conversational-message format — and now {@link postDiscussionReply}, the
 * `addDiscussionComment` GraphQL mutation itself, the write-side counterpart
 * to {@link fetchOpenDiscussions}'s read, same hand-rolled `gh api graphql`
 * shape since `gh` ships no `discussion` subcommand — and now {@link
 * planDiscussionTriageBatch}, the connective tissue mirroring
 * `issue-triage.ts`'s {@link planIssueTriageBatch}: runs the decision core
 * then the reply draft over a whole fetched batch, pairing each discussion
 * with the `null` draft a `'skip'` gets or the real one an `'accept'` gets —
 * and now {@link fetchDiscussionLabelId} + {@link applyDiscussionPoolLabel},
 * the idempotency marker this header once flagged as missing: GitHub
 * Discussions labels are GraphQL-only (`addLabelsToLabelable`, keyed by
 * opaque label node IDs, never names, unlike `issue-triage.ts`'s
 * name-addressed `gh issue edit --add-label`), so applying one takes its own
 * label-ID lookup first — and now {@link runDiscussionTriageRitual}, the
 * post-reply-then-label sequencing composer mirroring `issue-triage.ts`'s own
 * {@link runIssueTriageRitual}: fetch, plan the batch, then for every
 * accepted plan post the reply first and only label on a successful post —
 * unlike `issue-triage.ts`'s `executeIssueTriageCommands`, which always runs
 * every command even after an earlier one fails, a discussion's label IS the
 * idempotency marker a re-run's {@link planDiscussionTriage} checks, so
 * labeling after a failed post would mark a discussion "handled" that never
 * actually got a reply — silently losing it to every future pass. Nothing in
 * this codebase calls {@link runDiscussionTriageRitual} yet — same
 * deferred-caller stance `issue-triage.ts`'s own `runIssueTriageRitual` held
 * before its HTTP wiring landed. Still missing before this ritual is
 * reachable: the CSRF-guarded preview/execute HTTP endpoints and the
 * operator panel — the same staged-rollout shape `issue-triage.ts` itself
 * used before `issue-triage-execute.ts` + `issue-triage-panel.ts` landed.
 */

import { type Dimension } from '@autopilot/store';
import type { CliExec } from '../connection/cli-probe.js';
import { classifyIssueDimension, parseIssueLabels, POOL_LABEL_PREFIX } from './issue-triage.js';

/** The subset of a GitHub Discussion this policy needs — title/body/category
 *  plus the two states (`isAnswered`, `locked`) that decide whether a reply
 *  is even wanted, never trusted as anything but data to classify. `labels`
 *  is optional so pure-planning callers need not fabricate it; {@link
 *  fetchOpenDiscussions} always populates it, and {@link planDiscussionTriage}
 *  reads it to keep re-runs idempotent (an already `pool: *`-labeled
 *  discussion plans a `'skip'`), the same convention `issue-triage.ts`'s
 *  {@link IncomingIssue} uses for `labels`. */
export interface IncomingDiscussion {
  /** The discussion's opaque GraphQL node ID — what {@link
   *  postDiscussionReply}'s `addDiscussionComment` mutation actually targets;
   *  `gh` has no `discussion` subcommand to address one by its human-facing
   *  `number` the way `gh issue comment <number>` can. */
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
  /** The discussion category's name (e.g. "Q&A", "Ideas", "Show and tell") —
   *  informational only; classification itself still runs off title/body
   *  text via {@link classifyIssueDimension}. */
  readonly category: string;
  /** `true` only once a human has chosen an answer (GitHub's Q&A-category
   *  feature) — `null`/`false` both mean "not yet answered", including every
   *  non-Q&A category, where this field is always `null`. */
  readonly isAnswered: boolean;
  /** A locked discussion accepts no new comments — GitHub itself would
   *  reject a reply, so {@link planDiscussionTriage} must never plan one. */
  readonly locked: boolean;
  readonly labels?: readonly string[];
}

export interface DiscussionTriageAccept {
  readonly decision: 'accept';
  readonly dimension: Dimension;
  readonly reasoning: string;
}

/** A discussion a previous KEEPER pass already handled, or one no reply
 *  could usefully reach — re-runs leave it untouched, mirroring `issue-
 *  triage.ts`'s own `'skip'` idempotency contract. */
export interface DiscussionTriageSkip {
  readonly decision: 'skip';
  readonly reasoning: string;
}

export type DiscussionTriageDecision = DiscussionTriageAccept | DiscussionTriageSkip;

/**
 * Decides what a KEEPER Discussions pass should do with one open discussion:
 * classifies it into a pool {@link Dimension} via {@link
 * classifyIssueDimension} over its title and body — the same deterministic,
 * operator-overridable keyword scoring `issue-triage.ts` already trusts, so a
 * discussion and an issue reporting the same concern land in the same pool.
 * A locked discussion plans `'skip'` first — GitHub would reject any reply
 * regardless of classification. An already-answered discussion (a human
 * chose an answer) plans `'skip'` next — no autopilot reply is owed once a
 * human's answer already satisfies the asker. A discussion already carrying
 * a `pool: *` label from a previous pass plans `'skip'` last, the same
 * idempotency marker {@link POOL_LABEL_PREFIX} gives issues, reused here
 * since Discussions share the same repo label set. Pure: never fetches or
 * replies — a caller wires those once this decision is made, and no reply
 * text is drafted here either; that is deferred to a follow-on slice.
 */
export function planDiscussionTriage(discussion: IncomingDiscussion): DiscussionTriageDecision {
  if (discussion.locked) {
    return {
      decision: 'skip',
      reasoning:
        `#${discussion.number} "${discussion.title}" is locked — GitHub accepts no new comments ` +
        'on it, so no reply can be planned.',
    };
  }

  if (discussion.isAnswered) {
    return {
      decision: 'skip',
      reasoning:
        `#${discussion.number} "${discussion.title}" already has a human-chosen answer — no ` +
        'autopilot reply is owed once the asker already has a satisfying answer.',
    };
  }

  const labels = discussion.labels ?? [];
  const poolLabel = labels.find((label) => label.startsWith(POOL_LABEL_PREFIX));
  if (poolLabel) {
    return {
      decision: 'skip',
      reasoning:
        `#${discussion.number} "${discussion.title}" already carries "${poolLabel}" from a ` +
        'previous KEEPER pass — skipping so re-runs stay idempotent.',
    };
  }

  const dimension = classifyIssueDimension(`${discussion.title} ${discussion.body}`);
  return {
    decision: 'accept',
    dimension,
    reasoning:
      `#${discussion.number} "${discussion.title}" (${discussion.category}) has no chosen ` +
      `answer yet — classifying as "pool: ${dimension}" for a follow-on reply pass.`,
  };
}

/** The `— ✈️ AUTOPILOT agent, on behalf of @<operator> · [what is this?](…)`
 *  line docs/ATTRIBUTION.md §3 makes binding for every conversational
 *  message a pilot posts outside its own working tree — issue comment,
 *  review, or (named explicitly there) discussion. Composed, not resolved:
 *  the caller supplies the operator's own `gh` login (the identity a
 *  follow-on execute slice would actually post under, per that doc's
 *  Signing & DCO section) so this stays pure, the same decide-don't-fetch
 *  split {@link planDiscussionTriage} already keeps. */
function attributionSignature(operatorLogin: string): string {
  return (
    `— ✈️ AUTOPILOT agent, on behalf of @${operatorLogin} · ` +
    '[what is this?](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT)'
  );
}

/** A drafted reply, ready for {@link postDiscussionReply} to send — never
 *  posted by the function that builds this. */
export interface DiscussionReplyDraft {
  /** The discussion's node {@link IncomingDiscussion.id}, carried through so
   *  a caller never has to re-look-up the ID {@link postDiscussionReply}'s
   *  mutation targets — {@link discussionNumber} alone can't address it. */
  readonly discussionId: string;
  readonly discussionNumber: number;
  readonly dimension: Dimension;
  readonly body: string;
}

/**
 * Composes the reply text a follow-on execute slice would post on an
 * `'accept'`-decided discussion — pure text composition only: no `gh` call,
 * no GraphQL mutation, nothing sent anywhere. Reuses {@link
 * planDiscussionTriage}'s own `reasoning` as the substance (the same
 * decision-doubles-as-message convention `issue-triage.ts`'s
 * `planIssueTriageCommands` uses for its own comment body), then appends
 * {@link attributionSignature} so the eventual post is clearly identified as
 * autopilot the moment it lands — never drafted unsigned first and signed
 * later, which would let an unsigned draft ship if a future call site forgot
 * the signing step.
 */
export function draftDiscussionReply(
  discussion: IncomingDiscussion,
  decision: DiscussionTriageAccept,
  operatorLogin: string,
): DiscussionReplyDraft {
  return {
    discussionId: discussion.id,
    discussionNumber: discussion.number,
    dimension: decision.dimension,
    body: `${decision.reasoning}\n\n${attributionSignature(operatorLogin)}`,
  };
}

/** One discussion's full triage outcome — the decision {@link
 *  planDiscussionTriage} reached, paired with the reply {@link
 *  draftDiscussionReply} composed for it when accepted, or `null` for a
 *  `'skip'` decision (nothing to draft) — the same `decision`+derived-payload
 *  pairing `issue-triage.ts`'s {@link IssueTriagePlan} gives issue commands. */
export interface DiscussionTriagePlan {
  readonly discussion: IncomingDiscussion;
  readonly decision: DiscussionTriageDecision;
  readonly draft: DiscussionReplyDraft | null;
}

/**
 * Runs {@link planDiscussionTriage} then, for an `'accept'`ed decision, {@link
 * draftDiscussionReply} for every discussion in `discussions` — the
 * connective tissue between a batch fetch ({@link fetchOpenDiscussions}) and
 * a batch post (each accepted plan's `draft` handed to {@link
 * postDiscussionReply}), mirroring `issue-triage.ts`'s {@link
 * planIssueTriageBatch}. Pure: composes two already-pure functions, no I/O of
 * its own. Each discussion is judged independently, same as
 * `planIssueTriageBatch` — one discussion's decision never influences
 * another's in the same batch.
 */
export function planDiscussionTriageBatch(
  discussions: readonly IncomingDiscussion[],
  operatorLogin: string,
): readonly DiscussionTriagePlan[] {
  return discussions.map((discussion) => {
    const decision = planDiscussionTriage(discussion);
    const draft =
      decision.decision === 'accept'
        ? draftDiscussionReply(discussion, decision, operatorLogin)
        : null;
    return { discussion, decision, draft };
  });
}

/** How many open discussions one read spends its whole budget on — same
 *  window size `pr-review.ts`'s `MAX_PR_LIST_CANDIDATES` uses for its own
 *  single-page `gh api graphql` read. */
const MAX_DISCUSSION_CANDIDATES = 50;

/** The one `gh api graphql` read behind {@link fetchOpenDiscussions}: every
 *  OPEN discussion in a single spend, newest-created first, filtered
 *  server-side via `states: OPEN` — `gh`'s own Discussion GraphQL schema
 *  (confirmed live via introspection against this repo, 2026-09-10) exposes
 *  exactly this filter, the same way `pullRequests(states: OPEN, ...)` filters
 *  `pr-review.ts`'s own read. `$owner`/`$name` come from gh's own `{owner}`/
 *  `{repo}` placeholders, resolved from the process's cwd exactly as `gh pr
 *  list`/`gh issue list` resolve theirs. */
const OPEN_DISCUSSIONS_QUERY =
  'query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ' +
  `discussions(states: OPEN, first: ${MAX_DISCUSSION_CANDIDATES}, ` +
  'orderBy: {field: CREATED_AT, direction: DESC}) { nodes { id number title body isAnswered ' +
  'locked category { name } labels(first: 20) { nodes { name } } } } } }';

/** One discussion node as {@link OPEN_DISCUSSIONS_QUERY} returns it —
 *  untrusted process output, parsed defensively rather than trusted as
 *  already shaped like {@link IncomingDiscussion}. */
interface RawDiscussionNode {
  readonly id?: unknown;
  readonly number?: unknown;
  readonly title?: unknown;
  readonly body?: unknown;
  readonly isAnswered?: unknown;
  readonly locked?: unknown;
  readonly category?: unknown;
  readonly labels?: unknown;
}

/** `gh`'s `category` field is a single `{ name, ... }` object (same shape
 *  convention `issue-triage.ts`'s `parseAuthorLogin` reduces `author` from)
 *  — reduced to just the name string, or `''` when missing/malformed so a
 *  malformed category never breaks classification (only ever informational
 *  in {@link planDiscussionTriage}'s reasoning). */
function parseDiscussionCategory(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null) return '';
  const name = (raw as { name?: unknown }).name;
  return typeof name === 'string' ? name : '';
}

/** `gh`'s `labels` field on a Discussion is a `LabelConnection` (`{ nodes:
 *  [{ name, ... }] }`), unlike `gh issue list --json labels`'s bare array —
 *  unwrapped here then handed to `issue-triage.ts`'s {@link parseIssueLabels}
 *  to reuse its same defensive node-array reduction. */
function parseDiscussionLabels(raw: unknown): readonly string[] {
  if (typeof raw !== 'object' || raw === null) return [];
  return parseIssueLabels((raw as { nodes?: unknown }).nodes);
}

/**
 * Lists every OPEN discussion via one `gh api graphql` spend ({@link
 * OPEN_DISCUSSIONS_QUERY}), run through the injectable `exec` — the same
 * `CliExec` shape `connection/cli-probe.ts` uses, so this stays
 * deterministically testable without a real `gh` on PATH, mirroring `issue-
 * triage.ts`'s {@link fetchOpenIssues}. Read-only: never labels, comments, or
 * closes anything, only lists. Returns `[]` on a non-zero exit, unparseable
 * stdout, or a missing/malformed `data.repository.discussions.nodes` array
 * rather than throwing — a triage sweep finding nothing to review is a valid
 * outcome, and a flaky `gh` call shouldn't crash the ritual. Entries missing
 * a numeric `number`, string `title`, or string `id` are dropped rather than
 * passed through malformed — `id` matters as much as `number` here, since
 * {@link postDiscussionReply} addresses a discussion by that opaque node ID,
 * not its human-facing number.
 */
export async function fetchOpenDiscussions(exec: CliExec): Promise<IncomingDiscussion[]> {
  const { code, stdout } = await exec('gh', [
    'api',
    'graphql',
    '-F',
    'owner={owner}',
    '-F',
    'name={repo}',
    '-f',
    `query=${OPEN_DISCUSSIONS_QUERY}`,
  ]);
  if (code !== 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const nodes = (
    parsed as { data?: { repository?: { discussions?: { nodes?: unknown } | null } | null } | null }
  )?.data?.repository?.discussions?.nodes;
  if (!Array.isArray(nodes)) return [];

  return (nodes as readonly (RawDiscussionNode | null)[])
    .filter(
      (raw): raw is RawDiscussionNode =>
        raw !== null &&
        typeof raw.id === 'string' &&
        typeof raw.number === 'number' &&
        typeof raw.title === 'string',
    )
    .map((raw) => ({
      id: raw.id as string,
      number: raw.number as number,
      title: raw.title as string,
      body: typeof raw.body === 'string' ? raw.body : '',
      category: parseDiscussionCategory(raw.category),
      isAnswered: raw.isAnswered === true,
      locked: raw.locked === true,
      labels: parseDiscussionLabels(raw.labels),
    }));
}

/** The one `gh api graphql` mutation behind {@link postDiscussionReply} —
 *  GitHub's own Discussions GraphQL schema exposes `addDiscussionComment`
 *  taking `discussionId`/`body`, returning just the new comment's `id` since
 *  nothing here needs more than confirmation the post landed. `$discussionId`/
 *  `$body` are resolved the same way {@link OPEN_DISCUSSIONS_QUERY}'s
 *  `$owner`/`$name` are: matched against `-f`-supplied variables of the same
 *  name at the `gh api graphql` call site. */
const ADD_DISCUSSION_COMMENT_MUTATION =
  'mutation($discussionId: ID!, $body: String!) { addDiscussionComment(input: ' +
  '{discussionId: $discussionId, body: $body}) { comment { id } } }';

/** One {@link postDiscussionReply} call's outcome — the same `{code,
 *  stdout}` shape {@link CliExec} returns, paired back with the discussion
 *  number it was posted to, mirroring `issue-triage.ts`'s {@link
 *  IssueTriageCommandResult} write-side convention. */
export interface DiscussionReplyPostResult {
  readonly discussionNumber: number;
  readonly code: number;
  readonly stdout: string;
}

/**
 * Posts one {@link DiscussionReplyDraft} via `gh api graphql`'s {@link
 * ADD_DISCUSSION_COMMENT_MUTATION} — the write-side counterpart to {@link
 * fetchOpenDiscussions}'s read, run through the same injectable `CliExec`.
 * `gh` ships no `discussion` subcommand (unlike `issue`/`pr`), so this, like
 * the read query, is hand-rolled GraphQL against the discussion's opaque node
 * `id` (`draft.discussionId`), never its human-facing `number` — GitHub's API
 * has no way to address a discussion by number alone. `discussionId`/`body`
 * are passed via `-f` (raw string fields), not `-F` (typed/magic fields):
 * unlike {@link fetchOpenDiscussions}'s `owner={owner}`/`name={repo}`, which
 * lean on `gh`'s own `{owner}`/`{repo}` magic-string expansion, both values
 * here are literal content the mutation must send byte-for-byte, most
 * importantly `body`, which can be arbitrary multi-line reply text. Nothing
 * in this codebase calls this yet — same deferred-caller stance `issue-
 * triage.ts`'s own `executeIssueTriageCommands` held before its HTTP wiring
 * landed: this is a building block for the CSRF-guarded preview/execute pair
 * this file's header comment defers, not an autonomous trigger.
 */
export async function postDiscussionReply(
  exec: CliExec,
  draft: DiscussionReplyDraft,
): Promise<DiscussionReplyPostResult> {
  const { code, stdout } = await exec('gh', [
    'api',
    'graphql',
    '-f',
    `discussionId=${draft.discussionId}`,
    '-f',
    `body=${draft.body}`,
    '-f',
    `query=${ADD_DISCUSSION_COMMENT_MUTATION}`,
  ]);
  return { discussionNumber: draft.discussionNumber, code, stdout };
}

/** The GraphQL query behind {@link fetchDiscussionLabelId} — GitHub's
 *  `Repository` type exposes `label(name: String!)` as a direct field, so a
 *  single spend resolves one label's opaque node `id` without paging the
 *  repo's full label list. That `id` is exactly what {@link
 *  applyDiscussionPoolLabel}'s `addLabelsToLabelable` mutation needs:
 *  Discussions labeling is GraphQL-only, keyed by label ID, never by name —
 *  unlike `issue-triage.ts`'s name-addressed `gh issue edit --add-label`. */
const REPOSITORY_LABEL_ID_QUERY =
  'query($owner: String!, $name: String!, $label: String!) { repository(owner: $owner, name: $name) { ' +
  'label(name: $label) { id } } }';

/**
 * Looks up a repo label's opaque GraphQL node ID by its human-facing `name`
 * (e.g. `"pool: accessibility"`) via one `gh api graphql` read ({@link
 * REPOSITORY_LABEL_ID_QUERY}) — the piece {@link applyDiscussionPoolLabel}
 * needs before it can label a discussion at all. Returns `null` on a
 * non-zero exit, unparseable stdout, or when the repo simply has no label by
 * that exact name (a KEEPER pool label not yet created, or a typo) rather
 * than throwing — the caller decides whether a missing label is fatal to the
 * batch or just this one discussion, the same defensive-return convention
 * {@link fetchOpenDiscussions} already uses for its own read.
 */
export async function fetchDiscussionLabelId(
  exec: CliExec,
  labelName: string,
): Promise<string | null> {
  const { code, stdout } = await exec('gh', [
    'api',
    'graphql',
    '-F',
    'owner={owner}',
    '-F',
    'name={repo}',
    '-f',
    `label=${labelName}`,
    '-f',
    `query=${REPOSITORY_LABEL_ID_QUERY}`,
  ]);
  if (code !== 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const id = (
    parsed as { data?: { repository?: { label?: { id?: unknown } | null } | null } | null }
  )?.data?.repository?.label?.id;
  return typeof id === 'string' ? id : null;
}

/** One {@link applyDiscussionPoolLabel} call's outcome — mirrors {@link
 *  DiscussionReplyPostResult}'s `{discussionNumber, code, stdout}` shape for
 *  the label-side write. */
export interface DiscussionLabelPostResult {
  readonly discussionNumber: number;
  readonly code: number;
  readonly stdout: string;
}

/**
 * Applies the KEEPER pool label (`` `pool: ${dimension}` ``, {@link
 * POOL_LABEL_PREFIX}'s own convention) to a discussion — the idempotency
 * marker this file's header comment flagged as still missing: without it, a
 * re-run's {@link planDiscussionTriage} has no `labels` signal to recognize
 * an already-handled discussion, and would draft a duplicate reply every
 * pass. Two `gh api graphql` spends: {@link fetchDiscussionLabelId} resolves
 * the label's opaque node ID first, then `addLabelsToLabelable` applies it —
 * that ID is inlined into the mutation string (JSON-escaped, never
 * string-concatenated raw) rather than passed as a `$labelIds` variable,
 * since `gh api graphql`'s `-f`/`-F` flags carry only scalar values (a raw
 * string, or `-F`'s bool/null/int/placeholder set), neither able to express
 * a GraphQL `[ID!]!` list. Returns `null` without spending the mutation call
 * at all when the label lookup itself fails — nothing to apply an ID for,
 * the same short-circuit-on-missing-prerequisite shape {@link
 * fetchOpenDiscussions} uses for its own read failures.
 */
export async function applyDiscussionPoolLabel(
  exec: CliExec,
  discussion: Pick<IncomingDiscussion, 'id' | 'number'>,
  dimension: Dimension,
): Promise<DiscussionLabelPostResult | null> {
  const labelId = await fetchDiscussionLabelId(exec, `${POOL_LABEL_PREFIX}${dimension}`);
  if (labelId === null) return null;

  const mutation =
    'mutation($labelableId: ID!) { addLabelsToLabelable(input: ' +
    `{labelableId: $labelableId, labelIds: [${JSON.stringify(labelId)}]}) { clientMutationId } }`;
  const { code, stdout } = await exec('gh', [
    'api',
    'graphql',
    '-f',
    `labelableId=${discussion.id}`,
    '-f',
    `query=${mutation}`,
  ]);
  return { discussionNumber: discussion.number, code, stdout };
}

/** One accepted discussion's full ritual outcome — the reply post's result
 *  always present, the label result `null` whenever {@link
 *  runDiscussionTriageRitual} skipped labeling: a failed post ({@link
 *  DiscussionReplyPostResult.code} non-zero) never gets one, since labeling
 *  it would falsely mark a never-delivered reply as handled. */
export interface DiscussionRitualOutcome {
  readonly discussionNumber: number;
  readonly replyResult: DiscussionReplyPostResult;
  readonly labelResult: DiscussionLabelPostResult | null;
}

/** One {@link runDiscussionTriageRitual} pass's full outcome — every open
 *  discussion's plan (accepted or skipped), paired with the ritual outcome
 *  for each accepted one, mirroring `issue-triage.ts`'s {@link
 *  IssueTriageRitualResult} plans+results split. */
export interface DiscussionTriageRitualResult {
  readonly plans: readonly DiscussionTriagePlan[];
  readonly outcomes: readonly DiscussionRitualOutcome[];
}

/**
 * The whole KEEPER Discussions ritual as one composed pass: {@link
 * fetchOpenDiscussions} the open discussions, {@link
 * planDiscussionTriageBatch} a decision + reply draft for each, then for
 * every `'accept'`ed plan {@link postDiscussionReply} first and, only on a
 * successful post (`code === 0`), {@link applyDiscussionPoolLabel} to mark it
 * handled — mirroring `issue-triage.ts`'s {@link runIssueTriageRitual} as the
 * single entrypoint a confirm-guarded HTTP handler will call once that wiring
 * lands (see this file's header comment), but simpler: Discussions carry no
 * board-task or duplicate-detection side, so there is no store to open and no
 * `applyIssueTriageTasks`-style write beyond the reply + label themselves.
 * Every accepted plan gets an outcome even when an earlier one's post failed
 * — no early return short-circuits the loop, the same
 * always-process-every-plan stance `runIssueTriageRitual` takes, just gated
 * per-outcome on that one plan's own post result rather than always running
 * every command regardless of a sibling's failure.
 */
export async function runDiscussionTriageRitual(
  exec: CliExec,
  operatorLogin: string,
): Promise<DiscussionTriageRitualResult> {
  const discussions = await fetchOpenDiscussions(exec);
  const plans = planDiscussionTriageBatch(discussions, operatorLogin);

  const outcomes: DiscussionRitualOutcome[] = [];
  for (const plan of plans) {
    if (plan.decision.decision !== 'accept' || plan.draft === null) continue;

    const replyResult = await postDiscussionReply(exec, plan.draft);
    const labelResult =
      replyResult.code === 0
        ? await applyDiscussionPoolLabel(exec, plan.discussion, plan.decision.dimension)
        : null;
    outcomes.push({ discussionNumber: plan.discussion.number, replyResult, labelResult });
  }

  return { plans, outcomes };
}
