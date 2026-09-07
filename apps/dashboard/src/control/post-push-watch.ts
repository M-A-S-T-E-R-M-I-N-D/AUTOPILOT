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
 * Slice 3 ({@link createPostPushWatchTrigger}, below) is the piece this
 * slice's own docstring used to defer: actually STARTING a watch from
 * `landing/execute.ts` after a green land — shipped, wired in
 * `server/main.ts`. Still open: surviving a dashboard restart mid-watch —
 * this trigger's poll loop lives only in the process's own memory, same
 * fire-and-forget posture `landing/execute.ts` already accepts for its
 * self-restart trigger and out-of-band gate check; and the real
 * {@link LaunchFixFiring} implementation for the escalation-mode lever
 * (board web-mtpbmazh-3en467, `postPushRemediationMode` in
 * `post-push-verdict.ts`) — today `createPostPushWatchTrigger` calls it
 * when set, but no caller passes a real one yet.
 */

import { openStore, type CreateTaskInput } from '@autopilot/store';
import { ciWorkflowStatus, createGhRun, type GhRun, type WorkflowRunStatus } from './ci-status.js';
import {
  decidePostPushVerdict,
  filePostPushVerdictTask,
  postPushRemediationMode,
  type PostPushRemediationMode,
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

/** Fire-and-forget hook `landing/execute.ts` invokes after a green land —
 *  same contract as {@link OutOfBandLandGateCheck} in `landing/execute.ts`:
 *  synchronous, MUST NOT throw, and the caller never awaits it. */
export type PostPushWatchTrigger = (
  projectId: string,
  rootPath: string,
  branch: string,
  sha: string,
) => void;

/** Escalation hook (board web-mtpbmazh-3en467): invoked when
 *  `postPushRemediationMode` reads "fly" AND the evidence task was actually
 *  filed (never on a dedup no-op — a second red on an already-open incident
 *  must not spawn a second fix firing for it). Same fire-and-forget
 *  contract as {@link PostPushWatchTrigger} itself. The real implementation
 *  — spawning a single-lane fix firing scoped to `task.id` via
 *  `FlightRunner`/`createSpawnFlight` — is deferred to a follow-up slice,
 *  same reasoning `post-push-verdict.ts` slice 1 gave for deferring this
 *  trigger's own wiring to slice 3: a live child-process launch needs its
 *  own design (worktree, lock, scope), not just the config lever. */
export type LaunchFixFiring = (task: CreateTaskInput, rootPath: string) => void;

/**
 * Builds the real {@link PostPushWatchTrigger} (slice 3): watches `ci.yml`
 * on `branch` against `rootPath` (`ciWorkflowStatus`, the same read the
 * pre-land e2e guard already uses) until it concludes or the default
 * timeout elapses, then — on a concluded verdict only, never on a timeout,
 * per `PostPushWatchOutcome`'s own contract — files the evidence task
 * through `filePostPushVerdictTask`, additionally invoking
 * `launchFixFiring` when the operator's `AUTOPILOT_CI_REMEDIATION` lever
 * reads "fly" and a task was freshly filed. Every failure mode
 * (`checkStatus` throwing, the store failing to open) is swallowed: a
 * post-push watch must never be the thing that crashes the land it's
 * merely watching.
 */
export function createPostPushWatchTrigger(
  dbPath: string,
  run?: (rootPath: string) => GhRun,
  launchFixFiring?: LaunchFixFiring,
  mode: PostPushRemediationMode = postPushRemediationMode(),
): PostPushWatchTrigger {
  return (projectId, rootPath, branch, sha) => {
    void (async () => {
      try {
        const outcome = await watchPostPushCi({ projectId, branch, sha }, () =>
          ciWorkflowStatus('ci.yml', (run ?? createGhRun)(rootPath), Date.now(), branch),
        );
        if (outcome.kind !== 'concluded') return;
        const store = openStore(dbPath);
        try {
          const filed = filePostPushVerdictTask(store, outcome.verdict);
          if (filed && mode === 'fly' && outcome.verdict.kind === 'remediate') {
            launchFixFiring?.(outcome.verdict.task, rootPath);
          }
        } finally {
          store.close();
        }
      } catch {
        /* best-effort — a post-push watch must never crash the land it's watching */
      }
    })();
  };
}
