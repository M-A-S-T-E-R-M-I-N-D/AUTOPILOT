# AUTOPILOT — Master Plan

> **Working name:** `AUTOPILOT` (founder's pick; naming shortlist in §12).
> **Author / brand:** **1337 aka REL AZEUS (MΔSTERMIND)** — the only identity carried in the codebase.
> **License:** fully open-source (MIT or Apache-2.0), zero private/personal data.
> **Status:** EXECUTING — v0.11.0 released; M4 in progress (live flights, RAG, task board, office
> visualization all shipped). This document is the FOUNDING plan, kept for orientation and intent;
> the LIVE record of what exists is `CHANGELOG.md` + `FEATURE-COVERAGE.md`, and current knowledge
> lives in `ENGINEERING-DOCTRINE.md` + `RESEARCH-LIBRARY.md`.
>
> **Document set (read in this order):** `MASTER-PLAN.md` (this) → `ENGINE-RESEARCH.md` (the proven engine + SOTA
> efficiency) → `MDVIEWER-STUDY.md` (reference implementation, file-cited) → `REACTIVITY.md` (talk-to-agent +
> live view + RAG + task assignment) → `PATTERNS-AND-STANDARDS.md` (adopted patterns + regulatory standards) →
> `ACTION-PLAN.md` (the definite milestone plan + DoD) → `FEATURE-COVERAGE.md` (every feature traced —
> nothing forgotten) → `BACKLOG-999.md` (the tracked long-tail).

---

## 0. תקציר מנהלים (עברית) / Executive summary

**עברית —** מוצר קוד‑פתוח עצמאי: אתה מוריד אותו, מפעיל קובץ‑הרצה, הוא **ננעל על תיקיית פרויקט**, חוקר ומבין אותה, מקים לעצמו את כל התשתית והלוח (dashboard), ואז **טס על טייס‑אוטומטי** — משפר, מציע הצעות לאישור, מוצא באגים, פותר פרצות‑אבטחה, מתעד הכל, מציג בגרפים, מזהה חריגות, מנהל גרסאות. GUI מבוסס‑ווב לניהול, בחירות, ועריכת קבצים (נעול‑בדיפולט, פתוח למי שרוצה). מולטי‑פרויקט (במקביל או לחוד). Ollama אופציונלי עם מודלים רב‑לשוניים (עברית+אנגלית קריטי; סינית/יפנית/רוסית/ספרדית ועוד). התקנה בלחיצה מ‑0 מוחלט. הכל מאובטח, ממקורות רשמיים, נגיש (WCAG מחמיר), ושמור.

**English —** A standalone open-source product. You download it, run one installer, it **locks onto a project folder**, researches and understands it, stands up its own control panel + infrastructure, then **flies the repo on autopilot** — improving, proposing changes for approval, finding bugs, closing security holes, documenting everything, charting it, detecting anomalies, and managing versions. A local web GUI drives selection and (optional) file editing; opinionated-strong by default, fully editable if you want. Multi-project (parallel or solo). Optional Ollama with a multilingual model set. One-click install from absolute zero. Secure, sourced only from reputable projects, strictly accessible, fully persisted.

**The one-sentence pitch:** *Point your Claude account at any repo — in one moment AUTOPILOT knows it, sets itself up, and flies it.*

---

## 1. Why this is feasible (and de-risked)

The scary 20% is already solved and **proven in production** on the internal predecessor:

| Proven capability (exists today) | Where it lives now |
|---|---|
| Autonomous gated loop that ships real, verified work | `the internal v2.4 loop script` (v2.4) |
| Measured telemetry (cost/tokens/turns/ship-rate, cross-checked by sha+HEAD) | `AUTOPILOT-METRICS.jsonl` + `report_autopilot.py` |
| Model resilience: fable→opus fallback, promote-on-exhaustion, time-based re-probe | v2.4 runner |
| Quota safety: budget cap, adaptive cadence, weekly pacing, global-exhaustion **hibernation** | v2.4 runner + `usage_advisor.py` |
| Local-model offload (confidential, free compute) | `scripts/local_llm.py` (Ollama) |
| The "soul": iteration prompt + rules + learnings + retro self-improvement | `AUTOPILOT-PROMPT.txt`, `AUTOPILOT-LEARNINGS.md` |
| Graceful stop, single-instance mutex, restore points, propose-for-approval flow | runner + board/decision model |
| Human decision board + applied-decision lifecycle | `board.ts` model (to be generalized) |

**Measured result of that nucleus:** 87 firings, ship-rate 100% (last 10), cost/shipped **$6**, self-report ~80%, its own diagnostic reads *"SOTA posture holding."*

So AUTOPILOT is **not R&D on the risky part** — it is **productizing a working engine**: make it project-agnostic, cross-platform, multi-project, and wrap it in a great installable GUI.

**Honest scope:** the FULL vision is weeks of work. A strong **MVP is a few days**. Both are laid out in §13.

---

## 2. What the product must do (the full requirement capture)

Nothing dropped — every point the founder specified:

1. **Standalone software** — download separately, one run-file installs everything from absolute 0 (incl. Node/Python runtime + Ollama + models), cross-platform, SOTA install UX.
2. **Locks onto a folder** → **learns/researches/reviews/understands** the project it enters (stack, build, test/gate commands, conventions, architecture).
3. **Ships with the full HARNESS + software coverage** — gate detection, review agents (code/security/tests), TDD, docs, anomaly detection, version management — ready out of the box.
4. **Auto-builds its own infrastructure** for the project: control board, telemetry, safety branch, backup.
5. **Web GUI / Dashboard** (the control panel):
   - **Projects**: list, select, view one **or all together**; per-project + aggregate.
   - **Tasks/board**: queued / in-progress / done / **needs-approval** / deferred.
   - **Graphs + numbers + raw DATA**: cost reports, tokens, ship-rate, self-report, improvement-over-time — numerically, visually, and the underlying data, all **present + persisted**.
   - **Identity / SOUL**: the bot's prompt, rules, persona — **editable, locked by default**, always **proposable/improvable** (any prompt kind/structure).
   - **Versions screen**: view + manage every version (see §7 naming), restore.
   - **Settings**: Ollama (models, enable/disable, **one-click install**, model choice), Claude account connection via membership, token/quota view.
   - **Approvals**: proposals the bot surfaces for the human — approve/edit/reject; explains impact before save.
   - **Editing**: view + edit any file/prompt; approve saving; everything **available + open to edit but hidden by default** — the user must *want* to intervene.
   - **Accessibility**: strictest level (WCAG AA+), high UX.
6. **Autonomous behaviors**: fly on autopilot, improve, prepare, **propose for approval**, find bugs, fix security holes, document everything, chart everything, detect anomalies, manage versions — all orderly.
7. **Multi-project**: run several **in parallel or separately**; view each or all.
8. **Ollama**: optional; strong multilingual model set covering everything — **Hebrew + English critical**, plus Chinese, Japanese, Russian, **Spanish**, etc.; enable/disable; guidance editable, proposed-not-locked; choose/install models one-click; easiest path = an installer that sets it all up (takes as long as it takes).
9. **Backup + versioning**: **always back up before touching a new git**; a screen to view/manage all versions; naming tiers (MYTH / LEGACY / … — see §7).
10. **Security**: everything secure, always from **reliable/official/well-known** sources; the product itself hardened; **detect + fix vulnerabilities at all layers**.
11. **Open-source**: fully open, available to everyone, **no private/personal data** — except the author identity **1337 / REL AZEUS / MΔSTERMIND**.
12. **Token/usage awareness** + **Claude-account membership connection** in the correct, accepted ways.
13. **Dynamic + self-configuring**: connects to any project type, designs/configures itself and the project, and starts flying independently.
14. **"999 topics"**: this plan is a **living document** — a backlog register (`BACKLOG-999.md`) will accumulate the long tail; the architecture is built to absorb them.

---

## 3. Architecture (component map)

```
                         ┌─────────────────────────────────────────────┐
                         │           AUTOPILOT DASHBOARD (Web)          │
                         │  projects · tasks · graphs · SOUL · versions │
                         │  settings · approvals · tokens/cost · editor │
                         └───────────────▲──────────────┬──────────────┘
                                         │ REST/WS      │ actions
                         ┌───────────────┴──────────────▼──────────────┐
                         │              SUPERVISOR (daemon)             │
                         │  multi-project registry · scheduler ·        │
                         │  per-project run/stop · aggregate telemetry  │
                         └───────┬───────────────┬───────────────┬──────┘
                                 │               │               │
              ┌──────────────────▼──┐ ┌──────────▼─────────┐ ┌───▼─────────────────┐
              │  ENGINE (per project)│ │  ENGINE (project 2)│ │  ENGINE (project N) │
              │  the v2.4 loop,      │ │                    │ │                     │
              │  generalized:        │ │                    │ │                     │
              │  orient→pick→gate→   │ │                    │ │                     │
              │  commit→report→pace  │ │                    │ │                     │
              └───┬──────────────┬───┘ └────────────────────┘ └─────────────────────┘
                  │              │
      ┌───────────▼──┐   ┌───────▼────────┐   ┌───────────────┐   ┌──────────────────┐
      │ claude -p     │   │ Ollama (local) │   │ Gate runner   │   │ Telemetry store  │
      │ (cloud model) │   │ multilingual   │   │ (detected)    │   │ + versions/backup│
      └───────────────┘   └────────────────┘   └───────────────┘   └──────────────────┘
```

**Components:**

- **Engine** — the project-agnostic port of the v2.4 loop. Per project: orient (read repo + config), choose highest-value verifiable work, execute gated, commit, self-report METRICS, pace/hibernate. One engine instance per locked project; single-instance guard per project.
- **Onboarding / Orientation** — first-lock ritual: **backup + safety branch first**, then detect the stack + gate (how to typecheck/test/build/lint), map architecture and conventions, generate the project's starter board + SOUL, register it in the Supervisor.
- **Supervisor (daemon)** — owns the project registry, runs/stops engines, schedules parallel vs solo, aggregates telemetry, exposes the API the Dashboard consumes.
- **Dashboard (Web)** — the local GUI. Talks to the Supervisor over REST + WebSocket (live updates). Everything in §2.5.
- **Harness pack** — the shipped tooling: gate-detection, review agents (code/security/tests), TDD guide, doc-gen, anomaly detection, dependency/vuln scanning, version/restore.
- **Model layer** — cloud (`claude -p`) + optional local (Ollama), with the v2.4 routing/quota logic (fallback, promote, hibernate, offload).
- **Store** — telemetry (JSONL/SQLite), versions/backups, per-project config, the SOUL, and the decision/approval ledger. Everything persisted + queryable for the graphs.
- **Reactivity layer** (full spec in `REACTIVITY.md`) — per-project **chat** (spawn the local Claude CLI → re-stream
  as SSE; billed on the user's own subscription), **best-in-class hybrid RAG** (SQLite FTS5 + local embeddings + a
  BM25/vector ranker over the incremental project index), **task assignment** into one unified task entity, and the
  **live view** (agent-semantics SSE + filesystem WS + the minimal, correct **abstract activity map**). Grounded in the
  proven MdViewer mechanisms (`MDVIEWER-STUDY.md`), improved for efficiency.

---

## 4. Key decisions (recommendations, to confirm)

| Decision | Recommendation | Why |
|---|---|---|
| Engine + Supervisor language | **Node.js / TypeScript** | one stack with the web dashboard; trivial cross-platform `npx` install; the engine just orchestrates `claude -p` (shell-out), so no heavy compute. (Python allowed for ML-adjacent scripts.) |
| Dashboard stack | **React + Vite + a local Node server** (or Tauri for a native shell later) | fast, accessible, familiar; runs as a localhost app, no cloud. |
| Data store | **SQLite** (telemetry, decisions, versions index) + flat JSONL append log | zero-config, embedded, queryable for graphs, portable. |
| Distribution | `npx autopilot` / a single installer script per-OS + optional desktop build | "one file installs everything." |
| Cloud model driver | wrap the **Claude Code CLI** (`claude -p`) exactly as v2.4 does | already proven; membership/account handled by the CLI's own auth. |
| Local models | **Ollama** (optional), one-click model pulls | proven in v2.4's `local_llm.py`. |

**The current runner is PowerShell (Windows-only).** For an open-source cross-platform product it gets **rewritten in TypeScript** — a faithful port of the proven v2.4 logic (this is mechanical, low-risk, and the behavior is already specified by the working script + this plan).

---

## 5. The Dashboard — screen spec

Opinionated-strong defaults; every control **present but calm/hidden until you open it**.

1. **Home / Fleet** — all projects at a glance: status (flying / paused / hibernating / needs-you), last ship, cost today, ship-rate, a sparkline of improvement. Toggle **single project ↔ whole fleet**.
2. **Project detail** — the board (tasks by status), the live flight log, the graphs (cost/shipped, tokens, turns, self-report, ship-rate over time), and the raw data table (exportable).
3. **Approvals** — the queue of proposals the bot deferred to you (design/pixels, product forks, security-sensitive), each with context + the bot's recommendation; approve / edit / reject; impact explained before save.
4. **SOUL / Identity** — the bot's persona, prompt, rules, and per-project overrides. Locked by default; unlock to edit; the bot may **propose** prompt improvements you ratify.
5. **Versions** — the timeline (see §7): MYTH → LEGACY → flight history; diff any two; **restore** any point (creates a new safety branch, never destroys).
6. **Settings** — models (cloud + Ollama, enable/disable, one-click install, per-task routing), quota/token view + weekly pacing, Claude membership connection, language set, accessibility prefs, security policy.
7. **Anomalies / Health** — detected regressions, cost spikes, gate failures, security findings — with the bot's proposed fix.

Accessibility: WCAG 2.2 AA minimum (keyboard-complete, reduced-motion, contrast, screen-reader labels), i18n (he/en first, RTL-correct, then the wider set).

---

## 6. Ollama / multilingual models

- **Optional** (toggle in Settings). When on, offloads mechanical/bulk sub-work off the paid API (the biggest quota lever — currently 0% used on the internal predecessor, our first optimization target).
- **Recommended local set** (installable one-click): a strong **code** model (e.g. `qwen2.5-coder`), a strong **general** model (`gpt-oss` / `qwen`), and **language** coverage — Hebrew (**DictaLM**), plus zh/ja/ru/es via multilingual models. Confidentiality-safe: **local-only, cloud Ollama models refused** (the `local_llm.py` guard).
- All guidance/prompts here are **proposed, not locked** — editable in the Dashboard.

---

## 7. Backup + versioning ("MYTH / LEGACY")

**Cardinal rule: back up before touching a new git.** On first lock, AUTOPILOT snapshots the repo and creates a dedicated safety branch; it never force-pushes, never rewrites history, never touches `main` without approval.

Version tiers (founder's naming honored, with clean definitions):

- **MYTH** — the original repo state *before AUTOPILOT ever touched it* (the "before-time"; a read-only archival snapshot).
- **LEGACY** — the baseline captured *the moment AUTOPILOT locked on* (the restore floor + backup point).
- **FLIGHT LOG** — every autopilot commit since, browsable + restorable (each restore is additive — a new branch, never a destroy).

*(Alt software-standard terms if preferred: `PRISTINE` / `BASELINE` / `HISTORY`, or `snapshot` tiers. MYTH/LEGACY are kept as the evocative, brandable OSS names.)*

The Versions screen renders this timeline and drives one-click restore.

---

## 8. Security posture

- **Product itself hardened**: no secrets in code, no telemetry exfiltration, local-only by default, dependency pinning + SRI, CSP on the dashboard, input validation at every boundary.
- **Only reputable sources**: dependencies from official registries + well-known, audited projects; Ollama models from official/verified sources.
- **Detect + fix vulnerabilities at all layers**: a security pass is part of the harness (secret scan, dep-audit, SAST-style review agent) — findings surface in Anomalies with proposed fixes; security-sensitive fixes are **propose-for-approval**, never silent.
- **Confidentiality**: a project's content never leaves the machine except through the user's own Claude account; local offload keeps sensitive work fully on-device.

---

## 9. Open-source + identity

- License: **MIT or Apache-2.0** (Apache recommended for the patent grant).
- **Zero private/personal data** in the repo. CI secret-scan gate on every commit.
- The **only** identity carried: **1337 · REL AZEUS · MΔSTERMIND** (author/brand, in `AUTHORS` / masthead / about).
- Public repo with a killer README, one-command install, and a live demo GIF of the Dashboard flying a repo.

---

## 10. How a new user experiences it (the golden path)

1. `npx autopilot` (or run the installer) → it installs the runtime, offers to install Ollama + models (skippable), opens the Dashboard at `localhost`.
2. "Add project" → pick a folder. AUTOPILOT **backs it up (MYTH+LEGACY)**, researches it, detects the gate, writes the starter SOUL + board.
3. Connect your Claude account (membership) if not already.
4. Press **Fly**. The bot orients, picks the highest-value verifiable work, does it gated, commits to a safety branch, self-reports, and shows it live on the board + graphs.
5. Review the Approvals queue for anything it deferred to you. Tune the SOUL if you want (or leave the strong default). Add more projects; run them in parallel.

---

## 11. Anti-goals (what it must NOT be)

- Not a cloud SaaS that ships your code off-machine.
- Not a black box: every action is logged, charted, restorable, and (for sensitive changes) approval-gated.
- Not brittle: if a gate fails it reverts cleanly; if quota is out it hibernates; if it's unsure it defers.
- Not locked-down for power users: everything is editable — just calm by default.

---

## 12. Naming

Founder's lean: **AUTOPILOT** (loved, clear — but generic/common in tooling).

Distinctive candidates (pilot/steering metaphor, brandable, checked for obvious collisions):

| Name | Feel |
|---|---|
| **AUTOPILOT** | founder's pick; the concept, plainly |
| **HELM** | steering any ship/repo (note: overlaps k8s Helm) |
| **WINGMAN** | an autonomous co-pilot at your side |
| **LODESTAR** | the guiding star; distinctive, premium |
| **VECTOR** | direction + velocity; short, technical |
| **AZEUS** / **MΔSTERMIND** | lean fully into the founder's brand as the product name |

**Recommendation:** ship as **AUTOPILOT** (honor the founder) with the brand line *"by MΔSTERMIND"*; keep **LODESTAR / WINGMAN** as fallbacks if a distinctive public OSS name is wanted to avoid collisions. **Founder decides — it's the brand.**

---

## 13. Phased roadmap

**Phase 0 — this plan** ✅ (living doc; the 999-backlog register grows under `docs/`).

**Phase 1 — MVP (the "few days" target): "fly ONE project, headless, with a read-only dashboard."**
- Port the v2.4 loop to a cross-platform **TypeScript engine** (faithful behavior port).
- Onboarding v1: lock a folder, **backup (MYTH+LEGACY)** + safety branch, detect the gate (typecheck/test/build), write a starter SOUL.
- Telemetry → SQLite; a **read-only Dashboard** (Home/Fleet + Project detail + graphs + flight log) served at localhost.
- Cloud model via `claude -p`; optional Ollama offload on.
- One-command install script.
- **Outcome:** you point it at a repo and watch it fly, with live graphs — the core, real.

**Phase 2 — control + approvals.**
- Approvals queue (propose-for-approval, edit/approve/reject) + SOUL editor (locked-by-default).
- Versions screen + one-click restore.
- Settings: models, quota/pacing view, language.

**Phase 3 — multi-project + supervisor.**
- Supervisor daemon: registry, parallel/solo scheduling, aggregate fleet view.

**Phase 4 — harness depth + security.**
- Full review-agent harness, anomaly detection, all-layer vuln scan + propose-fix.

**Phase 5 — polish + OSS launch.**
- Strict accessibility pass, i18n (he/en → wider), installer polish (incl. one-click Ollama + models), docs, demo, public release under MΔSTERMIND.

*(Phases 2–5 are weeks, done in gated increments — and, fittingly, AUTOPILOT can help build itself once Phase 1 flies.)*

---

## 14. The few-days execution scope (concrete)

When we start (in a few days), Phase 1 deliverables, in order:
1. `packages/engine` — TS port of the v2.4 loop (orient/pick/gate/commit/report/pace/hibernate) + tests.
2. `packages/onboarding` — folder-lock + backup(MYTH/LEGACY) + safety branch + gate detection.
3. `packages/store` — SQLite schema (telemetry, projects, versions) + the report queries.
4. `apps/dashboard` — read-only React dashboard (Fleet + Project detail + graphs + flight log) over a localhost API.
5. `install.*` — one-command bootstrap (runtime + optional Ollama).
6. `docs/` — README, ARCHITECTURE, BACKLOG-999, this plan.

**Definition of done for the MVP:** on a clean machine, one command installs it; you add a real repo; it backs up, orients, and ships at least one gated commit; the dashboard shows it live with graphs and the flight log.

---

## 15. Decisions (resolved — sensible defaults per the founder's latitude; override any time)

Per the founder (2026-07-06): "where something is unclear or in doubt, it's clear I meant it that way — proceed at
the right pace." So these are **locked with defaults**; say the word to change any.

1. **Name** — **AUTOPILOT**, brand line *"by MΔSTERMIND"* (founder's pick; distinctive alts LODESTAR/WINGMAN kept in reserve).
2. **Engine language** — **TypeScript** (cross-platform, one stack with the dashboard, engine orchestrates `claude -p`).
3. **License** — **Apache-2.0** (patent grant).
4. **MVP dashboard** — **read-only first** ("watch it fly"), then editing/approvals in Phase 2.
5. **First test subject** — a **throwaway sandbox repo** first (safe), then a copy of a real project.
6. **Progression colors (§16.1)** — the formalized mapping stands; **🟣 PURPLE = human-required** (aligns with the §17 verification boundary).

---

## 16. Project Progression model + Autopilot Inbox (2026-07-06 additions)

### 16.1 — The Progression / Health gauge (the "final progression bar")

Every project carries a single, honest **readiness gauge** the bot drives toward "stable" and the founder reads at a
glance. It has **two axes** and a **status ladder**.

**Axis 1 — Severity (the color that fills the bar, cleared in order, reds first):**

| Color | Severity | Meaning |
|---|---|---|
| 🔴 RED | CRITICAL | must fix — security/data-loss/broken |
| 🟠 ORANGE | HIGH | real bug / significant quality gap |
| 🟡 YELLOW | MEDIUM | maintainability / polish |
| ⚪ WHITE | LOW | cosmetic / nice-to-have (or a pristine, nothing-open surface) |

**Axis 2 — Dimension (what area a finding lives in — every finding is tagged one):**
`ACCESSIBILITY` · `CYBERSECURITY` · `UX/UI` · `HUMAN-INTERACTION QUALITY` (items that surely need a human) ·
`LEARNINGS` · `INFORMATION` · `DATA` · `PRIORITIES`.

**The status ladder (a project/version's headline color) — this is the "fill toward BLUE, then GREEN" the founder described:**

| Color | Status | Rule |
|---|---|---|
| 🔴 RED | at-risk | any open CRITICAL |
| 🟠 ORANGE | rough | open HIGH (no criticals) |
| 🟡 YELLOW | shaping | open MEDIUM (no highs) |
| ⚪ WHITE | clean | only LOW/cosmetic left |
| 🟣 PURPLE | **needs-you** | a human-required item is open (approval/pixels/product fork) — the bar **cannot** go green past this without the founder |
| 🔵 BLUE | **STABLE** | all CRITICAL→MEDIUM cleared across **every** dimension → a shippable "stable" version |
| 🟢 GREEN | **COMPLETED / AFFIRMED** | founder/verifier affirms on top of stable — done |

The gauge shows a **numeric %** + the **color bar** + a **per-dimension breakdown** (so you see e.g. cybersecurity is
green but accessibility still has a yellow). The bot autonomously drives everything toward 🔵 BLUE; 🟣 PURPLE items sit
in the **Approvals** queue waiting for you; 🟢 GREEN needs your affirmation (or a stricter verify pass). Per-project
**and** whole-fleet. *(Color/dimension mapping above is my formalization of the founder's brainstorm — open to tuning.)*

### 16.2 — The Autopilot Inbox + fully-autonomous task intake

Two-way: you can **talk to the bot while it flies**, and the bot **feeds itself work** so it never stalls.

- **Inbox (human → bot):** a dashboard message box (and an `INBOX/` drop-file) where you leave — at any time, even
  mid-flight — a note, a new task, a **plan request**, an **update/version request**, or a steering correction. It is
  an *optional* input, never a dependency.
- **Read cadence:** the engine reads the inbox at the **start of every firing**; a dedicated **Triage sub-agent** also
  live-watches the inbox + the repo between firings.
- **Autonomous intake loop (the "live check"):** the Triage sub-agent continuously answers *"is there work to
  place / plan-further / task now / do now?"* from three sources — (a) the **inbox**, (b) the **repo itself** (new
  bugs, regressions, TODOs, vulnerabilities, missing coverage, failing gates), (c) the **backlog/roadmap** — tags each
  with severity + dimension + status, and routes it onto the board. Planning, tasking, and doing are all triaged
  autonomously.
- **Every scenario stays autonomous:** empty inbox → mine the repo/backlog; urgent inbox message → prioritize it;
  board drained → move up the stack (propose the next plan/epic); blocked item → defer to Approvals (🟣) and pick
  another; needs-human → surface it, never stall. The founder's presence is *never required* for the loop to keep
  making correct progress.

*(And per the founder: many more subjects remain — this plan and `BACKLOG-999.md` keep absorbing them.)*

---

## 17. The Verification Boundary + Agent Evolution (human-in-the-loop, by principle)

**Premise (founder, 2026-07-06):** the software ultimately serves **living beings** — humans, and in some deployments
animals / plants / environments. So some judgments are **not the agent's to make alone**. AUTOPILOT draws an explicit,
honest line between what it can verify **100% itself** and what **requires a human verifier**, and treats the human's
verdict as the **fitness signal** that lets the agent evolve. This is the principled form of the 🟣 PURPLE gate (§16.1)
and the defer-zones (§2 G9).

### 17.1 — What the agent verifies 100% itself → fully autonomous
Objective, checkable facts, with **un-fakeable proof** (the gate + sha/HEAD):
- compiles / typechecks · tests pass (test-impact + scheduled full) · build succeeds;
- no secrets, no known vulnerabilities (dep-audit + SAST) · invariants hold · byte-identity · chain/hash integrity;
- **machine-checkable accessibility** — contrast, ARIA presence, keyboard-reachability, focus order, reduced-motion (axe-style);
- performance / size budgets · no regressions.
→ The agent clears these **autonomously**; on the gauge, machine-checkable 🔴🟠🟡⚪ items are its to resolve.

### 17.2 — What REQUIRES a human verifier → the 🟣 PURPLE gate
Subjective · experiential · ethical · intent-shaped · real-world-impacting:
- **Does it look right** — visual design, brand, pixels, layout feel.
- **Does it feel usable** — real UX / human-interaction quality; dignified and clear for an *actual* person (incl. the
  lived experience of a disabled user, which automated a11y checks approximate but cannot fully judge).
- **Is it appropriate / ethical** — it serves living beings: safety, harm, dignity, values.
- **Does it match intent** — where the ask was ambiguous, or a product/architecture fork is irreversible.
→ The agent **proposes with a recommendation + evidence**, tags it 🟣, and **waits**. It never fakes certainty here;
**when unsure which side an item is on, it defaults to human.**

### 17.3 — The human verdict as the evolution signal
The gate proves the agent did the **work**; only the human can judge whether the experiential/ethical parts were
**good**. So every human **approve / reject / edit (with a note)** is captured as an **evaluation label** — the fitness
function for what machines can't measure. It:
- feeds the **learnings + soul** (the agent updates its judgment and proposes prompt improvements you ratify);
- drives the **Evolution view** on the dashboard — *is the agent getting better?* (approval-rate rising, rejection-rate
  falling, proposals landing, rework shrinking, over time — numeric + visual + the raw data, per §5);
- guards against **Goodhart's law**: without the human signal the agent would optimize only the gate (tests), not the
  lived quality. Human-in-the-loop here is **not friction — it is the fitness function.**

### 17.4 — Operating principle: proceed on reasonable interpretation
Where intent is clear-enough, the agent **assumes it and progresses at pace** (the founder's explicit latitude). It
reserves genuine forks and 🟣 human-required items for approval. The bias, always: **act on the machine-verifiable,
propose on the human-required, never stall.**

---

## 18. AUTOPILOT builds itself (dogfooding) + packaging & distribution

### 18.1 — The development of AUTOPILOT is its own first test (self-test / dogfooding)
The strongest possible proof that the tool works is that **it builds itself**. From milestone M1 onward, AUTOPILOT's
own repository is registered as its first tracked project, and — where the capability exists — each subsequent
milestone is (partly) **shipped by AUTOPILOT flying its own codebase**: proposing, gating, committing, self-reporting.
This makes the whole project a continuous, honest self-test: if AUTOPILOT can't reliably improve its own repo, we've
learned that before a single external user does. The dogfooding proof is a first-class acceptance criterion in the
action plan (`ACTION-PLAN.md`).

### 18.2 — "Pack for a friend" — the shareable package
A `autopilot pack` command produces a single **shareable package** (a self-contained folder / archive, zero private
data). The recipient experience, product-grade:
1. **Open the package → a landing site** with all the explanations (what it is, what it does, safety, how to point your
   Claude account at a repo), and **ONE simple button: Install & Load.**
2. **The button installs everything from absolute 0** — the runtime, the app, and (offered, skippable) Ollama + the
   multilingual model set — and shows honest progress ("takes as long as it takes"). SOTA install UX.
3. **When it finishes loading**, the package ships the product-grade operator files:
   - **`run`** (start the app + supervisor),
   - **`stop`** (graceful stop — finish the current firing, then exit),
   - **`doctor`** (diagnose: runtime, auth, Ollama, models, gate detection, ports, permissions — and offer fixes),
   - plus `update`, `pack`, `uninstall` — all cross-platform (`.cmd`/`.sh`), signed, idempotent.
4. **The site is now loaded with ALL the default features** — the strong opinionated defaults covering everything —
   **waiting for you to lock onto a project.** Nothing to configure to start.
5. **From here everything is changeable — but changing it requires approval + understanding.** Editing the SOUL, the
   rules, the models, the prompts is fully available, calm-by-default (hidden until you open it), and each change
   explains its impact and asks you to confirm the save (the §17 verification-boundary principle applied to config).

### 18.3 — Distribution
- Primary: `npx autopilot` / one-command installer per OS; the `pack` output for offline/friend sharing; an optional
  desktop shell (Tauri) later.
- Everything from reputable/official sources (deps, models), SLSA-provenanced release artifacts, no private data
  (author brand only: 1337 · REL AZEUS · MΔSTERMIND). Full spec: `PATTERNS-AND-STANDARDS.md` §8.

---

*Versioned document (see `CHANGELOG.md`). The architecture, patterns, and standards are **adopted now**
(`PATTERNS-AND-STANDARDS.md`), not deferred; `BACKLOG-999.md` is the tracked implementation backlog, the
standard way to carry the long tail of a project this size.*

**— Plan by Claude, for 1337 · REL AZEUS · MΔSTERMIND.**
