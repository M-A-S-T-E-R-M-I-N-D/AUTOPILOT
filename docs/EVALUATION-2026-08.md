<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# EVALUATION — 358 firings, $1,056, six days of self-flight (2026-08-13)

Operator-requested retrospective across every dimension at once: efficiency, modularity &
architecture, usability, accessibility, security, cost — mined from the local telemetry
store (`metrics`/`events`/`tasks`), git history, and a static structural pass over the
source tree. Companion to `docs/SELF-STUDY/PAPER.md` (which auto-refreshes the raw data)
and `docs/MODEL-CARD.md`; this file is the *judgment* layer the PAPER's §5 deliberately
leaves unwritten. Every number below is queryable from the store — nothing is estimated.

## 1. The headline numbers

| Measure | Value |
| --- | --- |
| Firings recorded | 358 (355 real-model, 3 scripted-demo) |
| Gate-verified ships | 326 (91.1%) — sha_verified 100% of ships |
| Total self-reported cost | $1,056 · **$3.24 per ship** |
| Checkpoint deaths | 22 ($94.49 = 8.9% of spend) — every one resumed, zero work lost |
| Pure-exploration burns (no commit, no checkpoint) | 10 — **all before 2026-08-09, zero since** |
| Self-report honesty | 325 truthful ships · 5 over-claims caught by the harness · 1 under-claim |
| Model mix | **100% claude-sonnet-5** — no routing to cheaper tiers ever happened in flight |

## 2. What the record proves WORKS (do not re-fix)

- **The gate + revert + sha cross-check.** 5 over-claims were caught mechanically; 0
  false ships reached main. The un-fakeable chain is the product's spine — every future
  refine must preserve it.
- **Checkpoint→resume.** The guard.ts unit killed three consecutive firings (353–355)
  and the fourth finished it for $1.76. Deaths cost 8.9% of spend but recapture ≈ all
  value. Cap-deaths are now a *scheduling* cost, not a loss.
- **Feedback-loop refines stick.** Exploration burns ($24.06 across 10 firings) stopped
  entirely once firing-v6 started injecting the previous failure + exploration trail —
  a measured, permanent fix. Same story for format-only reverts (RemediatingGate) and
  read-hygiene (−19% $/ship when it landed).
- **The proposal loop converts.** 12 of 13 self-proposed tasks shipped. The board's
  self-awareness is real: BUNDLE DIET, local-offload, dead-code sweep, completion-tag
  enforcement were already queued before this evaluation named them.

## 3. Findings by dimension

### 3.1 Cost & efficiency — plateaued, levers known but unpulled

$/ship by day: 3.93 → 3.24 → **2.41** → 2.80 → 4.39 → 3.65 → 3.41. The 08-09 floor
proves ~$2.4 is reachable; the 08-11 spike (RING-0 incident day) shows regressions cost
real money. **There is no downward trend since 08-09** — the remaining levers are
structural, not prompt-level:

- **Single-model monoculture.** Every real firing ran sonnet-5. The `M6 GOLD
  local/cheap offload` board item names 40–70% savings; mechanical-substep model is
  already configurable and unused in practice. This is the #1 unpulled lever.
- **Expensive-unit scheduling.** The top-8 costliest firings are mutation-testing and
  big-UI units ($6.77–$9.86, 89–121 turns) — work that *waits* on slow subprocesses
  burns turns. Mutation slices belong in high-turn-budget firings (or a dedicated
  cheap loop), not the default cadence.
- Cache economics: 2.08B cache-read tokens vs 144K fresh input — context re-reading
  dominates; WARM SESSIONS (queued) attacks the cold-spawn tax directly.

### 3.2 Modularity, architecture & patterns — excellent skeleton, five outsized organs

The hexagonal core is genuinely SOTA: `ports.ts` + 10 engine adapters + 6 onboarding
adapters, pure cores with DI seams everywhere, append-only frozen migrations, machine-
checked architecture diagram (`ci:architecture`), REUSE/SPDX everywhere, and a
2:1 test-to-src file ratio in the dashboard (121:62). Debt markers: **5 TODOs in ~24.5K
lines** — near zero. But the repo violates its own 800-line law in exactly five places:

| File | Lines | Why it matters |
| --- | --- | --- |
| `apps/dashboard/src/web/shell.ts` | **4,761** | The ENTIRE client. Also the root cause of the bundle-budget breach, and the only place where server logic is hand-mirrored ("kept in sync by hand" — callsigns, landing preview). |
| `apps/dashboard/src/server/server.ts` | 1,544 | Router + every handler inline. |
| `apps/dashboard/src/fly.ts` | 958 | Flight orchestration + rituals + wiring in one file. |
| `apps/dashboard/src/read/source.ts` | 952 | Every read-model query in one file. |
| `packages/store/src/read.ts` | 821 | Same shape, store side. |

`shell.ts` is the modularity debt: one file = no code-splitting = bundle overage = the
hand-sync duplication trap. Decomposition (epic 0002) fixes structure, bundle budget,
and duplication with one move. (`font-data.ts` at 1,052 is a generated asset — exempt.)

### 3.3 Usability — strong operator loop, thin newcomer path

Progressive disclosure, live SSE surfaces, honest headlines, Load-More lists, callsigns,
narrator line — the operator experience is deliberate and measured (NN/g-sourced). Open
gaps already on the board: FLIGHT DEBRIEF, queue forecast, anomaly thresholds,
notifications, BE-RIGHT-BACK overlay, i18n/Hebrew/RTL. Structural gap NOT on the board:
none — the queue genuinely covers it. The weakest usability surface is *first-run*
(cross-OS launchers are .cmd-only; deploy playbook step 1 — npm-pack CLI —
is done, see RESEARCH-LIBRARY.md).

### 3.4 Accessibility — gate green, ceiling not yet AA+

axe-core clean is a standing test (WCAG A/AA baseline), keyboard-first reorder shipped
with aria-live announcements, prefers-reduced-motion respected in the office map. AA+
sweep is M8 scope (queued). Risk to watch: the 4,761-line client makes a11y regressions
easy to hide — decomposition helps here too.

### 3.5 Security — layered and scanned, one honest hole, one blind spot

Working: CSP `'self'`, DNS-rebind guard (incl. exact `[::1]`), loopback bind, CSRF-guarded
writes, input caps, rate-limited ask, secret-scan + dep-audit + no-personal-paths gates,
pinned deps, PreToolUse containment for Read/Grep/Glob/Write/Edit, destructive-git guard.
- **The honest hole (SOTA-MAP A4): Bash is uncontained.** A flight's shell can reach
  outside its target repo. FLIGHT-CONTAINMENT.md documents this; the fix ladder is
  worktree → container. Seeded to the board now (was only backlog §L).
- **The blind spot: guard denials are not telemetry.** 0 denial events exist in the
  store — denials live only in transcripts. What isn't measured can't alarm; the
  anomalies panel (queued) needs this feed.

### 3.6 Telemetry honesty — one leak found

Three checkpoint deaths (firings 353–355) recorded **$0 / 0 turns** — the dying firing's
real spend vanished (envelope never arrived; the row was written from nothing). 19
earlier deaths did record cost. Un-fakeable telemetry is the founding principle; a
cost-invisible death is a small crack in it. Seeded: persist the partial envelope (or
the last streamed usage snapshot) on abnormal exits.

## 4. The REFINE plan

New board items seeded by this evaluation (via the real API), deduped against the 47
already queued:

1. **Epic 0002 — shell decomposition** (`docs/epics/0002-shell-decomposition.md`):
   ES-module split of the five oversized files, shared pure modules replace hand-sync,
   code-splitting unlocks BUNDLE DIET. High.
2. **Bash containment step 1 (SOTA A4)** — worktree-per-flight isolation. High.
3. **Death-cost capture** — no $0 checkpoints; partial envelope persisted. High.
4. **Guard-denial telemetry** — denials become events → anomalies feed. Medium.
5. **Onboarding test-coverage catch-up** — 17 test files vs 32 src. Medium.

Everything else this evaluation surfaced was **already queued** — the correct refine for
those is priority, not duplication: `M6 GOLD local/cheap offload` (the #1 cost lever),
`WARM SESSIONS`, `Completion tag becomes REQUIRED` (70% untagged rows pollute §4 of the
PAPER), `BUNDLE DIET` (now a slice of epic 0002), `Dead-code sweep`, `Anomaly thresholds`.

## 5. Verdict

The system's *verification spine* and *process discipline* are at or above 2026 SOTA
(A3 verification topology fully realized; honest slice semantics; living self-study).
The gap to full SOTA is now concentrated in four places: **isolation substrate (A4)**,
**cost routing (single-model monoculture)**, **client modularity (one 4.7K-line file)**,
and **multi-project parallelism (epic 0001, in flight)**. All four are now specified,
measurable, and on the board — which is exactly the state this repo's doctrine demands:
nothing vague, everything queued, every claim queryable.
