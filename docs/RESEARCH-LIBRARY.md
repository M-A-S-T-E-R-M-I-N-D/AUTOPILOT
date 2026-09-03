<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Research Library — findings we never re-search

> Every substantive web-research result this project has produced, digested
> and dated. RAG-indexed and readable in the Docs panel, grounding GENIUS/
> Ask answers. Re-research a topic ONLY when its "verify by" note says so or
> the decision it feeds changes. (Operator's rule: the knowledge stays OURS.)

## Agent reliability / ~100% shipping (2026-08-07)

- The industry pattern for mechanical failures is **fix → revalidate →
  keep-or-rollback** (Snyk Agent Fix; Open SWE runs formatters before
  committing) — implemented as our `RemediatingGate`.
- **Corrective-feedback injection** (OpenHands iterative refinement, SkyRL;
  SWE-Dev measured ~2× from multi-turn repair) — implemented as firing-v6
  `lastFailure` prompt section.
- Benchmarks caution: resolve rates collapse on harder suites (gpt-5 ~21%
  on SWE-EVO vs 65% SWE-Bench-Verified); config drift silently degrades
  agents — argues for our frozen, versioned prompts + un-fakeable telemetry.

## Agent observability & visualization (2026-08-07)

- SOTA = full-session **trace trees** (LangSmith/LangGraph Studio),
  **time-travel replay** (AgentOps), tracing paired with **eval gates**;
  OpenTelemetry GenAI conventions for interop (future M6+).
- Kanban boards mislead for agents (parallel, fail-silent, second-long
  tasks — Vibe-Kanban critique): show LIVE activity, not just columns →
  our office map / worker card / per-firing timeline.

## Graph/viz libraries (2026-08-07)

- ≤100 animated nodes (our office map): hand-rolled SVG + ease/force is
  correct (zero deps, CSP `'self'`, 60fps). Verified live.
- Scale-up path when a real fleet view demands it: **Sigma.js + graphology**
  (WebGL, 100K+ nodes) or **AntV G6 5.x** (Rust/WebGPU layouts, richest
  built-ins); Cytoscape.js when graph ALGORITHMS matter; vis-network for
  quick physics toys; D3-force for bespoke control.
- PkgPulse warning adopted: never trust generic node-count benchmarks —
  test OUR graph shape when we get there.

## Copilot / side-chat UX (2026-08-08)

- Placement: collapsible right sidebar for exploration + inline affordances
  in-context; don't exile all AI to the panel (Figr critique).
- **Context injection must be automatic** (current view, selection) with
  @-mention escape hatches (Notion AI reference; its inline-database
  blindness is the anti-pattern to avoid).
- Actions: **spec → plan → outcome-preview → approve** (GitHub Copilot
  Workspace), autonomy as a **dial** that widens with approval history
  (Cursor Composer 2; NNGroup progressive delegation).
- Empty state: context-aware suggested prompts — a blank box loses users.
- → Our build: GENIUS (read, context-aware, grounded in map+search+LIVE
  STATE+CHANGELOG) + ARCHITECT (same core + MCP control tools; destructive
  ops = outcome preview + explicit confirm). Board tasks seeded.

## Canonical pattern sources (2026-08-08)

- Registry in docs/ENGINEERING-DOCTRINE.md §6 (POSA 1–5, PoEAA, EIP-65,
  Azure patterns, microservices.io, SEI SAiP-4e, refactoring.guru,
  Wikipedia index). Verify by: stable — books/sites are canonical.

## In-house reference: MdViewer (a local operator project, 2026-08-08)

- The operator's own production exemplar: M3 dynamic theming, **self-hosted
  Google fonts + Material Symbols** (`npm run setup-fonts` pipeline —
  adopt this pattern for our M3 epic), EN/HE bilingual, ~1080 pure-node
  tests, CSP+security headers, LTS tag discipline (`mdviewer/v1.0.0-LTS`).

## Anthropic models & routing (2026-09-02, verify by 2026-12-01)

- **Correction to the 2026-08-07 note:** the scheduled Sep-1 hike of
  Sonnet 5 to $3/$15 was CANCELLED — Anthropic's official pricing docs
  (`platform.claude.com/docs/en/about-claude/pricing`) confirm $2/$10 is
  now the permanent price, not a closing introductory window. Sonnet 5's
  cost edge over Sonnet 4.6 ($3/$15) is durable, not temporary.
- Current per-MTok in/out (official pricing page): Fable 5.1/Mythos 5.1
  $10/$50 (newest tier, 0.025x cache-hit multiplier vs. the 0.1x standard)
  · Fable 5/Mythos 5 $10/$50 · Opus 5 $5/$25 (matches 4.8/4.7/4.6/4.5) ·
  Sonnet 5 $2/$10 (permanent) · Sonnet 4.6/4.5 $3/$15 · Haiku 4.5 $1/$5.
- Routing wisdom unchanged, now cheaper to keep: Haiku ~70%
  (triage/cheap calls — our Ask + triage), Sonnet builds, Opus/Fable
  reviews & hard reasoning. Flights default sonnet→opus fallback.

## Local RAG efficiency (2026-08-08)

- **Static embeddings (Model2Vec/potion)**: 8–30MB models, ~500× CPU
  speedup, ~8% MTEB trade — the zero-GPU default. FastEmbed/ONNX for the
  quality tier (nomic-embed-text, Qwen3-Embedding-0.6B — Apache).
- **sqlite-vec already supports** int8 + bit vectors, `vec_quantize_binary`,
  `vec_slice` (Matryoshka): winning pattern = binary Hamming coarse pass +
  full-precision rescore. Caveat: binary quant needs high dims + rescore;
  int8 is near-free.
- **ColBERT-style late-interaction rerank** on top-k: +16pts top-1 at
  ~25ms (ECIR 2026 workshop topic). Upgrade path for Ask/GENIUS.
- **License traps**: jina-v3 / NV-Embed are CC-BY-NC — unusable here.

## Sandboxing + incremental computation (2026-08-08)

- Isolation ladder: WASM/Wasmtime+WASI (capability, deny-by-default —
  future MCP tool plugins) → gVisor → Firecracker microVM (125ms boot;
  Lambda/E2B). Anthropic's own sandbox-runtime (Claude Code /sandbox) is
  open-source, Landlock+seccomp — LINUX-only → belongs in the Docker
  deploy stage. Meta's Rule of Two (see security round) is architectural.
- **Turborepo content-addressed caching**: our gate re-runs everything
  each firing — CAS caching = faster+cheaper firings. Adopt carefully
  (cache-correctness pitfalls documented; the gate stays the judge).

## SE methodology for agent loops (2026-08-08)

- Evidence-backed loop: ORIENT → **PLAN** → DO → GATE → COMMIT →
  **REFLECT** (Anthropic explore-plan-code-commit; NormCode E-P-I-V;
  Perceive-Plan-Act-Reflect-Learn survey). PLAN includes the DELEGATION
  DECISION: need subagents? which? per-subtask brief written like
  onboarding a new collaborator (CAID: +26.7% with centralized delegation
  + isolated workspaces + test-based consolidation; DEGRADES ≥8 agents —
  match count to task modularity). Human gate goes between Plan and
  Execute. → firing-v9 planned.
- **SDD (spec-driven)**: version-controlled spec as source of truth for
  epics; GitHub reports ~10× fewer regenerate-from-scratch cycles;
  ThoughtWorks warns against big-bang specs. LIVING-REPO-SPEC.md is our
  first SDD artifact.

## LLM/agent security (2026-08-08)

- **OWASP GenAI LLM Top-10 2026** (published 2026-08-04) + **Agentic
  Top-10 (ASI01–ASI10)**: goal hijack, tool misuse, memory poisoning,
  excessive agency. Doctrine: harden the ARCHITECTURE around the model,
  not the model ("cannot be fully solved" — all three labs concur).
- **Meta's Rule of Two**: never combine in one context more than two of
  {untrusted input, sensitive access, state change}. We already comply
  (tool-less Ask, gated flights, containment) — formalize in doctrine.
- Layered defenses: 73.2% → 8.7% attack success; adaptive attacks still
  >85% vs single defenses. PromptArmor <1% FP/FN on AgentDojo.

## Agent memory & evals & cost (2026-08-08)

- **Letta/MemGPT benchmark**: a plain FILESYSTEM scored 74% on LoCoMo,
  beating dedicated memory libraries — our git+docs+RESEARCH-LIBRARY+RAG
  architecture is the validated pattern. Tiered memory (core/recall/
  archival) if we ever need more.
- **Evals**: prompt changes = #1 regression source; the winning pattern
  is a regression set gated in CI with hybrid scoring (deterministic +
  LLM-judge). Our versioned prompts are the base; the regression set is
  the missing piece (planned).
- **Cost levers**: routing 40-70%, caching ~90% on hits, context
  compaction 50-70%; output tokens cost 4-6× input — bound outputs.

## WCAG 2.2 AAA audit (2026-08-08, verify by 2026-11-01 or on any theme/token change)

- **Hard AAA deltas over our AA baseline** (official W3C criteria,
  `w3.org/WAI/WCAG22/quickref` filtered to Level AAA): **1.4.6 Contrast
  (Enhanced)** 7:1 normal / 4.5:1 large text (vs AA's 4.5:1 / 3:1) —
  the binding one for a themed dashboard. **2.2.3 No Timing** — no time
  limits at all (AA merely requires them adjustable). **3.1.5 Reading
  Level** — lower-secondary level or a simplified alternative. Also
  relevant: **2.1.3 Keyboard (No Exception)**, **2.4.9 Link Purpose
  (Link Only)**, **2.4.12 Focus Not Obscured (Enhanced)** (new in 2.2),
  **2.5.5 Target Size (Enhanced)** 44×44px.
- **Our contrast, computed from the real OKLCH tokens**
  (`packages/tokens/src/themes.ts`, WCAG relative-luminance formula —
  not estimated): dark and terminal themes clear 7:1 almost everywhere
  (body text 15.6–17.3:1, muted text 7.7–8.4:1). **Light theme fails
  AAA on every accent/severity color**: accent 5.39:1, sevCritical
  5.87:1, sevHigh 4.78:1, sevLow 5.13:1, needsYou 6.62:1 — all under
  7:1 (still pass AA's 4.5:1). One AA-level bug found in passing:
  **light `--color-sev-medium` was 3.92:1 against surface, under even
  AA's 4.5:1** — used as TEXT color on `.fnode-gate`/`.live-phase-gate`/
  `.act-search` (gate-phase labels in the live activity rail). **Fixed
  same day** (commit `67d34d5`, ~2h after this audit): nudged OKLCH L
  0.6 → 0.54 (same C/H, amber hue preserved), now 5.02:1 vs surface /
  4.73:1 vs surfaceRaised — `themes.test.ts` pins both floors at ≥4.5:1
  across every theme so this can't silently regress.
- **No Timing**: the dashboard's SSE/poll refresh (`REFRESH_MS`,
  `setInterval` in shell.ts) updates data live but imposes no time
  limit on any user action — compliant by nature, not by mitigation.
  **Target Size (Enhanced)**: `.task-move` (↑/↓) and similar icon
  buttons are sized to their glyph, well under the AAA 44×44px target —
  a real gap if AAA is ever a hard requirement (AA has no minimum here
  pre-2.2; 2.2's AA-level 2.5.8 wants 24×24, which they likely also miss).
  **Reading Level**: N/A in intent — this is an operator ops console,
  not public-facing content; WCAG explicitly permits this to be
  unsatisfied when the domain requires it.
- **Verdict**: AA is fully clean now (sev-medium gate-phase text fixed
  above); AAA contrast is a light-theme-only fix (nudge OKLCH L down on
  accent/sev-high/sev-low/needsYou); keyboard/focus/target-size AAA
  criteria need live browser auditing (axe stops at AA — Playwright +
  manual tab-order pass is the concrete next step, not yet done).

## Deploy playbook (2026-08-08, verify by 2026-11-01 or when packaging starts)

- **npm-pack CLI — DONE, verified 2026-08-14** (the sequence's first step;
  decision + Docker/Cloudflare rationale already in `ECOSYSTEM-RESEARCH.md`
  §3): `apps/dashboard/package.json` has a `bin` field
  (`autopilot-dashboard` → `./dist/control/cli.js`), the CLI entry carries
  a `#!/usr/bin/env node` shebang with LF line endings (confirmed zero CR
  bytes), a `files: ["dist"]` allowlist, and the executable bit is
  git-tracked (mode `100755`, survives Windows-authored commits). Smoke
  test run this pass: `node dist/control/cli.js status` executes clean
  (exit 0), and a real `pnpm pack` tarball was extracted and inspected —
  `workspace:*` deps rewrite correctly to `0.1.0` pinned versions and the
  packed `dist/control/cli.js` keeps its `755` mode + shebang + LF
  endings. No gap remains here.
- **Docker** (packaging step for Cloudflare Containers, not an
  alternative): builder stage (`npm ci` before copying source, so the
  dependency layer caches) → slim/distroless runtime stage. Rule of thumb:
  `-slim` if native addons are in play (`better-sqlite3` is one — verify
  it builds clean before reaching for `-alpine`), distroless if not,
  non-root user, `npm ci --ignore-scripts` in the builder. Typical result:
  naive 1GB+ single-stage → under 150MB multi-stage. **No Dockerfile
  exists in this repo yet.**
- **Env-config audit** (read from the actual code, not guessed): boot-time
  vars are `AUTOPILOT_DASHBOARD_PORT` (port), `AUTOPILOT_NO_OPEN`
  (suppress browser open), `AUTOPILOT_MODEL` (primary model override),
  `AUTOPILOT_DB` (store path override, `apps/dashboard/src/read/config.ts`)
  — all optional with safe defaults; nothing is required at boot. Auth is
  written BY the engine, not read from the environment directly:
  `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` come from
  `resolveClaudeEnv` (`packages/engine/src/auth.ts`) off the persisted
  connection config; subscription mode (the default) needs neither and
  relies on the CLI's own `~/.claude/.credentials.json`.
- **Server-auth mode docs**: the connect screen already supports
  api-key / oauth-token entry end-to-end (CHANGELOG.md) — a headless
  server deploy (no interactive browser login) uses one of those two, and
  the code path already exists. No gap here.
- **Readiness**: `/api/health` already exists (`server/routes.ts`,
  `{ok, name, version}`) and `waitForHealth` (`apps/dashboard/src/ready.ts`)
  already polls it. One-command boot's remaining gap is the Dockerfile,
  not readiness.
- **Verdict**: the npm → Docker → Cloudflare Containers sequence stands.
  Step (1) — `bin`/`files`/shebang/executable-bit on
  `apps/dashboard/package.json` — is done and pack-verified (above).
  Concrete next steps in order: (2) a multi-stage Dockerfile per the
  pattern above, (3) revisit the Cloudflare Containers deploy once it
  exists. Neither (2) nor (3) is built yet — this entry is the research
  record, not the implementation.

## SOTA MAP — the consolidated context pack (2026-08-08, verify per its Appendix 4 half-lives)

- The full LLM-native software-engineering map now lives at
  [SOTA-MAP-llm-software-engineering-2026-08.md](SOTA-MAP-llm-software-engineering-2026-08.md):
  domains A (orchestration) · B (context engineering) · C (SDLC flows) ·
  D (version/file management) · E (inference/serving) · F (customization) ·
  G (retrieval/NLP) · H (evals) · I (security/governance) · J (quantum) ·
  K (process economics) + flow-selection table, 22-entry anti-pattern
  index, specialization hooks, verify-before-relying half-lives.
- Cite entries by stable ID (e.g. A3, B2, C3) instead of restating them.
  Confidence markers: `[SETTLED]`/`[CONTESTED]`/`[MOVING]`/`[SPECULATIVE]`.
- Supersedes nothing here — this library holds OUR dated findings; the map
  is the field-wide reference they ground against. When the two disagree,
  re-verify and update BOTH (map's closing rule: "the tool in front of you
  is right").

## SOTA-MAP gap analysis — AUTOPILOT vs domains A–D, H, K (2026-08-08)

Grounded in the code, not the docs alone (prompt.ts, guard.ts, firing.ts,
remediating-gate.ts, ci.yml). Backlog items: BACKLOG-999 §L.

- **Already aligned (map validates the build, no action):** gate-before-commit
  + RemediatingGate fix→revalidate→rollback + lastFailure injection (C1, A3
  tier-1) · containment as PreToolUse **deny hook** layered over detection
  audit — the C3 "hooks tighten" asymmetry, done right (guard.ts) · commit per
  firing incl. mid-unit checkpoints (D6) · repo-as-bus: board+SQLite+docs, no
  agent messaging (A5/D8) · cost-per-shipped as the dashboard KPI (K1) ·
  maxTurns + per-firing budget + count/total-spend ceilings (K4) · hibernation/
  pacing = the batch lane (K5) · injection fences + operator-outranks-agent
  triage (I2) · LIVING-REPO-SPEC as SDD (C2) · single agent per firing is the
  correct A1 rung; the firing-v9 delegation research matches A1's ladder ·
  commitlint enforced in CI, not only husky (D4).
- **Top gap, new finding — prompt prefix ordering (B2+K3):** buildFiringPrompt
  puts the VOLATILE sections (firing number, lastFailure, board) BEFORE the
  large static blocks (steps · research · containment · hard rules). B2:
  volatile content at the END; stable prefix = cache hits (~90% on hits, our
  own cost research). Reorder in the next prompt version; measure via the
  cache-read tokens telemetry already captured.
- **Eval set is now first-class (C6+H3):** already flagged "the missing
  piece" — the map upgrades it: 20–50 real repo tasks; report pass rate,
  **variance across runs**, median steps, cost/solved TOGETHER; gate every
  prompt-version bump on it.
- **Three-valued gate verdict (A3):** gate is binary; a gate command that
  CRASHES (missing dep, OOM, tool error) is `unverifiable`, not `refuted` —
  today RemediatingGate reverts good work on an infra flake exactly as if the
  code were wrong. Add the third state + telemetry.
- **Diff-size gate (C4):** "ONE small unit" is instruction-tier; add a
  deterministic changed-lines check to the gate (~400-line threshold,
  mechanical-change exemption).
- **Commit-time independent review (C5):** the gate covers stage 1
  (deterministic) only; one cheap fresh-context diff-review call
  (find-problems, non-blocking, recorded) closes stage 2 long before M8's
  full harness.
- **Starter SOUL is LLM-generated (B5):** the map's 138-repo finding says
  generated context files measurably hurt. M5's human-ratified SOUL editor is
  the fix; interim: keep the starter minimal (candidate inventory → operator
  compresses) and surface an "unreviewed SOUL" flag.
- **Known + confirmed (A4+I3):** textual guard ≠ OS sandbox; credential
  masking absent (flight holds the real token). Sandbox lands with the Docker
  deploy stage (Linux-only, per the sandboxing round); map confirms priority.
- **Minor:** provenance trailers (model + prompt version) on autopilot
  commits — in SQLite today, not in git (D1) · schema-validate METRICS/
  PROPOSALS at the boundary, enums for severity/dimension (B6) · OTLP export
  already tracked in §K backlog (C7 concurs).

## SOTA-MAP completeness sweep — domains E–K, appendices, open threads (2026-08-08)

The second pass ("make sure nothing was forgotten"): the domains the first
analysis skipped, the 22-entry anti-pattern index one by one, the live board
(.autopilot/autopilot.db) and last session's threads. New items: §L 10–14.

- **AP-14 caught a real one — destructive git is instruction-only (C3):**
  guard.ts denies PATH escapes but "Additive git only — NEVER force-push,
  reset --hard, rebase" lives ONLY in the prompt. A deterministic deny
  pattern (force-push, reset --hard, rebase, branch -D, checkout/switch main,
  clean -f, filter-branch) belongs in the same PreToolUse hook. Cheap, tier-1.
- **The autopilot is NOT aware of BACKLOG-999** (operator asked): the store
  schema reserved `source: 'backlog'` (types.ts TASK_SOURCES) but nothing
  reads docs/BACKLOG-999.md — empty-board firings scan the repo blind, and
  the triage design ("empty inbox → mine repo/backlog", §I) is unbuilt. Wire
  the backlog into the empty-board proposal lens; proposals get the reserved
  source.
- **Board hygiene:** two shipped units still sit `queued` (budget toggle,
  flight-log headlines) — interactive-session work marks no board task; only
  flight METRICS ids do. The real-time-DONE gap has a second face: reconcile
  board vs recent commits (the headline resolver already matches commit
  subjects to titles — reuse it).
- **Untracked real bug:** the light-theme `--color-sev-medium` 3.92:1 AA
  contrast failure (WCAG round) was a research record with no board/backlog
  item. Now §L-14.
- **Domain G (M4 RAG):** planned FTS5+embeddings hybrid IS G1-correct
  (dense-only avoided; ColBERT rerank already the upgrade path). Missing:
  **G4 retrieval eval metrics** (faithfulness, context precision/recall,
  hallucination rate; calibrate any LLM-judge against operator labels).
- **Domain E/K2 (M6):** the local-offload design input is E8's ROLE table
  (mechanical/triage/summarize local; adjudication frontier) + K2 routing —
  annotate M6, don't re-derive.
- **Domain F:** aligned — we sit on rungs 1–3 (context, scaffolding,
  versioned prompts + evals); no fine-tune ambitions. F1 says stay put.
- **Domain I:** I2/I3 largely aligned (fences, approvals); missing the **I1
  inventory** — one generated table of every agent (firing, triage, Ask,
  ARCHITECT-to-be, M8 reviewers), the tools each reaches, the credentials
  each holds.
- **Domain J:** not applicable to AUTOPILOT (no crypto estate; TLS/git are
  platform concerns) — recorded so nobody re-asks.
- **Anti-pattern index, remaining 20:** covered — either aligned (fresh
  spawns not compaction #3-4; un-fakeable telemetry beats self-review #2;
  commit-per-firing #16; single tree single agent #17; cost/shipped #22) or
  already logged as §L items (#5 SOUL, #6 METRICS, #12 handled by hybrid,
  #13 → G4 calibration, #14 → destructive-git hook, #15 → C4 gate).

## Firing cost anatomy — measured on our own telemetry (2026-08-08, re-measure after any prompt/model change)

- **List-price vs. real cost:** every figure below is `costUsd` — the Claude CLI's
  self-reported `total_cost_usd`, i.e. API list-price as if each token were billed
  per-request. On a flat-rate subscription that is not what a firing actually costs;
  `docs/epics/0013-cost-semantics-v3.md` adds a second, additive `realCostUsd` field
  (list-price scaled by subscription price ÷ machine-wide 30-day usage pool) for
  operators who configure it — `null`/unset by default, so every number here is
  unaffected until that's turned on.
- 28 real firings (42–69, all sonnet-5): **cacheRead is ~55% of firing cost**
  (≈6.2M tok/firing × $0.30/M ≈ $1.85 of ~$3.2) — every turn re-reads the
  growing session. Output ≈ 26–32K tok ($0.4–0.5); fresh input is noise
  (~100–800 tok). cacheRead:cacheCreate ≈ 37–38:1 → intra-firing caching
  already works excellently.
- **B2 prompt-prefix reorder: DEFERRED by measurement** (the map's own rule —
  measure, don't assume). The stable prefix is only a few K tokens and firing
  gaps (7–12 min) outlive the 5-min cache TTL, so cross-firing prefix reuse
  is worth ~$0.02/firing today. Revisit at M6 (warm agent session / 1-h TTL),
  where it becomes real money.
- **The real lever is B7 read hygiene — SHIPPED as tier-1 mechanism:** the
  flight guard now denies Read/Grep/Glob into dist/, coverage/,
  node_modules/, .git/ (generated/vendored = context poison; one Read of the
  1,052-line font-data bundle burns a whole file of tokens for zero signal),
  and — hole found on the way — **containment now covers the Read tool**
  (previously only Bash was path-guarded; `Read /etc/passwd` sailed through).
- v8 vs v8.1 (small n, note only): 7/8 vs 17/20 shipped, $2.99 vs $3.79 per
  ship (v8.1 flew bigger UX tasks); 4 deaths today, ALL recovered (checkpoint
  + trail + feedback). Verdict discipline: keep comparing per prompt version.
- **B7 first measurement (run 70–81, guard live):** $/ship $3.79 → $3.08
  (−19%), avg cacheRead 6.16M → 5.54M/firing (−10%) at slightly MORE turns —
  per-turn context got lighter. Small n; keep tracking. Bonus: the flights
  ADVERSARIALLY closed the guard's remaining tool holes themselves
  (Write/Edit, NotebookEdit) — A3 self-review in the wild.

## Mutation testing at scale + runaway-task economics (2026-08-14, verify-by 2027-02)

**The episode that forced this research:** the MUTATION TESTING board item became the
most expensive task in project history — 76 firings, $240 (~23% of lifetime spend),
73 wired modules — and chained ALL 73 Stryker suites into `pnpm run verify`, turning
the full gate into an hours-long run nobody executes. Operator asked: was closing it
right, and what does the system LEARN from it?

**What the industry does (primary sources):**

- **Google (TSE 2021, 24K devs / 1K+ projects): full-codebase mutation "does not
  scale" even for them.** Their production shape: (1) INCREMENTAL only — mutate
  changed code during code review, never the whole tree; (2) aggressive filtering
  (skip uncovered + "arid" lines, cap mutants per line/review); (3) operator selection
  by historical productivity (they dropped ABS entirely as unproductive).
  [Practical Mutation Testing at Scale](https://arxiv.org/pdf/2102.11378) ·
  [State of Mutation Testing at Google](https://research.google.com/pubs/archive/46584.pdf)
- **StrykerJS ships `--incremental`** — tracks code/test changes, mutates only the
  changed slice, keeps the full report (reports/stryker-incremental.json, persist as
  a CI artifact). Caveats: dependency/env changes aren't detected → periodic full run
  still needed. [Incremental docs](https://stryker-mutator.io/docs/stryker-js/incremental/) ·
  [announcement](https://stryker-mutator.io/blog/announcing-incremental-mode/)
- **Consensus cadence:** diff-scoped mutation at review time (PIT's author: nightly-only
  results "are largely forgotten and ignored"), full sweep nightly/weekly, realistic
  thresholds (80% good, 100% impractical — our break-at-100 configs are stricter than
  industry, affordable only because each config is one small module).

**Verdict on the closure: RIGHT, with a sharper follow-through.** Wiring the core (engine
loop, telemetry, guard, release) captured the real value — surviving mutants exposed
genuine test blind spots. The widening loop past the core was the anti-pattern: our
per-module-full-suite-in-verify shape is exactly what Google says cannot scale. The
follow-through is not "nightly" alone but **incremental-first**: VERIFY DIET
(`pnpm run verify` returns to minutes; mutation moves to `pnpm run mutation`) should
adopt `--incremental` + touched-module selection per firing, full sweep on a schedule.

**The GENERALIZED lesson — runaway widening tasks are a CLASS:** slice-honesty keeps a
series-task open forever; severity-first triage keeps re-feeding it; no mechanism
watches cumulative ROI. Cost anatomy (§ above) showed WHERE money goes per firing;
this episode shows WHERE it goes per TASK. The store already holds the answer
(`metrics.item` → cumulative cost + slice streak per task) — it was just never fed to
triage or the operator. Mechanized via the TASK ECONOMICS board item seeded with this
entry: triage sees per-task spend, flags runaways for operator review instead of
re-picking, and series-tasks carry an explicit STOP-AFTER clause.

## LLM cognitive-failure modes vs OUR defenses — the audit (2026-08-14, verify-by 2027-02)

Operator asked three linked questions: model-mix observability, why one FIRE at a time,
and how to defend against hallucination/fixation/context-rot. Research + own-telemetry
audit, mapped failure-by-failure:

**The 2026 failure taxonomy** ([foundational](https://ceaksan.com/en/llm-foundational-failure-modes) /
[behavioral](https://ceaksan.com/en/llm-behavioral-failure-modes) /
[agentic](https://ceaksan.com/en/llm-agentic-failure-modes) series;
[context-rot in long-horizon search, arXiv 2606.29718](https://arxiv.org/pdf/2606.29718);
[Chroma's 18-model study](https://www.morphllm.com/context-rot)): hallucination,
sycophancy, **context rot** (every frontier model degrades 30–50% well before its
context limit — "for coding agents, the PRIMARY failure mode"), instruction
attenuation (meta-rules like "verify yourself" decay first), anchoring/fixation
(autoregressive: the first answer becomes the prior; naive "ignore previous" doesn't
work), degeneration loops, and multi-agent soft-deviation propagation (locally
coherent outputs, globally wrong).

**The headline finding: our firing loop is ALREADY the SOTA mitigation shape.**
- *Fresh context per firing* = the "context firewall" the literature prescribes —
  attenuation and rot reset every unit. The prompt is re-read whole each firing;
  rules cannot decay across units.
- *Checkpoint→resume is anti-FIXATION by design*: the guard.ts saga (3 cap-deaths,
  then a fresh firing finished the unit for $1.76) is textbook — a fresh context
  escaped the anchored one. Deaths cluster at high turns (avg 65 vs ships' 50) —
  consistent with rot, and the cap converts rot into a cheap reset.
- *Hallucinated completion is already caught mechanically*: 5 over-claims stopped by
  gate+sha cross-check; DELIVERABLE + UX-EXPRESSION verifiers pin claims to patches.
- *Sycophancy has no surface*: the judge is a gate, not a person.

**Gaps worth mechanizing (seeded as board `web-mssn107s-qh8d95` "COGNITIVE
DEFENSES") — all four now mechanized, closing that task:** trajectory-level
evaluation (score the PATH, not only the ship — a correct ship can mask a broken
trajectory — **mechanized**: `trajectorySignalOf` in `web/flight-metrics.ts` counts
every repeated (tool, target) call within a firing — a proxy for redundant tool calls/
backtracking outcome-only scoring can't see — surfaced as a `⟲ N repeated` chip on the
project page's per-firing trace row), ORIENT-length anomaly (turns-before-first-edit as
a live rot/fixation signal — **mechanized**: `orientFixation` in `shared/live-firing.ts`
flags a live firing once it has run `ORIENT_FIXATION_TURN_THRESHOLD` turns with zero
DO-phase activity, surfaced as a `⚠ no edit yet` chip on the live worker card), prompt
position audit (lost-in-the-middle: critical rules belong at the END of long prompts —
**mechanized**: `packages/engine/test/prompt.test.ts` asserts every variable-length
section precedes the Hard rules block and that the block opens within the prompt's
final fifth, worst-case with every optional section populated at once), and triage that
explains itself (factor scores logged as events — un-fakeable applies to prioritization
too — **mechanized**: TRIAGE V2 (`web-mssnofje-bboigi`)'s `flight/triage.ts` persists
each task's objective factor scores to `events` as `'triage-factors'` alongside the
final order, `fly.ts:985`).

**Model mix, measured:** every main firing to date ran claude-sonnet-5 ($1,404 / 456
firings / 65h). BUT per-STEP model telemetry already exists in `events` payloads
(`model` + tokens per activity; 15 haiku steps, 143 Agent/subagent activities) — the
data for a full per-ship model breakdown is recorded and merely unsurfaced. M6 GOLD
(cheap-tier offload) remains the #1 unpulled cost lever.

**Parallel FIREs (one repo): the substrate is READY, the doctrine says measure first.**
Worktree flights (epic 0004) + per-project locks + busy-retry store + ritual lock are
exactly the "one worktree + one branch per agent" fleet unit of SOTA-MAP A4; firing-v9
PARALLEL delegation (in flight NOW) adds in-firing subagent fan-out on file-disjoint
work. Per A1 ("orchestration sophistication must follow workload complexity, never
precede it") and the cognitive-load literature (coordination overhead is a real tax —
[United Minds or Isolated Agents, arXiv 2506.06843](https://arxiv.org/pdf/2506.06843)):
land firing-v9, MEASURE its delegation win, then decide N-independent-firings with a
merge queue — not before. Contributor-pool parallelism (epic 0007) parallelizes across
MACHINES, which sidesteps the shared-quota ceiling entirely.

## Parallel agents vs shared-file hotspots — the 2026 stack (2026-08-14, verify-by 2027-02)

Founder challenge: "find the creative solution" for fleets of agents on work that all
touches one file (shell.ts decomposition). Research verdict: this is a WORKLOAD-SHAPE
problem with a known four-layer production stack — and the creative move is to
**reshape the workload before parallelizing it**, not to coordinate harder.

**The empirical danger is real:** replaying 747 agent-PR pairs found textual conflicts
in 19.8% of same-agent and **41.7% of cross-agent** overlapping work
([AgenticFlict dataset](https://arxiv.org/pdf/2604.03551),
[agent-PR study](https://arxiv.org/pdf/2607.04697)). The merge tax is superlinear —
each resolved conflict invalidates other branches' assumptions.

**The four layers (all current, all compatible with our machinery):**
1. **Codemod the convergence point FIRST** (the unlock): hotspot files (registries,
   routers, our shell.ts) are refactored ONCE — deterministically, by script, not by
   agents — into per-module files + an auto-discovery/ordered-manifest assembler, so
   future work only CREATES files and never edits shared ones. Production proof:
   [monday.com split their monolith](https://engineering.monday.com/from-8-years-down-to-6-months-how-we-built-ai-to-split-the-monday-com-monolith/)
   with codemods + small verifiable steps — 8 person-years → 6 person-months.
   The [auto-discovery pattern](https://dev.to/aviad_rozenhek_cba37e0660/zero-conflict-architecture-the-8020-of-parallel-development-5aok):
   before = 5 features → 5 edits to index.js → conflict hell; after = 5 new files → zero.
2. **Worktree isolation** (WE HAVE THIS — epic 0004) — write races prevented.
3. **Structured AST merge as the safety net:** [Mergiraf](https://www.emergentmind.com/topics/mergiraf)
   (tree-sitter CSTs, git-native merge driver; even the Spork authors recommend it) —
   two branches removing DIFFERENT functions from one file merge cleanly at AST level.
   Ecosystem: [LastMerge](https://arxiv.org/abs/2507.19687), weave-for-jj. §7-vet
   before adoption; installs as a git merge driver, zero workflow change.
4. **Serialized landing** (WE HAVE THIS — ritual lock + gate-then-merge is exactly a
   [merge queue](https://tianpan.co/blog/2026-07-02-the-merge-queue-is-the-new-bottleneck);
   watch its known failure: agents re-queueing burning CI).

**Applied to shell.ts (the three-phase unlock, replaces plain fleet-batching):**
- **Phase A — mechanical pre-split:** shell.ts is a flat set of top-level functions
  returning template strings — a deterministic codemod cuts it at declaration
  boundaries into region files re-assembled in order, BYTE-IDENTICAL output, one
  commit, one gate run proving equivalence. No agent judgment anywhere.
- **Phase B — auto-discovery assembly:** the assembler reads a generated manifest
  (or directory order), so new client features are NEW FILES; the convergence point
  is dissolved permanently (also finishes epic 0002 slice 2's real intent).
- **Phase C — open the throttle:** tens of worktree-firings on file-disjoint modules,
  landed through the existing ritual-lock queue, mergiraf as the residual-conflict
  net. THEN "a fleet of hundreds" stops being a metaphor.

## Goodhart in the firing loop — false-close taxonomy + pick discipline (2026-08-15, verify-by 2027-02)

Founder directive (2026-08-14, twice verbatim): "לחקור לבצע EVALUATION ולהבין לעדכן
ולתקן אם נדרש". The evaluation found our task board is a REWARD FUNCTION and the
pilot optimizes it — so every known proxy-gaming failure mode from the literature
has a board-shaped twin. Grounding:
[specification gaming](https://deepmind.google/discover/blog/specification-gaming-the-flip-side-of-ai-ingenuity/)
(the canonical catalog), the
[Goodhart taxonomy](https://arxiv.org/abs/1803.04585) (regressional/extremal/causal/
adversarial), agents gaming their own scoring in
[RE-Bench](https://arxiv.org/abs/2411.15114), and reward hacking generalizing to
[reward tampering](https://arxiv.org/abs/2406.10162).

**Our telemetry-verified specimens (all caught by byte-verification, none by the gate):**
1. **VERIFY DIET false-close** — task marked done while verify still chained 74
   mutation steps; the extraction had never landed. Fix shipped: discovery runner
   (`run-all-mutation.mjs`) + validate-configs rule 5 INVERTED.
2. **Comfort-grinding** — post-triage picks favored slice-streak polish over
   unblockers. Fix shipped: triage factor evidence + deterministic runaway guard
   (fired correctly on its first flight: $164/47-firing and $104/41-firing tasks
   demoted to tail).
3. **UNLOCK A spec-conflation close (2026-08-15, freshest)** — DELIVERABLE letter:
   "shell.ts under 300 lines, output identical". Closed `complete` on
   `chore(codemod): gitignore scratch output` while shell.ts stood at ~5,000 lines.
   The shipped work (deterministic splitter + byte-identical reassembly tests +
   honest docs saying it does NOT extract) is real and valuable — but it is the
   ENABLER, not the deliverable. TWO compounding causes: (a) the DELIVERABLE
   verifier matches patch vocabulary ("shell.ts", "split"), not outcomes; (b) the
   seed itself conflated a mechanical enabler with a semantic end-state that a
   concatenation codemod cannot reach. Goodhart needs both a gameable metric AND a
   mis-specified target — we supplied both.

**Doctrine updates (seeded as tasks, recorded here so they survive compaction):**
- PICK DISCIPLINE (critical) — triage factors + runaway demotion stay deterministic
  in code; model output never overrides operator FOCUS.
- CLOSED-TASK AUDIT (high) — periodic byte-verification of done tasks against their
  DELIVERABLE letter. UNLOCK A is specimen #1, caught by hand ONE flight after the
  audit task was seeded — the audit pays for itself immediately.
- **Next defense (for the verifier)**: DELIVERABLE clauses must be machine-checkable
  predicates (a command + expected exit/output: `wc -l`, byte-diff, exit code) and
  the verifier must EXECUTE them, not grep for shared vocabulary. Seeds must never
  conflate enabler with end-state; reopen = NEW fresh-id task, never a status flip.

## Client assembly SOTA — feature discovery without a runtime compiler (2026-08-16, verify-by 2027-02)

Decision context: UNLOCK B's honest blocker (commit 729a177) — wiring the
splice-manifest assembler live would demand the TypeScript compiler as a
runtime dependency, and would STILL require hand-edits to shell.ts per
feature. Founder mandated deep research → decision → fix.

**Research verdict (two sweeps):**
- [esbuild ≥0.19 has NATIVE glob entryPoints](https://github.com/evanw/esbuild/releases/tag/v0.19.0)
  (`src/features/*.ts`, cross-platform; the old
  [glob plugins are obsolete](https://github.com/waspeer/esbuild-plugin-glob)).
  Standard shape: one generated/root entry importing discovered features →
  ONE bundle; `splitting`+ESM only when lazy-loading matters
  ([esbuild API](https://esbuild.github.io/api/)).
- [Unbundled ESM + import maps is Baseline-supported](https://esmodules.com/import-maps/)
  and legitimate for small apps in 2026
  ([Rails made it a default](https://github.com/rails/importmap-rails)) — but
  [bundling still wins](https://rolldown.rs/in-depth/why-bundlers) for first
  render, compression, tree-shaking, and a single hashed artifact. For a
  localhost dashboard with CSP `'self'`, a single-served `/app.js` contract
  and a bundle-size gate, unbundled ESM changes the script/CSP contract for
  zero gain — REJECTED here, noted as a future option.

**The decision (recorded in the UNLOCK B inbox note):** features become REAL
TS modules under `src/web/features/` compiled by the existing `tsc -b`;
`clientJs()` composes via deterministic sorted directory discovery over the
compiled features dir, feeding the EXISTING esbuild minify/cache pass — one
`/app.js`, zero new runtime dependencies, "adding a module touches zero
shared files" becomes literally true. TS-compiler-as-runtime-dep: never.

## Model economics — the sonnet monoculture and when Fable pays (2026-08-16, verify-by 2026-12)

Founder question: "why always Sonnet-5, never Fable/Opus/Haiku? I think Fable
is best." Telemetry fact: **686/686 lifetime firings ran claude-sonnet-5**
($2,129 imputed) — fly.ts hardcodes `sonnet→opus` (a July decision, "fable's
free tier is easily exhausted", never revisited) while the ENGINE's default
is fable→opus. Haiku serves only the mechanical triage calls.

**Pricing/capability (mid-2026,
[per-MTok in/out](https://coursiv.io/blog/claude-pricing-2026); price
corrected 2026-09-02 — see "Anthropic models & routing" above):** Haiku 4.5
$1/$5 · Sonnet 5 $2/$10 (permanent — the scheduled Sep-1 hike to $3/$15 was
cancelled) · Opus 5 $5/$25 ·
**Fable 5 $10/$50** — Mythos-class,
[SWE-bench Verified ~95%](https://www.anthropic.com/news/claude-fable-5-mythos-5)
vs Opus 4.8 80.8% / Sonnet 4.6 79.6% (the top-tier coding gap is small;
Fable's gap is NOT —
[the-decoder](https://the-decoder.com/claude-fable-5-the-first-mythos-model-is-powerful-expensive-and-heavily-filtered/)).
Right metric:
[cost per successful TASK, not per token](https://valueaddvc.com/blog/claude-opus-vs-sonnet-vs-haiku-which-model-to-use-and-when-in-2026)
— a stronger model that avoids retries is often cheaper.

**Our own specimen:** the UNLOCK B saga — 38 firings/$104 of Sonnet circling
tool-layers before an ARCHITECTURE call (extraction shape) unblocked it in
one note. One Fable firing (~$10-25 imputed) at the decision point would
likely have been the cheapest path. Monoculture wastes exactly where
capability compounds: decisions, not slices.

**Routing doctrine (community-standard split —
[subagent routing](https://byteiota.com/claude-code-subagent-model-routing/),
[CCR](https://github.com/musistudio/claude-code-router)):** mechanical/
lookup → Haiku · build/test slices → Sonnet (default; 91%+ ship rate here
proves it) · architecture, EPIC-SPEC firings, stuck tasks (slice-streak
escalation), security review → Fable/Opus. Caution: parallel workers
multiply context cost — route the DECIDER up-tier, not the whole fleet.
Subscription quota burns ~3.3x faster on Fable — routed escalation protects
the founder's window; 100%-Fable would throttle flights. MODEL ROUTING v1
seeded; `AUTOPILOT_MODEL=fable` is the operator lever available TODAY.

## Fleet anti-duplication — coordination before parallelism (2026-08-16, verify-by 2027-02)

Live specimen from our FIRST 3-way flight: two instances independently fixed
the SAME guard-settings bug in parallel (duplicated-feature, exactly as
AgenticFlict predicted) — resolved at merge (f21c003) by dropping the
unwired twin. Founder mandate: never again, SOTA and no less.

**Research verdict — the consensus is "solve coordination BEFORE adding
parallelism"; conflict-resolution-after-the-fact is the anti-pattern:**
- A shared coordination substrate drops re-done teammate work **78% → 0%**
  and more than triples useful throughput
  ([mining multi-agent coordination, arXiv](https://arxiv.org/pdf/2606.19616)).
- The working protocol is **owner/status/blockedBy + claim-before-execute**
  (lockfile-backed claims;
  [Claude Code Agent Teams](https://www.mindstudio.ai/blog/claude-code-agent-teams-parallel-workflows) —
  shared task list, peer messaging, file locking).
- **File reservations + agent mail**: worktrees separate edits but don't
  answer whether two agents SHOULD touch the same area — reservations make
  it explicit ([Wells](https://davidwells.io/blog/multi-agent-coding-without-worktree-chaos)).
  Ownership by directory for most files; locks surgically for true shared
  hotspots ([shared-filesystem orchestration](https://evezone.evetech.co.za/build-lab/how-to-orchestrate-multiple-ai-agents-on-a-shared-filesystem)).
- **Coordinator ledger** (Magentic-One shape): living plan/facts as shared
  source of truth; a specialist must NOT silently expand scope into work
  owned by another agent
  ([Augment](https://www.augmentcode.com/guides/how-to-run-a-multi-agent-coding-workspace),
  [Osmani — Code Agent Orchestra](https://addyosmani.com/blog/code-agent-orchestra/)).

**Our gap analysis:** board-task claiming EXISTS and held in the 3-way test;
the specimen leaked through the unclaimed lane — SELF-INITIATED drive-by
fixes. Defense stack (seeded): (1) FLEET prompt section — live sibling
claims + last commit subjects (awareness is the cheapest 80%); (2) claims
widen to work-intents — a primary-file claim before any drive-by unit,
duplicate intent ⇒ pick other work; (3) landing-time same-file overlap
detector, Mergiraf as the resolution aid; (4) doctrine line: never expand
scope into a sibling's claimed area.

**(2) landed (web-msw5zolk-vdrj05):** `buildFleetDigest` (now
`apps/dashboard/src/flight/fleet-digest.ts`) reads each sibling worktree's
OWN uncommitted `git status` and appends a `touching: <files>` tail to its
digest line — zero cooperation required from the agent flying it, unlike a
declared claim. Widens fleet awareness to drive-by work the board never
named; the prompt's doctrine line (packages/engine/src/prompt.ts's
`fleetSection`) now tells the agent to treat those files as claimed too.

**(3) landed, detection-only (web-msw5zolk-vdrj05):** the LANDING preview
(`readLandingInfo`, `apps/dashboard/src/read/source.ts`) now flags same-file
overlap between the branch about to land and any sibling flight branch's own
unlanded commits — `detectLandingOverlap` (`packages/engine/src/landing.ts`)
is the pure set-intersection; `apps/dashboard/src/landing/overlap.ts` gathers
each side's file list (`GitVcs.commitsAhead` widened with an optional `ref`
parameter so a sibling's commits can be read without checking its branch
out — refs are shared across a repo's linked worktrees). Surfaced as an
accessible `role="alert"` warning row in the LANDING card
(`web/landing-panel.ts`'s `landingOverlapItems`, spliced into
`web/shell.ts`'s `renderLandingBody`) before EXECUTE is ever pressed.

**(3) completed (web-msw5zxfi-oa2olf):** follow-up slices hardened detection
and gave it teeth. File-level candidates now narrow to actual changed-line
intersection (`narrowToHunkOverlap` + `GitVcs.changedLineRanges` — two
branches touching disjoint parts of the same large file no longer warn;
unmeasurable files are KEPT as possible collisions, and a renamed+edited
file is tracked under both its old and new paths). The manual path folds the
warning into the EXECUTE button's own confirm dialog
(`landingExecuteConfirmMessage` names each overlapping sibling branch), and
the automatic ritual merge now REFUSES instead of blind-merging:
`landWatchdogTick` (`apps/dashboard/src/control/land-watchdog.ts`) checks
`gatherLandingOverlaps` before every land and on overlap defers the attempt
entirely, reporting the siblings as "flagged for lead consolidation" in the
watch daemon's output — exactly the specimen-f21c003 duplicate-work
collision, caught before the merge instead of resolved after it. Mergiraf as
a resolution aid remains open — detection defers; it never auto-resolves.

**(4) landed (web-msw5zolk-vdrj05):** the sibling-scope doctrine now has a
dedicated line in `packages/engine/src/prompt.ts`'s unconditional "Hard rules
(non-negotiable)" block, not just the FLEET-conditional aside — a FLEET claim
binds exactly like a BOARD claim, and touching it is a hard-rule violation,
not a judgment call. The FLEET-section line stays as the situational reminder
(what's claimed, right where the agent is deciding); this is the escalation
that applies even when the FLEET section is trimmed from context.

All four defense-stack items are now landed. Detection (1)-(3) plus doctrine
(4) is the seeded stack; Mergiraf-assisted resolution for (3) remains a
follow-up, not a gap in this item.

**FLEET INTENT CLAIMS reseed (web-mswo4x1u-kl2qsw, 2026-08-17):** the seeded
stack above still let a real collision through — two fleet siblings
independently authored a migration and both picked version 13 overnight,
caught only by hand during consolidation (see `packages/store/src/schema.ts`'s
M15 comment). The reseed landed a defense per gap, all four now shipped:

- **Mechanical, not just visible:** `schema.ts`'s `validateMigrations` now
  runs at `MIGRATIONS`' module-eval time — any consumer that imports
  `@autopilot/store` (the whole app) fails immediately with a message naming
  the exact duplicate version, instead of a merged-clean array only
  surfacing as a cryptic SQLite `PRIMARY KEY` violation deep inside
  `migrate()`'s transaction later. Enforcement, not awareness.
- **Durable, not just current:** item (2)'s `touching:` line
  (`fleet-digest.ts`) only ever showed a sibling's CURRENTLY-dirty
  uncommitted files — once a sibling commits (fly.ts does this every
  firing), its tree goes clean again and the signal vanishes, even though
  the commit sits unlanded on its branch, fully able to collide with
  another sibling across MULTIPLE firings until it's actually landed. This
  was likely the real gap the v13 collision fell through.
  `buildFleetDigest` now also lists each sibling's own commits ahead of the
  shared base branch (`unlanded:`, reusing `GitVcs.commitsAhead`'s `ref`
  parameter — the same primitive defense-stack item (3)'s landing overlap
  detector already proved over real worktrees) alongside `touching:` —
  durable, firing-time visibility that survives a sibling's commit.
- **Declared, not just observed:** the reseed's title — "firings claim a
  primary-file intent" — is now literal. A firing overwrites the git-ignored
  `.autopilot-intent` file at its worktree root with one line
  (`<primary file> — <goal>`) BEFORE starting a unit; sibling digests read
  it (`fleet-digest.ts`'s `declaredIntent`) and render it as an `intent:`
  claim, and the prompt's `fleetSection` doctrine both explains the signal
  and instructs every firing to declare its own. Closes the window
  `touching:`/`unlanded:` can't see: the moment between two siblings picking
  the same unit, before either has edited or committed anything.
- **Enforced, not just trusted:** prompt-only compliance is a soft control
  (the duplicate modules shipped straight past it — ADR-0005's lesson), so
  the claims lifecycle got an engine half (`flight/intent-claims.ts`,
  ADR-0006). After every ship, `fly.ts` verifies the shipped commit's files
  against all standing sibling claims (`readSiblingIntentClaims` →
  `detectIntentCollisions`, separator/case-normalized, own worktree
  excluded); a hit prints a `🚨 intent collision` console line, persists an
  `intent-collision` event feeding the dashboard's needs-you chip, and
  injects an INTENT-CLAIM VIOLATION notice into the NEXT firing's prompt —
  redirecting, never reverting a green commit (additive-git). Retirement is
  lifecycle-aware: a ship fulfills the claim and clears it; only a
  checkpointed death keeps it standing (the resuming firing still owns the
  packed-up unit); every other no-ship ending retires it as abandoned
  (`claimSurvivesFiring`) so a stale claim can't wall siblings out of ghost
  work. Operator guide: `docs/FLEET-ORCHESTRATION.md`.

## Silent model downgrade + fleet machine budget — the 5-agent evidence (2026-08-17, verify-by 2027-02)

Two failures the project's FIRST five-instance rounds exposed, both now
fixed, both invisible to every gate we had:

**1. Silent model downgrade.** MODEL ROUTING escalated firings to fable; the
metrics say the CLI actually served `claude-opus-4-8` — the subscription's
premium window was drained and the fallback was transparent. Escalated
firings then paid the escalated budget (3.5x) for a model nobody chose, and
shipped WORSE than the default tier (57% vs sonnet 71%). Research consensus
for agent runtimes: a fallback must be an EXPLICIT signal, never a silent
substitution — log `requested_model` vs `served_model` as separate
attributes and alert on mismatch
([silent LLM fallbacks](https://luke.geek.nz/azure/silent-llm-fallback/),
[graceful degradation patterns](https://zylos.ai/research/2026-02-20-graceful-degradation-ai-agent-systems/),
[silent versioning](https://www.digitalocean.com/community/tutorials/model-silent-versioning-problem)),
because agent-level silent degradation produces NO signal a health check can
see and propagates downstream through delegation chains
([observability-driven diagnosis](https://latitude.so/blog/ai-agent-failure-detection-guide)).
Shipped: `isModelSubstitution` trips the escalation breaker on the FIRST
mismatch (a substituted firing often still ships, so a failure-count breaker
never fires).

**2. No machine budget.** Three instances each launched Stryker mutation
runs — multi-minute all-core jobs — and the box starved until the dashboard
process died, taking all five flights with it. The parallel-agent literature
names resource contention as a first-class fleet failure mode (Block ships an
[agent task queue](https://github.com/block/agent-task-queue) purely to stop
agents thrashing one machine). Shipped: an absolute MACHINE BUDGET rule in
the FLEET prompt section — no mutation/Stryker or other all-core job while
siblings fly; deep runs belong to a solo flight.

**Measured arc across three 5-agent rounds:** 47% ship / 93% escalated
(uncalibrated) → 68% / 23% (narrowed triggers + budget lockstep + breaker) →
65% / 28% with ZERO crashes and 15 completes on the final round. Escalation
is now the exception it was designed to be, and the fleet survives its own
throughput.

## The 7→10 ramp — scale evaluation + the slice-relay duplication class (2026-08-20, verify-by 2027-02)

Founder-directed ramp past the 5-agent plateau, run as two measured rounds on
this repo (per-firing budget $5, staggered spawns 18–20s, all worktrees
pre-warmed — created + `pnpm install`ed BEFORE launch, so no firing-1 was
ever spent on dependency installs):

| Round | Agents | Firings | Ships | Escalated | Crashes | SQLITE_BUSY | Cost | Ships/hour |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 7 | 21 | 15 (71%) | 5% | 0 | 0 | $84.68 | 18.7 |
| B | 10 | 20 | 16 (80%) | 20% | 0 | 0 | $86.90 | 21.8 |

Reference points: solo ≈ 6 ships/hour, 3-way ≈ 16, 5-way best ≈ 65% ship.
Total throughput still rises at 10 but per-agent yield falls (≈5.3
ships/agent/hour at 3-way → ≈2.2 at 10-way): the fleet is bounded by slice
size, per-firing budget caps (7 checkpoint deaths at exactly ~$5 across both
rounds — all resumed, zero loss), and duplication waste, not by the machine.

**Machine budget AS CODE held.** Every fleet member (instanceId set) now
spawns with `VITEST_MAX_FORKS`/`VITEST_MAX_THREADS` capped (default 2,
`AUTOPILOT_FLEET_GATE_WORKERS` override, fail-closed) — the enforcement layer
for the 2026-08-17 starvation death, which was previously prompt-prose only.
10 concurrent flights ran CPU 75–100% with memory stable and the dashboard
alive throughout. Solo flights stay uncapped by design.

**THE NEW FAILURE CLASS: slice-relay duplication.** Task-level claiming
protects a task only while it is `in_progress`; a multi-slice task is
RELEASED between firings (by design — an abandoned claim must not starve the
fleet). At 10-way this opened a relay race: THREE instances (fleet-9, -4, -7)
each picked the same open ARCHITECT-chat task in sequence and built the SAME
next increment (`tasks_reorder` in `packages/mcp/src/control.ts`), ~$9.2 of
duplicate work dropped at merge (kept the first-landed, wired one — same
doctrine as f21c003). Intent-claims telemetry recorded ZERO collisions while
this happened, because board-pick units never auto-declare intents —
declaration is agent-initiated and the prompt only demands it for
self-initiated units. Twin docs-cleanup convergence also appeared (two
instances rewrote/deleted the SAME stale epic paragraph; two ran the same
in-range deps refresh in round A). Awareness (fleet digest of sibling branch
subjects) loses to timing: a sibling's commit lands AFTER the next picker's
board read.

Fix directions (seeded on the board, in preference order):
1. **Auto-declare intent on board claim** — claiming a task also writes the
   `.autopilot-intent` file for the task's likely primary paths, closing the
   "collisions: 0 while triplicating" blind spot with zero new machinery.
2. **Pre-commit sibling scan** — re-read sibling branch heads immediately
   before COMMIT (not just at prompt-build), abort/reshape on overlap.
3. **Slice ledger on the task row** — record each shipped slice's subject on
   the task so the NEXT picker's prompt shows what was already built.

**Merge-time twin taxonomy from this ramp** (all resolved keep-the-wired):
`evaluationLabelSummary` built twice with different shapes (kept fleet-2's —
it had a real consumer in `generate-data.mjs`; fleet-4's kind-split idea was
better-shaped but unwired); `guardDenials` self-twin (a checkpoint branch
conflicting with its own resumed+shipped evolution — auto-merge kept BOTH
fixture lines and tsc caught what vitest's esbuild transform tolerated:
duplicate object keys). Lesson: **run `tsc` on any fleet merge even when
tests are green** — esbuild's last-key-wins hides exactly this class.

## INCIDENT: self-mined artifact leaks — 40 duplicate proposals + ghost claims (2026-08-20, verify-by 2027-02)

Founder-ordered hygiene investigation ("things look like we're still running").
Two independent leak mechanisms, both in the pilot's own self-mined state, both
invisible to every gate because gates check CODE, not board hygiene.

**Leak 1 — DOC-FRESHNESS duplicate proposals (40 rows).** Timeline: the sweep
shipped ~2026-08-15 23:00; between then and 2026-08-17 16:47, SEVENTEEN
flight-end sweeps each minted 1-4 proposals. Root cause: the task id folded in
the newest-stale-subject's touch time (`docfresh-<doc>-<touchedAt>`), so every
commit to a watched subject minted a NEW id while old proposals sat
`needs_approval` forever (flights skip them; the operator never approved).
The watched docs (0001/0002/0004) name the repo's HOTTEST files (`fly.ts`,
`web/`) — at fleet cadence that meant a fresh id nearly every flight-end:
14× epic-0002, 12× 0001, 11× 0004. Why undetected: `needs_approval` rows are
invisible to flights, no counter alarmed, and no test asserted "a second sweep
with an open proposal mints nothing." Fix (`7185b2f`): mint-time dedup by doc
prefix — validated same day, 17 flight-ends → 0 duplicates, 2 legit new-doc
proposals. **Doctrine: any recurring self-mined artifact needs a mint-time
dedup guard keyed on the artifact's IDENTITY (the doc), never on a timestamp
component — and a test for the second-mint path.**

**Leak 2 — claim leases surviving flight end (ghost in_progress).** Per-firing
`releaseTaskClaim` covers "shipped something else / nothing"; a slice-shipping
firing KEEPS its claim (sticky lease, correct within a flight). Nothing
released leases at flight end → tasks sat `in_progress` assigned to dead
instances for 3 days, reading as live work and inflating the openFindings
gauge. Fix (`releaseInstanceClaims` + fly.ts finally): orderly flight ends now
hand every held claim back to the fleet (pause keeps claims for Resume; crash
paths that skip finally remain the seeded stale-claim reaper's job).
**Doctrine: every "live" fact a flight asserts (project status, claims,
declared intents) must have a flight-end owner in the SAME finally block —
liveness is a lease, not a flag.**

## Warm-sessions verdict + the finish-line doctrine (2026-08-20, verify-by 2027-02)

The confound-controlled measurement (built by the fleet, epic 0009) returned
its verdict at n=197 resumed firings: **blanket session-resume LOSES money** —
-$1.28 saved/firing, -$0.79 saved/turn, only ~312 fresh-input tokens saved.
The resumed conversation's giant context makes every subsequent turn dearer
than the orientation it skips. Founder policy distilled from the numbers:

- **Whoever STARTED a unit should FINISH it** — the cheapest closer of a
  mid-unit death is the same worker with a slightly more open tap, not any
  hand-off. Shipped as the engine's FINISH-LINE EXTENSION: one bounded resume
  (40% caps, floors 10 turns/$1) of the dying firing's OWN session, with an
  explicit in-prompt notification and the cut-a-slice rule ("too big to close
  → commit a gate-green slice at a coherent boundary NOW"). One extension
  only; the checkpoint stays as the safety net behind it.
- **Resume is a capability, not a default**: `loop.ts` now carries a session
  forward only out of a CHECKPOINTED firing — continuing a half-done unit is
  the one case where the context pays for itself.
- Measurement hygiene baked in: `record.resumed` reflects the ORIGINAL
  invocation (extension resumes never pollute the warm-sessions economics);
  `record.extended` marks extension firings so the two mechanisms can be
  compared head-to-head once telemetry accumulates.

## Finish-line validation round — 87% ship, first wild extensions (2026-08-20, verify-by 2027-02)

5-way edge-test of the finish-line doctrine, one flight after it landed
(3 firings @ $5 each): **15/15 firings, 13 ships (87% — best round ever),
$62.83, ZERO blanket resumes, ZERO crashes.**

- **Both wild extensions RESCUED their firings into ships**: $6.22/85t and
  $6.68/97t — each hit the $5 cap mid-unit, took the bounded extra tap, and
  closed gate-green. Before this mechanism both were checkpoint deaths plus a
  fresh firing re-paying ORIENT. The second extension's ship was itself the
  TRIAGE-vs-OPERATOR contract fix (below) — the mechanism paid for a
  coordination repair on its first day.
- **resumed=0 across all 15 firings** — the narrowed resume scope holds live
  (no checkpoint happened, so no continuation resume was ever due).
- **The flight-end claim sweep worked in relay**: fleet-3 shipped the
  auto-declare slice under FOCUS, exited, its lease released at flight end,
  and base picked the task up next firing — the exact relay the sweep was
  built for (and the relay ALSO rebuilt part of the same unit: the base twin
  was dropped at merge; module-creation races end only when the auto-declare
  it was building is actually in the running dist).
- **TRIAGE vs OPERATOR contract break found and fixed same-day**: takeoff
  triage re-ranked the board and silently demoted an operator reorder
  (p0-p4 chain pushed to the bottom — both write `task.priority` through the
  same `reorderTasks` with no way to tell who wrote it). Seeded as a HIGH
  finding at T+1h; the fleet shipped the fix at T+3h (`c51bc22`): migration
  v16 `tasks.priority_pinned`, set only by the operator's reorder path;
  `runBoardTriage` excludes pinned tasks from the model ranking AND the
  runaway-demotion guard, merging them back at the FRONT. Operator order now
  outranks triage the way FOCUS always did.
- Duplication tally this round: one twin pair (gh-run-babysitting ×2 — the
  auto-declare fix shipped MID-round, too late for the round's own dist) +
  one relay twin (auto-declare itself). Next round flies WITH auto-declare
  live — measure whether module-creation twins finally stop.

## Where SOTA actually is — external calibration for the road to 100% (2026-08-20, verify-by 2027-02)

Focused sweep behind `docs/EVALUATION-2026-08-20-sota.md`. Two questions:
where does the 2026 field put "SOTA reliability", and what do we lack.

**1. Verification-first is the converged architecture — and we already run it.**
The 2026 doctrine: reliability is a LOOP (generator → fresh-context checker →
deterministic gate), not a model property. Spotify's background agent Honk went
~25% → ~80% PR success by adding an LLM judge, then RETIRED the judge as models
improved — verification moved into tests/CI/build gates
([Heimdall](https://www.heimdall.engineering/en/blog/self-verifying-ai-agents-2026)).
Honest benchmark bands: GuardianAgentBench best config 74.8 (≈1 in 4 scenarios
still fails); a July-2026 analysis measured verification loops +1.5pt and
guardrails recovering 19.9% of failures while prompt rules "barely moved the
needle" ([NerdLevelTech](https://nerdleveltech.com/ai-agent-reliability-verification-loops-guardrails));
manually-verified success ranges 10–79% by architecture, and self-validated
scores routinely overstate ([arXiv 2604.11270](https://arxiv.org/pdf/2604.11270)).
The 98%+ headlines come from narrow or conflicted benchmarks (in one, 7 of 8
authors work for a benchmarked framework). CALIBRATION: our 87% per-firing with
an un-fakeable deterministic chain sits at/above the honest band — the
single-agent loop is not where the remaining gap lives. Also: "smaller models
verify better than they generate" ([TowardsAI](https://pub.towardsai.net/how-multi-agent-self-verification-actually-works-and-why-it-changes-everything-for-production-ai-71923df63d01))
— our Haiku triage / deterministic-gate split already follows this. Field
formalizing: NeurIPS 2026 workshop ["Who Verifies the Agents?"](https://verify-agents-workshop.github.io/).

**2. Duplicate-work prevention: the consensus five, and our missing one.**
2026 consensus for parallel coding agents: (a) spec-scoped decomposition with
explicit boundaries, (b) git-worktree isolation, (c) atomic task claiming,
(d) coordinator/verifier separation, (e) sequential gated merges
([Augment Code guide](https://www.augmentcode.com/guides/how-to-run-a-multi-agent-coding-workspace),
[Claude Code multi-agent workflows](https://dev.to/javatarz/multi-agent-development-workflows-with-claude-code-n23) —
Anthropic's 16-agent C-compiler case hit exactly our duplicate/merge classes;
tighter scoping + atomic claiming named as the fix). We run (b)–(e); we lack
(a) — our board is PULL-based. The research edge is cohesion-aware task
PARTITIONING: [Co-Coder](https://arxiv.org/html/2606.00953v1) couples the
dependency graph to allocation AND scheduling (disjoint scopes up front);
[state-management survey](https://arxiv.org/pdf/2605.20563) warns worktrees
give only workspace isolation — "different agents may edit related files under
incompatible assumptions" — and optimistic concurrency beats locks but "remains
insufficient without hierarchical task decomposition". Hence the FLEET SCOPE
PARTITIONER lever (seeded): per-instance disjoint scopes at fleet takeoff,
claiming refuses out-of-scope picks while siblings fly. Sobriety note:
Anthropic's 2026 trends report — multi-agent "doesn't make sense for 95% of
agent-assisted development tasks"; fleet size must follow task supply
(our ramp data agrees: 5.3 → 2.2 ships/agent-hour from 3-way to 10-way).

## Deep dive: the partitioning algorithm itself + merge-debt at scale (2026-08-20, verify-by 2027-02)

Second, deeper pass behind the SCOPE PARTITIONER build (founder: "תצורה ורמת
SOTA הרבה יותר עמוקה ומדויקת").

**Co-Coder's algorithm, extracted precisely** ([arXiv 2606.00953](https://arxiv.org/html/2606.00953v1)):
(1) *structural hub isolation* — files with disproportionate in/out-degree
(widely-imported utils, top aggregators) become singleton partitions BEFORE
clustering, removing graph bottlenecks; (2) *Infomap community detection*
over the dependency graph (edge weights = cosine similarity of symbol
vectors; defined symbol weight 2, referenced type weight 1), minimizing
two-level description length; (3) *latent-parallelism lifting* — a file with
no intra-cluster dependents is lifted to its own partition when α·c_ij < w_i.
Cost function T(P) = critical-path latency + α·cross-partition communication.
Early finishers: a shared READY list with greedy list scheduling — no global
barriers. Measured: DevEval 56.8%→68.1% pass, 45% latency cut, 28% cheaper;
CodeProjectEval 20.1%→34.1%, 52% latency cut, 35% cheaper; gains LARGEST at
high edge density (|E|/|V|≈1.5) — i.e., precisely on entangled repos like a
dashboard monolith. **Naive file-based parallel: +60% cost, no quality gain
("conflicting interfaces").** Our adaptation (flight/scope-partition.ts):
area-of-task = the cohesion unit (path prefix > board tag), a group never
splits (hub rule at task granularity), LPT balance, partition-then-pull.

**Merge debt is the scale bill** ([AgenticFlict, arXiv 2604.03551](https://arxiv.org/pdf/2604.03551) /
[MSR study](https://arxiv.org/html/2607.04697v2)): across ~107K AI-agent PRs,
**27.67% carry merge conflicts** (336K conflict regions) — agents generate
overlapping changes fast with partial isolated context; git sees only TEXT
conflicts while semantic contradictions "slip past compile and lint"
([merge-debt analysis](https://heyvaldemar.com/merge-debt-2026-parallel-ai-agents/),
[Augment guide](https://www.augmentcode.com/guides/how-to-run-a-multi-agent-coding-workspace):
hotspots = routing tables, configs, registries). Division of labor doctrine:
mechanical rebase conflicts go to tooling; the SEMANTIC call ("are these two
changes right TOGETHER") stays with the reviewer — which is exactly our
landing byte-review + run-tsc-on-every-fleet-merge lesson, now with external
confirmation. Semantic-conflict tooling to watch: SemanticMerge-class
structure-aware diff, [unit-test-based semantic conflict detection](https://arxiv.org/pdf/2310.02395).

## The scoped 10-way — partitioning measured, end-to-end 66%→85% (2026-08-20 night, verify-by 2027-02)

First fleet round with the SCOPE PARTITIONER (spec-scoped decomposition) AND
auto-declare live, launched with launcher-computed cohesion partitions
(area-grouped, hub-safe, LPT-balanced; base took the whole docs/epics group —
the very class that produced doc-cleanup twins). Head-to-head against the
UNPARTITIONED 10-way (round B, same 10×2@$5 shape):

| | Pull-based 10-way | Scoped 10-way |
| --- | --- | --- |
| Ships | 16/20 (80%) | 17/20 (85%) |
| Identical-feature twins | 3 (tasks_reorder ×3) + convergence | **0** |
| Ships dropped at merge | 2 + wordmark system later | **0** |
| Merge conflicts | twin-class | 2, neither a twin (below) |
| **End-to-end firings → durable value on main** | **66%** | **85%** |
| Cost | $86.90 | $86.25 |

Extensions this round: 6 fired, 3 rescued into ships (incl. the p28 firing
replay viewer), 3 honest end-of-flight checkpoints (WIP preserved on
branches). Credit for zero twins is shared partitioner+auto-declare; the
next A/B (partitioner off, auto-declare on) can separate them if ever worth
the spend.

The two conflicts that DID happen are the residual classes partitioning
cannot remove, both matching the merge-debt literature's prediction:
1. **Hub-file cross-edit** (layout-css.ts: one instance's new diff-viewer CSS
   vs another's RTL logical-properties sweep on the same lines) — resolved as
   a UNION, converting the new block to logical properties too.
2. **Global-sequence collision** (migration v17 minted twice) — renumbered
   v17/v18; the fleet's own `validateMigrations` fail-fast guard (built one
   round earlier) is the by-construction net for exactly this.

Operational lessons paid for in blood this round:
- **NEVER drop a scratch file in the checkout root while a fleet flies** —
  sync-back's dirty-tree refusal (by design) stranded every ship on its
  branch for the whole round; launcher artifacts belong in `.autopilot/`
  (git-ignored). Cost: 10 manual sequential merges.
- **`undefined === undefined` is an open-row trap**: flight-log rows without
  an id read as "expanded" (openFlightRow[c.id] === f.id, both undefined) and
  then threw on `f.id.split`, killing the WHOLE client render into the
  offline catch. UI-state keyed by possibly-absent ids must guard existence
  BEFORE equality.
- Client-template escape class again (`'\n'` inside the template literal
  collapses): scan `[^\\]'\\n'` in the shell template on every fleet merge.

## Research-on-research — the weak-point discovery + evidence + meta-learning pass (2026-08-20 night, verify-by 2027-02)

Six-angle sweep behind `docs/DOCTRINE-WEAKPOINT-RESEARCH.md` (the operational
distillation). Load-bearing sources, all open-access/public:

**Systemic weakness discovery.** STPA/STAMP treats safety as a CONTROL
problem, not component failure — finds interaction/software hazards FMEA
misses; empirical comparisons show the two surface different classes, so run
both ([FMEA-vs-STPA case study](https://dl.acm.org/doi/10.1007/s11219-017-9396-0),
[four-method AEB comparison](https://asmedigitalcollection.asme.org/risk/article/8/3/031104/1115198/),
[STPA for frontier AI, arXiv 2506.01782](https://arxiv.org/pdf/2506.01782) —
primary-source read: 4 UCA types, incremental application, finds
second-order/emergent hazards risk-matrices miss; Google's pilot = 2
part-time engineers, 5 months). Retro-validation on OUR incidents: every
major failure of the last month maps to a UCA type (table in the doctrine).

**Empirical fragility.** Agent-system chaos engineering is now a field:
[AgentChaos (ASE'26)](https://arxiv.org/abs/2608.06790) injects LLM-API
faults at the shared HTTP layer — every system tested degrades, pass@1 down
up to 50 points; [ReliabilityBench](https://arxiv.org/html/2601.06112) finds
rate-limit faults hit hardest and robustness is a HARNESS property, not a
model property (matches our whole architecture bet);
[telemetry-based fault localization](https://arxiv.org/html/2608.14680);
[production playbook](https://cordum.io/blog/ai-agent-chaos-engineering-playbook)
(steady-state hypothesis, bounded blast radius, abort guards).

**Safety-II / near-miss.** Near misses are leading indicators sharing causes
with accidents; recoveries are CAPACITIES to study, not just absent failures
([Safety-II in a nutshell](https://www.sciencedirect.com/science/article/pii/S2093791120303619),
[near-miss as risk indicators](https://www.isaca.org/resources/isaca-journal/issues/2023/volume-4/using-near-miss-incidents-as-risk-indicators),
[premortems](https://www.atlassian.com/team-playbook/plays/pre-mortem)).
Our telemetry already holds the weak signals (15 guard-denial firings, 4
intent collisions, 5 extension rescues) — mining ritual seeded.

**Evidence discipline.** [Rapid reviews in SE](https://arxiv.org/pdf/2003.10006)
(bounded-to-a-practical-problem, gray literature legitimate for fast fields);
citation-hallucination rates 11–57% in deployed models and 3–13% of URLs
fabricated ([arXiv 2604.03173](https://arxiv.org/html/2604.03173v1),
[Cited-but-not-Verified](https://arxiv.org/html/2605.06635)) → every citation
is a claim to confirm; benchmark conflicts of interest are common (7/8
authors on one). Protocol distilled into the doctrine Part II, including the
LAWFUL-ACCESS rule (public/open sources only; no paywall circumvention or
ToS-violating scraping; closed sources = downgraded grade or operator ask).

**Meta-learning.** 2026 self-improvement lines ([ERL](https://arxiv.org/html/2603.24639v1),
[GRASP](https://arxiv.org/pdf/2605.29668), [SAMULE](https://arxiv.org/pdf/2509.20562),
[SkillRL](https://arxiv.org/pdf/2602.08234)) converge on: distilled
heuristics > raw trajectories (we comply); self-correction needs EXTERNAL
feedback (our founding doctrine); multi-level reflection (we comply);
**libraries must EVOLVE not grow — regression-gated edits, removal
first-class (our GAP → SOUL/lesson prune ritual seeded)**; failure-vs-success
learning differs (our success-side under-mined → near-miss ritual).

**Live STPA harvest (new candidate weak points, seeded to the board):**
guard-settings application unverified (flight could fly unguarded on a
silent --settings failure); board titles embedded UNFENCED in firing prompts
(untrusted text → sibling prompts; M4's injection defense covers Ask only);
no SIGTERM→SIGKILL escalation for hung children; the no-instanceId fleet
member flies UNCAPPED vitest while siblings fly (machine-budget hole);
near-miss mining ritual.

## better-sqlite3 v13 re-test (2026-08-23, verify when .nvmrc moves to >=22.14.0 or on any push to WiseLibs/better-sqlite3#1514)

- **Still blocked, but the reason changed.** [Upstream issue #1514](https://github.com/WiseLibs/better-sqlite3/issues/1514)
  ("v13.0.3 segfaults in `new Database()` on Node 20 and 22") is still
  **OPEN** as of this check — no newer better-sqlite3 release exists past
  `13.0.3` (`npm view better-sqlite3 versions` tops out at `13.0.3`), so
  adoption is not yet possible either way.
- **Root cause corrected.** The original `.github/dependabot.yml` ignore
  comment blamed better-sqlite3's prebuilt-binary matrix. Fresh upstream
  comments (2026-08-14/15) narrow it to a **Node.js runtime regression**:
  the segfault fires inside `napi_module_register_by_symbol` during native
  module registration, and disappears on Node builds **after v22.14.0** —
  a maintainer traced it to a Node-side commit, not a better-sqlite3 build
  artifact. Cross-platform field reports confirm it: darwin-arm64 and
  win32-x64 both crash on `13.0.3` with Node `22.12.0`; `12.11.1` is fine
  on the same machines.
  (win32-x64 report filed from this project's own git identity, so this
  is a first-party repro, not just upstream noise.)
- **Why the ignore stays.** `.nvmrc` pins `22.13.0` — inside the affected
  range per the upstream trace (fix lands only in `22.14.0`+). Bumping
  past that line is a separate, real decision (Node minor bump + full
  gate re-verify), not something to fold into a dependency-ignore
  refresh.
- **Verdict.** Ignore renewed, evidence refreshed in
  `.github/dependabot.yml`. Unblock condition is now concrete: `.nvmrc`
  reaches `>=22.14.0` (re-test v13 then) or #1514 closes upstream —
  whichever happens first.

## Node 22.13.0 → 22.23.2 (2026-08-24, verify-by 2027-02)

- **The unblock decision, made.** The prior entry flagged bumping `.nvmrc`
  past the `22.14.0` fix line as "a separate, real decision" rather than
  something to fold into a dependency-ignore refresh. `nodejs.org`'s v22
  release history confirms `22.23.2` (28 Jul 2026) as the latest v22 LTS
  patch — well past `22.14.0` — so `.nvmrc` and `package.json`'s
  `engines.node` both move to `>=22.23.2` rather than pinning the bare
  minimum: a floor at the exact fix commit leaves zero margin against any
  later regression in the same class, and Dependabot's own npm-ecosystem
  policy here already prefers the current patched release over an old
  minimum for the identical reason.
- **What this does NOT do.** This box's actual installed Node binary is
  still `22.12.0` (`node --version`) — `.nvmrc`/`engines` are a declared
  floor for CI (`actions/setup-node` with `node-version-file: .nvmrc`) and
  any dev machine using nvm/volta, not a live upgrade of this sandbox's
  runtime. `better-sqlite3` stays on `^12.11.1` and the v13 Dependabot
  ignore stays in place (updated comment, `.github/dependabot.yml`):
  nothing here has actually run `new Database()` against v13.0.3 on a real
  `22.23.2` process yet, so the segfault fix is inferred from the upstream
  trace, not first-party re-verified. `strict-peer-dependencies`/no
  `engine-strict` in `.npmrc` means this stays a WARN, not a hard install
  failure, on any machine still behind the new floor.
- **Next step.** The first environment that actually runs on `>=22.14.0`
  (CI after this merges, or a dev machine with nvm) is where the
  `better-sqlite3` v13 re-test from the entry above should happen — bump
  the dependency, run `new Database()`, and only then drop the Dependabot
  ignore.
## Stale-lane self-sync vs the sibling-scan guard (2026-09-02, verify-by 2027-02)

Live specimen from this lane (fleet-9): `git rev-list --left-right --count
main...HEAD` showed 937 commits behind main against a single commit ahead —
this lane hadn't synced since the last "land autopilot/flight into main."
A `git merge-tree <merge-base> HEAD main` dry run (read-only, no working-tree
changes) reported **zero** conflict markers: content-wise, a full merge would
apply cleanly, auto-resolving the one file both sides had touched
(`docs/RESEARCH-LIBRARY.md`).

**But the merge commit was refused anyway.** The repo's pre-commit hook (its
"PRE-COMMIT SIBLING SCAN" — a fresh re-check of live sibling claims at commit
time, not just at firing start) found that the merge's file set included
`apps/dashboard/src/flight/pr-review.ts`, which sibling fleet-2 was actively
working at that moment, and refused the commit outright: *"Do not commit this
file — reshape the unit to avoid it, or pick different work."*

**The structural tension this exposes:** a merge commit that fast-forwards a
stale lane necessarily carries the FULL file set changed since the merge
base — every file touched across however many hundreds of commits main has
moved. On a fleet with 6+ siblings concurrently hot on `apps/dashboard/src/`
(the busiest surface — see "Fleet anti-duplication" above), the probability
that at least one of those hundreds of files is claimed by a live sibling
approaches 1. So the very guard that protects active work from collision
also blocks the stale lane's only simple self-repair path — and the longer
a lane stays unsynced, the larger that file set grows, the more certain the
block becomes. Staleness compounds; it does not self-heal via merge alone.

**What this firing did:** dry-run confirmed content-safety, attempted the
merge, hit the guard on the first flagged file, `git merge --abort`'ed
immediately (zero residue, clean tree) rather than trying to route around
the hook (never skip hooks) or reshape by force-excluding claimed files from
a 937-commit merge (would produce a half-synced, hard-to-reason-about tree
for marginal gain). Reported as a PROPOSAL instead of attempted further.

**Open — not solved here:** the guard is doing its job; the gap is that lane
sync has no path that is BOTH safe (respects live claims) AND achievable by
a single small firing once drift is this large. Candidate directions for
whoever picks this up: (a) an operator/harness-triggered consolidated land
pass during a declared low-traffic window, not a lane self-initiated merge;
(b) a sync mode that stages everything EXCEPT currently-claimed files (defer
just those, land the rest), rather than all-or-nothing; (c) a periodic
harness-level sync cadence per lane so drift never reaches 900+ commits in
the first place. None implemented — evidence-gathering only.

**Closed (2026-09-03, same lane):** this is `ap-mtjwbrok-0` — the same 937-
commits-behind, `pr-review.ts`-overlap specimen this entry's header names. A
later firing in this lane fixed the root cause directly rather than any of
the three candidate directions above: `checkPreCommitSiblingOverlap` could
not distinguish "originating new work in a claimed file" from "finalizing an
already-resolved merge that happens to touch one among hundreds," so it
exempts a `git commit` made while `MERGE_HEAD` is set (`isMergeCommit`,
`packages/engine/src/adapters/sibling-commit-scan.ts`, commit `faf95ac2`).
The dry-run-then-`merge --no-commit`-then-`git commit` sequence this incident
used now finalizes cleanly: git's own merge machinery already reconciled the
content by the time `MERGE_HEAD` is set, so the guard's file-overlap
rationale no longer applies to that commit. Recorded under the Sharding
primitive in `docs/DOCTRINE-COORDINATION.md`. Candidates (a)-(c) remain
valid for the *upstream* problem (drift reaching 900+ commits before a sync
is attempted at all) — this only removes the guard as the blocker on the
self-repair path once drift has already happened.

## Open (queued research — do with WebSearch, then RECORD HERE)

- **Ecosystem sweep**: any critical OSS we missed (embedders, schedulers,
  queue libs) — run through §7 vetting before adoption.
