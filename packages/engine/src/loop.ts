// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The outer autopilot loop (ENGINE-RESEARCH G1/G7/G8; `docs/M1-ENGINE-PLAN.md`).
 * Faithful to the proven v2.4 loop: compute the firing number, mark every
 * `retroEvery`th firing a RETRO, run one atomic firing, persist the resilience
 * state (survives restarts), track a cost/churn streak, and pace — hibernating on
 * global exhaustion, else pacing on the adaptive cadence. Every wait is
 * STOP-aware (the sleeper honors the STOP sentinel), so the loop exits within ~1
 * minute of a stop request even mid-hibernate.
 *
 * The firing runner is injectable so the loop's control flow (cadence, stop,
 * churn, hibernate) is testable without exercising the full firing.
 */

import { hibernateMinutes, type ResilienceState } from './resilience.js';
import { runFiring, type FiringDeps, type FiringInput, type FiringOutcome } from './firing.js';
import type { EngineConfig } from './config.js';

export interface LoopDeps {
  /** Ports passed through to each firing. */
  readonly firing: FiringDeps;
  /** True when a graceful stop has been requested (STOP sentinel present). */
  readonly stopRequested: () => Promise<boolean>;
  /** Restore the persisted resilience state (streaks + cooldown) across restarts. */
  readonly loadState: () => Promise<ResilienceState>;
  /** Persist the resilience state after each firing. */
  readonly saveState: (state: ResilienceState) => Promise<void>;
  /**
   * Atomically reserve and return the next firing number (board
   * web-mtbay6wd-hz0p0m — the real adapter's `reserveNextFiring` uses a
   * single INSERT..ON CONFLICT..RETURNING statement so two fleet lanes
   * calling this back-to-back, with no firing recorded in between, still get
   * distinct sequential numbers instead of both reading the same
   * `COUNT(*)`).
   */
  readonly nextFiring: () => Promise<number>;
  /**
   * Build the prompt for a firing (RETRO firings get the retro appendix).
   * MODEL ROUTING v1 (web-msvz7n8o-nynbbs): may also resolve a per-firing
   * `primaryModel` — the caller classifies the task THIS firing is about to
   * work (mechanical/default/architecture-escalated) from signals only it
   * has (the board, task economics), and the loop applies it below instead
   * of the flight-wide `config.primaryModel` for just this one firing.
   * Omitted (or equal to `config.primaryModel`) is a no-op — every existing
   * caller is unaffected.
   */
  readonly buildPrompt: (
    firing: number,
    retro: boolean,
  ) => Promise<{ text: string; version: string; primaryModel?: string; maxBudgetUsd?: number }>;
  /** STOP-aware sleep (chunked so a long hibernate still honors STOP quickly). */
  readonly sleep: (minutes: number) => Promise<void>;
  /** The next adaptive-cadence sleep in minutes (observed spend vs soft caps). */
  readonly nextPaceMin: () => Promise<number>;
  /** Structured log sink. */
  readonly log: (message: string) => void;
  /**
   * Optional hook fired with each firing's outcome right after its state is
   * persisted — BETWEEN firings, not just at the end of the flight. Lets the
   * caller react in real time (e.g. mark a gate-verified shipped board task
   * done) instead of a shipped task sitting stuck on the board until every
   * remaining firing in a long flight finishes.
   */
  readonly onFiringComplete?: (outcome: FiringOutcome) => Promise<void> | void;
  /** Test seam: override the firing runner (defaults to the real one). */
  readonly runFiring?: (
    deps: FiringDeps,
    config: EngineConfig,
    input: FiringInput,
  ) => Promise<FiringOutcome>;
  /**
   * Cost semantics v3 (docs/epics/0013-cost-semantics-v3.md) — scans
   * `config.usagePoolDirs` for this machine's trailing-30-day list-price
   * usage total. Called ONCE per flight (below), not per firing — a
   * filesystem scan is comparatively expensive and the pool total barely
   * moves within one flight — then threaded to every firing's
   * `FiringInput.machineWide30dListPriceUsd`. Omitted (the default) is a
   * no-op: every firing gets `null`, same as before this field existed.
   */
  readonly scanUsagePool?: () => Promise<number | null>;
}

export interface LoopOptions {
  /** Bound the loop (tests + safety). Omit to run until STOP. */
  readonly maxIterations?: number;
}

export interface LoopSummary {
  readonly firings: number;
  readonly stoppedBy: 'stop' | 'max-iterations';
}

const CONSEC_BAD_ALERT = 2;

/** Run the autopilot loop until STOP (or `maxIterations`). */
export async function runLoop(
  deps: LoopDeps,
  config: EngineConfig,
  options: LoopOptions = {},
): Promise<LoopSummary> {
  const fire = deps.runFiring ?? runFiring;
  const max = options.maxIterations ?? Number.POSITIVE_INFINITY;

  let state = await deps.loadState();
  let consecBad = 0;
  let iterations = 0;
  // Flight-scoped, in-memory only (docs/epics/0009-warm-sessions.md): this
  // loop's own process IS one flight, so the prior firing's session id needs
  // no filesystem persistence to reach the next iteration here — and never
  // leaks to a different flight/worktree, since a new flight is a new process
  // with a fresh `undefined`.
  let resumeSessionId: string | undefined;
  // Cost semantics v3: one scan for the whole flight (see LoopDeps.scanUsagePool).
  const machineWide30dListPriceUsd = deps.scanUsagePool ? await deps.scanUsagePool() : null;

  while (iterations < max) {
    if (await deps.stopRequested()) return { firings: iterations, stoppedBy: 'stop' };

    const firing = await deps.nextFiring();
    const retro = firing % config.retroEvery === 0;
    const prompt = await deps.buildPrompt(firing, retro);

    // MODEL ROUTING v1: swap in this firing's routed model, keeping
    // `primaryModel` and `resilience.primaryModel` in lockstep — `firing.ts`
    // compares `modelTry === config.primaryModel` to decide whether the
    // PRIMARY was the one just attempted, so the two fields drifting apart
    // would silently break quota-fallback detection for the whole firing.
    // Routed-budget lockstep (the run-3 death loop): an escalated model with
    // an unscaled budget dies mid-firing — when buildPrompt routes a model it
    // may also scale this one firing's budget; both overrides compose.
    const routedModel =
      prompt.primaryModel !== undefined && prompt.primaryModel !== config.primaryModel
        ? prompt.primaryModel
        : undefined;
    const routedBudget =
      prompt.maxBudgetUsd !== undefined && prompt.maxBudgetUsd !== config.maxBudgetUsd
        ? prompt.maxBudgetUsd
        : undefined;
    const firingConfig: EngineConfig =
      routedModel !== undefined || routedBudget !== undefined
        ? {
            ...config,
            ...(routedModel !== undefined
              ? {
                  primaryModel: routedModel,
                  resilience: { ...config.resilience, primaryModel: routedModel },
                }
              : {}),
            ...(routedBudget !== undefined ? { maxBudgetUsd: routedBudget } : {}),
          }
        : config;

    const outcome = await fire(deps.firing, firingConfig, {
      firing,
      promptText: prompt.text,
      promptVersion: prompt.version,
      retro,
      state,
      machineWide30dListPriceUsd,
      // exactOptionalPropertyTypes: omit the key entirely rather than set it
      // to `undefined` — FiringInput's `resumeSessionId?: string | null`
      // accepts a missing key or an explicit null/string, not `undefined`.
      ...(resumeSessionId !== undefined ? { resumeSessionId } : {}),
    });
    state = outcome.state;
    // Resume scope narrowed (founder policy 2026-08-20, docs/epics/
    // 0009-warm-sessions.md verdict): the confound-controlled measurement over
    // 197 resumed firings showed BLANKET resume costs more than it saves
    // (-$1.28/firing, -$0.79/turn, ~312 fresh-input tokens saved) — the giant
    // resumed context makes every turn dearer than the ORIENT it skips. A
    // session is carried forward ONLY out of a CHECKPOINTED firing, where the
    // next firing must continue a half-done unit and that context is the
    // whole point of resuming.
    resumeSessionId =
      outcome.gateResult === 'checkpointed' ? (outcome.sessionId ?? undefined) : undefined;
    await deps.saveState(state);
    if (deps.onFiringComplete) await deps.onFiringComplete(outcome);

    consecBad = outcome.bad ? consecBad + 1 : 0;
    if (consecBad >= CONSEC_BAD_ALERT) {
      deps.log(`ALERT: ${consecBad} consecutive failed/truncated firings`);
    }
    // Surface containment/read-hygiene guard denials so a firing bouncing off
    // the boundary is visible in the flight log, not silent (board
    // web-msnqqjmd-9bx0wd) — only when >0, to keep a clean firing quiet.
    if (outcome.guardDenials > 0) {
      deps.log(
        `guard denied ${outcome.guardDenials} tool call(s) this firing (containment / read-hygiene)`,
      );
    }
    iterations++;

    if (await deps.stopRequested()) return { firings: iterations, stoppedBy: 'stop' };

    if (outcome.globalExhaust) {
      const minutes = hibernateMinutes(state, config.resilience);
      deps.log(`GLOBAL quota exhaustion — hibernating ${minutes} min`);
      await deps.sleep(minutes);
    } else {
      await deps.sleep(await deps.nextPaceMin());
    }
  }

  return { firings: iterations, stoppedBy: 'max-iterations' };
}
