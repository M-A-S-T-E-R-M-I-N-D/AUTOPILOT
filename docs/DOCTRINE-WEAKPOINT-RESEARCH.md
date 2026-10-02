<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# The weak-point doctrine — find everything, fix at SOTA, learn so it stays fixed

Founder directive (2026-08-20): _research how to find ALL weak points, how to
research SOTA solutions for them, and meta-learn — how this system (and its
pilot) learns and researches._ This document is the operational answer: three
layered protocols plus the pilot's own method audit. Sources and evidence
grades live in `RESEARCH-LIBRARY.md` ("Research-on-research"). Everything here
is wired to this repo's real machinery — nothing is aspirational prose.

## Part I — FINDING weak points: the four-lens discovery stack

No single method finds everything; the 2026 safety literature is explicit that
component-level and system-level methods surface DIFFERENT hazard classes.
Run all four lenses, each with an owner and a cadence.

### Lens 1 — STPA (top-down, systemic): safety as a CONTROL problem

Model the system as a control hierarchy and interrogate every control action
with the four Unsafe Control Action types: (a) not provided when needed,
(b) provided when not needed, (c) too early/too late, (d) wrong
duration/magnitude. STPA finds interaction hazards that decomposition misses —
and our OWN incident history retro-validates it. Every major incident of the
last month maps cleanly to a UCA type:

| Incident (all real, all fixed) | UCA type |
| --- | --- |
| Claim release never fired at flight end (ghost in_progress) | not provided |
| Takeoff triage re-ranked over operator pins | provided when not needed |
| Blanket session-resume (-$1.28/firing) | provided when not needed |
| Budget cap killed mid-unit work (pre-extension) | too early |
| Sync-back silently refused all round (dirty tree) | not provided + no feedback |
| Silent model downgrade (fable→opus-4-8) | feedback channel lied |
| Migration v17 minted twice | two controllers, one process, no arbiter |

AUTOPILOT's control structure (keep this current):
operator → dashboard server → fly.js loop → {CLI agent, gate runner, git
sync-back, store claims} → repo; watchdog → server/flights; landing → main.
Feedback: telemetry, fleet digest, board, SSE. **Cadence: re-run the UCA
table pass after every new control action ships** (an extension, a
partitioner, a reaper — each adds rows).

### Lens 2 — FMEA (bottom-up, component): the ports inventory

For each port/adapter (model, vcs, gate, store, clock, locks, guard hook):
what are its failure modes, and does telemetry SEE them? Cheap, mechanical,
catches what STPA's altitude misses. Cadence: at every new adapter.

### Lens 3 — Chaos / fault injection (empirical): don't trust the analysis

2026 agent-systems research (AgentChaos, ReliabilityBench) injects faults at
the LLM-API/tool/gate boundaries at runtime and finds every system degrades —
up to 50 points of pass@1 — and that robustness is a property of the HARNESS,
not the model. Our unit suites already inject envelope/quota/gate faults;
the gap is RUNTIME injection against a live sandbox flight (truncated
envelopes, SQLITE_BUSY storms, rate-limit bursts, corrupted METRICS lines).
Every experiment needs: steady-state hypothesis, bounded blast radius (the
sandbox repo, never a real target), and an abort guard. Cadence: one chaos
round per milestone, findings → board.

### Lens 4 — Near-miss mining (Safety-II): weak signals BEFORE incidents

Shipped (board web-mt1qat5h-nxzgjs): `flight/near-miss.ts` tallies one
flight's weak signals into a debrief line; `fly.ts`'s post-flight sweep
persists it and flags a class that has stayed nonzero across 3+ consecutive
flights; `read/anomalies.ts` + shell.ts's `🩹 recurring near-miss` chip
surface the verdict on the dashboard — rule 1 below is now live machinery,
not just a stated intent.

Accidents and near-misses share causes; the telemetry already records the
weak signals — guard denials (15 lifetime firings bounced off containment),
intent collisions (4, all caught), autoformat rescues, checkpoint errors,
sync-back refusals, extension rescues (5 ships recovered). Two rules:
1. **A recurring near-miss class gets a board item BEFORE it becomes an
   incident** (the sync-back refusal was a logged near-miss for two days
   before it stranded 144 commits).
2. **Study recoveries as capacities, not just absences of failure**
   (Safety-II): checkpoint→resume chains recover 72%; extensions rescue
   cap-deaths; the guard bounces escapes. Protect and measure these — they
   are why bad rounds end at 47% and not 0%.

## Part II — RESEARCHING solutions at SOTA: the evidence protocol

The rapid-review discipline, bounded to a practical problem, adapted for an
agent operator. Steps, in order, every time:

1. **Decompose the question** before searching — one weakness class per
   query, multiple anglings per class (academic + industry practice +
   practitioner postmortems + gray literature; the AI-benchmark literature is
   explicitly gray-literature-friendly because peer review lags the field).
2. **Multi-modal sweep, then triangulate.** No load-bearing claim from a
   single source. Prefer primary sources for anything that will change code.
3. **Grade the evidence.** The field's own caveats, found this week: 11–57%
   citation-hallucination rates in deployed models; benchmarks authored by
   the benchmarked (7 of 8 authors in one case); self-validated agent scores
   overstating manually-verified ones by up to 4x. Rules: treat every
   citation as a claim to confirm, not a fact; check who funds/authors a
   benchmark; prefer measured production numbers (Spotify's 25%→80%) over
   leaderboard claims; open the actual paper for anything load-bearing.
4. **Calibrate against our own telemetry.** External numbers set the band;
   the store's 1,000+ firings are the ground truth this system answers to.
   Every adopted finding becomes a MEASURABLE lever with a target metric and
   a verify-by date in RESEARCH-LIBRARY — prose without a metric is not a
   finding.
5. **Adversarial self-check before recording**: what would refute this?
   which of my conclusions is a single-source claim? did I stop at the first
   coherent narrative?
6. **Lawful access, always.** Public and open sources only: open-access
   papers (arXiv etc.), vendor docs and blogs, public search. No paywall
   circumvention, no scraping against terms of service, no credentialed or
   private material, no license violations. If the load-bearing source is
   closed, either find an open equivalent, use the abstract plus secondary
   coverage with a DOWNGRADED evidence grade, or ask the operator to obtain
   lawful access. Access constraints never justify fabricating or guessing a
   source's contents.

## Part III — META-LEARNING: how this system learns, mapped to the field

The 2026 self-improvement literature (ERL, GRASP, SAMULE, SkillRL, skill
libraries) converges on findings this repo mostly reached empirically — with
three gaps worth closing:

| Field finding | Our machinery | Status |
| --- | --- | --- |
| Distilled heuristics transfer better than raw trajectories | SOUL + RESEARCH-LIBRARY + lesson banks (never transcripts) | ALIGNED |
| Self-correction unreliable without EXTERNAL feedback | the un-fakeable chain: gate → sha → predicates → byte-review | ALIGNED (it is the founding doctrine) |
| Multi-level reflection: micro/meta/macro | per-firing feedback → per-round eval → cross-round doctrine | ALIGNED |
| Failure taxonomy with root-cause tracing | the loss-stack taxonomy (EVALUATION-2026-08-20-sota) | ALIGNED |
| **Libraries must EVOLVE, not grow** (regression-gated edits; removal is first-class) | SOUL and lesson banks only ever grow | **GAP → SOUL/lesson-prune ritual** |
| **Conflicting-heuristic resolution** at retrieval time | nothing detects contradictory lessons | **GAP → covered by the prune ritual** |
| Learning WHAT-to-learn from failures vs successes differs by task type | near-miss ritual (Lens 4) ships: `flight/near-miss.ts` aggregates a per-flight debrief, `fly.ts`'s post-flight sweep persists it and flags a 3+-flight recurring class, `read/anomalies.ts` + shell.ts's `🩹 recurring near-miss` chip surface it | SHIPPED (board web-mt1qat5h-nxzgjs) |

### The pilot's own method audit (the part that must stay honest)

Failure modes of MY research practice, observed in my own transcripts:
single-pass searches accepted when the first sweep cohered; US-centric
search results; recency bias; secondhand summaries standing in for primary
sources; no adversarial pass over my own synthesis; findings recorded
without verify-by re-checks actually being scheduled. The Part II protocol
IS the correction — and it applies to me before it applies to the fleet.
Standing self-rules: at least one primary source read per research pass;
at least one deliberate refutation query per major conclusion; every pass
ends with "what did I NOT search?"; every entry carries verify-by and the
next session honors it.

## The loop, closed

Lens finds weakness → protocol researches the SOTA fix → fix ships as a
measurable lever → telemetry verifies → lesson distills into
SOUL/RESEARCH-LIBRARY → prune ritual keeps the library sharp → the lenses
run again over the CHANGED system. That closed loop, with un-fakeable
verification at its center, is what "SOTA state" means here — not a score,
a metabolism.
