// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * KEEPER Discussions ritual's HTTP wiring (BOARD web-mtlsiac0-v8rksh, epic
 * 0007 S8 — the HTTP half; the pure decision core, the hand-rolled GraphQL
 * read/write wiring, and the `runDiscussionTriageRitual` composer all
 * shipped first, in `discussions-triage.ts`). Mirrors `issue-triage-
 * execute.ts`'s preview/execute API pair, minus the store: Discussions carry
 * no board-task or backlog dedup side, so there is no project to look up —
 * like `pr-review-execute.ts`, this acts on the ONE canonical repo the
 * dashboard process itself runs in (`gh` resolves `{owner}`/`{repo}` from
 * its own cwd). What it adds over both is identity: every drafted reply is
 * signed "on behalf of @<login>" (docs/ATTRIBUTION.md §3), so even the
 * read-only preview must resolve who is acting — `social-pass.ts`'s
 * `resolveSocialIdentity`, the same one `mirror-pass-execute.ts` gates on —
 * before it can draft a single body, and the execute refuses to post for a
 * non-maintainer (epic 0019 law 1, role honesty: the same `skippedReason`
 * report shape `mirror-pass-execute.ts` returns, never a 403 — refusing to
 * mutate is itself a valid, reportable outcome). The `server.ts` routes that
 * expose this pair — `GET /api/discussions-triage` (preview: resolve + fetch
 * + plan, no mutation) and `POST /api/discussions-triage/execute` (the real
 * run), CSRF-guarded and rate-limited like every other KEEPER write — and
 * the operator panel that calls them are the two slices still deferred; the
 * API pair ships first so the wiring slice is a pure `server.ts`/`main.ts`
 * injection, the same staged order `issue-triage-execute.ts` followed.
 */

import type { CliExec } from '../connection/cli-probe.js';
import { ghExec } from './gh-exec.js';
import { resolveSocialIdentity, type SocialIdentity } from './social-pass.js';
import {
  fetchOpenDiscussions,
  planDiscussionTriageBatch,
  runDiscussionTriageRitual,
  type DiscussionTriagePlan,
  type DiscussionRitualOutcome,
} from './discussions-triage.js';

/** Why a call drafted zero replies (preview) or sent zero `gh` mutations
 *  (execute) — the same two names `mirror-pass-execute.ts`'s
 *  `MirrorPassExecuteSkipReason` uses: `'identity-unresolved'` when `gh`
 *  could not say who is acting (so there is no login to sign a reply on
 *  behalf of — a draft "on behalf of @undefined" would be a lie the moment
 *  it posted), `'guest'` when it resolved to a non-maintainer of this repo
 *  (execute only — a preview still shows a guest what a maintainer's run
 *  would do, the same read-only stance `createMirrorPassPreviewApi` takes). */
export type DiscussionsTriageSkipReason = 'identity-unresolved' | 'guest';

/** The preview's full report: the identity replies would be signed on
 *  behalf of (`undefined` when resolution itself failed), every open
 *  discussion's plan (decision + drafted reply), or a `skippedReason` (with
 *  `plans` always `[]`) when no login could sign a draft. */
export interface DiscussionsTriagePreviewReport {
  readonly identity: SocialIdentity | undefined;
  readonly plans: readonly DiscussionTriagePlan[];
  readonly skippedReason?: DiscussionsTriageSkipReason;
}

/** No project id, unlike `IssueTriagePreviewApi` — repo-scoped like
 *  `PrReviewApi`, so there is no "unknown project" `null` either. */
export type DiscussionsTriagePreviewApi = () => Promise<DiscussionsTriagePreviewReport>;

/**
 * Build the KEEPER DISCUSSIONS preview API against the real `gh` — the
 * production wiring `main.ts` injects into the server. Read-only: resolves
 * the acting identity, lists open discussions, and plans a decision plus a
 * signed reply draft for each, never posting a comment or applying a label.
 * Short-circuits before spending the discussions read when no identity
 * resolves — nothing could be drafted without a login to sign it, the same
 * skip-on-missing-prerequisite shape `applyDiscussionPoolLabel` takes.
 */
export function createDiscussionsTriagePreviewApi(
  exec: CliExec = ghExec,
): DiscussionsTriagePreviewApi {
  return async () => {
    const identity = await resolveSocialIdentity(exec);
    if (identity === undefined) {
      return { identity, plans: [], skippedReason: 'identity-unresolved' };
    }
    const discussions = await fetchOpenDiscussions(exec);
    return { identity, plans: planDiscussionTriageBatch(discussions, identity.login) };
  };
}

/** The execute's full report — {@link DiscussionsTriagePreviewReport} plus
 *  every accepted plan's real post + label outcome; `outcomes` (and `plans`)
 *  are always `[]` alongside a `skippedReason`, since role honesty forbade
 *  sending a single mutation. */
export interface DiscussionsTriageExecuteReport {
  readonly identity: SocialIdentity | undefined;
  readonly plans: readonly DiscussionTriagePlan[];
  readonly outcomes: readonly DiscussionRitualOutcome[];
  readonly skippedReason?: DiscussionsTriageSkipReason;
}

/** No arguments: the ritual re-fetches and re-plans everything fresh at
 *  execute time rather than trusting a client-supplied plan (the same
 *  never-trust-the-client stance `pr-review-execute.ts` documents), and a
 *  discussion's `pool: *` label is its idempotency marker, so a double-click
 *  re-run replies to nothing twice. */
export type DiscussionsTriageExecuteApi = () => Promise<DiscussionsTriageExecuteReport>;

/**
 * Build the KEEPER DISCUSSIONS execute API against the real `gh` — the
 * production wiring `main.ts` injects into the server. Resolves the acting
 * identity first and refuses to post unless it is this repo's maintainer:
 * an autopilot reply signed "on behalf of" a guest, landing on a repo that
 * guest does not own, is exactly the uninvited-bot noise epic 0019's law 1
 * exists to prevent. Only then runs {@link runDiscussionTriageRitual} —
 * reply, then label on a successful reply — under the resolved login.
 */
export function createDiscussionsTriageExecuteApi(
  exec: CliExec = ghExec,
): DiscussionsTriageExecuteApi {
  return async () => {
    const identity = await resolveSocialIdentity(exec);
    if (identity === undefined || identity.role !== 'maintainer') {
      return {
        identity,
        plans: [],
        outcomes: [],
        skippedReason: identity === undefined ? 'identity-unresolved' : 'guest',
      };
    }
    const { plans, outcomes } = await runDiscussionTriageRitual(exec, identity.login);
    return { identity, plans, outcomes };
  };
}
