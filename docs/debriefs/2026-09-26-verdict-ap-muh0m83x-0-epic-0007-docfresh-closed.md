<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-muh0m83x-0`: epic 0007 doc-freshness proposal closed — for a different reason than stated, and the doc has drifted again since

Board (low): "VERDICT close docfresh-docs-epics-0007: already current, post-refresh code changes
outside doc scope". A VERDICT title is a prior firing's proposal about another task, not buildable
work. This firing's whole unit is processing it: check the claim against the git history it rests
on, then complete the VERDICT task with the evidence.

## What the proposal was keyed to

`computeDocDrift` (`apps/dashboard/src/flight/doc-freshness.ts:225-249`) flags a doc when one of its
tracked subjects has a newer commit than the doc itself. The proposal id is the doc's slug followed by
the epoch-ms of the newest stale subject (`docFreshnessTaskId`, `doc-freshness.ts:268-270`). Epic
0007 tracks eleven subjects (`doc-freshness.ts:67-80`). Only one of them, `flight/pr-review.ts`, was
touched after the doc's pool-client refresh `a3b58a8e` (2026-09-25 01:40:26 +0300):

| Commit | Time (+0300) | What it changed in `pr-review.ts` |
| --- | --- | --- |
| `d0b985c9` | 09-25 02:26 | adds the `flight/convergence-red-task.ts` security marker |
| `9d7d14e3` | 09-25 03:15 | adds the `flight/docs-write` security marker |
| `3bcb2fa1` | 09-25 04:07 | JSDoc: the workspace-package census now sweeps `packages/docs-links/src` |

The verdict's id decodes to 2026-09-25 13:47:22 UTC (16:47 +0300). At that moment the newest stale
subject was `3bcb2fa1`, so the proposal was the one suffixed 1790298477000 (that commit's time in
epoch-ms).

## Verification of the claim

1. **"Outside doc scope" was wrong for the commit that keyed the proposal.** `d0b985c9` and
   `9d7d14e3` are outside the doc's scope: the doc names neither marker, and neither file belongs to
   the maintainer or pool rituals. `3bcb2fa1` was in scope, though. Slice 4 of the epic lists every
   workspace package that the security census sweeps, and `docs-links` was missing from that list.
2. **The close is right anyway, because a later commit fixed the drift.** Nine minutes after the
   verdict was filed, `6daa85df` (2026-09-25 16:56:33 +0300) added `packages/docs-links/src` to that
   census list (`docs/epics/0007-platform-maintainer-and-pool.md:439-445`). Its message says it
   "Fixes DOC-FRESHNESS … stale against … pr-review.ts … (commit 3bcb2fa1)". With the doc newer than
   `3bcb2fa1`, the drift behind proposal 1790298477000 is resolved.
3. **The retire path covers it.** `findStaleDocFreshnessProposalIds` (`doc-freshness.ts:285-291`)
   returns every open proposal whose id no longer matches a current finding. The next post-flight
   sweep then defers it (`post-flight-sweeps.ts:302-314`), so this needs no code change.

## The doc has drifted again, and one of the new changes is in scope

Three more `pr-review.ts` commits have landed after `6daa85df`, so the sweep reports epic 0007 as
stale again, now keyed to the newest of them:

| Commit | Time (+0300) | Marker added | In the doc's scope? |
| --- | --- | --- | --- |
| `a147ee6d` | 09-25 21:20 | `engine/src/adapters/retry-loaded-gate.ts` | No: gate adapter, same class as the other gate adapters the doc does not name |
| `888b4fea` | 09-26 00:00 | `flight/model-scoreboard.ts` | No: fleet model staffing |
| `87f63a1c` | 09-26 00:51 | `flight/board-issue-export` | **Yes** |

The doc names 36 of the 143 `SECURITY_SENSITIVE_PATH_MARKERS` entries. They are the maintainer and
pool rituals' own files plus repo-wide config, and it skips unrelated ones (`convergence-red-task`,
`docs-write`, `lane-head`, `human-merge`, `model-scoreboard` and the rest). `board-issue-export` falls
inside that scope. It plans public `gh issue create` and `gh issue edit` calls that turn shareable
board tasks into `help wanted` issues, which is the contributor pool this epic describes
("the pool IS the canonical repo's issue tracker", `0007…md:67-76`). It is also the same
decide-and-apply class the doc already records for `flight/mirror-pass` and
`flight/owned-work-reconcile` (`0007…md:742-747`).

This is a new finding, not the one the verdict names. It will be handled without anyone reopening
this verdict. Each sweep mints before it prunes, and the mint is skipped while any open proposal for
the doc exists (`post-flight-sweeps.ts:279`). So the next sweep defers proposal 1790298477000, and
the sweep after that mints a fresh proposal keyed to `87f63a1c`.

For the firing that picks that up, the fix is one clause in slice 4's "shipped so far" list, right
after the `owned-work-reconcile` entry (`0007…md:742-747`). It should name the `board-issue-export`
security marker with the same reason given in `87f63a1c`: it decides which shareable board tasks
become a new public `gh issue create` or an in-place `gh issue edit`. `a147ee6d` and `888b4fea`
need no doc change.

## VERDICT

**Confirmed: close.** The drift behind the named proposal (`3bcb2fa1`) was fixed by `6daa85df`, and
the existing prune path will retire it. The verdict's reason was only half right: `3bcb2fa1` was in
the doc's scope, and the doc became current because a later firing updated it, not because the
change was out of scope. The doc is not current today. `87f63a1c` is new, in-scope drift, and the
sweep will propose it under its own id.

## Verification note for this firing's own METRICS

This firing's unit is this debrief plus the regenerated `docs/debriefs/README.md` index
(`node scripts/docs/generate-debriefs-index.mjs`). It changes no source or test code. The epic
doc itself is left alone, because the verdict is this firing's unit and the task it names is not.
