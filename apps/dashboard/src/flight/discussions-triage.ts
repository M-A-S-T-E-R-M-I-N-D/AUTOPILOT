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
 * conversational-message format. Zero write/mutation capability still holds:
 * no reply is ever POSTED from this file — only drafted, in memory, for a
 * follow-on slice to actually send. The `addDiscussionComment` GraphQL
 * mutation itself, the CSRF-guarded preview/execute HTTP endpoints, and the
 * operator panel remain deferred to those follow-on slices, the same
 * staged-rollout shape `issue-triage.ts` itself used before `issue-triage-
 * execute.ts` + `issue-triage-panel.ts` landed.
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

/** A drafted reply, ready for a follow-on slice to post — never posted here. */
export interface DiscussionReplyDraft {
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
    discussionNumber: discussion.number,
    dimension: decision.dimension,
    body: `${decision.reasoning}\n\n${attributionSignature(operatorLogin)}`,
  };
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
  'orderBy: {field: CREATED_AT, direction: DESC}) { nodes { number title body isAnswered ' +
  'locked category { name } labels(first: 20) { nodes { name } } } } } }';

/** One discussion node as {@link OPEN_DISCUSSIONS_QUERY} returns it —
 *  untrusted process output, parsed defensively rather than trusted as
 *  already shaped like {@link IncomingDiscussion}. */
interface RawDiscussionNode {
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
 * a numeric `number` or string `title` are dropped rather than passed
 * through malformed.
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
        raw !== null && typeof raw.number === 'number' && typeof raw.title === 'string',
    )
    .map((raw) => ({
      number: raw.number as number,
      title: raw.title as string,
      body: typeof raw.body === 'string' ? raw.body : '',
      category: parseDiscussionCategory(raw.category),
      isAnswered: raw.isAnswered === true,
      locked: raw.locked === true,
      labels: parseDiscussionLabels(raw.labels),
    }));
}
