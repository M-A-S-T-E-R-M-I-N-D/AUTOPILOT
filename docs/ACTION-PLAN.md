# Action Plan — AUTOPILOT (the definite build plan)

> The concrete, professional execution plan. Every milestone has explicit **deliverables** and a binary **Definition of
> Done (DoD)** — no ambiguity, no open questions. Decisions are locked (`MASTER-PLAN.md` §15). Standards are wired in
> from M0 (`PATTERNS-AND-STANDARDS.md`), not bolted on. From M1, AUTOPILOT **flies its own repo** (dogfooding, §18.1) —
> the dogfooding proof is a first-class DoD wherever the capability exists.

## Operating principles for the build
1. **Standards-first** — CI gates, licensing (Apache-2.0 + SPDX), community-health, security scanning exist at M0.
2. **Definition-of-Done gates** — a milestone is done only when its DoD is objectively met (machine-verifiable parts
   auto-checked; experiential parts human-verified per §17).
3. **Dogfooding** — from M1, AUTOPILOT's own repo is tracked project #1; each later milestone is (where possible) shipped
   by AUTOPILOT itself, with the flight log as proof.
4. **Efficiency by design** — the ENGINE-RESEARCH levers (local offload, routing, incremental index, sampling gate) are
   built in, not retrofitted.
5. **Ship in thin vertical slices** — every milestone is demoable ("watch it fly", "talk to it", "pack it").

## Milestones

### M0 — Foundations & standards (repo skeleton)
- **Deliverables:** monorepo (`packages/engine`, `onboarding`, `store`, `mcp`; `apps/dashboard`); TypeScript + strict
  config; ESLint(flat)+Prettier; Vitest; CI (typecheck/test/coverage≥80%/lint/secret-scan/validate-configs/no-personal-paths);
  Apache-2.0 + SPDX headers + REUSE; `CONTRIBUTING`/`CODE_OF_CONDUCT`/`SECURITY.md`/`GOVERNANCE`; commitlint (Conventional
  Commits); the SQLite schema (events, metrics, tasks, projects, versions).
- **DoD:** `git clone && install && test` is green on a clean machine (Win/Mac/Linux); CI passes; the schema migrates.
- **Depends on:** nothing. **Dogfooding:** the repo is created; AUTOPILOT registers itself as project #1 at M1.

### M1 — The Engine (faithful v2.4 TS port) — **"it flies, headless"**
- **Deliverables:** cross-platform TS port of the proven loop — orient → pick → gate → commit → self-report → pace;
  model resilience (fallback/promote/reprobe), quota safety (budget cap, adaptive cadence, weekly pacing,
  global-exhaustion hibernation, STOP-aware sleep); un-fakeable telemetry (sha/HEAD cross-check) → SQLite; per-project
  single-instance guard + graceful STOP; wraps `claude -p` (subscription auth, no API key).
- **DoD:** on a **sandbox repo**, AUTOPILOT runs headless and ships ≥1 **gated** commit (tree stays green or reverts
  cleanly); telemetry lands in SQLite; STOP is honored within ~1 min; behavior verified against the internal v2.4 predecessor script.
- **Depends on:** M0. **Dogfooding:** AUTOPILOT's own repo becomes tracked project #1; the self-test loop begins.

### M2 — Onboarding ("lock onto any project, safely")
- **Deliverables:** folder-lock ritual — **backup (MYTH) + baseline (LEGACY) + safety branch BEFORE any git action**;
  gate auto-detection (typecheck/test/build/lint across JS/TS, Python, Go, Rust, …); architecture/convention mapping;
  the incremental **project index** (content-hash-invalidated) + starter SOUL + board.
- **DoD:** point it at 3 different-stack repos; each is backed up, oriented, its gate detected, index built; re-locking
  a seen repo resumes state. No repo is ever touched before its MYTH/LEGACY snapshot exists.
- **Depends on:** M1.

### M3 — Read-only Dashboard — **"watch it fly"** (MVP complete)
- **Deliverables:** localhost web app (React+Vite) over a Supervisor API (REST+WS); **Fleet** (single↔all), **Project
  detail** (board by status, flight log, graphs: cost/shipped·tokens·turns·self-report·ship-rate over time, raw
  exportable data), and the **abstract activity map** (ORIENT→PICK→DO→GATE→COMMIT rail + file-touch nodes, event-derived,
  minimal, reduced-motion-safe); the **progression gauge** (severity×dimension → RED…🔵🟢). Strict a11y baseline.
- **DoD:** on a clean machine, one command installs; add a real repo; it backs up, orients, ships ≥1 gated commit; the
  dashboard shows it **live** with graphs, flight log, and the activity map. axe-core clean.
- **Depends on:** M1, M2. **This is the "few-days" MVP target.**

### M4 — Reactivity (talk · assign · live) — spec `REACTIVITY.md`
- **Deliverables:** per-project **chat** (spawn local CLI → SSE, mode-tiered tool authority, SOUL personas); **hybrid RAG**
  (SQLite FTS5 + local embeddings + BM25/vector ranker over the index; `<<< PROJECT_CONTENT >>>` injection defense);
  **task assignment** into the one unified task entity (from dashboard/chat/inbox/self); the **inbox + Triage sub-agent**
  (fully-autonomous intake, never stall); the **dual live-stream** (agent-semantics SSE + filesystem WS + `__live__`
  echo-suppression) feeding the activity map.
- **DoD:** you can ask an autopilot a question (grounded, cited), assign it a task in natural language (it drafts →
  confirm), leave an inbox message mid-flight (it ingests), and see every step live (chat chips + timeline + map).
- **Depends on:** M3.

### M5 — Control & approvals ("everything changeable — with approval")
- **Deliverables:** **Approvals queue** (🟣 human-required; approve/edit/reject with impact explained before save); **SOUL
  editor** (locked-by-default, proposable prompt improvements you ratify); **Versions screen** (MYTH/LEGACY/flight
  timeline, diff, additive one-click restore); **Settings** (models, quota/token view, membership connect, language,
  accessibility, security policy). The verification boundary (§17) enforced: machine-verifiable auto, human-required 🟣.
- **DoD:** every default is editable behind an approval + impact explanation; a change to the SOUL/rules/models is
  ratified and takes effect; a restore creates a new safety branch (never destroys); the evolution view shows the
  human-verdict signal accumulating.
- **Depends on:** M3, M4.

### M6 — Efficiency (the ENGINE-RESEARCH levers) — **measurable**
- **Deliverables:** **local offload default** for mechanical sub-work (Ollama, confidential); **cost-aware model routing**
  (local/cheap/top by task complexity); **incremental index** collapsing the re-orientation cost; **test-impact sampling
  gate** (+ scheduled full); warm agent session where available.
- **DoD:** on the same workload, a **measured** drop in cost/shipped and cache-read tokens vs the M1 baseline (report the
  numbers, honestly, like the predecessor telemetry); no correctness regression (gate stays authoritative).
- **Depends on:** M4.

### M7 — Multi-project & Supervisor ("parallel or solo")
- **Deliverables:** Supervisor daemon — project registry, run/stop per project, parallel vs solo scheduling
  (worktree/process isolation via the task/handoff/status contract), aggregate fleet telemetry + improvement-over-time.
- **DoD:** run 3 projects concurrently and solo; the Fleet view shows each one's live phase + gauge; no cross-project
  interference; quota shared fairly.
- **Depends on:** M1–M6.

### M8 — Harness depth & security (all layers)
- **Deliverables:** full review-agent harness (code/security/tests review agents; TDD; docs); continuous **anomaly
  detection** (cost spikes, regressions, gate-fail rate); **all-layer vulnerability scan + propose-fix** (secret scan,
  dep-audit, SAST-style review) with security-sensitive fixes propose-for-approval; strict **WCAG 2.2 AA+** pass;
  multi-harness catalog→install-target registry (author once, project everywhere).
- **DoD:** OWASP ASVS checklist passes on the dashboard/APIs; a seeded vulnerability is detected + a fix proposed
  (never silent); accessibility audit (automated + human) passes; anomalies surface with proposed fixes.
- **Depends on:** M1–M7.

### M9 — Packaging & OSS launch — **"pack for a friend"** (§18.2)
- **Deliverables:** `autopilot pack` → a shareable, zero-private-data package; the **landing site** (all explanations +
  ONE **Install & Load** button that installs runtime + app + optional Ollama/models from 0, honest progress);
  product-grade operator files **`run` / `stop` / `doctor` / `update` / `pack` / `uninstall`** (cross-platform, signed,
  idempotent); the site loads with **all default features, waiting to lock**; everything changeable behind approval +
  impact. Public repo: README + docs site + demo GIF + SLSA-provenanced release.
- **DoD:** on a **clean machine with nothing installed**, open the package → click one button → it installs and loads →
  `doctor` reports all-green → the site is up with defaults, waiting for a project lock → `run`/`stop` work → a friend
  can do this with zero prior setup. **This is the final self-test: AUTOPILOT packaged itself.**
- **Depends on:** M1–M8.

## Sequencing
- **"Few days" MVP = M0 → M1 → M2 → M3** (watch it fly, one project, read-only dashboard).
- **Phase 2 = M4 → M5** (reactivity + control/approvals).
- **Phase 3 = M6 → M7** (efficiency + multi-project).
- **Phase 4 = M8 → M9** (security depth + packaging/launch).
- Fittingly, from M1 AUTOPILOT helps build M2+ on its own repo — the plan accelerates itself.

## Risks & mitigations
| Risk | Mitigation |
|---|---|
| Cross-platform CLI spawn quirks (Windows quoting, `.cmd` shims, 32K cmdline) | copy MdViewer's proven hardening (`MDVIEWER-STUDY.md` §1); `doctor` verifies the CLI path/auth. |
| Local-model quality gap causing bad output | offload the GRUNT only; the cloud model + gate remain verifier of record; misroute fails safe (escalate + verify). |
| Incremental index staleness | content-hash invalidation; a stale index is treated as a cache miss (fresh read), never trusted blindly. |
| Autonomous agent doing something unwanted | the gate reverts red; 🟣 human-required items defer; git safety branch + additive restore; never `main`/force-push. |
| Scope creep (the 999 topics) | `FEATURE-COVERAGE.md` tracks every feature to a milestone; nothing is forgotten, nothing is smuggled in unplanned. |
| Quota exhaustion during the build | the v2.4 quota-safety (hibernation + weekly pacing) already handles it. |

## No open questions
Name (AUTOPILOT · by MΔSTERMIND), engine (TypeScript), license (Apache-2.0), MVP (read-only-first), first repo
(sandbox), colors (§16.1), verification boundary (§17) — all locked. Every feature is traced in `FEATURE-COVERAGE.md`.
**Ready to start M0 on the founder's word.**

*Living doc; the definitive plan. Cross-refs: `MASTER-PLAN.md`, `ENGINE-RESEARCH.md`, `REACTIVITY.md`, `PATTERNS-AND-STANDARDS.md`, `MDVIEWER-STUDY.md`, `BACKLOG-999.md`.*
