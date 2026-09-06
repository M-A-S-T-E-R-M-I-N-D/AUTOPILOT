# Changelog — AUTOPILOT

Chronological record of the project's founding documents, decisions, and build milestones.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org)
(bumps computed from Conventional Commits since the last tag — feat ⇒ MINOR, fix ⇒ PATCH; 1.0.0 only at the M9 launch milestone — see [`RELEASING.md`](docs/RELEASING.md)). Newest first.

## [Unreleased]

## [0.25.0] — 2026-09-06

### Added

- feat(i18n): translate the Firing Replay playback controls' text, aria-label, and tip
- feat(i18n): translate the project and task status pills' label, tip, and composed aria-label
- feat(i18n): translate the live worker card's label, phase prefix, task lines, and line tips
- feat(i18n): sweep [data-i18n-aria-template] and translate the live worker card's tool/target line

### Fixed

- fix(e2e): pump the frozen clock until the flight log paints — the theme-biased gate race

## [0.24.0] — 2026-09-06

### Added

- feat(i18n): translate the fleet card gauge-label tips and last-activity aria prefix
- feat(i18n): translate the Tasks "Add a task" form via data-i18n keys
- feat(i18n): translate the SOUL propose, github-sync, and github-pr handler status lines via tr()
- feat(i18n): translate the Inbox "Drop a note" form and its status lines

## [0.23.0] — 2026-09-05

### Added

- feat(i18n): translate the searchbar's five data-tips via tr()
- feat(i18n): translate the fly-bar Browse button's data-tip via tr()
- feat(i18n): translate the REPORT EXECUTE confirm dialog via tr()
- feat(i18n): translate the Remove/Start-over card buttons via tr()
- feat(i18n): translate the RELEASE EXECUTE confirm dialog (#18)
- feat(i18n): translate the masthead tour button's data-tip via tr()
- feat(i18n): translate the masthead OTLP chip's data-tip via tr()
- feat(i18n): translate the masthead notify popover's data-tip via tr()
- feat(i18n): add Hebrew translations for the Release-phase select (#15)
- feat(dashboard): doc-freshness tracks FLIGHT-CONTAINMENT.md's own guard files
- feat(dashboard): over-the-air update banner — one click to latest, zero clobbered progress
- feat(calculator): add a percent key — divide-by-100, wired end to end
- feat(dashboard): grid-wrap disconnected pipeline lanes, firing-ordinal labels
- feat(dashboard): queue for a human any PR that deletes a test — KEEPER's first improves verdict
- feat(dashboard): queue a PR that deletes a test file — KEEPER's first genuinely-improves verdict
- feat(release): the ritual writes its own release notes — no more placeholder tags

### Fixed

- fix(ci): give the doc-commit-refs job its pnpm setup step
- fix(engine): deny a git commit that hand-writes its own Signed-off-by trailer (#17)
- fix(ci): the doc-commit-refs job invokes the pnpm alias its own gate census pins
- fix(dashboard): hide the Windows console on every spawned child (#19)
- fix(dashboard): restore fly.ts's live-lock flight-vs-flight race guard
- fix(dashboard): fly.ts worktree-fallback refuses a live flight-vs-flight race
- fix(ci): retry dependency-audit with backoff instead of failing on a registry outage
- fix(dashboard): issue triage reserves good-first-issue labels for humans
- fix(dashboard): restart() confirms the old server died, kills whoever squats the port
- fix(dashboard): re-triage before Apply — pin KEEPER PR review execute to the previewed head SHA too
- fix(dashboard): the hidden update banner actually hides — [hidden] guard beats display:flex
- fix(dashboard): appease all seven census guards the OTA banner tripped
- fix(dashboard): translate the masthead's offline-retrying status text (#13)
- fix(deps): pin transitive qs override to >=6.16.0, close 2 moderate CVEs (#14)
- fix(dashboard): translate the CONNECT popover's first-paint status text
- fix(dashboard): persist an INBOX note's full body on its task record

## [0.22.0] — 2026-09-04

### Added

- feat(dashboard): release-maturity intelligence — the ritual knows an alpha when it cuts one
- feat(i18n): translate the fly-bar HINT sentence to Hebrew via injected tr
- feat(i18n): translate the DETECTED BACKLOG panel's remaining states to Hebrew
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
  machine can carry right now (RUNBOOK §12).** The 2026-09-03 incident —
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
  in posted review bodies (epic 0007 slice 4).** Every
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
  `docs/archive/EVALUATION-2026-09-02-cockpit-baseline.md`. Only i18n coverage
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
  sync merge trips over — measured as non-overlapping
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
  no double-click-adjacent onramp. Matching `.sh` scripts now
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
  (control-execute wiring, persona toggle, action-card rendering — all
  three slices) — meaning the post-flight sweep could never flag
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

---
*Versions before 0.14.0 (the project's founding through v0.13.0) live in
[`docs/archive/CHANGELOG-PRE-0.14.0.md`](docs/archive/CHANGELOG-PRE-0.14.0.md).*
