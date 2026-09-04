# Changelog — AUTOPILOT

Chronological record of the project's founding documents, decisions, and build milestones.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org)
(each milestone M0–M9 is a MINOR bump; 1.0.0 at the M9 launch — see [`RELEASING.md`](docs/RELEASING.md)). Newest first.

## [Unreleased]

## [0.22.0] — 2026-09-04

### Added

- feat(dashboard): release-maturity intelligence — the ritual knows an alpha when it cuts one
- feat(i18n): translate the fly-bar HINT sentence to Hebrew via injected tr
- feat(i18n): translate the DETECTED BACKLOG panel's remaining states to Hebrew
- feat(onboarding): add static-site gate detector (html-validate + linkinator)
- feat: add ci:license-check gate — allowlist validator + doc drift check
- feat(onboarding): add static-site EcosystemDetector (html-validate + linkinator)
- feat: implement pocket-calculator state machine for calc.js

### Fixed

- fix(dashboard): render the pipeline canvas at natural size — no more screen-sized nodes
- fix(dashboard): announce the KEEPER PR review Apply result through a polite live region
- fix(dashboard): deep-link each publicity affordance to its own page, with live counts
- fix(engine): gate remediation commits only the fixer's own paths, not the whole tree
- fix(dashboard): neutralize @-mentions in KEEPER's base-branch reasoning too
- fix(dashboard): landing refuses when ANY process holds a live flight lock
- fix(licensing): make REUSE compliance actually pass
- fix(dashboard): stop duplicating the tip into fly-row action button aria-labels
- fix(flight): scope worktree flightRoot to a flown subfolder's own repo path
- fix: neutralize @-mentions in the KEEPER ritual's base-branch reasoning

## [0.21.0] — 2026-09-03

### Added

- **Public alpha genesis.** The repository went public: full pre-public history
  squashed into a single clean commit (personal data scrubbed by design), branch
  protection + CODEOWNERS + DCO in force, REUSE licensing inventory, THANKS.md
  crediting all 487 dependencies, samples/ (calculator, python-lib) with
  case studies, and the peace discussion opened as Discussions #1.

## [0.20.0] — 2026-09-03

- **KEEPER review: the verify-necessity check no longer tells a contributor
  their PR was "already fixed elsewhere" because the maintainer had it checked
  out locally (epic 0007 slice 4).** The reverse-apply check judged the
  dashboard's own working tree, which nothing guaranteed could stand in for the
  base: after a `gh pr checkout N` that tree IS the PR, so its diff
  reverse-applied cleanly and a false public request-changes posted;
  uncommitted edits could do the same, and the forward `git apply --check`
  named the operator's dirty files as the PR's conflicts.
  `workingTreeStandsInForBase` (`apps/dashboard/src/flight/pr-review.ts`) now
  confirms, only when such a verdict is about to be minted, that the tree is
  clean on tracked paths and its history does not contain the PR's head; a
  tree that cannot stand in leaves necessity not-assessed and names no
  conflict paths. Narrowing-only — it can only withhold a verdict — and not a
  "must be on main" rule, since the canonical checkout runs from a flight
  branch. RUNBOOK §8 records it. Covered by `test/flight/pr-review.test.ts`
  and `pr-review-execute.test.ts`.

- **KEEPER review: a policy-green PR under a reviewer's unresolved review
  thread now queues for a human instead of approve → refused merge → dismissed
  approval on every pass (epic 0007 slice 4).** `.github/branch-protection.json`
  requires conversation resolution, but `gh pr list --json` exposes no thread
  state, so the ritual posted its approve, had the pinned squash refused, and
  dismissed its own dangling approval — on every confirmed execute, forever.
  `annotateReviewThreads` (`apps/dashboard/src/flight/pr-review.ts`) now reads
  every open PR's `reviewThreads` in one `gh api graphql` spend, only when some
  candidate would otherwise merge, and the merge tier's last guard queues an
  unresolved count (naming it) or an unassessed read — both fail-closed,
  narrowing-only, and deduped like every queue verdict; wired into the preview
  read and the execute re-derive alike. RUNBOOK §8's table gains two rows.
  Covered by `test/flight/pr-review.test.ts` and `pr-review-execute.test.ts`.

- **KEEPER review: a human's standing CHANGES_REQUESTED that their own later
  comment-only review masked no longer lets a policy-green PR auto-merge over
  it (epic 0007 slice 4).** The changes-requested guard read only gh's
  `latestReviews` — each reviewer's latest review of ANY state — so a request
  for changes followed by a comment-only follow-up from the same reviewer read
  as COMMENTED and the guard saw no standing "not yet", while GitHub keeps the
  request standing until that reviewer approves or it is dismissed.
  `fetchOpenPrCandidates` (`apps/dashboard/src/flight/pr-review.ts`) now also
  reads the full `reviews` history and recovers each reviewer's standing
  verdict from their latest APPROVED/CHANGES_REQUESTED/DISMISSED entry by
  `submittedAt`; a standing CR from anyone but the viewer (or an unattributed
  one) mints the same queue-for-human flags the `latestReviews` sweep does.
  Additive and narrowing-only: an unreadable history judges nothing. RUNBOOK
  §8's row records it. Covered by `test/flight/pr-review.test.ts`.

- **KEEPER review: a PR with NO gating check reported now queues for a human
  instead of a false "the gate is still running" request-changes (epic 0007
  slice 4).** `deriveGateStatus` (`apps/dashboard/src/flight/pr-review.ts`)
  folded "no checks at all" into `pending`, so the posted reasoning asserted a
  run nobody observed — and on this repo CI triggers only for PRs into `main`,
  so a PR against any other base carried that claim forever, as would a fork's
  first run awaiting approval or a head where only "(optional)" checks report.
  `GateStatus` gains `unreported` for exactly that shape; the decision core
  queues it for MASTERMIND at the gate tier with reasoning naming those
  possibilities instead of presuming one, since none is the author's to fix.
  Narrowing-only (neither verdict merges); RUNBOOK §8's table gains the row.
  Covered by `test/flight/pr-review.test.ts`.

- **KEEPER review: the planned squash-merge never passes `--delete-branch`
  (epic 0007 slice 4).** That flag writes to the LOCAL checkout `gh` runs
  from, not just the remote — it checks out the base branch and
  force-deletes a same-named local branch when one exists. The canonical
  checkout the dashboard runs from sits on a flight branch, so a
  coincidentally-matching local branch could have its working tree switched
  and the branch destroyed as an unannounced side effect of a GitHub-only
  review action. `planPrReviewCommands`
  (`apps/dashboard/src/flight/pr-review.ts`) narrows the merge to exactly
  "squash-merge the reviewed commit, pinned to the reviewed head" and leaves
  the remote branch for a human (or a future remote-only cleanup step) to
  remove. RUNBOOK §8 records the decision. Covered by
  `test/flight/pr-review.test.ts`.

- **KEEPER page upkeep: MODEL-CARD.md's §6 engine-version pointer joins the
  citation generator — the last hand-maintained version surface is gone (epic
  0007 slice 7).** Both the 2026-08-28 and 2026-09-03 upkeep passes had to fix
  that pointer by hand after `pnpm citation:update` refreshed everything else.
  `refreshModelCardEngineVersion` (`scripts/citation/generate-citation.mjs`) now
  rewrites the `| Engine/package version | \`x.y.z\` ...` row from `package.json`,
  `ci:citation --check` fails on drift naming the pointer, and a card that drops
  the row throws instead of silently passing — the sibling `Firing-Prompt-Version`
  row stays untouched because the card's §2 documents that the two version axes
  drift independently. Covered by `test/tooling/generate-citation.test.ts`.

- **KEEPER page upkeep: README's Status "Current version" line joins the citation
  generator, so it can no longer drift behind a release (epic 0007 slice 7).** The
  2026-08-28 upkeep pass fixed that line by hand; three 2026-09-02 releases then
  each ran `pnpm citation:update`, which refreshed the HOW-TO-CITE block and left
  the Status line at `0.16.0` while the block, CITATION.cff, PAPER.md, and
  MODEL-CARD all said `0.19.0` — `ci:citation --check` stayed green throughout
  because it only compared the block. `refreshReadmeStatusVersion`
  (`scripts/citation/generate-citation.mjs`) now rewrites the line from
  `package.json`, `--check` fails on drift and names the line, and a README that
  drops the anchor throws instead of silently passing. README's repository-layout
  rows caught up in the same pass: `packages/mcp` is no longer "(planned)" — it
  ships the read-only retrieval tools and the `autopilot-control` board tools on
  the MCP SDK — and `scripts/ci/` lists its bundle-size / npx-smoke /
  quarantine-report gates. Covered by `test/tooling/generate-citation.test.ts`.

- **🍀 "I'm feeling lucky" launch calibrator: the Fly bar sizes a fleet to what the
  machine can carry right now (`13ef5c9d`; RUNBOOK §12).** The 2026-09-03 incident —
  a blind 8-lane launch pegged the 12-core box at 99% CPU, froze the operator's
  foreground work, and starved the dashboard into its own BE-RIGHT-BACK overlay —
  became a product feature. `flight/lucky-plan.ts` is pure probe→plan arithmetic:
  it refuses when a flight is already up, the board has no queued tasks, free RAM is
  under the 4 GB floor, or CPU is above 85%; otherwise lanes are the minimum of
  three bounds (~2 idle cores per lane, ~1.5 GB free RAM per lane above the floor,
  ≥2 queued tasks per lane), capped at 8, and firings are sized to drain each
  lane's shard, clamped to 2–4 — every bound printed as one reasoning line so the
  operator can audit the dice. `GET /api/lucky` (`server.ts` + `main.ts`) assembles
  the live probe (CPU from a two-sample `os.cpus()` delta since Windows has no
  loadavg, RAM/cores from `os`, running flights from the registry, queued tasks from
  the target folder's board) and rolls the plan; read-only, and a probe failure
  answers 200 with a refusal-shaped plan, never a 5xx. The Fly bar's 🍀 button
  (`shell.ts` + `features/fly.ts`) fills Lanes/Firings/$, paints the reasoning, and
  ends at the Fly button's focus — flying and its quota spend stay the operator's
  click, the same never-auto-launch stance fly-from-dashboard has always had.
  Covered by `test/flight/lucky-plan.test.ts` and new `server.test.ts` cases; triaged
  benign in the flight/ security census.

- **KEEPER PR review neutralizes contributor-controlled @-mentions before they land
  in posted review bodies (`70c99bf3` + `3f24d5c9`, epic 0007 slice 4).** Every
  reasoning string the ritual posts embeds the PR title and any conflicting or
  renamed-from paths verbatim under the founder's own gh login, and GitHub
  linkifies `@name` anywhere in a comment or review body — so a hostile PR titled
  "fix typo @acme/everyone" would have made the ritual ping arbitrary users or
  teams AS MASTERMIND the moment any verdict posted. `planPrReview` now
  neutralizes those fields on an input copy before the split-out `decidePrReview`
  judges it: a zero-width space after any `@` that could start a mention, visually
  identical, idempotent, one choke point ahead of every reasoning template.
  Text-only and decision-blind — no security-sensitive path marker contains `@`,
  so no verdict can change, only what gets posted — and re-run dedup holds because
  the ritual only ever posted neutralized text. The base lane died mid-unit in the
  2026-09-03 machine-relief stop; its checkpoint was collected as wip and the type
  gap it left (`?.map` writing an explicit `undefined` into
  `exactOptionalPropertyTypes` fields) was closed the same morning.

- **UX weakness sweep, cut 3/3 (final): the project page's evaluation stat-tile
  summary stops reading as an unrelated repeat of the trend chart above it
  (`web-mtju8ekq-dlpe9n`, epic 0015).** `evaluationTrendPanel()`'s bar chart and
  `evolutionSection()`'s stat tiles both summarize the exact same
  `evaluationLabelDayCounts` window, but `renderProjectPage()` used to scatter them —
  the card, then the DORA/gate-parallel/warm-sessions panels, all sat between them —
  so the tile row read as a disconnected duplicate rather than the chart's own
  companion. They now render back-to-back, and the tile heading no longer just repeats
  the chart's own "🧬 Evolution" title (now "🧬 Approval summary"). Covered by new
  cases in `evaluation-trend-panel.test.ts`. This closes out all 3 of the highest-impact
  cuts the board task called for (cut 1: the "Contribute upstream" PR form; cut 2: the
  Inbox note form; cut 3: this one).

- **COCKPIT PHASE 0 MEASURE slice 1: three collectors land end-to-end
  (`web-mtettazc-y05162`, epic 0015).** `scripts/cockpit-metrics.mjs` gains
  interaction latency (an INP-p75 proxy: one simulated click per tab-stop
  element, synchronous dispatch duration timed — jsdom never paints, so
  processing duration is the only INP component that exists there), longest
  task (the longest main-thread block among bundle eval, poll-tick drains,
  and interaction dispatches), and token coverage via computed-style census
  (of the declarations whose resting selector matches at least one element
  in a painted render, the share referencing a design token via `var(--*)`
  versus a raw literal). Measured 45–51% token coverage across the
  row/task/lane fixtures at both sizes, with the top raw-value properties
  tabulated to seed the phase-1 drift ledger. Snapshot:
  `docs/EVALUATION-2026-09-02-cockpit-baseline.md`. Only i18n coverage
  remains open from the brief's §5 table.

## [0.19.0] — 2026-09-02

- **E2E landing daemon: a pre-land guard refuses a landing when the converged
  branch's e2e is red (epic 0010 slice 4, operator decision 09-02, "option A"
  of ADR 0008).** `apps/dashboard/src/landing/execute.ts`'s `E2eLandGuard`
  consults epic 0010 slice 2's `ciWorkflowStatus` (the same read-only `gh run
  list --workflow ci.yml` check `dashboard ci-status` already exposes, now
  filterable by branch) for the landing's OWN base branch, right after it
  resolves and before the local gate or any git command runs. Adds zero
  run-time cost per landing — it reads GitHub Actions' already-computed
  result rather than running e2e itself, so the multi-minute-suite objection
  ADR 0008 originally raised against a pre-land e2e trigger does not apply.
  `gh` absent/unauthenticated/no-runs-yet all degrade to "not blocked" — this
  can only refuse on a CONFIRMED red result, never an unknown one. Wired into
  production via `createRealE2eLandGuard()` in `server/main.ts`, so both the
  manual EXECUTE button and the automatic land-watchdog go through it (the
  one shared `createLandingExecuteApi` code path). A refusal persists an
  `e2e-land-block` events row and renders through the LANDING panel's
  existing generic refusal message — no new UI needed. See ADR 0008's
  Amendment section for the full record; an aggregated fleet-card anomaly
  chip for these events is a follow-up, not yet built.

- **UX weakness sweep, cut 1/3: the project page's "Contribute upstream" PR form stops
  rendering fully expanded on every visit (`web-mtju8ekq-dlpe9n`, epic 0015).** Opening a
  PR against the upstream repo is a rare, occasional action, but `renderProjectPage()`'s
  `.github-pr` section showed its title input, details textarea, and submit button on
  every load — an always-open form for something most visits never touch. It now sits
  behind a closed-by-default `<details class="github-pr-details">`, the same disclosure
  shape `soulEditorPanel`'s `.soul-editor` already uses, with a translated
  `🔀 Contribute upstream` summary trigger (`githubPrSummary`, both locales) and the same
  hover/focus/active M3 shape-morph states as other disclosure summaries. Covered by
  `github-pr-disclosure.test.ts`; full a11y suite stays axe-clean.

`github-pr-disclosure.test.ts`; full a11y suite stays axe-clean. The other two
  highest-impact cuts the board task calls for (collapsing duplicate affordances
  elsewhere on the project page) remain open follow-on slices.

## [0.18.0] — 2026-09-02

- **Report unification 1/2: one right-click "📮 Report from here" menu + dialog (epic 0015,
  operator course-correction 2026-09-02).** New `web/features/report-menu.ts` adds a single
  custom context menu, additive alongside the eight existing `reportFromHereSection` panels —
  right-click anywhere outside an editable field opens "📮 Report from here"; picking it shows
  one dialog with the capture already resolved (element, owning region + module sources,
  DOM/CSS snapshot, recent console errors) so the operator only types a description and picks
  an action. Reuses `report-panel.ts`'s preview/confirm/execute functions and
  `report-capture.ts`'s formatter via `.toString()` splicing (no drift from the eight panels'
  existing UX); reads `report-capture-client.ts`'s existing capture instead of re-listening for
  `contextmenu`. Shift+right-click and right-clicks on `input`/`textarea`/`select`/
  `[contenteditable]` keep the browser's native menu. Removing the eight old panels and
  switching `shell.ts`'s regions to a direct `data-report-region` attribute is unification 2/2,
  its own slice.

## [0.17.0] — 2026-09-02

- **D1 tab-stop roving: the fleet-wide live-workers chip strip stops adding one Tab
  stop per lane (`web-mtd1wyte-ssntzi`, epic 0015).** Measured 08-28
  (`scripts/cockpit-metrics.mjs`, "lane" axis): 8.0 Tab stops added per concurrent
  lane, because every `#live-workers` chip got `tabindex="0"`. Now only the chip at
  the roving index is a Tab stop (`tabindex="0"`); the rest are `tabindex="-1"` and
  reachable via Left/Right/Home/End, the standard roving-tabindex technique — the
  strip contributes one Tab stop total regardless of lane count. Mouse/programmatic
  focus also moves the roving stop (APG recommendation), so Tabbing away and back
  lands where the user last was. This slice covers the `lane` axis only — the `row`
  (fleet card chip strips, 25.0 stops/row) and `task` (task board, 4.4 stops/task)
  axes, plus the heatmap grid and sparkline chart bars the board task also names,
  stay open for follow-on slices.
- **D1 contrast matrix: every token pair's WCAG ratio, gated per theme (`web-mtd1wmrg-9w5bk7`).**
  `contrastMatrix()` (`packages/tokens/src/color.ts`) classifies all 153 unordered pairs among
  `@autopilot/tokens`' 18 semantic color tokens — `text` (≥4.5:1), `large` (≥3:1), or `fail` —
  per theme, reusing the existing OKLCH→WCAG `contrastRatio()` core. `contrast-matrix.test.ts`
  records today's failing-pair set per theme as a ratchet baseline: a future theme edit that
  drops a previously-passing pair below 3:1 fails the gate instead of shipping unnoticed, the
  way `.flight-slice-chip`'s accentText-on-surface defect did. `surface`/`accentText` is
  asserted as the confirmed double-duty pair in every theme. `scripts/cockpit-metrics.mjs`
  reports the same per-theme summary into `docs/EVALUATION-2026-08-28-cockpit-baseline.md` for
  the epic 0015 record.

## [0.16.0] — 2026-08-28

- **Node floor raised 22.13.0 → 22.23.2 (`web-mt7et663-uus71l`).** `.nvmrc`
  and `package.json`'s `engines.node` both move to the current v22 LTS
  patch, clearing the documented unblock condition for the
  `better-sqlite3` v13 segfault (a Node runtime regression, fixed in
  `22.14.0+` — see `docs/RESEARCH-LIBRARY.md` "Node 22.13.0 → 22.23.2").
  `better-sqlite3` itself stays on `^12.11.1` — the actual v13 re-test
  needs a process running the new floor, which no environment has done
  yet.

## [0.15.0] — 2026-08-24

## [0.14.0] — 2026-08-23

- **Landing overlap detector: pure-insertion hunks are no longer invisible
  (`web-msw5zxfi-oa2olf`).** `parseHunkRanges`
  (`packages/engine/src/adapters/git.ts`) dropped any `,0` old-side hunk, so a
  file where two siblings each edited *different* lines but inserted at the
  *same* base point — the classic both-append collision, exactly what a fleet
  sync merge like specimen `f21c003` trips over — measured as non-overlapping
  and cleared `narrowToHunkOverlap` into a blind merge conflict. A pure
  insertion is now recorded as the old-side boundary span it touches
  (`{start: N, end: N + 1}` for "inserted after line N", `N = 0` at
  top-of-file), matching git's own refusal to auto-merge same-point or
  abutting insertions. Side benefit: a brand-new file measures as `{0, 1}`
  instead of leaning on the narrower's "unmeasurable → keep" fallback.

- **Flaky-test quarantine — groundwork before browser E2E lands its inherent
  flake risk (`web-msnsqjc7-tg8lqv`).** `scripts/ci/detect-flaky.mjs` is an
  on-demand repeat-run sampler (`pnpm run detect-flaky -- <file> [runs=5]`):
  runs a suspected test file N times, tallies real pass/fail per run (no
  retry-to-green — that would hide flakiness instead of detecting it), and
  reports FLAKY only on a genuine flip. Deliberately not wired into `verify`
  or CI itself — repeating the whole suite N times there would multiply cost
  for every run, not just the rare flaky one. `config/quarantine/flaky-tests.json`
  is the quarantine list (`testPath`/`owner`/`reason`/`addedDate`, starts
  empty — no test is confirmed flaky yet); `scripts/ci/quarantine-report.mjs`
  validates its shape and reports it in verify output (wired as
  `ci:quarantine-report`, the last `verify` step) — detection-only, it never
  skips or allow-fails a quarantined test, matching the config-gate pattern
  `validate-configs.mjs` already established. Documented in
  `.github/CONTRIBUTING.md`'s new "Flaky tests" section. Manually verified
  cross-platform: the sampler's first pass invoked `pnpm` via `execFileSync`
  directly, which is an ENOENT on Windows (`pnpm` resolves to a `.cmd` shim) —
  fixed by routing through `cmd.exe /c`, the same fix already proven in
  `packages/engine/src/adapters/gate.ts`'s `buildInvocation`.

- **WebFetch SSRF guard narrows the DNS-rebinding gap (`docs/THREAT-MODEL.md` T6, free pick).**
  `checkWebFetchTarget` (`packages/engine/src/guard.ts`) only ever judged a WebFetch URL's
  literal hostname, so a hostname that names no loopback/private/link-local address but
  *resolves* to one at request time sailed past it — a documented, still-open residual risk.
  New `checkWebFetchDnsRebinding` resolves the hostname (behind an injected `DnsResolver` for
  unit-testability) and denies if ANY resolved address is loopback/private/link-local, same
  address-space rules as the literal check (`isLoopbackOrPrivateHost`, shared by both). Wired
  into `guard-hook.ts` — the one place in this file that already does real I/O (the pre-commit
  sibling scan) — behind the real `dns.promises.lookup`, running only after the zero-I/O
  literal check has already passed. Honest scope, stated in both the code and the threat
  model: this is not a full TOCTOU fix — a zero-TTL DNS record could still answer public here
  and private moments later when Claude Code's own WebFetch implementation performs its own,
  independent lookup to actually fetch, and this guard has no way to pin that downstream
  request to the address it resolved. `guard-hook.ts`'s stdin handler is now async (needed to
  `await` the lookup); every `process.exit(0)` call gained an explicit `return` alongside it,
  since the DNS check can now be reached after an `await`, so the shim can no longer lean on
  `process.exit`'s (mocked, in tests) real-Node behavior of never returning to enforce control
  flow. `THREAT-MODEL.md` T6 updated to describe both check layers and the honest residual
  gap. 12 new tests (`guard.test.ts`'s `checkWebFetchDnsRebinding`/`extractWebFetchUrl`,
  `guard-hook.test.ts`'s mocked-`dns.promises.lookup` end-to-end wiring); full gate green
  (typecheck/lint/format:check/build, 152/152 guard-related tests, 774/774 impacted tests).

- **Cross-OS operator launchers reach real parity across all three operating
  systems (`web-msnsqj7t-pwdyra`).** `SETUP`/`START`/`STOP`/`RESTART`/
  `STATUS-DASHBOARD.cmd` were Windows-only, leaving macOS/Linux operators with
  no double-click-adjacent onramp. Matching `.sh` scripts (`f8bad7ae`) now
  mirror each `.cmd`'s behavior exactly, with the executable bit committed
  (`git update-index --chmod=+x`, since `core.filemode` is false on this
  checkout) and the README documenting both tiers side-by-side — the named
  deliverable (`.sh` equivalents + executable bits + README coverage) is
  complete. One adjacent parity gap was found while closing this out — the
  SUICIDE GUARD backstop (`packages/engine/src/guard.ts`'s
  `DASHBOARD_STOP_RESTART_RE`) recognized only `stop/restart-dashboard.cmd`,
  so a flight invoking the new `.sh` equivalents on macOS/Linux would have
  slipped past that textual backstop. The PRIMARY defense
  (`DashboardControl.stop()`/`restart()` refusing outright under
  `AUTOPILOT_FLIGHT=1`) held regardless, so this was a defense-in-depth gap,
  not an open hole — now closed: the regex matches `stop/restart-dashboard.sh`
  too, covered by `packages/engine/test/guard.test.ts`'s SUICIDE GUARD case.

- **Release automation gains an optional `gh release create` step
  (`web-mss4lpwl-z0w495`, "GITHUB 3/5 - maintainer release flow," epic
  0006 slice 3).** RELEASE EXECUTE already cut `package.json`/`CHANGELOG.md`,
  committed, and tagged locally — the git tag never reached GitHub. An
  operator opting into the RELEASE panel's new "Also publish as a GitHub
  Release" checkbox now also gets that ONE `v<version>` tag (never the
  branch — that stays the separate "Sync to GitHub" action) pushed to the
  project's remote, then `gh release create --notes-from-tag` turns it into
  a real GitHub Release using the annotated tag's own message, never
  fabricated text (`release/execute.ts`'s `publishGithubRelease`, reusing
  `github/execute.ts`'s injectable `CommandRunner`). Refuses up front with a
  non-fatal note when the project has no GitHub remote configured yet; a
  failed push or a failed `gh release create` never flips the release's own
  `ok`/`reason` — same non-fatal-degradation stance as the existing
  attestation/milestone-tag legs. Covered by
  `test/release/execute.test.ts`, `test/web/release-panel-confirm.test.ts`,
  `test/web/release-panel-result.test.ts`, and `test/server/server.test.ts`.

- **Stale VERIFY-BY proposals now self-prune (`web-mt1qajrv-ukabrc`,
  "META-LEARNING GAP — SOUL/LESSON PRUNE," lesson-bank half, slice 2).**
  The mint-side dedup guard (`fly.ts`'s `openVerifyByProposal` LIKE-prefix
  check) refuses to re-propose a research-library section while ANY open
  proposal for its title already exists — correct for suppressing repeat
  proposals of the SAME due date, but once a human edits the doc's own
  `verify by` date (re-verifying and pushing it out, or just correcting it),
  `verifyByTaskId` mints a different id and the OLDER proposal — now
  describing a due date the doc no longer asserts — was never superseded: it
  just sat `needs_approval` forever, silently blocking a fresh, accurate
  proposal from ever surfacing. `findStaleVerifyByProposalIds`
  (`apps/dashboard/src/flight/verify-by.ts`) is the removal counterpart to
  `findDueVerifyByNotes`: given the ids of every currently-open proposal and
  the notes presently due, it returns the ids that no longer match any
  current note. `fly.ts`'s post-flight sweep defers (never deletes) each —
  the same non-destructive, reversible contract the NOOP→VERDICT auto-defer
  already uses — and only ever touches `needs_approval` rows: once an
  operator has approved one into `queued`, its fate is the operator's call,
  not this sweep's. Fully tested (`apps/dashboard/test/flight/verify-by.test.ts`,
  5 new cases); full gate green (typecheck/lint/format:check/build,
  354/354 test files, 5721/5721 tests).

- **VERIFY-BY findings become an actionable board task (`web-mt1qajrv-ukabrc`,
  "META-LEARNING GAP — SOUL/LESSON PRUNE," lesson-bank half) — shipped
  earlier, documented this pass.** `findDueVerifyByNotes`
  (`apps/dashboard/src/flight/verify-by.ts`) already parsed
  `docs/RESEARCH-LIBRARY.md`'s dated "verify by YYYY-MM-DD" headings, but a
  due note only ever printed a console line during the flight — easy to
  miss entirely if nobody was watching that flight live. `verifyByIdPrefix`/
  `verifyByTaskId` let `fly.ts`'s post-flight sweep also propose it as a
  durable `needs_approval` board task, reusing the same self-mined-proposal
  approval gate `doc-freshness`/closed-task-audit already use. Dedup keys on
  the note's title plus its OWN verify-by date, never a sweep-run timestamp
  (the identity-not-timestamp doctrine the DOC-FRESHNESS 40-duplicate-proposal
  incident recorded), so an unedited entry re-derives the same id every
  flight and only a human editing the doc's date mints a fresh proposal.
  Conflicting-heuristic detection (the doctrine's other named gap) stays
  open — semantic contradiction detection isn't a deterministic slice.
  Fully tested (`apps/dashboard/test/flight/verify-by.test.ts`).

- **DOC-FRESHNESS drift tracker (`web-msnsjxqu-25trfq`) now covers epic
  0011 (ARCHITECT chat v2).** `DOC_SUBJECTS`
  (`apps/dashboard/src/flight/doc-freshness.ts`) tracks every other shipped
  or active epic doc against a well-defined subject-path area, but epic
  0011 was missing entirely even though all three of its slices landed
  (`a887ed3` control-execute wiring, `a3f84dc` persona toggle, `468129b`
  action-card rendering) — meaning the post-flight sweep could never flag
  this doc as stale no matter how far its code drifted. Added with the
  confirm-gated execute endpoint (`flight/control-execute.ts`) and the
  ARCHITECT proposal parser (`ask/architect-proposal.ts`) as its subject
  area — narrower than the shared Ask panel client (`web/features/search.ts`)
  that hosts them, which epic 0002's broader `web/` entry already tracks.
  Epic 0005 (cockpit redesign) stays deliberately excluded: its scope
  overlaps epic 0002's entry with no equally narrow subject path of its
  own. `test/flight/doc-freshness.test.ts`'s existing `DOC_SUBJECTS`
  pin and real-path-existence tests updated to match; full gate green
  (typecheck/lint/format:check/build, 350/350 test files, 5630/5630 tests).

- **Evolution (operator evaluation trend) panel now colors bars by majority
  verdict and reuses the canonical tip text.** The panel's shell embed
  (`evaluationTrendPanel`, `apps/dashboard/src/web/shell.ts`) landed via an
  earlier merge that resolved a "twin implementation" conflict, but the
  version that won never applied the `eval-approve`/`eval-reject` CSS
  modifiers `layout-css.ts` already defines (green/red fill) — every
  non-empty week rendered as a plain, uncolored bar, so a bad week didn't
  read as red at a glance the way the design intended. It also hand-rolled
  its own per-week tip text instead of reusing `evaluationTrendWeekTip`
  (`web/evaluation-trend.ts`), risking drift from the one other caller of
  that function. Both fixed; `test/web/evaluation-trend-panel.test.ts`'s
  `describe.skip` (left skipped since the shell file was claimed mid-merge)
  is unskipped and green, closing a verification gap on a panel that was
  already live and axe-scanned but never actually asserted against its own
  spec.

- **Closed a machine-budget hole for no-instanceId concurrent spawns (STPA
  finding `web-mt1qa7ij-c6wqgi`).** `spawn-flight.ts` only applied the fleet
  vitest-worker cap (`VITEST_MAX_FORKS`/`VITEST_MAX_THREADS`) when a spawn
  carried an `instanceId`, on the assumption that's the only way flights run
  concurrently — but `FlightRunnerRegistry` can run flights against many
  different folders at once too, so a "base" (no-instanceId) flight starting
  while other folders were already flying escaped the cap entirely, even
  though the registry's own live running count already knew it was
  concurrent. `FlightRunnerDeps['spawnFlight']` gains an optional 7th
  `siblingsFlying` parameter; the registry (`flight/registry.ts`) computes it
  from `#runningCount()` (read before the new runner's own status flips to
  running, so it reflects other flights only) and forwards it. `spawn-flight.ts`
  now caps the vitest workers whenever EITHER `instanceId` is set OR
  `siblingsFlying` is true — solo (neither) stays uncapped, unchanged. Fully
  tested (`apps/dashboard/test/flight/registry.test.ts`,
  `apps/dashboard/test/flight/spawn-flight.test.ts`).

- **Tasks card gains a queue-drain forecast (`web-msnsxugi-99uxhx`, "Queue forecast") —
  landed across two earlier firings, documented this pass.** `queueForecastMeta`
  (`apps/dashboard/src/web/task-queue.ts`) extrapolates from the recent flight-log
  window (`QUEUE_FORECAST_WINDOW` = 20 firings): counts only `completion === 'complete'`
  endings toward the pace, since a "slice" advances a task but doesn't drain the
  queue — counting it would overpromise — then reports "Queue drains in ~N firings /
  ~$X" at the resulting pace and average cost, or an explicit "unknown" line when zero
  tasks completed in the window, never a guess or `∞`. Renders in the Tasks card
  header (`apps/dashboard/src/web/shell.ts`) as a keyboard-reachable (`tabindex="0"`),
  `aria-label`'d line whose tooltip spells out the honest basis ("a pace extrapolation,
  not a promise — task sizes vary, so this moves every firing"). Fully tested
  (`apps/dashboard/test/web/task-queue.test.ts`).
- **LANDING OVERLAP DETECTOR narrows to actual line-hunk overlap
  (`web-msw5zxfi-oa2olf`, precision slice).** The detector's original shape
  flagged any sibling branch touching the SAME FILE this landing is about to
  merge, even when the two touches sit in disjoint parts of the file (e.g.
  opposite ends of an 800-line module) — noisy, since git would merge those
  cleanly with no real collision. `GitVcs.changedLineRanges`
  (`packages/engine/src/adapters/git.ts`) parses a `--unified=0` diff into
  each file's OLD-side line ranges (the coordinate system every sibling
  shares, since all diverge from the same base tip); `narrowToHunkOverlap`
  (`packages/engine/src/landing.ts`) filters `detectLandingOverlap`'s
  file-level candidates down to files whose ranges actually intersect, KEEPING
  a file it can't measure (binary, failed diff) as a warning rather than
  clearing it. `gatherLandingOverlaps` (`apps/dashboard/src/landing/overlap.ts`)
  wires it in: only gathers line ranges once a file-level candidate exists, to
  avoid extra git calls on the common no-overlap path. New regression tests
  prove both directions with real git commits — disjoint-line edits to the
  same file are suppressed, overlapping-line edits still flag. 15 engine
  landing tests + 9 dashboard overlap tests + 6 new `changedLineRanges` git
  adapter tests, all green.

- **TRIAGE mode's detected issues now carry a concrete suggested remedy
  (`web-msnioxgz-emkgca`, "Generic-folder competence," detect+fix slice).**
  `FolderIssue` (`packages/onboarding/src/onboard/detect-issues.ts`) gains a
  `suggestion` field alongside its `description` — e.g. "Move the likely-duplicate
  file(s) into a `_duplicates/` folder for review — do not delete anything
  unasked." `generateStarterSoul`'s "## Detected issues" section
  (`onboard/soul.ts`) now renders that remedy under each finding. Still
  propose-only, by design and permanently: this pure package works off a
  read-only `FsSnapshot` and can never touch the folder it inspects, and the
  TRIAGE-mode SOUL's own operating rule bans unasked file moves — physically
  applying a fix needs a real human-triggered approve-then-act UX (the existing
  SOUL-proposal ratify/dismiss flow only executes text edits today, not
  filesystem mutations), which stays a distinct, larger, separately-scoped
  capability outside this core rather than a natural next slice of it. Full gate
  green (typecheck/lint/format/build/test).

- **SOUL amendments can now be retracted, not just mined (`web-mt1qajrv-ukabrc`,
  "META-LEARNING GAP — SOUL/LESSON PRUNE," slice 1).** `pruneSoulAmendment`
  (`apps/dashboard/src/flight/soul-mining.ts`) is the removal counterpart to
  `mineSoulAmendment`: the recurring-checkpoint note it mines asserts a specific,
  checkable fact — "the last N firings hit the cap mid-unit" — that goes stale the
  moment a clean ship breaks that streak. Once the SOUL carries the note but the streak
  it describes no longer holds, `pruneSoulAmendment` proposes the SOUL with that section
  cut out, through the exact same `soul_proposed`/ratify-or-dismiss slot `mineSoulAmendment`
  writes to (`fly.ts`'s post-flight sweep now calls both off one snapshot; they're
  mutually exclusive by construction, so at most one ever proposes). Pruning is never
  automatic — same locked-by-default/operator-ratifies contract as every other SOUL
  change, and it reuses the already-shipped ratify/dismiss UI rather than adding new
  surface. Deliberately narrow, mirroring `mineSoulAmendment`'s own scope: it only knows
  how to retract the one note type mined so far. Broader "prune stale/conflicting
  heuristics across the lesson banks" stays a follow-up slice. Full gate green
  (typecheck/lint/format/build); 13/13 tests pass (5 new).

- **TRIAGE mode detects likely-duplicate files (`web-msnioxgz-emkgca`, "Generic-folder
  competence," slice 4) — landed in an earlier checkpoint, verified this pass.**
  `detectIssues` (`packages/onboarding/src/onboard/detect-issues.ts`) scans a non-code
  folder's `FsSnapshot` for filename-copy markers (`"report (1).txt"`, `"Copy of photo.jpg"`,
  `"notes-copy.md"`) and flags them ONLY when their canonical sibling (same directory,
  marker stripped) is also present — a lone marked file with no original alongside it isn't
  evidence of an unresolved duplicate, so it's left alone. Wired into `generateStarterSoul`
  (`onboard/soul.ts`) as a new "## Detected issues (proposal only — review before acting)"
  section, reusing the SOUL doc as TRIAGE mode's established UX-expression surface (same
  pattern as slice 2's "Suggested organization"). Propose-only, matching the TRIAGE-mode
  SOUL's own operating rule against unasked file moves — actually touching files ("fix")
  stays its own follow-up slice: resolving a flagged duplicate needs a real approve-then-act
  UX (the existing SOUL-proposal ratify/dismiss flow only executes text edits today, not
  filesystem mutations), which is more than one firing's scope. Full gate green this pass
  (typecheck/lint/format/build/test); 18/18 new tests pass.

- **WebFetch SSRF guard (`docs/THREAT-MODEL.md` T6): closes the loopback/private-network blind spot.**
  `checkWebFetchTarget` (`packages/engine/src/guard.ts`), wired into `evaluateHookInput`'s `WebFetch`
  branch and `buildFlightSettings`'s new `WebFetch` `PreToolUse` matcher, denies a flight's `WebFetch`
  when its URL targets loopback (`localhost`/`127.0.0.1`/`[::1]`/`0.0.0.0`), an RFC 1918 private range,
  or a link-local address (`169.254.0.0/16`, which includes the cloud instance-metadata endpoint
  `169.254.169.254`, a classic SSRF-to-credential-theft target). Previously `WebFetch` had no target
  check at all — a flight could reach the dashboard's own loopback API (T8: same access as an operator)
  or scan the local network with no guard in the way. Pure URL-literal analysis, same honest scope as
  the rest of the guard: no DNS resolution, so a hostname that resolves to a private address only at
  request time isn't caught here — the detection audit remains the backstop for that class.
  `THREAT-MODEL.md` T6 updated from "Open" to "Partial" to match. 106/106 guard tests green.

- **LANDING OVERLAP DETECTOR (`web-msw5zxfi-oa2olf`) — verify pass finds and closes a solo-instance
  blind spot.** The detector itself (`detectLandingOverlap`, `packages/engine/src/landing.ts`;
  `gatherLandingOverlaps`, `apps/dashboard/src/landing/overlap.ts`; wired end-to-end through
  `read/source.ts` into an accessible `role="alert"` warning row in the LANDING card,
  `web/landing-panel.ts` + `web/shell.ts`) landed in an earlier checkpoint. Verifying it against
  `flight/worktree.ts`'s own `deriveWorktreePlan` surfaced a real gap: `deriveWorktreePlan` emits
  a BARE `autopilot/flight-worktree-<projectId>` branch (no `--<instanceId>` suffix) for a
  solo/base instance with no `instanceId`, but `siblingBranchNames`'s `for-each-ref` glob required
  a literal `--` suffix — a solo sibling's own unlanded work touching the same files went
  completely undetected. Fixed by querying both branch shapes (`for-each-ref` ORs multiple
  patterns together) rather than widening the glob to a bare prefix, which would have
  false-matched an unrelated project id sharing that prefix. New regression test: "flags the
  solo/base instance branch (no --instanceId suffix) as a sibling too"
  (`apps/dashboard/test/landing/overlap.test.ts`), confirmed red against the prior glob before the
  fix. 148/148 landing-related tests green.

- **Mutation testing widens to `routing.ts` (`web-msnswvcq-viays2`), the pure cost-aware
  routing decision M6 GOLD's local/cheap offload (`web-msnt2j50-wk2lxy`, ENGINE-RESEARCH
  I2) landed across the last several firings.** A surviving mutant here could mean a
  mechanical substep silently escapes to a paid top-tier model, or — worse — the fail-safe
  default flips so an *unrecognized* label routes to local/cheap instead of escalating to
  top, exactly the "misroute must fail safe" property ENGINE-RESEARCH §7 calls out. Same
  zero-import, fake-driven shape as `resilience.ts`/`otlp.ts`'s precedent. Started at 96.15%
  with one survivor: `selectModelForSubstepLabel`'s `isSubstepKind` guard, forced to
  `false`, is unobservable by any test because `modelForTier`'s own final branch already
  returns `config.topModel` on the fallthrough for any tier that isn't `'local'`/`'cheap'`
  — two independent layers intentionally agreeing on the same fail-safe default, not a gap.
  Marked with a `// Stryker disable next-line ConditionalExpression` comment (`rank.ts`'s
  precedent for a provably-equivalent guard). Score is 100%. New
  `stryker.engine-routing.config.mjs` + `vitest.engine-routing.config.ts`, wired into
  `mutation:engine-routing` and auto-discovered by `pnpm run mutation`.

- **Executable DELIVERABLE predicates — a false "complete" can no longer close a measurable
  claim (the UNLOCK A lesson; RESEARCH-LIBRARY "Goodhart in the firing loop").** The
  DELIVERABLE verifier's vocabulary check can confirm a claim is *mentioned*, never that it
  is *met* — a task demanding "shell.ts under 300 lines" was closed at ~5,000 lines because
  the shipping patch shared its words. New `flight/deliverable-predicates.ts` parses the
  measurable claims a clause carries (a closed, read-only DSL — `wc -l <path> under N`,
  `<file> under N lines`, `<path> exists`; never arbitrary commands, titles arrive from the
  API and agent proposals) and **executes them against the tree at HEAD** before
  `markTaskDoneIfShipped` trusts a `"completion":"complete"` claim: a failed — or
  unverifiable (missing file, ambiguous bare basename) — measurement demotes the claim to a
  slice, no matter how plausible the patch looks. `GitVcs` gains the two read-only probes
  (`showFile`, `lsFiles`); the module ships mutation-tested at 100/100 (136 mutants,
  `stryker.dashboard-deliverable-predicates.config.mjs`).

- **Fresh-machine field report adopted (a second Windows box, first-ever external install).**
  Four real defects a friend's install surfaced, all reproduced-or-verified here and fixed:
  `better-sqlite3` bumped `^11 → ^12.11.1` (v11 has no Node 24 prebuild — install fell through
  to node-gyp demanding a C++ toolchain); real-git test suites gained a 30s `testTimeout`
  (they flaked on Vitest's 5s default — affects windows-latest CI too); the
  `ci:no-personal-paths` gate is green again (guard.test.ts's containment fixtures now build
  their drive-path strings at runtime via the file's `p()` helper instead of literals — the
  gate stays exactly as strict); and every place that told users to run `corepack enable pnpm`
  — the exact command that EPERMs without admin on a Program Files Node — now points at
  SETUP.cmd / `npm install -g pnpm` instead (README quickstart + 4 launcher .cmd hints).
  README's staleness fixed along the way: "Current version" said **0.8.0** (reality: 0.13.0),
  M3 still read "in progress" (closed at v0.10.0; M4 row added), and `pnpm citation:update`
  re-synced CITATION.cff + both "How to cite" blocks.

## [0.13.0] — 2026-08-13
- **VERIFY DIET — `pnpm run verify` no longer chains all 74 Stryker mutation runs
  (`web-mssloovx-4c1kpy`).** `verify` had drifted from its own documented contract:
  README.md and `.github/CONTRIBUTING.md` describe it as "typecheck · lint · format ·
  test · build · CI validators" but the actual script also chained every
  `mutation:*` target — an hours-long run nobody in practice was invoking locally.
  The 74 mutation steps move to a new standalone `pnpm run mutation` script; `verify`
  now matches what it already claimed to be and finishes in the time developers expect
  from a pre-commit gate. Mutation testing remains available on demand (nightly/on-touch
  CI wiring is a follow-up, not required for this fix) via the new script.

- **PARALLEL — the firing prompt gains a delegation doctrine (`firing-v9`, `web-msns36am-dr7fru`).**
  On a unit of work that splits cleanly into 2-4 FILE-DISJOINT subtasks, the prompt now tells the
  firing to spawn one Agent/Task per subtask instead of working them all serially — hub files,
  consolidation, the gate run, and the single commit stay with the lead; each subagent gets briefed
  like a new collaborator with the goal, its exact files, and constraints stated explicitly.
  `packages/engine/src/prompt.ts` (`buildFiringPrompt`) and the onboarding starter SOUL generator
  (`packages/onboarding/src/onboard/soul.ts`) both gain the doctrine; `docs/MODEL-CARD.md`'s
  Firing-Prompt-Version pointer is bumped to match.

- **DEATH-COST capture (`web-msr0ug19-2757ub`, EVALUATION §3.6) — checkpoint deaths no
  longer record $0/0 turns.** When the CLI child is killed before its terminal `result`
  event arrives (timeout, turn-budget SIGTERM), the envelope is null and the firing's real
  spend used to vanish into a fabricated costless row. `StreamingClaudeCliModel` now keeps
  the last `assistant`-event usage snapshot seen on the wire (`ports.ts`'s `PartialUsage`,
  `stream.ts`'s `usageFromEvent`) and rides it along as `ModelResponse.partialUsage`;
  `firing.ts`'s `envelopeFacts` falls back to it for `model`/`numTurns`/`tokensIn`/
  `tokensOut` only when the envelope itself is missing. Cost itself stays `null` — never
  invented from tokens without a pricing table to trust. Covered end-to-end: the adapter
  test proves the snapshot survives a SIGTERM, and a new `runFiring` test proves a
  checkpoint-death record persists the real observed turns/tokens instead of nulls.

- **EVALUATION — the first full six-dimension retrospective over the whole flight record
  (`docs/EVALUATION-2026-08.md`).** 358 firings / $1,056 / 91.1% ship rate mined across
  efficiency, modularity & architecture, usability, accessibility, security, and telemetry
  honesty. Verdict: the verification spine and process discipline are at/above 2026 SOTA;
  the remaining gap concentrates in four named places — isolation substrate (Bash
  uncontained, SOTA-MAP A4), cost routing (100% sonnet-5 monoculture, $/ship plateaued at
  ~$3.24 vs a proven $2.41 floor), client modularity (five files over the repo's own
  800-line law, `shell.ts` at 4,761), and multi-project parallelism (epic 0001, in
  flight). Epic 0002 (`docs/epics/0002-shell-decomposition.md`) specs the modularity fix —
  ES-module client split that also satisfies BUNDLE DIET's DELIVERABLE at the original
  budgets and deletes the hand-sync duplication pattern. Freshly found and seeded: the
  $0-checkpoint telemetry leak (3 deaths recorded costless — a crack in un-fakeable
  telemetry), guard denials absent from the events store, and onboarding's test-file gap
  (17:32). Everything else the evaluation surfaced was already queued — deliberately not
  duplicated.

- **Mutation testing widens to `landing.ts` (web-msnswvcq-viays2), the LANDING card's
  gate-then-merge EXECUTE policy.** Eleventh module wired after store's `rank.ts`/`schema.ts` and
  engine's `release.ts`/`pace.ts`/`containment.ts`/`inbox.ts`/`repo-map.ts`/`auth.ts`/`ask.ts`/
  `prompt.ts`/`resilience.ts` — a surviving mutant here could mean a red gate silently stops
  short-circuiting and a merge is attempted on unverified work, or a merge failure gets silently
  reported as success. `landing.ts`'s only non-type import is `./ports.js` (types only) plus a
  type-only `LandResult` from `./adapters/git.js` (erased at compile time, no runtime dependency
  on the real git adapter's subprocess calls), and its test file drives it entirely through fake
  `GatePort`/`Landable` objects. Started green: 100% on the first run, all 16 mutants killed, 0
  survivors — the existing `toEqual`-exact-shape test suite already covered every branch
  (red-with-details, red-without-details, landed, merge-failed). New
  `stryker.engine-landing.config.mjs` + `vitest.engine-landing.config.ts`, wired into
  `mutation:engine-landing` and `verify`. Widening further remains open under the same backlog id.

- **Mutation testing widens to `resilience.ts` (web-msnswvcq-viays2), the model-quota resilience
  state machine.** Tenth module wired after store's `rank.ts`/`schema.ts` and engine's
  `release.ts`/`pace.ts`/`containment.ts`/`inbox.ts`/`repo-map.ts`/`auth.ts`/`ask.ts`/`prompt.ts`
  — same zero-import, fake-driven shape those nine configs target, and the module its own file
  header calls out as "the engine's hardest-to-reason-about behavior": a surviving mutant here
  could mean promote-on-exhaustion, time-based re-probe, or escalating hibernation silently
  breaks, so a live firing either wastes calls hammering an exhausted model or hibernates for the
  wrong duration while the gate stays green. Started at 97.01% with 2 survivors — both in
  `QUOTA_PATTERN`'s `.?` (zero-or-one) joins in `usage.?credit` and `you.?ve reached`, where
  existing probe strings all had a real separator character present so `.?` and `. ` (mandatory)
  behaved identically. Closed with two probes that omit the separator entirely
  (`"usagecredit exhausted"`, `"youve reached the cap"`), which only match under the true
  zero-or-one form. Score is 100%. New `stryker.engine-resilience.config.mjs` +
  `vitest.engine-resilience.config.ts`, wired into `mutation:engine-resilience` and `verify`.
  Widening further remains open under the same backlog id.

- **Mutation testing widens to `prompt.ts` (web-msnswvcq-viays2), the firing prompt every live
  autopilot actually runs.** Ninth module wired after store's `rank.ts`/`schema.ts` and engine's
  `release.ts`/`pace.ts`/`containment.ts`/`inbox.ts`/`repo-map.ts`/`auth.ts`/`ask.ts` — same
  zero-import, fake-driven shape those eight configs target: a surviving mutant here could mean
  a hard rule (containment, additive-only git, the un-fakeable METRICS line, the FOCUS MODE
  lock) silently stops reaching the agent while the gate stays green. Started at 53.82% with 115
  survivors — almost the entire file is literal prompt text that `.toContain`/`.toMatch` checks
  only sampled, so most of the doc's static lines, join separators, and `.trim()` calls on
  `soul`/`lastFailure`/`repoMap`/`inbox` were free to be emptied, duplicated, or corrupted
  unnoticed. Closed nearly all of it with full-array `.toEqual(p.split('\n'))` pins — a
  kitchen-sink case (every optional field populated, with padded whitespace to catch trim
  removal) plus one exact pin per mutually-exclusive board branch (empty+backlog, empty-bare,
  FOCUS MODE, capped/truncated, and the fully bare-minimal case) — since only exact-array
  equality catches a single literal line silently swapped for `''` or `"Stryker was here!"`.
  Remaining gaps needed targeted cases: whitespace-only `lastFailure`/`repoMap`/`inbox` (truthy
  but blank, so only the `.trim() === ''` half of each guard actually catches it — asserted via
  exact equality against the omitted-field baseline, since a weakened guard only leaks a stray
  blank line, never new header text); `maxTurns` of `NaN`/`0`/`-5` (the turn-budget guard's `||`
  chain has a redundant first clause — `maxTurns === undefined` always implies
  `!Number.isFinite(maxTurns)` — needed only for TypeScript's narrowing before `Number.isFinite`,
  so it's a provably equivalent mutant marked with a `// Stryker disable next-line` comment,
  same convention as `release.ts`); and a >10-item FOCUS MODE board to catch a missing
  `.slice(0, BOARD_MAX_TASKS)`. Score is 100%. New `stryker.engine-prompt.config.mjs` +
  `vitest.engine-prompt.config.ts`, wired into `mutation:engine-prompt` and `verify`. Widening
  further remains open under the same backlog id.

- **Mutation testing widens to `ask.ts` (web-msnswvcq-viays2), the retrieval-augmented ask
  prompt's injection defense.** Eighth module wired after store's `rank.ts`/`schema.ts` and
  engine's `release.ts`/`pace.ts`/`containment.ts`/`inbox.ts`/`repo-map.ts`/`auth.ts` — same
  zero-import, fake-driven shape those seven configs target, and a security-sensitive one: a
  surviving mutant here could mean the fence that keeps untrusted repo excerpts and chat
  history from being read as instructions (REACTIVITY §1/§5) silently stops working. Started
  at 55.74% with 27 survivors: the `defang()` helper's zero-width-space substitutions
  (`'<​<​<'`/`'>​>​>'`) could collapse to deleting the forged marker outright and no test
  noticed, because the existing forged-marker tests only counted exact `CONTENT_CLOSE`/
  `CONTENT_OPEN` occurrences rather than asserting what a forged marker gets replaced
  *with* (and no test forged an OPEN marker at all, only CLOSE); `renderHistory`'s and the
  sources list's `.join('\n\n')` separators, and both `.trim()` calls on history turns and
  the main question, were never exercised with more than one entry or with padded
  whitespace; the exported `CONTENT_OPEN`/`LIVE_STATE_LABEL`/`VIEW_CONTEXT_LABEL` constants
  were only ever checked via `.toContain` on a rendered prompt, which passes vacuously if the
  constant itself were emptied; and most of the static rule lines (the intro sentence, the
  "Rules (non-negotiable):" header, several individual bullet lines, and the blank-line
  spacers between sections) were never pinned at all — including one bullet whose exact text
  duplicates a phrase from a different bullet, so the existing regex assertion kept matching
  the surviving line even when the mutated one vanished. Added direct `.toBe` pins for the
  four exported constants, two full-array `.toEqual` pins of `buildAskPrompt`'s line-by-line
  output (one bare, one with two sources and two multi-turn history entries with padded
  whitespace) that between them fix the exact static skeleton and every join/trim gap, and a
  symmetric forged-OPEN-marker test plus exact substitution-text assertions on both existing
  forged-marker tests. Score is 100%. New `stryker.engine-ask.config.mjs` +
  `vitest.engine-ask.config.ts`, wired into `mutation:engine-ask` and `verify`. Widening
  further remains open under the same backlog id.

- **Mutation testing widens to `auth.ts` (web-msnswvcq-viays2), the spawned CLI's
  credential-isolation logic.** Seventh module wired after store's `rank.ts`/`schema.ts` and
  engine's `release.ts`/`pace.ts`/`containment.ts`/`inbox.ts`/`repo-map.ts` — same
  zero-import, fake-driven shape those six configs target, and a security-sensitive one: a
  surviving mutant here would mean the logic keeping `api-key`/`oauth-token`/`subscription`
  auth modes from leaking a stray credential into each other's spawned env could silently
  break. Found four real gaps: a stray `apiKey`/`oauthToken` field on a config whose `mode`
  didn't select it was never asserted to stay out of the spawned env (both fields are
  optional and independent, so nothing stopped one leaking through when the mode pointed at
  the other); `isAuthReady`'s length check was never exercised with an empty-string
  credential, only `undefined` and a real value; `describeAuth`'s `oauth-token` switch case
  wasn't pinned by an exact assertion, so a mutant that fell through to the `default` case
  still matched the same loose `/subscription/i` regex both branches share; and
  `DEFAULT_AUTH.mode` itself was never asserted directly, only exercised indirectly through
  functions where `undefined` and `'subscription'` happen to behave identically. Added a
  cross-mode leakage test, empty-string cases, exact `toBe` assertions for both `describeAuth`
  branches, and a direct `DEFAULT_AUTH.mode` test. Score is 100%. New
  `stryker.engine-auth.config.mjs` + `vitest.engine-auth.config.ts`, wired into
  `mutation:engine-auth` and `verify`. Widening further remains open under the same backlog
  id.

- **Mutation testing widens to `repo-map.ts` (web-msnswvcq-viays2), the ORIENT-stage REPO-MAP
  digest.** Sixth module wired after store's `rank.ts`/`schema.ts` and engine's
  `release.ts`/`pace.ts`/`containment.ts`/`inbox.ts` — same zero-import, fake-driven shape
  those five configs target. `guard.ts` (the PreToolUse command-guard prevention layer) was
  tried first as this slice's target but surfaced 118 surviving mutants plus 10 no-coverage —
  too large a gap for one firing to close responsibly, so it stays a follow-up target sized
  for its own dedicated slice(s). `repo-map.ts` found four real survivors: the hot-files and
  recent-focus sections' display-limit truncation (`.slice(0, LIMIT)`) was never exercised
  with more items than the limit, the line-join separator (`'\n'`) wasn't pinned by any exact
  equality assertion, and `tallyRecentFocusDirs`' `?? 0` (vs `&& 0`) fallback wasn't
  distinguishable because every existing multi-dir test's expected order happened to match
  the accidental alphabetical tie-break the mutant produces. Added bound tests for both
  truncated sections, an exact `toBe` assertion for the full digest, and a weighted-count
  test where the correct order contradicts alphabetical order. Score is 100%. New
  `stryker.engine-repo-map.config.mjs` + `vitest.engine-repo-map.config.ts`, wired into
  `mutation:engine-repo-map` and `verify`. Widening further remains open under the same
  backlog id.

- **Mutation testing widens to `inbox.ts` (web-msnswvcq-viays2), the operator's INBOX/
  digest.** Fifth module wired after store's `rank.ts`/`schema.ts` and engine's
  `release.ts`/`pace.ts`/`containment.ts` — same zero-import, fake-driven shape those four
  configs target. Found three real survivors — the digest's two static instruction lines
  and the blank-line separator pushed between entries were never pinned by any test, so a
  mutant that blanked or replaced them still passed every `toContain` assertion. Strengthened
  the first test to assert the full digest via `toBe`. Score is 100%. New
  `stryker.engine-inbox.config.mjs` + `vitest.engine-inbox.config.ts`, wired into
  `mutation:engine-inbox` and `verify`. Widening further remains open under the same
  backlog id.

- **Mutation testing widens to `containment.ts` (web-msnswvcq-viays2), the flight
  containment breach audit.** Fourth module wired after store's `rank.ts`/`schema.ts` and
  engine's `release.ts`/`pace.ts` — same zero-import, fake-driven shape those three configs
  target, and the highest-value one so far: a surviving mutant here would mean the hard,
  machine-checkable backstop that detects an escaped flight (docs/FLIGHT-CONTAINMENT.md)
  could silently miss a breach. Found two real survivors — `describeBreach`'s sha
  truncation (`.slice(0, 12)`) wasn't actually exercised, because the existing tests
  asserted `toContain` rather than exact equality, so the untruncated sha (which still
  contains the truncated prefix as a substring) passed either way. Strengthened both
  tests to assert the full line via `toBe`. Score is 100%. New
  `stryker.engine-containment.config.mjs` + `vitest.engine-containment.config.ts`, wired
  into `mutation:engine-containment` and `verify`. Widening further remains open under the
  same backlog id.

- **Epic 0001 — parallel flights (founder directive: no project depends on another).**
  `docs/epics/0001-parallel-flights.md` specs the removal of the four serialization layers
  (store-wide `engine.lock`, singleton `FlightRunner`, unhardened concurrent store writes,
  flight-end rituals racing commits into this repo) so different projects fly simultaneously,
  each with its own board and containment — same-project single-instance stays guaranteed.
  Six slices seeded on the board with `EPIC-SPEC:` markers; acceptance criteria include a
  never-globally-locked path field, per-project flight cards, an operator concurrency cap
  (shared subscription quota), and serialized PAPER/landing/release commits.

- **Omniscient chat context (web-msnrw1ok-0gsdff), first slice: Ask now knows which dashboard
  page the operator is on.** The board item asks for VIEW + selected element + recent operator
  actions all auto-injected into chat; this slice ships the VIEW half only — fleet overview vs a
  specific project's page (`document.body.dataset.project`, the same idiom the live re-render
  already uses to detect the pinned project page). Threaded end to end: the client sends an
  optional `view` alongside `project`/`question`; `parseAskRequest` validates and caps it
  (`MAX_VIEW_CHARS`, 200 chars — it's a short client-embedded label, never operator-typed);
  `askProject`/`askProjectStream` (`apps/dashboard/src/ask/service.ts`) fold it into the grounded
  sources ahead of live state, under a new `VIEW_CONTEXT_LABEL`; `buildAskPrompt`
  (`packages/engine/src/ask.ts`) gains a rule telling the model to use it only for tone/framing
  (e.g. resolving a bare "this"), never as a grounding substitute. Selected element and recent
  operator actions remain unbuilt — the backlog item stays open.

- **Impacted-tests-first gate scheduling (web-msnt26tn-jvyihy "PARALLEL GATE + test-impact",
  half two) — most firings now run only the tests affected by that firing's own diff.**
  `test:impacted` (`vitest run --changed`, scoped to this repo's own uncommitted changes) already
  existed as a script but nothing ran it; the JS gate detector now recognizes a `test:impacted`
  script as `GateSpec.testImpacted` alongside `test`. `fly.ts` picks between them per firing via
  the new `selectTestCommand`/`isFullTestRunDue` (`apps/dashboard/src/flight/gate-schedule.ts`):
  the fast impacted-only path most firings, a full `test` run every `FULL_TEST_EVERY_N_FIRINGS`
  (5) firings — including always on a project's very first firing — to catch whatever the
  changed-file graph misses. The gate's existing check-label display surfaces which mode ran
  (`pnpm run test:impacted` vs `pnpm run test`) with no new UI needed. Half one (typecheck/
  lint/format running concurrently via `GateRunner`'s `parallel` batching, plus the dashboard's
  gate-parallel-savings tiles) already shipped in an earlier firing.

- **The full `pnpm run verify` chain is repaired (one pre-existing overage remains — see below).**
  Two rots the partial per-firing gate (typecheck/lint/format/test/build) let slip into HEAD:
  `release.ts`'s mutation score fell to 96% under a break-at-100 threshold (three
  `MILESTONE_TAG_PATTERN` regex-anchor mutants survived, plus error-string and
  conditional-spread mutants) — killed with boundary tests (`m10` accepted; `m4x`/`am4`
  rejected; the `InvalidMilestoneTagError` name/message asserted as operator-facing behavior;
  the `milestoneTag` result key asserted _absent_, not merely `undefined`) — and
  `WATCH-DASHBOARD.cmd`'s usage example carried a Windows drive-absolute path the
  no-personal-paths gate bans. Still red and tracked separately: `ci:bundle-size` (`/app.js`
  178.9KB raw / 48.6KB gzip vs 150/45 budgets), an overage that predates these fixes.

- **Landing self-restart survives spawn failures — the crash that killed the server (and the
  flight with it).** On Windows, `spawn('pnpm.cmd', …)` without a shell throws a _synchronous_
  EINVAL (Node's CVE-2024-27980 hardening); the rebuild trigger's promise chain had no rejection
  handler, so the landing that cut v0.12.0 crashed the whole dashboard process — twice — and the
  flight running as its child died with it, mid-firing. `createBuildRunner` now try/catches the
  spawn (a rebuild that can't launch = a failed build: skip the restart, keep serving) and runs
  Windows batch shims through a shell (`needsShell`) so the rebuild actually _works_ on Windows
  instead of merely failing politely. `createSelfRestartTrigger` gained a rejection handler plus
  port-aware failure handling: a throw before the port is released keeps the current server
  serving; after, it exits nonzero so a supervisor (or the operator) knows nobody is listening.

- **Collision-proof seed-task ids — the SECOND project ever onboarded no longer crashes the
  flight.** `fly.ts` (and the flight/demo harnesses) injected bare per-run counters (`task-1`,
  `task-2`, …) as board-seed task ids; those restart at 1 on every run while the shared store's
  `tasks` table is permanent, so onboarding any second project died with `UNIQUE constraint
  failed: tasks.id` before its first firing — hit live onboarding the first
  non-self target ever flown. New `taskIdSource(prefix)`
  (`packages/onboarding/src/onboard/task-id.ts`) mints `<prefix>-<time36>-<nonce36×6>-<seq>` —
  run-unique via creation stamp + random nonce, in-run unique (and ordered, and readable) via the
  sequence — and all three injectors (`fly.ts`, `flight.ts`, `demo.ts`) now use it. Regression
  pinned at both levels: the id source itself, and a two-projects-one-store seed through
  `SqliteProjectStore`.

- **Release automation's `m<N>` milestone-tag reconciliation (board item `web-msnshavs-z0obmh`,
  Release automation slice).** The last open follow-up under this backlog id: `docs/RELEASING.md`'s
  release checklist calls for tagging both `v<semver>` and `m<N>` at the release commit, but
  `executeRelease` only ever cut the version tag. Whether a release actually completes a milestone's
  DoD is a human call — not computable from commit subjects (the changelog's own v0.9.0-vs-v0.10.0
  split, where only the latter closed M3, is the concrete counter-example to "every minor bump is a
  milestone") — so this mechanizes the *plumbing*, not the *judgment*: `executeRelease` gains an
  optional `milestoneTag` parameter, validated against `MILESTONE_TAG_PATTERN` (`m<N>`) and tagged at
  the same HEAD as the version tag right alongside the git-notes attestation, riding along as a
  non-fatal `milestoneTag` result field the same way `attestation` already does. The RELEASE panel
  gains an accessibly-labeled, optional "Milestone tag" input next to "Cut release" — left blank,
  behavior is unchanged; filled in, the dashboard's `POST /api/release/execute` validates it
  server-side (400 on a malformed shape, before ever reaching the engine) and forwards it through.
  `GitVcs.tag` needed no changes — it was already name-agnostic, just never called a second time.

- **Mutation testing widens to a second packages/engine module — `pace.ts` (board item
  `web-msnswvcq-viays2`, MUTATION TESTING slice).** Following `release.ts`'s precedent as the first
  self-contained (zero-import, no git-subprocess, no database) engine module wired for mutation
  testing, `pace.ts` — the adaptive-cadence arithmetic behind the loop's inter-firing sleep — is the
  same shape of good target: tiny, pure, and its test file imports nothing but vitest. New
  `vitest.engine-pace.config.ts` + `stryker.engine-pace.config.mjs` (same `concurrency: 1` /
  `symlinkNodeModules: false` Windows-safety fixes both prior configs needed) mutate just that one
  file; `mutation:engine-pace` joins `verify` alongside `mutation:store` and `mutation:engine-release`.
  First run found one real survivor: the `ratio <= SLOWDOWN_THRESHOLD` boundary check mutated to `<`
  produced an *identical* result for every existing test, because the overshoot formula coincidentally
  evaluates to a 1x multiplier right at the threshold — but only for an **integer** `baseSleepMin`; the
  type never requires that, and the original branch returns it raw while the mutant's branch runs it
  through `Math.round`. A new test using a fractional `baseSleepMin` (5.5) at the exact boundary
  exposes the divergence (5.5 vs. the mutant's rounded 6), closing the gap for real — not an equivalent
  mutant, an untested boundary. Real score is 100%. Widening further remains open under the same
  backlog id — the same two blockers (`adapters/git.ts`'s real-git-subprocess tests, and
  packages/store's better-sqlite3 coverage-collection gap) still apply to most of what's left.

- **Mutation testing reaches into packages/engine — `release.ts` (board item `web-msnswvcq-viays2`,
  MUTATION TESTING slice).** `stryker.store.config.mjs`'s own follow-up note flagged "packages/engine
  isn't wired at all yet" as blocked on GitVcs's real-`git`-subprocess tests (minutes-to-hours under
  mutation). `release.ts` sidesteps that blocker entirely — a fully self-contained pure module (zero
  imports) whose tests never shell a subprocess or open a database — making it the natural first
  engine module to wire, the same way store scoped its first slice to rank.ts/schema.ts to dodge
  their own blocker (the better-sqlite3 Windows coverage gap). New `vitest.engine-release.config.ts`
  + `stryker.engine-release.config.mjs` (same `concurrency: 1` / `symlinkNodeModules: false`
  Windows-safety fixes store's config needed) mutate just that one file; `mutation:engine-release`
  joins `verify` alongside `mutation:store`. First run found 19 real survivors — assertion gaps, not
  busywork: `computeBump`'s guard against a later `fix` commit downgrading an already-earned `minor`
  bump was untested in the order that actually exercises it; `bumpVersion`/`cutChangelogRelease`'s
  malformed-input throw tests checked `.toThrow()` generically instead of the exact message, so a
  mutant that swapped the real error for a generic `TypeError` still passed; all three regexes
  (`CONVENTIONAL_SUBJECT`, `SEMVER`, `UNRELEASED_HEADING`) had untested anchors — nothing proved a
  match couldn't slip in from a decoy substring elsewhere in the input; and `buildReleaseAttestation`'s
  pluralization branch had zero coverage since every existing test used exactly one commit subject.
  19 new assertions later, real score is 100% — except one genuine equivalent mutant: `type !== null`
  narrows `type` from `string | null` to `string` for `PATCH_TYPES.has` purely for TypeScript (`Set.has(null)`
  is already safely `false` at runtime), marked with an inline `// Stryker disable` comment on its own
  line rather than chased, mirroring rank.ts's precedent for a provably-equivalent guard. Widening
  further — the rest of packages/engine (anything still importing `adapters/git.ts` transitively) and
  the rest of packages/store (blocked on the undiagnosed better-sqlite3 coverage gap) — remains open
  under the same backlog id.

- **Mechanical substeps gain a configurable model (board item `web-msnt2j50-wk2lxy`, M6 GOLD
  slice).** Post-flight board TRIAGE — the one cheap, tool-less model call that ranks the open
  queue after every flight — had `'haiku'` hardcoded twice in `fly.ts` (the `ClaudeCliModel`
  config and the `.invoke()` call). `resolveMechanicalModel` (`flight/triage.ts`) extracts that
  into a pure, unit-tested function: still defaults to haiku, but now overridable via
  `AUTOPILOT_MECHANICAL_MODEL`, mirroring how `AUTOPILOT_MODEL` already overrides the primary
  model. This is the actual lever M6 GOLD's "local/cheap offload" needs — an operator can point
  a mechanical substep at any accessible model, including a local one, without editing source.
  **Scope note:** this closes the config gap for the one mechanical substep that already existed
  (TRIAGE); routing *more* substeps (remediation formatting, commit-message drafting, summaries)
  off the primary model requires splitting them out of the single ORIENT→COMMIT agent session
  they currently run inside — that remains unbuilt, so the backlog item stays open.

- **Parallel-gate savings get a dashboard tile (board item `web-msnt26tn-jvyihy`, UX-EXPRESSION
  slice).** `gateParallelSavings` (`packages/store/src/read.ts`) has measured the real wall-clock
  saved by running typecheck/lint/format concurrently since the parallel-gate mechanism itself
  shipped — but the metric had no user-facing expression, only test coverage. `ProjectAggregate`
  now carries it (`gateParallel`, gathered in `apps/dashboard/src/read/source.ts`), and the
  per-project page renders it as its own tile group (`gateParallelSection`, `web/shell.ts`),
  mirroring the DORA-tiles precedent: sampled firings, wall-clock saved, and saved-vs-sequential
  percentage, each keyboard-reachable with a real `aria-label`. The panel stays hidden (not a
  false zero) for a project with no sampled firings yet — e.g. a gate whose config never runs
  ≥2 of typecheck/lint/format concurrently. This closes the UX-EXPRESSION gap on the half of the
  backlog item that already shipped; **test-impact sampling (impacted-tests-first + a scheduled
  full run) remains unbuilt** — the item stays open.

- **RING-0 SUPERVISOR — complete (board item `web-msq9hfhd-ebmy8k`).**
  A tiny, dependency-free `watch` daemon (`apps/dashboard/src/control/cli.ts`, `pnpm
  dashboard:watch`, `WATCH-DASHBOARD.cmd`) now owns all four rituals the board item named, turning
  "the pilot observes, not babysits" into a real hands-free loop:
  - **server lifecycle** (`watchdogTick`/`runWatchdog`, `apps/dashboard/src/control/watchdog.ts`) —
    probes `DashboardControl.status()` on an interval and calls `start()` whenever it isn't
    running; `status()` already self-heals a stale record (dead pid) before returning, so the same
    "not running → start" branch covers both revive (crashed) and replace (stale record).
  - **flight spawning** (`flight-watchdog.ts`) — opt-in via `pnpm dashboard:watch -- <folder>
    [firings] [budgetUsd] [totalBudgetUsd]`: spawns a flight against that one target whenever it's
    idle (never onboarded or sitting `registered`), including TOTAL-SPEND mode.
  - **post-flight PAPER-commit ritual** (`flight/self-study.ts`, wired in `fly.ts`) — commits
    `docs/SELF-STUDY/PAPER.md`'s automated regen when (and only when) it actually changed
    something, so the ritual has an owner instead of leaving the tree dirty and silently blocking
    self-landing.
  - **landing** (`land-watchdog.ts`) — once the target is confirmed idle, a cheap `git log
    base..HEAD` count decides whether there's anything to land before POSTing to the live server's
    own `/api/landing/execute`, reusing its already-tested gate-then-merge + self-restart policy
    instead of a second implementation here.
  A `canSpawnFlight` guard keeps flight-spawning from ever overlapping a spawned flight that's
  already running or a landing tick mid checkout/merge against the same target repo.
  Also fixed a test-hermeticity bug uncovered while gating the first slice: `control.test.ts`'s
  plain lifecycle tests assumed `AUTOPILOT_FLIGHT` was unset, which breaks when the suite itself
  runs inside a real (self-hosted) flight — every flight's process tree carries
  `AUTOPILOT_FLIGHT=1` (`spawn-flight.ts`), inherited by the gate's own `pnpm test` child
  (`GateRunner` doesn't filter `env`), so this could fail an unrelated, otherwise-green gate. The
  suite now clears/restores the var around each test.

- **Landing EXECUTE v3 — self-landed merges from the dashboard (board item
  `web-msnqeegt-ki7dm0`).** The LANDING card's preview-only v2 gains a real
  EXECUTE action: a CSRF-guarded `POST /api/landing/execute` behind an
  explicit `window.confirm()`, gated by `executeLanding`
  (`packages/engine/src/landing.ts`), which refuses to touch git at all when
  the project's verification gate is red. A green gate hands off to
  `GitVcs.land` (`adapters/git.ts`) — `checkout base` → `merge --no-ff
  --signoff` → `branch -f` the flight branch forward → `checkout` back — with
  conflict-abort/rollback on any failed step. A self-hosted green land
  triggers `landing/self-restart.ts`: an in-process rebuild + graceful
  restart that health-polls the replacement before the old process exits, so
  the dashboard never signals its own death before the new one is live. The
  UI (`web/shell.ts`) renders a real `<button data-land-execute>` — natively
  keyboard-operable — and a `role="status" aria-live="polite"` "rebuilding &
  restarting" affordance while the swap is in flight; both are covered by a
  dedicated axe-core assertion (`test/web/a11y.test.ts`) against the button's
  real unmerged-commits render, not just its "nothing to land" fallback.

- **Release automation — `git notes` attestation (board item `web-msnshavs-z0obmh`).**
  `executeRelease` (`packages/engine/src/release.ts`) now attaches a `git notes add` flight-log
  attestation to the release commit once the `v<semver>` tag lands — the third leg of the tags /
  commits / notes triad `docs/RELEASING.md`'s "Git notes" section calls for, and one of the two
  follow-up slices the feature's own docstrings had been flagging since the EXECUTE step shipped.
  `GitVcs.notes()` (`adapters/git.ts`) mirrors `GitVcs.tag()`'s refuse-rather-than-clobber stance:
  it won't overwrite an existing note on a commit. The attestation body (`buildReleaseAttestation`)
  is built from what `executeRelease` actually has on hand — version, bump, date, and the commit
  subjects since the last tag — not the fuller DoD/gate/coverage record the docs describe, since
  that data doesn't reach this call yet. A failed attestation doesn't fail the release: the commit
  and tag already landed by that point, so it rides along as a non-fatal `attestation` field the
  dashboard's release panel now surfaces as an inline note rather than swallowing silently. The
  `m<N>` milestone-tag reconciliation remains the one open follow-up slice under this backlog id.

- **SELF-STUDY chart data plane — `DATA:SERIES` block (board item `web-msnsgcvf-zgmo7i`).**
  `docs/SELF-STUDY/PAPER.md` §4 gained a second, machine-readable block alongside the existing
  human-readable `DATA:SUMMARY` tables: per-firing rows (day, sha, kind, shipped, completion,
  self-reported outcome, prompt version, cost, turns — oldest first), per-day aggregates (firings,
  shipped, cost, turns), and a per-era (`Firing-Prompt-Version`) comparison. A new `firingSeries`
  (`packages/store/src/read.ts`) joins `metrics` to each firing's own `events` payload for the
  promptVersion/outcome fields — the same source `evalRegressionByPromptVersion` already reads, so
  the two never disagree. `scripts/self-study/generate-data.mjs` shapes and writes the JSON;
  `replaceBlock` now takes its marker pair as a parameter so both blocks share one regeneration
  path. This is the data plane only — no chart consumes it yet.

- **Academic citation — `CITATION.cff` + README "How to cite" (board item `web-msnsjxrp-3x9drz`).**
  No machine-readable citation existed, so GitHub's native "Cite this repository" button had
  nothing to render and there was no BibTeX/APA/IEEE text for anyone citing AUTOPILOT in a paper
  or derivative project. Adds `CITATION.cff` (CFF 1.2.0) at the repo root plus a "How to cite"
  section in `README.md`, both generated by `scripts/citation/generate-citation.mjs` from ONE
  metadata source — root `package.json` (version, description, author, license, homepage) and
  the matching `CHANGELOG.md` release heading for that version's date — the same drift-proofing
  `ci:architecture` already applies to `docs/ARCHITECTURE.md`'s container diagram. `pnpm
  citation:update` regenerates both; `pnpm run ci:citation` (now wired into `pnpm verify` and CI)
  fails the build if either drifts from package.json/CHANGELOG.md. `REUSE.toml` gains `**/*.cff`
  so the new file stays REUSE-compliant without an inline header, matching the existing
  YAML/JSON/MD convention.

- **`pnpm run test:impacted` — first slice of test-impact sampling (M6/I4, board item
  `web-msnt26tn-jvyihy`).** The prior slice (`2407ea0`) parallelized the gate's independent
  typecheck/lint/format steps but left "test-impact scheduling" untouched. This adds a
  dev-facing `vitest run --changed` script: filtered to only the tests covering uncommitted
  (staged + unstaged) changes, using Vitest's own git-diff-driven module graph rather than a
  hand-rolled one. Verified against a real single-file edit: 25 test files / 361 tests instead
  of the full suite's 157 / 1354 — real wall-time savings during DO-phase iteration, before the
  mandatory full `pnpm run test:coverage` run. Deliberately NOT wired into the gate itself —
  `GateRunner`/`fly.ts` still always run the complete suite, so `verify`'s correctness guarantee
  is unchanged. What remains: actually reducing per-firing gate compute (MASTER-PLAN §17.1's
  "test-impact + scheduled full") needs the gate to trust impact analysis for most firings and
  fall back to a full run on a schedule — a real design/safety tradeoff (package.json/config
  changes already force a full rerun per Vitest's own `forceRerunTriggers`, which helps, but
  isn't a complete safety net on its own) that deserves its own slice rather than being rushed
  into the change that also introduces the tool.

## [0.12.0] — 2026-08-11 — the self-governing era (firings 42–256)

### Added

- **Generalized the backlog convention — onboarding now detects ANY flown project's own
  backlog file, not just AUTOPILOT's.** The empty-board proposal lens and its dedupe backstop
  used to hardcode a reference to `docs/BACKLOG-999.md` — AUTOPILOT's own doc — and sent that
  same (wrong, nonexistent) instruction to every other repo a flight targets. `detectBacklogPath`
  (`packages/onboarding/src/onboard/backlog.ts`) now scans the onboarding filesystem snapshot for
  `BACKLOG.md` / `BACKLOG-<slug>.md` / `TODO.md` (any case, anywhere in the tree; shallowest-then-
  lexical tiebreak for determinism) and records the repo-root-relative path on the project record
  (`projects.backlog_path`, migration v8). `buildFiringPrompt` renders the "first check `<path>`"
  guidance only when a path was actually detected — omitted entirely for a project with none,
  rather than pointing the agent at a file that doesn't exist — and `fly.ts`'s dedupe backstop
  reads titles from the detected path instead of a hardcoded one. A resumed project's SOUL can now
  also declare `Backlog: <path>` — `parseSoulBacklogPath` reads that line and it wins over
  re-detection, the escape hatch for backlog files the filename heuristic can't find (non-standard
  name, several candidates, outside the scanned tree). Closes out the backlog-convention item.

- **Multi-turn conversation support in the grounded ask prompt — first slice of GENIUS chat.**
  The BOARD's "collapsible side chat" item bundles a new UI panel, cross-view awareness, and
  multi-turn state into one item — too large a surface for one safely-verifiable firing, so this
  ships just the backend foundation: `buildAskPrompt` (`packages/engine/src/ask.ts`) now accepts
  an optional `history: AskTurn[]` (prior `{question, answer}` turns, oldest first) and renders it
  as plain-text conversation context ahead of the new question — no injection-defense fencing
  needed (unlike repo excerpts, prior turns are the user's own words plus our own answers, not
  untrusted content). `askProject`/`askProjectStream` (`apps/dashboard/src/ask/service.ts`) cap
  history to the most recent 6 turns before it reaches the model (cost control, same rationale as
  `MAX_SOURCES`); `/api/ask` and `/api/ask/stream` accept an optional `history` field, validated
  and capped at 20 turns / 4000 chars per answer at the request boundary. Bumped
  `ASK_PROMPT_VERSION` to `ask-v2` (a prompt shape change is always a deliberate, traceable event).
  The collapsible panel UI, view auto-detection, and the client code that actually sends `history`
  are follow-on work — this wires the prompt + API surface only.

- **Firing callsigns — "AP-7 nova" instead of an opaque firing id.** First slice of the
  agent-callsigns board item: `firingCallsign(firingId)` (`read/fleet.ts`) deterministically
  derives a stable "AP-\<n\> \<word\>" name from the firing's own id (firing number + a hash into
  a curated word list) — same firing, same callsign, always, no storage or migration. `LiveFiring`
  now carries it as `callsign`, and the live worker card renders it as a chip next to the phase
  pill. The client mirrors the same pure function (it re-derives `LiveFiring` from raw activity —
  see `web/shell.ts`'s `firingCallsign`, kept in sync with the server copy by hand). Trace
  timeline, office map, and subagent callsigns are follow-on work — this wires the read model and
  the first visible surface.

- **Write/Edit containment in the flight guard — the escape hole the Read fix left open.**
  The prior Read-tool containment fix guarded Read/Grep/Glob but not Write/Edit, which are
  in every flight's default allowed-tools list — `Edit` (or `Write`) an absolute path outside
  the target sailed straight through, unlike the now-guarded `Read`. A test even pinned this
  as expected behavior (`evaluateHookInput` returning "no decision" for `Edit /etc/passwd`).
  The same PreToolUse hook now denies Write/Edit outside the target repo too (containment
  only — no read-hygiene check, which doesn't apply to writes); `buildFlightSettings`'s
  second matcher is now `Read|Grep|Glob|Write|Edit`.

- **Read hygiene + Read-tool containment in the flight guard (measured, not guessed).** Telemetry across
  28 real firings showed cacheRead is ~55% of firing cost — so the guard now DENIES Read/Grep/Glob into
  `dist/`, `coverage/`, `node_modules/` and `.git/` (generated/vendored output is context poison), with a
  reason that redirects the agent to source/docs. Found and closed on the way: the Read tool was never
  path-guarded at all — only Bash was — so `Read /etc/passwd` bypassed containment; the same hook now
  denies Read/Grep/Glob outside the target. The B2 prompt-prefix reorder was evaluated against the same
  numbers and DEFERRED (~$0.02/firing at current scale; revisit at M6 warm sessions) — recorded in
  RESEARCH-LIBRARY "Firing cost anatomy".

- **Micro-action telemetry: per-step model + token usage in the per-firing drill-down.** Each
  assistant event's `message.model` and `message.usage.{input_tokens,output_tokens}` are now captured
  onto every `Activity` that event produced (`model`, `tokensIn`, `tokensOut` — null when the envelope
  carried none), giving an honest per-turn cost approximation instead of only a per-firing total. The
  compact top-level feed is unchanged; the per-firing drill-down renders a `model · N tok` chip under
  each step alongside its reasoning excerpt.
- **Decision transparency: the per-firing drill-down shows the agent's stated reasoning.** Every
  assistant message's `text` blocks are now captured alongside the tool call they precede — a bounded
  240-char excerpt attached to that step's `Activity` as `reasoning` (null for a bare tool call with no
  stated WHY). Persisted generically through the existing `JSON.stringify(activity)` event write, so no
  schema migration was needed. The compact top-level feed stays one line by design; only the per-firing
  drill-down renders the excerpt as a second, italic line under its step — the WHY before the WHAT.
- **Nothing is lost: turn-cap deaths now explain themselves AND hand their knowledge forward.** Firing 47
  died at an invisible 60-turn cap — $3.84, 61 turns, empty flight-log row, context gone, and firing 48 flew
  blind. Four fixes, one principle (the founder's: "nothing should be lost in the first place"):
  the firing prompt gains a **TURN BUDGET** section (`firing-v8.1`) — the agent SEES its cap and the
  deliver-or-pack discipline (commit a verifiable slice early; pack a `wip(autopilot): checkpoint` with a
  what-remains note when green is out of reach); a cap-death injects **corrective feedback + the dead
  firing's recorded exploration trail** (from activity events, last unique steps) into the next firing so it
  RESUMES instead of re-discovering; the flight-log chip renders **turn-capped / errored** verdicts straight
  from the firing record (`died` on the read model) instead of an unexplained empty row; and the fly bar
  shows a **live plan hint** — "N firings × $X — spends up to $Y total · each firing: up to $X and 80
  turns" — with mode-aware labels ("by count" / "by total $", "Stop at total $"), the caps served by
  `GET /api/fly` (`maxTurnsPerFiring`, `minBudgetUsd`) so the UI never hardcodes them.

### Fixed

- **Partial-slice claims no longer close the whole board task.** A firing that only ADVANCES a
  multi-step task — not finishes it — was closing it anyway: any gate-verified ship whose METRICS
  `item` matched an open task id marked it `done`, with no way to say "more work remains." METRICS
  gains a `completion: "slice" | "complete"` field (`packages/engine/src/telemetry.ts`); the firing
  prompt now instructs the agent to tag `"complete"` only when the task is actually finished, or
  `"slice"` when it only advanced it (`packages/engine/src/prompt.ts`). `taskShouldClose`
  (`apps/dashboard/src/flight/completion.ts`) keeps a `"slice"`-tagged task open in
  `markTaskDoneIfShipped`, and the straggler safety net `reconcileShippedTasks`
  (`packages/store/src/mutate.ts`) excludes slice-only ships from its own auto-close scan.
  Persisted via schema v7 (`metrics.completion`, nullable — every firing before this field existed,
  or a commit-inferred ship with no self-report, is trusted whole as before).

- **`ClaudeCliModel`/`StreamingClaudeCliModel` kill a hung `claude` child instead of blocking a
  firing forever.** Neither adapter passed a process timeout to its spawn call — a wedged auth
  prompt or a stuck MCP server inside the CLI child would hang with no way out. Both now pass
  Node's native `timeout` (default 30 minutes, `DEFAULT_CLI_TIMEOUT_MS`) through to `execFile`
  and `spawn`, overridable per call via `ClaudeCliOptions.timeoutMs`
  (`packages/engine/src/adapters/claude-cli.ts`). Also fixes a latent bug in the streaming close
  handler: `code ?? 0` reported a signal-killed child (timeout or otherwise) as a clean success —
  it now falls back to `exitCode 1` when a signal, not just a numeric code, ended the process.

### Changed

- **Per-firing turn cap 60 → 80, moved to `flight/budget.ts`.** Successful firings run 26–68 turns; 60 cut
  real work off mid-flight (observed live) while the operator's budget — the real spend guard — was barely
  touched. One source of truth the server can serve and the flight imports.

### Added

- **The containment hook now denies destructive git, not just prompts against it.** `guard.ts`'s
  `PreToolUse` hook — already blocking absolute-path escapes and home-dir reads — now also denies
  force-push, `git reset --hard`, `git rebase`, `git branch -D`, checking out/switching to `main`,
  `git clean -f`, and `git filter-branch`. The SOUL's "additive git only" rule was prompt-only
  before; a confused or adversarial flight can now be stopped by the harness, not just asked nicely.
- **Budget toggle: fly by firing count OR by total spend.** The fly bar gains a mode select — "N firings"
  (unchanged) or "total $": the operator names a spend target and the flight keeps firing until the remaining
  budget can't fund another per-firing budget (count becomes a safety ceiling; status reports "up to $X
  total"). Completes the unit firing 41 checkpointed mid-way.
- **The flight log became click-to-expand chips.** Compact one-line rows (verdict dot · human headline —
  task title or real commit subject, backfilled for all history · cost · ago) that expand on click to the
  full story; history beyond 8 rows behind "Show all (N)" — the NN/g Load-More verdict from the list-UX
  research. Fixed on the way: a var-shadowing collision in the concatenated client (an ancestor-into-
  descendant append that only bit on re-render) and stale async paints (isConnected guards).
- **The dashboard onboards itself.** The folder the dashboard is running in now registers as a project the
  first time it boots there — no manual `dashboard:fly` first. Runs the read-only-safe subset of onboarding
  only (gate-detect, register, index, starter SOUL); deliberately skips the real ritual's backup/branch-switch
  step, since that's the right move for an explicit, consenting `dashboard:fly` but would be a surprise
  mutation if it fired the moment a passive dashboard boots. A fresh clone now always has itself available to
  keep building on, docs and all, from the very first boot.
- **The proposal loop closes: approve / reject / delete + post-flight triage.** Proposed tasks now land as
  `needs_approval` — flights SKIP them until the operator decides: **✓ approve** moves one into the workable
  queue, **✗ reject** removes it (no confirm — it was only an offer), and every open task gains a **🗑 delete**
  (confirmed — it removes real planning state). Reorder/focus apply only to workable tasks. New store mutation
  `deleteTask`, CSRF-guarded `POST /api/task/delete`, full endpoint tests. And at the END of every flight the
  autopilot now **triages its own board**: one cheap tool-less model call ranks the open queue best-first for
  the next run (injection-fenced prompt; a partial answer never loses a task; applied via the same
  `reorderTasks` the operator's ↑/↓ use, so the operator always outranks it and FOCUS outranks everything).
- **The office map only appears when someone is in the office.** Operator feedback: an idle map is noise —
  the SVG zone map now renders only while a firing is live.

- **The autopilot now MANAGES the board: it PROPOSES tasks when you give it none.** `firing-v7`: an
  empty board becomes an instruction to scan the repo across quality lenses — security, performance,
  UX/accessibility, networking/resilience, profiling/observability, docs — and emit a `PROPOSALS:[…]` line
  (parsed defensively like METRICS: caps, trims, never throws; persisted on the firing record). The flight
  harness harvests them post-flight, dedupes against existing titles, and lands up to 5 on the operator's
  board as `source: 'self'` with a **✦ proposed** chip — offered for YOUR approval (focus/reorder/done/ignore),
  never self-approved, never self-enacted. The assign→fly loop is now a full circle: the agent proposes,
  the operator disposes, the agent executes.
- **Look INSIDE orient › do › gate › commit.** The phase rail was counts-only ("orient 4 › gate 7") — the
  operator asked to see through it. Every phase segment is now an accessible button (aria-expanded) that
  drills into that phase's actual activity — which files orient read, what do edited, which gate commands
  ran, what got committed — newest first, capped, scrollable, with the selection surviving SSE re-renders
  (pure UI state re-rendered from the cached fleet view).

### Changed

- **Budget is PER-FIRING again, and uncapped — the founder's explicit preference.** The total-flight-budget
  semantics (below) lasted one flight; the operator prefers "each firing gets $X" with no $20 ceiling (spend
  decisions belong to the operator; the $0.50 floor stays). Label: "$ / firing". The `planFiringBudget`
  module was removed with its tests (dead code); `MAX_BUDGET_USD` is gone from the runner.

### Added

- **Ask answers stream live instead of popping in all at once.** `POST /api/ask/stream` mirrors `/api/ask` —
  same CSRF/validation guard, same grounded retrieval — but relays the model's answer as SSE `{delta}` chunks
  as they arrive (`StreamingClaudeCliModel` gains `onText`, fed by a new `textDeltaFromEvent` parser for
  `--include-partial-messages`), then a terminal `{done, ok, answer, sources}` frame. The dashboard's Ask
  button reads the SSE body via `fetch().body.getReader()` (`EventSource` can't carry the guarding JSON POST
  body) and re-renders the accumulating answer through the existing Markdown DOM builder on every delta, so
  the reply builds up live instead of appearing all at once; the terminal frame finalizes `answer`/`sources`.
  Buffered `/api/ask` is untouched. New tests cover `askProjectStream`, the endpoint's SSE relay +
  CSRF/validation guard, and the client's delta-driven render.
- **The budget field now means TOTAL flight budget.** Before, `--max-budget-usd` was passed to EACH firing —
  "10 firings × $5" could spend up to $50. Now the operator's number caps the WHOLE flight: each firing's CLI
  cap is the REMAINING budget (summed live from the flight's own metrics rows), and the loop stops cleanly
  ("total budget reached") when the remainder can't fund a meaningful firing (< $0.50). Combined with
  zero-work-loss checkpointing, running out of budget can never strand work. Label updated to "Total budget $".
- **"Start over" on the project page.** A declared, honest round reset: one button clears the project's
  telemetry (metrics + firing/activity events → counters restart at 0/0) while the project row, its task
  board, its search index, and its git backups all survive. Explicit confirm dialog spells out exactly what is
  and isn't kept; CSRF-guarded `POST /api/project/reset`; the delete/reset endpoints share one hardened
  handler. Never fabricates success — it starts a fresh round.

- **Mechanical gate remediation + failure feedback — the ~100%-shipping levers (SOTA-researched).** Every
  gate-revert observed across nine real flights was **format-only**: correct work destroyed because the agent
  skipped `format:check` (confirmed by resurrecting the reverted a11y commit — `prettier --check` was the sole
  red). A mechanical failure now gets a mechanical fix, no model in the loop (the fix→revalidate→keep-or-rollback
  pattern used by Snyk Agent Fix and Open SWE): **`RemediatingGate`** wraps the gate — on red it runs the
  write-mode formatter (derived `format:check` ⇒ `format`, degrades to a no-op where the convention is absent),
  commits the fixes **additively** (`style(autopilot): autoformat…`), and re-runs the gate; if still red it
  reverts its own commit so the engine's additive revert targets the agent's unit commit exactly as before.
  Remediation can never mask a real failure — it only clears mechanical noise. Second lever (**`firing-v6`**,
  the corrective-feedback-injection pattern from iterative-refinement research): the previous firing's exact
  gate failure is injected into the next prompt ("PREVIOUS FIRING FAILED THE GATE — fix the cause, don't repeat
  it"), bounded to 1200 chars. 9 new tests (remediation matrix + prompt rendering); wired into the live flight
  (`fly.ts`) with a shared `GitVcs` and a failure-capturing gate decorator.
- **Project-page a11y sweep landed for real.** Flight #9 wrote a correct axe-core test for the single-project
  page (summary, card, task board with reorder/focus/done controls — zero WCAG 2.0/2.1/2.2 A+AA violations) but
  lost it to the exact format drift described above; restored from the reverted commit, formatted, and landed
  through the full gate. The flight's diagnosis was right: the coverage gap was the risk, not a live defect.

- **FOCUS MODE + operator priorities (the founder's spec, researched).** The task board becomes a steering
  wheel: a **🎯 focus toggle** on every open task locks the autopilot onto it — a flight in focus mode works
  ONLY the focused task(s) until done (`firing-v4`: the FOCUS section **replaces** the board entirely; "do NOT
  free-pick… never substitute other work"; if blocked → honest noop). Without focus, **↑/↓ reorder buttons** set
  the operator's explicit priority (position = priority; the flight does the TOPMOST that fits) — buttons chosen
  over HTML5 drag-and-drop per accessibility research (browsers ship no DnD keyboard model; WCAG 2.1.1 requires a
  keyboard path), with an `aria-live` "moved to position X of Y" announcement. Focus sorts above priority above
  recency in the store read; focused rows are highlighted, the rest dim (WIP-limit-1, "constraint as
  liberation"). Store migration v5 (`focus`, `priority` — append-only), `setTaskFocus`/`reorderTasks` mutations,
  `POST /api/task/focus` + `/api/task/reorder` (CSRF-guarded), event-delegated UI. 12 new tests across store /
  prompt / endpoints / jsdom interactions; axe-clean.

### Fixed

- **The flight log stops double-explaining a reverted commit.** `died` exists to explain firings that
  never committed (turn-cap / CLI error) — but it was nulled only for `shipped` rows, so a REVERTED firing
  (a real commit that ran the full gate, failed, and was additively rolled back) still got a spurious
  turn-cap/error explanation stapled on top of its own `failedCheck`/`gateResult` story whenever the CLI
  also hit the turn cap on that same run. `mapFlightEntries` now also nulls `died` when
  `gate_result === 'reverted'`, so a reverted row explains itself exactly once.
- **A project no longer stays stuck on "flying" forever.** The flight set `status='flying'` at launch and nothing
  ever set it back — spotted by the founder watching the live board. The flight's `finally` now returns the
  project to `registered` when it ends (including crash/SIGTERM paths).

### Added (earlier this cycle)

- **The vector leg lands (M4 RAG): sqlite-vec inside the same SQLite file.** Adopted per the ecosystem research:
  `sqlite-vec` (Apache/MIT, prebuilt — no build scripts) loads into the existing better-sqlite3 connection and
  **proved live on this machine** (real KNN, project-scoped). `openVectorStore` creates the `vec0` table lazily
  (`IF NOT EXISTS`, 384-dim) **outside** the checksum-frozen migration chain — it's a derived, rebuildable index
  that exists only where the native extension loads, and everything degrades to BM25-only where it can't (tested
  via an injected failing loader; never a crash). `SqliteVecStore`: upsert (replace-per-path), remove, count,
  KNN. **`hybridSearch`** fuses BM25 ranks ⊕ vector ranks via the RRF core — a doc found by both legs wins,
  a semantic-only match (zero keyword overlap) still surfaces with a content excerpt, and with no vectors it IS
  plain BM25, so callers never branch. 9 new tests (6 vector + 3 hybrid). Remaining for full semantic search:
  the local ONNX embedder (fastembed/transformers.js) to produce document + query vectors.
- **Ecosystem research + adoption decisions recorded (`docs/ECOSYSTEM-RESEARCH.md`).** Researched the 2026
  agent-framework landscape (LangGraph/CrewAI/OpenAI+Claude SDKs/Mastra), local RAG components, and Cloudflare's
  official Containers docs. Decisions: **no framework under the core loop** (the subscription-auth `claude -p`
  scaffold + gate IS the product; frameworks would re-introduce API-key economics and duplicate the CLI's
  tool/permission/hook runtime); **adopt `sqlite-vec` + local ONNX embeddings (fastembed/transformers.js) + RRF**
  for the hybrid ranker — all free and local, vectors in the same SQLite file; **deployment path: npm CLI →
  Docker image → Cloudflare Containers** (Workers can't spawn processes; Containers run images + exec processes;
  the already-built `oauth-token`/`api-key` modes are the server-side auth story).
- **Reciprocal Rank Fusion core (M4 RAG) — the fusion half of the hybrid ranker.** `reciprocalRankFusion`
  (k=60 per the original paper) combines BM25 and vector rankings by rank position, so FTS5's negative BM25
  scores and cosine distances never need calibrating against each other. Pure, zero-dependency, 5 tests —
  the sqlite-vec vector leg plugs in without touching the fusion.
- **The assign→fly loop closes (M4): flights now consume the task board.** Every firing receives the project's
  OPEN board (queued/in-progress, re-read fresh each firing so a task added mid-flight is seen by the next one)
  as a **BOARD — assigned work** section that the prompt prefers over free picking (`firing-v3`; capped at 10
  tasks / 200-char titles so it steers without bloating). The completion contract is un-fakeable: the firing
  self-reports the task's bracketed id as its METRICS `item`, and only if that firing lands **gate-verified
  shipped** does the flight mark the task **done** (machine-checked against the metrics projection — the agent's
  word alone moves nothing). Assign work on the project page → the autopilot picks it up next firing → it comes
  back marked done with a real commit. 4 prompt tests.
- **Manage the task board from the project page (M4).** The inside page's Tasks section is now a working board:
  an **Add task** form files a human task straight onto the project's board (`source: 'dashboard'`, queued), and
  every open task has a **✓ done** button. Backed by `POST /api/task/create` + `POST /api/task/status` (CSRF-
  guarded JSON like every write; blank titles 400; schema CHECK constraints refuse invalid severity/status values
  as `{ok:false}` — never a crash) over new `createTask`/`setTaskStatus` store mutations. The board updates live
  via the same SSE push; buttons are event-delegated so they survive re-renders. Store (3) + endpoint (2) + jsdom
  interaction (2) tests; axe-clean. **The human side of the board is open — the flying side picks it up from the
  same table.**
- **The per-project inside page (M4) — click a project, get its own dashboard.** Every fleet card's title now
  links to `/p/<id>`: the same live-streamed state, anchored to one project — full detail **always open** (facts,
  languages, dirs, hot files, activity rail + file map, flight log, metrics), plus the project's **task board**
  (open tasks first, status/severity/dimension chips; tasks now flow through the read-model via a new
  `recentTasks` store read) and the search/ask bar **pinned to that project**. A removed/unknown id renders an
  honest "Project not found" with a back link; the anchor id is HTML-escaped server-side (hostile ids cannot
  break out of the attribute — tested). Same skip-if-unchanged live rendering, so the page sits still when idle.
  3 jsdom page tests + route/escape tests + store test; axe-clean.

- **Ask your project (M4) — grounded Q&A lands in the dashboard.** The search bar gains an **Ask** button: type a
  question, pick a project, and get an answer **grounded in that project's indexed code** — retrieval pulls the
  top-ranked files (full indexed content, truncated per file), the injection-defended `buildAskPrompt` fences
  them as untrusted data, and ONE **tool-less** model call (no tools allowed at all, 2-turn/`$0.5` caps) answers
  with cited paths. A question with no matching index content **short-circuits honestly without spending quota**.
  `POST /api/ask` is CSRF-guarded like every spend endpoint (415 non-JSON, 400 blank question, 404 unwired).
  Pure injectable service (5 tests) + `documentContent` on the search store (port + test) + endpoint tests (4);
  verified over a live socket. Axe-clean.

### Security

- **Flight escape PREVENTION — the guard hook (containment layer 2).** Flights are now spawned with `--settings`
  pointing at a generated settings file whose official `PreToolUse` hook pipes **every Bash command** through a
  path guard before it runs: any absolute path outside the target repo, any home-directory reference (`~`,
  `$HOME`, `%USERPROFILE%` — where credentials live), or a bare `cd` (which lands in HOME) is **denied** with the
  documented `permissionDecision: "deny"` JSON — enforced by the harness, not by asking the model nicely. Built
  on official Claude Code hook + `--settings` mechanics (researched from code.claude.com/docs; `--settings`
  verified on the installed CLI). CLI-arg scoped, so the user's own settings files are never touched. Pure,
  fully-tested core (`checkCommandContainment` / `evaluateHookInput` / `buildFlightSettings`, 17 tests) + a thin
  stdin shim; the compiled hook verified over a real subprocess against the exact observed escape shape. Honest
  scope: a textual guard — the detection audit remains the backstop; the native OS sandbox is macOS/Linux/WSL2
  only ("Native Windows is not supported"), so on Windows this hook is the operative prevention layer. With
  detection + prevention both live, attended flights on trusted targets are now defense-in-depth covered.

## [0.11.0] — 2026-08-07 — M4 checkpoint: the dashboard becomes a flight-control surface

Launch, watch, stop, search, and manage flights from the browser — the fleet home
is now a real control panel, not a read-only report. Retrieval (RAG) lands end to
end: every onboarded repo is full-text searchable, with the injection-defended
ask-prompt core ready for chat. Hardened by real incidents: a flight that escaped
its sandbox is now machine-detectably contained, and two dogfood flights on this
very repo each shipped a genuine fix (the autopilot improved itself, twice).

### Added

- **Remove a project from the dashboard.** Each fleet card now has a **Remove** button (confirms first) that
  clears the project from the store — its index, search rows, events, metrics, tasks, and backup refs — via a new
  `POST /api/project/delete` (CSRF-guarded) backed by a `deleteProject` store mutation (FK-cascade + explicit FTS
  clear). It **never touches the project's folder or git history** — only the dashboard record. Event-delegated
  button survives live re-renders; `axe`-clean. Store + endpoint tests (6).
- **Search a project's code from the dashboard (M4 RAG) — retrieval goes user-facing.** A new `/api/search`
  endpoint (`GET ?project=&q=`, a read — no CSRF) returns bm25-ranked hits with match snippets, degrading to no
  hits on any failure. A global **search bar** under the flight bar (project picker + query) shows results live;
  its project dropdown is kept in sync with the fleet by `renderFleet`, so it survives SSE re-renders, and hits
  render via the DOM API only (snippets are store text, never HTML). Validated end-to-end against real demo data
  (`billing-svc` "def" → `app.py` + `tests/test_app.py`). 4 endpoint tests; axe-clean.
- **Onboarding now builds the search index (M4 RAG) — real repos become searchable.** `refreshProjectIndex`
  takes an optional `ContentIndexPort` and mirrors the **same changed slice** it already computes into full-text
  search: added/changed text files are (re)indexed, removed ones dropped, and binary (NUL-sniffed) or oversized
  (>512 KB) files are excluded — so retrieval rides the identical incremental discipline as the metadata index
  (unchanged files are never re-indexed). Wired through `onboard()` and into the real `dashboard:fly` + `demo`
  paths (`SqliteSearchStore`), so every onboarded/flown project is queryable. 4 new indexer tests (searchable,
  changed-slice-only, remove, binary-skip).
- **Retrieval core (M4 chat/RAG foundation) — full-text code search over the index.** New store migration v4 adds
  a `project_search` FTS5 virtual table with the **trigram tokenizer**, so a query substring ("cart") matches
  inside a code identifier (`addToCart`) — the right default for code. `SqliteSearchStore` indexes a file's
  content (idempotent per path via delete-then-insert), searches it with **bm25 ranking** + a match `snippet()`,
  and scopes every query to one project. User queries are sanitized to word tokens (≥3 chars, de-duped, quoted,
  OR-joined) **before** they reach FTS5, so no query string can be a MATCH-syntax injection — the same discipline
  as parameterized SQL. 13 tests (substring hit, ranking, project scoping, idempotent re-index, removal, caps,
  injection-neutralization). Migrations stay append-only + checksum-frozen (v1–v3 untouched).
- **Stop a flight from the dashboard (M4) — the control loop closes.** The flight bar now shows a **Stop** button
  while a flight is in progress; it hits a new `/api/fly/stop` endpoint that SIGTERMs the child (the flight's
  finally-block still closes its store cleanly, so a stop is safe). `FlightRunner.stop()` requests termination and
  the runner goes idle only when the child actually exits — so a launch-then-stop leaves the runner free for the
  next flight. CSRF-guarded (`application/json`); the button reveals only while flying. 4 new tests (runner +
  endpoint).
- **Live activity map (M4) — file nodes on the flight rail.** The detail panel's Activity section now renders,
  below the ORIENT → DO → GATE → COMMIT phase rail, a map of the **files the agent is touching** — one node per
  distinct file, newest first, colored by the phase of its most recent touch (edit → DO, gate, commit), badged
  with its touch count, titled with the full path + last tool. Pure, event-derived `activityFileNodes` transform
  (7 unit tests) mirrored by the client renderer; updates live via the SSE stream so you watch *where* the work
  is happening in real time. Accessible (semantic list, axe-clean).
- **Fly a folder from the dashboard (M4) — the founder's core ask.** A new flight bar under the fleet totals
  takes a folder path + firing count and launches a **real flight** with one click — no CLI needed. Backed by a
  `/api/fly` endpoint (GET status, POST launch) and a testable `FlightRunner` that spawns the existing `fly`
  entry as an isolated child sharing the dashboard's cwd, so the flight writes to the **same store the
  dashboard reads** and the SSE stream surfaces it live as it happens. One flight at a time (cautious MVP);
  the run itself backs up before any work, gates every change, additively reverts on red, and is budget-capped.
  POST requires `application/json` (CSRF guard — a cross-site form can't launch a quota-spending run); the UI
  bar reveals only when the endpoint is wired and polls status so the button re-enables once the flight lands.
  Accessible (labelled inputs, `role=status` live region; axe-clean).
- **SSE live-stream (M4) — the dashboard updates in real time during a flight.** A new `/api/stream`
  Server-Sent Events endpoint pushes the whole fleet view on a fast cadence (1.5 s), so the phase rail,
  activity timeline, flight log, and cost/token graphs move **as the agent works** — no more waiting on a
  3 s poll. Same-origin only (CSP `connect-src 'self'`), loopback-bound, and the client keeps a slow poll
  as a fallback where `EventSource` is unavailable. Server test asserts the `text/event-stream` content-type
  and that the first chunk carries the live state.
- **Activity phase rail (ORIENT → DO → GATE → COMMIT).** The detail panel's Activity section now leads with a phase rail
  that classifies each of the agent's tool uses into its autopilot phase (reads/searches/listing → ORIENT, writes/edits
  → DO, test/build/typecheck → GATE, `git commit/add` → COMMIT) and shows the count per phase — the "watch it work" map,
  event-derived from real flights. Pure `activityPhase` classifier (tested); accessible (`role=img` + phase-count label).
  Real sandbox flight reads **ORIENT 4 › DO 1 › GATE 2 › COMMIT 1**.
- **Ask-your-project prompt core (M4) — retrieval-augmented Q&A with injection defense.** `buildAskPrompt`
  grounds an answer ONLY in excerpts retrieved from the project index, fences them as UNTRUSTED data between
  explicit `PROJECT_CONTENT` markers (forged markers are defanged so content cannot break out), and mandates a
  no-guess reply when the excerpts lack the answer. Pure + versioned (`ask-v1`), 5 tests. The endpoint + Ask UI
  build on this.

### Fixed

- **The Remove button no longer gets stuck disabled on a failed delete.** Its click handler called `refresh()`
  unconditionally after the fetch resolved — `fetch` only rejects on a network failure, not a 4xx/5xx response —
  so a failed `POST /api/project/delete` (bad id, server error) still looked like a success path. Because
  `renderFleet` skips its rebuild when the fleet data is unchanged (the SSE dedupe above), a failed delete left
  no changed data to trigger a rebuild, so the button stayed disabled with the text "Removing…" forever, with no
  error shown and no way to retry short of a page reload. It now checks the response status and re-enables the
  button on any non-ok result, same as the existing network-failure path. Regression test drives the real client
  bundle in jsdom against a mocked 404 response.
- **`/api/search` now honors its own "degrade on failure" contract** — found by dogfooding. A flight flown on
  AUTOPILOT itself noticed the search handler's docstring promised it degrades to no hits on a store error, but
  the call wasn't wrapped, so a locked/corrupt DB would throw uncaught. Now wrapped like every sibling handler,
  with a regression test. (The autopilot improved its own code.)
- **The live stream no longer re-sends an unchanged fleet.** The SSE endpoint pushed the fleet every ~1.5 s
  regardless of whether anything changed, so a client — _even one running older code without its own skip
  guard_ — repainted on every push (the "flash"). The server now dedupes: it compares each tick to the last sent
  (ignoring the timestamp) and sends **nothing** when unchanged. An idle dashboard gets one payload then silence,
  so the flashing stops at the source, independent of what the browser has cached.
- **A code change can no longer be masked by a cached bundle.** The shell now versions its asset URLs by a
  content hash (`/app.js?v=<hash>`, `/tokens.css?v=<hash>`), so any change produces a URL the browser has never
  cached — a fixed dashboard is delivered on a normal restart + refresh, no hard-refresh needed (belt to
  `no-store`'s suspenders). This is why an earlier fix appeared not to take: the browser kept running the old JS.
- **The dashboard no longer flashes every ~1.5 s.** The live stream ticks continuously, and the old render
  rebuilt the entire fleet DOM on every tick — even when nothing had changed — which read as a periodic flash.
  `renderFleet` now diffs the incoming data against what's displayed (ignoring the timestamp) and **skips the
  rebuild entirely when nothing changed**, so an idle dashboard is perfectly still; it repaints only on a real
  update. Test asserts the same card node survives an unchanged tick.
- **Flights are now diagnosable.** The flight child ran with `stdio: 'ignore'`, so a stall or crash on launch was
  invisible — the root of "Fly it did nothing." Its stdout/stderr are now captured to `.autopilot/flight.log`.
- **Onboarding survives an unreadable file.** `refreshProjectIndex` aborted the entire index (and thus the whole
  flight) if a single file read failed (locked, deleted mid-walk, permission). It now skips that one file and
  continues.
- **The project detail panel no longer snaps shut.** The SSE live stream re-renders the fleet every ~1.5 s, and
  the old render rebuilt every card from scratch — so an open `<details>` panel closed itself a moment after you
  opened it. `renderFleet` now remembers which panels are open (keyed by project id) and restores them after the
  re-render. Regression test drives the real client bundle through two renders.
- **"Fly it" now gives clear feedback and accepts the current folder.** Three fixes to the flight bar: (1) the
  folder input **prefills with the dashboard's own folder**, so flying "this folder" is one click; (2) a relative
  name (e.g. `AUTOPILOT`) is **resolved to an absolute path** server-side, so a wrong path fails with an honest
  `folder not found: <absolute path>` instead of appearing to do nothing; (3) the status line is now **colored and
  bold** on success/error, so the outcome is impossible to miss.

### Security

- **Flight containment audit — a HARD, machine-checkable escape detector.** Beyond the soft prompt rule, the
  engine now snapshots the HEAD of every repo that must NOT change during a flight (the dashboard's own cwd when
  the target is a different folder) and re-checks it **between every firing** and at the end. If a guarded repo's
  HEAD moved, the flight escaped its target — it **stops immediately, prints the breach, and exits non-zero** so
  an escape can never pass silently, with no cooperation from the agent required. Pure detector
  (`snapshotGuardedHeads` / `detectContainmentBreaches` / `guardedPathsFor`, 7 tests) + a sync `GitHeadReader`
  adapter; wired into `dashboard:fly`. Dogfooding (target == cwd) guards nothing, so it never false-alarms.
- **Flight containment — the soft control.** A validation flight, run on a sandbox placed _under_ the AUTOPILOT
  repo, used its `Bash` tool to `cd` out of the sandbox into the parent repo and commit there — Claude Code jails
  its file tools to the working dir but **does not jail Bash**. Mitigation: the firing prompt (`firing-v2`) now
  names the target path and forbids leaving it as a CRITICAL rule. Real _isolation_ (OS sandbox / a `PreToolUse`
  path allow-list) is still the end goal; the audit above is the detection backstop until then. See
  [`docs/FLIGHT-CONTAINMENT.md`](docs/FLIGHT-CONTAINMENT.md).
- **Onboarding no longer indexes AUTOPILOT's own working dir.** `.autopilot` / `.autopilot-run` are now in the
  ignore set, so flying the tool on itself can't index the live SQLite DB or `connection.json` (which holds auth
  secrets in key/token mode) into the searchable index. Also added `.hg` / `.svn` / `.idea` / `.vscode`.

### Verified

- Full gate green at release: **379 tests / 56 files**, ~92% statement coverage, typecheck + lint + format +
  build + secret-scan + no-personal-paths + validate-configs + SPDX all clean.
- Retrieval validated end-to-end on real demo repos; the fly/stop/delete endpoints smoke-tested over a live
  socket; a11y (axe, WCAG A/AA) standing tests still clean.
- Two dogfood flights on AUTOPILOT itself shipped gate-verified fixes that were byte-reviewed and adopted.

### Remains (M4 completion — tracked in FEATURE-COVERAGE §D)

- Conversational ask/chat endpoint + UI on the ask-prompt core; per-project "inside page" with tasks +
  management; local embeddings + hybrid BM25/vector ranker; retrieval-as-MCP; unified task entity + inbox.
- Flight isolation that PREVENTS (not just detects) an escape: a PreToolUse path allow-list / OS sandbox
  (docs/FLIGHT-CONTAINMENT.md). Flights stay developer-only + attended until then.
## [0.10.0] — 2026-07-11 — M3 complete: the live flight (real Claude ships gated commits, watched live)

Point AUTOPILOT at a folder and it flies it **for real** — Claude picks work, does
it, the gate verifies, and it ships or additively reverts — with the dashboard
showing the flight **live**: flight log, cost/token graphs, and the agent's activity
timeline. The M3 Definition of Done is met **with a real LLM**, not scripted. Built
in gated TDD slices; validated on a sandbox (6 firings, 5 shipped, ~$0.6/shipped).

### Added

- **Live activity capture — the activity-map groundwork (M4).** The live flight now streams
  `--output-format stream-json` and parses every NDJSON event, recording each **tool the agent uses** in real time —
  Bash commands, Read/Write/Edit file paths, Grep queries — to the events log, tagged by firing (`@autopilot/engine`
  `stream.ts` + `StreamingClaudeCliModel`, a drop-in `ModelPort`). The dashboard detail panel gains an **Activity**
  timeline (tool badges + targets), so you can see *what the agent actually did* — the seed of "watch it work".
- **Metrics graphs (on real flight data).** The fleet totals now include **cost**, and each project's detail panel has a
  **Metrics** section — total cost · tokens · ship-rate, plus a **cost-per-firing sparkline** (accessible SVG, green =
  shipped / red = reverted, chronological). Powered by `firingStats` now summing `cost_usd`/tokens and `recentFirings`
  carrying per-firing cost/tokens/turns. Renders only when there's real spend (the $0 scripted demo shows no sparkline).
  Verified against the first real flight ($0.76, 23.1k tokens, 50% ship-rate).
- **Live flight — `pnpm dashboard:fly <folder> [firings]`.** The real thing: onboards a target folder (backup
  MYTH/LEGACY/flight → detect gate → index → SOUL), then flies it with the **real Claude** (`ClaudeCliModel` on your
  subscription auth), running the **detected gate** via `GateRunner` and a ported v2.4 **firing prompt**
  (`@autopilot/engine`) — ONE small, gated unit of work per firing, committed with an un-fakeable METRICS self-report
  the engine cross-checks against git, additively reverted on red. Budget-capped (**$2**) and a single cautious firing
  by default; the backup happens BEFORE any work. **`pnpm dashboard:reset`** clears the demo fleet (keeps your login)
  for a clean real run.
  - **Proven end-to-end (first real flight).** Claude **Sonnet 5** flew a sandbox and, unprompted, noticed its test
    script only ran `node --check` — so it added a real `node:test` suite covering `sum`/`average` **including the
    empty-array edge case**, wired it into the gate, the gate **ran and passed**, and it shipped a **sha-verified**
    commit ($0.76 · 20.6k in / 2.5k out · 11 turns · 60s). The M3 "ships ≥1 gated commit, live" bar is met with a real
    LLM. The run also surfaced + fixed three engine bugs (numeric `api_error_status`, the quota-limit pattern, the
    fable default).
- **Connect screen in the dashboard** — a first-class connect interface (the M5 "membership connect", pulled forward on
  request). An accessible `<details>` panel shows live connection status with an **unmistakable status dot** (green =
  connected) that also surfaces on the panel's label, plus a **"Log in with Claude"** button that launches the official
  `claude` browser login in a terminal and then auto-polls until the panel flips to Connected. You can also choose
  **Subscription (default) / API key / headless token** and save.
  - **Honest readiness (bug fix):** the status no longer claims "connected" just because the CLI is _installed_. For
    subscription it now checks the real **credentials file** (`~/.claude/.credentials.json` per the official paths), and
    a **"Test connection"** button runs a real minimal `claude -p` to _definitively_ confirm auth (catching an
    **expired** login a file-check can't) — on demand, so it only spends a sliver of quota when you ask.
  - Backed by
  `GET/POST /api/connection`: GET returns status that **never** includes the secret; POST is **CSRF-guarded** (requires
  `application/json`, which a cross-site form can't send without a preflight this loopback server never approves) and
  size-capped; the credential is persisted to a git-ignored `0600` file and never logged or echoed. This is the
  dashboard's first write-capable surface — scoped to connection settings only.
- **Claude auth / connection layer** (`@autopilot/engine`) — how AUTOPILOT authenticates the local `claude` CLI, with
  the user's **Claude subscription (Pro/Max/Team) as the default** (no API key, no per-token bill), and **API key** or a
  headless **subscription OAuth token** (`claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`) as opt-in modes. A pure
  `resolveClaudeEnv` builds the spawned CLI's environment per mode and — critically — **strips a stray
  `ANTHROPIC_API_KEY`** in subscription mode, because in headless `-p` mode a key present in the environment silently
  overrides the subscription login (per the official credential precedence,
  [Claude Code IAM docs](https://docs.anthropic.com/en/docs/claude-code/iam)). `ClaudeCliModel` now applies it; secrets
  live only in the runtime config, never hardcoded or logged. (Foundation for the M5 "membership connect" settings UI.)
- **`GateRunner` engine adapter** (`@autopilot/engine`) — the missing bridge between M2's gate _detection_ and M1's gate
  _execution_. Runs a detected command list (typecheck/test/build) in order, **argv-only (no shell string → no
  injection)**, failing fast on the first non-zero exit; a spawn failure (missing binary) or timeout also fails the gate.
  **Cross-platform:** on Windows, bare commands (`pnpm`/`npm`/`tsc`, which are `.cmd` shims `execFile` can't launch
  directly) are routed through `cmd.exe /c` so PATHEXT resolves them, while `.exe`/pathed binaries spawn directly — via
  a pure, platform-parameterized `buildInvocation`. Decoupled from onboarding's `GateSpec` shape (the caller maps it),
  with an injectable exec seam for tests. The `dashboard:flight` demo now gates through this production adapter.

### Verified

- `pnpm run verify` green: **298 tests** across 49 files; ≥80% coverage; typecheck · lint · format · build ·
  secret/PII/config/SPDX gates.
- **Real live flight** (Claude Sonnet 5, your subscription): onboards → backs up → detects gate → indexes → flies →
  gates → ships a **sha-verified** commit. 6 sandbox firings, 5 shipped (the 1 miss was a quota-fallback bug the run
  itself exposed + fixed); ~$0.6/shipped; a coherent arc (tests → input validation → docs). Activity + metrics render
  live and are axe-clean.

### Remains (polish / next milestones)

- **Activity map** is currently an event-derived **timeline** (tool badges + targets); an animated ORIENT→…→COMMIT
  **rail with file-touch nodes** is a follow-up.
- **Efficiency levers** (M6): context is heavy (~20k input/firing, carried by 2.26M cache-read) — local offload +
  cheaper models for mechanical work will lower cost/shipped.
- Multi-project parallel supervisor (M7), review sub-fleets + domain checkboxes (M8), and the approvals/Decider
  boundary (M5) — tracked in [FLEET-ORCHESTRATION.md](docs/FLEET-ORCHESTRATION.md).

## [0.9.0] — 2026-07-09 — M3: read-only dashboard (MVP + live-flight core)

The read-only dashboard is live: point a browser at localhost and watch a fleet of
projects — including one **actually flying**, with a real, gate-verified flight log.
Built in gated TDD slices (docs/M3-DASHBOARD-PLAN.md). This is the M3 **MVP**; the
remaining M3 visualizations (graphs-over-time, activity map) and the live-LLM
harness are called out under **Remains** below — no overclaiming.

### Added

- **`@autopilot/tokens`** — the design-token system: theme-invariant primitives + OKLCH semantic colors, with three
  switchable themes (**dark** / **light** / **terminal**). A pure OKLCH→luminance contrast core enforces WCAG AA by test.
- **`apps/dashboard`** — a hardened localhost server (CSP · DNS-rebind guard · loopback-bound) serving a token-themed
  shell with a live theme switcher, plus safe **start/stop/status/restart/doctor** lifecycle control (signals only the
  recorded pid) and double-click launchers. Run: `pnpm dashboard:start`.
  - The launchers now **open the dashboard in your browser** automatically — but only after a readiness probe
    (`waitForHealth`) confirms the freshly-spawned server is actually listening, so the page never opens on a
    connection-refused flash. Browser-open is argv-only (no shell) and can be disabled with `AUTOPILOT_NO_OPEN=1`.
  - The `.cmd` launchers now **keep their window open** (they no longer flash-close, which read as a crash) and surface
    build / missing-`pnpm` errors instead of vanishing.
- **Live Fleet read-model** — the dashboard now shows real data that updates. `@autopilot/store` gained read-only
  aggregation helpers (projects · index summary · firing/ship stats · open-findings severity gauge · last activity); a
  pure `buildFleetView` rolls them into the Fleet view model; `GET /api/state` serves it as JSON; and the client polls
  it every 3s, rendering project cards + a severity gauge + a totals strip via DOM APIs only (never `innerHTML`, so
  store-sourced names can't inject markup). Reads the store fresh per request (a project onboarded _after_ the dashboard
  starts appears live) and degrades to an honest empty state when there is no store/data yet.
- **`pnpm dashboard:demo`** (also `DEMO-DASHBOARD.cmd`) — seed the dashboard with three real sample repos
  (TS / Python / Go) put through the **actual** onboarding pipeline (backup ritual → gate detection → content-hash
  index) into the real store. Not fabricated telemetry: stacks, file counts, and languages are real; firings/findings
  are honestly empty until a project flies. Idempotent (re-running resumes); all artifacts live under git-ignored
  `.autopilot/`.
- **Accessibility — axe-core clean (the M3 DoD bar).** Added a keyboard skip-link, a focusable labelled `main`
  landmark, visible `:focus-visible` outlines, and a `prefers-reduced-motion` guard that disables all transitions. An
  automated a11y test renders the real shell **and** executes the real client to paint live cards, then asserts **zero**
  WCAG 2.0/2.1/2.2 A+AA violations (axe-core in jsdom); color-contrast stays covered by the token package's contrast
  tests. This is now a standing gate.
- **Project detail** — each fleet card now has an accessible `<details>` expander showing real index data: a
  language-composition bar (by bytes) + legend, top directories, hot files, the detected gate, and backup status.
- **Flight log** — the detail panel now lists a project's recent firings (newest-first): item · kind · shipped/reverted
  verdict · short sha · age, read from the real `metrics` projection. After `pnpm dashboard:flight` it shows the real
  gate-verified firings the engine just made. Store gained a `recentFirings` read helper.
- **Versions projection made real (fixes a data gap).** The onboarding backup ritual created the MYTH/LEGACY/flight git
  refs but never recorded them in the `versions` table, so the dashboard couldn't truthfully show backup state. Onboarding
  now records those refs into `versions` (idempotent — safe on re-lock and backfills older projects), and the store
  gained a `backupTiers` read helper. The card only claims "backed up" when the store actually records it.
- **`pnpm dashboard:flight`** (also `FLY-DASHBOARD.cmd`) — actually **fly** a demo project so the dashboard shows a live
  flight with real telemetry, not just a registration. Runs the **real M1 engine loop** over real adapters (git +
  SQLite) on a self-contained repo: each firing makes a gate-valid change and commits it; a **real gate** (`node --check`)
  verifies it; the engine keeps it (or additively reverts on red) and writes real events + metrics (gate-verified
  `shipped`, un-fakeable sha cross-check). The only simulated part is the "thinking" — a scripted agent stands in for the
  live `claude` CLI, so **no model runs and cost/tokens are honestly $0**. Result: `flight-demo` appears **flying** with
  5 firings · 5 shipped · 100% ship rate · real activity.

### Housekeeping

- Moved `MASTER-PLAN.md` + `KICKOFF-PROMPT.md` into `docs/` (root declutter; fixes their sibling links); added
  `docs/README.md` as the doc index; refreshed `README.md` to the current built state.

### Verified

- `pnpm run verify` green: **234 tests** across 42 files; ≥80% coverage; typecheck · lint · format · build ·
  secret-scan · no-personal-paths · config · SPDX gates all pass.
- End-to-end: `dashboard:demo` onboards three real stacks (TS/Py/Go); `dashboard:flight` flies `flight-demo`
  (**5 firings · 5 gate-verified ships · distinct real shas · $0**); the live server serves `/`, `/api/state`,
  `/api/health`, `/tokens.css`; the rendered fleet + flight log are **axe-clean** (WCAG A/AA).

### Remains (M3 completion — tracked for a follow-up release)

- **Metrics graphs over time** (cost / shipped / tokens / turns / ship-rate) — the data already lands in `metrics`;
  degenerate on the $0 scripted demo, meaningful once a real-LLM flight runs.
- **Activity map** (ORIENT→PICK→DO→GATE→COMMIT rail + file-touch nodes) — needs the engine to _stream_ per-phase
  events (overlaps M4's live-stream work).
- **Live `claude` harness** — swap the scripted agent for the real LLM `ModelPort` (real spend; may dogfood this
  repo). The `m3` milestone tag is intentionally **deferred** until these land; `0.9.0` ships the dashboard MVP.

## [0.8.0] — 2026-07-08 — M2: onboarding (lock onto any project, safely)

AUTOPILOT can now lock onto any repo — safely and stack-agnostically. Built in
gated TDD slices (docs/M2-ONBOARDING-PLAN.md).

### Added
- **Gate auto-detection** (`@autopilot/onboarding`): a pure, read-only detector
  over an `FsSnapshot` returns a `GateSpec` (typecheck/test/build/lint, ecosystem)
  of argv-array commands (no shell → no injection) that drive the engine's
  GatePort — across JS/TS, Python, Go, Rust, with confidence tiers + multi-stack
  ambiguity.
- **Content-hash project index** (store migration **v3**): per-file SHA-256 + a
  summary row; incremental refresh persists only the delta (unchanged rows are
  never rewritten — the rolling residue that collapses the 124:1 re-read); re-lock
  with no change is a no-op resume.
- **Folder-lock backup ritual** — the cardinal rule (MASTER-PLAN §7): back up
  BEFORE any git action. MYTH (pristine) + LEGACY (baseline) tags + the
  `autopilot/flight` branch; additive-only (never `reset --hard` / force-push /
  touch `main`); a seen repo resumes. `assertBackedUp` is the guard the engine
  calls before its first firing.
- **Onboard orchestrator + starter SOUL + board**: lock → detect → register (or
  resume) → index; generates a starter SOUL (stack + gate + operating rules,
  editable/locked-by-default) and seeds the board.

### Verified
- 156 tests, ~96% coverage. The **M2 DoD e2e** (real git + real SQLite) onboards
  3 different-stack repos (TS/Python/Go): each backed up + gate-detected + indexed;
  re-lock resumes (no dup, empty diff); detect+index add **zero commits** (the
  snapshot precedes any touch).

### Remaining
- **Dogfooding** (register AUTOPILOT's own repo as project #1) is available but
  not auto-run — it would move the repo onto `autopilot/flight`, a working-branch
  change deferred to founder approval. Deep architecture/convention mining, a
  git-churn hot-file ranking, and a `.gitignore`-precise GitFileSource are tracked
  (BACKLOG).

## [0.7.1] — 2026-07-07 — M1 hardening (completeness-audit fixes)

An adversarial "nothing forgotten" completeness audit (5 dimensions + a verify
pass) found and fixed several issues before moving on.

### Fixed
- **Integrity (G2):** `shipped` trusted the agent's self-report — a "shipped"
  claim with no commit was recorded as shipped. Now `shipped` requires a
  gate-passed real commit (git is ground truth). Migration **v2** makes the
  `head_advanced` / `sha_verified` cross-checks queryable in `metrics`.

### Changed
- **No private data:** neutralized every local drive-absolute path across the
  docs and **extended the CI gate** to fail on any such path going forward.
- **Honesty:** M1 is qualified as the **machine-verifiable** DoD; the live-CLI
  dogfood run + v2.4 behavioral diff are tracked (BACKLOG §K), not claimed done.
- **Standards:** OpenTelemetry re-scoped M1→M3; PATTERNS §8 pre-1.0 SemVer
  wording fixed; G8 (retro) milestone reconciled. **DCO** sign-off is now
  machine-enforced (commitlint rule).

### Added
- `RELEASING.md` (versioning / tag / changelog policy); the two missing
  FEATURE-COVERAGE rows (review-agent harness pack; multi-harness registry).

## [0.7.0] — 2026-07-07 — M1: the engine flies headless (machine-verifiable DoD met)

The proven internal v2.4 autopilot loop is ported to a cross-platform TypeScript
engine, built in gated TDD slices. The **machine-verifiable** M1 DoD is met via a
deterministic sandbox e2e: the engine runs headless and ships a **gated** commit
(tree stays green, or reverts cleanly), telemetry lands in SQLite, and STOP is
honored. The two experiential DoD clauses — a **live-CLI dogfood run** and a
**behavioral diff against the running v2.4 script** — are tracked below, not yet done.

### Added
- **Pure core** (`packages/engine`): the model-resilience/quota state machine
  (promote-on-exhaustion, time-based re-probe, escalating hibernation), the
  un-fakeable telemetry record (parse the `METRICS:{…}` self-report; derive from
  the commit when it is missing; force `envelope-error`), the atomic firing
  orchestrator (quota fallback → global-exhaustion detection → sha/HEAD
  cross-check → telemetry), and the STOP-aware outer loop (retro cadence,
  restart-safe state, cost/churn alert, hibernate-vs-pace).
- **Hardening beyond v2.4**: the engine itself runs the gate after a commit and
  **additively reverts** (`git revert`, never `reset --hard`) any commit that
  fails it, recording the revert honestly (`shipped=false`).
- **Adapters**: `ClaudeCliModel` (spawns `claude -p` on the user's own
  subscription auth; binary from PATH, no personal path; tested envelope parser),
  `GitVcs`, `SqliteFiringStore` (events + queryable metrics), `FsControl`
  (STOP/state/prompt/sleep), `SystemClock`.

### Verified
- 103 tests, 94% coverage. A **sandbox e2e** over the real loop + real
  git/SQLite/fs (scripted agent making real commits) proves: ships ≥1 gated
  commit, telemetry in SQLite, clean additive revert on red, STOP → zero firings.
  Deterministic, offline, no spend.

### Remaining (tracked in BACKLOG §K)
- A **live-CLI dogfood run** (real `claude` on a repo) + a **behavioral diff
  against the running internal v2.4 script**; per-project **single-instance lock**;
  the **adaptive-cadence/weekly-pacing advisor**; **long-prompt-via-stdin**; the
  **OTel wire-format** export (M3). Gate **command** auto-detection is M2 by design.
- `G8 learnings + retro`: the loop's retro **cadence** is done; the retro prompt
  content + learnings curation land with the SOUL at M2.

## [0.6.0] — 2026-07-07 — M0: foundations & standards (the build begins)

The first milestone from `docs/ACTION-PLAN.md` — the standards-first monorepo scaffold — is complete and green.

### Added
- **Monorepo** (pnpm workspaces): `packages/engine` (hexagonal ports), `packages/onboarding`, `packages/store`,
  `packages/mcp`, `apps/dashboard`. Strict TypeScript (project references + `tsc -b`), ESLint 9 flat config, Prettier,
  Vitest.
- **SQLite store** (`@autopilot/store`): the five-table schema (projects, events, metrics, tasks, versions) with STRICT
  typing, foreign keys, and CHECK-constraint allow-lists (severity × dimension per MASTER-PLAN §16.1), plus a
  transactional, idempotent, checksum-drift-guarded migration runner with a database-newer-than-build guard. Proven by
  tests: **the schema migrates**.
- **CI** (`.github/workflows/ci.yml`): cross-platform matrix (Ubuntu/Windows/macOS) running typecheck · lint · format ·
  test + coverage ≥80% · build · secret-scan · no-personal-paths · validate-configs · SPDX-headers, plus a PR commitlint
  job; least-privilege token, job timeouts, `persist-credentials: false`.
- **Licensing/standards**: Apache-2.0 + per-file SPDX headers + REUSE.toml; Conventional Commits (commitlint + husky
  hook); Keep-a-Changelog; SemVer.
- **Community health**: CONTRIBUTING, CODE_OF_CONDUCT (Contributor Covenant), SECURITY (48h/7d/30d disclosure SLAs),
  GOVERNANCE, issue/PR templates, CODEOWNERS, Dependabot.
- **CI validators** (`scripts/ci/`): format-based secret scan, personal-path/PII guard (incl. WSL/Git-Bash homes),
  config-shape validator, and an SPDX-header gate — enforcing "no private data, ever."

### Verified
- Full gate green on Windows/Node 22.12/pnpm 10.33: 34 tests, 100% statements/functions/lines, 96% branch. `pnpm
  install --frozen-lockfile` reproducible; better-sqlite3 native binding loads (SQLite 3.49.2).
- **Adversarial review** — a 5-dimension review workflow (licensing/security/TS-build/store-schema/DoD) plus a dedicated
  security-reviewer pass — confirmed M0 complete, DoD met, **zero critical/high** issues. Hygiene fixes applied: REUSE
  coverage for the husky hook, canonical license copy, CI-enforced SPDX, enum↔CHECK drift test, DB-newer-than-code
  guard, exact-filename scanner exclusions, extra secret patterns, CI timeouts/persist-credentials.

### Baseline
- Git initialized; the pristine pre-code planning state is tagged `myth-baseline` (MYTH). M0 lands on `main`.

## [0.5] — 2026-07-06 — Definite action plan, feature coverage, dogfooding + packaging
- **The definite build plan** → `docs/ACTION-PLAN.md`: milestones M0–M9, each with explicit deliverables + a binary
  Definition of Done, dependencies, sequencing (MVP = M0–M3), risks + mitigations, and "no open questions" (all locked).
- **Nothing forgotten** → `docs/FEATURE-COVERAGE.md`: a traceability matrix of EVERY feature from EVERY plan → its spec
  doc → its milestone. The "no feature forgotten" contract.
- **AUTOPILOT builds itself (dogfooding)** → `MASTER-PLAN.md` §18.1: from M1, AUTOPILOT flies its own repo as a
  continuous self-test; the dogfooding proof is a first-class DoD.
- **"Pack for a friend" + packaging** → §18.2-3: `pack` → a shareable zero-private-data package; a landing site with ALL
  explanations + ONE Install-&-Load button (installs from 0); product-grade `run`/`stop`/`doctor`/`update`/`pack`/
  `uninstall`; loads with all default features, waiting to lock; everything changeable behind approval + impact.
- Doc set now: MASTER-PLAN → ENGINE-RESEARCH → MDVIEWER-STUDY → REACTIVITY → PATTERNS-AND-STANDARDS → ACTION-PLAN →
  FEATURE-COVERAGE → BACKLOG-999.

## [0.4] — 2026-07-06 — Reference study, reactivity, and standards backbone
- **Studied the reference implementation.** Located MdViewer/ECC locally and produced a deep,
  file-cited map → `docs/MDVIEWER-STUDY.md`. Extracted the five "gold" mechanisms: spawn-local-CLI→SSE chat with
  mode-tiered tool authority + SOUL personas; dual observability (EventEmitter→SSE + chokidar→WS with `__live__`
  echo-suppression); curated+MCP RAG (no vector DB) with the `<<< PROJECT_CONTENT >>>` injection defense;
  task/handoff/status worktree-orchestration contract; catalog→install-target adapter registry.
- **Designed the reactivity layer** → `docs/REACTIVITY.md`: talk-to-each-autopilot (chat + best-in-class hybrid RAG:
  SQLite FTS5 + local embeddings + BM25/vector ranker), task assignment (one unified task entity), and LIVE view — the
  in-chat text, a turn-grouped timeline, and the **abstract activity map** (minimal, correct, event-derived).
- **Adopted the patterns + regulatory/known standards** → `docs/PATTERNS-AND-STANDARDS.md`: hexagonal ports/adapters,
  event-sourcing/CQRS-light, OWASP ASVS + LLM-Top-10, SLSA + OpenSSF Scorecard, OpenTelemetry, WCAG 2.2 AA + ARIA APG,
  Unicode/CLDR/ICU i18n, SemVer + Conventional Commits + SPDX/REUSE + community-health files, and the AI-agent
  operating principles. (Founder's correction addressed: real standards adopted now, not "a list to expand later.")
- **Efficiency levers made concrete** (from `docs/ENGINE-RESEARCH.md`): local offload default, cost-aware model routing,
  incremental project index (kills the 124:1 re-read), test-impact sampling gate, warm agent session.

## [0.3] — 2026-07-06 — Verification boundary + agent evolution
- `MASTER-PLAN.md` §17: the explicit line between what the agent verifies 100% itself (autonomous) and what REQUIRES a
  human (🟣) — because the software serves living beings; the human verdict is the **evolution/fitness signal**.
- §15 open questions resolved with defaults (name AUTOPILOT, TypeScript engine, Apache-2.0, read-only MVP first, sandbox
  test repo) per the founder's latitude to proceed at pace.

## [0.2] — 2026-07-06 — Progression model + inbox
- `MASTER-PLAN.md` §16: the color/severity × dimension **readiness gauge** (RED→…→🟣needs-you→🔵STABLE→🟢completed),
  and the **Autopilot Inbox** + fully-autonomous **Triage** task-intake (never stall).

## [0.1] — 2026-07-06 — Founding master plan
- Created the separate, standalone AUTOPILOT project with `MASTER-PLAN.md`, `README.md`, `docs/BACKLOG-999.md`,
  `docs/ENGINE-RESEARCH.md`. Vision, feasibility (de-risked — the v2.4 loop is proven), architecture, phased roadmap,
  MVP scope. Brand: 1337 · REL AZEUS · MΔSTERMIND. License: Apache-2.0. Engine: TypeScript.

---
*The current document set (read in this order): `MASTER-PLAN.md` → `docs/ENGINE-RESEARCH.md` → `docs/MDVIEWER-STUDY.md`
→ `docs/REACTIVITY.md` → `docs/PATTERNS-AND-STANDARDS.md` → `docs/BACKLOG-999.md`.*
