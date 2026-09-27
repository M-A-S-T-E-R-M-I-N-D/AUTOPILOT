<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Closing `inbox-reland-revert-victims-md`: all four 03:18 revert-burst victims were relanded on 2026-09-07

Board: "OPERATOR DIRECTIVE — reland the 03:18 revert-burst victims". The
directive names four units that the 2026-09-07 03:18:26–28 revert/reapply
burst discarded (see the firing-179 entry of
[`2026-09-06-red-main-revert-cascade.md`](2026-09-06-red-main-revert-cascade.md)),
and asks for each one to be cherry-picked back, verified against the current
tree, one unit per commit. This firing set out to do that and found the work
already done. All four were relanded the same morning, one commit each, and
all four are on HEAD's ancestry today. Nothing is left to reland, so this
firing records the evidence and completes the task.

The board shows the note cut at 1000 characters (it stops at "Precondition:
the FOCU…"). The note itself is retired: `INBOX/` in this worktree holds only
its README, and the `.triaged/` archive lives in the primary checkout, outside
this flight's containment. The precondition could not be read. It does not
matter here, because no reland is left to gate on it.

## The directive's SHAs are pre-rewrite copies

The four SHAs in the directive (40ae0568, 3e1613f8, efe39fe5, e0af33b0) are
not ancestors of HEAD, and no ref contains them. They still sit in the local
object store, but a fresh clone will not have them. A later history rewrite
gave these commits new SHAs, and the directive was written against the old
ones. Not even the `refs/autopilot/backup/2026-09-24*` refs contain them. The
cascade debrief's burst listing quotes pre-rewrite SHAs for the same reason.
That is why they are written here in plain text, not as citations.

`git patch-id --stable` matches each one to its landed-line copy exactly:

- 40ae0568 → `763edde6`, the autoformat commit that carried the Code of
  Conduct content.
- 3e1613f8 → `a45c1421`, the static-site gate detector.
- efe39fe5 → `59c2784b`, the launcher smoke CI.
- e0af33b0 → `7deff3d8`, the compose-to-tasks execute wiring.

## Where each victim stands at HEAD

**1. Code of Conduct Enforcement Guidelines (issue #6).** The landed line
shows `763edde6` (03:17:41), then revert `0b18b914`, reapply `92f4caae` and
revert `180058ba`, all within 03:18:26–27. The reland is `d9a0162c` (07:48),
titled "docs(conduct): reland the Enforcement Guidelines ladder (issue #6)".
Its patch-id equals `763edde6`'s. The directive worried that the autoformat
commit had bundled unrelated formatting, and asked for the CoC content only.
There was nothing to separate: `763edde6` touches exactly one file,
`.github/CODE_OF_CONDUCT.md` (+47), and so does the reland. At HEAD, all 25
of its substantive added lines are present. `## Enforcement Guidelines` sits
at line 59, followed by the four-step ladder: Correction, Warning, Temporary
Ban, Permanent Ban.

**2. Static-site gate detector (issue #5 groundwork).** The original is
`a45c1421`, reverted by `b75c4919`. The reland is `b3004cf7` (07:48), and its
patch-id equals `a45c1421`'s. At HEAD, every added line of the six code and
test files is present: `detect.ts` 1/1, `detectors/index.ts` 1/1,
`detectors/static-site.ts` 23/23, `types.ts` 1/1, `detect.test.ts` 12/12 and
`detectors/static-site.test.ts` 36/36. Only the `samples/README.md` hunk
reads 0/10, and that is supersession, not loss. The hunk described a
detector with "no fixture repo yet". Today's row for `samples/static-site/`
is marked **Verified**, because the fixture has since been built and flown.

**3. Launcher smoke CI (the PR-#20 lesson).** The original is `59c2784b`,
reverted by `23074781`. The reland is `07d0265e`, cherry-picked at 06:19 with
its original author date kept. Its patch-id differs from `59c2784b`'s only
because the `package.json` context around the inserted
`ci:launcher-smoke` script line moved. The changed lines themselves are
identical. At HEAD, the `ci.yml` step (2/2) and the `package.json` script
(1/1) are present. `scripts/ci/launcher-smoke.mjs` reads 93/115, and the
other 22 lines were refactored, not lost. `4c76d47f` (+137/−89) split them into
exported, mutation-testable functions (`discoverShLaunchers`,
`assertManifestCovers`, `scenariosFor`, `checkScenario`), and
`apps/dashboard/test/tooling/launcher-smoke.test.ts` now holds 31 tests for
them. Before that, `e17062c8` and `5168a29f` added launchers to the manifest,
and `dfee7239` hid the console window on its spawns. `ci:launcher-smoke` is
one of today's gate steps.

**4. Compose-to-tasks execute wiring.** The original is `7deff3d8`, reverted
by `388f4be9`. The reland is `3f078fee` (07:48), and its patch-id equals
`7deff3d8`'s. `applyComposedTasks` is present in
`apps/dashboard/src/flight/report-compose-tasks.ts`. The source reads 46/53
and the test 48/50. Every missing line traces to `cad921de` (the dated
provenance note). The source misses are the "Still no UI entry point…"
sentences in two doc comments (the module's and `applyComposedTasks`'s).
`cad921de` kept the words but re-wrapped them inside longer comments, so the
line-level match misses them. The two test
misses are one test that `cad921de` renamed to "carries the
title/severity/dimension through to the board row, body prefixed verbatim"
and tightened.

## Verified against the current tree, this firing

- `vitest run` on `packages/onboarding/test/gate/detectors/static-site.test.ts`,
  `packages/onboarding/test/gate/detect.test.ts`,
  `apps/dashboard/test/flight/report-compose-tasks.test.ts` and
  `apps/dashboard/test/tooling/launcher-smoke.test.ts`: 4 files, 113 tests,
  all green.
- `pnpm run ci:launcher-smoke`: every manifest launcher OK, the check ends
  with `launcher-smoke OK`.

## Method

For each landed-line original, take every added line of 25 characters or
more (trimmed), and count how many still appear in the same file at HEAD.
This is the survival measure the
[reland-storm verdict debrief](2026-09-27-verdict-ap-muj0m9jm-0-reland-storm-victims-split-refuted.md)
used. Every miss was then traced with `git log -S` or by reading the file,
until it resolved to a later deliberate edit.

## Outcome

Nothing to reland. The directive's four units are all present, all gated,
and each came back in its own commit, as the directive asked. The task
`inbox-reland-revert-victims-md` is complete with this evidence.
