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
| [ ] "Hidden by default, open to edit" everywhere; calm unless the user intervenes | MASTER §2.5, §18.2.5 | M3→M5 |
| [ ] Evolution view (is the agent improving? approval↑ rejection↓ rework↓ over time) | MASTER §17.3 | M5 |

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
| [ ] Per-finding tagging: severity (🔴🟠🟡⚪) × dimension (a11y/security/UX/human/learnings/info/data/priorities) | MASTER §16.1 | M4 |
| [ ] Readiness gauge: % + color bar + per-dimension breakdown, per-project AND fleet | MASTER §16.1 | M4 |
| [ ] Status ladder: RED→ORANGE→YELLOW→WHITE→🟣needs-you→🔵STABLE→🟢completed/affirmed | MASTER §16.1 | M4 |
| [ ] Autopilot INBOX (message the running bot: note/task/plan-request/update-request mid-flight) | MASTER §16.2 | M4 |
| [ ] Triage sub-agent: live-watch inbox+repo+backlog; place/plan/task/do; never stall | MASTER §16.2 | M4 |

## F. Verification boundary + evolution
| Feature | Spec | Milestone |
|---|---|---|
| [ ] Classify machine-100%-verifiable (autonomous) vs human-required (🟣); default to human when unsure | MASTER §17.1-2 | M5 |
| [ ] Autonomous set: gate, secret/dep/SAST, invariants, byte-identity, machine-checkable a11y, budgets | MASTER §17.1 | M1→M8 |
| [ ] Human-required set: visual/brand, UX/human-interaction, ethics (serves living beings), intent, forks | MASTER §17.2 | M5 |
| [ ] Human verdict captured as evaluation label (the fitness/evolution signal); Goodhart guard | MASTER §17.3 | M5 |
| [ ] Operating principle: proceed on reasonable interpretation, reserve forks/🟣, never stall | MASTER §17.4 | M1 |

## G. Efficiency levers (measurable)
| Feature | Spec | Milestone |
|---|---|---|
| [~] Local offload DEFAULT for mechanical sub-work (free local GPU, confidential) — the board-TRIAGE substep (`fly.ts`'s `runBoardTriage`) routes to `OllamaModel` when `AUTOPILOT_MECHANICAL_MODEL` matches `routing.localModel`; fixed a bug where the routing sentinel (`'ollama-local'`) itself was sent to the live server as the model tag (always 404s — local offload silently never ran) — `resolveTriageInvokeModel` (`flight/triage.ts`) now swaps it for the operator's real `AUTOPILOT_OLLAMA_MODEL` tag on the local branch; the primary firing/loop work-unit call stays cloud-only by design (needs agentic tool use no single-turn local completion provides) | ENGINE-RESEARCH I1 | M6 |
| [~] Cost-aware model routing (local/cheap/top by task complexity) — pure tier decision (`packages/engine/src/routing.ts`), its `EngineConfig.routing` wiring, the local-model adapter (`OllamaModel`, `packages/engine/src/adapters/ollama.ts`), and one real call site (board TRIAGE, above) done; TRIAGE now classifies itself as `SubstepKind = 'triage'` and resolves its local-tier model through `tierForSubstepKind`/`modelForTier` instead of a raw string match — the tier table is consulted at TWO real call sites — TRIAGE plus the dashboard's ask-your-project endpoints (`server/main.ts`), whose new `'ask'` SubstepKind resolves its cheap-tier model (`haiku` by default, behavior-preserving) through `tierForSubstepKind`/`modelForTier` instead of a raw hardcoded string; `commit-draft`/`summary` call sites still don't exist to route, and `remediation-formatting` is deliberately model-free (`RemediatingGate` runs the deterministic formatter — cheaper than any tier); operator doc: RUNBOOK §6 "Substep routing & local offload" | ENGINE-RESEARCH I2 | M6 |
| [x] MODEL ROUTING v1 — per-firing PRIMARY model by task tier (`flight/model-routing.ts` → `fly.ts` prompt-build → `loop.ts` per-firing `primaryModel` swap, resilience kept in lockstep): the claimed board task's `EPIC-SPEC:` marker / slice-streak ≥ 3 / architecture-or-security-review keywords escalate to `fable` (`AUTOPILOT_ESCALATED_MODEL`), the DOC-FRESHNESS/CLOSED-TASK AUDIT ritual prefixes drop to `haiku` (`AUTOPILOT_MECHANICAL_MODEL`), everything else — including free picks — stays `sonnet`; `AUTOPILOT_MODEL` still pins flight-wide and wins outright; routed decisions surface as 🧭 lines in the flight log; operator doc RUNBOOK §6 | RESEARCH-LIBRARY "Model economics" | M6 |
| [~] Incremental project index + cache-optimized context (kills the 124:1 re-read) — content-hash index done (M2); cache-optimized context M6 | ENGINE-RESEARCH I3 | M2→M6 |
| [ ] Test-impact sampling gate (+ scheduled full) | ENGINE-RESEARCH I4 | M6 |
| [ ] Warm agent session (Agent SDK) instead of per-message spawn | REACTIVITY §1 | M6 |
| [ ] Parallelism / batching of independent sub-tasks | ENGINE-RESEARCH I5 | M7 |
| [x] Structured/enforced telemetry + SQLite (indexed, queryable) — schema (M0) + enforced firing writes via SqliteFiringStore (M1) | ENGINE-RESEARCH I7-8 | M0→M1 |

## H. Multi-project & supervisor
| Feature | Spec | Milestone |
|---|---|---|
| [ ] Supervisor daemon: registry, run/stop, parallel vs solo scheduling | MASTER §3 | M7 |
| [ ] Aggregate telemetry across projects; improvement-over-time; fairness | MASTER §5.1 | M7 |
| [ ] View each project or all together | MASTER §2.7 | M3, M7 |

## I. Models & languages (Ollama)
| Feature | Spec | Milestone |
|---|---|---|
| [ ] Optional Ollama (toggle), local-only guard (refuse cloud models) | MASTER §6 | M6 |
| [ ] Multilingual set: he+en critical; zh/ja/ru/es + more | MASTER §6; §2.8 | M6, M9 |
| [ ] One-click model install/copy; per-task model choice; guidance editable (proposed-not-locked) | MASTER §2.8 | M5, M9 |
| [ ] Token/usage awareness + Claude membership connection | MASTER §2.12 | M5 |

## J. Security & standards (regulatory-grade)
| Feature | Spec | Milestone |
|---|---|---|
| [ ] Product hardening: CSP, DNS-rebind guard, rate limits, path-traversal guards, no secrets | PATTERNS §2 | M0→M8 |
| [ ] OWASP ASVS + LLM-Top-10; SLSA + OpenSSF Scorecard; SAST/dep-audit | PATTERNS §2 | M0, M8 |
| [ ] All-layer vulnerability detection + propose-fix (security-sensitive = approval-gated) | MASTER §8 | M8 |
| [ ] Only reputable/official sources (deps, models); confidentiality (local-only, no exfil) | MASTER §8; PATTERNS §2 | M0→M9 |
| [~] OTel-shaped attributes captured in the firing record + SQLite (M1); OTel wire-format export at M3; structured logging (no console.log) | PATTERNS §3 | M1→M3 |
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
| [ ] i18n he/en first (RTL-correct) → wider set; Unicode/CLDR/ICU | PATTERNS §6 | M5, M9 |
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
action `TaskActionKind` doesn't have). Sections B, D–O were **not** re-audited this pass — `BACKLOG-999.md` is the
more actively-maintained backlog when the two disagree; don't trust this matrix's other `[x]`/`[~]` marks as current
without checking there or the live tree first.*
