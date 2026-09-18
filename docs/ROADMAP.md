<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Roadmap — where the maestro is flying

The honest, load-bearing answer to "what is AUTOPILOT, where is it going, and how can I
help?" Rewritten 2026-09-14 from four research passes (the milestone audit, the
competitive and market map, the benchmark landscape, and README craft) plus a full
re-read of the code. Nothing here is a promise of a date to anyone outside this repo:
dates are **the maintainer's own targets**, and a target that slips is moved, not hidden.

Live granular truth: [`CHANGELOG.md`](../CHANGELOG.md) (what landed),
[`docs/epics/README.md`](epics/README.md) (what is being built, slice by slice), and the
[issues labeled `help wanted`](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
(what is open for you, right now).

## 1. What this is, in three sentences

AUTOPILOT is a local-first autonomous coding agent: you point it at a folder, press
**Fire**, and it runs gated *firings* — one attempt at one task, ending in a commit that
passed your own gate or a clean revert — through the unmodified Claude Code CLI on your
own subscription. Nothing leaves the machine: the repository, the telemetry and the
control panel are all local, and the only outbound path is an OpenTelemetry exporter that
is dormant until you name a collector. Every autonomous change carries an un-fakeable
record — the gate's verdict per check, its duration, the commit's presence on HEAD, the
tokens and the cost — and that record is published, failures included.

The differentiator is not "an agent that writes code". It is **the contract around the
change**: what "verified" means here is written down, mechanically enforced, and
measured in public.

## 2. Where we actually are (2026-09-18, v0.51.1)

The old table said "M6–M9 planned". That was false for all four. Corrected:

| #   | Milestone                       | State                | What is true today                                                                                                                         | What is open                                                                             |
| --- | ------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| M0  | Foundations & standards         | ✅ v0.6.0            | monorepo · strict TS · CI gates · SQLite schema                                                                                             | —                                                                                        |
| M1  | Engine — the gated loop         | ✅ v0.7.1            | orient → pick → do → gate → commit/revert, quota resilience, un-fakeable telemetry                                                          | —                                                                                        |
| M2  | Onboarding                      | ✅ v0.8.0            | lock · MYTH/LEGACY backup · gate detection · content-hash index                                                                             | —                                                                                        |
| M3  | Read-only dashboard             | ✅ v0.10.0           | watch it fly                                                                                                                                | —                                                                                        |
| M4  | Reactivity                      | ✅ v0.33.0           | live flight control, RAG, task board, fleets of worktree lanes                                                                              | —                                                                                        |
| M5  | Control & approvals             | 🟢 mostly shipped    | the Keeper queue (one list of everything waiting on a human), SOUL propose/ratify/dismiss, **landing and release from the cockpit**, connect and display settings | task **edit**, impact-before-save, the Versions screen (restore a repo state), a model picker |
| M6  | Efficiency                      | 🔄 in progress       | model routing, test-impact sampling gate, REPO-MAP digest, warm sessions (measured — and measured **negative**, so narrowed), cost semantics | local offload as the default for mechanical work, prompt-cache prefix layout, an honest cost-vs-M1 report |
| M7  | Fleets & multi-project          | 🔄 in progress       | per-folder runner registry, ring-0 watchdog, N-way worktree lanes, fleet rollup                                                              | **three different repositories flown concurrently, published as proof**                   |
| M8  | Harness & security depth        | 🔄 in progress       | 11 anomaly kinds, axe-core in the gate, KEEPER PR review + diagnose, control-as-MCP                                                          | retrieval-MCP transport, SAST in CI, a review-agent pack, the multi-harness catalogue      |
| M9  | Packaging & launch              | 🔄 in progress       | SETUP + launchers + npx/launcher smoke in CI, doctor, in-app update, a public docs page                                                     | `pack`, `uninstall`, one-button install-from-zero, signed artifacts, provenance            |
| M10 | The platform & contributor pool | 🔄 epic 0007         | pool client, claims ledger, contributor standing, stale-claim reaper, the issue protocol                                                     | the pool's own analytics; a second maintainer                                             |
| M11 | GitHub connected mode           | 🔄 epics 0006/0016/0019 | connect/switch/log out, issue and discussions triage, mirror pass, CI status, publicity                                                   | the social flight's own honesty audit                                                     |
| M12 | The cockpit as a product        | 🔄 epics 0021–0031   | app shell, icon system, snackbar, busy states, themes + hue, RTL Hebrew, the brand mark                                                      | the docs reader (0023), the pipeline graph (0024), the tasks screen (0026), the envoy (0027) |
| M13 | Published evidence              | 🟢 largely shipped   | the self-study paper, the datasheet, the evidence log, the eval gate, DORA                                                                   | a cost-normalised scorecard others can compare against                                    |
| M14 | **Providers & models**          | 🔴 not started       | one adapter (Claude Code CLI) plus an Ollama offload path for one substep                                                                    | everything below — this is the gap the operator named                                      |
| M15 | **Benchmarks & standing**       | 🔴 not started       | rich internal telemetry, no external number                                                                                                 | everything below                                                                           |
| M16 | **Adjacent modes**              | 🔴 not started       | —                                                                                                                                            | dependency/security upgrades, de-flake                                                     |

## 3. M14 — providers and models (why it is not optional)

Today AUTOPILOT flies one engine: the Claude Code CLI on a personal subscription. That is
its best property and its largest single point of failure — Anthropic's own Claude Code
policy page says advertised limits "assume ordinary, individual usage", and reserves the
right to enforce "without prior notice". A sibling project lost its built-in Anthropic
sign-in in March 2026. **Parity across engines turns a policy change from an extinction
event into a configuration change.**

The order, cheapest-first, each a separate adapter behind the existing invoke port:

1. **API-key parity for Anthropic** (already possible; make it first-class, with cost
   accounting and a warning when a benchmark sweep runs on a subscription).
2. **Local models via Ollama** — already wired for the triage substep; promote to a real
   lane for mechanical work (docs, formatting, test scaffolds) with a quality gate that
   demotes a lane that fails twice.
3. **OpenAI Codex CLI** (Apache-2.0, local) and **Gemini CLI** — the two other CLIs that
   run locally and can be spawned the same way `claude -p` is.
4. **GitHub Copilot CLI**, **Amazon Bedrock** and **Google Vertex** for teams whose keys
   live there.
5. A **parity matrix** in the docs: which adapter supports sessions, tools, cost
   reporting, and what the gate contract means for each.

Community epic: [#21](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT/issues/21).

## 4. M15 — benchmarks and standing (measured, never claimed)

The landscape, as of 2026: **SWE-bench Verified is closed to us** (since 2025-11-18 it
accepts academic teams and established labs only) and is anyway under a cloud — an audit
of its hard tasks found a majority with material test flaws. **SWE-bench Multimodal** is
open to anyone and graded server-side. **Terminal-Bench 4.0** is the one board designed
for agent × model pairs, reports cost and confidence intervals, and requires public
trajectories — which is exactly what AUTOPILOT already produces. **There is no benchmark
for long-running autonomous agents on a real repository.** That absence is the ground
worth owning.

**This machine can carry it.** Measured 2026-09-14 on the operator's box: x86-64, 12
logical cores, 32 GB RAM, 719 GB free on the working volume — against SWE-bench's stated
floor of x86-64, 8 cores, 16 GB RAM and 120 GB of disk. Docker Desktop 29.2.0 is
installed but its Linux engine was not running at the time of the check; WSL2 with Ubuntu
is present. So: hardware yes, with room to spare; the real limits are wall-clock (a full
500-instance pass is one to three days) and money (roughly $500–$2,500 per pass at
current prices, an estimate, not a quote). A sampled run of 20–50 instances is
comfortable in an evening.

The stages, in order:

1. **Telemetry → benchmark JSON** (1–2 weeks). Emit a versioned, machine-readable record
   from the firings we already have: benchmark id, dataset and revision, split, n,
   sampling method, seed, the full instance list, exact model id, **agent version (git
   SHA)**, harness version, attempts, run date, wall clock, tokens, cost, resolved /
   unresolved / errored, pass rate with a 95 % Wilson interval, billing mode, artifact
   link. No new capability; immediate credibility.
2. **An in-product sampled runner** (3–5 weeks). Wire the official `swebench` harness
   behind a preflight (x86-64, disk, Docker), seeded sampling, a forced-unique run id
   (the harness silently reuses cached results otherwise), an HTML and JSON report, and
   **API-key billing by default** — a bulk sweep through a personal subscription is a
   grey area and will be warned, not assumed. Trajectory capture ships **during**
   inference from day one; retrofitting it later invalidates a submission.
3. **External, un-fakeable validation** (2–3 weeks). A full SWE-bench Multimodal run
   through `sb-cli`, and a Terminal-Bench 4.0 run through Harbor with five trials.
4. **A full Verified pass with artifacts** (2–4 weeks, one to three days of wall clock
   per pass). Publish the artifact repository in the exact submission layout even though
   we cannot submit.
5. **Standing** (opportunistic). Either co-author with a lab to become eligible, or own
   the uncontested ground: publish the long-horizon, gate-verified series nobody else
   publishes.

**What may be claimed today, and nothing more:** a gate-verified ship rate on this
repository over a named window with n stated; a measured median cost and token spend per
shipped change; DORA metrics for an agent operating continuously on a live repository.
**Never**: a SWE-bench-style percentage, a comparison to another product's score, or the
word SOTA. Every number carries the software version, the model id and the date — that is
a house rule, not a nicety.

## 5. M16 — adjacent modes (the same engine, a different buyer)

Ranked by the strength of the wedge, not by size:

1. **Dependency and security upgrades.** The incumbents detect well and fix
   unevenly — an independent field test of a leading autofix measured 76 % accuracy with
   a 5.3 % regression rate, and the dominant failure is a patch that passes the visible
   tests while the vulnerability survives. Our wedge is the gate plus a reproducing test:
   *"upgraded, your gate ran, here is the test that proves it — or it reverted."*
2. **Flaky-test remediation.** Roughly one test in six is flaky at Google's scale, and
   up to a fifth of main-branch failures at Atlassian's. Everyone quarantines; almost
   nobody fixes with a verified re-run contract. Same buyer, same telemetry.
3. **Migration factories.** The highest value per engagement and the loudest warnings:
   Gartner expects most 2026 mainframe-exit projects to miss their benefits by
   overestimating generative tooling. The wedge is not edit volume, it is the
   **equivalence proof** — a gate that says the behaviour did not change.

Deprioritised for now: documentation bots, data-pipeline maintenance, research-lab
running — real work, no buyer who pays for a guarantee.

## 6. The plan by time

Targets, not promises. Each item links to the milestone it advances.

### Q4 2026 (October–December) — "honest numbers and a second engine"

| By         | Move                                                                                                                     | Advances |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ | -------- |
| 2026-10-04 | FOSDEM 2027 devroom proposal submitted                                                                                   | reach    |
| 2026-10-11 | KubeCon EU 2027 CFP submitted (agentic-AI track)                                                                         | reach    |
| 2026-10-31 | **Terms hardening**: single lane by default, fleet an explicit opt-in with a warning, API-key / Bedrock / local parity documented | M14      |
| 2026-11-15 | M5 closed: task edit, impact-before-save, the Versions screen                                                            | M5       |
| 2026-11-30 | Stage 1 + Stage 2 of the benchmark plan: telemetry JSON schema published, the in-product sampled runner behind a preflight | M15      |
| 2026-11-30 | A Terminal-Bench 4.0 run published with full trajectories                                                                | M15      |
| 2026-12-15 | Ollama lanes promoted from one substep to real mechanical work, with a demotion rule                                     | M14, M6  |
| 2026-12-31 | The firing-telemetry dataset released, failures included                                                                 | M13      |
| 2026-12-31 | A cost-normalised scorecard: cost per accepted unit with an interval, revert rate, autonomy rate, gate-step durations    | M13      |
| 2026-12-31 | A short empirical preprint with the repository attached                                                                  | M13      |

### H1 2027 — "more than one engine, more than one repository"

- **M14 to parity**: Codex CLI and Gemini CLI adapters, the parity matrix, cost
  accounting per adapter.
- **M7 proof**: three different repositories flown concurrently for a week, published.
- **M16 first mode**: dependency and security upgrades with the reproducing-test gate.
- **M9**: `pack`, `uninstall`, signed artifacts, one-button install.
- **M8**: SAST in CI, the retrieval-MCP transport, a review-agent pack.

### H2 2027 — "a product other people run"

- **M16 second mode**: de-flake with a verified re-run contract.
- **M12 finished**: the docs reader, the pipeline graph, the tasks screen, the envoy.
- A hosted **fleet control plane** for teams (see §8) — the agent stays local, the
  control plane is optional and never required to fly.
- 1.0.0 at the public-launch milestone, per [`RELEASING.md`](RELEASING.md).

### 2028 and beyond

- The long-horizon benchmark nobody runs yet, published as a dataset and a harness.
- Migration mode, if the equivalence proof holds on two real migrations.
- **AUTOPILOT FOUNDRY** — an idea, deliberately one paragraph (§8).

## 7. Risks that could end this, and what is done about them

1. **The provider's terms.** Flying a personal subscription in parallel lanes is the
   exposure; the safe harbour is narrow — the same policy page that restricts automation
   also says it does not prevent signing in to the *unmodified* Claude Code binary with
   your own subscription, which is exactly what AUTOPILOT spawns. *Mitigation:* single
   lane by default, fleets an explicit opt-in that says so, never collect or intermediate
   a credential, keep a public compliance page, and reach parity with API-key, Bedrock
   and local engines so a policy change is a config change (M14, Q4 2026).
2. **Verification theatre.** This project's own history contains a gate that reported
   green while running zero tests for fifteen firings out of nineteen. If the telemetry
   is ever shown to be fakeable, the differentiator evaporates. *Mitigation:* publish
   gate-step durations and test counts beside every verdict (shipped), keep the
   convergence plausibility floor that demotes an implausibly fast green (shipped), and
   run a standing adversarial self-audit that tries to produce a green firing with no
   work (open).
3. **Agent spam blowback.** Maintainers are banning AI contributions outright after
   waves of low-quality submissions. One wave of AUTOPILOT-signed pull requests into
   repositories the operator does not own would make the name toxic permanently.
   *Mitigation:* it is structurally impossible for a firing to open a pull request in a
   repository the operator has not locked on; DCO sign-off is required from a human, the
   tool takes credit only in an `Assisted-by:` trailer, and every generated contribution
   discloses itself.

## 8. AUTOPILOT FOUNDRY — one paragraph, on purpose

If the engine holds across providers and the gate contract proves itself outside this
repository, the natural shape is a **foundry**: the agent stays Apache-2.0 and local
forever, and a separate, optional control plane runs fleets for teams — policy, audit,
cross-repository telemetry, seat management. Open core with a hosted plane, never a
licence change on the core: the projects that changed their licence to capture value
lost more trust than they captured, and two of them reverted. Written here so the
direction is not a secret; not started, not promised, not staffed.

## 9. How this document stays honest

- Every state in §2 was checked against code, tests and the changelog on 2026-09-14, not
  against intent.
- A target that slips moves here, with the new date. A target that dies says so.
- Numbers in the README and the self-study carry the software version, the model id and
  the date of measurement, always.
- The research behind this file: the competitive and market map, the benchmark landscape
  and the README craft pass all live in
  [`docs/RESEARCH-LIBRARY.md`](RESEARCH-LIBRARY.md); the milestone audit is reflected
  directly in §2.

## Related

[`ACTION-PLAN.md`](ACTION-PLAN.md) (the milestone definitions of done) ·
[`MASTER-PLAN.md`](MASTER-PLAN.md) (the founding decisions) ·
[`MASTER-PROMPT.md`](MASTER-PROMPT.md) (the laws a firing flies by) ·
[`HIERARCHY.md`](HIERARCHY.md) (what the eye meets first) ·
[`epics/README.md`](epics/README.md) (the slices in flight) ·
[`SELF-STUDY/PAPER.md`](SELF-STUDY/PAPER.md) (the published evidence).
