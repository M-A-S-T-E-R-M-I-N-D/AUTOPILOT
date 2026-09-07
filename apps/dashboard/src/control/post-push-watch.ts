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
 * `landing/execute.ts` after a green land. Wired (`server/main.ts`):
 * surviving a dashboard restart mid-watch remains open — this trigger's poll
 * loop lives only in the process's own memory, same fire-and-forget posture
 * `landing/execute.ts` already accepts for its self-restart trigger and
 * out-of-band gate check.
 *
 * Escalation-mode follow-up (board web-mtpbmazh-3en467): when `spawnFlight`
 * is supplied, a `'remediate'` verdict that actually filed a NEW task (not a
 * dedup no-op) AND finds the target folder idle also spawns a single-lane
 * fix firing scoped to that task — `post-push-verdict.ts`'s
 * `ciRemediationMode`/`shouldSpawnRemediationFlight` decide whether to, this
 * function only supplies the live project status and the real spawn.
 */

import { openStore, listProjects } from '@autopilot/store';
import { ciWorkflowStatus, createGhRun, type GhRun, type WorkflowRunStatus } from './ci-status.js';
import {
  ciRemediationMode,
  decidePostPushVerdict,
  filePostPushVerdictTask,
  shouldSpawnRemediationFlight,
  type PostPushVerdictContext,
  type PostPushVerdictResult,
} from './post-push-verdict.js';
import { DEFAULT_WATCH_FLY_FIRINGS } from './flight-watchdog.js';
import { DEFAULT_BUDGET_USD } from '../flight/runner.js';
import type { FlightRunnerDeps } from '../flight/runner.js';

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

/**
 * Builds the real {@link PostPushWatchTrigger} (slice 3): watches `ci.yml`
 * on `branch` against `rootPath` (`ciWorkflowStatus`, the same read the
 * pre-land e2e guard already uses) until it concludes or the default
 * timeout elapses, then — on a concluded verdict only, never on a timeout,
 * per `PostPushWatchOutcome`'s own contract — files the evidence task
 * through `filePostPushVerdictTask`. Every failure mode (`checkStatus`
 * throwing, the store failing to open) is swallowed: a post-push watch must
 * never be the thing that crashes the land it's merely watching.
 *
 * `spawnFlight` is optional (production wiring passes the real
 * `FlightRunnerDeps['spawnFlight']`; omitted entirely, this trigger behaves
 * exactly as slice 1/2 always did — `'board'` mode only, no spawn path even
 * reachable). When supplied, a `'remediate'` verdict that actually filed a
 * new task re-reads the project's live status from the SAME store already
 * open for the filing (no second connection) and, per
 * `shouldSpawnRemediationFlight`, may spawn ONE single-lane firing
 * (`DEFAULT_WATCH_FLY_FIRINGS`, matching `dashboard watch`'s own default)
 * scoped to the just-filed task via `AUTOPILOT_FLEET_TASK_SCOPE`.
 */
export function createPostPushWatchTrigger(
  dbPath: string,
  run?: (rootPath: string) => GhRun,
  spawnFlight?: FlightRunnerDeps['spawnFlight'],
  budgetUsd: number = DEFAULT_BUDGET_USD,
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
          const taskFiled = filePostPushVerdictTask(store, outcome.verdict);
          if (spawnFlight && outcome.verdict.kind === 'remediate') {
            const projectStatus =
              listProjects(store.db).find((p) => p.id === projectId)?.status ?? null;
            if (shouldSpawnRemediationFlight(ciRemediationMode(), taskFiled, projectStatus)) {
              spawnFlight(rootPath, DEFAULT_WATCH_FLY_FIRINGS, budgetUsd, undefined, undefined, [
                outcome.verdict.task.id,
              ]);
            }
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
