// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * KEEPER review ritual (BOARD web-mss50ia0-s6vtbd, "PLATFORM 4/7"): incoming
 * PRs get judged against the gate result and the paths they touch, never the
 * PR's own title/description ("byte-review the diff, never trust the
 * description" — epic 0007), and a policy-green PR is merged with a reasoned
 * comment while everything else requests changes. This ships the pure
 * decision core — {@link planPrReview} — the pure command planner that turns
 * a decision into the exact `gh` argv to apply it — {@link
 * planPrReviewCommands} — {@link planPrReviewBatch}, which composes both
 * across a whole batch of PRs — the read wiring, {@link
 * fetchOpenPrCandidates}, and the write wiring, {@link
 * executePrReviewCommands}, both through the same injectable `CliExec`
 * `connection/cli-probe.ts` uses. Mirrors `issue-triage.ts`'s KEEPER triage
 * ritual, the same plan/execute split `github-sync.ts`'s `planGithubSync` and
 * `release.ts`'s `planRelease` use ahead of their own I/O wiring.
 * Merging and requesting changes are visible to others, so triggering it for
 * real is confirm-guarded: `flight/pr-review-execute.ts` re-derives the
 * decision fresh at execute time (never trusting a client-supplied verdict)
 * and `server.ts`'s `GET /api/pr-review` + `POST /api/pr-review/execute`
 * expose the preview/execute pair over HTTP, the same CSRF-guarded,
 * rate-limited shape release automation's `release/execute.ts` +
 * `handleReleaseExecute` use — `web/pr-review-panel.ts` is the operator-facing
 * panel that calls both. The "already fixed elsewhere" half of the epic's
 * verify-necessity description is live: {@link assessPrAlreadyApplied}
 * fetches a PR's diff and reverse-apply-checks it against the current tree,
 * and {@link annotateAlreadyApplied} folds that verdict into each candidate
 * ahead of the decision. A planned merge pins the exact reviewed head SHA
 * (`gh pr merge --match-head-commit`), so a commit pushed after the
 * execute-time re-derive makes GitHub refuse the merge instead of squashing
 * unreviewed code. The first "does it genuinely improve" case is live and
 * needed no more than gh-reported facts: a PR touching ZERO files (gh's
 * `files` list empty) requests changes — an empty diff merges nothing, yet
 * it would otherwise ride a green gate to a policy-green squash-merge,
 * since the security check passes trivially (no paths), {@link
 * assessPrAlreadyApplied} returns "not assessed" on an empty diff, and CI
 * runs on PR events regardless of diff content. The first content-judging
 * verdict is live too: {@link assessPrDiff} flags a diff carrying binary
 * content ("Binary files ... differ" / "GIT binary patch") in the same
 * `gh pr diff` fetch the reverse-apply check already spends, and {@link
 * planPrReview} queues it for a human — bytes the ritual cannot byte-review
 * get no automated verdict at all. Still deferred: the semantic half of
 * "does it genuinely improve" (judging what readable changes actually do)
 * and conflict resolution — both need more than deterministic checks and
 * stay follow-up slices.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CliExec } from '../connection/cli-probe.js';

/** The gate rollup's verdict on a PR's head. `pending` means at least one
 *  gating check EXISTS but has not concluded green; `unreported` means NO
 *  gating check reported at all (an absent/empty rollup, or only
 *  "(optional)" checks) — kept apart because "still running" is a claim
 *  nobody verified on a head where nothing may be running: a base outside
 *  CI's `pull_request` trigger filter never triggers a run, a fork's first
 *  workflow run waits on a maintainer's approval, and only-optional checks
 *  are no verdict by the workflow's own definition. Neither is a pass. */
export type GateStatus = 'pass' | 'fail' | 'pending' | 'unreported';

/** The subset of an open PR this policy needs — objective, gh-reported facts
 *  only, never the PR's own title/body text, so a misleading description
 *  can't talk its way past the ritual. */
export interface PrReviewCandidate {
  readonly number: number;
  readonly title: string;
  readonly gateStatus: GateStatus;
  readonly mergeable: boolean;
  readonly touchedPaths: readonly string[];
  /** True when gh's `files` value could not be read as a complete list —
   *  not an array at all, or carrying an entry whose `path` is not a string
   *  (that entry is silently dropped from {@link touchedPaths}, leaving an
   *  unswept path). Without this flag a garbage files value collapsed to an
   *  empty {@link touchedPaths}, indistinguishable from a genuinely empty
   *  diff: the security-hard sweep ran over nothing and the empty-diff
   *  verdict posted a false "touches no files". {@link planPrReview} queues
   *  such a candidate for a human instead — the same fail-closed stance the
   *  at-cap truncation guard takes on an unconfirmed total. Optional: absent
   *  means the list was read in full; the flag can only narrow a decision
   *  toward queue-for-human, never force a merge. */
  readonly touchedPathsUnassessed?: boolean;
  /** True when gh reported a merge state that is neither `MERGEABLE` nor
   *  `CONFLICTING` — GraphQL's `UNKNOWN` (GitHub computes mergeability
   *  lazily, so a freshly-fetched PR routinely reports it) or a
   *  missing/garbage value. `mergeable: false` already fails closed on it;
   *  this flag exists so the posted request-changes REASONING stays honest
   *  ("state not computed yet") instead of claiming conflicts that were
   *  never verified. Optional: absent means the state was a real verdict
   *  (mergeable or conflicting). Reasoning-only — it never moves a decision
   *  toward merge. */
  readonly mergeStateUnknown?: boolean;
  /** True when gh's `mergeStateStatus` is the literal `BEHIND` — the head ref
   *  is out of date against the base, which GitHub reports exactly when
   *  branch protection requires up-to-date branches before merging
   *  (`.github/branch-protection.json` sets `strict: true`). Two facts
   *  follow: the PR's green gate was computed against a base that has since
   *  moved (so "passed the FULL verify in CI" no longer describes
   *  current-base + PR), and the planned `gh pr merge` would be REFUSED
   *  after the approve already posted — minting exactly the dangling
   *  approval {@link remediateDanglingApproval} exists to mop up after the
   *  fact. Optional: absent means "not assessed" (any other status, or none
   *  reported), which behaves as false — the check can only narrow toward
   *  request-changes, never force a merge. */
  readonly behindBase?: boolean;
  /** True when the PR's diff reverse-applies cleanly to the current HEAD —
   *  its changes are already in the tree (epic 0007's "verify necessity":
   *  already fixed elsewhere). Optional: absent means "not assessed", which
   *  behaves as false — the check can only narrow toward request-changes,
   *  never force a merge. */
  readonly alreadyApplied?: boolean;
  /** True when the PR's fetched diff carries binary content ("Binary files
   *  ... differ" / "GIT binary patch") — bytes the ritual cannot byte-review,
   *  so no automated verdict on them is trustworthy. Optional: absent means
   *  "not assessed", which behaves as false — like {@link alreadyApplied},
   *  the check can only narrow a decision (toward queue-for-human), never
   *  force a merge. */
  readonly hasBinaryDiff?: boolean;
  /** True when the PR's author login (`gh pr list --json author`) matches the
   *  GitHub identity this ritual runs under (`gh api user`) — a self-review
   *  is no review at all, and GitHub refuses self-approval and
   *  self-request-changes outright (HTTP 422), so no review verdict this
   *  ritual plans could even be posted on such a PR. Optional: absent means
   *  "not assessed" (author or viewer unknown), which behaves as false — the
   *  check can only narrow toward queue-for-human, never force a merge. */
  readonly viewerIsAuthor?: boolean;
  /** Total lines added, as `gh pr list --json additions` reports it — a
   *  gh-reported fact like every other input here. Optional: absent means
   *  "not assessed" — and because a merge implicitly claims the diff was
   *  byte-reviewed within {@link MAX_AUTO_MERGE_CHANGED_LINES}, {@link
   *  planPrReview} QUEUES an otherwise policy-green candidate FOR A HUMAN
   *  rather than merging on a size nobody verified — the same
   *  confirmed-or-queue stance the {@link headRefOid} pin and {@link
   *  baseRefName} base guard take at the merge tier. */
  readonly additions?: number;
  /** Total lines deleted, as `gh pr list --json deletions` reports it —
   *  same absent-means-not-assessed convention as {@link additions}. */
  readonly deletions?: number;
  /** Total files the PR touches, as `gh pr list --json changedFiles` reports
   *  it. `gh` caps the enumerated `files` list at 100 entries, so {@link
   *  touchedPaths} can be a TRUNCATED view of a wide PR — comparing this
   *  total against its length is how {@link planPrReview} detects that.
   *  Optional: absent means "not assessed", which disables the comparison
   *  only while the enumerated list sits under that cap (where gh cannot
   *  have truncated it) — a list AT the cap with no confirmed total counts
   *  as truncated instead, failing closed toward queue-for-human. The guard
   *  can only narrow a decision, never force a merge. */
  readonly changedFiles?: number;
  /** The PR head commit SHA the review facts were fetched against. When
   *  present, a planned merge pins to it via `gh pr merge
   *  --match-head-commit`, so a commit pushed between the review (or the
   *  execute-time re-derive) and the merge makes GitHub refuse the merge
   *  instead of squashing unreviewed code. Optional only for defensive
   *  parsing — {@link fetchOpenPrCandidates} always captures it when `gh`
   *  reports one; a policy-green candidate with it absent QUEUES FOR A HUMAN
   *  in {@link planPrReview} rather than falling through to an unpinned
   *  merge — a missing pin fails closed, never toward reopening the
   *  review-to-merge TOCTOU window the pin exists to shut. */
  readonly headRefOid?: string;
  /** The branch this PR merges INTO, as `gh pr list --json baseRefName`
   *  reports it. Epic 0007's first governance invariant is "one canonical
   *  main" — `main` is the only version of record — so a policy-green PR is
   *  auto-merged only when this is the canonical branch ({@link
   *  CANONICAL_BASE_BRANCH}); any other base, or an absent value, QUEUES FOR
   *  A HUMAN in {@link planPrReview} rather than squash-merging into a
   *  non-canonical branch the ritual has no mandate to write. Optional only
   *  for defensive parsing — {@link fetchOpenPrCandidates} always captures it
   *  when `gh` reports one; like the {@link headRefOid} pin, a merge decision
   *  requires it CONFIRMED (absent fails closed toward a human), because
   *  merging into the wrong branch is a mis-action no green gate excuses. */
  readonly baseRefName?: string;
  /** The label names a human (or bot) has applied to the PR, as `gh pr list
   *  --json labels` reports them — a gh-reported fact like every other input
   *  here, NOT the PR's own title/body text, so honoring them keeps the
   *  never-trust-the-description rule. A label from {@link HOLD_LABEL_MARKERS}
   *  (`do-not-merge`, `hold`, `blocked`, `wip`, `work-in-progress`) is a
   *  maintainer's explicit "not ready to merge" — the same not-ready signal
   *  {@link fetchOpenPrCandidates} already honors for a draft, and the
   *  near-universal convention of the auto-merge ecosystem (mergify, GitHub
   *  merge queues, bulldozer). Optional: absent means no labels (or none
   *  reported), which behaves as an empty list — {@link prHasHoldLabel} can
   *  only narrow a decision toward queue-for-human, never force a merge. */
  readonly labels?: readonly string[];
  /** True when gh's `labels` report was UNREADABLE — not an array at all, or
   *  carrying an entry with no readable name. {@link prHasHoldLabel} judges
   *  only names it can read, so unreadable output silently DISARMED it: an
   *  otherwise policy-green PR auto-merged over what may be a human's
   *  standing `do-not-merge` — the same garbage-widens-toward-merge class
   *  the unassessed-size guard closed for {@link additions}/{@link
   *  deletions}, here for the hold sweep. Minted by {@link
   *  fetchOpenPrCandidates}; merge-tier only in {@link planPrReview} (red
   *  gate/conflict verdicts still post their honest feedback), and it can
   *  only narrow toward queue-for-human, never force a merge. Absent means
   *  the hold sweep is CONFIRMED: gh reported an array of readable names
   *  (possibly empty). */
  readonly labelsUnassessed?: boolean;
  /** True when a reviewer OTHER than the GitHub identity this ritual runs
   *  under has a STANDING `CHANGES_REQUESTED` as their latest review (`gh pr
   *  list --json latestReviews`, author compared case-insensitively against
   *  `gh api user`). A human's explicit "changes requested" is an even
   *  stronger not-ready signal than a {@link labels} hold — honoring it keeps
   *  the ritual from squash-merging out from under a reviewer's standing
   *  "no", the same honor-the-human stance {@link prHasHoldLabel} takes. The
   *  ritual's OWN request-changes reviews are excluded, so a green PR the
   *  KEEPER itself once flagged is not stalled forever by its own stale review
   *  (GitHub does not auto-dismiss a review on a later push unless branch
   *  protection is configured to). A CHANGES_REQUESTED review whose author gh
   *  did not report counts as a human's — failing toward queue-for-human, the
   *  safe narrowing direction. `latestReviews` alone can MASK a standing
   *  request: it is each reviewer's latest review of ANY state, so a human's
   *  CHANGES_REQUESTED followed by their own comment-only review reads as
   *  COMMENTED there while GitHub keeps the request standing until they
   *  approve or it is dismissed — so the full review history (`gh pr list
   *  --json reviews`) is swept too, recovering each reviewer's standing
   *  verdict from their latest APPROVED/CHANGES_REQUESTED/DISMISSED entry by
   *  `submittedAt` (see {@link readStandingChangesRequestedFromHistory});
   *  additive and narrowing-only, an unreadable history judges nothing.
   *  Optional: absent means "not assessed" (no
   *  reviews, or the viewer login was unknown so own reviews could not be
   *  excluded), which behaves as false — like every other guard here it can
   *  only narrow a decision toward queue-for-human, never force a merge. */
  readonly reviewChangesRequested?: boolean;
  /** Bodies of the PR comments the reviewing identity ITSELF has already
   *  posted (`gh pr list --json comments`, each author compared
   *  case-insensitively against `gh api user`). A queue-for-human decision
   *  whose reasoning is already among them plans NO command at all in {@link
   *  planPrReviewCommands}: the ritual runs pass after pass while a PR waits
   *  on MASTERMIND, and re-posting the identical verdict comment each pass is
   *  spam — the sibling issue-triage ritual's re-runs are explicitly
   *  idempotent for the same reason. Comment-dedup only: it never suppresses
   *  a request-changes or merge decision, and the reasoning text embeds the
   *  PR's number/title and the specific verdict, so any changed fact posts a
   *  fresh comment. Optional: absent means "not assessed" (no own comments,
   *  or the viewer login was unknown), which behaves as an empty list — the
   *  dedup can only DROP a redundant comment, never change a decision. */
  readonly ownComments?: readonly string[];
  /** The body of the STANDING `CHANGES_REQUESTED` review the reviewing
   *  identity ITSELF posted, when that is its latest review on the PR (`gh pr
   *  list --json latestReviews`, author compared case-insensitively against
   *  `gh api user`). The review-verdict half of the re-run idempotency {@link
   *  ownComments} carries for queue-for-human comments: a request-changes
   *  decision whose reasoning matches this verbatim plans NO command in
   *  {@link planPrReviewCommands} — the standing review already says exactly
   *  that, and GitHub keeps it active until dismissed or superseded, so
   *  re-posting it each pass while the author leaves the PR red is the same
   *  duplicate spam the comment dedup closed. The reasoning embeds the PR's
   *  number/title and the specific verdict, so any changed fact posts a fresh
   *  review that supersedes the standing one. Optional: absent means "not
   *  assessed" (no own standing changes-requested review, an empty/garbage
   *  body, or the viewer login was unknown), which always posts — the dedup
   *  can only DROP a redundant re-post, never change a decision, and merge
   *  decisions never consult it. */
  readonly ownRequestChangesBody?: string;
  /** True when a STANDING `CHANGES_REQUESTED` latest review exists but the
   *  `gh api user` viewer lookup failed, so {@link reviewChangesRequested}'s
   *  own-review exclusion could not run — the review may be a human's
   *  explicit "not yet" or this ritual's own stale one, and nobody can say
   *  which. Before this flag, a failed lookup left the review not-assessed
   *  and an otherwise policy-green PR MERGED over it: the one merge-tier
   *  fact where a gh outage widened toward a merge (the same residual class
   *  the unassessed-size guard closed for additions/deletions). Now it
   *  queues for a human with reasoning that says exactly what could not be
   *  verified — a temporary, deduped queue during a lookup outage is
   *  recoverable on the next pass; a merge over a human's standing "no" is
   *  not. Optional: absent means no standing CR review or the viewer was
   *  known (the confirmed flag then owns the verdict); it can only narrow
   *  toward queue-for-human, never force a merge. */
  readonly reviewChangesRequestedUnverified?: boolean;
  /** True when gh's `latestReviews` report was UNREADABLE — not an array, or
   *  carrying an entry with no readable state. The changes-requested guards
   *  above judge only states they can read, so unreadable output silently
   *  disarmed BOTH: no `CHANGES_REQUESTED` entry was even recognizable, so
   *  neither the confirmed flag nor the unverified one could be minted, and
   *  an otherwise policy-green PR merged over what may be a human's standing
   *  "not yet" — the same garbage-widens-toward-merge class as {@link
   *  labelsUnassessed}, for the review sweep. Same fail-closed stance and
   *  merge-tier placement; absent means the sweep is CONFIRMED: an array of
   *  readable review states (possibly empty). */
  readonly latestReviewsUnassessed?: boolean;
  /** True when GitHub's own auto-merge is armed on the PR (`gh pr list
   *  --json autoMergeRequest` reports a non-null value). An armed auto-merge
   *  turns this ritual's approve into a merge TRIGGER: the moment the
   *  approval satisfies branch protection, GitHub merges with whatever
   *  method and head the arming chose — before the ritual's own pinned
   *  `--match-head-commit` squash ever runs — reopening the exact
   *  reviewed-bytes TOCTOU window the pin exists to shut. So a policy-green
   *  armed PR queues for a human instead of being approved at all. Optional:
   *  absent means not armed (gh reported `null`, or nothing), which behaves
   *  as false — the check can only narrow toward queue-for-human, never
   *  force a merge; any non-null value counts as armed, so a garbage report
   *  narrows toward a human too. */
  readonly autoMergeArmed?: boolean;
  /** File paths `git apply --check` named as failing to apply cleanly onto
   *  the current tree — populated only for a real, gh-confirmed conflict
   *  (`mergeable: false`, `mergeStateUnknown` absent), so a human's
   *  request-changes reasoning names exactly what to resolve instead of a
   *  generic "has merge conflicts". Optional: absent means either the PR is
   *  not a confirmed conflict, or the local check could not name a file
   *  (network/parse failure, or the local tree simply disagreed with gh's
   *  verdict) — {@link planPrReview} falls back to the generic conflict
   *  reasoning either way, never blocking on it. Reasoning-only, like {@link
   *  mergeStateUnknown} — it never moves a decision. */
  readonly conflictingPaths?: readonly string[];
  /** The OLD paths of files this PR renames, parsed off the fetched unified
   *  diff's `rename from` headers by {@link parseDiffRenameSources}. gh's
   *  `files` list reports only a rename's NEW name, so a PR that moved a
   *  file OUT of a security-sensitive path (renaming `engine/src/firing.ts`
   *  to an innocuous name while editing it) would otherwise slip the {@link
   *  touchesSecuritySensitivePath} sweep entirely — the one path evasion the
   *  enumerated files list cannot expose. Optional: absent means "not
   *  assessed" — no diff was ever fetched, so the rename sweep never ran and
   *  the merge tier fails closed toward a human. A successful fetch always
   *  confirms the sweep: an empty list means "assessed, renames nothing",
   *  the only state a merge may treat as clean. */
  readonly renamedFromPaths?: readonly string[];
  /** How many of the PR's review threads (a reviewer's line-level comment
   *  and its replies) are still UNRESOLVED, as GitHub's GraphQL
   *  `reviewThreads` reports them — `gh pr list --json` exposes no such
   *  field, so {@link annotateReviewThreads} reads it separately via `gh api
   *  graphql`. An unresolved thread is a human's explicit "look at this" the
   *  ritual must not squash-merge over, and `.github/branch-protection.json`
   *  sets `required_conversation_resolution: true`, so GitHub would REFUSE
   *  the merge anyway — AFTER the approve already posted, minting the
   *  dangling approval {@link remediateDanglingApproval} then dismisses,
   *  pass after pass. Optional: absent means "not assessed" — no read ran,
   *  or this PR was missing from it — and like {@link renamedFromPaths} the
   *  merge tier fails closed on absent: a confirmed `0` is the only state a
   *  merge may treat as clean. Narrowing-only: never moves a decision toward
   *  merge. */
  readonly unresolvedReviewThreads?: number;
}

/**
 * Security-hard rule (epic 0007, standing lesson): a PR touching guard,
 * containment, auth, or CSP surfaces — plus the CI workflow config that
 * gates every other PR, anything self-labeled `security`, the governance
 * files that decide who is even allowed to approve/merge (`CODEOWNERS`,
 * branch protection config), the `connection/` module that persists the
 * operator's API-key/OAuth-token credential to disk (`config.ts`,
 * `login.ts`, `service.ts`, `verify.ts`), the `server/` module that
 * implements the CSRF guard, rate limiter, and auth-probe wiring those
 * credentials get checked against (`server.ts`, `rate-limit.ts`,
 * `main.ts`, `routes.ts`), the `landing/` module behind the
 * CSRF-guarded EXECUTE endpoint that merges a branch into main and
 * self-restarts the running server process (`execute.ts`,
 * `self-restart.ts`), the `release/` module behind its own
 * CSRF-guarded EXECUTE endpoint that writes `package.json`/`CHANGELOG.md`
 * to disk and runs `git commit --signoff` + `git tag` (`execute.ts`), the
 * `control/` module that spawns and `SIGTERM`-kills the dashboard's own
 * server process by the pid it recorded, and self-restarts it in place
 * (`control.ts`, `cli.ts`), and THIS VERY RITUAL's own decision core and
 * `gh`-merge execute wiring (`flight/pr-review.ts`,
 * `flight/pr-review-execute.ts`) — a PR that quietly weakened
 * `planPrReview` to merge on a security-sensitive path, or taught
 * `pr-review-execute.ts` to skip re-deriving the decision, would otherwise
 * sail through on a green gate alone, since neither file contains a
 * "guard"/"auth"/"security"-style keyword — is NEVER auto-merged, no matter
 * how green the gate is; it always queues for MASTERMIND's human eyes. A PR
 * quietly loosening `.github/CODEOWNERS`, `.github/branch-protection.json`,
 * how `connection/config.ts` persists a credential, how `server/server.ts`
 * enforces its CSRF guard, how `landing/execute.ts` decides a gate is green
 * enough to merge and swap the live process, how `release/execute.ts`
 * decides what gets committed and tagged, how `control/control.ts` decides
 * which pid is safe to signal, or how this file's own `planPrReview`
 * decides what's policy-green is exactly the kind of change this ritual
 * exists to catch, even though none of those paths contain a
 * "guard"/"auth"/"security"-style keyword. `landing/`, `release/`, and
 * `control/` are each anchored with a trailing slash rather than a bare
 * substring so they flag only that directory's own logic, not e.g.
 * `web/landing-panel.ts` or `web/release-panel.ts` — the display-only UI
 * panels that render those cards and carry no merge/restart/commit/signal
 * concern of their own; `flight/pr-review` is anchored with the directory
 * prefix for the same reason, so it flags only this ritual's own two files,
 * not `web/pr-review-panel.ts` — the display-only UI panel that formats
 * their output and carries no decide/merge concern of its own. The
 * dashboard's `landing/execute.ts` and `release/execute.ts` are only the
 * CSRF-guarded HTTP wiring, though — the real merge/tag logic they call
 * into lives in `@autopilot/engine`'s `landing.ts` (`executeLanding`,
 * gate-then-merge), `release.ts` (`executeRelease`, the version bump +
 * CHANGELOG cut + commit/tag), and `adapters/git.ts` (`GitVcs.land`, which
 * runs the actual `git merge --no-ff --signoff`, and `GitVcs.tag`/`notes`,
 * which create the release tag and its attestation) — none of which
 * contain a "guard"/"auth"/"security"-style keyword or live under a
 * `landing/`/`release/` directory (they're flat files in `engine/src/`), so
 * a PR that quietly weakened `executeLanding`'s gate check or `GitVcs.land`'s
 * dirty-tree refusal would otherwise sail through untouched by every marker
 * above. `engine/src/landing.ts`, `engine/src/release.ts`, and
 * `engine/src/adapters/git.ts` are exact file-path fragments (not bare
 * keywords) for the same reason `flight/pr-review` is — precision matters
 * more than a short marker here, since `landing`/`release`/`git` alone would
 * over-match unrelated engine modules like `prompt.ts` referencing "landing
 * page" copy or `otlp.ts` importing a `git`-prefixed helper. Four more
 * `engine/src/adapters/` files carry the same kind of unmarked write/decide
 * power: `gate.ts` (`GateRunner`, whose `ok`/`code === 0` check IS "the
 * gate" the governance invariant says an agent's judgment never substitutes
 * for), `remediating-gate.ts` (wraps it with an autofix-then-`git
 * commit`-then-re-verify loop — the auto-remediation itself is a write path,
 * not just a read of the gate's verdict), `claude-cli.ts` (builds the
 * `--allowedTools`/`--disallowedTools` argv that IS the running agent's own
 * tool-permission boundary), and `worktree.ts` (creates the isolated git
 * worktree `docs/epics/0004-bash-containment-worktree.md` relies on for Bash
 * containment). None of the four contain a "guard"/"auth"/"security"-style
 * keyword either, so a PR that quietly made `GateRunner` report `ok: true`
 * on a nonzero exit, taught the remediation loop to commit past a still-red
 * gate, widened the CLI's `disallowedTools`, or pointed worktree creation
 * outside the containment boundary would sail through the same way the
 * landing/release gap did before it was closed. Two more dashboard-side
 * files carry the same kind of unmarked power: `apps/dashboard/src/fly.ts`
 * (`pnpm dashboard:fly`, the real live-flight orchestrator — the ONE file
 * that wires the real Claude CLI, `GateRunner`, containment-breach
 * detection, worktree creation, and budget capping together onto a real
 * target repo; every one of those safeguards is only as strong as the
 * wiring here) and `apps/dashboard/src/flight/spawn-flight.ts` (spawns
 * each flight's child process and sets `AUTOPILOT_FLIGHT=1` in its env —
 * the exact env var `control/control.ts`'s self-kill guard checks before
 * refusing to run; a PR that quietly stopped setting it, or changed what
 * gets spawned, would silently disable that guard). Neither contains a
 * "guard"/"auth"/"security"-style keyword. `apps/dashboard/src/fly.ts` is
 * an exact file-path fragment rather than a bare `fly` or `fly.ts` marker
 * because `apps/dashboard/src/web/features/fly.ts` — the display-only
 * Fly-bar UI client that only renders flight status in the browser — is
 * ALSO named `fly.ts`, just nested one directory deeper; anchoring the full
 * `apps/dashboard/src/` prefix is what keeps the marker from over-matching
 * it. One more dashboard-side file carries the same kind of unmarked
 * decide power: `apps/dashboard/src/gate-commands.ts` (`gateCommands`),
 * whose own header comment calls it out as "the ONE source `fly.ts` ...
 * and `landing/execute.ts` ... both gate through" — a PR that quietly
 * dropped a step (e.g. `test` or `build`) from its `kinds` list would
 * silently narrow the gate for every live flight AND every landing
 * execute at once, exactly the kind of change `engine/src/adapters/gate.ts`
 * is already flagged for, just one layer upstream of it. It contains no
 * "guard"/"auth"/"security"-style keyword either, so `gate-commands.ts` is
 * an exact file-path fragment for the same over-match reason as the two
 * markers above it. One engine-side file carries the deepest unmarked power
 * of all: `engine/src/firing.ts` (`runFiring`, the atomic firing itself —
 * the founder-mandated post-commit check that decides whether a fresh
 * commit stays, gets additively reverted via `deps.vcs.revertLast()`, or is
 * left in place as `'unverifiable'` when the gate crashed before judging
 * it). A PR that quietly inverted the `gate.ok` branch, dropped the
 * `revertLast()` call, or widened `'crashed'` to also swallow a genuine
 * fail would silently turn "stays green or reverts cleanly" into "stays red
 * and ships anyway" — the exact safety promise this whole ritual exists to
 * protect. It contains no "guard"/"auth"/"security"-style keyword either.
 * `engine/src/firing.ts` is an exact file-path fragment for the same reason
 * as `engine/src/landing.ts` and its neighbors: a bare `firing` marker
 * would also over-match `apps/dashboard/src/shared/live-firing.ts`, the
 * display-only module that formats live activity for the office-map UI and
 * carries no gate/revert concern of its own. One more engine adapter carries
 * the same kind of unmarked power, upstream of every check above: `engine/
 * src/adapters/store.ts` (`SqliteFiringStore.recordFiring`), the ONE place
 * that writes the "un-fakeable chain" epic 0007's governance invariants
 * name explicitly — the append-only `events` log plus the `metrics`
 * projection every firing (including this very ritual's own merge/
 * request-changes/queue-for-human calls) is judged and audited from. A PR
 * that quietly dropped the `events` insert, hardcoded `shipped`/
 * `sha_verified` to true regardless of `record.shipped`/`record.shaVerified`,
 * or stopped writing `test_first`/`picked_rank`/`deviation_reason` would
 * corrupt the audit trail every other safeguard in this file assumes is
 * honest, without touching a single "guard"/"auth"/"security"-style keyword.
 * A bare `store` substring is deliberately avoided here too — it appears
 * in dozens of unrelated modules across `apps/dashboard/src` (config store,
 * task store, connect-panel, etc.), so the marker is the full path, same
 * precision reasoning as every other `engine/src/adapters/*.ts` entry
 * above it. Two more `engine/src/adapters/` files closed out the directory:
 * `fs-control.ts` (the STOP-sentinel kill switch the operator relies on to
 * halt a runaway loop, plus the restart-safe runner state and the prompt's
 * SHA-256 version) and `instance-lock.ts` (the OS-level lockfile stopping
 * two flights from racing the same SQLite store and target repo). A PR that
 * quietly made `stopRequested()` always report `false`, or weakened
 * `FileInstanceLock.acquire`'s staleness check, would defeat a safety
 * mechanism as surely as a weakened `GateRunner` would, with no
 * "guard"/"auth"/"security"-style keyword in either path. One dashboard-side
 * file has the same unmarked power as THIS ritual's own two files, just for
 * its sibling: `flight/issue-triage.ts` (`planIssueTriage`,
 * `planIssueTriageCommands`, `executeIssueTriageCommands`,
 * `runIssueTriageRitual`), the KEEPER triage ritual's decision core and its
 * own `gh issue edit --add-label`/`gh issue comment` execute wiring. A PR
 * that quietly weakened its duplicate-detection threshold to relabel/reopen
 * spam, or taught its execute wiring to skip re-deriving the decision the
 * way `pr-review-execute.ts` is flagged above for the same risk, would
 * sail through unmarked for the identical reason `pr-review.ts` itself
 * needed a marker: neither file contains a "guard"/"auth"/"security"-style
 * keyword. Anchored as `flight/issue-triage` — the directory-prefixed form
 * every `flight/*` entry in this list uses — so a future
 * `web/issue-triage-panel.ts` display-only UI panel (none exists yet; this
 * ritual's HTTP/UI wiring is still deferred per this file's header comment)
 * would stay unflagged the same way `web/pr-review-panel.ts` already does.
 * Rather than
 * relying on a future firing to notice the next such gap by hand the way
 * these last several did, `pr-review.test.ts` now also enumerates every
 * file in `engine/src/adapters/` and asserts each one is either flagged
 * here or in that test's explicit `BENIGN_ADAPTERS` allow-list (currently
 * `index.ts`, a pure re-export barrel; `clock.ts`, an injected system-clock
 * reader; and `pacer.ts`, an advisory SELECT-only cadence suggestion with
 * no write of its own) — a new adapter file can no longer silently slip
 * past this ritual unmarked; it now fails a test until triaged one way or
 * the other. That coverage guard only swept the adapters subdirectory,
 * though, and said nothing about `engine/src`'s own flat files — of the
 * 24, 15 are pure computation, formatting, or type-only and correctly slip
 * past every marker (`info.ts`, `index.ts`, `inbox.ts`, `pace.ts`,
 * `prompt-position-audit.ts`, `repo-map.ts`, `routing.ts`, `config.ts`,
 * `ask.ts`, `ports.ts`, `loop.ts`, `resilience.ts`, `stream.ts`,
 * `prompt.ts`, `telemetry.ts`), but two carry the same unmarked write power
 * the adapters sweep kept finding one at a time: `github-sync.ts`
 * (`planGithubSync`, which decides the exact `gh repo create --source=.
 * --push` or `git push` command a project-page "sync to GitHub" action
 * runs — the same create/push write power `release.ts` and `landing.ts`
 * already earned a marker for) and `otlp.ts` (`exportOtlpResourceSpans`,
 * the one place in the engine that performs a real outbound `fetch` POST
 * of firing-record data to a caller-configured external endpoint — a
 * genuine network write even though nothing wires an endpoint into the
 * firing loop yet, the same "flag the capability, not just today's
 * callers" stance this very file's own currently-uncalled
 * `executePrReviewCommands` already gets). `pr-review.test.ts`'s coverage
 * guard now also enumerates every file directly in `engine/src` (not just
 * `engine/src/adapters/`), so a future flat engine module can no longer
 * silently slip past this ritual unmarked either. Deliberately simple
 * substring matching against touched paths, not a model call — the same
 * cheap, deterministic, human-overridable first pass `issue-triage.ts`'s
 * `DIMENSION_KEYWORDS` already established for this codebase.
 *
 * Extending the census past `packages/mcp/src` to its neighbor
 * `packages/store/src` (the actual `better-sqlite3` persistence layer every
 * package — engine, onboarding, and the dashboard's own `read/mutate.ts`
 * wrappers — writes through) surfaced five more unmarked files, the same
 * "no security keyword, matches no existing marker" gap `mcp/src/control.ts`
 * closed for its package: `store/src/mutate.ts` is the REAL implementation
 * behind `read/mutate.ts`'s thin open-mutate-close wrappers — `deleteProject`,
 * `setTaskStatus`'s VERDICT-close cascade, `claimTask`'s race-proof board
 * claim, and the SOUL/fleet-wisdom ratify calls that overwrite live text —
 * none of which the dashboard-side wrapper's own marker can reach, since a
 * PR could weaken the underlying function without touching the wrapper file
 * at all. `store/src/db.ts` opens the one writable SQLite connection every
 * writer in the tree shares: `resolveStorePath`'s NUL-byte guard, the
 * `foreign_keys = ON` pragma the schema's CHECK constraints rely on, and the
 * busy-retry hardening PARALLEL FLIGHTS 2/6 added for concurrent-flight
 * writers all live here, unreachable by any keyword. `store/src/migrate.ts`
 * is the schema-drift checksum check plus the newer-than-this-build downgrade
 * refusal — the same the-gate-reads-its-own-config class as
 * `engine/src/adapters/remediating-gate.ts`, just for the schema instead of
 * the CI gate. `store/src/schema.ts` defines every CHECK-constraint domain
 * invariant the persistence layer enforces instead of trusting callers (task/
 * project status enums, foreign keys) plus `validateMigrations`'s
 * duplicate/gap collision guard for the fleet's own migration numbering.
 * `store/src/snapshot.ts` is the backup ritual: its own header comment
 * documents that `VACUUM`-compacting a backup must run strictly AFTER the
 * integrity check passes, never before, "or a corrupt source would get
 * silently laundered into a clean-looking backup" — a PR reordering those two
 * calls would defeat that guarantee with no security keyword in its path —
 * plus the retention-pruning `rmSync` sweep that decides which rotated
 * backups survive. A bare `'store'` marker is deliberately avoided for the
 * identical over-match reason `'engine/src/adapters/store.ts'` above already
 * documents, so every entry here is an exact file-path fragment instead.
 * `store/src/search.ts` and `store/src/vector.ts` also write (index/deindex
 * a project's own FTS5 search cache and vector table), but that write is
 * scoped, reversible, and rebuildable — not the destructive/decide class the
 * five markers above earn, so both stay unflagged; `pr-review.test.ts`'s
 * coverage guard sweeps `packages/store/src` the same way it already does
 * `packages/mcp/src`, so a future file there can no longer silently slip
 * past this ritual unmarked either.
 *
 * The census's next package is `@autopilot/onboarding`, starting with its
 * `backup/` directory — the folder-lock ritual (MASTER-PLAN §7) every project
 * runs through before its first firing. `backup/guard.ts` (the cardinal-rule
 * `assertBackedUp` throw), `backup/secret-guard.ts`, and `backup/size-guard.ts`
 * already match the bare `'guard'` marker above. `backup/ritual.ts`
 * (`lockRepo`) did not: it decides the commit/tag/checkout sequence that
 * mints the MYTH+LEGACY snapshot every later `assertBackedUp` call trusts, so
 * it earns the same directory-prefixed marker `store/src/mutate.ts` and
 * `mcp/src/control.ts` use. `backup/refs.ts` (tag-name constants plus the
 * read-only `isBackedUp` check), `backup/errors.ts` (thrown-error classes),
 * and `backup/types.ts` (interfaces only) carry no write power of their own
 * and stay unflagged; `pr-review.test.ts`'s coverage guard now sweeps
 * `packages/onboarding/src/backup` the same way it already does
 * `packages/store/src`, so a future file there can no longer silently slip
 * past this ritual unmarked either.
 *
 * The backup/ directory now fully censused, the next slice in
 * `@autopilot/onboarding` is its `adapters/` directory — the actual I/O
 * implementations behind the ports the rest of the package programs against.
 * `adapters/git-backup.ts`'s `GitBackup` class is the real git-write
 * implementation the backup ritual's `BackupVcs` port dispatches to:
 * `commitAll` decides the secret-scan-then-huge-file-scan-then-`git add -A`
 * sequence before every baseline commit, and
 * `initRepo`/`createTag`/`createBranch`/`checkoutBranch` are the actual
 * init/tag/branch/checkout writes `ritual.ts`'s `lockRepo` orchestrates — the
 * identical real-git-write class `engine/src/adapters/git.ts` already earned
 * its marker for, just for the onboarding package instead of a live flight.
 * `adapters/sqlite-project-store.ts`'s `SqliteProjectStore` is the direct
 * SQLite writer behind project registration and board seeding: `register`
 * INSERTs the `projects` row a repo is onboarded under, `recordBackup`
 * INSERTs the `versions` rows every later backup-ref lookup trusts, and
 * `seedBoard` INSERTs the initial `tasks` rows straight into the board with
 * no approval gate — the same direct-write class `store/src/mutate.ts`
 * already earned its marker for, just scoped to onboarding's own two tables
 * instead of the shared store's full write surface. `adapters/sqlite-index-
 * store.ts`'s `SqliteIndexStore` also writes SQLite (`project_index`/
 * `project_index_meta`), but — like `store/src/search.ts`/`vector.ts` — the
 * write is a rebuildable content-hash-keyed cache scoped to one project, not
 * the destructive/decide class the two markers above earn, so it stays
 * unflagged. `adapters/fs-file-source.ts` and `adapters/fs-snapshot.ts` are
 * both explicitly read-only (their own header comments state it) walks of
 * the target tree feeding the index and gate detectors respectively, and
 * `adapters/ignore.ts` is a pure constant Set of directory names to skip —
 * none of the three carry write power. `pr-review.test.ts`'s coverage guard
 * now sweeps `packages/onboarding/src/adapters` the same way it already does
 * `packages/onboarding/src/backup`, so a future file there can no longer
 * silently slip past this ritual unmarked either.
 *
 * The adapters/ directory now fully censused, the next slice in
 * `@autopilot/onboarding` is its `gate/` directory (flat files only —
 * `gate/detectors/` is a nested subdirectory the census sweeps separately,
 * the same one-level-at-a-time split `web/` vs `web/features/` already
 * established). `gate/detect.ts`'s `detectGate` ranks every ecosystem
 * detector's evidence and returns the primary `GateSpec` that "drives the
 * engine GatePort" (its own doc comment) — deciding which typecheck/test/
 * build/lint commands become the gate a brand-new project trusts from its
 * first firing on, the same decide-power class `apps/dashboard/src/
 * gate-commands.ts` already earns its marker for. `gate/manifests.ts`'s
 * `scriptCommand`/`execCommand`/`directCommand` build the actual
 * `GateCommand` argv every detector hands back, and its
 * `packageScripts`/`tomlHasSection` decide what counts as evidence a script
 * or tool config exists at all — the same upstream-of-a-flagged-surface
 * reasoning `gate-commands.ts` and `detect.ts` above already earn markers
 * for. Neither contains a "guard"/"auth"/"security"-style keyword, so both
 * are exact file-path fragments. `gate/snapshot.ts` stays unflagged: its own
 * header comment states it is "100% synchronous and side-effect-free," a
 * pure read-only view builder that "CANNOT touch the repo" (the real walk
 * lives in `adapters/fs-snapshot.ts`, already triaged benign above).
 * `gate/types.ts` is interfaces and constants only, the same
 * carries-no-write-power class `backup/types.ts` already stays unflagged
 * for. `pr-review.test.ts`'s coverage guard now sweeps
 * `packages/onboarding/src/gate` the same way it already does
 * `packages/onboarding/src/adapters`, so a future file there can no longer
 * silently slip past this ritual unmarked either.
 *
 * The gate/ flat files now fully censused, the deferred nested slice is
 * `gate/detectors/`. Each of `js.ts`/`python.ts`/`go.ts`/`rust.ts`
 * independently decides the actual gate a brand-new project runs from its
 * first firing on for that ecosystem — which typecheck/test/build/lint
 * command wins, and with what argv — the same decide-power class
 * `gate/detect.ts` (which ranks across all four) and `gate/manifests.ts`
 * (whose builders every one of them calls) already earn markers for. A PR
 * that quietly dropped `jsDetector`'s `eslint.config`/`.eslintrc*` fallback,
 * or `pythonDetector`'s `ruff`-before-`flake8` precedence, or `goDetector`'s
 * `golangci-lint` preference over bare `go vet`, or `rustDetector`'s
 * `--workspace` propagation, would silently narrow or misconfigure that
 * ecosystem's onboarding gate with no "guard"/"auth"/"security" keyword in
 * any of their paths. `detectors/index.ts` is a pure re-export barrel, the
 * same carries-no-write-power class every other package's flat `index.ts`
 * already stays unflagged for. `pr-review.test.ts`'s coverage guard now
 * sweeps `packages/onboarding/src/gate/detectors` the same way it already
 * does `packages/onboarding/src/gate`, so a future fifth-language detector
 * can no longer silently slip past this ritual unmarked either.
 *
 * The gate/ subtree now fully censused, the next slice was `onboard/`: the
 * onboarding ritual's own orchestration directory. `onboard.ts` is the real
 * locks/registers/resumes/seeds orchestrator (the write terminus of the
 * whole onboarding sweep) and `soul.ts` decides the real starter safety
 * doctrine text it writes verbatim into every new project — both earned
 * markers alongside `store/src/mutate.ts` and its `onboarding/src/onboard/`
 * neighbors above. `types.ts`, `folder-triage.ts`, `detect-issues.ts`,
 * `organize.ts`, `backlog.ts`, and `task-id.ts` are pure
 * classification/detection/id-generation helpers with no write power of
 * their own, allow-listed in `pr-review.test.ts`'s `BENIGN_ONBOARDING_ONBOARD`.
 *
 * That left two slices to close out `@autopilot/onboarding` entirely:
 * `index/` (the content-hash project index) and the package's own flat
 * root files. Neither surfaced a new marker. `index/core.ts` is the pure
 * content-hash index — its own header states "No I/O" — `index/model.ts`
 * and `index/ports.ts` are interfaces/types only, and `index/language.ts` is
 * a pure extension→language lookup table. `index/indexer.ts` orchestrates
 * all four (diffing the current tree against what's stored) but never
 * writes anything itself: every actual persistence call it makes lands in
 * `adapters/sqlite-index-store.ts`'s `SqliteIndexStore`, already triaged
 * benign when `adapters/` was censused (a rebuildable, content-hash-keyed
 * cache, the same class as `store/src/search.ts`/`vector.ts`). At the
 * package root, `index.ts` is a pure re-export barrel and `info.ts` is a
 * static capability descriptor (version string + step-name constants) —
 * the same no-write-power class every other package's `types.ts`/`index.ts`
 * already stays unflagged for. `pr-review.test.ts`'s coverage guard now
 * sweeps `packages/onboarding/src/index` and the flat
 * `packages/onboarding/src/` root the same way it already does every other
 * subdirectory, closing out the full census of `@autopilot/onboarding`:
 * every file across `backup/`, `adapters/`, `gate/`, `gate/detectors/`,
 * `onboard/`, `index/`, and the package root is now either flagged here or
 * explicitly allow-listed as benign, and a future file in any of them can
 * no longer silently slip past this ritual unmarked.
 *
 * With every package under `packages/` that has a write/decide surface now
 * censused (`engine`, `mcp`, `store`, `onboarding`), the one workspace
 * package left unswept is `@autopilot/tokens` — the design-token package
 * (`packages/tokens/src/`). Unlike every prior slice, it surfaced zero new
 * markers: a directory-wide grep for `fs`/`fetch`/`exec`/`spawn`/`process`
 * turned up nothing but a regex `.exec()` call (string matching, not process
 * execution), and every file is pure computation over constant data —
 * `color.ts`'s OKLCH→WCAG contrast math, `css.ts`'s `--color-*`/`--space-*`
 * custom-property string builders, `scale.ts`/`m3.ts`/`mx.ts`/`themes.ts`'s
 * constant token tables, `locales.ts`/`strings.ts`'s i18n lookup tables, and
 * `index.ts`'s re-export barrel. None decide a merge, write to disk, or call
 * out over the network. `pr-review.test.ts`'s coverage guard now sweeps
 * `packages/tokens/src` the same way it already does every other package, so
 * a future token module that starts doing any of that can no longer
 * silently slip past this ritual unmarked either.
 *
 * The workspace packages censused, the remaining unswept
 * execute-on-a-real-machine surface was the `scripts/` tree itself — only
 * its `ci/` enforcement scripts and the launcher `.cmd` files carried
 * markers. Sweeping it surfaced one gap: `scripts/github/` (its
 * `sync-labels.mjs` applies `.github/labels.json` to the live repo via `gh
 * label create --force` under the operator's identity — a PR teaching it to
 * rename or delete a hold label would disarm the HOLD_LABEL_MARKERS guard
 * this very ritual honors), now directory-anchored like `src/github/`.
 * Everything else stays benign with a written reason in `pr-review.test.ts`'s
 * `BENIGN_SCRIPTS`: the doc/diagram/dataset generators and their `--check`
 * drift modes (neutering one lets stale docs merge — a quality concern, not
 * an enforcement bypass, per the `scripts/ci/` marker's own triage), the
 * read-only i18n/cockpit-metrics analyzers, the operator-typed single-shot
 * codemods and self-study tools (the same own-action exemption
 * `demo.ts`/`reset.ts` get — including `check-prompt-gate.mjs`,
 * enforcement-shaped but run locally against a git-ignored telemetry store,
 * never by CI or a live flight), `setup.mjs` (already deliberately unflagged
 * above), and the `.d.mts` declaration stubs. The census guard sweeps
 * `scripts/` RECURSIVELY, so a future script — say a new `gh`-writing tool
 * landing outside `scripts/github/` — can no longer silently slip past this
 * ritual unmarked either.
 */
const SECURITY_SENSITIVE_PATH_MARKERS = [
  'guard',
  'containment',
  'auth',
  'csp',
  'security',
  '.github/workflows',
  'codeowners',
  'branch-protection',
  'connection',
  'server',
  'landing/',
  'release/',
  'control/',
  'flight/pr-review',
  'flight/issue-triage',
  // The report-from-here ritual: plans the exact `gh issue create` argv a
  // bug report / pool offer runs against the operator's GitHub AND ships the
  // apply layer that executes it (`executeReportCommands`) and writes board
  // tasks (`applyReportTask`) — the same decide-and-execute class
  // `flight/issue-triage` above is flagged for. It ends in neither
  // `-execute.ts` (so the flight/*-execute.ts census sweep misses it) nor
  // any security keyword; directory-prefixed like every `flight/*` entry so
  // a future `web/report-from-here-panel.ts` display panel stays unflagged.
  'flight/report-from-here',
  // Dispatches the ARCHITECT chat control tools' write/DESTRUCTIVE store
  // operations (tasks_create/set-status/reorder/delete, project_reset) and
  // owns their argument validation itself — server.ts leaves it only the
  // HTTP framing. A PR that quietly loosened that validation, or
  // reclassified a destructive tool's CONTROL_TOOL_SAFETY tier so a future
  // action-card UI auto-runs it without an operator click, carries no
  // "guard"/"auth"/"security"-style keyword and matches no other marker
  // ('control/' needs the slash, so 'flight/control-execute.ts' slips it).
  'flight/control-execute',
  // The OTHER half of that same trust chain, downstream of it: the actual MCP
  // tool handlers `flight/control-execute.ts` dispatches into
  // (tasksCreate/taskSetStatus/tasksReorder/tasksDelete/projectReset) —
  // deleteTask and deleteProject are DESTRUCTIVE store writes, yet
  // `packages/mcp/src/control.ts` matches neither the `'control/'` marker
  // (no trailing slash — this is control.ts, not a control/ directory) nor
  // any other keyword above. A PR that loosened this file's own
  // project-boundary check (`tasksDelete`'s owner-mismatch guard) or widened
  // a tool's registered MCP safety annotation would carry no flagged path.
  'mcp/src/control.ts',
  // The REAL implementation behind `read/mutate.ts`'s thin open/mutate/close
  // wrappers (deleteProject, setTaskStatus's VERDICT-close cascade,
  // claimTask's race-proof board claim, the SOUL/fleet-wisdom ratify calls
  // that overwrite live text) — a PR could weaken any of these without ever
  // touching the wrapper file the existing 'read/mutate.ts' marker flags.
  'store/src/mutate.ts',
  // Opens the one writable SQLite connection every package shares:
  // resolveStorePath's NUL-byte guard, the foreign_keys=ON pragma the
  // schema's CHECK constraints rely on, and the busy-retry hardening
  // PARALLEL FLIGHTS 2/6 added for concurrent-flight writers. No security
  // keyword in its path.
  'store/src/db.ts',
  // Schema-drift checksum check plus the newer-than-this-build downgrade
  // refusal — the-gate-reads-its-own-config class, same as
  // engine/src/adapters/remediating-gate.ts, for the schema instead of CI.
  'store/src/migrate.ts',
  // Every CHECK-constraint domain invariant the persistence layer enforces
  // instead of trusting callers, plus validateMigrations's duplicate/gap
  // collision guard for the fleet's own migration numbering.
  'store/src/schema.ts',
  // The backup ritual: VACUUM-compacting a backup must run strictly AFTER
  // its integrity check passes ("or a corrupt source would get silently
  // laundered into a clean-looking backup" — this file's own header), plus
  // the retention-pruning rmSync sweep deciding which backups survive.
  'store/src/snapshot.ts',
  // The other half of that same trust chain, upstream of it: lifts an
  // ARCHITECT-mode model's proposed tool call out of its answer text and
  // computes `safety: CONTROL_TOOL_SAFETY[tool]` — the field the client's
  // action card trusts to auto-run 'read' proposals with no click, per the
  // epic's "writes/destructive require a click" acceptance criterion. A PR
  // that mislabeled any write/destructive tool's safety here (or let the
  // model's own JSON supply `safety` instead of the trusted table) would
  // auto-execute it — e.g. project_reset — with no operator confirmation.
  // No security keyword in its path.
  'ask/architect-proposal.ts',
  // The store-mutation wrapper every dashboard write API call goes through
  // (createTaskInStore, setTaskFocus, reorderTasks, unpinTasks, setTaskStatus,
  // deleteTask, deleteProject, resetProjectTelemetry, requestFlightPause,
  // markSoulReviewed, propose/ratify/dismiss SOUL and fleet-wisdom
  // amendments) — split out of read/source.ts (SHELL DECOMP 3/5) but still
  // living under a directory literally named 'read', so it matches no
  // existing marker despite deciding every operator-facing write. A PR that
  // weakened its fail-safe-to-false error handling, or slipped a new
  // dangerous mutation in here, carries no security keyword in its path.
  'read/mutate.ts',
  // Decides WHERE a flight's containment worktree lives (deriveWorktreePlan:
  // always a SIBLING of target, never nested inside it) — the dashboard-side
  // twin of engine/src/adapters/worktree.ts below. A PR that nested the
  // worktree back under target would reopen the exact Bash escape hatch epic
  // 0004 closed, with no security keyword anywhere in its path.
  'flight/worktree.ts',
  // Wires the dashboard SERVER's own multi-lane launch (`POST /api/fleet`,
  // board web-mtdcfel4-0bxf4h) — opens the real store and starts real
  // flights via the injected FlightApi, the same decide-and-execute class
  // flight-api.ts is flagged for below. `flight/fleet-launch.ts` itself
  // stays pure (partitioning only); this is the impure IO half.
  'flight/fleet-launch-api',
  // Keys each flight instance's engine-lock, log, and containment-guard
  // settings FILENAMES — guardSettingsFileName names the `--settings` file a
  // running flight's PreToolUse guard reads, and its own doc records the live
  // bug where shared keying redirected a sibling instance's containment
  // boundary. Same defeat-a-safety-mechanism class as
  // engine/src/adapters/instance-lock.ts below; no security keyword in path.
  'flight/lock.ts',
  // The FlightRunner — the dashboard's "fly this folder" backing service:
  // decides WHAT flight child process gets spawned against WHICH folder and
  // owns the budget floor + firings cap the operator relies on. One layer
  // upstream of flight/spawn-flight.ts below, the same
  // upstream-of-a-flagged-surface reasoning gate-commands.ts earned its
  // marker for; no security keyword in its path. The `.ts` suffix keeps
  // `test/flight/runner.test.ts` unflagged, same anchoring as
  // flight/worktree.ts above.
  'flight/runner.ts',
  // Serializes flight-end rituals' git commits into this checkout across
  // processes (withRitualLock). A PR that weakened its acquire/wait loop
  // would reintroduce the cross-flight commit race it exists to close — the
  // same defeat-a-safety-mechanism class as
  // engine/src/adapters/instance-lock.ts and flight/lock.ts; no security
  // keyword in its path.
  'flight/ritual-lock.ts',
  // Decides WHERE a live flight's firing spans get POSTed and which headers
  // (commonly bearer tokens) ride along — the flight-side config for the
  // engine's flagged OTLP transport, which the 'engine/src/otlp.ts' marker
  // below cannot match. Retargeting the endpoint is a data-flow/privacy
  // change, the same stance usage-pool-scan.ts is flagged under; no
  // security keyword in its path.
  'flight/otlp.ts',
  // The end-of-flight sweeps fly.ts runs after its firing loop: direct board
  // writes (setTaskStatus/createTask) plus SOUL and fleet-wisdom amendment
  // PROPOSALS. Their whole safety story is "proposal-only, the operator
  // decides" (source: 'self', status: 'needs_approval') — a PR that quietly
  // self-approved those proposals or widened what a sweep may close would
  // bypass the operator with no security keyword in its path. Same
  // store-write class as flight/control-execute above.
  'flight/post-flight-sweeps.ts',
  // The per-firing hooks that close/create board tasks the moment a firing
  // lands — taskShouldClose/verifyDeliverable decide WHAT counts as shipped,
  // the board-side twin of the un-fakeable chain
  // engine/src/adapters/store.ts below is flagged for: weakening that
  // verification lets unverified work mark tasks done. No security keyword.
  'flight/firing-hooks.ts',
  // FlightRunnerRegistry: enforces the same-folder refusal (two flights
  // racing one repo — the class instance-lock.ts below closes at the OS
  // level) and the maxConcurrent shared-quota cap. One layer upstream of the
  // flagged flight/runner.ts, the same upstream-of-a-flagged-surface
  // reasoning gate-commands.ts earned its marker for. The `.ts` suffix keeps
  // `test/flight/registry.test.ts` unflagged, same anchoring as
  // flight/worktree.ts above.
  'flight/registry.ts',
  // Routes the operator's stop/pause KILL commands to the right flight
  // (folder + instanceId → registry) — its own header records the live OPS
  // bug where silently dropped routing reported "no flight is running" and a
  // stop stopped nothing: misrouting here disables the same kill switch
  // engine/src/adapters/fs-control.ts below is flagged for protecting.
  'flight/flight-api.ts',
  // The D4 pipeline-view server-side HTML chain (epic 0015): these three
  // build the markup `GET /api/pipeline` returns, and `features/pipeline.ts`
  // injects that exact string via the client bundle's ONE sanctioned
  // `innerHTML` sink (its header's documented trust boundary — every other
  // panel is createElement/textContent only). Span labels derive from
  // store text a model may have authored, so the HTML-escaping inside
  // pipeline-svg.ts/pipeline-tree-html.ts is the only thing between
  // model-authored text and script-free markup in the operator's browser —
  // a PR that weakened an escape, or widened what the sink accepts, is XSS
  // with no security keyword in its path. `.ts`-suffixed so
  // `test/web/pipeline-*.test.ts` stays unflagged, same anchoring as
  // flight/worktree.ts above; the pure `read/pipeline-*` graph math stays
  // benign in the read/ census.
  'web/pipeline-panel.ts',
  'web/pipeline-svg.ts',
  'web/pipeline-tree-html.ts',
  'features/pipeline.ts',
  // ——— Full flight/ census entries. `pr-review.test.ts` now sweeps EVERY
  // file in `apps/dashboard/src/flight/` (not just `*-execute.ts`, whose
  // narrower census famously missed report-from-here.ts above), so each file
  // there is either flagged here or allow-listed as benign WITH a written
  // reason in that test's `BENIGN_FLIGHT` set. The fourteen below are the
  // census's triage of the previously unmarked files that DO carry
  // write/decide power with no security keyword in their paths. All
  // `.ts`-suffixed so `test/flight/*.test.ts` stays unflagged, same
  // anchoring as flight/worktree.ts above.
  // Wraps a bare pid this process never spawned as an adoptable flight and
  // routes kill() signals at it — the same process-termination surface
  // engine/src/adapters/cli-pid-registry.ts below is flagged for.
  'flight/adopt.ts',
  // Applies a model's board ranking via a DIRECT reorderTasks store write
  // (steering what every autonomous firing works next) AND is the wiring
  // that invokes the code-side runaway guard — dropping that call would
  // bypass the guard without touching its file.
  'flight/board-triage.ts',
  // Post-flight reorderTasks store write — same board-steering class as
  // board-triage.ts above.
  'flight/triage.ts',
  // The runaway demotion guard itself (the $240 mutation-lesson rule that
  // demotes regardless of model opinion) — weakening it is the same
  // defeat-a-safety-mechanism class as engine/src/adapters/fs-control.ts.
  'flight/triage-factors.ts',
  // Mints board tasks straight to 'queued' from INBOX files with NO
  // approval gate (by design — the operator authored the note), so widening
  // WHAT counts as a note widens unattended task creation.
  'flight/inbox-triage.ts',
  // The per-firing TURN ceiling — with the budget floor in the flagged
  // flight/runner.ts, one of the two runaway-loop stops.
  'flight/budget.ts',
  // Decides when the FULL test suite runs vs the impacted fast path — a PR
  // that stretched the full-run cadence would narrow the gate, the same
  // class gate-commands.ts below is flagged for.
  'flight/gate-schedule.ts',
  // Decides WHICH lane may work WHICH board tasks before launch — the
  // board-steering power flight/board-triage.ts and flight/triage.ts above
  // are flagged for, applied across the whole fleet at once. Weakening the
  // partition (splitting an area group, or widening a lane's scope) puts two
  // lanes back on one file, which is exactly the collision the 3-lane ramp
  // paid for on 2026-08-27.
  'flight/fleet-launch.ts',
  // taskShouldClose — decides whether a firing's self-reported completion
  // claim closes a board task; the close-decision half of the un-fakeable
  // chain flight/firing-hooks.ts above is flagged for.
  'flight/completion.ts',
  // The DELIVERABLE verifier halves (soft vocabulary check + executable
  // predicates) — WHAT counts as shipped; weakening either re-opens the
  // false-close class they were built to stop.
  'flight/deliverable.ts',
  'flight/deliverable-predicates.ts',
  // Extract the ADR:/EPIC-SPEC: markers whose committed-file proof gates a
  // "complete" claim — an extractor weakened to return null makes fly.ts
  // silently SKIP the proof, widening trust with no keyword in the path.
  'flight/adr-spec.ts',
  'flight/epic-spec.ts',
  // Builds the exact child-process invocation (script path, args, env)
  // fly.ts spawns for the SELF-STUDY refresh — deciding WHAT gets spawned,
  // the same class flight/spawn-flight.ts below is flagged for.
  'flight/self-study.ts',
  // Operator env config deciding WHICH directories the flagged
  // usage-pool-scan.ts may read (private-transcript scope) — a data-flow/
  // privacy surface, the same stance flight/otlp.ts above is flagged under.
  'flight/usage-pool-config.ts',
  'engine/src/landing.ts',
  'engine/src/release.ts',
  'engine/src/adapters/git.ts',
  'engine/src/adapters/gate.ts',
  // Rebuilds its command list on every run() instead of freezing it at
  // construction — the seam flight/gate-schedule.ts (already flagged above)
  // relies on to re-evaluate its every-Nth-firing full-suite backstop per
  // firing. A PR that cached the first commands() call (or dropped the
  // factory for a fixed array) would silently re-freeze the schedule this
  // adapter exists to keep live, with no security keyword in its path — same
  // class as engine/src/adapters/gate.ts above.
  'engine/src/adapters/dynamic-gate.ts',
  'engine/src/adapters/remediating-gate.ts',
  'engine/src/adapters/claude-cli.ts',
  'engine/src/adapters/ollama.ts',
  'engine/src/adapters/worktree.ts',
  'apps/dashboard/src/fly.ts',
  'flight/spawn-flight.ts',
  'apps/dashboard/src/gate-commands.ts',
  // The write half of the INBOX ritual: the ONLY way an operator-facing HTTP
  // request drops a file into a project's INBOX/ folder — the exact folder
  // the flagged flight/inbox-triage.ts mints a 'queued' board task from with
  // NO approval gate, by design, because the operator is trusted to have
  // authored the note. A PR that widened this file's path handling (e.g. let
  // projectId or message escape the project's own root_path) would let
  // arbitrary written content ride that same no-approval-gate path straight
  // to an unattended board task. Directory-prefixed with the filename, like
  // 'ask/architect-proposal.ts' and 'read/mutate.ts', since a bare 'inbox'
  // marker would over-match engine/src/inbox.ts (the read half, pure
  // computation) and flight/inbox.ts (its dashboard-side wrapper).
  'inbox/add.ts',
  'engine/src/firing.ts',
  'engine/src/adapters/store.ts',
  'engine/src/adapters/fs-control.ts',
  'engine/src/adapters/instance-lock.ts',
  'engine/src/adapters/sibling-commit-scan.ts',
  'engine/src/github-sync.ts',
  // Decides the exact `gh issue create` argv the dashboard executes against
  // the operator's GitHub (contribute-upstream, epic 0006 slice 5) — same
  // plan-the-write-command class as github-sync.ts above.
  'engine/src/github-contribute.ts',
  // Runs real `gh` against the operator's OWN identity to browse AND CLAIM
  // canonical pool issues (epic 0007 slice 6) — an issue assignment is a
  // write on someone else's repo under our login, so widening what it can
  // claim is a permission change: security-hard review always.
  'flight/pool-client-execute.ts',
  // Decides the fork/push/`gh pr create` argv sequence the dashboard's
  // github/pr-execute.ts runs against the operator's GitHub — the wired
  // PR-leg of contribute-upstream, same plan-the-write-command class.
  'engine/src/github-pr-contribute.ts',
  // The dashboard-side EXECUTE layer for the three planners above: the
  // wiring that actually spawns `gh repo create --push` / `git push`
  // (execute.ts), `gh issue create` (issue-execute.ts), and fork + push +
  // `gh pr create` (pr-execute.ts) against the operator's GitHub — the
  // same run-the-planned-write class flight/control-execute above is
  // flagged for, with no security keyword in any of its paths. The `src/`
  // prefix keeps `.github/` issue templates and `test/github/` fixtures
  // unflagged; directory-prefixed so a future execute file here can never
  // slip past unmarked.
  'src/github/',
  'engine/src/otlp.ts',
  // Decides the Ask escalation tier's TOOL JAIL (allowed/disallowed lists
  // for a real CLI invocation) — a widened grant here is a containment
  // change, so it always gets the security-hard review path.
  'engine/src/ask-escalation.ts',
  // Tracks child pids on disk and (via sweepStale) KILLS processes whose
  // owning flight died — a process-termination decision surface; widening
  // WHAT it kills is a host-safety change, so security-hard review always.
  'engine/src/adapters/cli-pid-registry.ts',
  // Reads the OPERATOR'S PRIVATE session transcripts (~/.claude-style
  // trees; prompt content lives in those files) — read-only today, but any
  // change to WHAT it reads or WHERE the aggregate flows is a privacy
  // change, so it always gets the security-hard review path.
  'engine/src/adapters/usage-pool-scan.ts',
  // The package-manager supply-chain surface. CI checks out and runs the
  // PR'S OWN code, so a PR that quietly rewrote a gate script (e.g. "test":
  // "echo ok") in ANY workspace package.json would pass its own green gate
  // trivially — the gate it neutered is the gate that judged it. Bare
  // substring on purpose: every package.json in the workspace declares
  // dependencies installed on every machine AND scripts the gate executes.
  'package.json',
  // Pins the exact tarball URLs + integrity hashes `pnpm install` trusts —
  // a lockfile-only PR swapping a resolution is a classic supply-chain
  // vector with no security-keyword in its path.
  'pnpm-lock.yaml',
  // Defines the workspace AND `onlyBuiltDependencies` — the allow-list that
  // decides which packages get to run install scripts at all; one added
  // line enables a dependency's postinstall on every contributor machine.
  'pnpm-workspace.yaml',
  // Registry/auth config for the package manager — retargeting the registry
  // or loosening install policy redirects what the workspace installs.
  '.npmrc',
  // Git hooks that execute as shell on the maintainer's machine on every
  // local commit — anchored with the trailing slash like 'landing/' so only
  // the hook directory's own files flag.
  '.husky/',
  // The config that mints automated dependency PRs. A quiet edit could set
  // `insecure-external-code-execution: allow` (update jobs run external code
  // with registry credentials), retarget a `registries` entry, or redirect
  // `target-branch` away from protected main — the same supply-chain class
  // as the package-manager manifests above, sitting outside the
  // '.github/workflows' marker with no security keyword in its path.
  // Directory-anchored because GitHub only reads this config at
  // `.github/dependabot.yml`/`.yaml` — both spellings match, and a doc
  // merely named after the bot never does.
  '.github/dependabot',
  // The operator-executed launcher scripts — root SETUP/START/STOP/RESTART/
  // STATUS/WATCH-DASHBOARD.cmd/.sh plus scripts/launchers/ — are shell the
  // operator runs by double-click, so a PR editing one injects commands
  // straight onto the operator's machine: the same
  // execute-on-the-maintainer-box class as the .husky/ hooks above, with no
  // security keyword in any of their paths. Extension-anchored
  // ('-dashboard.cmd', never a bare 'dashboard') so apps/dashboard/**
  // source and dashboard-named docs stay judged by their own per-file
  // markers; 'setup.sh'/'setup.cmd' cover the two launchers the hyphen
  // anchor misses (scripts/setup.mjs, a gate-run dependency of no shell
  // class, deliberately stays unflagged — different extension).
  'setup.sh',
  'setup.cmd',
  '-dashboard.sh',
  '-dashboard.cmd',
  // The Node runtime pin CI installs the gate's entire toolchain from
  // (ci.yml: `node-version-file: .nvmrc`, three jobs) — a quiet downgrade
  // re-runs every gate under an older runtime with its old bugs and CVEs:
  // the same the-gate-reads-its-own-config class as the tsconfig/vitest
  // markers below, one layer beneath them.
  '.nvmrc',
  // The CI enforcement scripts themselves. ci.yml runs `scripts/ci/*.mjs`
  // (secret-scan, no-personal-paths, validate-configs, SPDX, bundle-size)
  // from the PR's OWN checkout, so a PR that neutered secret-scan.mjs to
  // always exit 0 would pass the very check it disabled — the package.json
  // marker above only catches rewiring the script LINE ("ci:secret-scan":
  // ...), not the script FILE it points at. Trailing slash on purpose: the
  // doc-freshness --check scripts in scripts/architecture, scripts/citation,
  // and scripts/data-model stay unflagged — neutering a drift check lets
  // stale docs merge, a quality concern, not an enforcement bypass.
  'scripts/ci/',
  // The operator-run `gh` write scripts (`pnpm run gh:sync-labels` /
  // `gh:setup-branch-protection` / `gh:verify-branch-protection`): every
  // file here runs real `gh` against the operator's repo, and
  // `sync-labels.mjs` applies `.github/labels.json` to the LIVE repo via
  // `gh label create --force` — a PR that taught it to rename or delete a
  // hold label (`do-not-merge`, `hold`, `blocked`) would strip that label
  // from every open PR the next time the operator syncs, silently disarming
  // the HOLD_LABEL_MARKERS guard this very ritual honors, with no security
  // keyword in its path (its two branch-protection siblings already match
  // the 'branch-protection' marker; this closes the gap for the
  // label-writing one and any future file landing in the directory).
  // Directory-anchored like 'src/github/' above so only these
  // operator-credential `gh` writers flag, not `.github/` configs (own
  // markers above) or `test/github/` fixtures.
  'scripts/github/',
  // ——— The gate's own config files. CI runs typecheck/lint/format/test/build
  // with the PR's OWN checkout of every config those tools read, so a PR that
  // excluded tests in vitest.config.ts, narrowed a tsconfig's include set,
  // widened .prettierignore, or trivialized a Stryker config would pass the
  // very gate it neutered — the same class as the package.json marker above,
  // which only catches rewiring the script LINE ("test": ...), not the config
  // FILE the tool then reads. Bare 'tsconfig' on purpose: all 21 tsconfig*
  // files in the workspace configure the typecheck or build gate and nothing
  // else matches the substring. The rest are exact filename fragments —
  // 'vitest.setup' flags too because the setup file runs arbitrary code
  // inside every gate test run. '.prettierrc' has no file today; the marker
  // pre-closes the hole a future one would open, since prettier picks it up
  // automatically. 'config/mutation/' covers the ~100 Stryker configs
  // mutation.yml runs nightly — a trivialized config would pass its own
  // sweep undetected. config/quarantine/ stays unflagged deliberately:
  // vitest never reads it, only the already-flagged scripts/ci reporting
  // tools do.
  'tsconfig',
  'vitest.config',
  'vitest.setup',
  'eslint.config',
  '.prettierignore',
  '.prettierrc',
  'commitlint.config',
  'playwright.config',
  'config/mutation/',
  // The folder-lock ritual (MASTER-PLAN §7): the ONE function the engine
  // calls before a project's first firing, deciding whether a repo gets
  // baseline-committed, tagged MYTH+LEGACY, and switched onto the flight
  // branch, or (already locked) just resumed onto it. `packages/store/src/
  // snapshot.ts` above is flagged for the analogous backup-ritual class; this
  // is the onboarding-side twin, upstream of it — a PR that swapped the
  // commit/tag/checkout ORDER, or skipped the already-backed-up check and
  // re-ran the baseline, would corrupt the pristine MYTH snapshot every
  // later `assertBackedUp` call trusts, with no "guard"/"auth"/"security"
  // keyword in its path (`backup/guard.ts`, `backup/secret-guard.ts`, and
  // `backup/size-guard.ts` already match the bare 'guard' marker above; this
  // is the one file in the directory that doesn't). Directory-prefixed with
  // the package's `src/` segment, like `store/src/mutate.ts`, so a future
  // `packages/onboarding/test/backup/ritual.test.ts` stays unflagged.
  'onboarding/src/backup/ritual.ts',
  // The real git-write implementation behind the backup ritual's BackupVcs
  // port: commitAll decides the secret-scan-then-huge-file-scan-then-`git add
  // -A` sequence before every baseline commit, and
  // initRepo/createTag/createBranch/checkoutBranch are the actual
  // init/tag/branch/checkout writes backup/ritual.ts's lockRepo orchestrates
  // — the same real-git-write class engine/src/adapters/git.ts already
  // earned its marker for. No "guard"/"auth"/"security"-style keyword in its
  // path. Directory-prefixed with the package's src/ segment, like
  // store/src/mutate.ts, so a future
  // packages/onboarding/test/adapters/git-backup.test.ts stays unflagged.
  'onboarding/src/adapters/git-backup.ts',
  // The direct SQLite writer behind project registration and board seeding:
  // register INSERTs the projects row a repo is onboarded under, recordBackup
  // INSERTs the versions rows every later backup-ref lookup trusts, and
  // seedBoard INSERTs the initial tasks rows straight into the board with NO
  // approval gate — the same direct-write class store/src/mutate.ts already
  // earned its marker for, just scoped to onboarding's own two tables. No
  // security keyword in its path.
  'onboarding/src/adapters/sqlite-project-store.ts',
  // detectGate ranks every ecosystem detector's evidence and returns the
  // primary GateSpec that "drives the engine GatePort" (its own doc
  // comment) — the SAME decide-power class apps/dashboard/src/
  // gate-commands.ts already earns its marker for, just at onboarding time
  // instead of every live flight: a PR that quietly dropped a kind from a
  // detector's evidence, or weakened the ranking so a weaker ecosystem
  // match won ties, would silently narrow a NEW project's gate from the
  // moment it is onboarded, with no "guard"/"auth"/"security" keyword in
  // its path. Directory-prefixed with the package's src/ segment, like
  // onboarding/src/adapters/git-backup.ts, so
  // packages/onboarding/test/gate/detect.test.ts stays unflagged.
  'onboarding/src/gate/detect.ts',
  // The argv builders (scriptCommand/execCommand/directCommand) every
  // detector in gate/detectors/ calls to turn a detected script/tool into
  // the actual GateCommand, plus packageScripts/tomlHasSection, which
  // decide what counts as evidence a script or tool config exists in the
  // first place — the same upstream-of-a-flagged-surface reasoning
  // gate-commands.ts and gate/detect.ts above already earn markers for. A
  // PR that quietly built a no-op command, or made packageScripts drop a
  // real script, would silently produce a broken or narrower gate for
  // every ecosystem detector at once. No security keyword in its path.
  'onboarding/src/gate/manifests.ts',
  // Each of gate/detectors/{js,python,go,rust}.ts independently decides the
  // actual gate a brand-new project runs from its first firing on for that
  // ecosystem — which typecheck/test/build/lint command wins for it, and
  // with what argv — the same decide-power class gate/detect.ts (which
  // ranks across all four) and gate/manifests.ts (whose argv builders every
  // one of them calls) already earn markers for. A PR that quietly dropped
  // a fallback (e.g. jsDetector's eslint.config check) or misordered a
  // precedence (e.g. pythonDetector's ruff-before-flake8) would silently
  // narrow or misconfigure that ecosystem's onboarding gate. No "guard"/
  // "auth"/"security" keyword in any of their paths. Directory-prefixed
  // with the package's src/ segment, like onboarding/src/gate/detect.ts, so
  // a future packages/onboarding/test/gate/detectors/js.test.ts stays
  // unflagged.
  'onboarding/src/gate/detectors/js.ts',
  'onboarding/src/gate/detectors/python.ts',
  'onboarding/src/gate/detectors/go.ts',
  'onboarding/src/gate/detectors/rust.ts',
  // The onboarding ritual's own orchestrator: locks/backs up the target FIRST
  // (MASTER-PLAN §7's load-bearing order), then registers a NEW project (or
  // resumes a seen one), seeds its starter board, and records the backup
  // refs — the actual `deps.projects.register`/`seedBoard`/`recordBackup`
  // writes every already-flagged `onboarding/src/adapters/
  // sqlite-project-store.ts` INSERT exists to serve. A PR that quietly
  // reordered the backup-first sequence, or dropped the resumed-project
  // branch so a re-onboard re-registered (and re-seeded) an existing
  // project, would corrupt the pristine MYTH snapshot every later
  // `assertBackedUp` call trusts, or duplicate a project's board — with no
  // "guard"/"auth"/"security" keyword in its path. Directory-prefixed with
  // the package's src/ segment, like `onboarding/src/gate/detect.ts`, so a
  // future `packages/onboarding/test/onboard/onboard.test.ts` stays
  // unflagged.
  'onboarding/src/onboard/onboard.ts',
  // Generates the starter SOUL text `onboard.ts` writes verbatim into a
  // brand-new project's record with no further review step — the actual
  // "Gate every change" / "Additive git only: never force-push" / "Verify
  // machine-checkable work autonomously" governance every onboarded
  // project's own autopilot flight reads as its operating rules, the same
  // doctrine-content class `onboarding/src/gate/manifests.ts`'s argv
  // builders already earn a marker for despite never writing anything
  // themselves. A PR that quietly softened or dropped one of those lines
  // would silently weaken every future project's baked-in safety doctrine
  // from the moment it is onboarded, with no "guard"/"auth"/"security"
  // keyword in its path — `soul.test.ts`'s line-budget guard catches
  // wholesale bloat, not a same-length wording change. Directory-prefixed
  // with the package's src/ segment, like `onboarding/src/onboard/
  // onboard.ts` above.
  'onboarding/src/onboard/soul.ts',
] as const;

export function touchesSecuritySensitivePath(paths: readonly string[]): boolean {
  return paths.some((path) => {
    const lower = path.toLowerCase();
    return SECURITY_SENSITIVE_PATH_MARKERS.some((marker) => lower.includes(marker));
  });
}

/**
 * Which policy-green PRs the ritual may plan a merge for — epic 0007's
 * "policy is operator-configurable (which classes may auto-merge; defaults
 * conservative)". 'green' (the default) is the shipped behavior: a PR that
 * clears every check merges. 'off' plans queue-for-human instead — the
 * ritual still reviews and reasons, but every merge stays a human act.
 * Deliberately narrowing-only: the security-hard rule is not a policy (it
 * applies identically in every mode) and no value widens what may
 * auto-merge past policy-green.
 */
export type PrReviewAutoMergePolicy = 'green' | 'off';

/**
 * Reads the operator's auto-merge policy from `AUTOPILOT_PR_AUTOMERGE` —
 * only the explicit value `off` (case-insensitive, whitespace-tolerant)
 * disables merge planning; unset or any other value stays 'green', so a
 * typo can only fail toward the existing default, never toward a surprise
 * merge class. An env-var lever with no source edit, the same shape as the
 * model-routing levers (RUNBOOK §6/§8).
 */
export function resolvePrReviewAutoMergePolicy(
  env: Record<string, string | undefined> = process.env,
): PrReviewAutoMergePolicy {
  return env['AUTOPILOT_PR_AUTOMERGE']?.trim().toLowerCase() === 'off' ? 'off' : 'green';
}

/**
 * The most changed lines (additions + deletions, gh-reported totals) an
 * auto-merge may cover. An approve + squash-merge implicitly claims the diff
 * was byte-reviewed and genuinely improves the tree — above this scale that
 * claim is not honest for an automated pass, so the PR queues for
 * MASTERMIND's human eyes instead (epic 0007's "defaults conservative").
 * Deliberately checked LAST, right before the merge itself: gate, conflict,
 * empty-diff, and reverse-apply verdicts are objective facts that stay
 * honest at any size, so an oversized PR still receives those when they
 * apply — size only stops the ritual from ASSERTING a review it cannot
 * honestly perform. 1000 mirrors the repo's own review discipline (one
 * small, focused unit per PR); strictly-greater-than, so a PR exactly at
 * the cap still merges. An UNASSESSED size (`additions`/`deletions` absent
 * from gh's report) queues for a human too — the merge asserts a size claim,
 * so the size must be confirmed, never assumed to be 0. A GARBAGE size
 * (negative or fractional) counts as unassessed for the same reason: a
 * negative count summed into the changed-line total UNDERCOUNTS it, the one
 * way bad gh output could still slip an oversized diff under the cap after
 * the absent-size half of that hole was closed.
 */
export const MAX_AUTO_MERGE_CHANGED_LINES = 1000;

/**
 * True only for a gh-reported count — changed lines or changed files — that
 * can honestly back a claim: a confirmed count is a non-negative integer, so
 * anything else (absent, negative, fractional, `NaN`, non-numeric) is NOT
 * confirmed. Shared by {@link fetchOpenPrCandidates}'s parsing (garbage
 * stays absent), {@link planPrReview}'s merge tier, and {@link
 * prTouchedPathsTruncated} (re-checked at those layers so a
 * directly-constructed candidate cannot slip them either — the same
 * enforced-at-both-layers stance as the unpinned-merge throw in {@link
 * planPrReviewCommands}). Takes `unknown` so it can judge raw `gh` JSON
 * directly.
 */
function isConfirmedCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * gh's own enumeration cap on `gh pr list --json files` — the list never
 * carries more than 100 entries no matter how many files a PR touches. Not
 * a policy choice of this ritual's (unlike {@link MAX_AUTO_MERGE_CHANGED_LINES});
 * it exists as a named constant so {@link prTouchedPathsTruncated} can
 * recognize a list sitting AT the cap as possibly truncated.
 */
export const MAX_PR_LIST_FILES = 100;

/**
 * True when gh's reported changed-file total exceeds the paths it actually
 * enumerated — `gh pr list --json files` caps the list at {@link
 * MAX_PR_LIST_FILES} entries, so a wide PR's tail paths are invisible to
 * {@link touchesSecuritySensitivePath}. A PR could hide a security-sensitive
 * file at position 101+ while staying under {@link
 * MAX_AUTO_MERGE_CHANGED_LINES} (101 one-line files), so a truncated list
 * always queues for a human in {@link planPrReview}: an incomplete security
 * sweep must fail closed, never toward a merge. An UNCONFIRMED total
 * (absent, negative, fractional, `NaN` — the same confirmed-or-nothing
 * predicate the size guard uses) disables the comparison only while the
 * enumerated list sits UNDER the cap, where gh cannot have truncated it; a
 * list AT the cap with no confirmed total counts as truncated, because
 * treating it as complete was the residual place garbage gh output widened
 * toward a merge (the same class the confirmed-size tightening closed for
 * `additions`/`deletions`).
 */
export function prTouchedPathsTruncated(pr: PrReviewCandidate): boolean {
  if (isConfirmedCount(pr.changedFiles)) {
    return pr.changedFiles > pr.touchedPaths.length;
  }
  return pr.touchedPaths.length >= MAX_PR_LIST_FILES;
}

/**
 * The one branch this ritual may auto-merge INTO — epic 0007's first
 * governance invariant, "one canonical main" (`main` + tags + Releases are
 * the only version of record). A squash-merge into any other branch is a
 * write the KEEPER has no mandate for, so it is never automated. `main`
 * matches the repo's actual default branch; a future non-`main` canonical
 * repo would change this one constant.
 */
export const CANONICAL_BASE_BRANCH = 'main';

/**
 * True only when the PR's gh-reported base branch is CONFIRMED to be the
 * canonical {@link CANONICAL_BASE_BRANCH}. An absent base fails closed
 * (returns false → queues for a human in {@link planPrReview}), the same
 * confirmed-or-queue stance the {@link PrReviewCandidate.headRefOid} pin
 * takes: merging into the wrong branch is a mis-action no green gate excuses,
 * so the merge path requires a positive verdict, never the absence of a
 * negative one. Can only narrow what auto-merges, never widen it.
 */
export function prTargetsCanonicalBase(pr: PrReviewCandidate): boolean {
  return pr.baseRefName === CANONICAL_BASE_BRANCH;
}

/**
 * Human-applied labels that explicitly say "do not auto-merge this yet". A
 * label is a gh-reported fact (`gh pr list --json labels`), not the PR's own
 * description, so honoring one keeps the never-trust-the-text rule — and a
 * maintainer applying `do-not-merge`/`hold`/`blocked`/`wip` is the same
 * explicit not-ready signal a draft carries, which {@link
 * fetchOpenPrCandidates} already excludes from the sweep. Respecting hold
 * labels is the near-universal convention of the auto-merge ecosystem
 * (mergify, GitHub's own merge queue, palantir/bulldozer), and it matters
 * most for the contributor pool (epic 0007 slices 6-7): a co-pilot's
 * policy-green PR that MASTERMIND has flagged to hold must not squash-merge
 * out from under that flag. Matched at hyphen-token boundaries by {@link
 * prHasHoldLabel} — never a bare substring — so `work-in-progress` matches
 * `wip`? no; `threshold` never matches `hold`. Narrowing-only: a hold label
 * can only move a decision toward queue-for-human, never toward a merge.
 */
export const HOLD_LABEL_MARKERS: readonly string[] = [
  'do-not-merge',
  'hold',
  'blocked',
  'wip',
  'work-in-progress',
];

/** Normalizes a raw label name to a hyphen-delimited token string:
 *  lowercased, every run of non-alphanumeric characters folded to a single
 *  hyphen, leading/trailing hyphens trimmed. "Status: Do Not Merge",
 *  "do_not_merge", and "do-not-merge" all normalize to the same token
 *  sequence, so one marker matches every spelling a repo might use. */
function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * True when the PR carries any {@link HOLD_LABEL_MARKERS} label — a human's
 * explicit "hold". Matching is at hyphen-token boundaries, never a bare
 * substring: a marker matches only when it is the whole normalized label, a
 * leading token run (`blocked-by-ci`), a trailing token run
 * (`status-do-not-merge`), or an interior token run — so `threshold` never
 * trips `hold` and `swipe` never trips `wip`. An absent/empty label list is
 * no hold. Like {@link prTargetsCanonicalBase}, this only narrows what
 * auto-merges — it can never carry a PR toward a merge.
 */
export function prHasHoldLabel(pr: PrReviewCandidate): boolean {
  return (pr.labels ?? []).some((label) => {
    const norm = normalizeLabel(label);
    return HOLD_LABEL_MARKERS.some(
      (marker) =>
        norm === marker ||
        norm.startsWith(`${marker}-`) ||
        norm.endsWith(`-${marker}`) ||
        norm.includes(`-${marker}-`),
    );
  });
}

export interface PrReviewMerge {
  readonly decision: 'merge';
  readonly reasoning: string;
}

export interface PrReviewRequestChanges {
  readonly decision: 'request-changes';
  readonly reasoning: string;
}

export interface PrReviewQueueForHuman {
  readonly decision: 'queue-for-human';
  readonly reasoning: string;
}

export type PrReviewDecision = PrReviewMerge | PrReviewRequestChanges | PrReviewQueueForHuman;

/**
 * Decides what a KEEPER review pass should do with one open PR, judged
 * purely on gh-reported facts (gate status, conflict state, touched paths) —
 * never the PR's own description. Security-sensitive paths are checked
 * FIRST and unconditionally: `touchesSecuritySensitivePath` queues for a
 * human regardless of gate/conflict state, matching the standing rule's
 * "always" (a red gate on a security-touching PR is still a human's call,
 * not an automated request-changes). A PR touching zero files requests
 * changes next — the cheapest "does it genuinely improve" verdict: an
 * empty diff merges nothing, so no gate result can justify merging it.
 * A viewer-authored PR queues for a human next — GitHub refuses
 * self-approval and self-request-changes outright (HTTP 422), so no review
 * verdict this ritual plans could even be posted on it, and a self-review
 * would be no review anyway; the check precedes every
 * request-changes-producing branch below because only the plain comment a
 * queue-for-human plans is postable on an own PR.
 * A diff carrying binary content queues for a human next — byte-review
 * cannot read a binary payload, so neither a merge NOR a request-changes
 * review is a verdict the ritual can honestly post on it.
 * A failing or still-running gate
 * requests changes next — the gate is the one thing an agent's judgment
 * never substitutes for (epic 0007's governance invariant). Merge conflicts
 * request changes too — nothing in this ritual resolves them. A PR carrying a
 * human-applied hold label ({@link prHasHoldLabel}: `do-not-merge`, `hold`,
 * `blocked`, `wip`, `work-in-progress`) queues for a human — a maintainer's
 * explicit not-ready signal, honored in the merge tier (after the
 * gate/conflict verdicts, so a held PR with a red gate still gets that honest
 * feedback), leading the tier because a human's hold outranks a wrong base or
 * an oversized diff. A PR under a standing changes-requested review from a
 * reviewer OTHER than this ritual ({@link PrReviewCandidate.reviewChangesRequested})
 * queues for a human right after the hold label — an explicit human "not yet"
 * the ritual must not squash-merge out from under; its own request-changes
 * reviews are excluded at fetch time, so a green PR it once flagged is not
 * stalled by its own stale review. A PR that
 * merges into any branch but the canonical {@link CANONICAL_BASE_BRANCH}
 * queues for a human (epic 0007's first invariant, "one canonical main") —
 * checked in the merge tier, after the gate/conflict verdicts, since a
 * non-main PR with a red gate still deserves that honest feedback; the base
 * guard only stops the automated MERGE, and like the head-SHA pin it needs
 * the base CONFIRMED, so an absent base fails closed toward a human. A PR
 * with GitHub's own auto-merge armed ({@link
 * PrReviewCandidate.autoMergeArmed}) queues for a human in the merge tier
 * too — the ritual's approve would itself trigger GitHub's merge with
 * whatever method and head the arming chose, before the pinned
 * `--match-head-commit` squash could run, so no approve may be posted on
 * it at all. Only a
 * PR that clears every objective check — gate green, no conflicts, no
 * security-sensitive path, targeting main — is policy-green and gets merged.
 */
export function planPrReview(
  pr: PrReviewCandidate,
  policy: PrReviewAutoMergePolicy = 'green',
): PrReviewDecision {
  return decidePrReview(
    {
      ...pr,
      title: neutralizeAtMentions(pr.title),
      // Conditional spreads, not `?.map` values: with
      // exactOptionalPropertyTypes an explicit `undefined` is not
      // assignable to these optional fields — omit them instead.
      ...(pr.conflictingPaths !== undefined
        ? { conflictingPaths: pr.conflictingPaths.map(neutralizeAtMentions) }
        : {}),
      ...(pr.renamedFromPaths !== undefined
        ? { renamedFromPaths: pr.renamedFromPaths.map(neutralizeAtMentions) }
        : {}),
      ...(pr.baseRefName !== undefined
        ? { baseRefName: neutralizeAtMentions(pr.baseRefName) }
        : {}),
    },
    policy,
  );
}

/**
 * GitHub linkifies `@name` anywhere in a posted comment or review body, and
 * every reasoning string below is posted verbatim under the founder's own gh
 * login — so contributor-controlled text embedded in it (the PR title, a
 * conflict path, a renamed-from path, the non-canonical base branch it
 * targets: an attacker names files and branches too) would let a hostile PR
 * titled "fix typo @acme/everyone" make this ritual ping arbitrary users or
 * teams AS MASTERMIND the moment any verdict posts. A zero-width space after
 * the `@` stops the linkification while leaving the text visually identical
 * — the established auto-responder convention. Only an `@` that could start
 * a mention (followed by an alphanumeric) is touched, so a bare `@` stays
 * byte-identical and the lookahead makes the rewrite idempotent (an
 * already-neutralized `@` is followed by the zero-width space, not an
 * alphanumeric). Text-only and decision-blind: {@link planPrReview}
 * neutralizes the INPUT COPY {@link decidePrReview} judges, and inserting
 * after `@` can never split (or mint) a {@link SECURITY_SENSITIVE_PATH_MARKERS}
 * match since no marker contains `@`, nor can it turn a non-canonical base
 * into {@link CANONICAL_BASE_BRANCH} since that name contains no `@` either
 * — so no verdict can change, only what gets posted. Re-run dedup stays
 * intact because both sides of every comparison are neutralized: fresh
 * reasoning here, and `ownComments`/`ownRequestChangesBody` because the
 * ritual only ever POSTED neutralized text.
 */
function neutralizeAtMentions(text: string): string {
  return text.replace(/@(?=[a-z0-9])/gi, '@​');
}

/** {@link planPrReview}'s decision core, judging the mention-neutralized
 *  copy — split out so the neutralization has ONE choke point ahead of every
 *  reasoning template below instead of a per-branch call nobody can audit. */
function decidePrReview(pr: PrReviewCandidate, policy: PrReviewAutoMergePolicy): PrReviewDecision {
  if (touchesSecuritySensitivePath(pr.touchedPaths)) {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" touches a guard/containment/auth/CSP path — ` +
        'security-hard rule: this never auto-merges and always queues for ' +
        "MASTERMIND's human eyes, regardless of gate result.",
    };
  }

  // The enumerated files list is the security sweep's ENTIRE evidence — when
  // gh never reported a usable one, the sweep above checked nothing (or a
  // partial list with entries silently dropped), and an empty enumeration
  // must not fall through to the empty-diff verdict below as if a zero-file
  // diff were confirmed. Same fail-closed class as the truncation guard.
  if (pr.touchedPathsUnassessed) {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" — gh did not report a usable files list ` +
        '(non-array, or entries without a path), so the security-hard path sweep had ' +
        'nothing complete to check and the enumeration cannot be told apart from a ' +
        "genuinely empty diff. Queued for MASTERMIND's human eyes regardless of gate " +
        'result.',
    };
  }

  // The rename half of the same security-hard rule: gh's files list reports
  // only a rename's NEW name, so a move OUT of a guarded path surfaces only
  // here, via the diff-parsed `rename from` headers. Checked immediately
  // after the path sweep (and before every other verdict) because it IS that
  // sweep, completed — a guarded file's relocation gets no automated verdict
  // any more than an in-place edit to it would.
  const guardedRenameSources = (pr.renamedFromPaths ?? []).filter((path) =>
    touchesSecuritySensitivePath([path]),
  );
  if (guardedRenameSources.length > 0) {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" renames file(s) out of a guard/containment/auth/CSP ` +
        `path (${guardedRenameSources.join(', ')}) — gh's files list reports only a ` +
        "rename's NEW name, so the path sweep alone would miss the move. Security-hard " +
        "rule: this never auto-merges and always queues for MASTERMIND's human eyes, " +
        'regardless of gate result.',
    };
  }

  if (prTouchedPathsTruncated(pr)) {
    const evidence = isConfirmedCount(pr.changedFiles)
      ? `reports ${pr.changedFiles} changed files but gh enumerated only ` +
        `${pr.touchedPaths.length} path(s) — a truncated files list ` +
        `(gh pr list caps it at ${MAX_PR_LIST_FILES} entries)`
      : `has ${pr.touchedPaths.length} enumerated path(s) — at the ` +
        `${MAX_PR_LIST_FILES}-entry cap gh truncates the files list to — with no ` +
        'usable changed-file total to confirm the list is complete, so it may be truncated';
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" ${evidence}, so the security-hard path sweep cannot ` +
        'honestly claim to have checked every touched path. Queued for ' +
        "MASTERMIND's human eyes regardless of gate result.",
    };
  }

  // Checked before every request-changes-producing branch below: those plan
  // `gh pr review` calls GitHub refuses on a viewer-authored PR (HTTP 422),
  // so their verdicts could never land — only the plain comment a
  // queue-for-human plans is postable on an own PR.
  if (pr.viewerIsAuthor) {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" was authored by the same GitHub identity this ` +
        'ritual reviews under — a self-review is no review at all, and GitHub refuses ' +
        'self-approval and self-request-changes outright (HTTP 422), so no automated ' +
        "review verdict could even be posted on it. Queued for MASTERMIND's human " +
        'eyes; a plain comment (which own PRs do allow) carries this reasoning.',
    };
  }

  if (pr.touchedPaths.length === 0) {
    return {
      decision: 'request-changes',
      reasoning:
        `#${pr.number} "${pr.title}" touches no files — an empty diff merges nothing ` +
        'and cannot genuinely improve the tree, so a green gate alone does not carry ' +
        'it to a merge. Push the intended change, or close if it was opened by mistake.',
    };
  }

  if (pr.hasBinaryDiff) {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" — its diff carries binary content ("Binary files ` +
        '... differ" / "GIT binary patch"), which byte-review cannot read: no automated ' +
        'verdict — merge or request-changes — is trustworthy on unreviewable bytes, so ' +
        "it queues for MASTERMIND's human eyes regardless of gate result.",
    };
  }

  if (pr.alreadyApplied) {
    return {
      decision: 'request-changes',
      reasoning:
        `#${pr.number} "${pr.title}" — its changes are already present in the current ` +
        'tree (the diff reverse-applies cleanly), so merging adds nothing: likely ' +
        'already fixed elsewhere. Rebase against the base branch or close.',
    };
  }

  // No gating check reported at all is no verdict — not a failed gate and not
  // a running one. Posting "the gate is still running" here asserted a run
  // nobody observed (on this repo CI triggers only for PRs into main, so a
  // PR against any other base carried that false claim forever), and a
  // request-changes hands the author something they cannot fix: approving a
  // fork's first workflow run, or judging a head CI will never gate, is the
  // maintainer's call. Same tier as the gate verdict below (ahead of the
  // conflict verdict, exactly where a pending gate sits) so the ordering
  // stays one shape; narrowing-only, since neither kind merges.
  if (pr.gateStatus === 'unreported') {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" — no gating check has reported on its head, so there ` +
        'is no gate verdict to judge. Nothing may be running at all: the CI workflow may ' +
        "not trigger for this PR (a base branch outside its trigger filter, or a fork's " +
        'first run awaiting a maintainer\'s approval), or only "(optional)" checks ' +
        "reported, which never gate. That is the maintainer's to settle, not the author's, " +
        "so it queues for MASTERMIND's human eyes; the next pass re-judges it once a " +
        'gating check reports.',
    };
  }

  if (pr.gateStatus !== 'pass') {
    const state = pr.gateStatus === 'fail' ? 'failed' : 'is still running';
    return {
      decision: 'request-changes',
      reasoning: `#${pr.number} "${pr.title}" — the gate ${state}; an agent's judgment never substitutes for it.`,
    };
  }

  if (!pr.mergeable) {
    // An uncomputed state fails closed like a conflict, but the posted
    // reason must not claim a conflict nobody verified — the same
    // honest-reason stance the gate rollup's terminal-state fix set.
    if (pr.mergeStateUnknown) {
      return {
        decision: 'request-changes',
        reasoning:
          `#${pr.number} "${pr.title}" — GitHub has not finished computing whether it ` +
          'merges cleanly against the base branch (merge state UNKNOWN); an unclear ' +
          'merge state is not a green light. Nothing to fix yet — the next review pass ' +
          'picks it up once GitHub has computed the state.',
      };
    }
    if (pr.conflictingPaths && pr.conflictingPaths.length > 0) {
      return {
        decision: 'request-changes',
        reasoning:
          `#${pr.number} "${pr.title}" has merge conflicts against the base branch in: ` +
          `${pr.conflictingPaths.join(', ')} — resolve there first.`,
      };
    }
    return {
      decision: 'request-changes',
      reasoning: `#${pr.number} "${pr.title}" has merge conflicts against the base branch that need resolving first.`,
    };
  }

  // Reached only with a green gate and no conflict (both outrank it above):
  // a BEHIND branch means that green gate was computed against a base that
  // has since moved on, and the strict-up-to-date branch protection would
  // refuse the planned merge AFTER the approve already posted — a dangling
  // approval remediateDanglingApproval would then have to mop up. Saying so
  // up front is the honest verdict; updating the branch re-runs CI against
  // the current base and the next pass re-judges fresh.
  if (pr.behindBase) {
    return {
      decision: 'request-changes',
      reasoning:
        `#${pr.number} "${pr.title}" — its branch is behind the base branch, so its ` +
        'green gate was computed against a base that has since moved on, and branch ' +
        'protection (strict up-to-date checks) would refuse the merge anyway. Update ' +
        'the branch (merge the base in, rebase, or the "Update branch" button) so CI ' +
        're-runs against the current base; the next review pass re-judges it fresh.',
    };
  }

  // Merge tier: every objective verdict above has cleared. A human's explicit
  // hold label leads it — a maintainer flagging the PR to hold is the most
  // salient reason to defer, more so than a wrong base or an oversized diff
  // below. Checked here (not above the gate) for the same reason the
  // canonical-base guard is: a held PR with a red gate still deserves that
  // honest, actionable "the gate failed" feedback; the hold guard only stops
  // the automated MERGE of an otherwise policy-green PR.
  if (prHasHoldLabel(pr)) {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" carries a hold label ` +
        `(one of: ${HOLD_LABEL_MARKERS.join(', ')}) — an explicit human signal not to ` +
        'merge it yet, the same not-ready convention the draft exclusion honors. It is ' +
        "otherwise policy-green, so it queues for MASTERMIND's human eyes rather than " +
        'auto-merging; remove the label to let a later pass reconsider it.',
    };
  }

  // The hold guard's unassessed twin: gh's label report was unreadable, so
  // the sweep above judged nothing — a human's standing do-not-merge/hold
  // could be invisible here, and merging would assert a hold sweep this
  // pass never ran (the same garbage-widens-toward-merge residual the
  // unassessed-size guard closed for additions/deletions).
  if (pr.labelsUnassessed) {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" is otherwise policy-green, but gh's label report ` +
        'was unreadable (not a list of named labels), so the hold-label sweep never ran ' +
        "— a human's standing do-not-merge/hold could be invisible here. An unassessed " +
        "fact fails closed toward MASTERMIND's human eyes, never toward a merge; the " +
        'next pass re-judges it once gh reports labels it can read.',
    };
  }

  // A human reviewer's standing changes-requested — an explicit "not yet"
  // even stronger than a hold label, so it sits alongside it at the head of
  // the merge tier (below the gate/conflict verdicts, so a red-gate PR under a
  // changes-requested review still gets that honest feedback). The ritual's
  // OWN request-changes reviews are already excluded at fetch time, so a green
  // PR the KEEPER once flagged is not stalled here by its own stale review.
  if (pr.reviewChangesRequested) {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" carries a standing changes-requested review from a ` +
        'reviewer other than this ritual — an explicit human "not yet" that outranks a ' +
        'green gate the same way a hold label does. It is otherwise policy-green, so it ' +
        "queues for MASTERMIND's human eyes rather than squash-merging out from under that " +
        'review; the reviewer re-approving or dismissing their review lets a later pass ' +
        'reconsider it.',
    };
  }

  // The unattributed twin of the guard above: a standing CHANGES_REQUESTED
  // review exists but the viewer lookup failed, so the ritual's own stale
  // reviews could not be excluded. The honest verdict names what could not
  // be verified instead of either claiming a human's review (unproven) or
  // merging over one (irreversible); a later pass with a working lookup
  // re-judges it fresh.
  if (pr.reviewChangesRequestedUnverified) {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" carries a standing changes-requested review, but the ` +
        'gh viewer lookup failed, so this pass could not check whether that review is a ' +
        'human\'s explicit "not yet" or this ritual\'s own stale one. An unverifiable ' +
        "standing review fails closed toward MASTERMIND's human eyes rather than " +
        'squash-merging over what may be a human\'s standing "no"; the next pass ' +
        're-checks with a fresh lookup.',
    };
  }

  // The review guards' unassessed twin: gh's latest-reviews report was
  // unreadable, so neither changes-requested flag above could even be
  // minted — a human's standing "not yet" could be invisible here, the
  // same never-ran class as the labelsUnassessed guard.
  if (pr.latestReviewsUnassessed) {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" is otherwise policy-green, but gh's latest-reviews ` +
        'report was unreadable (not a list of reviews with readable states), so the ' +
        'standing changes-requested sweep never ran — a human\'s explicit "not yet" ' +
        "could be invisible here. An unassessed fact fails closed toward MASTERMIND's " +
        'human eyes, never toward a merge; the next pass re-judges it once gh reports ' +
        'reviews it can read.',
    };
  }

  if (!prTargetsCanonicalBase(pr)) {
    const base = pr.baseRefName ? `the '${pr.baseRefName}' branch` : 'a branch gh did not report';
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" merges into ${base}, not the canonical ` +
        `'${CANONICAL_BASE_BRANCH}' branch. Epic 0007's first governance invariant is one ` +
        'canonical main — the only version of record — so a squash-merge into any other ' +
        "branch is never automated; it queues for MASTERMIND's human eyes regardless of " +
        'gate result.',
    };
  }

  // The rename half of the security-hard sweep above only ran if a diff was
  // actually fetched and parsed — renamedFromPaths present means assessed
  // (empty = the sweep ran and confirmed no renames). Absent means `gh pr
  // diff` failed, so the one path evasion the enumerated files list cannot
  // expose was never checked: merging would assert a security sweep this
  // pass never completed — the same garbage-widens-toward-merge residual the
  // unassessed-size guard below closes for the byte-review cap. Merge-tier
  // on purpose: request-changes verdicts above assert no sweep, and every
  // deliberate fetch-skip (security-touching, truncated, own, zero-file)
  // already returned before this line.
  if (pr.renamedFromPaths === undefined) {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" is otherwise policy-green, but its diff was never ` +
        'fetched, so the rename half of the security-hard path sweep was never assessed ' +
        "(gh's files list reports only a rename's NEW name; only the diff's " +
        "'rename from' headers expose a move OUT of a guarded path). A merge asserts a complete " +
        "security sweep, so an unassessed rename sweep fails closed toward MASTERMIND's " +
        'human eyes; the next pass re-fetches the diff and re-judges it fresh.',
    };
  }

  // A merge implicitly claims the diff was byte-reviewed within the size cap
  // below — a claim an UNASSESSED size cannot honestly back. Every other
  // merge-tier fact fails closed on garbage gh output (a non-null
  // autoMergeRequest counts as armed, an absent headRefOid/baseRefName
  // queues), but treating an absent size as 0 was the one place garbage
  // WIDENED toward a merge; the size must be confirmed, never assumed. A
  // negative or fractional count is the residual half of that same hole —
  // summed below it UNDERCOUNTS changedLines — so only a non-negative
  // integer counts as confirmed.
  if (!isConfirmedCount(pr.additions) || !isConfirmedCount(pr.deletions)) {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" is otherwise policy-green, but gh did not report ` +
        'a usable changed-line size (additions/deletions absent, negative, or ' +
        'fractional), so this pass cannot verify the ' +
        `diff sits within the ${MAX_AUTO_MERGE_CHANGED_LINES}-line cap an automated ` +
        'byte-review claim is honest at. A merge needs the size confirmed — an ' +
        "unassessed fact fails closed toward MASTERMIND's human eyes, never toward " +
        'a merge.',
    };
  }

  const changedLines = pr.additions + pr.deletions;
  if (changedLines > MAX_AUTO_MERGE_CHANGED_LINES) {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" changes ${changedLines} lines — beyond the ` +
        `${MAX_AUTO_MERGE_CHANGED_LINES}-line cap an automated pass can honestly claim to have ` +
        'byte-reviewed. Every objective check passed (gate green, no conflicts, no ' +
        "security-sensitive paths), so it queues for MASTERMIND's human eyes instead of " +
        'auto-merging.',
    };
  }

  // GitHub's own auto-merge, armed by someone with write access, makes the
  // ritual's approve itself the merge trigger: once the approval satisfies
  // branch protection, GitHub merges with whatever method and head the
  // arming chose — before the pinned --match-head-commit squash planned
  // below ever runs. Posting the approve would reopen the exact
  // reviewed-bytes TOCTOU window the pin exists to shut, so no approve may
  // be posted at all. Checked ahead of the policy lever below: 'off' also
  // queues, but a human merging by hand must know auto-merge is armed.
  if (pr.autoMergeArmed) {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" has GitHub's own auto-merge armed, so an approval ` +
        'from this ritual would itself trigger a merge — with whatever method and head ' +
        'auto-merge was armed for, before the pinned squash this ritual plans could ' +
        'run, bypassing --match-head-commit. It is otherwise policy-green; queued for ' +
        "MASTERMIND's human eyes — disarm auto-merge (or merge it yourself) to settle it.",
    };
  }

  if (!pr.headRefOid) {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" is policy-green, but no reviewed head SHA was ` +
        'captured, so a merge could not be pinned to the exact bytes this review judged ' +
        '(gh pr merge --match-head-commit) — an unpinned merge would let a commit pushed ' +
        "after review slip into the squash unreviewed. Queued for MASTERMIND's human eyes " +
        'instead.',
    };
  }

  // LAST in the merge tier on purpose — the one fact fetched on demand:
  // annotateReviewThreads spends its `gh api graphql` read only for a
  // candidate every guard above already clears (it pre-judges "would this
  // merge with a clean sweep?"), so an earlier guard's verdict never wears
  // a false "could not be read" reason for a read that was deliberately
  // skipped. Ahead of the policy lever below for the same reason the
  // armed-auto-merge guard is: 'off' also queues, but a human merging by
  // hand must know a reviewer's thread is still open.
  if (pr.unresolvedReviewThreads === undefined) {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" is otherwise policy-green, but its review threads ` +
        'could not be read (the gh api graphql reviewThreads read failed, or this PR was ' +
        'missing from it), so this pass cannot confirm every reviewer conversation is ' +
        'resolved — a merge asserts exactly that (branch protection requires conversation ' +
        "resolution), and an unassessed fact fails closed toward MASTERMIND's human eyes, " +
        'never toward a merge; the next pass re-reads them.',
    };
  }

  if (pr.unresolvedReviewThreads > 0) {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" carries ${pr.unresolvedReviewThreads} unresolved review ` +
        "thread(s) — a reviewer's line-level comment the author has not resolved: an " +
        'explicit human "look at this" the ritual must not squash-merge over, and branch ' +
        'protection (required conversation resolution) would refuse the merge anyway, after ' +
        'the approve had already posted. It is otherwise policy-green, so it queues for ' +
        "MASTERMIND's human eyes; resolving the thread(s) lets a later pass reconsider it.",
    };
  }

  if (policy === 'off') {
    return {
      decision: 'queue-for-human',
      reasoning:
        `#${pr.number} "${pr.title}" is policy-green (gate passed, no conflicts, no ` +
        'security-sensitive paths) but auto-merge is disabled by operator policy ' +
        '(AUTOPILOT_PR_AUTOMERGE=off) — queued for a human merge.',
    };
  }

  return {
    decision: 'merge',
    reasoning: policyGreenMergeReasoning(pr),
  };
}

/** The fixed tail of every policy-green approval body this ritual posts —
 *  shared by {@link policyGreenMergeReasoning} (which writes it) and {@link
 *  isRitualPolicyGreenApprovalBody} (which recognizes it later), so the two
 *  can never drift apart: a drift would make a crashed run's dangling
 *  approval undismissable by {@link remediateStalePolicyGreenApprovals}. */
const POLICY_GREEN_APPROVAL_BODY_SUFFIX =
  '" is policy-green — gate passed, no conflicts, no security-sensitive paths touched.';

/** The reasoning a merge decision posts as its approval body — `#N "title"`
 *  plus {@link POLICY_GREEN_APPROVAL_BODY_SUFFIX}. */
function policyGreenMergeReasoning(pr: Pick<PrReviewCandidate, 'number' | 'title'>): string {
  return `#${pr.number} "${pr.title}${POLICY_GREEN_APPROVAL_BODY_SUFFIX}`;
}

/**
 * Recognizes a review body as one of THIS ritual's own policy-green approval
 * bodies for PR `prNumber` — the `#N "` prefix plus the fixed policy-green
 * suffix, with the title left free because a PR's title can be edited after
 * the approve posted (the KEEPER reviews under the founder's own gh identity,
 * so review AUTHOR cannot distinguish the ritual's reviews from MASTERMIND's
 * human ones — the body shape is the only honest discriminator, the same
 * body-exact stance {@link remediateDanglingApproval} takes). Used by {@link
 * remediateStalePolicyGreenApprovals} to decide what it may dismiss;
 * narrowing-only, since a dismissal can only remove a standing approval.
 */
export function isRitualPolicyGreenApprovalBody(body: unknown, prNumber: number): boolean {
  return (
    typeof body === 'string' &&
    body.startsWith(`#${prNumber} "`) &&
    body.endsWith(POLICY_GREEN_APPROVAL_BODY_SUFFIX)
  );
}

/** One planned `gh` call to apply a review decision — the exact argv a
 *  caller should hand to `execFile`, never a shell string, same convention
 *  as `issue-triage.ts`'s `IssueTriageCommand`. */
export interface PrReviewCommand {
  readonly command: 'gh';
  readonly args: readonly string[];
  readonly details: string;
}

/**
 * Turns a {@link planPrReview} decision into the `gh` command(s) needed to
 * apply it: a merge decision approves with the reasoning as the review body
 * and then merges (squash, pinned to the reviewed head SHA via
 * `--match-head-commit`); a request-changes decision posts only the review;
 * a queue-for-human decision never touches the PR's review state at all — a
 * plain comment surfaces the reasoning without implying an agent's approval
 * or rejection, since a human owns that call. A merge decision for a
 * candidate with no `headRefOid` THROWS instead of planning an unpinned
 * merge: {@link planPrReview} queues pin-less candidates for a human, so
 * that pairing can only come from a buggy or bypassing caller — the command
 * layer fails closed on it rather than trusting every future caller to
 * uphold the invariant (the same never-an-unpinned-merge stance, enforced
 * at both layers). Pure: plans argv, never invokes `gh` itself.
 *
 * Deliberately NEVER passes `--delete-branch` (KEEPER 4/7): that flag writes
 * to the LOCAL checkout `gh` runs from, not just the remote — it checks out
 * the base branch and force-deletes a same-named local branch when one
 * exists, regardless of whether this ritual's own process is on it. The
 * canonical checkout the dashboard runs from sits on a flight branch (docs/
 * epics/0007), so a coincidentally-matching local branch could have its
 * working tree switched and the branch destroyed as an unannounced side
 * effect of a GitHub-only review action. This ritual's mandate is to
 * review/approve/merge PRs on GitHub, never to mutate whatever local git
 * state happens to sit on disk where `gh` executes — remote branch cleanup
 * is a nice-to-have not worth that risk, so the merge narrows to exactly
 * "squash-merge the reviewed commit" and leaves the remote branch for a
 * human (or a future remote-only cleanup step) to remove.
 */
export function planPrReviewCommands(
  pr: PrReviewCandidate,
  decision: PrReviewDecision,
): readonly PrReviewCommand[] {
  const prRef = String(pr.number);

  if (decision.decision === 'queue-for-human') {
    // Re-run idempotency (the same doctrine issue-triage's re-runs follow):
    // the ritual runs pass after pass while a queued PR waits on MASTERMIND,
    // and the identical verdict comment must not be re-posted each pass. The
    // reasoning embeds the PR's number/title and the specific verdict, so any
    // changed fact produces different text and posts fresh; only an exact
    // repeat plans nothing. Comment-dedup only — review verdicts never skip.
    if (pr.ownComments?.includes(decision.reasoning)) return [];
    return [
      {
        command: 'gh',
        args: ['pr', 'comment', prRef, '--body', decision.reasoning],
        details: `flagging #${pr.number} for MASTERMIND's human review — never auto-merged`,
      },
    ];
  }

  if (decision.decision === 'request-changes') {
    // The review-verdict half of the same re-run idempotency: the ritual's
    // own standing CHANGES_REQUESTED review stays active on GitHub until
    // dismissed or superseded, so when it already carries this exact
    // reasoning there is nothing new to say — re-posting it each pass while
    // the author leaves the PR red is the same spam the comment dedup above
    // closes. Any changed fact produces different reasoning and posts a
    // fresh review that supersedes the standing one. Dedup only against the
    // ritual's OWN standing review body, never against comments.
    if (pr.ownRequestChangesBody === decision.reasoning) return [];
    return [
      {
        command: 'gh',
        args: ['pr', 'review', prRef, '--request-changes', '--body', decision.reasoning],
        details: `requesting changes on #${pr.number}`,
      },
    ];
  }

  if (!pr.headRefOid) {
    throw new Error(
      `refusing to plan an unpinned merge for #${pr.number}: no reviewed head SHA to pin ` +
        '(gh pr merge --match-head-commit) — planPrReview queues pin-less candidates for ' +
        'a human, so a merge decision here can only come from a buggy or bypassing caller.',
    );
  }

  return [
    {
      command: 'gh',
      args: ['pr', 'review', prRef, '--approve', '--body', decision.reasoning],
      details: `approving #${pr.number} — policy-green`,
    },
    {
      command: 'gh',
      args: ['pr', 'merge', prRef, '--squash', '--match-head-commit', pr.headRefOid],
      details: `merging #${pr.number} (squash, head pinned to ${pr.headRefOid.slice(0, 8)})`,
    },
  ];
}

/** One PR's full review outcome — the decision {@link planPrReview} reached
 *  plus the `gh` commands {@link planPrReviewCommands} derived from it,
 *  paired back with the PR it's about. */
export interface PrReviewPlan {
  readonly pr: PrReviewCandidate;
  readonly decision: PrReviewDecision;
  readonly commands: readonly PrReviewCommand[];
}

/**
 * Runs {@link planPrReview} then {@link planPrReviewCommands} for every PR in
 * `prs` — the connective tissue between a batch fetch (e.g. {@link
 * fetchOpenPrCandidates}) and a batch execute (e.g. {@link
 * executePrReviewCommands} run per plan's `commands`). Pure: composes two
 * already-pure functions, no I/O of its own. Each PR is judged independently.
 */
export function planPrReviewBatch(
  prs: readonly PrReviewCandidate[],
  policy: PrReviewAutoMergePolicy = resolvePrReviewAutoMergePolicy(),
): readonly PrReviewPlan[] {
  return prs.map((pr) => {
    const decision = planPrReview(pr, policy);
    const commands = planPrReviewCommands(pr, decision);
    return { pr, decision, commands };
  });
}

/** One check entry as `gh pr list --json statusCheckRollup` emits it —
 *  untrusted process output. gh mixes two shapes into the rollup: CheckRun
 *  entries carry `name`/`conclusion`, StatusContext entries (external
 *  commit statuses) carry `context`/`state` — only `name`, `conclusion`,
 *  and `state` matter to this policy. */
interface RawPrCheck {
  readonly name?: unknown;
  readonly conclusion?: unknown;
  readonly state?: unknown;
}

/** One touched-file entry as `gh pr list --json files` emits it. */
interface RawPrFile {
  readonly path?: unknown;
}

/** One label entry as `gh pr list --json labels` emits it — only `name`
 *  matters to the hold-label guard. */
interface RawPrLabel {
  readonly name?: unknown;
}

/** One entry as `gh pr list --json latestReviews` emits it — the LATEST
 *  review per reviewer; its `state` (`APPROVED`/`CHANGES_REQUESTED`/
 *  `COMMENTED`/…) and author `login` drive the changes-requested guard, and
 *  its `body` feeds the ritual's own request-changes re-run dedup. */
interface RawPrLatestReview {
  readonly state?: unknown;
  readonly author?: unknown;
  readonly body?: unknown;
}

/** One entry as `gh pr list --json comments` emits it — only its `body` and
 *  its author `login` matter to the queue-for-human comment dedup. */
interface RawPrComment {
  readonly author?: unknown;
  readonly body?: unknown;
}

/** One entry as `gh pr list --json reviews` emits it — the PR's FULL review
 *  history (first 100, every state), each with its `submittedAt`. Read only
 *  to recover a reviewer's STANDING verdict when `latestReviews` masks it
 *  (see {@link readStandingChangesRequestedFromHistory}). */
interface RawPrHistoryReview {
  readonly state?: unknown;
  readonly author?: unknown;
  readonly submittedAt?: unknown;
}

/** One PR entry as `gh pr list --json number,title,author,mergeable,mergeStateStatus,baseRefName,headRefOid,statusCheckRollup,files,labels,changedFiles,additions,deletions,latestReviews,isDraft,autoMergeRequest,comments,reviews` emits it. */
interface RawPr {
  readonly number?: unknown;
  readonly title?: unknown;
  readonly author?: unknown;
  readonly mergeable?: unknown;
  readonly mergeStateStatus?: unknown;
  readonly baseRefName?: unknown;
  readonly headRefOid?: unknown;
  readonly statusCheckRollup?: unknown;
  readonly files?: unknown;
  readonly labels?: unknown;
  readonly changedFiles?: unknown;
  readonly additions?: unknown;
  readonly deletions?: unknown;
  readonly latestReviews?: unknown;
  readonly isDraft?: unknown;
  readonly autoMergeRequest?: unknown;
  readonly comments?: unknown;
  readonly reviews?: unknown;
}

/** Check-run conclusions that are TERMINAL without being a pass — gh's
 *  GraphQL `CheckConclusionState` values minus `SUCCESS` and the no-verdict
 *  pair (`NEUTRAL`/`SKIPPED`). A run cancelled by a concurrency group,
 *  timed out, halted for action-required, gone stale, or dead at startup
 *  has CONCLUDED without a green verdict — classing it "pending" would post
 *  a false "the gate is still running" reason and hold the PR there forever
 *  with no re-run prompt. `NEUTRAL` and `SKIPPED` stay pending on purpose:
 *  reclassifying either as non-gating could WIDEN what auto-merges, and
 *  every check in this ritual may only narrow. */
const TERMINAL_NON_PASS_CONCLUSIONS: ReadonlySet<unknown> = new Set([
  'FAILURE',
  'CANCELLED',
  'TIMED_OUT',
  'ACTION_REQUIRED',
  'STARTUP_FAILURE',
  'STALE',
]);

/** Commit-status states that are TERMINAL without being a pass — gh's
 *  statusCheckRollup mixes StatusContext entries (external commit statuses:
 *  `context`/`state`, GraphQL `StatusState`) in with CheckRuns, and a status
 *  whose state is `FAILURE` or `ERROR` has concluded red. Classing it
 *  "pending" because it carries no `conclusion` key would post the same
 *  false "the gate is still running" the terminal conclusions above were
 *  reclassified to stop. `SUCCESS` deliberately does NOT count toward a
 *  pass (and `PENDING`/`EXPECTED` stay pending): the rollup's pass branch
 *  still requires every gating entry to be a conclusion-`SUCCESS` CheckRun,
 *  because recognizing a green status could only WIDEN what auto-merges —
 *  every check in this ritual may only narrow. */
const TERMINAL_NON_PASS_STATES: ReadonlySet<unknown> = new Set(['FAILURE', 'ERROR']);

/** Rolls up a PR's check runs into one {@link GateStatus}: no gating check
 *  at all is `unreported`; any terminal non-success conclusion (see {@link
 *  TERMINAL_NON_PASS_CONCLUSIONS}) fails the whole gate; every check passing
 *  passes it; anything else (some gating check still running or unreadable)
 *  is pending — the same "an agent's judgment never substitutes for the
 *  gate" stance treats "no verdict yet" as not-yet-mergeable, not as a pass
 *  by default, and `unreported` exists so the posted reason never claims a
 *  run on a head where none may exist. */
function deriveGateStatus(checks: readonly RawPrCheck[]): GateStatus {
  // Checks named "(optional)" are the canonical repo's convention for
  // informational, continue-on-error jobs (ci.yml's "reuse lint (optional)")
  // — their check run still concludes FAILURE (verified live on PR #3), so
  // counting them would hold every PR at request-changes forever on a job
  // the workflow itself deems non-gating. Only non-optional checks gate;
  // if ONLY optional checks reported, that is no verdict at all — unreported,
  // the same as "no checks at all" (and just as far from a pass).
  // Optional chaining throughout: gh's rollup is untrusted process output,
  // and a null/garbage entry once threw a TypeError that crashed the WHOLE
  // fetch — every PR in the pass, and the execute-time re-derive with it
  // (the same crash class the files sweep's `file?.path` already survives).
  // An unreadable entry cannot confirm a pass, so it lands on 'pending' —
  // fail-closed, like every other verdict here.
  const gating = checks.filter(
    (check) =>
      !(typeof check?.name === 'string' && check.name.toLowerCase().includes('(optional)')),
  );
  if (gating.length === 0) return 'unreported';
  if (
    gating.some(
      (check) =>
        TERMINAL_NON_PASS_CONCLUSIONS.has(check?.conclusion) ||
        TERMINAL_NON_PASS_STATES.has(check?.state),
    )
  ) {
    return 'fail';
  }
  if (gating.every((check) => check?.conclusion === 'SUCCESS')) return 'pass';
  return 'pending';
}

/**
 * The most open PRs one review pass fetches — `gh pr list` silently caps at
 * its default of 30 (newest first) when no `--limit` is passed, so on a repo
 * with more open PRs than that, the OLDEST ones would never appear in any
 * pass and so never receive any verdict at all — and a PR previewed while it
 * was in the newest 30 would 404 at execute time once newer PRs pushed it
 * past the cap, since `pr-review-execute.ts` re-derives through this same
 * fetch. 100 mirrors the per-PR files cap gh already imposes (see {@link
 * prTouchedPathsTruncated}); the residual truncation beyond it is honest to
 * live with — each pass's request-changes/merge verdicts shrink the
 * actionable set, so a regularly-run ritual works the backlog down toward
 * visibility, which the silent default never could.
 */
export const MAX_PR_LIST_CANDIDATES = 100;

/**
 * Lists every open, review-ready PR via `gh pr list --state open --limit
 * {@link MAX_PR_LIST_CANDIDATES} --json
 * number,title,mergeable,statusCheckRollup,files,...`, run through the
 * injectable `exec` — the same `CliExec` shape `connection/cli-probe.ts`
 * uses, so this stays deterministically testable without a real `gh` on
 * PATH. Read-only: never reviews, comments, or merges anything, only lists.
 * Draft PRs (`isDraft: true` — `gh pr list` includes them by default) are
 * dropped entirely: a draft is its author's explicit not-ready signal, so
 * neither an approve, a request-changes, nor even a queue-for-human comment
 * is a verdict the ritual may post on it — and GitHub refuses to merge a
 * draft anyway, so a policy-green draft would otherwise collect a dishonest
 * "approved — policy-green" review ahead of a merge that can only fail.
 * Because `pr-review-execute.ts` re-derives through this same fetch, a
 * draft's number 404s at execute time too, the same convention as an
 * already-merged PR. Only the literal `true` excludes — defensive parsing
 * fails toward reviewing, never toward a silent skip. Entries missing a
 * numeric `number` or string `title` are
 * dropped rather than passed through malformed; a `mergeable` value other
 * than the literal string `"MERGEABLE"` is treated as not mergeable (the
 * same fail-closed stance `gh`'s own `"UNKNOWN"`/`"CONFLICTING"` values
 * deserve — an unclear merge state is not a green light), and any value
 * that is neither `"MERGEABLE"` nor `"CONFLICTING"` additionally carries
 * `mergeStateUnknown` so {@link planPrReview}'s posted reason says the
 * state is uncomputed instead of claiming conflicts nobody verified.
 */
export async function fetchOpenPrCandidates(exec: CliExec): Promise<PrReviewCandidate[]> {
  return (await fetchOpenPrCandidateReport(exec)).candidates;
}

/** {@link fetchOpenPrCandidateReport}'s outcome: the parsed candidates plus
 *  `fetchFailed` (always `true`) when the `gh pr list` read itself failed —
 *  nonzero exit, unparseable stdout, or a non-array report. Without the
 *  flag, an outage collapsed to the same `[]` a genuinely empty queue
 *  returns, and the preview surface HID the KEEPER panel as if nothing were
 *  open to review — the same unverified-assertion class the execute path's
 *  `confirmPrNotOpen` probe closed for its 404. Absent means the read
 *  succeeded and an empty list is a CONFIRMED empty queue. Reporting-only:
 *  no decision consults it, so it can never widen what merges. */
export interface PrReviewCandidateReport {
  readonly candidates: PrReviewCandidate[];
  readonly fetchFailed?: true;
}

/** The failure-honest twin of {@link fetchOpenPrCandidates}: same fetch,
 *  same parsing, but a failed read reports `fetchFailed: true` instead of
 *  masquerading as an empty queue. The preview wiring (`main.ts`'s
 *  `prReview`) reads through this so the operator panel can say "the list
 *  could not be read" rather than silently hiding; the execute path keeps
 *  the bare-list function since its miss path already probes an absent PR
 *  itself (`pr-review-execute.ts`'s `confirmPrNotOpen`). */
export async function fetchOpenPrCandidateReport(exec: CliExec): Promise<PrReviewCandidateReport> {
  const { code, stdout } = await exec('gh', [
    'pr',
    'list',
    '--state',
    'open',
    '--limit',
    String(MAX_PR_LIST_CANDIDATES),
    '--json',
    'number,title,author,mergeable,mergeStateStatus,baseRefName,headRefOid,statusCheckRollup,files,labels,changedFiles,additions,deletions,latestReviews,isDraft,autoMergeRequest,comments,reviews',
  ]);
  if (code !== 0) return { candidates: [], fetchFailed: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { candidates: [], fetchFailed: true };
  }
  if (!Array.isArray(parsed)) return { candidates: [], fetchFailed: true };

  const rows = (parsed as RawPr[])
    .filter((raw) => typeof raw.number === 'number' && typeof raw.title === 'string')
    .filter((raw) => raw.isDraft !== true);

  // One `gh api user` spend per fetch, and only when it can matter: some
  // candidate reports an author login to compare against (viewerIsAuthor),
  // some candidate carries a standing changes-requested review whose author
  // must be checked against the viewer (reviewChangesRequested), OR some
  // candidate carries an authored comment the queue-for-human dedup could
  // match against (ownComments). A failed lookup leaves authorship and the
  // dedups not-assessed but flags any standing changes-requested review as
  // UNVERIFIED instead — every path fails closed toward queue-for-human,
  // never toward a merge (see {@link PrReviewCandidate}).
  const viewerLogin = rows.some(
    (raw) =>
      readAuthorLogin(raw.author) !== undefined ||
      rawHasChangesRequestedReview(raw) ||
      rawHasAuthoredComment(raw),
  )
    ? await fetchViewerLogin(exec)
    : undefined;

  const candidates = rows.map((raw) => {
    const checks = Array.isArray(raw.statusCheckRollup)
      ? (raw.statusCheckRollup as RawPrCheck[])
      : [];
    const fileEntries = Array.isArray(raw.files) ? (raw.files as RawPrFile[]) : undefined;
    const touchedPaths = (fileEntries ?? [])
      .map((file) => file?.path)
      .filter((path): path is string => typeof path === 'string' && path !== '');
    const labelEntries = Array.isArray(raw.labels) ? (raw.labels as RawPrLabel[]) : undefined;
    const labels = (labelEntries ?? [])
      .map((label) => label?.name)
      .filter((name): name is string => typeof name === 'string' && name !== '');
    // Unreadable label output (non-array, or an entry with no readable name)
    // must not silently disarm the hold sweep — the readable names still ride
    // along (each can only narrow), but the candidate carries the unassessed
    // flag so planPrReview's merge tier fails closed on it.
    const labelsUnassessed = labelEntries === undefined || labelEntries.length !== labels.length;
    // Same confirmed-or-flagged stance for the review sweep: an entry whose
    // state is unreadable could BE a CHANGES_REQUESTED nobody can recognize.
    const reviewEntries = Array.isArray(raw.latestReviews)
      ? (raw.latestReviews as RawPrLatestReview[])
      : undefined;
    const latestReviewsUnassessed =
      reviewEntries === undefined ||
      reviewEntries.some((review) => typeof review?.state !== 'string' || review.state === '');
    const authorLogin = readAuthorLogin(raw.author);
    const ownComments =
      viewerLogin === undefined
        ? []
        : (Array.isArray(raw.comments) ? (raw.comments as RawPrComment[]) : [])
            .filter(
              (comment) =>
                readAuthorLogin(comment.author)?.toLowerCase() === viewerLogin.toLowerCase(),
            )
            .map((comment) => comment.body)
            .filter((body): body is string => typeof body === 'string' && body !== '');
    return {
      number: raw.number as number,
      title: raw.title as string,
      gateStatus: deriveGateStatus(checks),
      mergeable: raw.mergeable === 'MERGEABLE',
      // Anything but the two real verdicts is an uncomputed/unclear state:
      // still not mergeable (fail closed), but flagged so the posted reason
      // says "not computed yet" instead of claiming unverified conflicts.
      ...(raw.mergeable !== 'MERGEABLE' && raw.mergeable !== 'CONFLICTING'
        ? { mergeStateUnknown: true }
        : {}),
      // Only the literal BEHIND narrows — any other status stays absent:
      // BLOCKED may become mergeable via this very ritual's own planned
      // approve, and recognizing a "good" status (CLEAN) as anything could
      // only WIDEN what auto-merges; every check here may only narrow.
      ...(raw.mergeStateStatus === 'BEHIND' ? { behindBase: true } : {}),
      // Present only when gh reports a non-null autoMergeRequest — GitHub's
      // own auto-merge armed on the PR. ANY non-null value counts as armed
      // (a garbage report narrows toward a human); null/absent stays
      // absent, behaving as not-armed.
      ...(raw.autoMergeRequest !== null && raw.autoMergeRequest !== undefined
        ? { autoMergeArmed: true }
        : {}),
      touchedPaths,
      // Present only when the files list could NOT be read in full — gh
      // reported a non-array, or an entry without a readable string path
      // (dropped by the touchedPaths filter above, leaving an unswept path).
      // planPrReview then queues for a human rather than letting an
      // empty/partial enumeration masquerade as a complete security sweep or
      // a confirmed-empty diff.
      ...(fileEntries === undefined || fileEntries.length !== touchedPaths.length
        ? { touchedPathsUnassessed: true }
        : {}),
      // Absent unless gh reported at least one label — an empty list behaves
      // as "no hold" in prHasHoldLabel, so omitting it keeps the candidate
      // free of an explicit empty array while staying not-a-hold.
      ...(labels.length > 0 ? { labels } : {}),
      ...(labelsUnassessed ? { labelsUnassessed: true } : {}),
      ...(latestReviewsUnassessed ? { latestReviewsUnassessed: true } : {}),
      // Anything but a non-negative integer changedFiles stays absent — an
      // unconfirmed total must not be judged as if it were a count, and
      // prTouchedPathsTruncated fails closed on absent when the enumerated
      // list sits at gh's cap (the same confirmed-or-nothing stance as
      // additions/deletions below).
      ...(isConfirmedCount(raw.changedFiles) ? { changedFiles: raw.changedFiles } : {}),
      // Anything but a non-negative integer additions/deletions stays absent
      // — absent queues at the merge tier (the confirmed-size guard), which
      // beats judging garbage: a NEGATIVE count would UNDERCOUNT the
      // changed-line total and slip an oversized diff under the size cap.
      ...(isConfirmedCount(raw.additions) ? { additions: raw.additions } : {}),
      ...(isConfirmedCount(raw.deletions) ? { deletions: raw.deletions } : {}),
      // A non-string/empty headRefOid stays absent: an unpinned merge is
      // today's behavior, garbage argv handed to gh is not.
      ...(typeof raw.headRefOid === 'string' && raw.headRefOid !== ''
        ? { headRefOid: raw.headRefOid }
        : {}),
      // A non-string/empty baseRefName stays absent: prTargetsCanonicalBase
      // fails closed on absent (queues for a human), so a missing base can
      // only narrow toward human review, never toward a wrong-branch merge.
      ...(typeof raw.baseRefName === 'string' && raw.baseRefName !== ''
        ? { baseRefName: raw.baseRefName }
        : {}),
      // Absent unless BOTH logins are known — ownership stays not-assessed
      // rather than guessed. GitHub logins are case-insensitive, so the
      // comparison is too.
      ...(authorLogin !== undefined && viewerLogin !== undefined
        ? { viewerIsAuthor: authorLogin.toLowerCase() === viewerLogin.toLowerCase() }
        : {}),
      // Present only when the viewer login is known AND the viewer itself
      // has posted at least one non-empty comment — the queue-for-human
      // dedup in planPrReviewCommands then skips re-posting an identical
      // verdict. Absent otherwise (behaves as an empty list; dedup-only,
      // never a decision input).
      ...(ownComments.length > 0 ? { ownComments } : {}),
      // Present only when the viewer login is known (so the ritual's OWN
      // request-changes reviews can be excluded — a green PR the KEEPER once
      // flagged must not stall forever on its own stale review) AND some other
      // reviewer's latest review is CHANGES_REQUESTED. Absent otherwise, which
      // behaves as false: the guard can only narrow toward queue-for-human.
      ...(viewerLogin !== undefined && readReviewChangesRequested(raw, viewerLogin)
        ? { reviewChangesRequested: true }
        : {}),
      // Present only when the viewer login is known AND the viewer's OWN
      // latest review stands at CHANGES_REQUESTED with a non-empty string
      // body — the request-changes re-run dedup in planPrReviewCommands then
      // skips re-posting an identical verdict. Absent otherwise (always
      // posts; dedup-only, never a decision input).
      ...(() => {
        const body =
          viewerLogin === undefined ? undefined : readOwnRequestChangesBody(raw, viewerLogin);
        return body === undefined ? {} : { ownRequestChangesBody: body };
      })(),
      // A standing CHANGES_REQUESTED review with NO viewer login to exclude
      // own reviews against fails closed instead of not-assessed: leaving it
      // absent let a policy-green PR merge over a possibly-human "not yet"
      // whenever `gh api user` hiccuped — the one review fact where a failed
      // lookup widened toward a merge. Only set when a CR review actually
      // exists, so a lookup outage alone never queues a review-free PR.
      ...(viewerLogin === undefined && rawHasChangesRequestedReview(raw)
        ? { reviewChangesRequestedUnverified: true }
        : {}),
    };
  });
  return { candidates };
}

/** The body of the viewer's OWN standing `CHANGES_REQUESTED` review — its
 *  latest review on the PR, author compared case-insensitively (GitHub
 *  logins are). `undefined` unless the state is exactly `CHANGES_REQUESTED`,
 *  the author provably IS the viewer, and the body is a non-empty string —
 *  the request-changes dedup must never match against garbage, and an
 *  unmatchable body simply posts fresh (the safe direction for a dedup). */
function readOwnRequestChangesBody(raw: RawPr, viewerLogin: string): string | undefined {
  const reviews = Array.isArray(raw.latestReviews)
    ? (raw.latestReviews as RawPrLatestReview[])
    : [];
  for (const review of reviews) {
    // gh can emit null entries inside latestReviews (observed live — a
    // TypeError here crashed the WHOLE candidate fetch); a non-object entry
    // simply cannot be the viewer's CR, so it is skipped, never fatal.
    if (review === null || typeof review !== 'object') continue;
    if (review.state !== 'CHANGES_REQUESTED') continue;
    const login = readAuthorLogin(review.author);
    if (login === undefined || login.toLowerCase() !== viewerLogin.toLowerCase()) continue;
    if (typeof review.body === 'string' && review.body !== '') return review.body;
  }
  return undefined;
}

/** The `login` inside `gh pr list --json author`'s author object — untrusted
 *  process output, `undefined` for anything but a non-empty string. Reused
 *  for a review's own `author` object, which carries the same `{ login }`
 *  shape. */
function readAuthorLogin(author: unknown): string | undefined {
  const login = (author as { login?: unknown } | null | undefined)?.login;
  return typeof login === 'string' && login !== '' ? login : undefined;
}

/** Review states that SET a reviewer's standing verdict. `COMMENTED` and
 *  `PENDING` leave it untouched: GitHub keeps a reviewer's CHANGES_REQUESTED
 *  standing until that reviewer approves or the review is dismissed, so a
 *  comment-only follow-up never clears it — yet `latestReviews` (each
 *  reviewer's latest review of ANY state) reports the follow-up as that
 *  reviewer's latest, masking the standing request. */
const OPINIONATED_REVIEW_STATES: ReadonlySet<unknown> = new Set([
  'APPROVED',
  'CHANGES_REQUESTED',
  'DISMISSED',
]);

/** The standing CHANGES_REQUESTED verdicts a PR's review history carries —
 *  `logins` (lower-cased) whose latest opinionated review is a CR, plus
 *  `unattributed` when a CR entry carried no readable login. */
interface StandingChangesRequested {
  readonly logins: ReadonlySet<string>;
  readonly unattributed: boolean;
}

/** Recovers each reviewer's STANDING verdict from the full review history
 *  (`gh pr list --json reviews`): their latest entry in {@link
 *  OPINIONATED_REVIEW_STATES}, ordered by `submittedAt` (array order when any
 *  timestamp is unreadable), so a human's CHANGES_REQUESTED that a later
 *  comment-only review masks in `latestReviews` still reads as standing. An
 *  unattributed CR is sticky — nothing proves a later login-less entry came
 *  from the same reviewer, so it fails toward a human, the same stance the
 *  `latestReviews` sweep takes on an unattributed CR. Additive and
 *  narrowing-only: an absent or unreadable history judges nothing, leaving
 *  the `latestReviews` sweep — and its unassessed flag — as the fail-closed
 *  layer it already is; the first-100 cap on `reviews` is the same residual
 *  the remediation sweeps already accept. */
function readStandingChangesRequestedFromHistory(raw: RawPr): StandingChangesRequested {
  const entries = Array.isArray(raw.reviews) ? (raw.reviews as RawPrHistoryReview[]) : [];
  const ordered = entries.every((review) => typeof review?.submittedAt === 'string')
    ? [...entries].sort((a, b) => {
        // ISO-8601 UTC timestamps order lexically; stable sort keeps array
        // order for equal stamps.
        const left = a.submittedAt as string;
        const right = b.submittedAt as string;
        return left < right ? -1 : left > right ? 1 : 0;
      })
    : entries;
  const standing = new Map<string, unknown>();
  let unattributed = false;
  for (const review of ordered) {
    // Optional chaining: a null/garbage entry reads as no verdict, never a
    // TypeError that crashes the whole fetch.
    const state = review?.state;
    if (!OPINIONATED_REVIEW_STATES.has(state)) continue;
    const login = readAuthorLogin(review?.author);
    if (login === undefined) {
      if (state === 'CHANGES_REQUESTED') unattributed = true;
      continue;
    }
    standing.set(login.toLowerCase(), state);
  }
  const logins = new Set(
    [...standing].filter(([, state]) => state === 'CHANGES_REQUESTED').map(([login]) => login),
  );
  return { logins, unattributed };
}

/** True when `gh pr list --json latestReviews` reports at least one
 *  `CHANGES_REQUESTED` entry, or the review history ({@link
 *  readStandingChangesRequestedFromHistory}) carries a standing one a later
 *  comment masked — the cheap pre-scan that decides whether the one `gh api
 *  user` viewer lookup is worth spending on a batch that reports no PR
 *  authors but does carry a standing changes-requested review. */
function rawHasChangesRequestedReview(raw: RawPr): boolean {
  const history = readStandingChangesRequestedFromHistory(raw);
  if (history.unattributed || history.logins.size > 0) return true;
  return (
    Array.isArray(raw.latestReviews) &&
    (raw.latestReviews as RawPrLatestReview[]).some(
      // Optional chaining: a null entry must read as "not a CR", not throw —
      // the unassessed flag (minted separately) is what fails it closed.
      (review) => review?.state === 'CHANGES_REQUESTED',
    )
  );
}

/** True when `gh pr list --json comments` reports at least one comment with
 *  an author login — the cheap pre-scan that decides whether the one `gh api
 *  user` viewer lookup is worth spending for the queue-for-human comment
 *  dedup on a batch that reports no PR authors and no changes-requested
 *  review. */
function rawHasAuthoredComment(raw: RawPr): boolean {
  return (
    Array.isArray(raw.comments) &&
    (raw.comments as RawPrComment[]).some(
      (comment) => readAuthorLogin(comment.author) !== undefined,
    )
  );
}

/** Whether a reviewer OTHER than `viewerLogin` has a standing
 *  `CHANGES_REQUESTED` as their latest review (logins compared
 *  case-insensitively — GitHub logins are). Excluding the viewer's own
 *  reviews is what keeps a green PR the KEEPER itself once flagged from
 *  stalling forever on its own stale review. A `CHANGES_REQUESTED` entry
 *  whose author gh did not report counts as a human's — failing toward
 *  queue-for-human, the safe narrowing direction. */
function readReviewChangesRequested(raw: RawPr, viewerLogin: string): boolean {
  const viewer = viewerLogin.toLowerCase();
  // The history sweep first: it sees a standing CR that a later comment-only
  // review masks in latestReviews, excluding the viewer's own the same way.
  const history = readStandingChangesRequestedFromHistory(raw);
  if (history.unattributed || [...history.logins].some((login) => login !== viewer)) return true;
  const reviews = Array.isArray(raw.latestReviews)
    ? (raw.latestReviews as RawPrLatestReview[])
    : [];
  return reviews.some((review) => {
    // Optional chaining for the same null-entry tolerance as
    // rawHasChangesRequestedReview — an unreadable entry is not a CR here;
    // the unassessed flag carries its fail-closed verdict instead.
    if (review?.state !== 'CHANGES_REQUESTED') return false;
    const login = readAuthorLogin(review.author);
    return login === undefined || login.toLowerCase() !== viewerLogin.toLowerCase();
  });
}

/** Resolves the login `gh` is authenticated as via `gh api user` — the
 *  identity every review this ritual plans would be posted under. Exported
 *  so `pool-client.ts`'s claim action can resolve the same "who am I"
 *  identity to assign a pool issue to, rather than duplicating this `gh api
 *  user` call under a second name. `undefined` on any failure: ownership
 *  stays not-assessed, which can only widen what queues for a human, never
 *  what merges or claims. */
export async function fetchViewerLogin(exec: CliExec): Promise<string | undefined> {
  const { code, stdout } = await exec('gh', ['api', 'user']);
  if (code !== 0) return undefined;
  try {
    const login = (JSON.parse(stdout) as { login?: unknown } | null)?.login;
    return typeof login === 'string' && login !== '' ? login : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Verify-necessity read wiring (epic 0007's "already fixed elsewhere"):
 * fetches PR `number`'s unified diff via `gh pr diff` and tests whether it
 * reverse-applies cleanly to the current tree via `git apply --reverse
 * --check` — a clean reverse-apply means every change the PR proposes is
 * already present at HEAD. Returns `true`/`false` for a real verdict and
 * `undefined` for "not assessed" (diff fetch failed, or the diff is empty —
 * an empty diff proves nothing about necessity either way), which leaves the
 * candidate's optional `alreadyApplied` absent: the check can only narrow a
 * decision toward request-changes, never force a merge (see {@link
 * PrReviewCandidate}). The diff goes through a temp patch file rather than
 * stdin because `CliExec` is argv-only, and the check runs in the dashboard
 * process's own cwd — the one canonical repo the KEEPER rituals act on, the
 * same cwd assumption {@link fetchOpenPrCandidates}'s `gh pr list` already
 * makes.
 */
export async function assessPrAlreadyApplied(
  number: number,
  exec: CliExec,
  headRefOid?: string,
): Promise<boolean | undefined> {
  return (
    await assessPrDiff(number, exec, {
      ...(headRefOid !== undefined ? { headRefOid } : {}),
    })
  ).alreadyApplied;
}

/**
 * Can the dashboard's working tree honestly stand in for the base branch
 * when a `git apply --check` verdict on PR `headRefOid`'s diff is about to be
 * minted? The reverse-apply check judges whatever that tree holds, and two
 * local states make it reverse-apply the PR's diff cleanly for reasons that
 * say nothing about the PR being "already fixed elsewhere": uncommitted edits
 * (the operator mid-change), and a history that already CONTAINS the PR's
 * own head — the `gh pr checkout N` every human review starts with, after
 * which the tree IS the PR. Before this check, that second state posted a
 * public request-changes telling the contributor their PR was "already
 * present in the current tree ... likely already fixed elsewhere; rebase or
 * close" — a false verdict minted by the maintainer's own checkout. Two cheap
 * git reads, spent only when a verdict is about to be minted: `git status
 * --porcelain --untracked-files=no` must succeed and report nothing (tracked
 * paths only — untracked files cannot make a tracked hunk reverse-apply, and
 * the canonical checkout routinely carries scratch files), and `git
 * merge-base --is-ancestor <head> HEAD` must NOT exit 0 (exit 1 means not an
 * ancestor; 128 means git does not know the commit at all — a never-fetched
 * PR cannot be the tree, so it counts as not contained). An absent head SHA
 * cannot rule the second state out, so it fails closed toward "cannot stand
 * in" without spending anything. Fail-closed throughout: `false` only ever
 * WITHHOLDS a verdict (leaving necessity not-assessed, which the decision
 * core treats as "no verdict" rather than a merge input), never mints one.
 * Residual, accepted: a PR force-pushed after the local checkout carries a
 * head the old local branch does not contain, and a branch that cherry-picked
 * the PR's content contains no PR commit — both still read as stand-ins.
 */
export async function workingTreeStandsInForBase(
  headRefOid: string | undefined,
  exec: CliExec,
): Promise<boolean> {
  if (headRefOid === undefined) return false;
  const status = await exec('git', ['status', '--porcelain', '--untracked-files=no']);
  if (status.code !== 0 || status.stdout.trim() !== '') return false;
  const ancestry = await exec('git', ['merge-base', '--is-ancestor', headRefOid, 'HEAD']);
  return ancestry.code !== 0;
}

/** Every verdict one `gh pr diff` fetch can yield: epic 0007's
 *  verify-necessity reverse-apply check, the binary-content judgment, and the
 *  conflicting-path names {@link parseGitApplyConflictPaths} reads off a
 *  forward `git apply --check`. Keys are present only when actually
 *  assessed, so spreading an assessment into a candidate never plants an
 *  explicit `undefined` (see {@link PrReviewCandidate}'s
 *  absent-means-not-assessed convention). */
export interface PrDiffAssessment {
  readonly alreadyApplied?: boolean;
  readonly hasBinaryDiff?: boolean;
  readonly conflictingPaths?: readonly string[];
  readonly renamedFromPaths?: readonly string[];
}

/** Extracts the OLD path of every rename the unified diff declares — its
 *  `rename from <path>` headers, the one place a moved file's original
 *  location still appears once gh's files list has swapped to the new name
 *  (see {@link PrReviewCandidate.renamedFromPaths}). Anchored at column 0
 *  like {@link BINARY_DIFF_MARKER}: a diff BODY line quoting the header
 *  starts with `+`/`-`/space, so only a real header matches. Git core-quotes
 *  paths with special characters; the surrounding quotes are stripped so the
 *  marker sweep sees the plain path. Deduplicated and sorted for
 *  deterministic reasoning text, same as {@link parseGitApplyConflictPaths}.
 *  Pure: never spawns anything itself. */
export function parseDiffRenameSources(diff: string): string[] {
  const sources = new Set<string>();
  for (const line of diff.split('\n')) {
    const match = line.replace(/\r$/, '').match(/^rename from (.+)$/);
    if (!match?.[1]) continue;
    const raw = match[1];
    sources.add(raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw);
  }
  return [...sources].sort();
}

/** Extracts the file path(s) `git apply --check` named in a failed run's
 *  stderr — the two shapes git's own source emits: a hunk-context mismatch
 *  (`error: patch failed: <path>:<line>`) and every other apply failure
 *  (`error: <path>: <reason...>`, e.g. "patch does not apply", "already
 *  exists in working directory"). Both verified against real `git apply
 *  --check` output on a genuinely divergent tree. Deduplicated and sorted for
 *  deterministic reasoning text — a hunk mismatch on one file often reports
 *  both shapes for the same path in the same run. Pure: never spawns
 *  anything itself. */
export function parseGitApplyConflictPaths(stderr: string): string[] {
  const paths = new Set<string>();
  for (const line of stderr.split('\n')) {
    const patchFailed = line.match(/^error: patch failed: (.+):\d+$/);
    if (patchFailed?.[1]) {
      paths.add(patchFailed[1]);
      continue;
    }
    const otherFailure = line.match(/^error: (.+?): /);
    if (otherFailure?.[1]) paths.add(otherFailure[1]);
  }
  return [...paths].sort();
}

/** The two shapes a unified diff marks binary content with — anchored at
 *  column 0 on purpose: a diff BODY line quoting either marker starts with
 *  `+`/`-`/space, so only a real marker line matches. */
const BINARY_DIFF_MARKER = /^(?:GIT binary patch|Binary files .* differ)\s*$/m;

/** Pure content judgment over an already-fetched unified diff: does it
 *  carry binary content byte-review cannot read? */
export function diffContainsBinaryContent(diff: string): boolean {
  return BINARY_DIFF_MARKER.test(diff);
}

/**
 * Fetches PR `number`'s unified diff via `gh pr diff` ONCE and derives every
 * diff-content verdict this ritual knows from it — the shared engine behind
 * {@link assessPrAlreadyApplied} and {@link annotateAlreadyApplied}, so a
 * second verdict never costs a second `gh` spend. Binary detection runs
 * first: a diff carrying binary content returns `{ hasBinaryDiff: true }`
 * and skips the reverse-apply spawn entirely — GitHub's API diff omits the
 * binary payload, so `git apply --reverse --check` could never report a
 * clean reverse-apply on it anyway, and the binary verdict outranks
 * necessity in {@link planPrReview} regardless. A failed fetch or empty
 * diff assesses nothing (`{}`): both checks can only narrow a decision,
 * never force a merge. `opts.checkConflictPaths` additionally spends a
 * forward `git apply --check` on the SAME already-written patch file when
 * the reverse-apply check fails — {@link annotateAlreadyApplied} only sets
 * it for a candidate gh already confirmed conflicting, so a normal
 * not-yet-merged PR (whose reverse-apply also routinely fails, since its
 * changes are not in the tree yet) never pays for a check its verdict could
 * never use. Both apply-derived verdicts that can MOVE a decision or NAME a
 * path — a clean reverse-apply (`alreadyApplied: true`) and the forward
 * check's conflicting paths — are minted only after {@link
 * workingTreeStandsInForBase} confirms the tree can stand in for the base
 * for `opts.headRefOid`; otherwise they are withheld (necessity left
 * not-assessed, no paths named) while the diff-content verdicts — binary,
 * renames — still ride, since those never consult the tree. A failed
 * reverse-apply needs no confirmation: "not applied" can only fall through.
 */
export async function assessPrDiff(
  number: number,
  exec: CliExec,
  opts?: { readonly checkConflictPaths?: boolean; readonly headRefOid?: string },
): Promise<PrDiffAssessment> {
  const diff = await exec('gh', ['pr', 'diff', String(number)]);
  if (diff.code !== 0 || diff.stdout.trim() === '') return {};
  // Rename sources ride every assessed verdict below — the header lines are
  // present even when a binary payload is not, and the security-hard rename
  // sweep in planPrReview outranks both diff verdicts here.
  const renameSources = parseDiffRenameSources(diff.stdout);
  // Always present on a successful fetch — an empty list is a CONFIRMED
  // "renames nothing", which planPrReview's merge tier demands before a
  // merge may assert the rename half of the security sweep actually ran.
  const renamed = { renamedFromPaths: renameSources };
  if (diffContainsBinaryContent(diff.stdout)) return { hasBinaryDiff: true, ...renamed };

  const dir = await mkdtemp(join(tmpdir(), 'autopilot-pr-review-'));
  const patchPath = join(dir, `pr-${number}.patch`);
  try {
    await writeFile(patchPath, diff.stdout, 'utf8');
    const reverseCheck = await exec('git', ['apply', '--reverse', '--check', patchPath]);
    if (reverseCheck.code === 0) {
      // The positive verdict posts a public "already fixed elsewhere" — so
      // the tree it was judged on must be confirmed a stand-in for the base
      // first (clean, and not itself the checked-out PR); otherwise necessity
      // stays not-assessed.
      return (await workingTreeStandsInForBase(opts?.headRefOid, exec))
        ? { alreadyApplied: true, hasBinaryDiff: false, ...renamed }
        : { hasBinaryDiff: false, ...renamed };
    }
    if (!opts?.checkConflictPaths) {
      return { alreadyApplied: false, hasBinaryDiff: false, ...renamed };
    }
    // Naming conflict paths judges the same tree: a dirty checkout would name
    // the operator's own edits as the PR's conflicts, so the forward check is
    // spent only on a confirmed stand-in — the generic conflict reasoning
    // stands otherwise, exactly as on any other unnamed failure.
    if (!(await workingTreeStandsInForBase(opts?.headRefOid, exec))) {
      return { alreadyApplied: false, hasBinaryDiff: false, ...renamed };
    }
    const forwardCheck = await exec('git', ['apply', '--check', patchPath]);
    const conflictingPaths =
      forwardCheck.code === 0 ? [] : parseGitApplyConflictPaths(forwardCheck.stderr ?? '');
    return {
      alreadyApplied: false,
      hasBinaryDiff: false,
      ...renamed,
      ...(conflictingPaths.length > 0 ? { conflictingPaths } : {}),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Folds {@link assessPrDiff}'s verdicts (verify-necessity reverse-apply +
 * binary-content detection + conflicting-path names, one `gh pr diff` spend)
 * into a batch of candidates —
 * the glue between {@link fetchOpenPrCandidates} and {@link
 * planPrReviewBatch}, used by both the preview read and the execute
 * re-derive so the two can never disagree about necessity. Immutable:
 * returns fresh candidate objects, never mutates the input. Candidates on a
 * security-sensitive path, with an unassessed or truncated files list, or
 * authored by the reviewing identity itself are passed through without
 * spending a `gh pr diff` call — each of those verdicts outranks
 * `alreadyApplied` unconditionally (see {@link planPrReview}), so no diff
 * assessment could change their decision. A
 * not-assessed verdict passes the candidate through unchanged too, keeping
 * `alreadyApplied` absent rather than an explicit `undefined` key.
 * `checkConflictPaths` is requested only for a candidate gh already
 * confirmed conflicting (`mergeable: false`, `mergeStateUnknown` absent) —
 * every other candidate's reverse-apply failure means nothing about a
 * conflict (a normal, not-yet-merged PR fails the reverse check too), so
 * the extra forward-apply spawn would be pure waste on the common case.
 * Sequential on purpose: one `gh`/`git` child process at a time, the same
 * one-at-a-time pacing {@link executePrReviewCommands} uses.
 */
export async function annotateAlreadyApplied(
  candidates: readonly PrReviewCandidate[],
  exec: CliExec,
): Promise<readonly PrReviewCandidate[]> {
  const annotated: PrReviewCandidate[] = [];
  for (const pr of candidates) {
    // Unassessed-list, truncated-list, and viewer-authored candidates skip
    // the spend for the same reason security-touching ones do: their verdict
    // is already queue-for-human in planPrReview (all four precede the binary
    // and already-applied checks there), so no diff assessment could change
    // the decision. The viewer-authored skip matters most in practice: the
    // KEEPER reviews under the same gh identity the autopilot's own PRs are
    // authored by, so own PRs are the common case, and each was costing a
    // full `gh pr diff` fetch plus a `git apply --reverse --check` spawn
    // per pass for a verdict that could never move. Zero-file candidates
    // skip it doubly: planPrReview's empty-diff request-changes also
    // precedes both diff checks, and the fetch itself could only return an
    // empty diff, which assessPrDiff already treats as assessing nothing.
    if (
      touchesSecuritySensitivePath(pr.touchedPaths) ||
      pr.touchedPathsUnassessed ||
      prTouchedPathsTruncated(pr) ||
      pr.viewerIsAuthor ||
      pr.touchedPaths.length === 0
    ) {
      annotated.push(pr);
      continue;
    }
    const assessment = await assessPrDiff(pr.number, exec, {
      checkConflictPaths: !pr.mergeable && !pr.mergeStateUnknown,
      // The reviewed head, so the tree stand-in check can rule out a locally
      // checked-out PR before any apply-derived verdict is minted.
      ...(pr.headRefOid !== undefined ? { headRefOid: pr.headRefOid } : {}),
    });
    annotated.push(Object.keys(assessment).length === 0 ? pr : { ...pr, ...assessment });
  }
  return annotated;
}

/** gh's per-page cap on the GraphQL connections {@link
 *  REVIEW_THREADS_QUERY} walks — the same 100 {@link MAX_PR_LIST_CANDIDATES}
 *  and {@link MAX_PR_LIST_FILES} already live with. A PR carrying more
 *  threads than one page holds stays unconfirmed (fail closed), like a
 *  files list at its cap. */
const MAX_REVIEW_THREADS_PER_PR = 100;

/** The one `gh api graphql` read behind {@link
 *  fetchUnresolvedReviewThreadCounts}: every open PR's review threads in a
 *  single spend, newest-created first — the same window and order `gh pr
 *  list` walks, so the candidates {@link fetchOpenPrCandidates} returns are
 *  the ones this read covers. `$owner`/`$name` come from gh's own
 *  `{owner}`/`{repo}` placeholders, resolved from the process's cwd exactly
 *  as `gh pr list` resolves its repo. */
const REVIEW_THREADS_QUERY =
  'query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ' +
  `pullRequests(states: OPEN, first: ${MAX_PR_LIST_CANDIDATES}, ` +
  'orderBy: {field: CREATED_AT, direction: DESC}) { nodes { number ' +
  `reviewThreads(first: ${MAX_REVIEW_THREADS_PER_PR}) { totalCount nodes { isResolved } } } } } }`;

/** One PR node as {@link REVIEW_THREADS_QUERY} returns it — untrusted
 *  process output; every field is checked before it counts. */
interface RawReviewThreadsNode {
  readonly number?: unknown;
  readonly reviewThreads?: unknown;
}

/**
 * Reads how many review threads each open PR still has UNRESOLVED — one `gh
 * api graphql` spend for the whole open-PR window (see {@link
 * REVIEW_THREADS_QUERY}). Returns a map of PR number → unresolved count
 * holding ONLY the PRs the read CONFIRMED: a readable number, a thread page
 * that is complete (`totalCount` no larger than the nodes fetched), and a
 * boolean `isResolved` on every node. Anything else — a failed exit,
 * unparseable JSON, a missing `data.repository.pullRequests.nodes` array, a
 * garbage node, a truncated page — simply leaves that PR (or every PR) out,
 * which {@link planPrReview}'s merge tier treats as unassessed and fails
 * closed on. Never throws: like every other read here, an outage may only
 * narrow what merges.
 */
export async function fetchUnresolvedReviewThreadCounts(
  exec: CliExec,
): Promise<ReadonlyMap<number, number>> {
  const counts = new Map<number, number>();
  const { code, stdout } = await exec('gh', [
    'api',
    'graphql',
    '-F',
    'owner={owner}',
    '-F',
    'name={repo}',
    '-f',
    `query=${REVIEW_THREADS_QUERY}`,
  ]);
  if (code !== 0) return counts;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return counts;
  }
  const nodes = (
    parsed as {
      data?: { repository?: { pullRequests?: { nodes?: unknown } | null } | null } | null;
    } | null
  )?.data?.repository?.pullRequests?.nodes;
  if (!Array.isArray(nodes)) return counts;
  for (const node of nodes as readonly (RawReviewThreadsNode | null)[]) {
    const unresolved = readUnresolvedThreadCount(node);
    if (unresolved !== undefined) counts.set(node?.number as number, unresolved);
  }
  return counts;
}

/** One PR node's CONFIRMED unresolved-thread count, or `undefined` when any
 *  part of it is unreadable or the page is incomplete — an unconfirmed count
 *  must leave the PR unassessed, never pose as a clean zero. */
function readUnresolvedThreadCount(node: RawReviewThreadsNode | null): number | undefined {
  if (!isConfirmedCount(node?.number)) return undefined;
  const threads = node.reviewThreads as
    { totalCount?: unknown; nodes?: unknown } | null | undefined;
  const entries = threads?.nodes;
  if (!isConfirmedCount(threads?.totalCount) || !Array.isArray(entries)) return undefined;
  if (threads.totalCount > entries.length) return undefined;
  let unresolved = 0;
  for (const entry of entries as readonly ({ isResolved?: unknown } | null)[]) {
    const resolved = entry?.isResolved;
    if (typeof resolved !== 'boolean') return undefined;
    if (!resolved) unresolved += 1;
  }
  return unresolved;
}

/**
 * Folds {@link fetchUnresolvedReviewThreadCounts}'s one read into a batch of
 * candidates — the review-thread sibling of {@link annotateAlreadyApplied},
 * used by both the preview read and the execute re-derive so the two can
 * never disagree about a conversation's state. Immutable: fresh candidate
 * objects, never a mutated input. The read is spent only when at least one
 * candidate WOULD MERGE with a clean sweep (judged under the 'green' policy,
 * so an operator's `off` lever still gets honest thread reasoning): every
 * other verdict precedes the thread guard in {@link planPrReview}, so no
 * thread count could move it, and a candidate the guard never reaches never
 * wears the "could not be read" reason for a read that was deliberately
 * skipped. When the read runs, every candidate it confirmed is annotated (a
 * confirmed `0` included — the only state a merge may treat as clean); a
 * candidate it did not confirm passes through unchanged, staying absent so
 * the merge tier fails closed on it.
 */
export async function annotateReviewThreads(
  candidates: readonly PrReviewCandidate[],
  exec: CliExec,
): Promise<readonly PrReviewCandidate[]> {
  const wouldMerge = candidates.some(
    (pr) => decidePrReview({ ...pr, unresolvedReviewThreads: 0 }, 'green').decision === 'merge',
  );
  if (!wouldMerge) return candidates;
  const counts = await fetchUnresolvedReviewThreadCounts(exec);
  return candidates.map((pr) => {
    const unresolved = counts.get(pr.number);
    return unresolved === undefined ? pr : { ...pr, unresolvedReviewThreads: unresolved };
  });
}

/** One {@link PrReviewCommand} run to completion — the same `{code,
 *  stdout}` shape `CliExec` returns, paired back with the command it came
 *  from so a caller can tell which planned step any given result belongs
 *  to. */
export interface PrReviewCommandResult {
  readonly command: PrReviewCommand;
  readonly code: number;
  readonly stdout: string;
}

/**
 * Runs a KEEPER review plan's {@link PrReviewCommand}s in order through the
 * injectable `exec` — the write-side counterpart to {@link
 * fetchOpenPrCandidates}'s read wiring, same `CliExec` shape. Stops at the
 * first failing command rather than continuing (unlike `issue-triage.ts`'s
 * `executeIssueTriageCommands`): a merge decision's approve-then-merge pair
 * is a real dependency — merging after a failed approve would apply the
 * "policy-green" outcome without the approval that justified it, so a
 * failed step must not be silently followed by the next one. Called by the
 * confirm-guarded execute path described in this file's header comment —
 * `pr-review-execute.ts`'s `createPrReviewExecuteApi`, behind `server.ts`'s
 * CSRF-guarded `POST /api/pr-review/execute` — never by any autonomous
 * trigger.
 */
export async function executePrReviewCommands(
  commands: readonly PrReviewCommand[],
  exec: CliExec,
): Promise<readonly PrReviewCommandResult[]> {
  const results: PrReviewCommandResult[] = [];
  for (const command of commands) {
    const { code, stdout } = await exec(command.command, command.args);
    results.push({ command, code, stdout });
    if (code !== 0) break;
  }
  return results;
}

/** One review entry as `gh api repos/{owner}/{repo}/pulls/N/reviews` emits
 *  it — untrusted process output; only the three fields the dangling-approval
 *  match needs. */
interface RawPrReview {
  readonly id?: unknown;
  readonly state?: unknown;
  readonly body?: unknown;
}

/**
 * Cleans up after the one failure shape {@link executePrReviewCommands}'s
 * stop-at-first-failure can still leave behind on a merge decision: the
 * approve landed (code 0) but the pinned merge was refused (code !== 0) —
 * possibly `--match-head-commit`'s TOCTOU refusal because the head moved
 * after review, but branch-protection requirements this ritual does not
 * model (e.g. a required-review count the approve alone did not satisfy)
 * can refuse the same merge call for a different reason; the dismissal
 * message posted to GitHub names both possibilities rather than asserting
 * one unverified cause as fact. And a nonzero exit does not even prove the
 * merge was REFUSED — `gh pr merge` can exit nonzero after the merge API
 * call landed (e.g. a network error on a follow-up call) — so before
 * dismissing anything this probes the PR's
 * actual state (`gh pr view --json state`) and a CONFIRMED `MERGED` skips
 * the dismissal entirely: the approval then vouches for exactly the pinned
 * bytes that merged, and dismissing it would falsify the audit record. A
 * genuinely refused merge leaves a "policy-green" APPROVED
 * review standing over bytes the ritual never judged, which a later (human
 * or bot) merge could silently inherit. This dismisses ONLY the ritual's
 * own dangling
 * approval(s): APPROVED reviews whose body is exactly the reasoning the
 * ritual posted — never anyone else's review, and never a review whose id
 * isn't a plain integer (the id goes into a URL path). Fails soft: when the
 * review list can't be fetched or parsed, it reports the fetch attempt and
 * dismisses nothing — remediation must never make the situation worse. A
 * no-op (empty result) whenever the decision wasn't a merge, the approve
 * itself failed, or the merge succeeded. Same injectable `CliExec` as the
 * rest of the write path; called by `pr-review-execute.ts` right after
 * {@link executePrReviewCommands}.
 */
export async function remediateDanglingApproval(
  pr: PrReviewCandidate,
  decision: PrReviewDecision,
  results: readonly PrReviewCommandResult[],
  exec: CliExec,
): Promise<readonly PrReviewCommandResult[]> {
  if (decision.decision !== 'merge') return [];
  const approve = results.find((entry) => entry.command.args.includes('--approve'));
  const merge = results.find(
    (entry) => entry.command.args[0] === 'pr' && entry.command.args[1] === 'merge',
  );
  if (!approve || approve.code !== 0) return [];
  if (!merge || merge.code === 0) return [];

  // A nonzero merge exit proves the COMMAND failed, not that the merge was
  // refused: `gh pr merge` can exit nonzero AFTER the merge API call landed —
  // e.g. a network error on a follow-up call.
  // Dismissing on the exit code alone would then strip an ACCURATE approval
  // off a MERGED PR (the pinned `--match-head-commit` head merged exactly the
  // bytes the approve vouched for) and post a flatly false "the merge did not
  // succeed" explanation into its audit record. So the remote state is probed
  // first, and only a CONFIRMED `MERGED` skips the dismissal — an honest
  // no-op, reported via the probe result. A failed or garbage probe proceeds
  // exactly as before: on a genuinely refused merge, dismissing is still the
  // safe direction, so the probe can only narrow the remediation, never
  // widen what it leaves standing on an open PR.
  const probeCommand: PrReviewCommand = {
    command: 'gh',
    args: ['pr', 'view', String(pr.number), '--json', 'state'],
    details:
      `checking whether #${pr.number} actually merged despite the failed merge ` +
      'command — a nonzero exit does not prove the merge was refused',
  };
  const probed = await exec(probeCommand.command, probeCommand.args);
  const probeResult: PrReviewCommandResult = {
    command: probeCommand,
    code: probed.code,
    stdout: probed.stdout,
  };
  if (probed.code === 0) {
    try {
      const state = (JSON.parse(probed.stdout) as { state?: unknown } | null)?.state;
      if (state === 'MERGED') return [probeResult];
    } catch {
      // Unparseable probe output confirms nothing — fall through and dismiss,
      // today's behavior and the safe direction on a genuinely refused merge.
    }
  }

  // per_page=100, same one-page read as the execute-time duplicate probes —
  // but here the size is CORRECTNESS, not just spam-avoidance: GitHub pages
  // reviews oldest-first at a default 30, and the dangling approval this
  // fetch exists to find was posted moments ago, so it is chronologically
  // LAST — an unsized fetch of a busy PR (>30 reviews) returned a first page
  // that could not contain it, and the remediation silently dismissed
  // nothing. The residual beyond 100 reviews fails the same silent way; the
  // probes' one-page convention accepts that on the spam side, and a PR
  // carrying 100+ reviews is queued human territory long before this path.
  const listCommand: PrReviewCommand = {
    command: 'gh',
    args: ['api', `repos/{owner}/{repo}/pulls/${pr.number}/reviews?per_page=100`],
    details: `listing #${pr.number}'s reviews to find the ritual's dangling approval`,
  };
  const listed = await exec(listCommand.command, listCommand.args);
  const fetchResult: PrReviewCommandResult = {
    command: listCommand,
    code: listed.code,
    stdout: listed.stdout,
  };
  if (listed.code !== 0) return [probeResult, fetchResult];

  let parsed: unknown;
  try {
    parsed = JSON.parse(listed.stdout);
  } catch {
    return [probeResult, fetchResult];
  }
  if (!Array.isArray(parsed)) return [probeResult, fetchResult];

  const ownDanglingIds = (parsed as RawPrReview[])
    .filter(
      (review) =>
        typeof review === 'object' &&
        review !== null &&
        typeof review.id === 'number' &&
        Number.isInteger(review.id) &&
        review.state === 'APPROVED' &&
        review.body === decision.reasoning,
    )
    .map((review) => review.id as number);

  const remediation: PrReviewCommandResult[] = [probeResult, fetchResult];
  for (const id of ownDanglingIds) {
    const command: PrReviewCommand = {
      command: 'gh',
      args: [
        'api',
        '--method',
        'PUT',
        `repos/{owner}/{repo}/pulls/${pr.number}/reviews/${id}/dismissals`,
        '-f',
        'message=Dismissing this ritual’s own approval: the merge attempt that followed ' +
          'it did not succeed, so this approval no longer honestly vouches for the PR as ' +
          'it now stands. The exact cause was not independently re-verified here — a ' +
          'moved head (--match-head-commit), an unmet branch-protection requirement, or ' +
          'another merge refusal are all possible — so a later pass reviews it fresh ' +
          'rather than relying on this stale approval.',
      ],
      details: `dismissing the ritual's own dangling approval (review ${id}) on #${pr.number}`,
    };
    const { code, stdout } = await exec(command.command, command.args);
    remediation.push({ command, code, stdout });
  }
  return remediation;
}

/**
 * The cross-run twin of {@link remediateDanglingApproval}: that one mops up a
 * dangling approval in the SAME run that minted it (approve landed, pinned
 * merge refused), but a process that dies between the approve and the merge —
 * or a PR whose facts turn it queue-class AFTER a refused merge whose
 * remediation itself failed soft — leaves a stale "policy-green" APPROVED
 * review standing with nobody to dismiss it. A queue-for-human execute posts
 * only a COMMENT, which never supersedes a review, so branch protection would
 * keep counting that stale approval toward a merge nobody re-reviewed — and a
 * DEDUPED request-changes execute returns early without posting the review
 * that would supersede it. So every NON-merge execute sweeps first: any
 * standing APPROVED review whose body {@link isRitualPolicyGreenApprovalBody}
 * recognizes as this ritual's own is dismissed (id a plain integer — it goes
 * into a URL path — never anyone else's review). Fails soft AND silent, the
 * probes' stance rather than {@link remediateDanglingApproval}'s: the sweep
 * is speculative (the common case finds nothing), so a fetch/parse failure
 * returns `[]` and the execute proceeds unchanged — dismissing nothing is
 * today's behavior, the safe direction. `per_page=100`, same one-page read
 * and same residual-beyond-100 acceptance as the dangling-approval fetch.
 */
export async function remediateStalePolicyGreenApprovals(
  pr: PrReviewCandidate,
  decision: PrReviewDecision,
  exec: CliExec,
): Promise<readonly PrReviewCommandResult[]> {
  if (decision.decision === 'merge') return [];

  const listCommand: PrReviewCommand = {
    command: 'gh',
    args: ['api', `repos/{owner}/{repo}/pulls/${pr.number}/reviews?per_page=100`],
    details: `listing #${pr.number}'s reviews to find any stale policy-green approval of the ritual's own`,
  };
  const listed = await exec(listCommand.command, listCommand.args);
  if (listed.code !== 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(listed.stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const staleIds = (parsed as RawPrReview[])
    .filter(
      (review) =>
        typeof review === 'object' &&
        review !== null &&
        typeof review.id === 'number' &&
        Number.isInteger(review.id) &&
        review.state === 'APPROVED' &&
        isRitualPolicyGreenApprovalBody(review.body, pr.number),
    )
    .map((review) => review.id as number);
  if (staleIds.length === 0) return [];

  const remediation: PrReviewCommandResult[] = [
    { command: listCommand, code: listed.code, stdout: listed.stdout },
  ];
  for (const id of staleIds) {
    const command: PrReviewCommand = {
      command: 'gh',
      args: [
        'api',
        '--method',
        'PUT',
        `repos/{owner}/{repo}/pulls/${pr.number}/reviews/${id}/dismissals`,
        '-f',
        'message=Dismissing this ritual’s own stale policy-green approval: a fresh review ' +
          'pass no longer judges this PR policy-green (its current reasoning is posted ' +
          'separately), so this approval no longer honestly vouches for the PR as it now ' +
          'stands — left standing it could satisfy branch protection toward a merge nobody ' +
          're-reviewed. A later pass re-judges the PR from scratch.',
      ],
      details: `dismissing the ritual's own stale policy-green approval (review ${id}) on #${pr.number}`,
    };
    const { code, stdout } = await exec(command.command, command.args);
    remediation.push({ command, code, stdout });
  }
  return remediation;
}
