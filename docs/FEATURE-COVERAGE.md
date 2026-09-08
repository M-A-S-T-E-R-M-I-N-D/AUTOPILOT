# Feature Coverage Matrix — AUTOPILOT

> The guarantee that **no feature from any plan is forgotten.** Every capability the founder specified is listed here,
> traced to the doc that specifies it and the milestone (`ACTION-PLAN.md`) that delivers it. If it's in a plan, it's in
> this matrix. Status: `[ ]` planned · `[~]` in progress · `[x]` done.

## A. Core engine & autonomy
| Feature | Spec | Milestone |
|---|---|---|
| [x] External loop over `claude -p` (subscription auth, no API key) — `ClaudeCliModel` adapter + loop; e2e-proven pipeline; **auth modes** (subscription default / API key / headless OAuth token) with stray-key stripping per the official credential precedence | ENGINE-RESEARCH G1; MDVIEWER §1 | M1 |
| [x] Orient → pick → gate → commit → self-report → pace — firing prompt built (`buildFiringPrompt`) + live flight wired (`dashboard:fly`: real ClaudeCliModel · detected gate via GateRunner · budget-capped); e2e-proven live (160+ real firings — BACKLOG-999 §A) | MASTER §3; ENGINE-RESEARCH | M1 |
| [x] Un-fakeable telemetry (envelope + self-report, cross-checked by sha/HEAD) | ENGINE-RESEARCH G2 | M1 |
| [x] Graceful telemetry degradation (infer from commit) | ENGINE-RESEARCH G3 | M1 |
| [x] Atomic firing (one unit, METRICS at commit) | ENGINE-RESEARCH G4 | M1 |
| [x] Gate: typecheck+test+build, revert-clean on red — engine runs the gate (GatePort) + additive revert (M1); `GateRunner` adapter executes the detected command list (argv-only), wired live into `fly.ts`'s per-firing and flight-end sync-back gates | ENGINE-RESEARCH G5 | M1 |
| [x] Model resilience: fallback + promote-on-exhaustion + time-based reprobe — state machine + firing/loop integration, e2e-proven | ENGINE-RESEARCH G6 | M1 |
| [x] Quota safety: budget cap (CLI arg), global hibernation + STOP-aware sleep, adaptive cadence + weekly pacing advisor (`packages/engine/src/pace.ts` + `SqlitePacer` — BACKLOG-999 §A) | ENGINE-RESEARCH G7 | M1 |
| [~] Learnings + retro — loop retro cadence done (M1); retro prompt content + learnings curation with the SOUL (M2) | ENGINE-RESEARCH G8 | M1→M2 |
| [x] Lock/mutex + graceful STOP + persisted state — STOP + restart-safe state, per-project single-instance lock (`FileInstanceLock`, `packages/engine/src/adapters/instance-lock.ts` — BACKLOG-999 §A) | ENGINE-RESEARCH G10 | M1 |
| [ ] Decision lifecycle (DECISIONS↔APPLIED, reconcile, disjointness) | ENGINE-RESEARCH G11 | M5 |

## B. Onboarding / learn any project
| Feature | Spec | Milestone |
|---|---|---|
| [~] Lock onto a folder; research/review/understand — lock+gate+index done (M2); deep review as the engine flies + M4 RAG | MASTER §2.2 | M2 |
| [x] Backup (MYTH) + baseline (LEGACY) + safety branch BEFORE any git action | MASTER §7; §2.9 | M2 |
| [x] Auto-detect stack + gate (typecheck/test/build/lint) across ecosystems (JS/TS, Python, Go, Rust) | MASTER §2.3 | M2 |
| [~] Map architecture/conventions; incremental content-hash index — index done (M2); deep convention mining incremental | ENGINE-RESEARCH I3 | M2 |
| [x] Generate starter SOUL + board; resume seen projects (telemetry infra landed M0/M1) | MASTER §3 | M2 |

## C. Dashboard (web GUI) — all screens
| Feature | Spec | Milestone |
|---|---|---|
| [~] Fleet home: live cards (status · stack · files · ship-rate · severity gauge · last activity) + 3s poll + dark/light/terminal themes done (M3 MVP, axe-clean); single↔all toggle + improvement sparkline pending | MASTER §5.1 | M3 |
| [~] Project detail: **dedicated inside page `/p/<id>`** (card click-through; live-streamed, everything open, search/ask pinned, honest not-found, escaped anchor) + **task board** (`recentTasks`: open-first, status/severity/dimension chips) + live flight log + activity timeline + index breakdown done; board-by-status columns + raw export + animated RAIL pending | MASTER §5.2 | M3→M4 |
| [x] Graphs: cost/shipped, tokens, ship-rate — done (fleet cost total + per-project Metrics + cost-per-firing sparkline, on real flight data); turns/self-report/improvement-over-time trends are a follow-up | MASTER §2.5 | M3 |
| [~] Approvals queue (🟣): approve/reject/delete UI live (`needs_approval` status, `TaskActionKind` — BACKLOG-999 §C); edit action + explain-impact-before-save not yet built | MASTER §5.3 | M5 |
| [ ] SOUL/identity editor (locked-by-default, proposable) | MASTER §5.4 | M5 |
| [ ] Versions screen (MYTH/LEGACY/flight timeline, diff, additive restore) | MASTER §5.5, §7 | M5 |
| [~] Settings — **connect screen delivered early** (dashboard: choose subscription / API key / headless token · verify the `claude` CLI · secret stored 0600, CSRF-guarded, never echoed); models/quota/language/a11y/security settings remain | MASTER §5.6 | M5 |
| [ ] Anomalies/health (regressions, cost spikes, gate-fails, security findings + proposed fixes) | MASTER §5.7 | M8 |
| [~] "Hidden by default, open to edit" everywhere; calm unless the user intervenes — progressive disclosure live (chips + drill-downs on activity/firing-timeline/landing, Load-More — BACKLOG-999 §C); not yet swept across every surface | MASTER §2.5, §18.2.5 | M3→M5 |
| [x] Evolution view (is the agent improving? approval↑ rejection↓ over time) — weekly operator approval-rate trend chart + summary tiles, live and tested (`web/features/evolution.ts` + `web/evaluation-trend.ts` — BACKLOG-999 §J) | MASTER §17.3 | M5 |

## D. Reactivity — talk · assign · live (spec REACTIVITY.md)
| Feature | Spec | Milestone |
|---|---|---|
| [~] Talk to each autopilot (chat: spawn local CLI → SSE; mode-tiered tools; SOUL personas) — **dashboard code-search + grounded ASK** done (`/api/search` + `/api/ask`: retrieval → injection-defended prompt → ONE tool-less model call with cited paths; a no-sources question short-circuits without spending quota); multi-turn chat (CLI spawn → SSE) + personas pending | REACTIVITY §1 | M4 |
| [~] Best-in-class hybrid RAG (SQLite FTS5 + local embeddings + BM25/vector ranker) — **FTS5 trigram + bm25 retrieval core + onboarding auto-index + RRF fusion core** done (`project_search` migration v4 + `SqliteSearchStore` + `reciprocalRankFusion` k=60, pure/tested); **vector leg LIVE**: `sqlite-vec` loaded into the same DB (`openVectorStore`+`SqliteVecStore`: lazy vec0 table, 384-dim, graceful BM25-only degradation) + `hybridSearch` (BM25⊕KNN via RRF, vector-only hits surface with content excerpts); remaining: local ONNX embedder (fastembed/transformers.js) for document+query vectors | REACTIVITY §1.1 | M4 |
| [x] `<<< PROJECT_CONTENT >>>` untrusted-data injection defense — `buildAskPrompt` fences excerpts as untrusted data between explicit markers, defangs forged fence markers, and mandates no-guess replies (`ask-v1`, tested incl. break-out attempts) | REACTIVITY §5 | M4 |
| [ ] Retrieval-as-MCP (one retrieval API for dashboard + any harness) | REACTIVITY §1.1 | M4 |
| [~] Assign tasks (dashboard form / chat NL→draft / inbox / self-generated) → one unified task entity — **the assign→fly loop is CLOSED**: dashboard task form + done-button (POST /api/task/create|status), flights consume the open board (`firing-v3` BOARD section, prefer-assigned, task-id-as-METRICS-item), and gate-verified shipped firings auto-mark their task done; plus launch/stop a flight from the dashboard. Chat/inbox NL→draft + richer task entity fields pending | REACTIVITY §2 | M4 |
| [ ] Inline agent control-channel tokens ([task:… ], [defer:human …]) | REACTIVITY §2 | M4 |
| [ ] Task/handoff/status worktree-orchestration dispatch contract (parallel workers) | REACTIVITY §2; MDVIEWER §4 | M7 |
| [~] Live view: agent-semantics SSE + filesystem WS + `__live__` echo-suppression — **fleet-state SSE push** done (`/api/stream`: 1.5s cadence, same-origin, poll fallback; the flight bar + phase rail + activity move live during a flight); per-agent-semantic events + filesystem WS pending | REACTIVITY §3 | M4 |
| [ ] In-chat tool chips (what file it's touching now) | REACTIVITY §3 | M4 |
| [ ] Turn-grouped activity timeline | REACTIVITY §3 | M4 |
| [~] Abstract activity MAP (minimal, correct, event-derived: ORIENT→…→COMMIT rail + file nodes) — **rail + file nodes** done (`activityFileNodes`: distinct files, phase-colored, touch-counted, newest-first, live via SSE); richer graph edges / turn-grouping pending | REACTIVITY §3 | M3→M4 |

## E. Progression gauge + inbox/intake
| Feature | Spec | Milestone |
|---|---|---|
| [x] Per-finding tagging: severity (🔴🟠🟡⚪) × dimension (a11y/security/UX/human/learnings/info/data/priorities) — the task schema carries both (`SEVERITIES`/`DIMENSIONS` enums, `packages/store/src/types.ts`, matching the full dimension set), rendered on the task board as chips (`taskSeverityChip`/`taskDimensionChip`, `apps/dashboard/src/web/task-queue.ts`) | MASTER §16.1 | M4 |
| [~] Readiness gauge: % + color bar + per-dimension breakdown, per-project AND fleet — per-project severity color bar is live (`openSeverityGauge` + `gaugeSegments`, the fleet card's findings gauge); fleet-wide is only a scalar open-findings count (`FleetTotals.openFindings`, `apps/dashboard/src/read/fleet.ts`), with no per-severity/per-dimension breakdown at fleet level and no numeric "%" framing anywhere | MASTER §16.1 | M4 |
| [ ] Status ladder: RED→ORANGE→YELLOW→WHITE→🟣needs-you→🔵STABLE→🟢completed/affirmed | MASTER §16.1 | M4 |
| [x] Autopilot INBOX (message the running bot: note/task/plan-request/update-request mid-flight) — a dashboard message box (`apps/dashboard/src/inbox/add.ts`, wired into `server/main.ts`) writes into the same `INBOX/` folder every firing reads as optional context (`buildInboxDigest`, `packages/engine/src/inbox.ts`); dropped notes auto-triage into board tasks (`flight/inbox-triage.ts`, `source:'inbox'`) — every note collapses to one generic task, with no formal note/plan-request/update-request type split | MASTER §16.2 | M4 |
| [~] Triage sub-agent: live-watch inbox+repo+backlog; place/plan/task/do; never stall — post-flight (once-per-firing) inbox triage is live and unconditional (`triageInboxEntries` turns every dropped note straight into a task, no place/plan-further decision); live-watch and repo/backlog-driven triage are still pending | MASTER §16.2 | M4 |

## F. Verification boundary + evolution
| Feature | Spec | Milestone |
|---|---|---|
| [ ] Classify machine-100%-verifiable (autonomous) vs human-required (🟣); default to human when unsure | MASTER §17.1-2 | M5 |
| [ ] Autonomous set: gate, secret/dep/SAST, invariants, byte-identity, machine-checkable a11y, budgets | MASTER §17.1 | M1→M8 |
| [ ] Human-required set: visual/brand, UX/human-interaction, ethics (serves living beings), intent, forks | MASTER §17.2 | M5 |
| [~] Human verdict captured as evaluation label (the fitness/evolution signal); Goodhart guard — approve/reject/SOUL-ratify wired (`recordEvaluationLabel`, `packages/store/src/mutate.ts`), read back into the Evolution view (BACKLOG-999 §J); edit/note still uncaptured (store has no `updateTask`) | MASTER §17.3 | M5 |
| [x] Operating principle: proceed on reasonable interpretation, reserve forks/🟣, never stall — wired into the firing prompt itself (`packages/engine/src/prompt.ts`'s NOOP→VERDICT and PROPOSALS sections) | MASTER §17.4 | M1 |

## G. Efficiency levers (measurable)
| Feature | Spec | Milestone |
|---|---|---|
| [~] Local offload DEFAULT for mechanical sub-work (free local GPU, confidential) — the board-TRIAGE substep (`fly.ts`'s `runBoardTriage`) routes to `OllamaModel` when `AUTOPILOT_MECHANICAL_MODEL` matches `routing.localModel`; fixed a bug where the routing sentinel (`'ollama-local'`) itself was sent to the live server as the model tag (always 404s — local offload silently never ran) — `resolveTriageInvokeModel` (`flight/triage.ts`) now swaps it for the operator's real `AUTOPILOT_OLLAMA_MODEL` tag on the local branch; the primary firing/loop work-unit call stays cloud-only by design (needs agentic tool use no single-turn local completion provides) | ENGINE-RESEARCH I1 | M6 |
| [~] Cost-aware model routing (local/cheap/top by task complexity) — pure tier decision (`packages/engine/src/routing.ts`), its `EngineConfig.routing` wiring, the local-model adapter (`OllamaModel`, `packages/engine/src/adapters/ollama.ts`), and one real call site (board TRIAGE, above) done; TRIAGE now classifies itself as `SubstepKind = 'triage'` and resolves its local-tier model through `tierForSubstepKind`/`modelForTier` instead of a raw string match — the tier table is consulted at TWO real call sites — TRIAGE plus the dashboard's ask-your-project endpoints (`server/main.ts`), whose new `'ask'` SubstepKind resolves its cheap-tier model (`haiku` by default, behavior-preserving) through `tierForSubstepKind`/`modelForTier` instead of a raw hardcoded string; `commit-draft`/`summary` call sites still don't exist to route, and `remediation-formatting` is deliberately model-free (`RemediatingGate` runs the deterministic formatter — cheaper than any tier); operator doc: RUNBOOK §6 "Substep routing & local offload" | ENGINE-RESEARCH I2 | M6 |
| [x] MODEL ROUTING v1 — per-firing PRIMARY model by task tier (`flight/model-routing.ts` → `fly.ts` prompt-build → `loop.ts` per-firing `primaryModel` swap, resilience kept in lockstep): the claimed board task's `EPIC-SPEC:` marker / slice-streak ≥ 3 / architecture-or-security-review keywords escalate to `fable` (`AUTOPILOT_ESCALATED_MODEL`), the DOC-FRESHNESS/CLOSED-TASK AUDIT ritual prefixes drop to `haiku` (`AUTOPILOT_MECHANICAL_MODEL`), everything else — including free picks — stays `sonnet`; `AUTOPILOT_MODEL` still pins flight-wide and wins outright; routed decisions surface as 🧭 lines in the flight log; operator doc RUNBOOK §6 | RESEARCH-LIBRARY "Model economics" | M6 |
| [~] Incremental project index + cache-optimized context (kills the 124:1 re-read) — content-hash index done (M2); the REPO-MAP digest (`packages/engine/src/repo-map.ts`, built per firing in `fly.ts` and spliced into the prompt: top dirs · hot files · gate · recent focus) shrinks ORIENT; the deliberate stable-prefix/volatile-suffix prompt-cache layout I3 calls for is still unbuilt (`prompt.ts` has no cache-structuring), and epic 0009's measurement found context re-reading still dominates cost | ENGINE-RESEARCH I3 | M2→M6 |
| [x] Test-impact sampling gate (+ scheduled full) — live end-to-end: onboarding's JS detector maps a `test:impacted` script to `GateCommands.testImpacted` (`packages/onboarding/src/gate/detectors/js.ts`); `flight/gate-schedule.ts`'s `selectTestCommand`/`perFiringGateSpec` run the impacted command on 4 of every `FULL_TEST_EVERY_N_FIRINGS` (5) firings and the full suite on the 5th; `DynamicGate` (`packages/engine/src/adapters/dynamic-gate.ts`) re-evaluates the schedule per firing; the flight-end convergence gate runs `fullGateSpec` verbatim so it never inherits the diff scope. Gap: only the JS/TS detector wires `testImpacted` so far | ENGINE-RESEARCH I4 | M6 |
| [~] Warm agent session (Agent SDK) instead of per-message spawn — the firing loop's warm session shipped via CLI `--resume` (not the Agent SDK; epic `docs/epics/0009-warm-sessions.md`): `loop.ts` carries `sessionId` forward, `claude-cli.ts` falls back cold on a resume failure — but MEASURED a net loss (n=197: −$1.28/firing, `packages/store/src/warm-sessions.ts` + fleet-home tile `warmSessionTileItems`), so resume was narrowed to checkpoint continuation only plus the bounded FINISH-LINE EXTENSION self-resume (`firing.ts` `finishLineCaps`/`finishLinePrompt`); the chat-side per-message spawn this row's spec names is untouched because multi-turn chat itself is not built (§D) | REACTIVITY §1 | M6 |
| [x] Parallelism / batching of independent sub-tasks — multi-project parallelism done (epic `0001-parallel-flights.md`, all 6 slices) plus same-folder N-way lane fleets (`dashboard fleet <folder> <lanes>` → `flight/fleet-launch.ts` + `scope-partition.ts` keeps same-file board tasks on one lane; validated live at 10-way); intra-firing sub-task batching is the prompt's PARALLEL section (`prompt.ts`: fan out file-disjoint subtasks to subagents, lead consolidates) — agent-discretionary, not an engine scheduler | ENGINE-RESEARCH I5 | M7 |
| [x] Structured/enforced telemetry + SQLite (indexed, queryable) — schema (M0) + enforced firing writes via SqliteFiringStore (M1) | ENGINE-RESEARCH I7-8 | M0→M1 |

## H. Multi-project & supervisor
| Feature | Spec | Milestone |
|---|---|---|
| [~] Supervisor daemon: registry, run/stop, parallel vs solo scheduling — `FlightRunnerRegistry` (`apps/dashboard/src/flight/registry.ts`) does registry + start/stop/pause/status + `maxConcurrent` FIFO scheduling, wired live into `server/main.ts`; still lives inside the dashboard server process, not a standalone daemon | MASTER §3 | M7 |
| [x] Aggregate telemetry across projects; improvement-over-time; fairness — `buildFleetView`/`FleetTotals` + `fleetChronoLog` (`apps/dashboard/src/read/fleet.ts`) roll up cost/shipped/ship-rate/streak across every project into the fleet-home stat tiles; `FlightRunnerRegistry`'s `maxConcurrent` FIFO queue is the shared-quota fairness cap | MASTER §5.1 | M7 |
| [ ] View each project or all together | MASTER §2.7 | M3, M7 |

## I. Models & languages (Ollama)
| Feature | Spec | Milestone |
|---|---|---|
| [~] Optional Ollama (toggle), local-only guard (refuse cloud models) — the local adapter is live (`OllamaModel`, `packages/engine/src/adapters/ollama.ts`: single-turn `/api/generate`, cost genuinely 0, a dead server reports a failed envelope rather than throwing) and opt-in via the env sentinel `AUTOPILOT_MECHANICAL_MODEL=ollama-local` (RUNBOOK §6) — an env toggle, not the Settings-screen toggle MASTER §6 names, and only the board-TRIAGE substep routes to it (§G). No local-only guard exists: `AUTOPILOT_OLLAMA_BASE_URL` accepts any URL (the RUNBOOK even suggests a LAN GPU box) and nothing refuses a cloud-hosted Ollama endpoint or model | MASTER §6 | M6 |
| [ ] Multilingual set: he+en critical; zh/ja/ru/es + more — the local multilingual MODEL set MASTER §6 means (Hebrew via DictaLM, zh/ja/ru/es via multilingual Ollama models) is unbuilt: the tree pulls, recommends, or vets no model at all. Not to be confused with dashboard-UI i18n, which IS live for he+en and RTL-correct — that is §N's row | MASTER §6; §2.8 | M6, M9 |
| [~] One-click model install/copy; per-task model choice; guidance editable (proposed-not-locked) — per-task model choice is live but AUTOMATIC, not operator-chosen: MODEL ROUTING v1 (`apps/dashboard/src/flight/model-routing.ts`, §G) tiers each firing's claimed task into mechanical/default/escalated → `haiku`/`sonnet`/`fable`, with `AUTOPILOT_MODEL` (flight-wide pin), `AUTOPILOT_MECHANICAL_MODEL` and `AUTOPILOT_OLLAMA_MODEL` the only operator levers (env, RUNBOOK §6). Still unbuilt: any dashboard model picker; one-click Ollama model install/copy (nothing in the tree runs `ollama pull` — `scripts/setup.mjs` bootstraps git/pnpm/deps/the Claude CLI only); and the guidance editor, which is §C's still-unbuilt SOUL editor | MASTER §2.8 | M5, M9 |
| [x] Token/usage awareness + Claude membership connection — membership connection is the connect screen (`apps/dashboard/src/web/features/connect.ts` + `connect-panel.ts`: subscription / API key / headless OAuth token, secret stored 0600, CSRF-guarded, never echoed — §C's Settings row); usage awareness is the fleet-home stat tiles (`web/stat-tiles.ts`: total cost, total tokens in+out, cost-per-firing sparkline) plus cost semantics v3 (epic 0013): `realCostUsd` apportions the operator's stated subscription price by each unit's share of MACHINE-WIDE 30-day transcript usage (`AUTOPILOT_SUBSCRIPTION_PRICE_USD` + `AUTOPILOT_USAGE_POOL_DIRS`, `flight/usage-pool-config.ts`), surfaced as the fleet-wide "real cost" tile and per-firing flight-log chips (`flight-log-rows.ts`); the quota-pacing advisor (§A) is the engine-side twin. Residual: usage is derived from local transcripts, never queried live from the Claude account, and epic 0013's last `shell.ts` `fmtCost` call site is still open | MASTER §2.12 | M5 |

## J. Security & standards (regulatory-grade)
| Feature | Spec | Milestone |
|---|---|---|
| [x] Product hardening: CSP, DNS-rebind guard, rate limits, path-traversal guards, no secrets — all five live: strict CSP + hardening headers (`securityHeaders`) and loopback-only `isAllowedHost` DNS-rebind guard (`apps/dashboard/src/server/security.ts`); fixed-window `createRateLimiter` (`server/rate-limit.ts`) on quota-spending endpoints; doc reads are root-jailed BY CONSTRUCTION — only indexed paths from the search store are ever read, no filesystem path touches user input (`read/project-detail.ts`'s `readProjectDoc`); CI secret-scan gate | PATTERNS §2 | M0→M8 |
| [~] OWASP ASVS + LLM-Top-10; SLSA + OpenSSF Scorecard; SAST/dep-audit — Scorecard's "Pinned-Dependencies" practice is live (every GitHub Action SHA-pinned in `ci.yml`) and dep-audit is live (`ci:dependency-audit` + Dependabot); no formal ASVS or LLM-Top-10 checklist audit exists despite `PATTERNS-AND-STANDARDS.md` claiming one "verified in the security harness" (`security.test.ts` covers headers/host-guard only, not an ASVS item-by-item pass); no SLSA provenance attestation; no SAST tool (CodeQL/Semgrep) wired into CI | PATTERNS §2 | M0, M8 |
| [~] All-layer vulnerability detection + propose-fix (security-sensitive = approval-gated) — secret-scan + dependency-audit run every CI build; SAST-style review + auto-propose-fix still M8 (matches `BACKLOG-999.md` §F) | MASTER §8 | M8 |
| [~] Only reputable/official sources (deps, models); confidentiality (local-only, no exfil) — confidentiality is live (local-only architecture; content never leaves the machine except via the user's own Claude account); source vetting for deps/Ollama models is not yet built (matches `BACKLOG-999.md` §F) | MASTER §8; PATTERNS §2 | M0→M9 |
| [x] OTel-shaped attributes captured in the firing record + SQLite (M1); OTel wire-format export live (env-driven `OTEL_EXPORTER_OTLP_*`, `apps/dashboard/src/flight/otlp.ts` + `exportOtlpResourceSpans` called per-firing in `fly.ts`, best-effort so a collector outage never fails the flight); structured logging enforced (`no-console: 'error'` in `eslint.config.js`) | PATTERNS §3 | M1→M3 |
| [x] Test pyramid, TDD, coverage ≥80%, CI validators-as-gates | PATTERNS §4 | M0 |

## K. Versioning / backup
| Feature | Spec | Milestone |
|---|---|---|
| [~] MYTH (pristine original) / LEGACY (lock-on baseline) / FLIGHT LOG (additive restore) — MYTH/LEGACY/flight created at lock (M2); versions screen + restore M5 | MASTER §7; PATTERNS §9 | M2, M5 |
| [x] Never force-push/reset-hard/touch main without approval; git-native — additive `git revert` on gate-fail | MASTER §7 | M1 |
| [x] SemVer + Conventional Commits + Keep-a-Changelog | PATTERNS §8 | M0 |

## L. Packaging, distribution & dogfooding

> Deployment path DECIDED + recorded (`docs/ECOSYSTEM-RESEARCH.md` §3, researched from official Cloudflare docs):
> **npm-installable local CLI first → Dockerfile (the packaging step) → Cloudflare Containers as the hosted option**
> (Workers can't spawn processes; Containers run the image + exec processes; server-side auth = the already-built
> `oauth-token`/`api-key` connection modes).

| Feature | Spec | Milestone |
|---|---|---|
| [ ] AUTOPILOT builds itself (dogfooding = continuous self-test) from M1 | MASTER §18.1 | M1→M9 |
| [ ] `pack` → shareable zero-private-data package | MASTER §18.2 | M9 |
| [ ] Landing site with all explanations + ONE "Install & Load" button (installs from 0, honest progress) | MASTER §18.2 | M9 |
| [ ] Product-grade operator files: run / stop / doctor / update / pack / uninstall (cross-platform, signed, idempotent) | MASTER §18.2 | M9 |
| [ ] Site loads with ALL default features, waiting to lock onto a project | MASTER §18.2 | M9 |
| [ ] Everything changeable — but requires approval + impact explanation | MASTER §18.2.5; §17 | M5, M9 |
| [ ] One-command install (`npx autopilot`), optional Tauri desktop shell | MASTER §4; §13 | M3, M9 |

## M. Open-source & identity
| Feature | Spec | Milestone |
|---|---|---|
| [x] Fully open (Apache-2.0 + SPDX/REUSE), zero private data, CI-enforced | MASTER §9; PATTERNS §8 | M0 |
| [x] Author/brand only: 1337 · REL AZEUS · MΔSTERMIND | MASTER §9 | M0 |
| [~] Community-health files (done), disclosure SLAs (done); demo GIF + docs site M9 | PATTERNS §8; MASTER §9 | M0, M9 |

## N. UX / Accessibility
| Feature | Spec | Milestone |
|---|---|---|
| [ ] Strict WCAG 2.2 AA+ (keyboard-complete, contrast, focus, reduced-motion), ARIA APG | PATTERNS §5 | M3→M8 |
| [x] Machine-checkable a11y automated in the gate (axe-core) — `apps/dashboard/test/web/a11y.test.ts` runs `axe-core` (WCAG 2.0/2.1/2.2 A+AA) against the ACTUAL rendered shell, fleet cards, project page, first-run tour dialog, and the LANDING/RELEASE cards' live-fetched markup, asserting zero violations; runs automatically every `pnpm run test`/`test:impacted` (part of the gate, not a manual/opt-in check) | PATTERNS §5; MASTER §17.1 | M3 |
| [~] i18n he/en first (RTL-correct) → wider set; Unicode/CLDR/ICU — he/en is live: `packages/tokens/src/locales.ts` (`LOCALE_NAMES = ['en','he']`, reading direction a first-class locale property) + a full Hebrew `STRINGS` table (`packages/tokens/src/strings.ts`), the masthead language switcher (`shell-html.ts`'s `langButtons` + `web/features/locale.ts`'s `applyLocale`/`translateDom`, which flips `<html lang>` AND `dir` to `rtl` and re-sweeps every `data-i18n*`-tagged element on each fleet tick), non-English tables deferred into `/panels.js` (`locale-data.ts`). Per-surface string coverage is still being extended slice by slice (an active board item); the wider locale set and CLDR/ICU formatting are unbuilt | PATTERNS §6 | M5, M9 |
| [ ] High UX; calm-by-default, opinionated-strong defaults | MASTER §2.5 | M3→M9 |

## O. Harness pack & multi-harness projection
| Feature | Spec | Milestone |
|---|---|---|
| [ ] Review-agent harness pack: code / security / tests review agents + TDD guide + doc-gen (shipped out of the box) | MASTER §2.3, §3; ACTION-PLAN M8 | M8 |
| [ ] Multi-harness catalog → install-target adapter registry (author once, project into Claude/Codex/Cursor/…); generated, not checked-in | MDVIEWER §5; PATTERNS §1; ACTION-PLAN M8 | M8 |

---
*If a feature the founder named is missing from this matrix, that is a bug in the matrix — add it. This is the "nothing
forgotten" contract for a project this size. Cross-refs the full doc set (see `README.md`).
Reconciled against the M0/M1 build state by the 2026-07-07 completeness audit; sections A (core engine/autonomy) and
C's Approvals-queue row were re-verified against `BACKLOG-999.md` and the live tree on 2026-09-05 — 5 rows corrected
(three claimed "pending" work — gate auto-wiring, quota pacing, the single-instance lock — that had already shipped;
one claimed the orient→pace loop "needs a real run" despite 160+ real firings; Approvals-queue overclaimed an "edit"
action `TaskActionKind` doesn't have). The rest of section C was re-verified the same way on 2026-09-08 — 2 more rows
corrected here (progressive disclosure and the Evolution view were both already live but marked `[ ]`), plus 3 rows
in `BACKLOG-999.md` §C itself that overclaimed done (a fleet-home improvement sparkline/toggle, project-detail
board-by-status columns + raw export, and the same Approvals-queue "edit" action) — none of that UI exists in the
live tree. Sections F and H were audited the same day — 4 more rows corrected (evaluation-label capture and the
firing prompt's own reasonable-interpretation/never-stall principle were both further along than `[ ]`; the
multi-project registry's run/stop/scheduling and its fleet-wide telemetry/fairness rollup were both live and
untracked) — `BACKLOG-999.md` §D agreed with the same wrong `[ ]` marks and was corrected alongside it. Section B
was re-audited on 2026-09-08 and found already accurate (all 5 rows' `[x]`/`[~]` marks matched the live tree; no
change). Section E was audited the same day — 4 of its 5 rows corrected (severity×dimension tagging and the
INBOX read/write/auto-triage loop were both fully live though marked `[ ]`; the readiness gauge and the triage
sub-agent are each partially live, upgraded to `[~]` with the specific gap named; the status-ladder row was
verified genuinely unbuilt and left alone) — `BACKLOG-999.md` §I carried the same wrong marks and was corrected
alongside it, except its status-ladder-adjacent PURPLE/BLUE-GREEN gate rows, which name a computed ladder state
that still does not exist and were left `[ ]`. Section J was audited on 2026-09-08 — 5 of its 6 rows corrected:
product hardening (CSP/DNS-rebind/rate-limit/path-traversal/secrets) is fully live and was upgraded to `[x]`; the
OTel row's wire-format export turned out to be fully wired (env-driven, called per-firing in `fly.ts`, not just
defined) and was upgraded to `[x]`; the ASVS/LLM-Top-10/SLSA/Scorecard/SAST row, the all-layer vulnerability
detection row, and the reputable-sources row were each only partially true and downgraded from `[ ]` to `[~]`
with the real split named — `BACKLOG-999.md` §F already carried the correct partial marks these three rows now
match. Section G was audited on 2026-09-08 — 3 of its 8 rows corrected: the test-impact sampling gate (impacted-first
schedule + every-5th full run + flight-end full gate) and parallelism (cross-project flights, N-way same-folder lanes,
prompt-level subagent fan-out) were both fully live though marked `[ ]`; the warm-session row moved to `[~]` because
the loop's CLI-`--resume` session-carry shipped but measured a net loss and was narrowed to checkpoint continuation
plus finish-line extension; the incremental-index row kept `[~]` with the REPO-MAP digest credited and the
stable-prefix cache layout named as the real gap — `BACKLOG-999.md` §H's matching warm-session/semantic-index row
carried the same wrong `[ ]` and was corrected alongside it. Section I was audited on 2026-09-08 — 3 of its 4 rows
corrected: the Ollama row moved to `[~]` (the local adapter and its env opt-in are live; the Settings toggle and the
cloud-refusing guard are not — `AUTOPILOT_OLLAMA_BASE_URL` accepts any URL); the model-choice row moved to `[~]`
(automatic per-task routing is live; the picker, one-click install and guidance editor are not); token/usage awareness
+ membership connection was fully live (connect screen, cost/tokens tiles, cost-semantics-v3 real cost) though marked
`[ ]` and moved to `[x]`; the multilingual-MODEL-set row was verified genuinely unbuilt and kept `[ ]`, but §N's
dashboard-UI i18n row — he/en live and RTL-correct — was corrected to `[~]` alongside, since the two are easily
conflated. `BACKLOG-999.md` §E carried the same wrong `[ ]` marks on its Ollama, model-choice and (partially) bootstrap
rows, as did §H's token/usage row; all were corrected alongside. Sections D (remaining rows) and K–O (bar N's i18n
row) are still **not** re-audited (board web-mtndm5fc-2vloky) —
`BACKLOG-999.md` is generally the more actively-maintained backlog when the two disagree, but as this pass shows
it isn't infallible either; check the live tree before trusting either doc's `[x]`/`[~]` marks.*
