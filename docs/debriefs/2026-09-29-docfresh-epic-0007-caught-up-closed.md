<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Closing `docfresh-docs-epics-0007-platform-maintainer-and-pool-md-1790544798000`: the epic caught up to its subject the same day

Board: "DOC-FRESHNESS: docs/epics/0007-platform-maintainer-and-pool.md may be stale —
apps/dashboard/src/flight/pr-review.ts changed more recently". The id's suffix is the subject's
last-touch time the sweep saw, 1790544798000 ms. That is `dbe57b94` (2026-09-28 00:33:18 +0300,
"a stranded-work task names its head and closes itself once that head lands"). This firing set out
to refresh the epic and found it already refreshed. So it records the evidence and closes the task.

## The drift was real, and it was fixed

`dbe57b94` added one entry to `pr-review.ts`'s `SECURITY_SENSITIVE_PATH_MARKERS`:
`'flight/strand-tasks.ts'`, with a comment on why a PR widening what counts as landed is
security-sensitive. At that moment the epic's newest touch was `2bd54988` (2026-09-27 19:53), so
the epic really was behind.

`600fa3cc` (2026-09-28 15:51:15) caught it up. Its status line moved to 2026-09-28, and the
epic's census of the marker list gained the strand-tasks entry and its reason (slice 4, the paragraph
beginning "the strand-tasks security marker"). That is the content `dbe57b94` changed, and the
only content.

## At HEAD

- `git diff dbe57b94 HEAD -- apps/dashboard/src/flight/pr-review.ts` is empty.
- `git diff 600fa3cc HEAD -- docs/epics/0007-platform-maintainer-and-pool.md` is empty.
- The drift check, recomputed with the same `git log -1 --format=%ct` lookup that
  `gitLastTouchedAt` uses, gives the epic 1790599875 (`600fa3cc`). Its eleven subjects in
  `DOC_SUBJECTS` (`apps/dashboard/src/flight/doc-freshness.ts`) all come out older. The newest is
  `pr-review.ts` at 1790544798 (`dbe57b94`), and the rest date from 2026-09-09 to 2026-09-27. So
  there is no finding for the epic.

## Why the row did not retire itself

`600fa3cc`'s message expected the next sweep's prune to retire this row. The prune only defers
rows still in `needs_approval`, and this one is on the board, so a firing has to close it. The
[MODEL-CARD close](2026-09-29-docfresh-model-card-lane-revert-phantom-closed.md) earlier today
records the same limit and already noted that this row was caught up. It left the row for its own
close.

## Left alone

- **The epic itself.** No content change is warranted. A sibling lane (fleet-4) also has an
  unlanded edit to its slice-3 ledger.
- **The sweep.** Leaving approved rows to the operator is the prune's stated design
  (`apps/dashboard/src/flight/post-flight-sweeps.ts`), and fleet-3 holds the detector
  (`ap-mularw4d-0`).

## Outcome

Nothing to refresh. The epic has recorded `dbe57b94`'s `pr-review.ts` change since `600fa3cc`,
and neither file has moved since. The task
`docfresh-docs-epics-0007-platform-maintainer-and-pool-md-1790544798000` is complete with this
evidence.
