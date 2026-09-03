// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * DURABLE LANDING JOBS — "when I press LAND, the system knows how to make it
 * work" (operator directive 2026-08-30, after a press that appeared to do
 * nothing at all).
 *
 * `POST /api/landing/execute` runs a REAL gate before it merges: ~200s here,
 * and the whole thing was modelled as one synchronous request whose only
 * record of itself was the caller's pending promise. Three failure modes fell
 * out of that, all of which read to an operator as "the button is broken":
 *
 *  1. INVISIBLE RESULT — the LANDING panel re-renders on every SSE tick, so a
 *     4-minute land almost always outlives the button that started it. The
 *     click handler wrote its verdict into `b.parentElement.nextElementSibling`,
 *     captured at click time: after a re-render that node is detached, so the
 *     land could succeed and the operator would see nothing at all.
 *  2. NO MEMORY — a reload, a self-restart after a green land, or simply
 *     closing the tab lost every trace that a landing was ever running.
 *  3. DEAD-END REFUSAL — `flight-running` refused and stopped there, leaving
 *     the operator to notice, pause the flight, and press again.
 *
 * This registry makes a landing an OBJECT with a lifetime instead of a pending
 * promise: one job per project, live phase/step state any number of readers can
 * poll (`GET /api/landing/job`), and a self-healing wait loop. The gate itself
 * is untouched — {@link createLandingExecuteApi} still owns "gate, then merge,
 * never touch git on red". This layer only decides WHEN to call it and REMEMBERS
 * what happened.
 *
 * SELF-HEALING (the operator's actual ask): a `flight-running` refusal no longer
 * ends the attempt. The job requests a GRACEFUL pause (the flight finishes its
 * current firing and stops — never a kill), waits for the flight to clear, then
 * lands on its own. Pressing LAND is the operator's intent to land; carrying
 * that intent across the wait is the difference between a button that works and
 * a button that reports. Bounded by {@link LANDING_JOB_MAX_WAIT_MS} so a stuck
 * flight can never leave a job waiting forever, and the pause is requested ONCE
 * per job (re-requesting each poll would spam the store with intent no truer
 * the second time).
 *
 * The POST's own response is unchanged — it still returns the FIRST attempt's
 * result, refusal reasons and all, so every existing caller (tests, the CLI,
 * the land-watchdog) keeps its exact contract. What changes is that a refusal
 * is no longer the end of the story: the job lives on, and the panel follows it.
 */

import type { LandingExecuteApi, LandingExecuteApiResult } from './execute.js';

/** Where a landing job is right now. `waiting-for-flight` is the self-healing
 *  state: refused because a flight owns the checkout, pause requested, retrying
 *  when it clears. */
export type LandingJobPhase = 'gate' | 'waiting-for-flight' | 'finished';

/** One gate step's live state — `running` is the step in flight right now
 *  (there is at most one per batch position), the rest carry their verdict. */
export interface LandingJobStep {
  readonly label: string;
  readonly state: 'running' | 'pass' | 'fail';
  readonly durationMs?: number;
}

/** A landing job's full public state — everything the panel needs to render an
 *  honest progress line, and everything a reload needs to pick the story back
 *  up. Serializable as-is (the HTTP layer sends it verbatim). */
export interface LandingJobState {
  readonly projectId: string;
  readonly phase: LandingJobPhase;
  readonly startedAt: number;
  readonly updatedAt: number;
  /** 1-based position of the running/last step and the gate's total, so a UI
   *  can say "3/5" without modelling the gate's shape. */
  readonly stepIndex?: number;
  readonly stepTotal?: number;
  readonly steps: readonly LandingJobStep[];
  /** How many times this job has called the landing API (a self-healed retry
   *  after a flight cleared is attempt 2). */
  readonly attempts: number;
  /** Operator-facing one-liner for the phase — what the job is doing and why. */
  readonly note?: string;
  /** Set once `phase === 'finished'`: the final landing verdict, kept for
   *  {@link LANDING_JOB_RESULT_TTL_MS} so a reload still shows the outcome. */
  readonly result?: LandingExecuteApiResult;
}

/** Longest a job will wait for a running flight to clear before giving up and
 *  reporting the refusal honestly. Generous — a firing can legitimately take
 *  many minutes — but finite, so a wedged flight can never strand a job. */
export const LANDING_JOB_MAX_WAIT_MS = 30 * 60 * 1000;

/** How often the wait loop re-checks whether the flight has cleared. */
export const LANDING_JOB_POLL_MS = 10 * 1000;

/** How long a FINISHED job's state (and its result) stays readable. Long
 *  enough to survive the self-restart a green self-hosted land triggers — the
 *  operator's page reconnects to a fresh server process and must still be able
 *  to learn that the land succeeded. */
export const LANDING_JOB_RESULT_TTL_MS = 15 * 60 * 1000;

/** Collaborators this registry drives — all injected so the whole loop
 *  (including the flight wait) is testable with no git, no store, and no
 *  real clock. */
export interface LandingJobDeps {
  /** The real landing attempt — {@link createLandingExecuteApi}'s result. */
  readonly execute: LandingExecuteApi;
  /** Whether a flight currently owns this project's checkout. Omitted ⇒ the
   *  job never waits (it just reports whatever `execute` returned). */
  readonly isFlightRunning?: (projectId: string) => boolean;
  /** Ask the running flight to stop gracefully after its current firing.
   *  Omitted ⇒ the job waits for the flight to end on its own. */
  readonly requestPause?: (projectId: string) => void;
  readonly now?: () => number;
  /** Test seam for the wait loop's sleep. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly maxWaitMs?: number;
  readonly pollMs?: number;
  readonly resultTtlMs?: number;
  /** Durable fallback for {@link LandingJobRegistry.stateOf} when this process
   *  holds no job — see `landing/history.ts`. A green land of the SELF-hosted
   *  project restarts this very server, so the process that ran the job is
   *  replaced moments later; without this, the operator's reconnecting page
   *  would be told "nothing happened" about the land that just succeeded. */
  readonly recentOutcome?: (projectId: string) => LandingExecuteApiResult | null;
}

/** The registry the HTTP layer holds: start (or join) a job, and read state. */
export interface LandingJobRegistry {
  /**
   * Start a landing for `projectId`, or JOIN the one already running — a
   * second press while a gate is mid-run must never start a second gate (two
   * concurrent merges into the same base is the git race the whole
   * flight-running refusal exists to prevent). Resolves with the first
   * attempt's result, exactly as the bare API would; `null` for an unknown
   * project. A self-healing wait continues in the background after this
   * resolves — read {@link stateOf} to follow it.
   */
  start(projectId: string): Promise<LandingExecuteApiResult | null>;
  /** This project's live job state, or `null` when there is nothing to show
   *  (never started, or finished long enough ago to have expired). */
  stateOf(projectId: string): LandingJobState | null;
  /** The progress observer to hand a {@link GateRunner} for `projectId` —
   *  wired by the execute API so the job's steps reflect the REAL gate run
   *  rather than a guess about which command is next. */
  onGateProgress(
    projectId: string,
    event: {
      kind: 'start' | 'end';
      label: string;
      index: number;
      total: number;
      pass?: boolean;
      durationMs?: number;
    },
  ): void;
}

interface MutableJob {
  state: LandingJobState;
  /** In-flight first attempt, so concurrent `start`s join instead of racing. */
  pending?: Promise<LandingExecuteApiResult | null>;
  /** True while the background self-healing loop still owns this job. */
  active: boolean;
}

/**
 * Build the registry. Everything is in-process by design: a landing is only
 * meaningful while the server that owns the checkout is alive, and a job that
 * outlived its server would describe a gate run nobody is still doing.
 */
export function createLandingJobRegistry(deps: LandingJobDeps): LandingJobRegistry {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxWaitMs = deps.maxWaitMs ?? LANDING_JOB_MAX_WAIT_MS;
  const pollMs = deps.pollMs ?? LANDING_JOB_POLL_MS;
  const resultTtlMs = deps.resultTtlMs ?? LANDING_JOB_RESULT_TTL_MS;
  const jobs = new Map<string, MutableJob>();

  const patch = (projectId: string, next: Partial<LandingJobState>): void => {
    const job = jobs.get(projectId);
    if (!job) return;
    job.state = { ...job.state, ...next, updatedAt: now() };
  };

  const finish = (
    projectId: string,
    result: LandingExecuteApiResult | null | undefined,
    note: string,
  ): void => {
    const job = jobs.get(projectId);
    if (!job) return;
    job.active = false;
    job.state = {
      ...job.state,
      phase: 'finished',
      note,
      ...(result ? { result } : {}),
      updatedAt: now(),
    };
  };

  /** One `execute` call with the gate phase set up around it. */
  const attempt = async (projectId: string): Promise<LandingExecuteApiResult | null> => {
    const job = jobs.get(projectId);
    if (job) {
      job.state = {
        ...job.state,
        phase: 'gate',
        attempts: job.state.attempts + 1,
        steps: [],
        note: 'running the full gate before merging — nothing touches git until it is green',
        updatedAt: now(),
      };
    }
    return deps.execute(projectId);
  };

  /**
   * The self-healing background half: after a `flight-running` refusal, ask
   * the flight to stop gracefully, wait for it to clear, then land. Any
   * unexpected throw finishes the job honestly rather than leaving it stuck in
   * a phase that will never advance.
   */
  const healAfterFlight = async (projectId: string): Promise<void> => {
    const deadline = now() + maxWaitMs;
    patch(projectId, {
      phase: 'waiting-for-flight',
      note: 'a flight owns the checkout — asked it to stop after its current firing; landing automatically once it clears',
    });
    deps.requestPause?.(projectId);

    try {
      while (now() < deadline) {
        await sleep(pollMs);
        if (deps.isFlightRunning?.(projectId) === true) continue;

        const result = await attempt(projectId);
        if (result?.reason === 'flight-running') {
          // A new flight started in the gap — keep waiting rather than
          // reporting a refusal the operator already asked us to handle.
          patch(projectId, {
            phase: 'waiting-for-flight',
            note: 'another flight started while waiting — still holding the landing intent',
          });
          continue;
        }
        finish(
          projectId,
          result,
          result?.ok === true
            ? 'landed automatically once the flight cleared'
            : 'the flight cleared, but the landing was refused — see the result',
        );
        return;
      }
      finish(
        projectId,
        {
          ok: false,
          reason: 'flight-running',
          details:
            'waited for the running flight to finish and it never did — press LAND again once it has',
          restarting: false,
        },
        'gave up waiting for the flight to finish',
      );
    } catch {
      finish(
        projectId,
        {
          ok: false,
          reason: 'merge-failed',
          details: 'the queued landing failed unexpectedly — press LAND again',
          restarting: false,
        },
        'the queued landing failed unexpectedly',
      );
    }
  };

  return {
    start(projectId) {
      const existing = jobs.get(projectId);
      if (existing?.pending) return existing.pending;
      if (existing?.active === true) {
        // A self-healing wait is already carrying this operator's intent —
        // report the state that led here instead of starting a second gate.
        return Promise.resolve(
          existing.state.result ?? {
            ok: false,
            reason: 'flight-running',
            details:
              'a landing is already queued for this project — it runs automatically when the flight clears',
            restarting: false,
          },
        );
      }

      const startedAt = now();
      jobs.set(projectId, {
        active: true,
        state: {
          projectId,
          phase: 'gate',
          startedAt,
          updatedAt: startedAt,
          steps: [],
          attempts: 0,
        },
      });

      const pending = (async (): Promise<LandingExecuteApiResult | null> => {
        const result = await attempt(projectId);
        if (result === null) {
          jobs.delete(projectId);
          return null;
        }
        if (result.reason === 'flight-running' && maxWaitMs > 0) {
          // Keep the operator's intent alive in the background, and SAY so in
          // the refusal itself: "a flight is running" alone reads as a
          // dead-end the operator must act on, when in fact the landing is
          // already queued behind it. The `reason` is untouched — callers
          // (tests, CLI, watchdog) still branch on exactly what they always
          // did; only the human-facing sentence gains the good news.
          void healAfterFlight(projectId);
          return {
            ...result,
            details:
              result.details +
              ' — landing QUEUED: the flight was asked to stop after its current firing, and this lands automatically once it does',
          };
        }
        finish(projectId, result, result.ok ? 'landed' : 'refused — the branch was not merged');
        return result;
      })();

      const job = jobs.get(projectId);
      if (job) {
        job.pending = pending;
        void pending
          .catch(() => {
            finish(
              projectId,
              {
                ok: false,
                reason: 'merge-failed',
                details: 'the landing failed unexpectedly — press LAND again',
                restarting: false,
              },
              'the landing failed unexpectedly',
            );
          })
          .finally(() => {
            const current = jobs.get(projectId);
            if (current) delete current.pending;
          });
      }
      return pending;
    },

    stateOf(projectId) {
      const job = jobs.get(projectId);
      if (job && job.state.phase === 'finished' && now() - job.state.updatedAt > resultTtlMs) {
        jobs.delete(projectId);
        return null;
      }
      if (job) return job.state;

      // No job in THIS process. The land may still have happened — and for a
      // self-hosted green land it almost certainly did, since that land is
      // what replaced the process that was holding the job. Answer from the
      // durable record rather than reporting "nothing happened".
      const recent = deps.recentOutcome?.(projectId);
      if (!recent) return null;
      const at = now();
      return {
        projectId,
        phase: 'finished',
        startedAt: at,
        updatedAt: at,
        steps: [],
        attempts: 1,
        note: 'recovered from the landing record — this land completed before the dashboard restarted',
        result: recent,
      };
    },

    onGateProgress(projectId, event) {
      const job = jobs.get(projectId);
      if (!job || job.state.phase === 'finished') return;
      const steps = job.state.steps.filter((s) => s.label !== event.label || s.state !== 'running');
      const next: LandingJobStep =
        event.kind === 'start'
          ? { label: event.label, state: 'running' }
          : {
              label: event.label,
              state: event.pass === true ? 'pass' : 'fail',
              ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }),
            };
      job.state = {
        ...job.state,
        steps: [...steps, next],
        stepIndex: event.index,
        stepTotal: event.total,
        updatedAt: now(),
      };
    },
  };
}
