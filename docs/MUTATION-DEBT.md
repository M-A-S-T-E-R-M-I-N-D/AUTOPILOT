<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Mutation debt — the inventory, and the plan to clear it

Operator directive, 2026-09-16: **everything green, everything at 100%.**

`config/mutation/` holds 103 per-module Stryker configs, each with
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
| `packages/engine/src/adapters/git.ts` | 87.61% | **92.86%** | 60 → 45 survivors; **no-coverage 31 → 3** (`pushBranch`, `dirtyPaths`) |

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

## Working order

Largest first, since seven files carry two thirds of it. Per file: run its
config locally, read `reports/mutation/<name>/mutation.json` (not the CI
log), write the assertions, re-run to 100%.

The CI workflow now uploads those JSON reports as artifacts, so a future
run can be read directly instead of scraped out of 28,000 lines of
sharded log — which is what answering "what is still surviving?" cost the
first time.
