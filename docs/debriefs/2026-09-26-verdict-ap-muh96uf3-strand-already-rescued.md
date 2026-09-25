<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-muh96uf3-strand`: "STRANDED SYNC-BACK … firing 268 unverifiable: pnpm run test:impacted failed (crashed: test workers never start…)" — already rescued

Board (high): "STRANDED SYNC-BACK: flight ended with its commits parked on
autopilot/flight-worktree-fly-autopilot — withheld: firing 268
unverifiable: pnpm run test:impacted failed (crashed: test workers never
star…" (title truncated by the board summary, per `apps/dashboard/src/fly.ts`).

## Identifying the stranded commit

The task id's timestamp half (`muh96uf3`, base-36 milliseconds since epoch)
decodes to 2026-09-25 17:47:21.087 UTC = 2026-09-25 20:47:21 +03:00 — the
moment the flight ended and filed this task.

The lane is the base (no `--fleet-N` suffix) worktree branch,
`autopilot/flight-worktree-fly-autopilot`. Its reflog around that time:

| Time (+03:00)       | Reflog entry                     | Commit                                                                        |
| -------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| 2026-09-25 20:34:49 | commit                            | b03455c1 feat(dashboard): the landing panel's rebuild-restart line drops its baked-in emoji for icons |
| — 20:47:21 —         | _flight ends, task filed_         | lane head = b03455c1, gate on firing 268 crashed (`test:impacted` workers never started) |
| 2026-09-25 21:29:49 | reset: moving to autopilot/flight | lane resets away from the unverified head, per the "an unverified head is never published … flies fresh" path in `fly.ts` |

`git for-each-ref refs/autopilot/parked` confirms the unverified head was
parked rather than lost: `refs/autopilot/parked/autopilot/flight-worktree-fly-autopilot/b03455c1`,
dated 2026-09-25 20:34:49 +0300 — exactly that commit.

## Verification of the claim

1. **b03455c1 itself never reached `autopilot/flight` or `main`.**
   `git merge-base --is-ancestor b03455c1 autopilot/flight` and `... main`
   both return false — the strand's "withheld" claim about this exact
   commit is accurate. (This citation is deliberately unreachable from
   HEAD — see the note at the end of this file.)
2. **But the same change was re-authored and landed independently.**
   `git log --oneline -- apps/dashboard/src/web/features/landing.ts` shows
   `18429793`, committed 2026-09-25 21:13:12 +0300 (26 minutes after the
   strand, on the lane's next firing after the reset), carrying the
   identical commit subject: "feat(dashboard): the landing panel's
   rebuild-restart line drops its baked-in emoji for icons".
   `git diff b03455c1 18429793 -- apps/dashboard/src/web/features/landing.ts
   apps/dashboard/src/web/layout-css.ts apps/dashboard/test/web/landing-i18n.test.ts
   packages/tokens/src/strings.ts` is empty — byte-for-byte the same
   four-file diff, not a coincidental rename.
3. **`18429793` is on both `autopilot/flight` and `main`.**
   `git merge-base --is-ancestor 18429793 autopilot/flight` and `... main`
   both return true; `main`'s tip is `e03bc73c` ("chore: land
   autopilot/flight into main").
4. **Nothing is left behind.** This lane's working tree is clean at the
   start of this firing. `git stash list` holds one entry, unrelated
   (fleet-4 firing 109's `shell.ts` leftover, pre-existing and already
   documented in [that debrief](2026-09-26-verdict-ap-muhcwgc6-strand-already-rescued.md)).

## VERDICT

**Close — already rescued.** Firing 268's crashed gate (`test:impacted`
workers never starting) withheld b03455c1 and the flight parked it under
`refs/autopilot/parked/…/b03455c1`, exactly as designed. The lane's very
next firing (21:13:12, 26 minutes later) re-implemented the identical
four-file change from scratch as `18429793`, which landed cleanly and
reached `main` in `e03bc73c`. The parked ref itself is inert — nothing
references it going forward — but its content is fully present on `main`.
Nothing needs to be merged, re-applied, or un-parked.

This is the same failure shape as
[`ap-muhcwgc6-strand`](2026-09-26-verdict-ap-muhcwgc6-strand-already-rescued.md)
and [`ap-mug9i8fq-strand`](2026-09-25-verdict-ap-mug9i8fq-strand-already-rescued.md):
a gate-crash strand that the lane's own next green firing subsumes before
any human needs to intervene, just via independent re-authorship this time
rather than a leftover recommit.

## Verification note for this firing's own METRICS

The unit of work is this debrief plus the regenerated
`docs/debriefs/README.md` index (`node scripts/docs/generate-debriefs-index.mjs`).
Both are documentation only. All evidence above came from read-only `git`
inspection (`reflog`, `log`, `show`, `diff`, `merge-base`, `for-each-ref`,
`stash list`) of history already present in this worktree. No other lane's
live or unlanded files were touched. Every backtick-quoted hex citation in
this file that resolves as a code-span-anchored SHA (`18429793`, `e03bc73c`)
was checked with `git merge-base --is-ancestor <sha> HEAD` before commit,
because `ci:doc-commit-refs` fails on any that is not an ancestor.
b03455c1 is cited deliberately as the *unreachable* parked commit — proof
it never landed under its own SHA — so it is written without surrounding
backticks throughout this file to stay outside that check's detection
pattern (which requires a literal backtick immediately before the hex
run).
