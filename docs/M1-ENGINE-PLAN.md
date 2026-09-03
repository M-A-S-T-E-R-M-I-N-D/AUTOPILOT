<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# M1 — Engine port plan (faithful TypeScript port of the proven v2.4 loop)

> Grounded in a read-only study of the proven engine (the internal v2.4 autopilot loop, `the internal v2.4 loop script`, 308 lines —
> mechanism only; the predecessor product code is confidential). This is the strangler-fig port: behaviorally identical, verified
> against the working script, built as small gate-able TDD slices. DoD (ACTION-PLAN M1): on a sandbox repo, runs headless
> and ships ≥1 **gated** commit (tree green or reverts clean); telemetry lands in SQLite; STOP honored within ~1 min.

## The v2.4 mechanism (what we port)

One external loop over `claude -p`, one **atomic firing** per iteration:

1. **STOP check** → exit if the STOP sentinel exists.
2. **Firing number** = count of telemetry records + 1; every `RETRO_EVERY`th firing is a runner-triggered RETRO (prompt appendix, no work item).
3. **Model selection (adaptive resilience):** honor a persisted `consecQuota` streak — after `promoteAfter` consecutive primary (fable) quota-fallbacks, **start on the fallback directly** (skip the wasted primary attempt); **re-probe** the primary only after a **time cooldown** (`reprobeCooldownMin`, tracking the real reset window).
4. **Invoke** the CLI (base args + chosen model). Parse the JSON envelope.
5. **Quota detection** (primary only): a per-turn billing/rate-limit/quota signal (NOT overloaded/server errors — those are the CLI's own `--fallback-model`'s job). On quota hit → `consecQuota++`, set cooldown, **refire once on the fallback**. A clean primary run clears the streak.
6. **Global exhaustion:** if the FINAL attempt is ALSO quota-blocked → BOTH models are out (weekly/account limit) → `consecGlobalExhaust++` → **hibernate** with escalating backoff (`base·2^(n−1)`, capped) instead of spinning into the wall.
7. **Un-fakeable telemetry:** prefer the iteration's self-reported `METRICS:{…}` line; cross-check `sha` (git cat-file) and HEAD-advance. If the self-report is missing but HEAD advanced, **derive** item/kind/sha from the commit (`iterMetrics='inferred'`) so the scoreboard is never blinded. Envelope facts (cost/tokens/turns/duration/stop_reason) come from the CLI JSON. One JSONL record per firing.
8. **Cost/churn guard:** track consecutive bad firings (error / max-turns / envelope-error / non-zero exit); alert at ≥2.
9. **Pace:** on global exhaustion → hibernate; else **adaptive cadence** from observed rolling spend vs soft hourly/weekly caps. All sleeps are **STOP-aware** (1-min chunks).
10. **Single-instance guard** (named mutex on Windows) + persisted runner state (streaks + cooldown) surviving restarts.

## The TS design (hexagonal — ports already fixed at M0 in `packages/engine/src/ports.ts`)

**Pure core (no I/O — fully unit-testable):** `packages/engine/src/`
- `resilience.ts` — quota-fail detector + the model-selection/quota/global-exhaustion **state machine** + hibernate backoff. **← first slice, this session.**
- `telemetry.ts` — parse the `METRICS:{…}` self-report; resolve iteration fields (prefer self-report, else derive-from-commit); build the telemetry record; compute `maxTurnsHit`, `startedOn`, `bad`.
- `firing.ts` — orchestrate one firing over the ports (Model/Gate/Vcs/Store/Clock/Stop), wiring the pure core.
- `loop.ts` — the outer loop: firing-count, retro cadence, STOP-aware sleep, hibernate vs pace.

**Adapters (thin, impure):** `packages/engine/src/adapters/`
- `claude-cli.ts` (ModelPort) — spawn `claude -p` with the base args; **discover the binary from PATH** (never hardcode a personal path); Windows `.cmd`/quoting hardening + long-prompt-via-stdin (MdViewer §1).
- `git.ts` (VcsPort) — `rev-parse HEAD`, `cat-file -e <sha>^{commit}`, `log -1`, commit, revert.
- `sqlite-store.ts` (StorePort) — write events + the metrics row via `@autopilot/store`.
- `fs-control.ts` — STOP sentinel, single-instance lock (cross-platform: `O_EXCL` lockfile + PID liveness), persisted runner state, prompt load + SHA-256 version.
- `clock.ts` (ClockPort) — injectable `nowEpoch()` for deterministic tests.

**Config** — ported constants (primary/fallback model, effort, promoteAfter=3, reprobeCooldownMin=45, maxTurns, maxBudgetUsd, hibernate base/max, retroEvery=10), overridable per project (SOUL) later.

## TDD slice order (each gated green + committed)
1. **`resilience.ts`** (this session) — detectQuotaFail; selectModel; applyPrimaryOutcome; applyGlobalExhaustion; hibernateMinutes. Exhaustive tests: promote-on-exhaustion, time-cooldown re-probe, clear-on-clean, escalating hibernate cap.
2. `telemetry.ts` — self-report parse, inferred-from-commit degradation, record build.
3. Adapters with faked process/fs (integration-light).
4. `firing.ts` over fake ports — the atomic firing, sha/HEAD cross-check, revert-on-red.
5. `loop.ts` — STOP within ~1 min, retro cadence, hibernate vs pace, single-instance.
6. **Sandbox e2e** — a throwaway git repo; assert ≥1 gated commit + a telemetry row + STOP honored. Verify field-by-field against the v2.4 record shape.

## Dogfooding (M1 DoD)
Register AUTOPILOT's own repo as tracked project #1; the self-test loop begins. Never `main`/force-push; additive only.
