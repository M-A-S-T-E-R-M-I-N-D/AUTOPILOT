<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Fleet orchestration — the agent-org vision

The founder's north star for AUTOPILOT's autonomy, captured verbatim-in-spirit so
it drives the roadmap (it spans **M4–M8**; most of it is already in MASTER-PLAN
§5/§16/§17, this doc pins the specifics). The metaphor: **turn a real dev group /
a 2000-person org into a fleet of agents** that communicate, divide the work, do
it, report, and decide — autonomously, in parallel, without stepping on each other.

## The pillars (and where each lands on the plan)

### 1. Per-project control & instructions — **M5** (+ M2 SOUL, M7 run)

- Enter each project; **see and edit its instructions**. A layer of **locked
  defaults** (strongly recommended, left alone) and **editable non-defaults** you
  can tune — "locked-by-default, proposable" (MASTER §5.4, §17).
- Choose per project: **run this one · run another · run several in parallel**,
  isolated so parallel projects are unaware of each other (worktree/process
  isolation, the task/handoff/status contract — MASTER §7-supervisor, M7 DoD).

### 2. Domain-check configuration (the checkboxes) — **M8** (+ M5 settings)

A settings surface of **micro-checkboxes** selecting which domains the fleet
inspects, each enabling a coordinator that dispatches sub-agents to collect data,
analyze, and file tasks:

- networking · TLS/transport · **cybersecurity** (secret scan, dep-audit,
  SAST-style) · **accessibility** (WCAG 2.2 AA+) · **UX / UI** · performance ·
  **patterns & standards** · modern-web-app assurance · any web/software project type.
- Each checked domain → an agent (or sub-fleet) that **collects → analyzes →
  proposes tasks** into the one unified task entity (REACTIVITY §2). This is the
  **review-agent catalog / harness depth** of M8 ("author once, project everywhere").

### 3. Live agent-fleet activity map — **M4** (+ M7 fleet telemetry)

- A **group of agents you can watch in real time**, with **diagrams** showing at
  any moment: how many agents are running, what each is doing, which **domain**
  each is in, where it is, how long it's been running — a **map** that illustrates
  who is working on what, how, and for how long.
- This is the **activity map** (MASTER §5.2) fed by the **dual live-stream**
  (agent-semantics SSE + filesystem WS, REACTIVITY §4). The M3 flight log + the
  §16 severity×dimension gauge are the seeds already shipped.

### 4. Autonomous coordination & decisions — **M5** (+ §17 boundary)

- A **central coordinator** that gathers every investigation/finding/thought and
  **routes them to a decision**. A **checkbox: "decisions made autonomously"** by a
  dedicated **Decider** agent (the Design-Sprint "Decider" role) — versus routed to
  the human **approvals queue** (🟣).
- This IS the **verification boundary (§17)**: machine-verifiable work runs
  autonomously; human-required calls wait for approval — the checkbox chooses where
  the line sits per project.

## Sequencing (honest, milestone-by-milestone)

| Want | Milestone | Status |
|------|-----------|--------|
| Watch agents work live (map/diagrams, who/what/where/how-long) | **M4** | activity-map + live-stream — next after M3 |
| Per-project instructions: locked defaults + editable, run/parallel controls | **M5** + **M7** | settings/SOUL editor (M5); parallel supervisor (M7) |
| Domain checkboxes → review sub-fleets (security/a11y/network/UX/patterns) | **M8** | review-agent catalog + anomaly detection |
| Autonomous **Decider** vs human approvals (the checkbox) | **M5** | approvals queue + §17 boundary |
| The "2000-agent org" (communicate · divide · report · decide, no interference) | **M4→M8** | the whole arc; foundations (loop · onboarding · store · gate) already shipped |

**Already shipped toward it (M0–M3):** the gated autonomous loop (M1), folder-lock
onboarding + content-hash index (M2), the live read-only dashboard with a real
flying project + flight log + severity gauge + the Claude connection layer (M3).
The org grows on top of these — one milestone at a time, each gated and honest.

## First live 3-way fleet test — debrief (2026-08-16)

**What happened:** 3 instances (base worktree + `--fleet-2` + `--fleet-3`) flew this
repo in parallel. 3/3 shipped, intent claiming held, zero cross-instance conflicts,
and one guard fix (ffcd9c6) was self-shipped mid-test. **The gap:** each instance
flew ~1 of the expected 3 firings, then exited.

**Diagnosis (code-verified, board task web-msw5gwfs-rqylda):**

1. **Prime cause — the `[firings]` argument defaulted.** `pnpm dashboard:fly
   <folder> [firings]` treats the count as optional with `DEFAULT_FIRINGS = 1`
   (`apps/dashboard/src/fly.ts` — `argv[3] ?? DEFAULT_FIRINGS`). A fleet launch
   that omits it flies exactly ONE firing and exits `stoppedBy: 'max-iterations'`
   — a clean, silent, by-design exit that reads as "instance died early" from the
   outside. Three instances each defaulting to 1 firing reproduces the observed
   "3/3 shipped, ~1 firing each, then exit" exactly.
2. **Ruled out — the loop reacting to failure.** `runLoop`
   (`packages/engine/src/loop.ts`) never exits on a bad/crashed firing: consecutive
   failures only log an ALERT, global quota exhaustion hibernates (a sleep, not an
   exit), and the only terminal paths are a STOP request and `max-iterations`. An
   early exit therefore cannot be the loop "giving up" — it is either an
   as-requested iteration count or the flight process dying.
3. **The "~" in "~1" — per-firing session-budget deaths.** Two firings in this
   flight's own history (773, and fleet-2's 776) hit the harness's per-session USD
   cap mid-unit; deliver-or-pack packed a `wip(autopilot): checkpoint` commit as
   designed and the next firing resumed it. This is the designed degradation, not
   the fleet gap — but it ends that flight's process, which is why some instances
   show a fractional firing.

**Remediation directions:**
- fleet/watchdog launch recipes must pass `[firings]` explicitly (the dashboard
  path already does — `FlightRunner.start()` forwards an explicit count under
  `MAX_DASHBOARD_FIRINGS`) — not yet done; the recipe layer lives outside this repo.
- the flight-end line should say the requested count loudly enough that a
  defaulted count is visible as by-request, not a crash — **DONE** (8feffbb):
  `formatFlightDoneLine` (`apps/dashboard/src/flight/flight-summary.ts`) appends
  `(requested N)` to the `Done —` line whenever `stoppedBy === 'max-iterations'`.
- whether `DEFAULT_FIRINGS = 1` is the right cautious default for CLI launches is
  an operator (🟣) decision — open.

## Fleet intent claims — declare → render → retire → verify

The anti-duplication substrate for same-repo parallel instances (BOARD
web-mswo4x1u-kl2qsw; RESEARCH-LIBRARY defense-stack item 2). Four halves,
all shipped:

- **Declare** — before starting a unit, a firing overwrites the git-ignored
  `.autopilot-intent` file at its worktree root with ONE line,
  `<primary file> — <goal>`. This is the only claim signal that exists
  BEFORE any edit or commit does, closing the window where two siblings pick
  the same unit at the same moment. SLICE-RELAY DUP 1/3
  (web-mt14o4iz-3ehrrw): prompt-only declaring still left a gap between
  `claimTask` succeeding and the firing's LLM actually getting around to
  writing the file — three siblings duplicated a `tasks_reorder` unit in
  that window ($9.2 wasted, zero collisions caught, because none had
  declared yet). `fly.ts` now auto-declares the instant a claim succeeds,
  guessing the primary file from a path-shaped token in the task title
  (`likelyPrimaryPathFromTitle`) via `writeDeclaredIntent`; the firing's own
  declaration, still prompted, overwrites the guess once it picks a real
  primary file.
- **Render** — every sibling's FLEET digest shows the claim as an `intent:`
  line (`fleet-digest.ts` `declaredIntent`), alongside the passive
  `touching:` (uncommitted tree) and `unlanded:` (committed, not yet landed)
  signals. The firing prompt names it the strongest claim signal: never
  touch the file it names.
- **Retire** — a shipped unit fulfills its claim, so `fly.ts` clears the
  file (`clearDeclaredIntent`). Only a checkpointed death keeps the claim
  standing (`claimSurvivesFiring`): the packed-up unit is still owned by the
  firing that resumes it. Every other no-ship ending — a noop, a reverted
  unit, a gate crash, a death on a clean tree — abandons the unit, and its
  claim retires with it so it can't wall siblings out of ghost work.
- **Verify** — prompt-side compliance alone was evaded (three duplicate
  modules and a v13 migration collision in one overnight run), so after a
  firing ships, `fly.ts` checks the shipped commit's files against every
  sibling's standing claim (`readSiblingIntentClaims` →
  `detectIntentCollisions`: separator/case-normalized, own worktree
  excluded). A hit prints a `🚨 intent collision` line in the flight console
  and injects an INTENT-CLAIM VIOLATION notice into the NEXT firing's
  prompt, steering it out of the claimed area. Additive-git doctrine keeps
  the green commit — enforcement redirects; it never reverts.

## Fleet scope partitioner — disjoint scopes, no idle instance

The fifth consensus defense against parallel-agent duplicate work (BOARD
web-mt1kvauh-aqmn3l; RESEARCH-LIBRARY "Where SOTA actually is" — Co-Coder's
cohesion-aware partitioning: naive file-based parallelism measured +60% cost
with NO quality gain from conflicting interfaces, while grouping cohesive
work eliminates most cross-agent conflicts BY CONSTRUCTION). Complements
intent claims above: instead of every same-repo instance racing to pull from
the SAME open board top, a LAUNCHER can compute a disjoint per-instance
scope BEFORE takeoff and hand each instance only its slice.

- **Cohesion signal** — `areaKeyOf` (`flight/scope-partition.ts`) maps a
  task's title to the area it belongs to: the title's primary path prefix
  (`likelyPrimaryPathFromTitle`, truncated to two path segments) when it
  names one, else the board's leading-tag convention ("SHELL …", "COCKPIT
  …", "SLICE-RELAY …"), else its first word lowercased.
- **Hub rule** — `partitionBoardScopes` groups open tasks by that area key
  and never splits a group across instances: same-area tasks are exactly
  the ones most likely to touch the same files, so keeping the group whole
  internalizes the conflict risk instead of exporting it across instances.
- **LPT balance** — groups assign biggest-first to the least-loaded
  instance (longest-processing-time greedy scheduling), so per-instance
  load stays close to even even though group sizes vary; instances beyond
  the group count get an empty scope.
- **Partition-then-pull transport** — the assigned id list rides as the
  comma-joined `AUTOPILOT_FLEET_TASK_SCOPE` env var
  (`StartFlightInput.taskScope` → `spawnFlight`'s 6th arg). `fly.ts` reads
  it once at takeoff via `parseTaskScope` and `scopeFilterCandidates`
  filters BOTH the claim candidates and the board rendered into the
  prompt: while any scope task is still open, only scope tasks are
  pickable; once the scope is exhausted the instance falls back to the
  ordinary full-board pull rather than idling (Co-Coder's greedy list
  scheduling — a fast instance never sits still waiting on a slow
  sibling). Solo flights never set the env var, so `parseTaskScope`
  returns `null` and every candidate passes — byte-for-byte the
  pre-partitioner behavior.

`partitionBoardScopes` is a pure function computed by the LAUNCHER (the
coordinator role in the consensus pattern) — the same repo boundary as the
launch recipe above ("the recipe layer lives outside this repo"): this repo
owns the partition algorithm and the full per-instance transport/consumption
path; the external launcher calls `partitionBoardScopes` once against the
fleet's instance-id list and passes each instance's slice as `taskScope` on
its `POST /api/fly` start call (or CLI-equivalent).

## Fleet wisdom — learnings graduate from SOUL into a shared layer

The M7 companion (BOARD web-msnt26xe-pc4pzp): a learning that keeps being
rediscovered project-by-project stops being one project's idiosyncrasy and
becomes fleet-wide wisdom every project should inherit. Four halves of the
lifecycle, all shipped:

- **Mine** — `mineFleetWisdom` (`flight/fleet-wisdom-mining.ts`) runs in the
  post-flight sweeps and proposes a fleet-level amendment once the SAME
  learning has independently appeared in the SOUL of at least
  `FLEET_WISDOM_GENERALIZATION_THRESHOLD = 3` DISTINCT projects — one or two
  could be coincidence; three is a pattern. "The same learning" is an exact
  marker match against the `LEARNING_KINDS` registry (one `{ marker,
  fleetTemplate }` entry per machine-mined `## Learned: …` note), never a
  free-text similarity engine — the design and its invariants live in
  `docs/epics/0014-fleet-wisdom-generalization.md`. Two kinds are live: the
  checkpoint-streak "size the unit smaller" note and the noop-streak "spend
  no-commit streaks on VERDICT proposals" note. Registry order is priority
  order: with the single pending-proposal slot, mining proposes the FIRST
  kind that qualifies and the rest wait for the sweep after the operator
  acts. Adding a kind is adding a registry entry — storage, routes, and the
  compose seam never change.
- **Propose** — the mined text lands in the fleet row's `wisdom_proposed`
  slot (mirroring `projects.soul`/`soul_proposed`). There is exactly one
  pending proposal for the WHOLE fleet, and mining never overwrites an
  unreviewed one.
- **Ratify / dismiss** — an operator decision, never automatic: `POST
  /api/fleet/wisdom-ratify` applies the proposal as the live `wisdom` text,
  `POST /api/fleet/wisdom-dismiss` drops it; the dashboard shell renders a
  pending proposal as a banner panel with both actions.
- **Compose** — the consumption side: at prompt-assembly time `fly.ts` calls
  `composeSoulWithFleetWisdom` to layer the ratified shared text into every
  project's firing prompt under a `# FLEET WISDOM (shared across all
  projects)` heading. Dedup is per registry kind: for every kind whose
  marked note the project's own SOUL already carries, the fleet copy is
  stripped first — the project-local copy is more specific, and the same
  lesson twice in one prompt is noise.

**Confidentiality boundary:** the mined text is a fixed, pre-authored
template that never interpolates any project-identifying data — no slug, no
name, no root path, no verbatim SOUL content; only the COUNT of confirming
projects. One project's specifics cannot leak into the shared layer by
construction, rather than by a redaction pass that could miss a case.

## Close verification — demotions now reach the next firing

A firing that tags `"completion":"complete"` is checked by
`markTaskDoneIfShipped` before the task closes: measurable DELIVERABLE
predicates against HEAD, a vocabulary check of the shipping patch, the
UX-EXPRESSION doctrine (a user-facing claim must touch a UI/Docs surface),
and EPIC-SPEC / ADR file-existence conventions. A refused close demotes the
metrics row to a slice and the task stays open — and since firing 810's fix,
the refusal REASON is injected into the next firing's prompt as failure
feedback (the same channel gate reverts use). Before that fix the reason
only reached the operator console: firings 802/806/810 re-attempted one
close blind, three firings burned on a message nobody showed them.
