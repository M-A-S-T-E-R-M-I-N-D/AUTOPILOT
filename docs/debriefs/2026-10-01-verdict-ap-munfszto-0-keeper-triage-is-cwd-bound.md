<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-munfszto-0`: "verify whether KEEPER issue triage runs on repos other than AUTOPILOT" — it never does, so the deprioritize stands; the live gap is on the board side

Board: "VERDICT deprioritize web-mtsylqbd-q2rg8k follow-up: verify whether KEEPER
issue triage runs on repos other than AUTOPILOT — pool: \* labels are seeded only
by this repo's labels.yml (taxonomy-seed deli…" (title truncated by the board
summary). The id's timestamp half (`munfszto`, base-36 milliseconds) decodes to
2026-09-30 04:39:09 +03:00.

The worry behind the follow-up: `gh issue edit --add-label` resolves each name
against the repository's live labels and fails the whole edit on an unknown
one (the same failure `taxonomy-seed.ts` records for `status: needs-format`).
If triage ever accepted an issue on a repository with no `pool: *` labels,
every accept would fail.

## The premise holds

- `.github/labels.json` holds the eight `pool: *` labels.
  `.github/workflows/labels.yml` is the only thing that creates them. It runs
  on a push to this repository's `main` and passes
  `--repo "$GITHUB_REPOSITORY"`, so it only ever seeds AUTOPILOT.
- `flight/taxonomy-seed.ts`'s `HOUSE_TAXONOMY_LABELS` leaves the `pool: *` set
  out on purpose. Its doc comment says that set "already has its own sync
  mechanism".
- No other `gh label create` exists under `apps/dashboard/src`.

## Triage cannot reach another repository

Every `gh` call triage makes runs in the dashboard process's own working
directory:

1. `createIssueTriagePreviewApi` and `createIssueTriageExecuteApi`
   (`flight/issue-triage-execute.ts`) default their exec to `ghExec`, which
   wraps `realCliExec`.
2. `realCliExec` is `makeCliExec()` (`connection/cli-probe.ts`). It passes no
   `cwd` to `execFile`, so each `gh` child inherits the server's.
3. None of triage's argv names a repository. `fetchOpenIssues` runs
   `gh issue list --state open …`, `fetchRepoOwner` runs `gh repo view`, and
   `fetchRepoMilestones` calls `gh api repos/{owner}/{repo}/milestones`, whose
   placeholders `gh` fills from the working directory. The writes address an
   issue by its bare number (`issueRef = String(issue.number)`).
4. `server/main.ts` treats `process.cwd()` as AUTOPILOT's own checkout. It
   self-onboards it (`ensureSelfOnboarded(dbPath, process.cwd())`), and the
   update restart spawns `apps/dashboard/dist/control/cli.js` under it.

This is by design, not by accident. `flight/pr-review-execute.ts`'s header
says "the KEEPER rituals act on the one canonical repo the dashboard process
itself runs in (epic 0007's maintainer autopilot), not a stored project's
`root_path`".

So triage reads and labels AUTOPILOT's issues and nothing else. AUTOPILOT is
the one repository `labels.yml` seeds, so the missing `pool: *` labels
elsewhere cannot fail a triage edit today.

## The live gap: the board half follows the page, the GitHub half does not

Triage's GitHub reads and writes are bound to the process, but its board
reads and writes are bound to the project:

- `web/shell.ts` renders the triage panel on every project page
  (`cachedPanel(pid, 'issue-triage', …)`), and `features/issue-triage.ts`
  asks for `/api/issue-triage?project=<pid>`. Nothing limits it to the
  dashboard's own project.
- Both APIs dedup against that project's open board tasks and backlog file,
  and `runIssueTriageRitual` files accepted issues with
  `applyIssueTriageTasks(store, projectId, …)`.
- The role gate does not help. `resolveSocialIdentity` also reads the
  working directory's repository, so AUTOPILOT's maintainer sees "Run KEEPER
  triage" on every page.

From project X's page, then, triage judges AUTOPILOT's open issues against
X's board, comments on and labels them on AUTOPILOT, and files the accepted
ones onto X's board as `github-<n>` tasks. Once an issue carries a `pool: *`
label, `planIssueTriage` skips it on every later pass, so it never reaches
AUTOPILOT's own board.

The mirror pass already closed this exact gap. `0a6a70b7` made its EXECUTE
apis refuse a project whose `origin` names another GitHub repository
(`'repo-mismatch'` in `flight/mirror-pass-execute.ts`'s
`gateMirrorPassExecute`), and `2bfc27a4` wrapped its previews in
`refuseRepoMismatchedPreview`. In `server/main.ts`, `issueTriage` and
`issueTriageExecute` are the two KEEPER APIs that still go out unwrapped.

This was traced through the source, not run. A real execute would post on
live issues, and a preview needs a second onboarded GitHub project to show it.

## VERDICT

**Deprioritize — confirmed.** Triage never runs `gh` against any repository
but the one the dashboard runs in, and that repository has its `pool: *`
labels. The follow-up's question is answered (no), so it can close on this
evidence.

The `pool: *` gap only becomes live when the open half of epic 0019 S3 (and
S5) lands: making `gh` act on a project's own repository (`--repo` or
`GH_REPO`). That change has to bring the `pool: *` set with it, either from
`taxonomy-seed.ts` or from a per-project labels sync. Otherwise every accept
on the new repository fails at `--add-label`.

The board-side gap above is filed as its own proposal rather than fixed here.
The fix ports the mirror pass's `repo-mismatch` guard to `issue-triage-execute.ts`
and its two routes, and it needs its own test-first slice.

## Verification note for this firing's own METRICS

This unit is this debrief plus the regenerated `docs/debriefs/README.md` index
(`node scripts/docs/generate-debriefs-index.mjs`). Both are documentation
only. The evidence came from read-only source inspection, `git log` on the
cited files, and greps for `gh label create`, `repo-mismatch` and
`refuseRepoMismatchedPreview`. The newest commits touching the triage and
seeder files (`96069e80`, `8b5e73af`) are ancestors of this firing's HEAD, so
the reading matches the tree as it stands.
