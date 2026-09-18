<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Mutation debt — the inventory, and the plan to clear it

Operator directive, 2026-09-16: **everything green, everything at 100%.**

`config/mutation/` holds 106 per-module Stryker configs (103 when this
document was opened; three more on 2026-09-18, see below), each with
`thresholds: { break: 100 }`. That is a real gate: one surviving mutant
fails the nightly workflow. This document is the standing record of what
still survives, why, and what is being done about it.

## How this debt accumulated unseen

The nightly workflow ran past its 180-minute job timeout every night from
**2026-09-04 to 09-12** and ended `cancelled` each time. Nobody had seen a
finished run in over a week, so nothing reported the shortfall. Sharding it
six ways (2026-09-13) made it complete — and it has failed every night
since, which is the workflow working, not the workflow breaking.

## The measurement (run 35087921394, main, 2026-09-16)

**347 unique surviving mutants across 36 files**, 43 of 103 configs red.
Median config score 92.31%; worst 62.71%.

By mutator — and this is the number that sets the strategy:

| Count | Mutator | Ordinarily killable? |
|---:|---|---|
| 112 | ConditionalExpression | yes — an unexercised guard clause |
| 78 | StringLiteral | yes — message text nothing asserts |
| 32 | MethodExpression | yes — a dropped `.trim()`/`.sort()` |
| 31 | Regex | hard — needs an adversarial input |
| 28 | LogicalOperator | yes — `&&`/`||` boundary |
| 17 | ArrayDeclaration | yes |
| 15 | EqualityOperator | yes — an off-by-one boundary |
| 9 | BooleanLiteral | yes |
| 7 | OptionalChaining | usually |
| 20 | everything else | mixed |

**Regex mutants are 9% of the total, not the bulk.** An earlier read of
this debt claimed otherwise; that was true of `guard.ts` in isolation
(22 of its 41) and false of the suite. The great majority are ordinary
assertion gaps — a guard clause no test enters, an error message no test
reads — which is why 100% is a reasonable target rather than a wish.

Top files, which carry 63% of the debt between them:

| Survivors | File |
|---:|---|
| 58 | `packages/engine/src/adapters/git.ts` |
| 42 | `packages/engine/src/guard.ts` |
| 35 | `packages/engine/src/prompt.ts` |
| 24 | `packages/engine/src/adapters/claude-cli.ts` |
| 24 | `packages/engine/src/firing.ts` |
| 20 | `apps/dashboard/src/read/fleet.ts` |
| 17 | `packages/engine/src/adapters/worktree.ts` |

## The rules this work follows

1. **Kill it with a real test, or justify it in writing.** A surviving
   mutant is closed one of two ways: an assertion that fails when the
   mutant is active, or an inline `// Stryker disable next-line <mutator>`
   carrying a sentence on why the mutant is genuinely equivalent. The
   precedent is `packages/store/src/rank.ts`, which already does the
   second — deliberately, instead of loosening a threshold.
2. **Never lower a threshold to make a number green.** A threshold change
   turns a red signal green without changing anything true. If a bar is
   genuinely wrong it gets argued on its merits, in front of the operator,
   not edited quietly under deadline.
3. **A test must assert behaviour, not shape.** The point of killing a
   mutant is the assertion it forces, and an assertion that exists only to
   satisfy Stryker is worse than the survivor it removed. Where a mutant
   points at behaviour nobody wants, the answer is usually to delete the
   dead code.
4. **Static mutants are out of scope.** `ignoreStatic: true` is set on
   every config — Stryker's own term for a mutant "only executed during
   the loading of a file", which no test can reach. This removed 3 of the
   46 failing configs; it is not a general excuse, and the remaining 43
   are real.

## Progress

| Module | Was | Now | Notes |
|---|---:|---:|---|
| `packages/store` (`schema.ts`, `rank.ts`) | 34.17% | **100%** | 78 static scoped out; two real gaps closed — the contiguity error's `join` separator, and versions declared out of order |
| `packages/onboarding` secret-guard | 99.01% | **100%** | one static mutant |
| `packages/engine/src/guard.ts` | 93.9% | 93.25% | the survivor in the new bundled-flag helper is killed; 41 remain |
| `packages/engine/src/adapters/git.ts` | 87.61% | **93.30%** | 60 → 42 survivors; **no-coverage 31 → 3** (`pushBranch`, `dirtyPaths`) |

### Session tally — 2026-09-17

Configs taken to 100% this session, by what it took. The mutant counts are
the sweep's own figures for each config before the work.

| How it was closed | Configs |
|---|---|
| Pointed at the module's own tests (instrument error, no test written) | `tokens-color` (22 of 26), `dashboard-narrator` |
| Crashed on every nightly, testing nothing; fixed the sandbox import | `dashboard-verify-by`, `dashboard-worktree`, `dashboard-triage`, `dashboard-ask`, `dashboard-doc-freshness`, `dashboard-lock` |
| Platform-dependent arms made provable on every OS | `dashboard-connection-config` (62.71%), `engine-gate`, `dashboard-paths` |
| Real assertions on load-bearing code | `engine-github-sync`, `dashboard-runner`, `dashboard-spawn-flight`, `dashboard-completion`, `engine-release`, `engine-loop`, `engine-stream`, `dashboard-registry`, `onboarding-detectors`, `dashboard-fleet`, `engine-worktree`, `engine-landing`, `engine-remediating-gate`, `dashboard-live-firing`, `dashboard-flight-summary`, `engine-diff-size-gate`, `engine-ask`, `engine-auth`, `dashboard-service`, `dashboard-reconcile`, `dashboard-watchdog`, `dashboard-gate-commands`, `dashboard-anomalies`, `onboarding-soul`, `engine-guard-hook`, `engine-telemetry`, `dashboard-cli-probe`, `engine-firing`, `engine-claude-cli` |
| Contract prose pinned whole instead of sampled | `engine-prompt` (36), `engine-guard` (47, with the hook-payload guards handed malformed payloads) |
| Inline parsers made exports and fed crafted input; the subprocess seam spied on for the command sequence | `engine-git` (44) |

Three patterns recurred often enough to name:

- **A surviving mutant that points at redundant code is answered by deleting
  the code.** `doc-freshness`, `lock`, `worktree` and `live-firing` each had a
  guard that reached the same result one line later; the second copy is gone
  rather than excused.
- **JavaScript's `null + n === n` makes any single null check before an
  addition unobservable.** `telemetry`'s null-safe sum went through two
  spellings that each hid equivalent mutants behind that coercion before the
  null decision was separated from the arithmetic outright.
- **Mutant locations are ranges over the report's own source snapshot.** Read
  the column, and confirm a new test fails against the hand-applied mutant
  before trusting it — twice this session a passing test killed nothing.
- **Prose that IS the contract gets pinned whole, not sampled.** The firing
  prompt's FLEET section had eighteen lines of sibling discipline that could
  each be blanked unseen, because the test sampled a few with `toContain`.
  The same held for `finishLinePrompt` and four guard denial reasons. A
  verbatim block is the honest assertion: changing the prose means changing
  the test, which is the point of a versioned prompt.
- **A parser that only ever sees well-formed output cannot show which of its
  guards is load-bearing.** `git.ts` kept four parsers inline in the methods
  that call git — numstat, unified-diff hunks, `--name-status` records, the
  failed-push detail — so nothing but real git ever reached them, and real
  git never emits the malformed shapes their guards handle. They are named
  exports now, fed crafted input directly; the real-git tests stay as the
  integration layer. One of them also lost a dead second filter and a
  rename-status branch that produced the same result as the branch it
  guarded.
- **When the only observable is WHICH subprocess ran, spy on the seam, not
  the tree.** A refused `git revert` is aborted before the error is thrown,
  and a successful one is never retried with `-m 1` — neither leaves a trace
  a later `git status` can see. `git-revert-sequence.test.ts` wraps
  `execFile` pass-through (real git still runs) and asserts the argv
  sequence instead.

The last five — `engine-guard` (47), `engine-git` (44), `engine-prompt`
(36), `engine-firing` (29), `engine-claude-cli` (28) — closed the same day.
Nothing from the sweep's 439 is open; the nightly sweep is the confirmation
across all 103 configs.

### A third category the inventory did not anticipate

Some survivors are **equivalent by construction**, and no assertion on the
result can kill them. `changedFiles`, `diffNumstat` and
`commitInFiringRange` each open with an empty-ref guard — and git exits 128
on an empty ref (measured, 2026-09-16), so deleting the guard reaches the
identical answer one line later through the `exitCode !== 0` check.

What the guard actually buys is not spawning a subprocess for an input
already known to be invalid, and no test of the RESULT can observe that.
Killing them would mean injecting the git runner so a test could assert it
was never called — a bigger change than the mutants justify.

These carry `// Stryker disable next-line all` with the measurement
written into the comment. That is rule 1 working as intended, not an
exception to it: the claim is checked before it is made, and a reader can
re-run the check. Doing this to git.ts's four such guards moved it from
90.88% to 92.86% and removed 16 survivors.

### Is 100% actually reachable?

Yes, and the evidence is already in the repository: **60 of the 103 configs
sit at 100% today**, under the identical `break: 100` bar. This is not a
target nobody has hit; it is the current state of the majority of the
suite. Two more reached it on 2026-09-16 with real tests.

With one honest qualification. A 100% score will include a minority of
documented equivalent-mutant disables, because some mutants cannot be
killed by any assertion on observable behaviour: a temp-directory name, an
`rmSync` force flag, a guard whose removal reaches the same answer one line
later. In `git.ts` that was four lines out of roughly thirty survivor
sites. The integrity test is not that the number reads 100 — it is that
every disable states a **measured** reason a reader can re-run.

The real risk is the opposite failure: reaching 100% by writing assertions
that exist only to satisfy Stryker. That converts a true signal into a
false one and is strictly worse than the survivor it removes. Rule 3
exists for it, and an honest 93% beats a hollow 100%.

### A process note, learned the hard way

`reports/mutation/<name>/mutation.json` is rewritten at the END of a run.
Reading it while a run is still going returns the PREVIOUS run's numbers,
with no indication that is what you are holding. That happened here on
2026-09-16 and produced a confident, wrong conclusion that a batch of new
tests had killed almost nothing — when the run that included them had not
finished. Always confirm the run printed its `All files` summary line
before reading the report.

## The long-term fix: a gate on the change, not a sweep on the clock

Operator, 2026-09-17: *"אנחנו לא מחפשים ליד, מחפשים פתרון ארוך טווח מדהים."*
Clearing 347 survivors is necessary and is not the answer — it leaves the
mechanism that let them accumulate exactly as it was.

**A full sweep cannot be the feedback loop.** Measured 2026-09-17 on
`stryker.store.config.mjs`: **56s** originally, **38s** with a warm
`--incremental` cache, and **27s cold** once `ignorePatterns` stopped the
sandbox copying 1.4GB of runtime state no test reads.

That last number corrects an earlier claim in this document. It said the
per-config cost was "fixed" sandbox-build and dry-run overhead that no cache
could remove. It was not fixed — it was unnecessary I/O, and deleting it beat
the incremental cache outright. See "The sandbox was the bottleneck" below.

Even so, 27s across 103 configs is most of an hour of CI before the mutants
that matter to a given change get run. So the sweep gets smaller as well as
faster.

So the sweep gets smaller, not faster. `.github/workflows/mutation-pr.yml`
runs on a pull request against **only the modules the change touches**,
selected by `scripts/mutation/configs-for-changes.mjs` from each config's own
`mutate` list. Measured against a real 211-file diff from this repo's history:
**4 configs selected, not 103.** That is affordable on a PR, which is the
whole point — a surviving mutant is caught by the change that introduced it.

This is the direct fix for **how the debt accumulated**. The failure was never
that the bar was too high; it was that nothing checked the bar for eight days
while the nightly timed out and reported `cancelled`. A gate that runs on the
change cannot silently fall behind — it is green on that PR or it is not.

The nightly stays, and is not redundant. It catches precisely what a
per-change gate structurally cannot: a mutant that survives because of a
change somewhere else entirely. Two gates, two different failure modes.

**What this does not do** is clear the existing 347. Prevention and cleanup
are separate jobs, and the section below is the cleanup.

## The sandbox was the bottleneck

Every Stryker config copies the repository into a sandbox. Not one of the 103
set `ignorePatterns`, so every one of them copied **`.autopilot/` — 1.4GB of
live SQLite database and backups** that no test reads. Once per config, on a
7200 RPM platter.

Worse, `cleanTempDir` deletes the sandbox only after a **successful** run, and
most configs are red while this debt is open. Leftovers therefore accumulate —
and because they live inside the repo, the next config copies *them* too. A
single leftover was measured at **8.1GB**.

Both are fixed on every config now: `ignorePatterns` for `.autopilot`,
`.stryker-tmp*`, `reports`, `test-results` and `dist`, and
`cleanTempDir: 'always'`. Measured effect, store config: 56s → 27s, and one
broken config's startup 75s → 17s.

## Six configs were testing nothing at all

The nightly reported 97 JSON reports for 103 configs. The other six —
`dashboard-ask`, `doc-freshness`, `lock`, `triage`, `verify-by`, `worktree` —
were not slow or failing. They were **crashing before the first mutant**:

> No tests were executed. Stryker will exit prematurely.

The cause was the sandbox again. `symlinkNodeModules: false` (needed for
better-sqlite3) means a workspace import like `@autopilot/engine` cannot
resolve inside the sandbox unless the config aliases it to a leaf module.
Four configs aliased nothing; `lock` aliased one of the **two** packages its
module imports; `ask` reaches `@autopilot/store`'s `openStore` and `@autopilot/mcp`'s
control tools transitively, so its vitest config aliases the store's
source, the mcp leaf (`control.ts`) and their four installed modules
(better-sqlite3, sqlite-vec, the MCP SDK's server entry, zod) by absolute
path, found by walking up from the sandbox to the real checkout. Its first
fix, `symlinkNodeModules: true`, ran on Windows and STILL reported "No
tests were found" on the Linux runners (two sweeps, 2026-09-17): that
message is what a test file that fails to IMPORT looks like under Stryker,
and the missing package turned out to be `@autopilot/mcp` — only visible by
keeping a sandbox (`--cleanTempDir false`) and running vitest inside it.

The failure mode is the part worth remembering: a crashing config produces no
report, so it contributes nothing to the survivor count and **looks
accounted-for while proving nothing**. Fixed, they report:

| Config | Real score, first time it ever ran |
|---|---:|
| `dashboard-verify-by` | **100%** |
| `dashboard-worktree` | **100%** |
| `dashboard-triage` | **100%** |
| `dashboard-ask` | 98.67% |
| `dashboard-doc-freshness` | 96.72% |
| `dashboard-lock` | 79.37% |

Three were already perfect and nobody could know. One was at 79%.

## Working order

Largest first, since seven files carry two thirds of it. Per file: run its
config locally, read `reports/mutation/<name>/mutation.json` (not the CI
log), write the assertions, re-run to 100%.

The CI workflow now uploads those JSON reports as artifacts, so a future
run can be read directly instead of scraped out of 28,000 lines of
sharded log — which is what answering "what is still surviving?" cost the
first time.

## 2026-09-18: 103 of 103 green — then every one of them red in one bump

Sweep 35260929635 on main was the first fully green nightly: 103 configs,
100% each. The next sweep (35325053242) reported **every mutant in every
config alive** — score 0.0 across the board, all "survived", no errors.

Nothing in the tested code had changed. What had changed was one merged
dependabot group PR (#69) that moved `vitest` 4.1 → 5.0. Reproduced
locally: the dry run is green, the mutant run kills nothing —
`@stryker-mutator/vitest-runner` 10's mutant activation does not reach a
vitest 5 worker, and its `vitest >=2.0.0` peer range is too loose for pnpm
to object. Pinned back to `^4.1.11` (proof: `dashboard-paths` 13/13 killed
again), `.github/dependabot.yml` now ignores vitest/@vitest/vite majors
with the reason written next to the rule, and a green sweep is the
evidence, not a passing CI job.

The lesson is structural, not about vitest. The per-change gate selected
**zero configs** for that PR — it changed `package.json` and the lockfile,
and no config's `mutate` list names those — so the gate passed vacuously
on the exact change that broke mutation testing itself. Two rules now live
in `scripts/mutation/configs-for-changes.mjs`, each with a test in
`apps/dashboard/test/tooling/configs-for-changes.test.ts`:

- **A toolchain change runs a canary.** Anything under the manifest, the
  lockfile, `config/mutation/`, `scripts/mutation/` or the mutation
  workflows selects `stryker.dashboard-paths.config.mjs` — 13 mutants,
  seconds to run, 100% since 2026-09-17. A canary that reports 0 killed
  is the whole point.
- **A changed mutation config selects itself.** `stryker.<name>` or the
  `vitest.<name>` it points at names no mutated source file, so the
  `mutate` match never saw them; a config edit could break its own config
  and only the nightly would notice.

## New pure modules are wired the day they are written

The inventory above was cleared file by file. The way it stays cleared is
that a new zero-side-effect module never enters the tree without a config,
so the per-change gate can select it on the PR that introduces it and the
sweep never accumulates unseen debt in it. Three such modules landed on
2026-09-18 with the landing-ritual hardening and the cockpit fixes, each
at 100% on first run:

| Config | Module | What a survivor would mean |
|---|---|---|
| `dashboard-flight-end` | `apps/dashboard/src/flight/flight-end.ts` | a 2-lane round reads `flying=0` the moment its first lane lands |
| `dashboard-landing-freshness` | `apps/dashboard/src/landing/freshness.ts` | a stale-guard refusal with no note saying "rebuild and restart" |
| `dashboard-pipeline-label` | `apps/dashboard/src/web/pipeline-label.ts` | a full repo path painted across two pipeline lanes again |

The selector reports every changed source file that has no config as
"uncovered" on stderr — that list is the standing to-do for the next
modules to wire, and it should be read on every PR, not only when red.

