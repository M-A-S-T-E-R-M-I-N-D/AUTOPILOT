<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Closing `docfresh-docs-model-card-md-1790532386000`: the drift was a 51-minute revert window on autopilot/flight, relanded byte for byte

Board: "DOC-FRESHNESS: docs/MODEL-CARD.md may be stale — packages/engine/src/prompt.ts
changed more recently". The id's suffix is the subject's last-touch time the sweep saw,
1790532386000 ms (2026-09-27 21:06:26 +0300). This firing set out to refresh the card and found
nothing to refresh. The card was last reviewed against the exact `prompt.ts` that HEAD carries,
and the drift check reports nothing for it at HEAD. So this firing records the evidence and
closes the task.

## Where the suffix comes from

No commit in HEAD's default `git log -- packages/engine/src/prompt.ts` has that time. The newest
one there is `7ec08105` (19:46:35, "an inbox task's note rides its board row"), and
`d97fc456` (20:57:02) already reviewed the card against it.

`git log --full-history` finds the commit. It is `5780614b`, the diff-size gate's revert of
`a5e156a8` ("chore: merge autopilot/flight into fleet-5 lane, rescuing the stranded
license-check fix"). The revert touched 27 files on the fleet-5 lane. In `prompt.ts` it put back
the text from before `7ec08105` (+2/−35).

One second later, `b3518be0` synced the fleet-5 lane into autopilot/flight. At `b3518be0`:

- `git log -1 --format=%ct -- packages/engine/src/prompt.ts` returns 1790532386. The merge
  takes `prompt.ts` from its second parent, so the default walk follows the lane down to the
  revert.
- The same lookup for `docs/MODEL-CARD.md` returns 1790531822 (`d97fc456`).
- `git diff 7ec08105^ b3518be0 -- packages/engine/src/prompt.ts` is empty, so autopilot/flight
  really did carry the pre-inbox-note prompt.

That is the finding `computeDocDrift` reported and the id `docFreshnessTaskId` minted
(`apps/dashboard/src/flight/doc-freshness.ts:237-282`). The drift was real at that ref.

## The reland closed the window

`f8cf80bf` (21:57:16, "fix: reland main's work that a lane revert stripped from
autopilot/flight") put `prompt.ts` back. `git diff 7ec08105 f8cf80bf --
packages/engine/src/prompt.ts` is empty. The card and its subject disagreed for 50 minutes and
50 seconds, and the flight-end sweep ran inside that window.

## At HEAD

- `git diff 7ec08105 HEAD -- packages/engine/src/prompt.ts` is empty.
- `git diff d97fc456 HEAD -- docs/MODEL-CARD.md` is empty. `d97fc456` is the card's review of
  `7ec08105`. Its message records that the change added a data-conditional note line and no
  static prompt text, so it needed no prompt-version bump, and §6 already read `firing-v17`.
- The card's other subject, `packages/store/src/eval-gate.ts`, was last touched by `f6a2829f`
  (2026-09-03).
- The drift check, recomputed at HEAD with the same `git log -1 --format=%ct` lookup that
  `gitLastTouchedAt` uses, gives the card 1790531822, `prompt.ts` 1790527595 and `eval-gate.ts`
  1788468250. Both subjects are older than the card, so there is no finding.

The card has nothing to catch up to. It was reviewed against the same `prompt.ts` bytes that
HEAD carries.

## Why the row did not retire itself

`runDocFreshnessSweep` defers a docfresh row once no current finding matches its id, but only
while the row is still `needs_approval`
(`apps/dashboard/src/flight/post-flight-sweeps.ts:300-321`). Once a row is approved onto the
board, the sweep leaves its fate to the operator. This row is on the board, so a firing has to
close it. The
[2026-09-25 close](2026-09-25-verdict-ap-muh6hfu0-0-model-card-docfresh-closed.md) expected the
prune to retire its row, which only holds while a row still awaits approval.

## Left alone

- **The card itself.** No content change is warranted. A sibling lane's unlanded checkpoint also
  names the file.
- **The detector.** This is the third firing in four days spent on a MODEL-CARD doc-freshness
  row (`d2bebb43`, `d97fc456`, and this one). This row is a clock artifact, not a content change:
  a revert and its reland net to zero bytes, but they still move the subject's last-touch time. The fix belongs to the detector, which fleet-3 has claimed
  (`ap-mularw4d-0`: `computeDocDrift` compares commit clocks). This debrief is a concrete
  witness for that task.
- **Epic 0007's row** (`docfresh-docs-epics-0007-platform-maintainer-and-pool-md-1790544798000`)
  is caught up as well. Its suffix is `dbe57b94`'s touch of `pr-review.ts` (2026-09-28 00:33:18),
  and `600fa3cc` (15:51:15 the same day) caught the epic up to it. `git diff dbe57b94 HEAD --
  apps/dashboard/src/flight/pr-review.ts` is empty, and the drift check reports nothing for the
  epic at HEAD. That row is left for its own close, one board task per firing.
- Across all 17 tracked docs, the only live drift at HEAD is
  `docs/epics/0015-cockpit-supervisory-control.md`, behind `scripts/cockpit-metrics.mjs`
  (2026-09-06). It has no row on this firing's board.

## Outcome

Nothing to refresh. The drift the id names existed only between `5780614b` and `f8cf80bf`, and
HEAD's card and subjects match what `d97fc456` reviewed. The task
`docfresh-docs-model-card-md-1790532386000` is complete with this evidence.
