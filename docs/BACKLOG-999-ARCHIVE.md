<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# BACKLOG-999 archive — full evidence for closed items

`BACKLOG-999.md` is a live register the loop's Triage sub-agent consults every
firing (`docs/BACKLOG-999.md` §C2) — its own compression goal (board
`web-mtndm5m6-rfly97`, "keep BACKLOG-999 under 100 lines") is working it toward a
compact, scannable register. A `[x]` done item's multi-paragraph implementation
evidence is exactly the content that belongs in a paper trail but not in an
actionable backlog line: this file is where that evidence moves to, verbatim,
so the "no claims without a paper trail" standard
(`docs/CASE-STUDIES/README.md`) still holds after compression.
`BACKLOG-999.md` keeps a one-line pointer back here per moved item.

## §L — Board hygiene (moved 2026-09-09)

- [x] **Board hygiene** Reconcile board vs git on session end: interactive-session work marks no task done (only
  flight METRICS ids do) — reuse the headline resolver's commit↔title matching to propose "this shipped, mark done?"
  The matching primitive landed (`ap-msksw1mf-3`) — `findReconciliationCandidates`/`titleMatchScore` in
  `apps/dashboard/src/read/reconcile.ts` score an open task's title against a commit subject (Jaccard token
  overlap) and surface proposal-only candidates; it caught this backlog file's own live evidence of the bug
  (`ap-msksw1mf-4`'s reuse-lint work and `ap-msksw1me-0`'s OTLP endpoint wiring both shipped via interactive
  commits with no METRICS line, so their board tasks never flipped to `done`). Done — the real caller landed:
  `GitVcs.recentCommits` (`packages/engine/src/adapters/git.ts`) reads the target's recent history, and
  `apps/dashboard/src/fly.ts`'s end-of-flight block feeds it plus the open board through
  `findReconciliationCandidates`, printing each unconfirmed candidate for the operator to confirm on the
  dashboard. Proposal-only by design (never auto-applied) and best-effort (a reconciliation hiccup never fails
  the flight). `ap-msksw1mf-4` and `ap-msksw1me-0` themselves are still manually left open on the live board as
  a real-world fixture for this exact matcher to prove out on the next flight — but only `ap-msksw1mf-4` actually
  will: its shipping commit has a descriptive subject that scores 0.615 against the task title, well
  past the 0.5 threshold. `ap-msksw1me-0` shipped inside a WIP-checkpoint commit whose subject is
  generic firing-cadence boilerplate with no mention of OTLP — that pairing scores ~0.05, so the matcher
  originally could not surface it. This was a real blind spot, not a matcher bug: a checkpoint commit's subject
  never carries the descriptive content title-matching needs, since the firing that packs up mid-unit has no room
  left to compose one. Proven as a regression fixture in `apps/dashboard/test/read/reconcile.test.ts` (`"of the two
  real board fixtures, only the descriptively-committed one is proposed"`).
  **Resolved** — closed exactly this gap: `GitVcs.recentCommits`
  (`packages/engine/src/adapters/git.ts`) now also returns each commit's changed file paths, and
  `findReconciliationCandidates` (`apps/dashboard/src/read/reconcile.ts`) falls back to a boolean
  `filePathMatchesTitle` check — a shared, non-generic token (length >= 4, filtered against a structural-noise
  list) between the task title and a touched path — whenever no commit subject clears the threshold. Proposal-only
  and best-effort like the rest of this feature. Proven against both real fixtures once wired with real file data:
  the reuse-lint task still matches via subject text (score 0.615, unchanged), and the OTLP task is now recovered
  via the path signal (`apps/dashboard/test/read/reconcile.test.ts`, the fixture immediately after the one above).
  `apps/dashboard/src/fly.ts`'s end-of-flight block now passes `commit.files` through for real, so the fix applies
  to live flights, not just the test fixture.

## §K — Dashboard browser tsconfig lib/jsdom split (moved 2026-09-10)

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

## §K — reuse lint CI job (moved 2026-09-13)

- [x] Consider adding the canonical `reuse lint` (Python) as an optional CI job alongside the Node SPDX-header gate.
  Done — `.github/workflows/ci.yml`'s new `reuse-lint` job (`continue-on-error: true`, so it's informational only)
  runs `pip install reuse==6.2.0 && reuse lint`. Getting the repo REUSE-3.3-compliant surfaced two real gaps: a
  false-positive in `scripts/ci/validate-spdx-headers.mjs` (its own printed CLI guidance string contained a
  literal SPDX-header line that `reuse`'s parser read as a second, malformed header — fixed by wrapping it in a
  REUSE ignore-marker block) and two bundled third-party font license texts
  (`apps/dashboard/src/assets/OFL-{inter,roboto}.txt`) with no SPDX metadata — annotated in `REUSE.toml` under
  their own upstream copyright + `OFL-1.1`, with `LICENSES/OFL-1.1.txt` downloaded via `reuse download OFL-1.1`.

## §K — read-only open path (moved 2026-09-13)

- [x] `packages/store` read-only open path: add a `{ readonly }` option to `openStore`/`Store` that opens the DB
  read-only and skips write-only pragmas (`journal_mode = WAL`) — needed when the dashboard opens the store for reads (M3).
  Done — `StoreOptions.readonly` in `packages/store/src/db.ts` (existing callers unaffected); dashboard adoption
  landed too — every pure-read `openStore` call site in `apps/dashboard/src/read/source.ts`
  (`readFleetFromStore` .. `gatherLiveState`) now passes `{ readonly: true }`, so the dashboard never holds a
  write-capable handle alongside the engine's own writer connection; mutation functions (`createTaskInStore` etc.)
  are unaffected. Covered by `test/read/source.test.ts`'s "read-only openStore adoption" spy assertion.

## §K — OTel wire-format export (moved 2026-09-13)

- [x] OpenTelemetry wire-format export for firings (the OTel-shaped attributes are already captured in the firing
  record + SQLite): export over OTLP for standard-portable dashboards — lands with the dashboard at M3.
  Mapping + injectable HTTP transport done — `toOtlpResourceSpans`/`exportOtlpResourceSpans` in
  `packages/engine/src/otlp.ts`. Endpoint wiring (`ap-msksw1me-0`) done —
  `apps/dashboard/src/flight/otlp.ts`'s `otlpConfigFromEnv` reads the standard `OTEL_EXPORTER_OTLP_*` env vars
  (off when unset); `fly.ts`'s `onFiringComplete` exports each firing's span best-effort (a collector outage logs
  a warning, never fails the flight). Documented in the root README's "Telemetry & OTLP export" section.

## §L — C4 deterministic diff-size gate (moved 2026-09-13)

- [x] **C4** Deterministic diff-size gate: changed-lines threshold (~400) as a gate check, mechanical-change exemption
  (gate on review burden, not raw count). Done — `packages/engine/src/diff-size-gate.ts`'s `evaluateDiffSize`
  sums insertions+deletions from `VcsPort.diffNumstat` (new, optional capability; `GitVcs` implements it via
  `git diff --numstat --no-renames -z` — `-z` keeps non-ASCII paths raw, so a C-quoted path cannot
  escape the mechanical-path exemption and revert legitimate work), excluding paths that
  `isMechanicalDiffPath` classifies as review-exempt
  (lockfiles, generated snapshots/binaries, build/vendor output). `firing.ts` runs it only once the real
  typecheck/test/build gate is already green, folding a failing verdict into the SAME additive-revert path a
  real gate failure takes — an oversized diff is reverted, not silently shipped.

## §K — Security hardening (SHA-pinned actions) (moved 2026-09-14)

- [x] Security hardening (M8 / OpenSSF Scorecard "Pinned-Dependencies"): SHA-pin GitHub Actions (`actions/checkout`,
  `actions/setup-node`, `pnpm/action-setup`) to full commit SHAs with version comments; Dependabot's github-actions
  ecosystem keeps them current. Done — `.github/workflows/ci.yml` pins all three actions to their `v4.4.0` commit
  SHAs with `# vX.Y.Z` comments; `.github/dependabot.yml` already tracks the `github-actions` ecosystem so PRs
  keep the pins current.

## §K — Store path hardening (moved 2026-09-14)

- [x] Store path hardening (M3): validate/normalize the filesystem path passed to `openStore` before it reaches
  `better-sqlite3` once a less-trusted caller (the dashboard/config) can supply it, to avoid path-confusion.
  Done — `resolveStorePath` in `packages/store/src/db.ts` rejects NUL-byte paths and resolves relative paths to
  absolute ones; it runs unconditionally inside the `Store` constructor (the sole path every caller — dashboard,
  CLI, onboarding — goes through), so no caller can bypass it.

## §K — ClaudeCli long-prompt-via-stdin (moved 2026-09-14)

- [x] ClaudeCli long-prompt-via-stdin (Windows 32K cmdline ceiling): fold an over-long system prompt into the child's
  stdin instead of an argv entry (MDVIEWER-STUDY §1). Done — `CLI_STDIN_PROMPT_THRESHOLD` in
  `packages/engine/src/adapters/claude-cli.ts`.

## §K — Single-instance guard (moved 2026-09-14)

- [x] Single-instance guard for the engine loop (per-project): cross-platform `O_EXCL` lockfile + PID-liveness check
  (v2.4 used a Windows named mutex). Done — `FileInstanceLock` in `packages/engine/src/adapters/instance-lock.ts`,
  wired into `apps/dashboard/src/fly.ts` keyed per PROJECT id (`engine-<projectId>.lock`), so flights against
  different projects in the same store never contend (PARALLEL FLIGHTS 1/6, plus a follow-up).

## §K — Adaptive cadence + weekly pacing (moved 2026-09-14)

- [x] Adaptive cadence + weekly pacing adapter (`nextPaceMin`): port the observed-spend usage advisor (v2.4
  `usage_advisor.py`) behind the pacer port. Done — pure `nextAdaptivePaceMin` in `packages/engine/src/pace.ts`
  (base cadence under half of either soft cap, ramps to a bounded 6x as real spend nears the hourly/weekly cap),
  backed by `SqlitePacer` (`packages/engine/src/adapters/pacer.ts`) reading real gate-verified spend from the same
  `metrics` rows the dashboard graphs use; wired into `apps/dashboard/src/fly.ts`.

## §L — A3 three-valued gate verdict (moved 2026-09-14)

- [x] **A3** Three-valued gate verdict: `confirmed`/`refuted`/`unverifiable` — a crashed gate command (missing dep,
  OOM) must NOT revert good work like a real failure; RemediatingGate + telemetry learn the third state. Done —
  telemetry already carried `GateResultKind`'s `'unverifiable'` (`packages/engine/src/telemetry.ts`) and
  `firing.ts` already skipped the revert on `gate.crashed`; the missing piece was `RemediatingGate`
  (`packages/engine/src/adapters/remediating-gate.ts`), which used to run the mechanical fixer + a full gate
  re-run (up to the timeout) on a crashed verdict too — now it short-circuits straight through on `first.crashed`,
  since a formatter can't repair a broken environment.

## §L — B5 Starter-SOUL curation guard (moved 2026-09-14)

- [x] **B5** Starter-SOUL curation guard: keep the generated starter minimal (candidate inventory → operator
  compresses); "unreviewed SOUL" flag on the dashboard until the operator ratifies (M5 editor completes this).
  Done — `soul_reviewed`/`soul_proposed` + `markSoulReviewed`/`ratifySoulAmendment`/`dismissSoulProposal`
  ship the unreviewed flag and the operator review/ratify loop; `STARTER_SOUL_LINE_BUDGET`
  (`packages/onboarding/src/onboard/soul.ts`, regression-tested) mechanizes "keep minimal" as an interim guard —
  a new doctrine section can't be baked into the generator without consciously bumping the budget. The full fix
  (M5's human-ratified editor) remains open and unblocked by this.

## §L — D1 provenance trailers (moved 2026-09-14)

- [x] **D1** Provenance trailers on autopilot commits: model + `FIRING_PROMPT_VERSION` + harness as git trailers
  (already in SQLite; make it repo-native). Done — the COMMIT step in `buildFiringPrompt`
  (`packages/engine/src/prompt.ts`) now instructs every firing to add `Model:`, `Firing-Prompt-Version:`, and
  `Harness:` trailers next to `Signed-off-by:`.

## §L — B6 schema-validate METRICS and PROPOSALS (moved 2026-09-14)

- [x] **B6** Schema-validate METRICS/PROPOSALS at the parse boundary (enums for severity/dimension; fail-loud record,
  defensive parse stays). Done — `parseProposalsLine` (`packages/engine/src/telemetry.ts`) checks each proposal's
  severity/dimension against the store's `SEVERITIES`/`DIMENSIONS` enums and flags a rejected tag via `invalidTags`
  instead of silently keeping it; `fly.ts`'s `harvestProposals` surfaces the drop to the operator.

## §L — C3 destructive-git deny (moved 2026-09-14)

- [x] **C3** Destructive-git deny in the guard hook: "additive git only" is prompt-only today — add deterministic
  deny patterns (force-push, `reset --hard`, rebase, `branch -D`, checkout/switch main, `clean -f`, filter-branch)
  to the same PreToolUse guard that already denies path escapes (anti-pattern #14 caught live). Done —
  `packages/engine/src/guard.ts` denies every listed pattern (a follow-up hardening closed a git
  global-flag bypass of the destructive-git guard).

## §L — WCAG-AA light theme sev-medium contrast (moved 2026-09-14)

- [x] **WCAG-AA (real bug, from the a11y round)** Light theme `--color-sev-medium` 3.92:1 against surface — under
  AA's 4.5:1, used as gate-phase TEXT color (`.fnode-gate`/`.live-phase-gate`/`.act-search`); nudge OKLCH L down.
  Done — a light-theme `sevMedium` WCAG AA fix as gate-phase text (`packages/tokens/src/themes.ts`);
  contrast is now 5.02:1, and `packages/tokens/test/themes.test.ts` gates every theme's `sevMedium` at ≥ 4.5:1
  against both `surface` and `surfaceRaised`.
