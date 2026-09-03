<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# EVALUATION — the road to 100%: what actually stands between 87% and SOTA (2026-08-20)

Founder directive: _"בחן אותו לעומק, נתח אותו, הבן אותו... חשוב על פתרון... כדי להגיע
ל-100%... המערכת חייבת להגיע ולהיות במצב SOTA"_. This is the judgment layer over
1,024 lifetime firings of local telemetry plus a focused external-research pass
(sources in `RESEARCH-LIBRARY.md`, "Where SOTA actually is" entry). Every number
below is queryable from the store — nothing is estimated except where marked.

## 1. Where the system stands (measured, era-segmented)

| Era | n | passed | checkpointed | no-commit | reverted |
| --- | --- | --- | --- | --- | --- |
| All-time | 1,024 | 85% | 8% | 7% | 0.1% (ONE, ever) |
| Post-calibration (≥08-17 18:00) | 65 | 74% | 14% | 11% | 2% |
| Finish-line era (≥08-20 12:00) | 15 | **87%** | **0%** | 7% | 7% |

The arc of the last four days: 47% → 65% → 71% → 80% → **87%**, each step from a
measured failure class getting a mechanical fix (escalation calibration → silent
downgrade breaker → machine budget as code → narrowed resume + finish-line
extension). The finish-line era's zero checkpoints is the newest mechanism
working: both wild extensions rescued cap deaths into gate-green ships.

External calibration: the 2026 industry band for production agent success is
74.8–80% (GuardianAgentBench's best config 74.8; Spotify's Honk at ~80% with an
LLM judge); the 98%+ claims come from narrow or self-interested benchmarks. Our
deterministic gate → sha cross-check → additive revert chain is precisely the
"verification-first" architecture the 2026 literature converged on. **At 87%
per-firing with un-fakeable verification, the loop is already at or above
reported SOTA. The remaining gap is NOT in the single-agent loop.**

## 2. The honest end-to-end number — and why 87% is not the real metric

Today's three rounds (7-way, 10-way, 5-way; 56 firings, $234.42):

| Stage | Survival |
| --- | --- |
| Firings → gate-verified ships | 44/56 (79%) |
| Ships → surviving the fleet MERGE (twins dropped) | 37/44 (84%) |
| **End-to-end: firings → durable value on main** | **37/56 (66%), $6.34/surviving ship** |

A shipped duplicate is a 100% ship and a 0% value: at 5–10-way, **merge-time twin
drops cost more value than gate failures do** (7 ships dropped today: two
`tasks_reorder` twins, an auto-declare relay twin, a whole wordmark system, an
`evaluationLabelSummary` twin, a `guardDenials` self-twin, a gh-babysitting twin).
"100%" must therefore be defined on the END-TO-END chain, not the firing:

> **SOTA state (the target): every firing either lands durable value on main, or
> returns a machine-actionable verdict that reduces future spend. Nothing silent,
> nothing duplicated, nothing lost.**

## 3. The loss stack, class by class (deep analysis)

### 3.1 Merge-dropped twins — 13pp of the end-to-end gap, the #1 lever

Root mechanics (all observed live, all recorded in RESEARCH-LIBRARY):
slice-relay re-picking (claim released between firings → sibling rebuilds the
same next increment before its digest catches up), module-creation races
(intent declared too late or never — board picks only auto-declare since
`8f2b4ee`, which no round has yet flown), and convergent attraction (two
instances drawn to the same maintenance-flavored activity class).

2026 research consensus on parallel coding agents names five duplicate-work
defenses: spec-scoped decomposition, worktree isolation, atomic claiming,
coordinator/verifier separation, sequential gated merges. **We have four of the
five.** The missing one — the structural one — is *spec-scoped decomposition*:
our board is PULL-based (any instance may pick any open task), while the
cohesion-aware-partitioning literature (Co-Coder) couples allocation to the
dependency/file graph so agents receive DISJOINT scopes up front.

**Solution (seeded, FLEET SCOPE PARTITIONER):** at fleet takeoff, partition the
top-of-board into per-instance scopes keyed by primary path/area (the
`likelyPrimaryPathFromTitle` signal already exists), inject each instance's
scope into its FLEET section, and have claiming REFUSE picks outside the
instance's scope while siblings fly. Pull-based stays for solo flights.
Target metric: merge-dropped ships → 0; measure per round.

### 3.2 No-commit firings — ~7pp, now cheap but still silent

Anatomy of all 70 lifetime no-commits: 55 of 70 burned >$2.50 ($255 total), and
they cluster in the pre-fix eras — the worst were silent-downgrade era
`opus-4-8` burns ($5 for 5–10 truncated turns) that the substitution breaker
has since eliminated. The finish-line era's single no-commit cost $0.96/16t —
the class is already collapsing in cost. What remains wrong is that a noop is
SILENT: "no-safe-unit-found" / "orient-review" verdicts are real information
(the task is stale, the slice is too big, the area is claimed) that today dies
in a log line.

**Solution (seeded, NOOP→VERDICT):** a firing that ends with no commit MUST end
with a machine-actionable board verdict — split/close/deprioritize/report-blocked
via the existing PROPOSALS channel (approval-gated, un-fakeable telemetry
unchanged) — and telemetry counts a verdict-carrying noop as *contributed*,
a silent noop as waste. Target: silent-noop rate → 0; noop cost stays <$1.5.

### 3.3 Checkpoint residue — ~0 in the new era, watch only

Lifetime: 82 checkpoints, 72% recovered by a later ship on the same track.
The finish-line extension now intercepts the class at its source (2/2 rescued
on day one). Residual = extension-also-failed → checkpoint, which is the
correct safety net. No new machinery; keep measuring `record.extended`
economics vs the -$1.28/firing blanket-resume baseline it replaced.

### 3.4 Reverted commits — 0.1% lifetime, a non-problem

ONE revert in 1,024 firings (a typecheck failure the agent didn't run before
committing; the gate caught it, the additive revert preserved history). At this
rate, machinery would cost more than the class. Discipline stays in the prompt;
the gate stays the floor. No action.

### 3.5 What is deliberately NOT chased

100% per-firing ship rate is a Goodhart trap this repo already documented (the
false-close taxonomy): forcing every firing to commit produces fake slices, not
value. The un-fakeable chain (gate → sha → HEAD → predicate verifier →
byte-review at landing) stays sovereign; the target is 100% *accounted value*,
where an honest, cheap, verdict-carrying "no" is a contribution.

## 4. The program (all levers measurable, most already live)

| # | Lever | Class | Status | Target metric |
| --- | --- | --- | --- | --- |
| 1 | Finish-line extension | checkpoints | LIVE (2/2 rescued) | checkpoint rate ≤2%, extension ship rate >60% |
| 2 | Narrowed resume | economics | LIVE (resumed=0) | resume only after checkpoint; $-drain 0 |
| 3 | Auto-declare on claim | twins | LIVE, unmeasured | first measured round: module twins → 0 |
| 4 | Slice ledger + pre-commit sibling scan | twins | queued (2/3, 3/3) | relay twins → 0 |
| 5 | **Fleet scope partitioner** | twins | **seeded now** | merge-dropped ships → 0 |
| 6 | **Noop→verdict** | silent waste | **seeded now** | silent-noop rate → 0 |
| 7 | Operator-pinned order | steering | LIVE (v16) | operator chain always worked first |
| 8 | Claim sweep + reaper | ghost state | sweep LIVE; reaper queued | in_progress ghosts = 0 |

Projected end-to-end at program completion (arithmetic, not hope): ships 87–90%
of firings with twins at ~0 and noops verdict-carrying → **durable-value
capture ≥90%, with the residual ≤10% being honest, cheap, information-carrying
"no"s** — which is what 100% means in a system that refuses to fake work.

## 5. Verdict

The single-agent loop is at SOTA now — externally calibrated, un-fakeably
verified. The system's remaining distance to "SOTA state" is a COORDINATION
distance (partitioning) and an ACCOUNTING distance (silent noops), both with
seeded, measurable fixes. The next fleet round is the first that flies with
auto-declare live; fly it, measure twins, then land levers 4–6 in order.
