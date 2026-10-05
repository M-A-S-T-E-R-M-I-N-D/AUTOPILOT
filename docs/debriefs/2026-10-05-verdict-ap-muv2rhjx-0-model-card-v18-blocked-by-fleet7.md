<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-muv2rhjx-0` and `docfresh-docs-model-card-md-1791193730000`: `docs/MODEL-CARD.md` §6 really is one version behind, but a parked lane's unlanded head blocks the edit this firing

Board: "DOC-FRESHNESS: docs/MODEL-CARD.md §6 'Firing-Prompt-Version (current)' row
still reads firing-v17 after 127d55ab bumped FIRING_PROMPT_VERSION to firing-v18"
and "DOC-FRESHNESS: docs/MODEL-CARD.md may be stale — packages/engine/src/prompt.ts
changed more recently" — two rows naming the same gap.

## Verifying the drift

`packages/engine/src/prompt.ts:156` reads `export const FIRING_PROMPT_VERSION =
'firing-v18';`, bumped today by `127d55ab` ("feat(engine): firing-v18 — a board
unit's intent names its row, so a sibling's claim can skip it"). `docs/MODEL-CARD.md:106`
still reads `| Firing-Prompt-Version (current) | \`firing-v17\` |`, and its own
"last reviewed" row (`:112`) says `2026-10-04` — one day before the bump. Both board
rows describe a real, current gap, not a phantom: unlike the clock-artifact closes in
`2026-09-29-docfresh-model-card-lane-revert-phantom-closed.md`, there is an actual
`firing-v17` → `firing-v18` + review-date edit owed here.

## Why no edit lands this firing

This round's FLEET data lists `autopilot/flight-worktree-fly-autopilot--fleet-7` as
"parked, not flying — claims nothing" but with `unlanded: docs/MODEL-CARD.md`.
Checking it directly:

```
git log main..autopilot/flight-worktree-fly-autopilot--fleet-7 --oneline --name-only
09bb4f47 wip(autopilot): checkpoint — firing 141 died mid-unit; next firing resumes it
docs/MODEL-CARD.md
```

`git show 09bb4f47 -- docs/MODEL-CARD.md` touches the exact same §6 block this task
names — `firing-v12` → `firing-v15` and the review-date row (`2026-09-03` →
`2026-09-19`) — dated 2026-09-19, three weeks stale on its own terms now. Per
`docs/RUNBOOK.md` §"A lane parked with an unverified head", a `wip(autopilot):
checkpoint` commit is an unfinished unit that was never gated or published; the head
only gets moved aside (off the live branch, onto `refs/autopilot/parked/...`) "at the
lane's next launch". Fleet-7 has not had that next launch yet this round, so the head
still sits live on its branch, unverified.

This flight's operating rules treat a sibling's unlanded file exactly like a live
touch: "picking the same file means a collision at landing time." Editing §6 here
would land a second, independent diff over the same two rows fleet-7's ungated
checkpoint already queued, risking exactly that collision whenever fleet-7 next flies
or its head is hand-recovered. This is not new for this file — the 2026-09-29 debrief
hit the identical block for the identical reason ("A sibling lane's unlanded
checkpoint also names the file") and left the card alone rather than editing around
a parked head.

## VERDICT

**Blocked, not close.** The content is genuinely one version stale, so neither board
row is a phantom — but the fix has to wait for fleet-7's parked head to clear: either
moved aside at its next launch (per the RUNBOOK, after which the live branch no longer
carries it) or recovered and landed by hand. Re-editing §6 now would compound with
content already queued for the same two rows. Recommend leaving both rows open for the
firing that finds fleet-7's head already moved aside or landed — that firing can make
the one-line `firing-v17` → `firing-v18` + review-date bump cleanly.

## Verification note for this firing's own METRICS

This is a docs-only unit: the debrief above plus the regenerated
`docs/debriefs/README.md` index (`node scripts/docs/generate-debriefs-index.mjs`).
`docs/` is excluded from `prettier --check .` (`.prettierignore`) and from ESLint's
configured `files` globs, so `typecheck`/`build`/`test:impacted` are structurally
unaffected; `pnpm run ci:doc-links` and `pnpm run ci:doc-commit-refs` were run directly
against the new file. No claimed or unlanded sibling file (`docs/MODEL-CARD.md`
itself, `docs/RUNBOOK.md`, any fleet-3/4/5 touch) was edited.
