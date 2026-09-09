# AUTOPILOT — Backlog (the "999 topics")

The founder noted there are "at least 999" topics AUTOPILOT should cover. This is their home — a living,
categorized register. Nothing gets lost; items graduate into phased work (see `MASTER-PLAN.md` §13).
Status legend: `[ ]` open · `[~]` in a phase · `[x]` done. A `[x]` item's full implementation evidence
may live in [BACKLOG-999-ARCHIVE.md](BACKLOG-999-ARCHIVE.md) instead of inline, as this register is
compressed toward a scannable size (board `web-mtndm5m6-rfly97`) — the inline line always says so.

## A. Engine & autonomy
- [x] (M1, e2e-proven; 160+ real firings) Cross-platform TypeScript port of the v2.4 loop (orient/pick/gate/commit/report/pace/hibernate)
- [x] (instance-lock.ts) Per-project single-instance guard (mutex/lockfile) + graceful STOP (STOP-aware sleep)
- [x] (M1 resilience.ts, proven live) Model resilience: fallback chain, promote-on-exhaustion, time-based re-probe
- [x] (M1 + pacer.ts adaptive cadence) Quota safety: per-firing budget cap, adaptive cadence, weekly pacing, global-exhaustion hibernation
- [~] (adapters/ollama.ts + flight/triage.ts route board TRIAGE to Ollama when configured; FEATURE-COVERAGE §G) Local-model offload as a first-class step (the biggest quota lever) — default-on for mechanical sub-work
- [~] (RETRO firings live; learnings→RESEARCH-LIBRARY; curation ongoing) Retro self-improvement loop + append-only learnings, curated
- [~] (routing.ts tierForSubstepKind/modelForTier + model-routing.ts per-firing escalation; FEATURE-COVERAGE §G "MODEL ROUTING v1") Effort/model routing per task complexity (cheap tier / local for mechanical; top tier for hard reasoning)

## B. Onboarding / "learn any project"
- [x] (M2 complete, e2e DoD) Folder lock → backup (MYTH) + baseline (LEGACY) + safety branch BEFORE any git action
- [x] (M2 complete, e2e DoD) Auto-detect stack + gate (typecheck / test / build / lint) across ecosystems (JS/TS, Python, Go, Rust, …)
- [x] (M2 complete, e2e DoD) Map architecture, conventions, and the highest-value work surface
- [x] (M2 complete, e2e DoD) Generate the starter SOUL + board + telemetry infra for the project
- [x] (M2 complete, e2e DoD) Re-orient safely on projects it has seen before (resume state)

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
- [x] (CSP self, guard hooks, pinning, scans) Product hardening: no secrets, CSP, dep pinning + SRI, input validation at boundaries
- [ ] Sources only from reputable/official/well-known projects; verified Ollama models
- [~] (secret-scan+audit in CI; SAST propose-fix = M8) All-layer vulnerability detection + propose-fix (secret scan, dep-audit, SAST-style review)
- [x] (local-only architecture + operator account) Confidentiality: content never leaves the machine except via the user's own Claude account

## G. Distribution & OSS
- [ ] One-command install per-OS (+ optional desktop build via Tauri)
- [x] Apache-2.0 (or MIT); zero private data; CI secret-scan gate
- [x] Author/brand: 1337 · REL AZEUS · MΔSTERMIND (the only identity)
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
- [x] Autopilot INBOX (human→bot): dashboard message box + `INBOX/` drop; leave a note/task/plan-request/update-request mid-flight — `apps/dashboard/src/inbox/add.ts` (wired into `server/main.ts`) writes into the same `INBOX/` folder every firing reads; auto-triage promotes each note to a board task (`flight/inbox-triage.ts`, `source:'inbox'`), though every note collapses to one generic task with no formal type split
- [x] Engine reads the inbox at the start of every firing (optional input, never a dependency) — `buildInboxDigest` (`packages/engine/src/inbox.ts`), spliced into the firing prompt as strictly optional context
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
- [x] `packages/store` read-only open path: add a `{ readonly }` option to `openStore`/`Store` that opens the DB
  read-only and skips write-only pragmas (`journal_mode = WAL`) — needed when the dashboard opens the store for reads (M3).
  Done — `StoreOptions.readonly` in `packages/store/src/db.ts` (existing callers unaffected); dashboard adoption
  landed too — every pure-read `openStore` call site in `apps/dashboard/src/read/source.ts`
  (`readFleetFromStore` .. `gatherLiveState`) now passes `{ readonly: true }`, so the dashboard never holds a
  write-capable handle alongside the engine's own writer connection; mutation functions (`createTaskInStore` etc.)
  are unaffected. Covered by `test/read/source.test.ts`'s "read-only openStore adoption" spy assertion.
- [ ] TypeScript type-aware linting (M1): when enabling `parserOptions.projectService`, give ESLint a project whose
  `include` covers every linted file (root config files + `scripts/*.mjs`).
- [x] Rename `tsconfig.eslint.json` (M1 prep): it was never an ESLint project — only `pnpm run typecheck` used it.
  Done — renamed to `tsconfig.typecheck.json`; `package.json`'s `typecheck` script updated to match.
- [x] `apps/dashboard` browser tsconfig — `lib`/jsdom half (M3 prep): give the app its own `compilerOptions.lib`
  (incl. `DOM`) and a jsdom Vitest environment instead of the Node base. Done — this added the jsdom
  `environmentMatchGlobs` env; this item's `lib` half needed splitting the single flat `tsconfig.typecheck.json`
  into per-package configs first (`lib` is program-wide, not per-directory), landed by splitting it into
  `packages/*/tsconfig.typecheck.json` + `apps/dashboard/tsconfig.typecheck.json` (each `extends` that package's
  own build `tsconfig.json`, chained in the root `typecheck` script since composite project references can't
  combine with `--noEmit` — TS6310, confirmed empirically). `apps/dashboard/tsconfig.typecheck.json` now sets
  `"lib": ["ES2022", "DOM"]` for real (`src/web/shell.ts` uses `document`/`window` directly), scoped to that
  package alone — Node-only packages no longer see DOM globals leak in from the old flat program. Removed the
  now-redundant `apps/dashboard/test/web/dom-globals.d.ts` triple-slash shim it superseded. `jsx` remains
  N/A — no React/Vite UI yet; add it if/when that lands.
- [x] Consider adding the canonical `reuse lint` (Python) as an optional CI job alongside the Node SPDX-header gate.
  Done — `.github/workflows/ci.yml`'s new `reuse-lint` job (`continue-on-error: true`, so it's informational only)
  runs `pip install reuse==6.2.0 && reuse lint`. Getting the repo REUSE-3.3-compliant surfaced two real gaps: a
  false-positive in `scripts/ci/validate-spdx-headers.mjs` (its own printed CLI guidance string contained a
  literal SPDX-header line that `reuse`'s parser read as a second, malformed header — fixed by wrapping it in a
  REUSE ignore-marker block) and two bundled third-party font license texts
  (`apps/dashboard/src/assets/OFL-{inter,roboto}.txt`) with no SPDX metadata — annotated in `REUSE.toml` under
  their own upstream copyright + `OFL-1.1`, with `LICENSES/OFL-1.1.txt` downloaded via `reuse download OFL-1.1`.
- [x] Security hardening (M8 / OpenSSF Scorecard "Pinned-Dependencies"): SHA-pin GitHub Actions (`actions/checkout`,
  `actions/setup-node`, `pnpm/action-setup`) to full commit SHAs with version comments; Dependabot's github-actions
  ecosystem keeps them current. Done — `.github/workflows/ci.yml` pins all three actions to their `v4.4.0` commit
  SHAs with `# vX.Y.Z` comments; `.github/dependabot.yml` already tracks the `github-actions` ecosystem so PRs
  keep the pins current.
- [x] Store path hardening (M3): validate/normalize the filesystem path passed to `openStore` before it reaches
  `better-sqlite3` once a less-trusted caller (the dashboard/config) can supply it, to avoid path-confusion.
  Done — `resolveStorePath` in `packages/store/src/db.ts` rejects NUL-byte paths and resolves relative paths to
  absolute ones; it runs unconditionally inside the `Store` constructor (the sole path every caller — dashboard,
  CLI, onboarding — goes through), so no caller can bypass it.
- [x] ClaudeCli long-prompt-via-stdin (Windows 32K cmdline ceiling): fold an over-long system prompt into the child's
  stdin instead of an argv entry (MDVIEWER-STUDY §1). Done — `CLI_STDIN_PROMPT_THRESHOLD` in
  `packages/engine/src/adapters/claude-cli.ts`.
- [x] Single-instance guard for the engine loop (per-project): cross-platform `O_EXCL` lockfile + PID-liveness check
  (v2.4 used a Windows named mutex). Done — `FileInstanceLock` in `packages/engine/src/adapters/instance-lock.ts`,
  wired into `apps/dashboard/src/fly.ts` keyed per PROJECT id (`engine-<projectId>.lock`), so flights against
  different projects in the same store never contend (PARALLEL FLIGHTS 1/6, plus a follow-up).
- [x] Adaptive cadence + weekly pacing adapter (`nextPaceMin`): port the observed-spend usage advisor (v2.4
  `usage_advisor.py`) behind the pacer port. Done — pure `nextAdaptivePaceMin` in `packages/engine/src/pace.ts`
  (base cadence under half of either soft cap, ramps to a bounded 6x as real spend nears the hourly/weekly cap),
  backed by `SqlitePacer` (`packages/engine/src/adapters/pacer.ts`) reading real gate-verified spend from the same
  `metrics` rows the dashboard graphs use; wired into `apps/dashboard/src/fly.ts`.
- [~] (live-CLI dogfood proven at scale — 160+ real firings; formal the internal predecessor behavioral diff never run) M1 experiential DoD (deferred from the machine-verifiable M1): a **live-CLI dogfood run** (real `claude -p`
  flying a repo, exercising `ClaudeCliModel.invoke`) and a **behavioral diff against the running internal v2.4 script**.
  The deterministic sandbox e2e proves the pipeline; these confirm the live behavior.
- [x] OpenTelemetry wire-format export for firings (the OTel-shaped attributes are already captured in the firing
  record + SQLite): export over OTLP for standard-portable dashboards — lands with the dashboard at M3.
  Mapping + injectable HTTP transport done — `toOtlpResourceSpans`/`exportOtlpResourceSpans` in
  `packages/engine/src/otlp.ts`. Endpoint wiring (`ap-msksw1me-0`) done —
  `apps/dashboard/src/flight/otlp.ts`'s `otlpConfigFromEnv` reads the standard `OTEL_EXPORTER_OTLP_*` env vars
  (off when unset); `fly.ts`'s `onFiringComplete` exports each firing's span best-effort (a collector outage logs
  a warning, never fails the flight). Documented in the root README's "Telemetry & OTLP export" section.

## L. SOTA-MAP gap items (2026-08-08 · cite map IDs — `docs/SOTA-MAP-llm-software-engineering-2026-08.md`; analysis: RESEARCH-LIBRARY)
- [~] (DEFERRED BY MEASUREMENT ~$0.02/firing — RESEARCH-LIBRARY "Firing cost anatomy"; revisit M6) **B2+K3** Prompt prefix reorder for cache: stable blocks (SOUL + discipline + containment + hard rules) FIRST,
  volatile (firing number, lastFailure, board) LAST — next prompt version; verify with cache-read-token telemetry
- [ ] **C6+H3** Prompt regression eval set: 20–50 real repo tasks; report pass rate + variance + median steps +
  cost/solved together; gate every `FIRING_PROMPT_VERSION` bump on it
- [x] **A3** Three-valued gate verdict: `confirmed`/`refuted`/`unverifiable` — a crashed gate command (missing dep,
  OOM) must NOT revert good work like a real failure; RemediatingGate + telemetry learn the third state. Done —
  telemetry already carried `GateResultKind`'s `'unverifiable'` (`packages/engine/src/telemetry.ts`) and
  `firing.ts` already skipped the revert on `gate.crashed`; the missing piece was `RemediatingGate`
  (`packages/engine/src/adapters/remediating-gate.ts`), which used to run the mechanical fixer + a full gate
  re-run (up to the timeout) on a crashed verdict too — now it short-circuits straight through on `first.crashed`,
  since a formatter can't repair a broken environment.
- [x] **C4** Deterministic diff-size gate: changed-lines threshold (~400) as a gate check, mechanical-change exemption
  (gate on review burden, not raw count). Done — `packages/engine/src/diff-size-gate.ts`'s `evaluateDiffSize`
  sums insertions+deletions from `VcsPort.diffNumstat` (new, optional capability; `GitVcs` implements it via
  `git diff --numstat --no-renames -z` — `-z` keeps non-ASCII paths raw, so a C-quoted path cannot
  escape the mechanical-path exemption and revert legitimate work), excluding paths that
  `isMechanicalDiffPath` classifies as review-exempt
  (lockfiles, generated snapshots/binaries, build/vendor output). `firing.ts` runs it only once the real
  typecheck/test/build gate is already green, folding a failing verdict into the SAME additive-revert path a
  real gate failure takes — an oversized diff is reverted, not silently shipped.
- [ ] **C5** Commit-time independent review (pre-M8 slice): one cheap fresh-context diff-review call per firing,
  find-problems instruction, non-blocking, finding recorded on the firing
- [x] **B5** Starter-SOUL curation guard: keep the generated starter minimal (candidate inventory → operator
  compresses); "unreviewed SOUL" flag on the dashboard until the operator ratifies (M5 editor completes this).
  Done — `soul_reviewed`/`soul_proposed` + `markSoulReviewed`/`ratifySoulAmendment`/`dismissSoulProposal`
  ship the unreviewed flag and the operator review/ratify loop; `STARTER_SOUL_LINE_BUDGET`
  (`packages/onboarding/src/onboard/soul.ts`, regression-tested) mechanizes "keep minimal" as an interim guard —
  a new doctrine section can't be baked into the generator without consciously bumping the budget. The full fix
  (M5's human-ratified editor) remains open and unblocked by this.
- [ ] **A4+I3** OS-level sandbox + credential masking for flights (textual guard is layer 2; sandbox = Docker deploy
  stage, Linux-only; masking so the flight never holds the real token) — known, map confirms priority
- [x] **D1** Provenance trailers on autopilot commits: model + `FIRING_PROMPT_VERSION` + harness as git trailers
  (already in SQLite; make it repo-native). Done — the COMMIT step in `buildFiringPrompt`
  (`packages/engine/src/prompt.ts`) now instructs every firing to add `Model:`, `Firing-Prompt-Version:`, and
  `Harness:` trailers next to `Signed-off-by:`.
- [x] **B6** Schema-validate METRICS/PROPOSALS at the parse boundary (enums for severity/dimension; fail-loud record,
  defensive parse stays). Done — `parseProposalsLine` (`packages/engine/src/telemetry.ts`) checks each proposal's
  severity/dimension against the store's `SEVERITIES`/`DIMENSIONS` enums and flags a rejected tag via `invalidTags`
  instead of silently keeping it; `fly.ts`'s `harvestProposals` surfaces the drop to the operator.
- [x] **C3** Destructive-git deny in the guard hook: "additive git only" is prompt-only today — add deterministic
  deny patterns (force-push, `reset --hard`, rebase, `branch -D`, checkout/switch main, `clean -f`, filter-branch)
  to the same PreToolUse guard that already denies path escapes (anti-pattern #14 caught live). Done —
  `packages/engine/src/guard.ts` denies every listed pattern (a follow-up hardening closed a git
  global-flag bypass of the destructive-git guard).
- [x] (dedupe done) **C2** Wire BACKLOG-999 into the loop: empty-board firings + the Triage sub-agent consult `docs/BACKLOG-999.md`
  (the reserved `source: 'backlog'` in TASK_SOURCES finally earns its seat); proposals dedupe against board AND backlog
- [ ] **G4** Retrieval eval metrics for Ask/GENIUS RAG (M4+): faithfulness, context precision/recall, hallucination
  rate, answer-to-chunk traceability; calibrate any LLM-judge against accumulated operator verdicts
- [ ] **I1** Agent/tool/credential inventory: one generated table — every agent (firing, triage, Ask, ARCHITECT,
  M8 reviewers), the tools each reaches, the credentials each holds; regenerate on config change. Slice landed —
  `scripts/threat-model/generate-table.mjs` now renders one combined Agent/Tool/Grant table (`docs/THREAT-MODEL.md`
  §3) instead of just the main flying agent's; `packages/engine/src/config.ts`'s new `TOOL_LESS_ALLOWED_TOOLS`/
  `TOOL_LESS_DISALLOWED_TOOLS` replaced the inline `[]`/`['*']` literals post-flight triage
  (`flight/board-triage.ts`) and Ask tier 1 (`server/main.ts`) each hand-repeated, so both are now generator-visible
  too, alongside the main flying agent and the Ask-escalation tier (already a named export). Remaining: the
  auth-verification probe genuinely has no tool grant (fine as a documented zero-row); the M8 PR-reviewer LLM
  surface (the SAST-style review propose-fix work tracked under M8 above, itself still `~` in progress) has not
  been built in code anywhere in this repo yet — verified by grepping for any `allowedTools`/`disallowedTools`
  literal or CLI/agent spawn outside the four already-generated rows, and for any GitHub Actions workflow invoking
  `claude-code-action`; none exists — so there is no inline literal to extract yet. Re-check once that surface
  actually spawns an agent. Credentials (§4) are still hand-maintained prose, not part of this generated table
  yet — that's the next concrete slice, though it's a larger one: §4 is narrative (location/purpose/at-rest
  protection), not a flat tool list, so it needs its own structured source before it can generate cleanly.
- [x] **Board hygiene** Reconcile board vs git on session end (subject-text match `ap-msksw1mf-3` +
  file-path fallback `ap-msksw1mf-4`, both proven against real fixtures in `reconcile.test.ts`) — full
  evidence moved to [BACKLOG-999-ARCHIVE.md §L](BACKLOG-999-ARCHIVE.md#l--board-hygiene-moved-2026-09-09).
- [x] **WCAG-AA (real bug, from the a11y round)** Light theme `--color-sev-medium` 3.92:1 against surface — under
  AA's 4.5:1, used as gate-phase TEXT color (`.fnode-gate`/`.live-phase-gate`/`.act-search`); nudge OKLCH L down.
  Done — a light-theme `sevMedium` WCAG AA fix as gate-phase text (`packages/tokens/src/themes.ts`);
  contrast is now 5.02:1, and `packages/tokens/test/themes.test.ts` gates every theme's `sevMedium` at ≥ 4.5:1
  against both `surface` and `surfaceRaised`.
- [ ] **firing-v9 (bundle)** PLAN phase (incl. the delegation decision) + REFLECT + the B2 prompt-prefix reorder +
  E8/K2 routing annotation for M6 — one deliberate prompt-version bump, gated on the C6+H3 eval set once it exists
