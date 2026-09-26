# AUTOPILOT — Backlog (the "999 topics")

The founder noted there are "at least 999" topics AUTOPILOT should cover. This is their home — a living, categorized register. Nothing gets lost; items graduate into phased work (see `MASTER-PLAN.md` §13).
Status legend: `[ ]` open · `[~]` in a phase · `[x]` done. A `[x]` item's full implementation evidence may live in [BACKLOG-999-ARCHIVE.md](BACKLOG-999-ARCHIVE.md) instead of inline, as this register is compressed toward a scannable size (board `web-mtndm5m6-rfly97`) — the inline line always says so.

## A. Engine & autonomy
- [x] (M1, e2e-proven; 160+ real firings) Cross-platform TypeScript port of the v2.4 loop (orient/pick/gate/commit/report/pace/hibernate)
- [x] (instance-lock.ts) Per-project single-instance guard (mutex/lockfile) + graceful STOP (STOP-aware sleep)
- [x] (M1 resilience.ts, proven live) Model resilience: fallback chain, promote-on-exhaustion, time-based re-probe
- [x] (M1 + pacer.ts adaptive cadence) Quota safety: per-firing budget cap, adaptive cadence, weekly pacing, global-exhaustion hibernation
- [~] (adapters/ollama.ts + flight/triage.ts route board TRIAGE to Ollama when configured; FEATURE-COVERAGE §G) Local-model offload as a first-class step (the biggest quota lever) — default-on for mechanical sub-work
- [~] (RETRO firings live; learnings→RESEARCH-LIBRARY; curation ongoing) Retro self-improvement loop + append-only learnings, curated
- [~] (routing.ts tierForSubstepKind/modelForTier + model-routing.ts per-firing escalation; FEATURE-COVERAGE §G "MODEL ROUTING v1") Effort/model routing per task complexity (cheap tier / local for mechanical; top tier for hard reasoning)

## B. Onboarding / "learn any project"
- [x] (M2 complete, e2e DoD) Onboarding pipeline, in order: folder lock → backup (MYTH) + baseline (LEGACY) + safety branch BEFORE any git action; auto-detect stack + gate (typecheck/test/build/lint) across ecosystems (JS/TS, Python, Go, Rust, …); map architecture, conventions, and the highest-value work surface; generate the starter SOUL + board + telemetry infra; re-orient safely on projects it has seen before (resume state)

## C. Dashboard (web GUI)
- [~] (live cards: status/stack/files/ship-rate/severity gauge/last activity, 3s poll — FEATURE-COVERAGE §C) Fleet home: single-project ↔ whole-fleet toggle; status, last ship, cost, ship-rate, improvement sparkline — no dedicated toggle or improvement sparkline found in the live tree
- [~] (live flight log + graphs + task board done — FEATURE-COVERAGE §C) Project detail: board by status, live flight log, graphs, raw exportable data — no board-by-status columns or raw-data export UI found in the live tree
- [x] Graphs: cost/shipped, tokens, turns, ship-rate, self-report, improvement-over-time — numeric + visual + DATA
- [~] (needs_approval + approve/reject/delete UI live, `TaskActionKind` in `apps/dashboard/src/web/task-queue.ts` is `'approve' | 'reject' | 'done' | 'delete'` — FEATURE-COVERAGE §C) Approvals queue: propose-for-approval, approve/reject/delete; edit action + explain-impact-before-save not yet built
- [ ] SOUL/identity editor: locked-by-default, proposable prompt improvements, per-project overrides
- [ ] Versions screen: MYTH/LEGACY/flight timeline, diff, one-click additive restore
- [~] (connect screen live; rest M5) Settings: models, quota/token view, membership connection, language, accessibility, security policy
- [ ] Anomalies/health: regressions, cost spikes, gate fails, security findings + proposed fixes
- [~] (progressive disclosure: chips/drilldowns/Load-More) "Hidden by default, open to edit" everywhere — calm unless the user wants to intervene
- [~] (AA baseline + axe gate green; AA+ sweep = M8) Strict accessibility (WCAG 2.2 AA+), keyboard-complete, reduced-motion, RTL-correct i18n

## D. Multi-project & supervisor
- [~] Supervisor daemon: project registry, run/stop, parallel vs solo scheduling — `FlightRunnerRegistry` (`apps/dashboard/src/flight/registry.ts`) does this inside the dashboard server process (wired into `server/main.ts`); no standalone daemon process yet
- [x] Aggregate telemetry across projects; compare improvement over time — `buildFleetView`/`fleetChronoLog` (`apps/dashboard/src/read/fleet.ts`) roll cost/shipped/ship-rate/streak up across every project, rendered on fleet home via `stat-tiles.ts`
- [x] Resource/quota sharing + fairness across parallel projects — `FlightRunnerRegistry`'s `maxConcurrent` FIFO queue, its own doc comment calls it "shared-quota fairness"

## E. Models & languages (Ollama)
- [~] (`adapters/ollama.ts` live, opt-in via `AUTOPILOT_MECHANICAL_MODEL=ollama-local` — an env toggle, not a Settings toggle; NO local-only guard, `AUTOPILOT_OLLAMA_BASE_URL` accepts any URL — FEATURE-COVERAGE §I) Optional Ollama integration (toggle), local-only guard (refuse cloud models for confidentiality)
- [ ] (the local multilingual MODEL set is unbuilt; dashboard-UI i18n for he+en IS live and RTL-correct — FEATURE-COVERAGE §N) Multilingual set: Hebrew + English (critical), Chinese, Japanese, Russian, Spanish, + more
- [~] (automatic per-task routing live — `flight/model-routing.ts` + `routing.ts`, env-only levers; no model picker, no one-click install, no guidance editor — FEATURE-COVERAGE §I) One-click model install/copy; per-task model choice; enable/disable; guidance editable (proposed-not-locked)
- [~] (`SETUP.cmd`/`SETUP.sh` → `scripts/setup.mjs` bootstraps pnpm + deps + the Claude CLI on first run; the Node runtime, Ollama and models are NOT installed) The "install everything" bootstrap (runtime + Ollama + models) — takes as long as it takes, SOTA UX

## F. Security & trust
- [x] (CSP self, guard hooks, pinning, scans; local-only architecture + operator account) Product hardening: no secrets, CSP, dep pinning + SRI, input validation at boundaries; confidentiality — content never leaves the machine except via the user's own Claude account
- [ ] Sources only from reputable/official/well-known projects; verified Ollama models
- [~] (secret-scan+audit in CI; SAST propose-fix = M8) All-layer vulnerability detection + propose-fix (secret scan, dep-audit, SAST-style review)

## G. Distribution & OSS
- [ ] One-command install per-OS (+ optional desktop build via Tauri)
- [x] Apache-2.0 (or MIT); zero private data; CI secret-scan gate; Author/brand: 1337 · REL AZEUS · MΔSTERMIND (the only identity)
- [ ] README + ARCHITECTURE + demo GIF + docs site

## H. The long tail (to be expanded toward 999)
- [x] (connect screen + fleet-home cost/tokens tiles + cost-semantics-v3 real-cost tile and flight-log chips — FEATURE-COVERAGE §I) Token/usage awareness surfaced in the UI + membership connection flows
- [ ] Backup/restore ergonomics + "explain the hardware/impact" prompts before destructive-ish actions
- [ ] Notifications (needs-you, anomaly, ship) across channels
- [ ] Export/share reports; scheduled runs; cron/time-of-day windows
- [ ] Plugin/extension model for custom harness steps and review agents
- [~] (GENIUS+ARCHITECT step 1, RAG, live view, inbox task-assign all live — FEATURE-COVERAGE §D; chat itself + repo/backlog self-generated mining still pending) Reactivity: talk-to-agent chat, hybrid RAG, task assignment, live view + abstract activity map (spec: `REACTIVITY.md`)
- [ ] Multi-harness projection: catalog → install-target adapter registry (Claude/Codex/Cursor/Gemini/OpenCode/Kiro…)
- [~] (epic 0009: the loop's CLI-`--resume` session-carry is live but MEASURED a net loss at n=197 and was narrowed to checkpoint continuation + FINISH-LINE EXTENSION; FTS5 + `sqlite-vec` hybrid search live — FEATURE-COVERAGE §D/§G) Warm agent session (Agent SDK) instead of per-message CLI spawn; semantic index (FTS5 + embeddings) with cache-invalidation — still open: an Agent-SDK warm session for chat (chat itself unbuilt), the local ONNX embedder
- [x] (OWASP/WCAG/SemVer/SPDX/REUSE/OTel-OTLP all live) Standards backbone wired in from day one (spec: `PATTERNS-AND-STANDARDS.md`) — OWASP/SLSA/WCAG/SemVer/SPDX/OTel
- [ ] (This register is the tracked implementation backlog — the standard long-tail carrier for a project this size.)

## I. Progression gauge & autonomous intake (2026-07-06)
- [x] Per-finding tagging: severity (🔴critical/🟠high/🟡medium/⚪low) × dimension (a11y/security/UX/human/learnings/info/data/priorities) — task schema carries both (`SEVERITIES`/`DIMENSIONS`, `packages/store/src/types.ts`), rendered as task-board chips (`taskSeverityChip`/`taskDimensionChip`, `apps/dashboard/src/web/task-queue.ts`)
- [~] Project readiness gauge: numeric % + color bar + per-dimension breakdown, per-project AND whole-fleet — per-project severity color bar is live (`openSeverityGauge`, the fleet card's findings gauge); fleet-wide is only a scalar open-findings count (`FleetTotals.openFindings`), no per-severity/per-dimension breakdown at fleet level, no "%" framing
- [ ] Status ladder: RED→ORANGE→YELLOW→WHITE→🟣needs-you→🔵STABLE→🟢completed/affirmed
- [ ] 🟣 PURPLE gate: human-required items block GREEN; sit in Approvals until the founder acts
- [ ] 🔵 BLUE "stable" computed only when critical→medium are clear across EVERY dimension; 🟢 GREEN needs affirmation
- [x] Autopilot INBOX (human→bot) + engine read integration: dashboard message box + `INBOX/` drop; leave a note/task/plan-request/update-request mid-flight — `apps/dashboard/src/inbox/add.ts` (wired into `server/main.ts`) writes into the same `INBOX/` folder every firing reads via `buildInboxDigest` (`packages/engine/src/inbox.ts`, spliced into the firing prompt as strictly optional context, never a dependency); auto-triage promotes each note to a board task (`flight/inbox-triage.ts`, `source:'inbox'`), though every note collapses to one generic task with no formal type split
- [~] (post-flight triage live; inbox live-watch pending) Triage sub-agent: live-watch inbox + repo; answer "place / plan-further / task / do-now?" from inbox + repo + backlog
- [ ] Fully-autonomous scenarios: empty inbox → mine repo/backlog; urgent msg → prioritize; drained → propose next plan; blocked → defer(🟣); needs-human → surface, never stall

## J. Verification boundary & agent evolution (2026-07-06)
- [x] Classify every finding/task: MACHINE-100%-verifiable (autonomous) vs HUMAN-required (🟣) — default to human when unsure — specified in `MASTER-PLAN.md` §17.1/§17.2, cross-referenced from `docs/SELF-STUDY/PAPER.md` §3
- [x] Autonomous set: typecheck/test(impact+full)/build, secret+dep+SAST, invariants, byte-identity, machine-checkable a11y (contrast/ARIA/keyboard/focus/reduced-motion), perf/size budgets — `MASTER-PLAN.md` §17.1, this is what `metrics.gate_result` measures
- [x] Human-required set: visual/brand/pixels, real UX & human-interaction quality, ethics/dignity/harm (serves living beings), intent-ambiguity, irreversible forks — `MASTER-PLAN.md` §17.2, the 🟣 PURPLE gate
- [~] Capture every human approve/reject/edit + note as an EVALUATION LABEL (the fitness signal) — approve/reject wired (`packages/store/src/mutate.ts`'s `recordEvaluationLabel`, on task approve/reject AND SOUL ratify/unratify/dismiss); edit/note NOT captured — the store has no `updateTask` at all yet, so there is no edit event to record
- [x] Evolution view: is the agent improving? approval-rate ↑, rejection-rate ↓, proposals landing, rework ↓ — over time, numeric+visual+data — `evaluationLabelDayCounts` (`packages/store/src/read.ts`) buckets approve/reject by UTC day, the dashboard read seam serves it on every project payload (`ProjectAggregate.evaluationLabelDayCounts`, `apps/dashboard/src/read/source.ts`); the panel's pure trend math (`apps/dashboard/src/web/evaluation-trend.ts`: Sun-start weekly approval-rate buckets, half-vs-half direction with a ±5-point dead band, per-week tip + aria-label text) is now wired into `web/shell.ts` (`evaluationTrendPanel` on the project page, `evaluationTrendTileItems` on the fleet-home tile), visible to the operator with passing DOM specs (`test/web/evaluation-trend-panel.test.ts`)
- [x] Goodhart guard: never let the agent optimize only the gate; the human signal tunes lived-quality judgment + the soul — a SOUL amendment the agent proposes only takes effect on operator ratify (`ratifySoulAmendment`), which is the human signal tuning the soul in practice, not just in spec
- [x] Operating principle wired in: proceed on reasonable interpretation, reserve forks/🟣 for approval, never stall — `MASTER-PLAN.md` §17.4; the firing prompt's NOOP→VERDICT and empty-board PROPOSALS sections encode it

## K. M0-review forward notes (deferred low-severity items from the M0 adversarial review, 2026-07-06)
- [ ] TypeScript type-aware linting (M1): when enabling `parserOptions.projectService`, give ESLint a project whose `include` covers every linted file (root config files + `scripts/*.mjs`).
- [~] (live-CLI dogfood proven at scale — 160+ real firings; formal the internal predecessor behavioral diff never run) M1 experiential DoD (deferred from the machine-verifiable M1): a **live-CLI dogfood run** (real `claude -p` flying a repo, exercising `ClaudeCliModel.invoke`) and a **behavioral diff against the running internal v2.4 script**. The deterministic sandbox e2e proves the pipeline; these confirm the live behavior.
- [x] M0-review items closed: `tsconfig.eslint.json`→`tsconfig.typecheck.json` rename (trivial, no archive needed), plus read-only `openStore` option, dashboard browser tsconfig lib/jsdom split, reuse-lint CI job, SHA-pinned Actions, store path hardening, ClaudeCli stdin-prompt fix, single-instance guard, adaptive-cadence pacing, and OTel wire-format export — full evidence for each in [BACKLOG-999-ARCHIVE.md §K](BACKLOG-999-ARCHIVE.md#k--read-only-open-path-moved-2026-09-13) and its neighboring §K sections.

## L. SOTA-MAP gap items (2026-08-08 · cite map IDs — `docs/SOTA-MAP-llm-software-engineering-2026-08.md`; analysis: RESEARCH-LIBRARY)
- [~] (DEFERRED BY MEASUREMENT ~$0.02/firing — RESEARCH-LIBRARY "Firing cost anatomy"; revisit M6) **B2+K3** Prompt prefix reorder for cache: stable blocks (SOUL + discipline + containment + hard rules) FIRST, volatile (firing number, lastFailure, board) LAST — next prompt version; verify with cache-read-token telemetry
- [ ] **C6+H3** Prompt regression eval set: 20–50 real repo tasks; report pass rate + variance + median steps + cost/solved together; gate every `FIRING_PROMPT_VERSION` bump on it
- [~] **C5** Commit-time independent review (pre-M8 slice): one cheap fresh-context diff-review call per firing, find-problems instruction, non-blocking, finding recorded on the firing. Slices landed: `packages/engine/src/commit-review.ts` (port types in `ports.ts`; `firing.ts` decides when it runs, and `pr-review`'s engine census triages it as advisory) reviews every gate-passed firing's diff on a tool-less cheap model (`AUTOPILOT_REVIEW_MODEL`, default `haiku`, `off` to disable; wired in `fly.ts`), the result rides `FiringRecord.review` and one flight-log line (RUNBOOK §6); the dashboard read carries it onto each flight-log row as `FlightEntry.review` (`read/source.ts`'s `parseCommitReviewRecord`, so `/api/state` serves it). Remaining: render it on the firing detail view (`web/features/firing-timeline.ts`, with `STRINGS` en + he keys).
- [ ] **A4+I3** OS-level sandbox + credential masking for flights (textual guard is layer 2; sandbox = Docker deploy stage, Linux-only; masking so the flight never holds the real token) — known, map confirms priority
- [x] (dedupe done) **C2** Wire BACKLOG-999 into the loop: empty-board firings + the Triage sub-agent consult `docs/BACKLOG-999.md` (the reserved `source: 'backlog'` in TASK_SOURCES finally earns its seat); proposals dedupe against board AND backlog
- [ ] **G4** Retrieval eval metrics for Ask/GENIUS RAG (M4+): faithfulness, context precision/recall, hallucination rate, answer-to-chunk traceability; calibrate any LLM-judge against accumulated operator verdicts
- [ ] **I1** Agent/tool/credential inventory: one generated table — every agent (firing, triage, Ask, ARCHITECT, M8 reviewers), the tools each reaches, the credentials each holds; regenerate on config change. Slice landed — `scripts/threat-model/generate-table.mjs` renders one combined Agent/Tool/Grant table (`docs/THREAT-MODEL.md` §3); `packages/engine/src/config.ts`'s `TOOL_LESS_ALLOWED_TOOLS`/`TOOL_LESS_DISALLOWED_TOOLS` replaced hand-repeated inline literals in `flight/board-triage.ts` and Ask tier 1 (`server/main.ts`), so both are generator-visible now too. Remaining: the M8 PR-reviewer LLM surface hasn't been built anywhere in this repo yet (re-check once it spawns an agent); credentials (§4) stay hand-maintained narrative prose — its own structured source is the next, larger slice.
- [x] **SOTA-MAP items closed**: **A3** three-valued gate verdict, **C4** deterministic diff-size gate, **B5** starter-SOUL curation guard, **D1** provenance trailers, **B6** schema-validated METRICS/PROPOSALS, **C3** destructive-git deny, **Board hygiene** reconcile-on-session-end, **WCAG-AA** light-theme sev-medium contrast fix — full evidence for each in [BACKLOG-999-ARCHIVE.md §L](BACKLOG-999-ARCHIVE.md#l--a3-three-valued-gate-verdict-moved-2026-09-14) and its neighboring §L sections.
- [ ] **firing-v9 (bundle)** PLAN phase (incl. the delegation decision) + REFLECT + the B2 prompt-prefix reorder + E8/K2 routing annotation for M6 — one deliberate prompt-version bump, gated on the C6+H3 eval set once it exists
