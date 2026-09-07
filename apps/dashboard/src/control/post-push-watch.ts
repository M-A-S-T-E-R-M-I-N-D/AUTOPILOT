// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * POST-PUSH VERDICT RITUAL, slice 2 (board web-mtpbmay4-94ii65): slice 1
 * (`post-push-verdict.ts`) shipped the pure green/red decision but
 * deliberately deferred "wiring this into the actual post-land polling
 * loop... needs a live timing design (poll cadence, timeout, which
 * workflow(s) to watch)". This slice supplies that primitive: a fully
 * injectable poll loop (clock, sleep, and the status check itself are all
 * parameters) so the cadence/timeout logic is unit-testable without a real
 * wall-clock wait or a real `gh` call.
 *
 * Still deferred to a follow-up slice: actually STARTING a watch from
 * `landing/execute.ts` after a green land, and where its async lifetime
 * lives once the HTTP request that triggered the land has already returned
 * (surviving a dashboard restart mid-watch is a real design question this
 * primitive intentionally has no opinion on).
 */

import type { WorkflowRunStatus } from './ci-status.js';
import {
  decidePostPushVerdict,
  type PostPushVerdictContext,
  type PostPushVerdictResult,
} from './post-push-verdict.js';

export type PostPushWatchOutcome =
  | { readonly kind: 'concluded'; readonly verdict: PostPushVerdictResult }
  /** The workflow never reported a conclusion before the deadline — reported
   *  distinctly rather than folded into 'concluded', since "we gave up
   *  watching" is not the same claim as "CI passed". No verdict is decided
   *  and no evidence task is filed for a timeout. */
  | { readonly kind: 'timed-out'; readonly workflow: string };

export interface PostPushWatchOptions {
  readonly pollIntervalMs: number;
  readonly timeoutMs: number;
}

/** Default cadence: check every 30s, give up after 20 minutes — long enough
 *  for a normal CI run to conclude, short enough that a watch doesn't linger
 *  forever if the workflow never reports back. */
export const DEFAULT_POST_PUSH_WATCH_OPTIONS: PostPushWatchOptions = {
  pollIntervalMs: 30_000,
  timeoutMs: 20 * 60_000,
};

/**
 * Polls `checkStatus` on `options.pollIntervalMs` cadence until it reports a
 * CONCLUDED run (`conclusion !== null`) or `options.timeoutMs` elapses,
 * whichever comes first, then hands a concluded status to
 * `decidePostPushVerdict`. Always checks at least once, even with a
 * zero/negative timeout.
 */
export async function watchPostPushCi(
  context: PostPushVerdictContext,
  checkStatus: () => WorkflowRunStatus | Promise<WorkflowRunStatus>,
  options: PostPushWatchOptions = DEFAULT_POST_PUSH_WATCH_OPTIONS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => number = Date.now,
): Promise<PostPushWatchOutcome> {
  const deadline = now() + options.timeoutMs;
  for (;;) {
    const status = await checkStatus();
    if (status.conclusion !== null) {
      return { kind: 'concluded', verdict: decidePostPushVerdict(status, context, now()) };
    }
    if (now() >= deadline) {
      return { kind: 'timed-out', workflow: status.workflow };
    }
    await sleep(options.pollIntervalMs);
  }
}
