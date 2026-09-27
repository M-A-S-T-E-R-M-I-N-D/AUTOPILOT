<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-muj0m9jm-0`: the 134 reverts come down to one missing change, which is already tracked — split refuted

Board: "VERDICT split `inbox-reland-storm-victims-2-md`: 134 non-autoformat
revert commits across history — no single firing can audit this, needs a
tracked multi-slice initiative". This is a VERDICT task: a prior firing's
proposal about another task, not buildable work. Under the VERDICT-processing
protocol, this firing checks the claim against git history and completes this
task with the evidence. It leaves the named task alone.

## What the named task is

The id `inbox-reland-storm-victims-2-md` is an auto-triaged INBOX note
(`reland-storm-victims-2.md`). `INBOX/` is git-ignored, and its `.triaged/`
archive lives in the primary checkout, outside this flight's worktree. So this
firing could not read the note itself. It worked from the scope the verdict
states: every non-autoformat revert in history. The verdict id `muj0m9jm`
decodes (base-36 ms) to 2026-09-26 23:22:56 UTC.

## Where 134 comes from

The number is exact. Take `git log --all --grep='^Revert'` with
`--before=2026-09-26T23:22:56Z` and drop the subjects containing
`autoformat`: that leaves 134. But `--all` walks every ref, and 47 of those
134 are not on the line that lands:

- **35 are pre-genesis history.** They are reachable only from
  `archive/pre-genesis-flight` and the old milestone tags. The 2026-09-03
  genesis squash already replaced all of them.
- **12 are second copies of reverts that are also on the landed line.** 11
  sit on tag `m4`: pre-rewrite copies of the 2026-09-04 burst, with the same
  subjects as the landed copies audited below. 1 sits on
  `refs/autopilot/backup/2026-09-24/*`, the push-protection rewrite's backup
  of `031e12eb`.

That leaves **87** reverts on HEAD's ancestry when the verdict was filed. There
are **90** today: `4637b9ae`, `0212ba4b` and `c862ad6f` landed afterwards. The
landed line has 122 reverts in all, and 32 of them are
`style(autopilot): autoformat — mechanical gate remediation`.

## Method: two read-only passes in one firing

1. **Survival in place.** For each of the 90 reverts, read the reverted
   commit from the revert's body (`This reverts commit …`). Take every added
   line of 25 characters or more. Shorter lines (`}`, bare imports) say
   nothing about which commit they came from. Then count how many of those
   lines still appear in the same file at HEAD.
2. **Symbol search for the rest.** For every commit with less than 80%
   survival, search HEAD's whole tree for the capability's own symbols. Then
   find the commit that brought it back, or the reason it should stay out.

The first try was `git apply --check` of each whole patch, forward and in
reverse. It was dropped because later edits to the same files break the hunk
context: 64 of 90 came back "neither applies nor reverses", which tells you
nothing.

## Result

| Bucket | Reverts | Action needed |
| --- | --- | --- |
| Content present in place (80% or more of the added lines survive) | 42 | none |
| `docs(self-study): flight-end automated data refresh`: generated data that every later refresh overwrites | 11 | none |
| Checked by hand: relanded or reimplemented, capability present at HEAD | 28 | none |
| Checked by hand: superseded, or correctly left reverted | 8 | none |
| **Still reverted, capability absent at HEAD** | **1** | already tracked |

**The 42 present in place:** `0212ba4b` `4637b9ae` `29f76133` `add60482`
`83d96fc1` `3d543f89` `a451d167` `14b5199a` `031e12eb` `855dc294` `aa9f356c`
`726efecd` `5587a876` `92855c90` `139f0071` `19b9b2bf` `08438278` `cd5c46de`
`0d388b54` `6d3283cb` `a9cf9a10` `6fca25c8` `1808e4e4` `3489dcb8` `f960de0c`
`28646e1f` `7726a09d` `a59edc7c` `60abc65a` `810e8df0` `53464890` `06a467d9`
`388f4be9` `23074781` `b75c4919` `b86d77ac` `f542b0af` `d2aefb2d` `c13e4a80`
`82be5ac0` `f9961def` `c027c5a0`. Three of the borderline ones were checked
by symbol as well, and all three hold: the Status filter (`add60482`, 85%)
lives on as `boardChipFieldset`'s `data-task-filter` in `web/shell.ts`. The
Versions panel (`4637b9ae`, 94%) has `versionsJs` and `versionRows`. The
Diagnose button (`5587a876`, 81%) has `checkDiagnosisResult` in
`web/pr-review-panel.ts`.

**The 11 generated refreshes:** `8df4c11e` `3c85da66` `0157e7a3` `a75fd0fd`
`7ce652ab` `79cf8d75` `56bc51e9` `8522ebf5` `c36a7721` `a8ec99d5` `b51beba1`.

**The 37 checked by hand:**

| Revert | Reverted change | Where it stands at HEAD |
| --- | --- | --- |
| `c862ad6f` | Codex CLI ModelPort adapter | reimplemented as `110580e0` + `3488e2f2` (`adapters/codex-cli.ts`) |
| `3cce9056` | report menu: copy-HTML / smart-context drop their emoji | `64694d4a` |
| `697757ec` | report menu: last two copy items drop their emoji | `64694d4a` |
| `cfbfb8ee` | task row detail lists its firings and their cost | `1ed34029` (`taskHistoryOf`, cost included) |
| `22cb8016` | debrief: fleet-4 strand already rescued | relanded, file present |
| `51f53f60` | docs editor split-preview UI | `7e29b659` |
| `dfdfa4e1` | docs editor write-path allow-list guard | `93e6ba47`, `d2ad627c` (`flight/docs-write.ts`) |
| `0700c3ce` | debrief: `ap-mug77xzl-convred` blocked | relanded as `2026-09-25-verdict-ap-mug77xzl-convred-blocked-reland.md` |
| `9c197262` | board→issues export planner | `87f63a1c` (`flight/board-issue-export.ts`) |
| `47d44a99` | fifth Stryker config | `ab3e4e54` |
| `5af5a41c` | SOUL editor summary drops its pencil emoji | `bdbe45a0` |
| `5d613556`, `ec925f55` | diff-approval shell wired into Diagnose | `547c5e96` |
| `37ed90f0`, `b5f4c708` | splice-manifest census gains discussions-triage | present (`generate-splice-manifest.test.ts`) |
| `1d1c6822` | debrief: `ap-mtuks0jm-0` AUTOFORMAT mutex closed | relanded, file present |
| `2cf354f6`, `f7ad97e0` | release guest note in Hebrew | present (`releaseGuestNote`) |
| `e0493b11` | pipeline view switch tooltips | `b586d6cf` |
| `b0a4af0f` | issue-triage preview fixture | `ac41064b` |
| `894d5663` | identity-law disclosure on contribute-upstream PRs | reimplemented (`flight/attribution.ts`) |
| `3a43a567` | `AUTOPILOT_CI_REMEDIATION=board\|fly` lever | present (`control/post-push-verdict.ts`) |
| `b50df9eb`, `b293d02f` | FEATURE-COVERAGE row reconcile | reapplied, `37b42b2e` and `a813042e` |
| `85c653b7` | fly.ts live-lock race guard | `e47fb09a` |
| `9daa34f9` | neutralize @-mentions in KEEPER base-branch text | `74890d9b` |
| `d5fd74bf` | static-site EcosystemDetector | `b3004cf7` |
| `4966c1ae` | `ci:license-check` gate | `4224f6fc` |
| `8f4107fa` | demote a red gate for an isolated hook timeout | superseded by `2aefae19`, which covers any timeout-only run (`TIMEOUT_SIGNATURES` in `adapters/gate.ts`) |
| `5e6a34f3` | debrief: mirror-pass stale-claim button verified | record not relanded; the button it verified is live (`mirrorPassCanExecuteStaleClaim`) |
| `ea775d95` | debrief: CONTRIBUTOR JOURNEY slice 1/4 checkpoint | superseded by the 2026-09-11 all-four-slices debrief |
| `056d38f0` | a seventh reconfirmation appended to the primary-checkout collision debrief | adds no new finding; that file already records the reconfirmations |
| `d6fbc1ff`, `1d71343c` | `docs/SANDBOX.md` and a README "Try it" section | mostly superseded: README "Start here" step 4 points to the scripted $0 demo flight (`scripts/launchers/FLY-DASHBOARD.cmd`), and `dashboard:demo`/`dashboard:flight` still exist. The longer walkthrough (what is real vs. scripted, cleanup) never came back. That is a docs gap, not a lost capability |
| `7f6f6abd` | tick every box in `samples/calculator/MISSION.md` | correctly left reverted: the brief's own header says its checkboxes "reflect SEED time, on purpose" |
| `18fc2068` | a dated line count of `web/shell.ts` in epic 0002 | a snapshot, stale by construction |
| **`96a0f69c`** | **`489fb8eb` cost_unknown: a checkpoint-killed firing stops recording a fabricated $0** | **still absent** (no `cost_unknown` anywhere in the tree) |

## VERDICT

**Refuted.** The audit does fit in one firing: this one did it with two
read-only passes over the 90 landed reverts. Once you drop off-line copies,
generated data and relands, the "tracked multi-slice initiative" comes down
to a single lost capability, `489fb8eb`. That change already has its own board task
(`web-mty1azf9-2we84o`) and its own debrief,
[`2026-09-26-cost-unknown-revert-root-cause-stale-dist-trap.md`](2026-09-26-cost-unknown-revert-root-cause-stale-dist-trap.md).
That debrief gives the root cause and says the reland is safe once
`packages/store/src/schema.ts` is free. As of this firing, that file is still
fleet-6's declared intent. The only other gap is optional docs work, not a
lost capability: the `docs/SANDBOX.md` walkthrough, reverted twice on
2026-09-04. If it is rewritten, it must be checked against today's demo
commands rather than restored word for word. No new slices are proposed. The
named task `inbox-reland-storm-victims-2-md` is left alone, as the protocol
requires. For whoever works it next, these two items are its whole remaining
scope.

Two cautions for anyone who repeats this audit:

- **Never count reverts with `--all`.** The pre-genesis archive, milestone
  tags and rewrite backups make a single landed revert look like two or
  three.
- **Never trust a whole-patch apply check on old commits.** Line survival
  plus a symbol search is what separated "gone" from "moved".

## Verification note for this firing's own METRICS

This firing's unit is this debrief plus the regenerated
`docs/debriefs/README.md` index
(`node scripts/docs/generate-debriefs-index.mjs`). Every audit command was
read-only (`git log`, `git show`, `git grep`, `git apply --check`, which
never writes). The scratch scripts lived in the git-ignored `.tmp-autopilot/`.
Every backtick-quoted SHA above was checked with
`git merge-base --is-ancestor <sha> HEAD`. The commit touches documentation
only.
