<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-mu6lf6ve-4`: board→issues export ritual split confirmed

Board (medium): "VERDICT split `web-mtpzqrw8-dsy6a9`: board→issues export ritual needs the
plan/apply/UI three-slice pattern (shareable flag, ritual planner, HTTP execute+UI) before any
single firing can land it." A VERDICT title is a prior firing's proposal about another task, not
buildable work — this firing's whole unit is processing it: verify the claim against the code it
names, then complete the VERDICT task with the evidence.

## Verification of the claim

1. **`web-mtpzqrw8-dsy6a9` (the board→issues export ritual) has no existing implementation.**
   Repo-wide search for the feature by every plausible name — `board->issues`, `board-export`,
   `export-board`, `issues-export`, `board-issues` (file names) and `shareable` (the flag the
   verdict names) — returns zero hits outside this debrief. There is nothing to build on top of
   and nothing already shipped that would make the verdict stale.
2. **The "plan/apply/UI three-slice pattern" is this codebase's actual, consistent convention for
   every comparable ritual, not a one-off suggestion invented for this verdict.** Every ritual that
   reads GitHub/board state, proposes an action, and executes it behind operator confirmation is
   already split this exact way — a pure planner in `flight/`, a separate HTTP-wired executor, and
   a dashboard panel in `web/features/`:
   - `flight/issue-triage.ts` (planner: `planIssueTriage`/`planIssueTriageCommands`) +
     `flight/issue-triage-execute.ts` (HTTP apply) + `web/features/issue-triage.ts` (panel).
   - `flight/mirror-pass.ts` (planner) + `flight/mirror-pass-execute.ts` (HTTP apply) +
     `web/features/mirror-pass.ts` (panel).
   - `flight/discussions-triage.ts` + `flight/discussions-triage-execute.ts` +
     `web/discussions-triage-panel.ts`.
   - `flight/pr-review.ts` (planner + injectable executor in one file, per its own header) +
     `web/features/pr-review.ts` (panel) — the social-pass style the epic 0016 doc also cites.
   A board→issues export ritual — decide which board tasks are shareable, plan the `gh issue
   create`/`update` commands, then run them only behind a confirm-guarded endpoint with a visible
   UI — is the same shape as all four. Landing it as one undivided unit would mean one firing
   designing a new data-model flag, a dedup-aware planner, an HTTP write path, AND a dashboard
   panel together — strictly more surface than any single slice of the four comparable rituals
   above ever took in one firing.
3. **The three named slices are genuine, independently landable scope boundaries**, matching how
   the comparable rituals above actually split across their own firings (planner-with-tests first,
   HTTP+UI wiring after, per `issue-triage-execute.ts`'s own header: "the pure decision core plus
   its own fetch/apply wiring shipped first, in `issue-triage.ts`"):
   - **Shareable flag** — the data-model bit: which board tasks are marked exportable, and where
     that flag is persisted/read. No GitHub I/O.
   - **Ritual planner** — the pure decision core: which shareable tasks map to which new/updated
     GitHub issue, deduped against already-open issues the same word-Jaccard way
     `issue-triage.ts`/`social-pass.ts` already dedup, testable with no `gh` calls at all.
   - **HTTP execute + UI** — the write path (confirm-guarded endpoint running the planned `gh`
     commands) plus the dashboard panel surfacing the plan for operator approval — the
     UX-EXPRESSION DOCTRINE half no capability here can skip.

## VERDICT

**Confirmed — the split is warranted.** `web-mtpzqrw8-dsy6a9` remains unstarted, and every
comparable ritual in this codebase already proves the combined scope doesn't fit one firing at
this repo's quality bar. The three named slices are concrete and independently verifiable, each
following an established pattern rather than inventing a new one.

## Proposed slices

Filed below via this firing's `PROPOSALS` line for operator approval — this firing proposes, it
does not create board tasks directly:

1. Board→issues export slice 1/3: shareable flag — mark a board task exportable, data model +
   persistence only, no GitHub I/O.
2. Board→issues export slice 2/3: ritual planner — pure `planBoardIssueExport()` deciding which
   shareable tasks map to which new/updated GitHub issue, deduped against open issues the same
   word-Jaccard way `issue-triage.ts`/`social-pass.ts` already dedup.
3. Board→issues export slice 3/3: HTTP execute + UI — confirm-guarded endpoint running the
   planned `gh issue create`/`update` commands, plus a dashboard panel surfacing the plan.

## Verification note for this firing's own METRICS

This firing's unit of work is this debrief file plus the regenerated `docs/debriefs/README.md`
index (`node scripts/docs/generate-debriefs-index.mjs`) — the only paths this firing staged or
touched. Pure documentation: `docs/` is excluded from `prettier --check .` (`.prettierignore`)
and `.md` files are outside ESLint's configured `files` globs, so this adds no source or test
code and `typecheck`/`test`/`build` are structurally unaffected.
