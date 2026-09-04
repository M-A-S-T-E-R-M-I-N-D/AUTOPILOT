<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0007. The platform — one canonical main, a maintainer autopilot, a contributor pool

Status: Active — first slices landed: the maintainer-autopilot's PR review
(`flight/pr-review.ts` + `pr-review-execute.ts`) and KEEPER issue-triage/github-sync
endpoints (2026-08-16..17); canonical-lock, review ritual, and report-from-here
remain open board slices; the contributor pool client (slice 6) shipped end to end —
browse/claim/fly/deliver all landed; slice 7's publicity affordances have also
shipped end to end — page upkeep continues as a live KEEPER duty, not a closeable
deliverable (status refreshed 2026-08-28).

Founder directive (2026-08-14, expanding epic 0006): the moment the infrastructure
lands, there is exactly ONE canonical main version. **MASTERMIND is the sole manager of
the social side** — and manages it WITH their agent: the autopilot itself triages
incoming bugs, reviews contributor proposals, merges what is essential-and-improving,
resolves conflicts, and keeps docs/page/main branches — autonomously on the founder's
behalf. Everyone else connects with their OWN GitHub user: works on their own projects,
or collaborates upstream — claiming tasks from a shared pool, proposing tasks, checking
bugs, fixing things, alone or with other contributors — donating their "unwasted
tokens" as FIRE for the LTS. The goal: a platform with many developer-partners, joining
easily.

## Governance invariants (non-negotiable)

- **One canonical main.** `main` + tags + Releases on the canonical repo are the only
  version of record; branch protection allows exactly one writer: MASTERMIND (and the
  agent acting under that identity). Contributors interact through forks, PRs, and
  issues — never direct writes.
- **The un-fakeable chain extends to social actions.** Every maintainer-autopilot
  merge/close/label/comment is telemetry (events), every merged PR passed the FULL
  verify in CI first — an agent's judgment never substitutes for the gate.
- **Security-hard rule (standing lesson):** PRs touching guard/containment/auth/CSP
  paths are never auto-merged — they queue for MASTERMIND's human eyes, always.
- **A contributor's machine stays private.** Nothing leaves a co-pilot's machine
  except what they explicitly submit (a PR, an issue, a context bundle they reviewed).

## The maintainer autopilot (MASTERMIND's side)

A new flight discipline ("KEEPER" rituals) run under the founder's gh identity:
1. **Issue triage:** analyze each incoming report — reproduce if cheap, dedupe against
   board/backlog/known-fixed, rank severity/importance, label, answer with reasoning;
   accepted issues become board tasks (source `'github'`).
2. **PR review:** run the gate, byte-review the diff (never trust the description),
   verify necessity (not already fixed; actually improves), resolve conflicts,
   merge policy-green PRs with a reasoned comment; request changes otherwise. Policy
   is operator-configurable (which classes may auto-merge; defaults conservative).
3. **Docs & page upkeep:** README/docs freshness (DOC-FRESHNESS task's machinery),
   Releases notes, the repo's public face — autonomously.
4. **Discussions triage + reply:** read GitHub Discussions, classify, draft replies,
   post clearly-autonomous responses. Scoped, not yet sliced — see Slices §8.

## In-app contextual feedback (every surface, one click)

When GitHub-connected, EVERY dashboard region offers "report from here": captures a
screenshot of the region, its DOM/context, and — post shell-decomposition — the exact
module sources behind it (TS/CSS/HTML), plus a description field. One-click outcomes:
- **File a bug** upstream (`gh issue create` with the context bundle);
- **Propose a quick fix** (branch + named commit + `gh pr create`);
- **Add a local board task** (the existing task API);
- **Offer to the shared pool** (upstream issue labeled `pool`).
Nothing is sent without the operator SEEING the bundle first.

## The contributor pool (everyone's side)

GitHub-native — the pool IS the canonical repo's issue tracker:
- Labels shape the pool: `pool:open`, `pool:claimed`, `good-first-firing`, severity.
- From their own dashboard, a connected co-pilot browses the pool, **claims** a task
  (assign/comment), flies it LOCALLY on their clone with their own tokens, and
  delivers a PR referencing the issue. Collaboration happens in issue threads.
- The maintainer autopilot closes the loop (triage in, review out).
- Publicity affordances for the public-day: repo links, watch/star buttons, discussion
  links — surfaced in-app, dormant while private.

## Constraints

- Everything shells through `gh` under each user's OWN login (epic 0006's doctrine);
  the platform layer adds no credential surface.
- CI running the full verify on PRs is a PREREQUISITE for any autonomous merge
  (LIVING-REPO-SPEC's CI-fleet section is the sibling spec; its gate lands first).
- Windows-first tooling; mutation suite may run nightly rather than per-PR (cost),
  but typecheck/lint/format/test/build + ci:* scans are non-negotiable per-PR.

## Out of scope

- Paid marketplaces, token exchange between users, hosted infrastructure of ours.
- Any automatic spending of a contributor's quota — flying pool tasks is always the
  contributor's explicit, local act.

## Slices

1. Canonical lock: branch protection via gh api + `.github/` governance docs
   (CONTRIBUTING.md, CODEOWNERS = MASTERMIND, PR/issue templates with pool labels).
   SHIPPED — all artifacts in-tree (`.github/`: CONTRIBUTING, CODEOWNERS,
   GOVERNANCE, SECURITY, PR/issue templates, `branch-protection.json`,
   `labels.json`) plus `pnpm run gh:setup-branch-protection`
   (`scripts/github/setup-branch-protection.mjs`) and its read-only
   counterpart `pnpm run gh:verify-branch-protection`
   (`scripts/github/verify-branch-protection.mjs`), which GETs the live
   protection and exits non-zero on drift; the live gh-api apply is
   MASTERMIND's own-credentials step by design (GOVERNANCE.md). 🟣 OPEN
   operator step to close this slice: run gh:setup-branch-protection, then
   gh:verify-branch-protection to prove the lock stuck.
2. CI verify on PRs (GitHub Actions matrix runs the gate; prerequisite for 4).
   SHIPPED — `.github/workflows/ci.yml` runs the FULL gate (typecheck / lint /
   format:check / build / test:coverage >=80%) plus every `ci:*` scan
   (bundle-size, npx-smoke-test, secret-scan, no-personal-paths,
   validate-configs, spdx, dependency-audit, architecture, citation) on a
   3-OS matrix (ubuntu/windows/macos, SHA-pinned actions) for every PR to
   main and every main push; `commitlint` validates PR commit messages and
   `mutation.yml` runs the Stryker sweep nightly instead of per-PR (the
   epic's cost constraint, honored). Verified live on the canonical repo:
   dependabot PRs #2/#3 merged through green runs, and the ts-7 major bump
   PR correctly went red. The 2026-08-17 KNOWN RED (main-push run
   31996495175 failing "Test + coverage" on the windows/macos legs — the
   fleet-digest own-worktree exclusion missing on case-insensitive
   filesystems) is RESOLVED: fixed same-day in `fea16f7` (`canonicalIntentPath`
   wraps both sides of the own-worktree comparison in `realpathSync`,
   input-preserving on failure) and re-verified 2026-08-20 — 29/29 tests
   green in `fleet-digest.test.ts` including the alias-spelling regression
   case (`/var` vs `/private/var`), and the canonical repo's `main`-push CI
   run (`730411c`, 2026-08-20T14:30) is green. This slice stayed marked
   SHIPPED throughout; only this stale KNOWN RED note lagged reality.
3. KEEPER triage: issues → analyzed/deduped/labeled/answered → board tasks.
   SHIPPED — complete (board web-mss50i9u-ldv513; closing commit
   1e4b9e1): pure decision core
   `apps/dashboard/src/flight/issue-triage.ts` (dedup vs open board tasks +
   backlog titles, pool labels from `.github/labels.json`, a `reasoning`
   string on every decision), HTTP preview/execute pair
   `flight/issue-triage-execute.ts` + `server/server.ts` (CSRF-guarded,
   rate-limited, GET previews with no `gh` mutation), and the project-page
   panel `web/issue-triage-panel.ts` via `shell.ts`'s `issueTriageSection`.
   An accepted issue becomes a `source: 'github'` task, queued directly
   (human-authored upstream), and is RANKED by the existing board-triage
   ritual at the next takeoff/landing sort — ranking is delegated, not
   duplicated. Re-runs are idempotent: an issue already carrying a `pool: *`
   label, GitHub's stock `duplicate` label, or whose own `github-<n>` task
   is already on the board plans a `'skip'` (no gh writes, no task) instead
   of being re-answered — without that, an accepted issue's own board task
   scored as a duplicate OF ITSELF on the next pass; genuine duplicates now
   get the `duplicate` label so later passes recognize them. Covered by
   `test/flight/issue-triage.test.ts`, `issue-triage-execute.test.ts`, and
   `test/web/issue-triage-panel.test.ts`.
4. KEEPER review: PR → gate + byte-review + policy → merge / request-changes;
   security-hard queue for MASTERMIND.
   In progress (board web-mss50ia0-s6vtbd) — shipped so far: the pure
   decision core `apps/dashboard/src/flight/pr-review.ts` (`planPrReview`
   judges gh-reported facts only — gate status, conflict state, touched
   paths — never the PR's own text; security-sensitive paths checked first
   and unconditionally queue-for-human), the `gh` argv planner + batch
   composer, the read/write wiring through the injectable `CliExec`, the
   CSRF-guarded rate-limited HTTP preview/execute pair
   (`flight/pr-review-execute.ts` re-derives the decision fresh at execute
   time, never trusting a client verdict), the operator panel
   `web/pr-review-panel.ts`, the operator-configurable auto-merge policy
   (`AUTOPILOT_PR_AUTOMERGE=off` narrows policy-green to queue-for-human;
   no value widens past policy-green), the verify-necessity decision core
   (`PrReviewCandidate.alreadyApplied` — a diff already present in the
   tree requests changes, outranking the gate but never the security-hard
   rule), the diff-fetch + reverse-apply-check wiring that populates it
   (`assessPrAlreadyApplied`/`annotateAlreadyApplied` — `gh pr diff` through
   a temp patch file into `git apply --reverse --check`, wired into both the
   preview read and the execute re-derive; security-touching PRs skip the
   spend since the security-hard rule outranks the verdict), the
   reviewed-head merge pin (candidates carry `headRefOid` and a planned
   merge passes `--match-head-commit`, so a commit pushed between the
   execute-time re-derive and the merge makes GitHub refuse the merge
   instead of squashing unreviewed code), the first "genuinely improves"
   verdict (a PR touching ZERO files requests changes — an empty diff
   merges nothing, yet it would otherwise ride a green gate to a
   policy-green squash-merge, since the security check passes trivially,
   the reverse-apply check returns "not assessed" on an empty diff, and CI
   runs on PR events regardless of diff content), the first content-judging
   verdict (`assessPrDiff`: a diff carrying binary content — "Binary files
   ... differ" / "GIT binary patch" — queues for a human, because byte-review
   cannot read a binary payload, so neither a merge nor a request-changes
   review is a verdict the ritual can honestly post on it; detected in the
   same `gh pr diff` fetch the reverse-apply check already spends, and that
   fetch's reverse-apply spawn is skipped for binary diffs since the API
   diff omits the payload), the oversized-diff guard
   (`MAX_AUTO_MERGE_CHANGED_LINES`: a PR whose gh-reported
   `additions + deletions` exceeds 1000 queues for a human instead of
   auto-merging — an approve + squash-merge implicitly claims the diff was
   byte-reviewed, which is not an honest automated claim at that scale;
   checked last, right before the merge itself, so gate/conflict/necessity
   verdicts stay honest at any size and the guard only narrows), the
   terminal-conclusion gate rollup fix (a check concluding `CANCELLED`,
   `TIMED_OUT`, `ACTION_REQUIRED`, `STARTUP_FAILURE`, or `STALE` — e.g. a
   concurrency-group-cancelled CI run — now derives gate `fail` instead of
   `pending`, so the ritual requests changes with an honest "the gate
   failed" instead of posting a false "still running" and holding the PR
   there forever; `NEUTRAL`/`SKIPPED` deliberately stay pending since
   reclassifying them could widen what auto-merges), the draft exclusion
   (`fetchOpenPrCandidates` drops `isDraft: true` PRs — a draft is its
   author's explicit not-ready signal, so no verdict, not even a
   queue-for-human comment, may be posted on it; without the check a
   policy-green draft collected a dishonest "approved — policy-green"
   review ahead of a merge GitHub then refuses; the execute path
   re-derives through the same fetch, so a draft's number 404s there
   too), the package-manager supply-chain markers (`package.json`,
   `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `.husky/` now
   security-hard: CI runs the PR's own scripts, so a PR neutering a gate
   script, swapping a lockfile tarball, enabling a postinstall via
   `onlyBuiltDependencies`, retargeting the registry, or planting a git
   hook would pass its own green gate — those always queue for human
   eyes), the CI-enforcement-script marker (`scripts/ci/` now
   security-hard: ci.yml runs those scripts from the PR's own checkout,
   so a PR neutering secret-scan.mjs would pass the very check it
   disabled — the package.json marker only catches rewiring the script
   line, not the file it points at; the doc-freshness `--check` scripts
   outside `scripts/ci/` stay unflagged on purpose), the
   report-from-here marker (`flight/report-from-here` now security-hard:
   it plans the exact `gh issue create` argv a bug report / pool offer
   runs AND ships the apply layer that executes it and writes board
   tasks — the same decide-and-execute class `flight/issue-triage` is
   flagged for, yet it ends in neither `-execute.ts` nor any security
   keyword, so the flight execute census and every keyword marker both
   missed it; directory-prefixed so a future display panel stays
   unflagged), the rename-evasion guard (`parseDiffRenameSources` reads
   the fetched diff's `rename from` headers to recover the old paths of
   renamed files — gh's `files` list reports only the NEW name, so a PR
   moving a guarded file to an innocuous name while editing it would
   otherwise slip the security-hard path sweep entirely; candidates carry
   `renamedFromPaths` and `planPrReview` immediately checks them after the
   basic path sweep — if any renamed-FROM path is security-sensitive, the
   PR queues for human unconditionally, the same security-hard stance any
   in-place edit to a guarded file takes), the truncated-file-list guard
   (`gh pr list --json files` caps enumeration at 100 paths, so a wide PR
   could hide a security-sensitive file at position 101+ while staying
   under the 1000-line cap; candidates now carry gh's `changedFiles`
   total and a list shorter than it queues for a human — an incomplete
   security sweep fails closed — while `annotateAlreadyApplied` skips the
   diff spend the same way it does for security-touching PRs), the explicit
   fetch limit (`MAX_PR_LIST_CANDIDATES`: with no `--limit`, `gh pr list`
   silently caps the fetch at its default of 30 newest PRs, so on a busier
   repo the oldest open PRs would never appear in any pass and never
   receive any verdict — and a previewed PR would 404 at execute time once
   newer PRs pushed it past the cap; the fetch now passes `--limit 100`,
   matching the files-per-PR cap scale), the viewer-authored (own) PR guard
   (candidates carry `viewerIsAuthor` — `gh pr list --json author` compared
   case-insensitively against `gh api user`, one lookup per fetch — and a
   viewer-authored PR always queues for a human: GitHub refuses
   self-approval and self-request-changes outright with HTTP 422, so
   neither a merge's approve nor a request-changes review could even be
   posted on it — the execute stopped at the failed approve and no verdict
   ever landed; the queue-for-human comment is the one verdict own PRs
   allow, and an unknown author/viewer leaves ownership not-assessed, which
   can only narrow), the commit-status gate rollup fix (gh's
   `statusCheckRollup` mixes StatusContext entries — external commit
   statuses reporting `context`/`state`, not `name`/`conclusion` — in with
   CheckRuns, so a status whose state is `FAILURE`/`ERROR` derived gate
   `pending` and the ritual posted a false "the gate is still running"
   forever, the same class the terminal-conclusion fix closed for
   CheckRuns; such states now derive `fail`, while a `SUCCESS` state
   deliberately stays pending — only conclusion-`SUCCESS` CheckRuns may
   pass the gate, since recognizing a green status could widen what
   auto-merges), the human hold-label guard (`prHasHoldLabel`: a policy-green
   PR carrying a `do-not-merge`/`hold`/`blocked`/`wip`/`work-in-progress`
   label — gh-reported facts via `gh pr list --json labels`, never the PR's
   own text — queues for a human instead of auto-merging; a maintainer's
   explicit not-ready signal, the same convention the draft exclusion honors
   and the near-universal auto-merge-ecosystem practice (mergify, GitHub's
   merge queue, bulldozer), matched at hyphen-token boundaries so `threshold`
   never trips `hold`; it leads the merge tier but stays below the gate, so a
   held PR with a red gate still gets the honest "the gate failed" feedback),
   the canonical-base guard (`prTargetsCanonicalBase`/`CANONICAL_BASE_BRANCH`:
   epic 0007's first governance invariant is "one canonical main", so a
   policy-green PR merging into any branch but `main` queues for a human — a
   squash-merge into a branch the KEEPER has no mandate to write is never
   automated; checked in the merge tier after the gate/conflict verdicts, so a
   non-`main` PR with a red gate still gets that honest feedback, and like the
   head-SHA pin it requires the base CONFIRMED, so an absent base fails closed
   toward a human), the human changes-requested-review guard
   (`reviewChangesRequested`: a PR under a STANDING `CHANGES_REQUESTED` review
   from a reviewer OTHER than this ritual — `gh pr list --json latestReviews`,
   author compared case-insensitively against `gh api user` — queues for a
   human, an explicit human "not yet" that outranks a green gate the same way a
   hold label does; the ritual's OWN request-changes reviews are excluded at
   fetch time, so a green PR the KEEPER once flagged is not stalled forever by
   its own stale review), the stale-decision guard
   (`expectedDecision`: re-deriving the decision fresh at execute time
   protects against a forged client verdict, but it opens a confirm-guard
   TOCTOU of its own — the operator's confirm dialog covers the PREVIEWED
   decision (a 30s-poll stale, or older in an idle tab) while the execute
   runs whatever the FRESH derive said. Preview queue-for-human (a comment),
   confirm, CI turns green in between — and an irreversible approve-and-squash
   would run on a confirm that promised a comment. Same TOCTOU family as the
   armed-auto-merge and --match-head-commit guards, one layer up: those pin
   the merge to reviewed bytes; this pins the execute to the confirmed decision
   KIND. The panel sends `expectedDecision` (the kind its confirm dialog
   showed) and `createPrReviewExecuteApi` refuses to run ANYTHING when the
   fresh derive reaches a different kind — results stay empty, `staleDecision:
   true` rides the response, and the panel names the fresh verdict so the
   operator re-previews and re-confirms. Narrowing-only, per the ritual's
   standing doctrine: the client value is never trusted to choose the action
   (the fresh derive still decides), only to stop it; absent means not-asserted
   and keeps the pre-guard behavior, and a present-but-garbage value 400s at
   the boundary instead of silently executing unpinned), the dangling-approval
   remediation
   (`remediateDanglingApproval`: `executePrReviewCommands` stops at the first
   failing step, so a merge whose approve landed but whose pinned
   `--match-head-commit` merge was then refused would otherwise leave a
   standing "approved" review over bytes the ritual never judged, which a
   later human or bot merge could silently inherit; the execute path now
   dismisses ONLY the ritual's own dangling approvals — APPROVED reviews
   whose body is exactly the reasoning it posted, id a plain integer —
   failing soft so remediation never makes the situation worse; the posted
   dismissal message no longer asserts the refusal's cause as settled fact —
   a moved head (`--match-head-commit`'s TOCTOU) is one possibility, but a
   branch-protection requirement the ritual does not model, e.g. an unmet
   required-review count, can refuse the same merge for a different reason,
   so the message names the possibilities instead of presuming one), the
   fleet-launch security marker (`flight/fleet-launch.ts` added to
   `SECURITY_SENSITIVE_PATH_MARKERS` alongside `board-triage.ts`/`triage.ts`
   above — the FLEET LANE LAUNCHER's `buildFleetLaunchPlan` carries the same
   board-steering power, applied fleet-wide, so a PR weakening the partition
   would put two lanes back on one file, the exact collision the partitioner
   exists to prevent; the flight/ census test caught the omission before the
   fleet-launch commit landed), the named-conflicting-paths reasoning
   (`parseGitApplyConflictPaths`: a gh-confirmed conflict (`mergeable: false`,
   `mergeStateUnknown` absent) already pays for a reverse-apply check via
   verify-necessity, so a forward `git apply --check` on that same patch file
   now names which path(s) failed to apply, folded into the posted
   request-changes reasoning in place of a generic "has merge conflicts";
   best-effort and reasoning-only — a local check that disagrees with gh's
   verdict, or stderr it cannot parse a path from, falls back to the generic
   message rather than changing the decision), the behind-base guard
   (`PrReviewCandidate.behindBase`, off `gh pr list --json mergeStateStatus`:
   GitHub reports `BEHIND` exactly when branch protection's strict
   up-to-date requirement — `branch-protection.json` sets `strict: true` —
   is unmet, so an otherwise policy-green BEHIND PR's green gate was
   computed against a base that has since moved AND its planned merge would
   be refused AFTER the approve posted, minting exactly the dangling
   approval the remediation above mops up; it now requests changes up front
   with "update the branch" instead — only the literal `BEHIND` narrows,
   since `BLOCKED` may become mergeable via the ritual's own planned approve
   and recognizing a "good" status could widen what auto-merges), the
   armed-auto-merge guard (`PrReviewCandidate.autoMergeArmed`, off `gh pr
   list --json autoMergeRequest`: a policy-green PR with GitHub's own
   auto-merge armed queues for a human — the ritual's approve would itself
   trigger GitHub's merge with whatever method and head the arming chose,
   the moment the approval satisfies branch protection and BEFORE the pinned
   `--match-head-commit` squash could run, reopening the exact
   reviewed-bytes TOCTOU window the pin exists to shut, so no approve may be
   posted at all; any non-null `autoMergeRequest` counts as armed, so a
   garbage report narrows toward a human, and the guard leads the policy
   lever since `off` also queues but the human merging by hand must know
   auto-merge is armed), the unassessed-size guard (a policy-green PR whose
   `additions`/`deletions` gh did not report queues for a human instead of
   bypassing the 1000-line cap — treating an absent size as 0 made the size
   guard the ONE merge-tier check where garbage gh output widened toward a
   merge, while every sibling fact fails closed there: a non-null
   `autoMergeRequest` counts as armed, an absent `headRefOid`/`baseRefName`
   queues; a merge asserts a byte-review-within-the-cap claim, so the size
   must be CONFIRMED, never assumed), the confirmed-size tightening (a
   negative or fractional gh-reported `additions`/`deletions` now counts as
   unassessed and queues the same way an absent size does — the parse
   accepted any finite number, so a garbage `-2000` summed into a
   changed-line total that UNDERCOUNTS, the residual half of the same
   garbage-widens-toward-merge hole the unassessed-size guard closed;
   tightened at both layers, `fetchOpenPrCandidates` dropping anything but a
   non-negative integer to absent and `planPrReview` re-checking with the
   same predicate so a directly-constructed candidate cannot slip it either
   — the enforced-at-both-layers stance the unpinned-merge throw set), the
   confirmed-files-total guard (`prTouchedPathsTruncated` no longer switches
   off when `changedFiles` is absent or garbage: gh caps the enumerated
   files list at 100 entries, so a 150-file PR with an unusable total got a
   security-hard sweep over only its first 100 paths and could still ride to
   a policy-green merge under the line cap — the same
   garbage-widens-toward-merge class again, this time at the FILES total; a
   list sitting at the cap now counts as truncated unless a confirmed
   non-negative-integer total says it is complete, a sub-cap list stays
   complete by construction since the cap is the only truncation mechanism,
   and the shared confirmed-count predicate is enforced at both layers like
   the size guard's), the
   gate-config supply-chain markers (`tsconfig`, `vitest.config`/
   `vitest.setup`, `eslint.config`, `.prettierignore`/`.prettierrc`,
   `commitlint.config`, `playwright.config`, and `config/mutation/` now
   security-hard: CI runs every gate tool with the PR's OWN checkout of the
   config it reads, so a PR excluding tests in vitest.config.ts, narrowing a
   tsconfig's include set, widening .prettierignore, or trivializing a
   Stryker config would pass the very gate it neutered — the same class as
   the package.json marker, which only catches rewiring the script LINE, not
   the config FILE the tool then reads; config/quarantine/ stays unflagged
   deliberately since vitest never reads it, only the already-flagged
   scripts/ci reporting tools do), the flat apps/dashboard/src/ census (the
   same enumerate-every-file-or-triage-it pattern the flight/ and engine/src
   censuses above already use, applied to the fifteen flat files directly
   under apps/dashboard/src/ — `fly.ts` and `gate-commands.ts` already
   carried their own markers, so the test's `pr-review.ts`
   `SECURITY_SENSITIVE_PATH_MARKERS` diff to close the census turned out to
   be a no-op; the other thirteen are triaged benign in the test's own
   `BENIGN_DASHBOARD_SRC` set — pure barrels/utilities (`browser.ts`,
   `index.ts`, `info.ts`, `paths.ts`, `ready.ts`), Playwright's e2e-only
   server entries that just boot the already-flagged real `server.ts`
   (`e2e-server.ts`, `e2e-server-populated.ts`), and operator-typed
   single-shot CLI commands never invoked by CI or a live flight (`demo.ts`,
   `flight.ts`, `reset.ts`, `reset-cli.ts`, `restore.ts`, `restore-cli.ts`) —
   the same own-action exemption `scripts/github/setup-branch-protection.mjs`
   already gets; closes the report-from-here-shaped gap this ritual keeps
   finding one directory at a time), the workspace-package census (the same
   enumerate-every-file-or-triage-it pattern extended past
   `apps/dashboard/src/` to the workspace packages under `packages/*/src` —
   `packages/engine/src` and its `adapters/` were already covered by the
   engine/src and adapters censuses above; this closed the remaining four.
   `packages/mcp/src` surfaced `control.ts`: the actual MCP tool handlers
   (`tasksCreate`/`taskSetStatus`/`tasksReorder`/`tasksDelete`/`projectReset`)
   `flight/control-execute.ts`'s already-flagged dispatch layer calls into,
   where `deleteTask`/`deleteProject` are destructive store writes that
   matched neither the `control/` marker (no trailing slash) nor any keyword
   until now. `packages/store/src` surfaced five more: `mutate.ts` (the real
   implementation behind `read/mutate.ts`'s wrappers — `deleteProject`,
   `setTaskStatus`'s VERDICT-close cascade, `claimTask`'s race-proof board
   claim, the SOUL/fleet-wisdom ratify overwrites), `db.ts` (the one writable
   SQLite connection every package shares), `migrate.ts` (the schema-drift/
   downgrade refusal), `schema.ts` (every CHECK-constraint invariant), and
   `snapshot.ts` (the backup ritual's integrity-check-then-compact/retention
   ordering) — `search.ts`/`vector.ts` stay unflagged as scoped, rebuildable
   per-project caches. `packages/onboarding/src` (`backup/`, `adapters/`,
   `gate/`, `gate/detectors/`, `onboard/`, `index/`, and its root) surfaced
   `backup/ritual.ts`'s `lockRepo` (the commit/tag/checkout sequence minting
   the MYTH+LEGACY backup snapshot), `adapters/git-backup.ts` (the real
   git-write implementation behind the backup ritual's port) and
   `adapters/sqlite-project-store.ts` (the direct SQLite writer behind
   project registration and board seeding), `gate/detect.ts` and
   `gate/manifests.ts` (deciding which typecheck/test/build/lint commands
   become a new project's gate), the four `gate/detectors/{js,python,go,
   rust}.ts` ecosystem deciders, and `onboard/onboard.ts` plus
   `onboard/soul.ts` (the safety-doctrine text it writes verbatim into every
   new project) — every other file in the package triaged benign with a
   written reason (read-only walks, pure barrels/types, or the same
   rebuildable per-project-cache class `store/src/search.ts` already earns).
   `packages/tokens/src` closed the sweep with zero new markers — a
   directory-wide grep for fs/fetch/exec/spawn/process found nothing but a
   regex `.exec()` call, every file being pure computation over constant
   palette/type/space/theme/locale data. Each package got its own
   `readdirSync`-enumerated "keeps pace automatically" guard the same shape
   as the `apps/dashboard/src` ones, so `apps/dashboard/src/` AND every
   `packages/*/src` workspace package are now both fully censused — a future
   write/destructive file landing in any of them can no longer silently slip
   past this ritual unmarked), the at-cap truncation tightening
   (`prTouchedPathsTruncated` + `GH_PR_FILES_CAP`: an enumerated files list
   sitting AT gh's 100-entry cap with `changedFiles` absent or garbage now
   queues for a human — the guard previously fired only on a CONFIRMED
   overcount, so a wide PR whose total gh failed to report sailed past the
   security sweep with tail paths at position 101+ unswept, the residual
   changedFiles half of the same garbage-widens-toward-merge class the
   confirmed-size guards closed for additions/deletions; below the cap an
   absent total stays harmless since gh only truncates at the cap, and the
   posted reasoning names each flavor honestly — a confirmed overcount cites
   gh's total, an unconfirmed at-cap one never fabricates it), the
   queue-for-human re-run idempotency (`PrReviewCandidate.ownComments`, off
   `gh pr list --json comments` filtered to the reviewing identity's own
   non-empty comment bodies: a queue-for-human decision whose reasoning the
   ritual already posted verbatim plans NO command at all — the ritual runs
   pass after pass while a queued PR waits on MASTERMIND, and each pass was
   re-posting the identical verdict comment, the duplicate-spam class the
   sibling issue-triage ritual's re-runs are explicitly idempotent against;
   comment-dedup only — request-changes/merge verdicts never skip, and the
   reasoning embeds the PR's number/title and specific verdict so any
   changed fact posts fresh), the request-changes re-run idempotency
   (`PrReviewCandidate.ownRequestChangesBody`, off the same `gh pr list
   --json latestReviews` fetch the changes-requested guard already spends,
   narrowed to the reviewing identity's OWN standing `CHANGES_REQUESTED`
   review with a non-empty body: a request-changes decision whose reasoning
   that standing review already carries verbatim plans NO command at all —
   GitHub keeps the review active until dismissed or superseded, so
   re-posting it each pass while the author leaves the PR red was the
   review-verdict half of the same duplicate spam the comment dedup above
   closed for queue-for-human; dedup only against the ritual's own standing
   review body, never against comments, merge decisions never consult it,
   and any changed fact produces different reasoning that posts a fresh
   review superseding the standing one), the unassessed-files-list guard
   (`PrReviewCandidate.touchedPathsUnassessed`: a garbage gh `files` value —
   a non-array, or an entry without a string path — collapsed to
   `touchedPaths: []` in `fetchOpenPrCandidates`, indistinguishable from a
   genuinely empty diff, so the ritual posted a false "touches no files"
   request-changes while the security-hard path sweep silently ran over an
   empty or partially-dropped enumeration nobody verified; a files list that
   could not be read in full now queues for a human with honest reasoning,
   the same fail-closed stance the at-cap truncation guard above takes on an
   unconfirmed changed-file total — narrowing-only, since a confirmed-empty
   files array keeps its request-changes verdict and the flag can never move
   a decision toward a merge), the unverified changes-requested guard
   (`reviewChangesRequestedUnverified`: a standing CHANGES_REQUESTED review
   whose reviewer could not be checked against the viewer — `gh api user`
   failed, so the ritual's own stale reviews could not be excluded — used to
   stay not-assessed, and an otherwise policy-green PR MERGED over a
   possibly-human "not yet": the one review fact where a failed lookup
   widened toward a merge, the same residual class the unassessed-size guard
   closed for additions/deletions; it now queues for a human with reasoning
   naming exactly what could not be verified, deduped like every
   queue-for-human comment and re-judged fresh once the lookup recovers,
   while a lookup outage on a PR with no standing CR review still merges —
   the flag is only minted when a CHANGES_REQUESTED review actually exists),
   the unassessed-rename-sweep guard (a policy-green PR whose
   `renamedFromPaths` was never assessed queues for a human: the rename half
   of the security-hard sweep runs only off a fetched diff's `rename from`
   headers, so a failed `gh pr diff` silently voided it and the PR still
   auto-merged — the same garbage-widens-toward-merge residual the
   unassessed-size guard closed for the byte-review cap; `assessPrDiff` now
   returns `renamedFromPaths: []` on every successful fetch as a CONFIRMED
   "renames nothing", absent strictly means "no diff fetched", and the merge
   tier demands the confirmed sweep — merge-tier on purpose, so red-gate /
   conflict verdicts still post their honest feedback, and every deliberate
   fetch-skip (security-touching, truncated, own, zero-file) already queued
   before the check),
   the cross-run stale-approval sweep (`remediateStalePolicyGreenApprovals`:
   the same-run dangling-approval remediation above cannot help when the
   process dies between its approve and its pinned merge, or when a refused
   merge's remediation itself failed soft — a standing "policy-green"
   APPROVED review then keeps satisfying branch protection while a
   queue-for-human execute posts only a comment, which never supersedes a
   review, or a deduped request-changes execute posts nothing at all; every
   non-merge execute now sweeps the PR's reviews first and dismisses ONLY
   the ritual's own policy-green approvals — recognized by body shape,
   `#N "…"` plus the fixed policy-green suffix `planPrReview` itself writes
   (`isRitualPolicyGreenApprovalBody`, title left free since a PR title can
   be edited after the approve posted, and review author cannot discriminate
   because the KEEPER reviews under the founder's own gh identity) — failing
   soft AND silent on a fetch/parse failure since the sweep is speculative:
   dismissing nothing is today's behavior, the safe direction),
   the unassessed label/review-facts guards (`labelsUnassessed` /
   `latestReviewsUnassessed`: an unreadable `labels` or `latestReviews`
   report from a successful `gh pr list` — non-array, or an entry with no
   readable name/state — used to silently DISARM the hold-label and
   changes-requested sweeps, letting an otherwise policy-green PR auto-merge
   over what may be a human's standing `do-not-merge` or "not yet": the last
   garbage-widens-toward-merge residual at the merge tier after the
   confirmed-size tightening closed it for additions/deletions;
   `fetchOpenPrCandidates` now mints the flags and `planPrReview`'s merge
   tier queues them for a human with reasoning naming exactly which sweep
   never ran — merge-tier on purpose so red-gate/conflict verdicts still
   post, narrowing-only like every other guard),
   the unassessed files guard (`filesUnassessed`: an unreadable `files`
   report from a successful `gh pr list` — non-array, a null entry, or an
   entry with no readable path — silently SHRANK the security-hard path
   sweep itself: a fully unreadable report judged an empty list and fell
   through to a FALSE "touches no files" request-changes, a partially
   unreadable one swept only a subset — invisible to the truncation guard
   whenever `changedFiles` was also unusable, so the PR could ride to a
   policy-green merge with paths never swept — and a null entry crashed the
   whole fetch outright; the readable paths still ride along (each can only
   narrow), but the candidate now queues for a human alongside the
   truncated-list guard — regardless of gate result, since an
   unreadably-swept PR might be security-touching and those always queue —
   with reasoning naming the unreadable report, and `annotateAlreadyApplied`
   skips the diff spend the same way it does for truncated lists),
   the null-entry fetch hardening (a null entry inside `statusCheckRollup`
   or `latestReviews` threw a TypeError that crashed the WHOLE
   `fetchOpenPrCandidates` pass — every PR unjudged, and the execute-time
   re-derive down with it — the same crash class the files sweep's
   `file?.path` already survived; the gate rollup, `rawHasChangesRequestedReview`,
   and `readReviewChangesRequested` now read entries through optional
   chaining, so an unreadable check lands on a fail-closed `pending` gate
   and an unreadable review reads as not-a-CR while the
   `latestReviewsUnassessed` flag carries its fail-closed verdict),
   the merged-state remediation probe (`remediateDanglingApproval` no longer
   infers "the merge was refused" from the merge command's exit code alone —
   `gh pr merge` can exit nonzero AFTER the merge API call landed, e.g. a
   failed `--delete-branch` step or a network error on a follow-up call, and
   dismissing on the exit code then stripped an ACCURATE approval off a
   MERGED PR while posting a flatly false "the merge did not succeed" into
   its audit record; the remediation now probes `gh pr view --json state`
   first and a CONFIRMED `MERGED` skips the dismissal as an honest no-op,
   while a failed/garbage probe proceeds exactly as before — on a genuinely
   refused merge, dismissing stays the safe direction, so the probe only
   narrows what the remediation touches),
   the failure-honest PR-candidate fetch report (`fetchOpenPrCandidateReport`:
   `fetchOpenPrCandidates` returns `[]` indistinguishably on a `gh pr list`
   outage, parse failure, or a genuinely empty queue — so the preview surface
   hid the KEEPER panel as if nothing were open to review, the same
   unverified-assertion class the execute-miss probe below closed. New
   `PrReviewCandidateReport` interface (`{ candidates, fetchFailed?: true }`)
   distinguishes a failed read (nonzero exit, unparseable stdout, or
   non-array report) from a confirmed empty queue; `fetchOpenPrCandidates`
   still returns bare `candidates` for backward compatibility, delegating
   through `fetchOpenPrCandidateReport` unchanged, so no decision changes yet
   — reporting-only at this layer. The preview wiring (`main.ts`'s `prReview`)
   now reads through this too (shipped in 7b44b539: an honest, i18n-tagged
   KEEPER-panel outage notice on a failed read, en + he, panel staying
   visible instead of hiding as if nothing were open); the execute path keeps
   probing absent PRs itself (`confirmPrNotOpen` below), which is unaffected),
   the execute-miss state probe (`confirmPrNotOpen`: a PR number absent from
   the execute-time candidate fetch used to 404 as "PR is no longer open" —
   but `fetchOpenPrCandidates` returns `[]` on a `gh pr list` outage or parse
   failure too, a draft is open but deliberately excluded, and a PR past the
   100-newest fetch window is open but unlisted, so a transient gh hiccup
   told the operator their previewed PR was GONE as settled fact — the same
   unverified-assertion class the merged-state remediation probe above
   closed; the miss now spends one `gh pr view --json state,isDraft` probe
   and only a CONFIRMED `MERGED`/`CLOSED` earns the 404, while every other
   shape throws an honest error naming exactly what is known — still open
   (retry), an open draft (no verdict may be posted), or unverifiable —
   which the panel surfaces verbatim; every miss path executes nothing, so
   the probe changes only what the operator is told, never what runs),
   the @-mention neutralization (`neutralizeAtMentions`: every reasoning
   string the ritual posts embeds contributor-controlled text — the PR
   title, a conflicting path, a renamed-from path; an attacker names files
   too — verbatim under the founder's own gh login, and GitHub linkifies
   `@name` anywhere in a comment or review body, so a hostile PR titled
   "fix typo @acme/everyone" would make the ritual ping arbitrary users or
   teams AS MASTERMIND the moment any verdict posted; `planPrReview` now
   neutralizes those three fields on an input COPY before the split-out
   `decidePrReview` judges it — a zero-width space after any `@` that could
   start a mention, visually identical, idempotent by lookahead, the
   established auto-responder convention — ONE choke point ahead of every
   reasoning template rather than a per-branch call nobody can audit;
   text-only and decision-blind, since no `SECURITY_SENSITIVE_PATH_MARKERS`
   entry contains `@` the rewrite can neither split nor mint a marker match,
   and re-run dedup holds because the ritual only ever POSTED neutralized
   text, so both sides of every `ownComments`/`ownRequestChangesBody`
   comparison carry the same bytes; landed across `70c99bf3` + `3f24d5c9`
   after the 2026-09-03 machine-relief stop killed the base lane mid-unit),
   the unreported-gate verdict (`GateStatus` gains `unreported`: a head with
   NO gating check at all — an absent/empty `statusCheckRollup`, or only
   "(optional)" checks — used to derive `pending` and post a request-changes
   claiming "the gate is still running", a run nobody observed: ci.yml's
   `pull_request` trigger is filtered to `branches: [main]`, so a PR against
   any other base carried that false claim forever, a fork's first workflow
   run waits on a maintainer's approval, and only-optional checks are no
   verdict by the workflow's own definition — the same unverified-assertion
   class the execute-miss and merged-state probes closed; `deriveGateStatus`
   now keeps `pending` for a gating check that EXISTS but has not concluded
   green and returns `unreported` for none, and `decidePrReview` queues an
   unreported gate for a human at the gate tier — same position as the
   pending verdict, ahead of the conflict verdict — with reasoning naming
   the possibilities rather than presuming one, since none is the author's
   to fix; narrowing-only, neither kind merges, and the queue comment dedups
   like every other),
   the masked changes-requested guard (the review-history sweep behind
   `reviewChangesRequested`: gh's `latestReviews` is each reviewer's latest
   review of ANY state, so a human's CHANGES_REQUESTED followed by their own
   comment-only review read as COMMENTED there and the guard saw no standing
   "not yet" — while GitHub keeps the request standing until that reviewer
   approves or it is dismissed — and an otherwise policy-green PR posted a
   policy-green approve over a human's standing "no"; `fetchOpenPrCandidates`
   now also reads `gh pr list --json reviews`, the full history with
   `submittedAt`, and `readStandingChangesRequestedFromHistory` recovers each
   reviewer's standing verdict from their latest
   APPROVED/CHANGES_REQUESTED/DISMISSED entry (COMMENTED/PENDING leave it
   untouched), ordered by `submittedAt`; a standing CR from anyone but the
   viewer — or an unattributed one, sticky since nothing proves a later
   login-less entry is the same reviewer — mints the same
   `reviewChangesRequested`/`reviewChangesRequestedUnverified` flags the
   `latestReviews` sweep does, so the decision core is unchanged; additive and
   narrowing-only: an absent or unreadable history judges nothing, the
   `latestReviews` sweep and its unassessed flag remain the fail-closed layer,
   and the first-100 cap on `reviews` is the same residual the remediation
   sweeps already accept),
   the unresolved-review-thread guard (`PrReviewCandidate.unresolvedReviewThreads`,
   read by `annotateReviewThreads` through one `gh api graphql` reviewThreads
   spend per pass — `gh pr list --json` exposes no thread state — and spent
   only when some candidate would otherwise merge: `.github/branch-protection.json`
   sets `required_conversation_resolution: true`, so a policy-green PR under a
   reviewer's unresolved line thread posted its approve, had the pinned squash
   REFUSED, and had `remediateDanglingApproval` dismiss the approval — on every
   confirmed execute, forever; now it queues for a human naming the thread
   count, and an unassessed read (failed, or the PR missing from it) queues
   too — the LAST merge-tier guard, so a deliberately skipped read never wears
   a false "could not be read" reason; narrowing-only, ahead of the `off`
   policy lever so a hand-merge still learns of the open thread, wired into
   both the preview read and the execute re-derive, and the queue comment
   dedups like every other),
   the working-tree stand-in confirmation (`workingTreeStandsInForBase`: the
   verify-necessity reverse-apply check judges the dashboard's OWN working
   tree, which nothing guaranteed could stand in for the base — a
   `gh pr checkout N` (the start of every human review) makes that tree BE
   the PR, so its diff reverse-applied cleanly and the ritual posted a public
   request-changes telling the contributor their PR was "already present in
   the current tree ... likely already fixed elsewhere; rebase or close", a
   false verdict minted by the maintainer's checkout; uncommitted edits could
   do the same, and the forward `git apply --check` named the operator's own
   dirty files as the PR's conflicts. `assessPrDiff` now takes the reviewed
   `headRefOid` and, only when a clean reverse-apply or a conflict-path
   naming is about to be minted, spends two git reads — `git status
   --porcelain --untracked-files=no` must be empty and `git merge-base
   --is-ancestor <head> HEAD` must not exit 0 (128, an unknown commit, counts
   as not contained: a never-fetched PR cannot be the tree) — withholding the
   verdict otherwise, necessity left not-assessed; an absent head fails
   closed without a spend, a failed reverse-apply needs no confirmation since
   "not applied" only falls through, and the diff-content verdicts (binary,
   renames) still ride. Deliberately NOT a "HEAD must be main" rule: the
   canonical checkout the dashboard runs from sits on a flight branch, so
   that rule would have disabled the check outright instead of fixing it.
   Residual, accepted: a head force-pushed after the local checkout, or a
   branch that cherry-picked the PR's content, still reads as a stand-in.
   Resolved follow-up in the same family (KEEPER 4/7): `gh pr merge
   --delete-branch` also writes to that checkout — it checks out the base
   and force-deletes the local head branch when one exists — so a merge
   confirmed while the PR is checked out locally would mutate the
   maintainer's working tree. Decision: `planPrReviewCommands` never passes
   `--delete-branch`; this ritual's mandate is GitHub-only review/merge
   actions, and remote branch cleanup is not worth risking an unannounced
   local checkout/branch mutation. The remote branch is left for a human (or
   a future remote-only cleanup step) to remove),
   the base-branch-name neutralization gap (`planPrReview`'s @-mention
   neutralization choke point covered `title`/`conflictingPaths`/
   `renamedFromPaths` but never `baseRefName` — a base branch is ordinary git
   ref syntax anyone with push access to the base repo can name, so a PR
   opened against e.g. `release/@acme/on-call` reached the canonical-base
   guard's queue-for-human reasoning with the raw, un-neutralized name
   embedded, and that reasoning posts verbatim as a `gh pr comment` under the
   founder's own login — GitHub would linkify `@acme/on-call` and ping that
   team AS MASTERMIND the moment the correct queue-for-human verdict posted;
   the decision was already right, only the posted text carried the
   unauthorized-looking side effect. `baseRefName` now runs through the same
   `neutralizeAtMentions` conditional spread as the other three fields),
   the Apply-result live region (`web/features/pr-review.ts`'s
   `.pr-review-result` now carries `role="status"`/`aria-live="polite"`: the
   execute outcome — merged, the first failing `gh` step, the stale-decision
   refusal — is written there after the confirm dialog, once focus has long
   moved on, so a screen-reader user heard nothing when a real gh merge/review
   landed or failed; every sibling result element (landing, report-from-here,
   the gh issue/PR results) already announced itself this way, and
   `test/web/pr-review-result-live-region.test.ts` asserts both the attributes
   and that the outcome text lands in that same element — the UX-expression
   half of the ritual, brought level with its decision core),
   and the operator doc RUNBOOK §8. Open: the semantic half of "does it genuinely
   improve" (judging what readable changes actually do), and actually
   resolving a conflict — today's ritual only names the files involved for a
   human; it never attempts a merge itself.
5. In-app "report from here": region context bundle → issue / quick-fix PR / local
   task / pool offer (one click each, preview always).
   In progress (board web-mss50ia8-nthtf3) — shipped so far: the pure decision
   core `apps/dashboard/src/flight/report-from-here.ts` (`planReportFromHere`
   turns a region capture — regionId/label, description, module sources,
   screenshot flag — plus a chosen action into the exact `gh issue create`
   argv for a bug issue or pool offer, or the exact queued
   `source: 'dashboard'` `CreateTaskInput` for a local / quick-fix-PR task;
   content-addressed task ids make retries mint nothing twice, pool labels
   reuse `classifyIssueDimension`, and a blank description/region/project
   plans a rejection with reasoning instead of a degenerate report; covered
   by `test/flight/report-from-here.test.ts`); the apply layer
   (`executeReportCommands`/`applyReportTask`/`runReportFromHereRitual`,
   same plan-then-apply shape as issue-triage's); the CSRF-guarded HTTP
   preview/execute pair (`POST /api/report-from-here` — pure, 200s a
   reasoned rejection for a bad capture so "always previewed" holds — and
   the rate-limited `POST /api/report-from-here/execute`); and the operator
   panel's pure formatting core `apps/dashboard/src/web/report-panel.ts`
   (action labels, the confirm message stating a real `gh` issue vs a
   content-addressed retry-safe board task, execute-result text that
   reports the first failing `gh` step or the honest retry no-op, and the
   EXECUTE `[data-tip]` — covered by `test/web/report-panel.test.ts`, same
   client-only shape as `pr-review-panel.ts`); the `web/features/report.ts`
   panel client (`reportFromHereSection(pid, region)`, fully built and
   tested but unreachable — nothing called it yet); the embed itself —
   `shell.ts`'s `renderProjectPage()` calls `reportFromHereSection(pid,
   region)` for eight project-page regions (flight console, KEEPER issue
   triage, detected backlog, docs, this round, next release, landing,
   tasks), each passing its own real `moduleSources` file list, so a report
   from any of them ships the exact files that render it; the shared
   `REPORT_REGIONS` registry (`shell.ts`) — every region's regionId/
   regionLabel/moduleSources lives in ONE object literal `renderProjectPage()`
   reads by key, replacing the inline-literal-per-call-site shape that could
   drift the region a report captures from the file that actually renders
   it; covered by `test/web/report-from-here-embed.test.ts` (one panel per
   region, keyboard-labeled, axe-clean per `a11y.test.ts`'s existing
   project-page sweep, and each region's preview POSTs its own distinct
   `regionId`/`moduleSources`). Open: real screenshot capture (`hasScreenshot`
   still rides the honest `false` — no image is attached) and the fleet-grid
   page (no single project to scope a report to there — an open design
   question, not a mechanical extension of the per-project pattern above).

   SCREENSHOT CAPTURE VERDICT processed (2026-09-04, ap-mtm4lsld-1): a prior
   firing's verdict on the screenshot gap above claimed real pixel capture
   needs a technique decision and a privacy decision before any
   implementation slice is buildable. This pass verified the claim against
   the current repo rather than attempting a slice. Three concrete blockers
   hold: (1) no screenshot/canvas library exists in
   `apps/dashboard/package.json` or the lockfile, so any client-side
   technique (`html2canvas`, `dom-to-image`, or similar) would be net-new
   code; (2) the dashboard's CSP is `default-src 'self'` with no
   `unsafe-inline` or external origins (`server/security.ts`), so a
   CDN-loaded library is blocked outright — it would have to be vendored
   into the served bundle, at odds with every `web/features/*.ts` module's
   established zero-runtime-dependency convention; (3) no `canvas` package
   exists in devDependencies, so jsdom cannot `getContext('2d')` — the test
   suite has no way to verify pixel output even if a technique landed,
   meaning any implementation would ship its accuracy unverified by the
   gate. Beyond mechanics, two real decisions block scoping: which technique
   (a same-origin library vendored into the bundle vs. the browser-native
   `getDisplayMedia()` API, which demands a fresh user permission grant and
   gesture on every call — unlike the existing silent DOM-snapshot capture in
   `report-capture-client.ts`), and what a screenshot is allowed to show (the
   live dashboard can render other projects' names, flight-console paths, or
   other operator context the DOM-snapshot capture's
   `REPORT_DOM_MAX_TEXT_LENGTH` clip and `REPORT_CSS_PROPERTIES` allowlist
   were deliberately scoped to avoid). Neither is machine-checkable. VERDICT:
   CONFIRMED — real screenshot capture is 🟣 human-required (technique +
   privacy policy) before any slice is buildable; the fleet-grid open
   question from the same paragraph is a second, independent 🟣 item (no
   single project to scope a report to there).
6. Pool client: browse/claim/fly/deliver upstream tasks from any co-pilot's dashboard.
   SHIPPED end to end (board web-mss50iaf-fckmbj) — the pure
   read-only first slice `apps/dashboard/src/flight/pool-client.ts` —
   `fetchPoolIssues` lists every open issue via `gh issue list` (same
   injectable `CliExec` wiring `issue-triage.ts`/`pr-review.ts` use) and
   keeps only the ones a previous KEEPER triage pass already labeled
   `pool: <dimension>`, reusing `issue-triage.ts`'s exported
   `POOL_LABEL_PREFIX`/`parseIssueLabels` rather than a second labeling
   scheme (there is no separate `pool:open`/`pool:claimed` label pair —
   "in the pool" IS "carries a `pool: *` label"); `poolDimension`/
   `isPoolIssue` classify a label list, and `isClaimedPoolIssue` reads the
   epic's own claim mechanism ("claims (assign/comment)") off gh's
   `assignees` field rather than a label; and now the claim action itself —
   `planClaimPoolIssue` decides claim-vs-skip for a given login (unpooled or
   already-assigned both skip, pure, reusing the same classifiers rather
   than re-deriving status a second way), `planClaimPoolIssueCommands` turns
   an accept into the exact `gh issue edit --add-assignee` + `gh issue
   comment` argv (same plan-then-apply shape as `issue-triage.ts`'s
   `planIssueTriageCommands`), `executeClaimPoolIssueCommands` runs a plan's
   commands through the injectable `exec` in order without aborting after a
   failed step (same convention `executeIssueTriageCommands` uses), and
   `claimPoolIssue` composes the whole pass — fetches the open pool and the
   caller's own gh identity (`pr-review.ts`'s `fetchViewerLogin`, exported
   for this reuse) in parallel, since a co-pilot claims for themselves,
   never on another login's behalf; an issue number outside the open pool
   or an unresolved viewer identity both plan a skip with zero commands run
   rather than claiming on an `undefined` login. Covered by
   `test/flight/pool-client.test.ts`. Since then: the CSRF-guarded,
   rate-limited HTTP preview/execute pair (`GET /api/pool-client` +
   `POST /api/pool-client/execute`, `flight/pool-client-execute.ts`) and the
   operator-facing browse/claim panel (`web/pool-client-panel.ts` +
   `web/shell.ts`'s inline pool-client section) shipped — this stale note
   used to still flag both as open. The "fly locally" leg's first half also
   shipped and is now wired end to end: `planPoolIssueTask`/
   `claimAndQueuePoolIssueTask` (content-addressed `source: 'github'` board
   task, reusing `issue-triage.ts`'s `issueTaskId` scheme so a pool-claimed
   task and a KEEPER-triaged task for the same issue are the same unit of
   work either way it lands first) now have an HTTP/UI path: execute takes
   an optional `project` id, and the panel grew a per-issue project `<select>`
   (populated from the live fleet, patched in place as fleet state arrives
   so an early panel paint never leaves it stuck empty) — picking a project
   before claiming also queues the local task there; leaving it unset claims
   on GitHub only, same as before. Covered by
   `test/flight/pool-client-execute.test.ts`,
   `test/web/pool-client-panel.test.ts`, and an axe-clean check in
   `test/web/a11y.test.ts`. The PR-delivery leg referencing the issue also
   shipped: `poolDeliveryIssueNumber` (`web/card-actions.ts`) picks the one
   non-deferred `source: 'github'` task on a project and extracts the issue
   number its `issueTaskId` (`issue-triage.ts`) id encodes — zero or several
   candidates both leave it `undefined` rather than guess, since a wrong
   guess would silently mislink a PR; `githubPrConfirmMessage` names the
   issue it will close when one is passed. `web/shell.ts`'s "Contribute
   upstream" submit handler looks up the current project's tasks, computes
   the candidate, and threads it through to both the confirm dialog and the
   `POST /api/github-pr/execute` body (already accepted an optional
   `issueNumber` — see slice 5 above). Covered by
   `test/web/card-actions.test.ts`. SHIPPED end to end: the "fly" trigger
   against the queued task also landed — `web/features/pool-client.ts`
   renders a Fly button after a claim queues a local board task
   (`result.offerFly`), POSTing the existing `/api/fly` with the claimed
   project's `rootPath` and formatting the outcome via
   `web/pool-client-panel.ts`'s `poolClaimFlyTip`/`poolClaimFlyResult`
   (`0ea039e5` restored this after a merge dropped the implementation while
   its tests survived, red — re-verified green: `pool-client-panel.test.ts`,
   `pool-client-fly.test.ts`, `pool-client.test.ts`,
   `pool-client-execute.test.ts`, 64/64). Browse/claim/fly/deliver — every
   leg of slice 6 is now shipped.
7. Page upkeep + publicity affordances (dormant until public).
   Publicity half SHIPPED — `flight/publicity.ts`'s `fetchRepoIdentity` (`gh
   repo view --json nameWithOwner,url,isPrivate` through the same injectable
   `CliExec` `pool-client.ts`/`pr-review.ts` use) and `planPublicityAffordances`
   decide every repo/watch/star/discussions affordance's dormant state and
   reasoning off `gh`-reported facts only — dormant, with reasoning, on a
   private repo OR an unresolved identity, live once public, matching this
   epic's own "surfaced in-app, dormant while private" wording;
   `createPublicityPreviewApi` wires the read-only `GET /api/publicity`
   (`server.ts`'s `handlePublicity`) that `main.ts` composes with the real
   `gh` CLI. The operator surface is `web/publicity-panel.ts`'s pure
   `publicityAffordanceTip` formatter plus `web/features/publicity.ts`'s
   `renderPublicityPanel`/`loadPublicityPanel` (self-initializing once, not on
   a poll timer — a slow-changing fact that "flips once, on the public-day")
   embedded via `shell.ts`'s `#publicity-panel` nav; a dormant affordance
   renders `aria-disabled` with no href, a live one a real `target="_blank"
   rel="noopener noreferrer"` link, both keyboard-focusable with a
   `data-tip`/`aria-label` naming the reasoning — axe-clean per
   `a11y.test.ts`'s live/dormant mix case and i18n-tagged (`838f86ae`).
   Covered by `test/flight/publicity.test.ts`, `test/web/publicity-panel.test.ts`,
   and `test/web/features/publicity.test.ts`. Page-upkeep half is a continuous
   KEEPER duty, not a one-time deliverable: the DOC-FRESHNESS drift detector
   (`flight/doc-freshness.ts`'s `DOC_SUBJECTS`/`computeDocDrift`, wired into
   `post-flight-sweeps.ts`'s and `maintenance-sweep.ts`'s sweeps) watches every
   active epic doc — including this one — against its own landed subject
   files and proposes a board task when a subject outpaces its doc;
   `pnpm run ci:citation`/`ci:doc-links`/`ci:architecture`/`ci:data-model` gate
   every PR against the generated CITATION.cff/README/PAPER.md citation
   blocks, relative doc links, `docs/ARCHITECTURE.md`, and
   `docs/DATA-MODEL.md` respectively. Exercised live 2026-08-28: README's
   Status table and the CITATION.cff/README/PAPER.md citation blocks had
   drifted to a stale package version (`ci:citation --check` was failing
   outright) — corrected via `pnpm citation:update` plus a hand-fix to
   MODEL-CARD.md's engine-version pointer, the one freshness surface the
   generator doesn't cover. Exercised again 2026-09-03: the Status table's
   `Current version` line had drifted back — still `0.16.0` after three
   2026-09-02 releases took the package to `0.19.0` — because that line was
   hand-maintained: `citation:update` only rewrote the HOW-TO-CITE block and
   `--check` only compared it, so the 08-28 hand-fix had no guard and every
   release since silently left the line behind while the block, CITATION.cff,
   PAPER.md, and MODEL-CARD all moved. `refreshReadmeStatusVersion`
   (`scripts/citation/generate-citation.mjs`) now puts that line under the same
   generator: `pnpm citation:update` rewrites it from `package.json`,
   `ci:citation --check` fails on drift naming the line, and a README that
   drops the anchor line throws instead of silently disarming the check — the
   same fail-loud stance the HOW-TO-CITE markers already had (covered by
   `test/tooling/generate-citation.test.ts`). The same pass caught README's
   repository-layout rows up with the tree (`packages/mcp` is no longer
   "(planned)"; `scripts/ci/` lists its bundle-size / npx-smoke /
   quarantine-report gates). MODEL-CARD.md's §6 engine-version pointer — the
   one freshness surface both the 08-28 and 09-03 passes still had to fix by
   hand — followed the Status line under the generator the same day:
   `refreshModelCardEngineVersion` rewrites the `| Engine/package version |
   \`x.y.z\` ...` row from `package.json`, `ci:citation --check` fails on drift
   naming the pointer, a card that drops the row throws, and the sibling
   `Firing-Prompt-Version` row is deliberately left alone since the card's §2
   documents that the two version axes drift independently (same test file).
   No version-stating surface in README, CITATION.cff, PAPER.md, or MODEL-CARD
   is hand-maintained any more; a release that forgets `pnpm citation:update`
   now fails `pnpm verify` instead of silently aging one of them.

VERDICT processed (2026-09-04, ap-mtlvusoi-0): a prior firing's proposal to
deprioritize board task web-mss50iak-g176g8 (PLATFORM 7/7, publicity
affordances) reasoned a 2026-09-03 page-upkeep sweep found nothing
actionable left to build for it. Re-verified against the current code
rather than trusting the prior claim at face value:
`apps/dashboard/src/flight/publicity.ts` ships `fetchRepoIdentity`,
`planPublicityAffordances`, and `createPublicityPreviewApi` with no
TODO/FIXME/placeholder marker beyond the already-documented dormant
`href="#"` design choice; the UI half is fully wired
(`web/publicity-panel.ts`'s `publicityAffordanceTip`,
`web/features/publicity.ts`'s `renderPublicityPanel`/`loadPublicityPanel`,
embedded in `shell.ts`'s `#publicity-panel` nav) and covered by three
dedicated test files (`test/flight/publicity.test.ts`,
`test/web/publicity-panel.test.ts`, `test/web/features/publicity.test.ts`,
all present on disk). This epic doc's own entry above already states slice
7 "shipped end to end" as of 2026-08-28. Verdict: CONFIRMED — nothing
actionable remains under this task; the live page-upkeep duty it once
tracked continues under DOC-FRESHNESS/KEEPER (documented above), not as a
standalone board item. ap-mtlvusoi-0 closes on this evidence.

8. Discussions triage + reply ritual (board web-mtlsiac0-v8rksh): extend the KEEPER
   pattern from issue triage (slice 3) to GitHub Discussions.
   SCOPED, not yet built — a firing-sized feasibility pass (2026-09-04) found the
   board title's "extend issue-triage to Discussions" undersells the work: issue
   triage's four layers (pure decision core `flight/issue-triage.ts` → `gh` argv
   planner → injectable-`CliExec` read/write wiring → CSRF-guarded rate-limited
   preview/execute HTTP pair → operator panel) are entirely issue-specific — built
   on `gh issue list/edit/comment` — with no generic ritual framework a Discussions
   config could plug into; every layer needs a parallel discussion-specific version.
   Worse, `gh` ships no `discussion` subcommand at all (unlike `issue`/`pr`): both
   the read query and the reply mutation (`addDiscussionComment`) must be
   hand-written GraphQL against opaque node IDs, not simple issue numbers —
   `flight/pr-review.ts`'s `REVIEW_THREADS_QUERY` is this repo's only precedent for
   hand-rolled `gh api graphql`, and even that only reads, never mutates. Full scope
   (GraphQL read + reply mutation + types + a reply-drafting decision core + new
   CSRF/rate-limited preview+execute endpoints + a UI panel + an
   autonomous-reply-signature convention + ~1,000+ lines of tests mirroring
   issue-triage's coverage) is comparably sized to slice 3, which shipped as its own
   dedicated board item — not a same-firing add-on to whatever precedes it. VERDICT:
   split. Narrowed first slice: a pure decision core only —
   `flight/discussions-triage.ts` mirroring `issue-triage.ts`'s shape (types +
   `fetchOpenDiscussions` via a hand-built read-only GraphQL query +
   `planDiscussionTriage`/classify), zero write/mutation capability, no HTTP/UI
   wiring — deferring reply-posting, the preview/execute endpoints, and the panel to
   follow-on slices, the same staged-rollout shape slice 3 itself used.

## Related

- Epic 0006 (the plumbing this platform stands on), `docs/LIVING-REPO-SPEC.md` (CI
  agent fleet — slice 2 realizes its gate section), DOC-FRESHNESS + Generic-folder
  competence board items, SELF-STUDY human-vs-agent section (the maintainer
  autopilot's judgments are exactly the kind of agent-decision it audits).
