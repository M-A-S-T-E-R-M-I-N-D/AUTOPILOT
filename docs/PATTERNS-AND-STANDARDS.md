# Patterns & Standards — AUTOPILOT

> A project of this magnitude is not designed ad-hoc. This document names the **established architecture patterns** and
> **recommended / regulatory standards** AUTOPILOT adopts, so the build follows known-good structure instead of
> improvisation. Each is a real, citable standard; each has a one-line "how we apply it." Grounded partly in the
> disciplined practices observed in the reference implementation (`MDVIEWER-STUDY.md` §5).

## 1. Architecture patterns
| Pattern | How we apply it |
|---|---|
| **Hexagonal / Ports & Adapters** (Cockburn) | the Engine core (orient/pick/gate/commit) depends on *ports* — `ModelPort` (cloud/local), `GatePort` (detected per project), `StorePort` (SQLite), `VcsPort` (git) — so any of them swaps without touching the core. |
| **Event-driven / Event Sourcing** | telemetry + activity are an append-only event log (the un-fakeable record); projections build the dashboard graphs + the abstract activity map. (Reference: MdViewer's `EventEmitter` streams.) |
| **CQRS (light)** | writes = the append-only event/metrics log; reads = SQLite projections/indexes for the dashboard — never full-scans. |
| **Plugin / Adapter Registry** | one source-of-truth catalog (agents/skills/commands as markdown+frontmatter) compiled to each harness target via an install-target registry (MdViewer §5's crown jewel) — **generated, never checked-in per-harness**. |
| **Supervisor / Actor** | the multi-project Supervisor owns per-project Engine "actors"; each is single-instance-guarded, restart-safe, isolated (worktree per parallel worker). |
| **Monorepo (workspaces)** | `packages/engine`, `packages/onboarding`, `packages/store`, `apps/dashboard`, `packages/mcp` — one repo, clear boundaries, shared types. |
| **Strangler-fig migration** | port the proven PowerShell v2.4 loop to TS incrementally, behaviorally-identical, verified against the working script — never a big-bang rewrite. |

## 2. Security & supply chain (regulatory-grade)
| Standard | How we apply it |
|---|---|
| **OWASP ASVS** + **OWASP Top 10** | the checklist for the dashboard server + APIs; verified in the security harness. |
| **OWASP LLM Top 10** (incl. prompt injection) | the `<<< PROJECT_CONTENT >>>` untrusted-data framing (MdViewer §3); tool authority mode-gated; agent output never trusted as instructions. |
| **CWE / SAST** | dependency audit + static analysis in the gate; findings → Anomalies with propose-fix (never silent). |
| **SLSA** (supply-chain levels for software artifacts) | pinned deps, lockfile integrity, provenance on release artifacts, reproducible builds where feasible. |
| **OpenSSF Scorecard** | run against our own repo; branch protection, signed releases, no unpinned actions. |
| **Secret management** | no secrets in code (CI secret-scan gate, MdViewer's `validate-no-personal-paths` pattern); credentials via the user's own keychain (the CLI's auth), never stored by us. |
| **Web hardening** (dashboard is localhost) | **CSP** (nonce-based), **DNS-rebind guard**, per-route **rate limits**, path-traversal guards (`validate*File` family), `X-Content-Type-Options`/`Referrer-Policy` — all present in the reference, all adopted. |
| **Confidentiality** | local-first; embeddings/offload local-only; project content leaves the machine ONLY via the user's own Claude account. |

## 3. Observability
- **Structured, leveled logging** (JSON lines) — never `console.log` in committed code (MdViewer `CLAUDE.md` rule adopted).
- **OpenTelemetry-shaped** metrics for engine firings: the firing record already captures the OTel-style attributes
  (span = firing; attributes = cost/tokens/turns/gate) and persists them to SQLite; exporting them over the OTel
  wire-format (for standard-portable dashboards) lands with the dashboard at **M3** (tracked in FEATURE-COVERAGE).
- **The dual-stream** (agent-semantics SSE + filesystem WS) is the live layer (`REACTIVITY.md` §3); the append-only
  event log is the durable layer; SQLite projections drive the graphs.
- **Health/anomaly detection** as a continuous signal (cost spikes, regressions, gate-fail rate) — not only the retro.

## 4. Testing & quality gates
- **Test pyramid** (unit ≫ integration ≫ e2e); **TDD** for logic (RED→GREEN→refactor).
- **Coverage gate ≥ 80%** lines/branches/functions (MdViewer's c8 gate; adopted).
- **Test-impact analysis** — run affected tests per change + scheduled full runs (the Merkle-sampling efficiency lever,
  `ENGINE-RESEARCH.md` I4) — same confidence, a fraction of the compute.
- **CI validators-as-gates** — schema-validate every agent/skill/command/config (ajv + JSON Schema), unicode-safety,
  no-personal-paths (MdViewer `scripts/ci/validate-*.js`; adopted).
- **The engine's own gate** (typecheck+test+build, revert-on-red) remains the per-change verifier of record.

## 5. Accessibility (strict — a first-class requirement)
- **WCAG 2.2 Level AA** minimum (target AAA where feasible), **WAI-ARIA 1.2** + **APG** authoring patterns.
- **Machine-checkable a11y automated in the gate**: axe-core (contrast, roles/names, landmarks), keyboard-reachability,
  focus order, reduced-motion — these ship autonomously (MASTER-PLAN §17.1).
- **Human-verified a11y** (lived usability for a disabled person) is a 🟣 human-required item (§17.2) — automation
  approximates, a human judges.
- Reduced-motion honored everywhere; the abstract activity map is calm/static-safe by construction.

## 6. Internationalization
- **Unicode** correctness (NFC normalization, grapheme-safe truncation, bidi/RTL correct) — Hebrew + English first-class.
- **CLDR plural rules** + **ICU MessageFormat**-style interpolation; all UI strings in a catalog, canonical locale total,
  others fall back — the proven internal i18n model, carried.
- Multilingual model set for Ollama (he/en/zh/ja/ru/es/…), enable/disable, per-task choice.

## 7. Data & persistence
- **SQLite** (embedded, zero-config, queryable) for telemetry, tasks, projects, versions index; **append-only event log**
  (JSONL) as the source of truth; projections rebuildable.
- **Content-hash cache invalidation** for the project index/RAG (path-independent, auto-invalidating — the
  content-hash-cache pattern) — a stale index is worse than a fresh read, so invalidation is correctness-critical.
- **Backups first, additive restores** (see §9).

## 8. Open-source governance & release engineering
| Standard | How we apply it |
|---|---|
| **Semantic Versioning 2.0** | `MAJOR.MINOR.PATCH`; pre-1.0 during the M0–M9 build (each milestone is a MINOR bump); `1.0.0` ships at the M9 launch. See [`RELEASING.md`](RELEASING.md). |
| **Conventional Commits** | enforced (commitlint) — feeds automated changelog + SemVer bumps. |
| **Keep a Changelog** | `CHANGELOG.md`, human-readable, chronological. |
| **SPDX + REUSE** | every file SPDX-tagged; **Apache-2.0** (patent grant) as the license. |
| **DCO / sign-off** | contributor sign-off on commits. |
| **Community health files** | `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant), `SECURITY.md` (disclosure SLAs — MdViewer's 48h/7d/30d model), `GOVERNANCE.md`, issue/PR templates. |
| **No private data** | CI-enforced; the only identity carried is the author brand **1337 · REL AZEUS · MΔSTERMIND**. |

## 9. Versioning / backup model (the founder's MYTH/LEGACY, standardized)
- **MYTH** = pre-touch original snapshot (a read-only archival tag; standard term: *pristine baseline*).
- **LEGACY** = the lock-on baseline + safety branch (the restore floor; standard term: *checkpoint baseline*).
- **FLIGHT LOG** = every autopilot commit since (browsable, diffable, **additively restorable** — a restore is a new
  branch, never a history rewrite; never force-push/`reset --hard`/touch `main` without approval).
- Implemented on plain **git** (worktrees + tags + branches) so it's portable and inspectable, surfaced in the Versions
  screen — no bespoke VCS.

## 10. AI-agent operating principles (from the reference + our additions)
1. **Agent-first / delegate** · 2. **Test-driven, verify-don't-assume** · 3. **Security-first** · 4. **Immutability**
(new objects, not in-place mutation) · 5. **Plan-before-execute** — the ECC 5 principles (MdViewer `AGENTS.md`), adopted.
Plan-before-execute includes writing an ADR (`docs/adr/`) whenever the plan lands, changes, or reverses an
architectural decision — the record ships in the same slice as the decision, not as a follow-up.
Plus ours: **6. Un-fakeable telemetry** (sha/HEAD) · **7. Cost-aware model routing** (local/cheap/top by task) ·
**8. The verification boundary** (machine-100% autonomous vs human-required 🟣; MASTER-PLAN §17) ·
**9. Never stall** (proceed on reasonable interpretation, defer forks/human items) ·
**10. Eval-driven evolution** (the human verdict is the fitness signal).

---

*Living doc. This is the "known patterns + recommended/regulatory structures" backbone the project builds on — not a
list to expand later, but the actual standards adopted now. Cross-refs: `MASTER-PLAN.md`, `ENGINE-RESEARCH.md`,
`REACTIVITY.md`, `MDVIEWER-STUDY.md`.*
