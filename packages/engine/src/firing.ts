// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The atomic firing (ENGINE-RESEARCH G4/G5; `docs/M1-ENGINE-PLAN.md`): one unit
 * of autonomous work, orchestrated over the hexagonal ports. Faithful to the
 * proven v2.4 sequence — model selection with quota resilience → invoke →
 * quota-fallback refire → global-exhaustion detection → un-fakeable sha/HEAD
 * cross-check → telemetry — and HARDENED with the founder's mandate: the engine
 * itself runs the gate after a commit and **additively reverts** (never
 * `reset --hard`) any commit that fails it, so a firing either stays green or
 * reverts cleanly.
 */

import {
  selectModel,
  detectQuotaFail,
  isFailure,
  applyPrimaryOutcome,
  applyGlobalExhaustion,
  type ResilienceState,
  type AttemptOutcome,
} from './resilience.js';
import {
  parseMetricsLine,
  parseProposalsLine,
  resolveIteration,
  buildFiringRecord,
  isBadFiring,
  mergeEnvelopeFacts,
  type EnvelopeFacts,
  type FiringContext,
  type FiringRecord,
  type GateResultKind,
  type GateCheckResult,
} from './telemetry.js';
import type {
  ModelPort,
  VcsPort,
  GatePort,
  GateResult,
  StorePort,
  ClockPort,
  ModelResponse,
} from './ports.js';
import type { EngineConfig } from './config.js';

export interface FiringDeps {
  readonly model: ModelPort;
  readonly vcs: VcsPort;
  readonly gate: GatePort;
  readonly store: StorePort;
  readonly clock: ClockPort;
}

export interface FiringInput {
  readonly firing: number;
  readonly promptText: string;
  readonly promptVersion: string;
  readonly retro: boolean;
  readonly state: ResilienceState;
  /**
   * The prior firing's CLI session id, when one is on hand for THIS flight
   * (docs/epics/0009-warm-sessions.md) — passed through to the model port so
   * it can `--resume` instead of cold-spawning. `null`/absent means no valid
   * session is available and the firing cold-spawns as it always has; the
   * fallback is implicit (undefined simply never reaches `--resume`), not a
   * branch this function has to make.
   */
  readonly resumeSessionId?: string | null;
  /**
   * Cost semantics v3 (docs/epics/0013-cost-semantics-v3.md) — this
   * FLIGHT's machine-wide trailing-30-day list-price pool total, computed
   * ONCE by `loop.ts` (not per firing) and threaded through unchanged for
   * every firing in the flight. `null` when unconfigured or unreadable.
   */
  readonly machineWide30dListPriceUsd: number | null;
}

export interface FiringOutcome {
  readonly record: FiringRecord;
  /** The resilience state to persist for the next firing. */
  readonly state: ResilienceState;
  readonly globalExhaust: boolean;
  /** Cost/churn signal (error / max-turns / envelope-error / non-zero exit). */
  readonly bad: boolean;
  readonly gateResult: GateResultKind;
  /**
   * This firing's own CLI session id (from the final attempt's envelope), for
   * the loop to hand to the NEXT firing as {@link FiringInput.resumeSessionId}
   * — `null` when the envelope never arrived or carried none, which is also
   * the fallback-to-cold-spawn signal for that next firing.
   */
  readonly sessionId: string | null;
  /**
   * PreToolUse guard denials the final model attempt hit this firing (see
   * `ModelResponse.guardDenials`, board web-msnqqjmd-9bx0wd) — `0` when a
   * streaming driver saw none, `0` too for a non-streaming driver that can't
   * observe them. Lets the loop surface a "guard denied N tool call(s)"
   * line so a firing repeatedly bouncing off containment/read-hygiene is
   * visible in the flight log, not silent.
   */
  readonly guardDenials: number;
}

/** Distill a raw CLI response into the pure quota-detection inputs (v2.4's probe). */
function attemptOutcome(resp: ModelResponse): AttemptOutcome {
  const env = resp.envelope;
  // Stryker disable next-line LogicalOperator,StringLiteral: env.result's
  // fallback is unobservable when env.result is absent — resilience.ts's
  // QUOTA_PATTERN.test() below only cares whether a quota phrase appears
  // ANYWHERE in probeText, and a present env.result carries the agent's own
  // words, never the CLI's quota-fail phrasing (that lives in
  // apiErrorStatus, still live below). Provably equivalent, not killable.
  const resultText = env?.result ?? '';
  // Stryker disable next-line StringLiteral: only the FALLBACK TEXT is
  // unobservable here (same QUOTA_PATTERN reasoning as above) — the `??`
  // itself stays live: when apiErrorStatus carries the real quota phrase,
  // erasing it changes detectQuotaFail's verdict (see the "isError alone
  // signals quota" test).
  const apiErrorStatus = env?.apiErrorStatus ?? '';
  const probeText = env ? `${resultText} ${apiErrorStatus}` : resp.stdout;
  return {
    parsed: env !== null,
    // Stryker disable next-line BooleanLiteral: this fallback only applies
    // when env is null, and `parsed: env !== null` is false in exactly that
    // case — resilience.ts's `failed = !parsed || isError || …` is already
    // forced true by `!parsed` alone, so isError's fallback value can never
    // change detectQuotaFail/isFailure's verdict. Provably equivalent, not
    // killable.
    isError: env?.isError ?? false,
    exitCode: resp.exitCode,
    probeText,
  };
}

/**
 * Envelope facts the agent cannot fake, taken from the CLI JSON. When the
 * envelope itself never arrived (killed mid-firing), falls back to the last
 * streamed usage snapshot instead of leaving turns/tokens flatly null — see
 * `ModelResponse.partialUsage` (DEATH-COST capture, docs/EVALUATION-2026-08.md
 * §3.6). Cost is never invented from tokens — it stays null (unknown) rather
 * than a fabricated $0.
 */
function envelopeFacts(resp: ModelResponse, modelTry: string): EnvelopeFacts {
  const env = resp.envelope;
  const partial = env ? null : (resp.partialUsage ?? null);
  return {
    model: env?.modelUsed ?? partial?.modelUsed ?? modelTry,
    exitCode: resp.exitCode,
    isError: env ? env.isError : null,
    stopReason: env?.stopReason ?? null,
    numTurns: env?.numTurns ?? partial?.turnsObserved ?? null,
    durationMs: env?.durationMs ?? null,
    costUsd: env?.costUsd ?? null,
    tokensIn: env?.tokensIn ?? partial?.tokensIn ?? null,
    tokensOut: env?.tokensOut ?? partial?.tokensOut ?? null,
    cacheRead: env?.cacheRead ?? null,
    cacheCreate: env?.cacheCreate ?? null,
  };
}

/** The text to scan for the METRICS self-report — the envelope result, else raw stdout. */
function resultTextOf(resp: ModelResponse): string {
  const result = resp.envelope?.result;
  return result ? result : resp.stdout;
}

/** Run one atomic firing over the injected ports. */
export async function runFiring(
  deps: FiringDeps,
  config: EngineConfig,
  input: FiringInput,
): Promise<FiringOutcome> {
  const nowEpoch = deps.clock.nowEpochSec();
  const ts = deps.clock.nowIso();
  const headBefore = await deps.vcs.head();

  // ---- model selection + invoke (with quota resilience) ----
  const selection = selectModel(input.state, config.resilience, nowEpoch);
  let modelTry = selection.modelToTry;
  let attempts = 1;
  let quotaFallback = false;
  const resumeSessionId = input.resumeSessionId ?? undefined;

  let resp = await deps.model.invoke(modelTry, input.promptText, resumeSessionId);

  let state = input.state;
  const attemptedPrimary = modelTry === config.primaryModel;
  let quotaHit = false;
  if (attemptedPrimary) {
    const primary = attemptOutcome(resp);
    quotaHit = detectQuotaFail(primary);
    state = applyPrimaryOutcome(state, config.resilience, nowEpoch, {
      attemptedPrimary: true,
      quotaHit,
      primaryFailed: isFailure(primary),
    });
  }

  if (quotaHit) {
    modelTry = config.fallbackModel;
    attempts = 2;
    quotaFallback = true;
    resp = await deps.model.invoke(modelTry, input.promptText, resumeSessionId);
  }

  // ---- un-fakeable cross-checks ----
  let headAfter = await deps.vcs.head();
  let headAdvanced = headAfter !== '' && headAfter !== headBefore;

  // ---- FINISH-LINE EXTENSION (founder policy 2026-08-20) ----
  // The firing ended MID-UNIT: no commit, uncommitted WIP in the tree.
  // Measured economics say a checkpoint hand-off is the EXPENSIVE path (a
  // fresh firing re-pays orientation; blanket session-resume itself measured
  // -$1.28/firing over 197 resumed firings) — so before packing a checkpoint,
  // the SAME worker gets ONE bounded extension of its own session: a smaller
  // tap (finishLineCaps), an explicit notification that this is happening,
  // and the cut-a-slice rule for a unit too big to close. Requires the dying
  // attempt's own session id (no session = nothing to extend — a hard-killed
  // CLI left no envelope); never loops (one extension, then the checkpoint
  // safety net below exactly as before).
  const firstResp = resp;
  const ownSessionId = resp.envelope?.sessionId ?? null;
  let extended = false;
  if (!headAdvanced && ownSessionId !== null && (await deps.vcs.isDirty())) {
    extended = true;
    resp = await deps.model.invoke(
      modelTry,
      finishLinePrompt(input.firing),
      ownSessionId,
      finishLineCaps(config),
    );
    headAfter = await deps.vcs.head();
    headAdvanced = headAfter !== '' && headAfter !== headBefore;
  }

  // ---- global exhaustion: the FINAL attempt is also quota-blocked ----
  const globalExhaust = detectQuotaFail(attemptOutcome(resp));
  state = applyGlobalExhaustion(state, globalExhaust);

  let commit = headAdvanced ? await deps.vcs.lastCommit() : null;

  // ---- the gate: verify a fresh commit, additively revert on red ----
  let gateResult: GateResultKind = 'no-commit';
  let gateChecks: readonly GateCheckResult[] = [];
  let checkpointError: string | null = null;
  let gateError: string | null = null;
  if (headAdvanced && (await deps.vcs.isDirty())) {
    // GATE HOLE (board web-mtb8i2i8-8l9zut): the gate runs the project's
    // commands against the WORKING TREE, not the commit — if uncommitted
    // changes are still sitting on top of the fresh commit, a green gate
    // reflects that contaminated tree, not the commit telemetry is about to
    // certify as verified. Same non-verdict as a crashed gate: leave the
    // commit in place (dirty is not proof it's bad) and refuse to call it
    // 'passed' on evidence that never actually judged it in isolation.
    gateResult = 'unverifiable';
    gateError =
      'refused: uncommitted changes remain after the commit — the gate cannot verify the commit in isolation';
  } else if (headAdvanced) {
    let gate: GateResult;
    try {
      gate = await deps.gate.run();
    } catch (error) {
      // The gate PORT itself threw — e.g. RemediatingGate's autoformat commit
      // or its revert hit a git failure (hook rejection, lock contention) —
      // rather than returning a crashed GateResult. loop.ts has no try/catch
      // around runFiring, so left unguarded this would kill the whole flight
      // on one flaky remediation step. Same non-verdict as `crashed`: leave
      // the commit in place, the reason rides along instead of vanishing.
      gateError = error instanceof Error ? error.message : String(error);
      gate = { ok: false, crashed: true };
    }
    gateChecks = gate.checks ?? [];
    if (gate.ok) {
      gateResult = 'passed';
    } else if (gate.crashed) {
      // The gate crashed before it could judge the work (missing dep/OOM/tool
      // error) — that is NOT the same as the work failing. Leave the commit in
      // place; the operator/next firing can re-run the gate on a healthy env.
      gateResult = 'unverifiable';
    } else {
      // GATE HOLE 3 (board web-mtb8hghd-72z52z): pass headBefore so a firing
      // that made MORE THAN ONE commit gets all of them reverted, not just
      // the tip — `headAdvanced` alone can't distinguish one commit from many.
      //
      // The revert itself can fail, and until now that throw escaped
      // runFiring uncaught and killed the whole flight loop (runLoop and both
      // fly.ts/flight.ts callers only have a `finally`). Reachable ways in:
      // a merge commit anywhere in the range (git needs -m and isn't given
      // it), and a tree re-dirtied by the gate's own build step between the
      // dirty check above and here. A failed revert is honestly
      // 'unverifiable' — the work is neither green nor undone — and saying so
      // in telemetry beats crashing with the commit silently left in place.
      try {
        await deps.vcs.revertLast(headBefore);
        gateResult = 'reverted';
      } catch (err) {
        gateResult = 'unverifiable';
        gateError = `gate failed AND the revert failed — the commit is still in history: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    }
  } else if (await deps.vcs.isDirty()) {
    // ZERO-WORK-LOSS: the firing died mid-unit (budget/turns/crash) leaving
    // uncommitted WIP. Pack it up as a checkpoint commit so nothing is ever
    // stranded — the NEXT firing is instructed (see the firing prompt) to
    // finish this unit first. Honest telemetry: not shipped, but not lost.
    try {
      await deps.vcs.commitAll(wipCheckpointMessage(input.firing));
      gateResult = 'checkpointed';
      // The checkpoint commit landed AFTER `commit` was captured above (still
      // null — headAdvanced was false, which is why we're in this branch).
      // Refresh it so `commitSubject` reports the real checkpoint commit
      // instead of null — otherwise HONEST HEADLINES has nothing to show and
      // falls back to a "nothing committed" message that is now false.
      commit = await deps.vcs.lastCommit();
      // GATE HOLE 4 (board web-mtb8i2jo-5g4fo5): a checkpoint used to carry
      // ZERO gate evidence — 'checkpointed' telemetry with an empty
      // gateChecks was indistinguishable from "never checked" and "checked
      // and green". Run the SAME gate here for honest telemetry ONLY: never
      // revert on red — the whole point of a checkpoint is to preserve the
      // WIP the next firing is instructed to finish, and reverting it would
      // destroy exactly the work ZERO-WORK-LOSS exists to protect. A crashed
      // gate port is swallowed into gateError exactly like the real-commit
      // path above; the checkpoint survives either way.
      try {
        const gate = await deps.gate.run();
        gateChecks = gate.checks ?? [];
      } catch (error) {
        gateError = error instanceof Error ? error.message : String(error);
      }
    } catch (error) {
      // an un-committable tree (e.g. nothing stageable) stays 'no-commit' —
      // but the reason rides along in telemetry instead of vanishing.
      checkpointError = error instanceof Error ? error.message : String(error);
    }
  }

  // ---- D4 file lens (epic 0015, board web-mtdc6wq3-5wuc6i) ----
  // A gate-PASSED firing's net headBefore→headAfter diff becomes
  // `FiringRecord.filesTouched` (→ the exporter's `autopilot.files` span
  // attribute — the file-collision signal the pipeline view's file lens
  // groups by). Only 'passed' counts as shipped: reverted work is undone,
  // and unverifiable/checkpointed work is not certified — those omit the
  // field entirely, per the record contract's "never a fabricated empty
  // list". A RemediatingGate autoformat commit lands AFTER headAfter was
  // captured, so its (format-only) paths are outside this range by design.
  const filesTouched =
    gateResult === 'passed' ? await deps.vcs.changedFiles(headBefore, headAfter) : [];

  // ---- telemetry (prefer self-report; derive from commit; never blind) ----
  const parsed = parseMetricsLine(resultTextOf(resp));
  const envelopeOk = resp.envelope !== null;
  const iter = resolveIteration(parsed, { envelopeOk, headAdvanced, commit });
  const shaVerified =
    iter.sha !== null ? await deps.vcs.commitInFiringRange(iter.sha, headBefore, headAfter) : false;

  // FINISH-LINE EXTENSION accounting: resource fields SUM across both
  // invocations (honest total spend), status fields come from the FINAL
  // attempt. `resumed` stays the ORIGINAL invocation's value — an extension
  // is by definition a resumed call, and letting it ride would poison the
  // warm-sessions economics measurement this policy is built on. The turns
  // bound widens by the extension's own cap so a rescued firing that ended
  // cleanly is not branded a cap death by its summed turn count.
  const env = extended
    ? mergeEnvelopeFacts(envelopeFacts(firstResp, modelTry), envelopeFacts(resp, modelTry))
    : envelopeFacts(resp, modelTry);
  const guardDenials = extended
    ? (firstResp.guardDenials ?? 0) + (resp.guardDenials ?? 0)
    : (resp.guardDenials ?? 0);
  const guardDenialDetails = extended
    ? [...(firstResp.guardDenialDetails ?? []), ...(resp.guardDenialDetails ?? [])]
    : (resp.guardDenialDetails ?? []);
  // THIRD CAP surfacing (record timeout deaths, board web-mt1w1ime-pohh9d):
  // true when EITHER attempt this firing made was killed by the CLI's own
  // wall-clock cap — distinct from an ordinary crash/quota-exhaustion
  // envelope-error, so the flight log can explain WHY an envelope-less row
  // died instead of collapsing it into the generic 'error' bucket (see
  // read/source.ts's parseFiringDeath in the dashboard app).
  const timedOut = (firstResp.timedOut ?? false) || (resp.timedOut ?? false);
  const turnsBound = extended ? config.maxTurns + finishLineCaps(config).maxTurns : config.maxTurns;
  const ctx: FiringContext = {
    ts,
    firing: input.firing,
    promptVersion: input.promptVersion,
    retro: input.retro,
    attempts,
    quotaFallback,
    startedOn: selection.startedOn,
    quotaStreak: state.consecQuota,
    globalExhaust,
    headAdvanced,
    headBefore,
    headAfter,
    shaVerified,
    gateResult,
    gateChecks,
    resumed: firstResp.resumed ?? null,
    guardDenials,
    guardDenialDetails,
    subscriptionPriceUsd: config.subscriptionPriceUsd,
    machineWide30dListPriceUsd: input.machineWide30dListPriceUsd,
  };
  // Task proposals ride the same persisted record (events payload) so the
  // flight harness can surface them on the operator's board for APPROVAL.
  const proposals = parseProposalsLine(resultTextOf(resp));
  const record: FiringRecord = {
    ...buildFiringRecord(ctx, env, iter, turnsBound, commit?.subject ?? null),
    ...(filesTouched.length > 0 ? { filesTouched } : {}),
    ...(proposals.length > 0 ? { proposals } : {}),
    ...(checkpointError !== null ? { checkpointError } : {}),
    ...(gateError !== null ? { gateError } : {}),
    ...(extended ? { extended: true } : {}),
    ...(timedOut ? { timedOut: true } : {}),
  };
  await deps.store.recordFiring(record);

  const bad = isBadFiring(env, iter.iterMetrics, record.maxTurnsHit);
  return {
    record,
    state,
    globalExhaust,
    bad,
    gateResult,
    sessionId: resp.envelope?.sessionId ?? null,
    guardDenials,
  };
}

/** The extension's share of the firing's own caps — a "slightly more open
 *  tap" (founder's words), not a second full budget. */
const FINISH_LINE_SHARE = 0.4;
/** Floors that keep a tiny-budget firing's extension usable at all. */
const FINISH_LINE_MIN_TURNS = 10;
const FINISH_LINE_MIN_BUDGET_USD = 1;

/** The bounded caps a finish-line extension invocation runs under. */
export function finishLineCaps(config: EngineConfig): { maxTurns: number; maxBudgetUsd: number } {
  return {
    maxTurns: Math.max(FINISH_LINE_MIN_TURNS, Math.round(config.maxTurns * FINISH_LINE_SHARE)),
    maxBudgetUsd: Math.max(
      FINISH_LINE_MIN_BUDGET_USD,
      Math.round(config.maxBudgetUsd * FINISH_LINE_SHARE * 100) / 100,
    ),
  };
}

/**
 * The extension prompt — it IS the operator-mandated notification ("we tell
 * the worker this is happening"): why the extension exists, that it is the
 * only one, and the cut-a-slice rule for a unit too big to close.
 */
export function finishLinePrompt(firing: number): string {
  return [
    `FINISH-LINE EXTENSION — firing ${firing} ended MID-UNIT with uncommitted work in the tree.`,
    'You have been granted ONE bounded extension (a fraction of your original caps) because the',
    'economics favor the worker who STARTED a unit FINISHING it — a checkpoint hand-off makes a',
    'fresh firing re-pay orientation.',
    'Rules:',
    '1. Do NOT start anything new. Close the CURRENT unit only.',
    '2. If the unit fits in this extension: finish it, run the gate commands, and commit.',
    '3. If it is TOO BIG to close here: cut at the nearest coherent boundary — commit a',
    '   gate-green SLICE of it NOW (completion: slice) and leave the rest on the board.',
    '4. End with the standard METRICS line describing what you actually did.',
    'This is the only extension — an uncommitted tree after it becomes a checkpoint.',
  ].join('\n');
}

/** The subject prefix the resume rule in the firing prompt keys on. */
export const WIP_CHECKPOINT_PREFIX = 'wip(autopilot): checkpoint';

/**
 * The pack-up commit message for a firing that died mid-unit. Kept under
 * commitlint's 100-char header-max-length (PATTERNS-AND-STANDARDS §8) — a
 * longer header here means the checkpoint commit itself gets rejected by the
 * commit-msg hook, silently stranding the WIP (see WIP_CHECKPOINT_PREFIX).
 */
export function wipCheckpointMessage(firing: number): string {
  return `${WIP_CHECKPOINT_PREFIX} — firing ${firing} died mid-unit; next firing resumes it`;
}
