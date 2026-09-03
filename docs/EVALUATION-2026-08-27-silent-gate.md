<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# EVALUATION — the gate was not running tests (2026-08-27)

Ten parallel investigations against `dcb62632`, with a live flight in the air.
Every load-bearing claim below was re-verified by hand before it was written
down; claims that rest only on a single agent's reading are marked *reported*.

The previous two evaluations asked how to close the last 13pp to SOTA. This one
found that the measurement itself was broken: **the number the whole program was
being steered by — "100% gate pass rate" — was an artifact of a test step that
executed zero tests.**

## 1. The headline

`test:impacted` was `vitest run --changed`. A bare `--changed` diffs the
**uncommitted** working tree. The flight gate runs **after** the firing's own
`git commit` (`packages/engine/src/firing.ts`, `if (headAdvanced) gate.run()`),
so by gate time the tree is clean — zero changed files. Vitest then
force-enables `passWithNoTests` for `--changed` runs, so the step exits 0.

Reproduced directly on the clean main-repo tree:

```
$ git status --porcelain | wc -l   →  0
$ pnpm run test:impacted
  No test files found, exiting with code 0
  real 0m1.026s   EXIT=0
```

And the live telemetry for firing 19 — the round that shipped at 04:53Z:

| gate step | duration | verdict |
| --- | --- | --- |
| `pnpm run typecheck` | 26,320 ms | pass |
| `pnpm run lint` | 17,153 ms | pass |
| `pnpm run format:check` | 21,292 ms | pass |
| **`pnpm run test:impacted`** | **1,540 ms** | **pass — zero tests executed** |
| `pnpm run build` | 775 ms | pass |

→ `gateResult: "passed"`, `shipped: true`.

For calibration, the real suite measured today: **443 files, 6,927 tests,
114.06 s**. The gate was spending 1.5 seconds where 114 were required.
*Reported:* 15 of 19 firings ran the impacted path (sub-3s test step); the 4
full runs took 114–137 s, consistent with the measured suite.

A second, compounding defect: `apps/dashboard/src/fly.ts:363-364` computes
`priorFiringCount` and the command list **once per flight**, outside the firing
loop — so `isFullTestRunDue` is evaluated once and a flight that starts at a
count not divisible by 5 runs impacted-only for *every* firing in it. The
every-5th-firing backstop never fires within a flight.

## 2. What this invalidates

Nothing in the last three evaluations' *architecture* findings is wrong, but the
**scoreboard** they reasoned from is. "18/19 shipped, gate-verified" means
typecheck + lint + format + build passed. It does not mean the tests passed.
Ship rate, streak, and `costPerShipped` all inherit the error.

This is the exact failure mode the external research names: SpecBench (arXiv
2605.21384) finds every frontier agent saturates its visible suite while
holdout compliance degrades 43–48pp, and *Verification Horizon* (arXiv
2606.26300) states the governing principle — *"no fixed reward function can
remain effective as policy capability continues to grow."* AUTOPILOT did not
merely have a weak gate; it had a gate that was structurally unable to say no.

## 3. Findings by dimension

### 3.1 Gate integrity — one repaired, four open

**FIXED (this session).** The impacted command is now ref-scoped
(`vitest run --changed HEAD~1` — it diffs the commit the gate is judging), and
the onboarding detector (`packages/onboarding/src/gate/detectors/js.ts`) now
**refuses** to adopt a working-tree-scoped `test:impacted` at all, falling back
to the full `test` command. That second half matters more than the first:
AUTOPILOT onboards other repos, and bare `--changed` is the common idiom, so
every project it flew would have inherited the same silent gate. Guarded by
`apps/dashboard/test/tooling/gate-test-scope.test.ts` plus two detector cases.
`passWithNoTests: false` was considered and **rejected** — once ref-scoped, an
empty scope means "docs-only commit", a legitimate green.

Still open at the time this doc was written, in severity order — all four are
now **DONE** (re-verified firing 73, 2026-08-27):

1. **The gate judges the working tree, not the commit.** `firing.ts:249-274`
   runs in `flightRoot` with no clean-tree assertion. Commit broken code, leave
   the fix uncommitted, gate green.
   **DONE** (`20787d7d`, board `web-mtb8i2i8-8l9zut`) — a dirty tree after the
   commit now makes the gate refuse to certify (`gateResult: 'unverifiable'`)
   instead of judging the contaminated working tree.
2. **Checkpoints are never gated.** `firing.ts:275-294` commits `git add -A`
   with no `gate.run()`. Two such commits already reached `main`
   (`52f129a9`, `80e0d70d`).
   **DONE** (`386710dd`, board `web-mtb8i2jo-5g4fo5`) — checkpoint commits now
   run the gate too, purely for honest telemetry (never reverted, since a
   checkpoint's whole point is preserving WIP for the next firing).
3. **`revertLast()` undoes one commit; `head_advanced` covers many.** A firing
   that makes two commits and fails the gate reverts only the second — and
   `head_before`/`head_after` are never written (`adapters/store.ts:56-85`),
   so it is unauditable.
   **DONE** (`c12187ea`, board `web-mtb8hghd-72z52z`) — the full commit range
   is now reverted on gate failure, with `head_before`/`head_after` persisted.
4. **`sha_verified` verifies nothing.** `git cat-file -e` asks "does this
   object exist", not "is this your commit" — any of 2,768 commits satisfies it.
   **DONE** (`f4a1b9b8`, board `web-mtb8hgj2-xhang0`) — `sha_verified` now
   proves the reported sha is this firing's own commit, not merely an object
   that exists somewhere in history.

Genuinely sound: `shipped=1` cannot be produced without a real HEAD advance;
gate commands are argv-only (no shell injection); landing onto `main` runs the
full unscoped suite. That last one is why `main` is not already broken.

### 3.2 Work selection — a starvation bug, not a dimension bias

Seven consecutive rounds shipped the same commit family. `dimension` is never
read by any ranking code. The cause is one task, `web-mt69bego-etc8te`, that is
the only pinned+queued row on the board (`severity=high, priority=0,
priority_pinned=1`) → permanent rank 1, with an **unbounded DELIVERABLE**
("shell.ts line count shrinks"), so `completion` can only ever be `slice` and
it never closes. Every anti-grind guard is structurally unable to fire:
`isRunaway` needs `spend > $50 && streak > 10` (actual $44.19 / 6);
`applyOperatorPins` explicitly exempts pinned tasks; the family guard keys on
path-like tokens while these subjects vary by prose.

The decisive one: on 2026-08-24 the autopilot **filed its own stop-signal** —
`ap-mt6qc9k3-0`, *"VERDICT split web-mt69bego-etc8te: shell.ts's safe pure/DOM-split
vein is exhausted"*. `VERDICT_DEFER_KIND_RE`
(`apps/dashboard/src/flight/completion.ts:38`) matches only `close|blocked`, so
`split` was dropped. That verdict is still `queued` at priority 11, three days
and seven rounds later.

Cost cliff, narrowly missed: `sliceStreak` reached 6 and
`SLICE_STREAK_ESCALATION_THRESHOLD = 6`, so firing 20 would have routed to
`fable` at a 3.5× budget multiplier — ~$25/round on work its own verdict calls
exhausted. The flight ended at `max-iterations` before firing 20 started.

### 3.3 Convergence — blocked, and reported only as a warning line

The flight's own last log lines:

```
⚠ flight-end sync-back still refused: merge of
  'autopilot/flight-worktree-fly-autopilot' into 'autopilot/flight' failed:
  CONFLICT (content): Merge conflict in apps/dashboard/src/web/shell.ts
🩹 SAFETY-II near-miss debrief: 2 sync-back refusals.
```

*Reported:* the primary lane is 2 ahead / 86 behind `autopilot/flight`, and
every caller downgrades a refused sync-back to a `⚠` line and continues —
`fly.ts:1216-1219` documents the identical prior incident at *"144 commits over
2 days before this was caught."* The overlap detector is real and fails safe,
but it guards the second hop (`flight → main`); the first hop (ten lanes →
`flight`) is a textual auto-merge with no sibling awareness.

*Reported:* of the five coordination primitives, only **leases** hold cleanly.
Sharding's partitioner (`scope-partition.ts:109`) has no production caller —
its only importer is its own test; `.autopilot/run-scopes.json` is written by
something outside the repo and is 6 days stale. Monotonic allocation is
violated in the live DB: firing numbers 1, 4, 7, 10 were each issued three
times while 2, 3, 5, 6, 8, 9, 11, 12 were never issued — the lockstep signature
of a read-then-write race on `COUNT(*) + 1`.

The nine idle fleet lanes are **not** a coordination failure: nothing in the
codebase can start one. Lane identity comes only from
`AUTOPILOT_FLIGHT_INSTANCE_ID`, the fleet watchdog iterates *projects, not
lanes*, and all nine lanes ended cleanly at `max-iterations`. They were fanned
out manually on 08-23/24 and never re-invoked.

### 3.4 The decomposition epic — a thin seam of real value

*Reported, with runtime proof:* the extraction has traded compiler-verified
coupling for **89 distinct bare-identifier couplings across 316 reference
sites** that no type checker, linter, or bundler can see — modules call `el`,
`tipChip`, `fmtAgo`, `statTile` as free identifiers resolved only because
everything lands in one concatenated global scope. Coupling is bidirectional:
`shell.ts` calls back into features by bare name at 35 sites.

**This is already broken in production.** `web/features/notifications.ts`
splices `isQuietHour.toString()`, but `isQuietHour` calls `minutesOf` — a
non-exported module-private helper (`web/notifications.ts:76`, verified: no
`export`). `.toString()` emits only the function's own body, so `minutesOf`
never enters the bundle. Two independent agents confirmed by execution:

```
typeof isQuietHour = function
typeof minutesOf   = undefined
renderFleet:      THREW → ReferenceError: minutesOf is not defined
maybeNotifyFleet: THREW → ReferenceError: minutesOf is not defined
```

`renderFleet` calls it on line 1, and the SSE handler swallows it with a bare
`catch{}` — so any user who enables notifications and grants permission gets a
permanently frozen dashboard with no error anywhere. Commit `8519b1cc`
("embed latestLanded in the client bundle — populated fleets rendered
nothing") is the identical bug in the identical file; the fix was
instance-specific, not class-level.

Also *reported*: every extraction's line-count win is partially reversed by
exactly +153 lines in the next sync merge, five times running, and the epic doc
re-baselines from the higher number without acknowledging it. `shell.ts` is
3,917 lines — 90.5% of it still one function.

### 3.5 Test quality — the self-confirming shapes

*Reported:* every `test/web/features/*.test.ts` added by the extraction rounds
is built from `expect(out).toContain(someFn.toString())` — comparing a function
to itself — and `expect(out).toContain('function xSection(c) {')`, which checks
only the declaration line. A mutation to any function *body* survives all of
them. The `generate-splice-manifest.test.ts` "regression guard" (3,531 lines)
re-parses the same source it tests via the same codemod: it is a tool-correctness
test, not a behavior test, and its only bundle-wide check is
`expect(() => new Function(bundle)).not.toThrow()` — which compiles but never
executes, so it structurally cannot catch the `minutesOf` ReferenceError.

The genuinely load-bearing coverage is the *pre-existing, independently
authored* jsdom DOM suites, which do execute the extracted code.

### 3.6 Cost — cache is already perfect; turns are the lever

19 rounds: **$102.40, 1,439 turns, 221.8M cache-read tokens.** Cost decomposes
as cache_read 70.8% / cache_write 16.0% / output 13.2% / input 0.0%. Firing 19
read 13,561,724 cached tokens against 142 input tokens — a **99.999% cache hit
ratio**. There is no caching win available; cost is
`turns × resident_context`.

*Reported:* 38 of 71 billed messages in firing 19 touched
`generate-splice-manifest.test.ts` alone (58.9% of the round's context reads,
$2.44), because that test hardcodes every feature module in 6–14 places while
the generator it tests already does filesystem discovery. Tool batching averages
1.18 calls/message. Turn-1 preamble is 75,873 tokens, ~13.5k of it a 150-skill
and 50-agent catalog the flight never used once in 689 tool calls.

$7–9/round is ~2–5× the OpenHands SWE-bench median, but at a ~100% merge rate
the cost per *merged* change is closer to competitive. The alarming ratio is
**~100 turns for a mechanical extraction**, not the dollars.

### 3.7 Security — no new holes; one accepted trade-off

No CRITICAL findings with a reachable exploit path. Every shell-out is
`execFile`/`spawn` with argv arrays; HTML escaping is sound and test-proven
against a `<script>` payload; Actions are SHA-pinned with no
`pull_request_target`; secrets scan clean. Two standing items, both already
documented in-repo: the loopback API has no auth token (mitigated against
browser CSRF by the `application/json` requirement, not against a co-resident
local process), and the Bash containment guard is textual, so an
indirect-path-construction bypass defeats it — which the project's own
`FLIGHT-CONTAINMENT.md` and the operator's notes already state.

### 3.8 Housekeeping — ~1.7 GB reclaimable

`.autopilot/autopilot.db` is **137 MB** for 1,624 events + 348 tasks + 19
metrics rows (1.7 MB of real data). *Reported:* 82.1 MB is a trigram FTS index,
20.0 MB is FTS content, 32.7 MB is never-reclaimed freelist. Root cause
verified: `packages/onboarding/src/adapters/ignore.ts` lists `dist` and
`coverage` but **not `reports`**, so 64 Stryker mutation HTML reports (11 MB)
are indexed and multiplied 4.36× by trigram tokenization. No `VACUUM` or FTS
`optimize` exists anywhere in the tree. `.autopilot/backups` is **1.5 GB** —
retention works, it just keeps 10 copies of a bloated DB.

Two CI gates are red right now (`architecture:check`, `data-model:check`), and
`knip` — the dead-code detector — is declared but not installed, so
`report:deadcode` fails. All nine fleet worktrees are fully merged with zero
unique commits: 514 MB of pure clutter, nothing to lose.

*Re-verified firing 80 (2026-08-27), and all three of the above turned out to
be wrong even at the time this doc was written* — the only §3.8 finding not
independently confirmed elsewhere in this document: `pnpm run ci:architecture`
and `pnpm run ci:data-model` (the doc's `architecture:check`/`data-model:check`
are shorthand, not the real script names) both pass — "architecture-check OK"
and "data-model-check OK" — and `knip` has been installed and wired since
`44a3ff04` (2026-08-23, four days before this doc), so `report:deadcode` runs
cleanly (one genuine unused export found: `realAdoptFlightDeps` in
`apps/dashboard/src/flight/adopt.ts`, not investigated here). The worktree
claim is also stale, though possibly not wrong *at the time*: as of this
firing, 3 of the 9 sibling worktrees (`fleet-2`: 3 commits, `fleet-8`: 1,
the base `fly-autopilot` worktree: 1) carry unique commits ahead of
`autopilot/flight` — fleet activity has picked back up since 08-23, so "zero
unique commits" is a snapshot claim that does not hold as a standing fact.

## 4. The program

| # | Lever | Class | Status |
| --- | --- | --- | --- |
| 1 | **Ref-scope the impacted gate + refuse tree-scoped detection** | gate | **DONE this session** |
| 2 | Un-pin `web-mt69bego-etc8te`; promote `ap-mt6qc9k3-0` | selection | operator action, no code |
| 3 | Teach `VERDICT_DEFER_KIND_RE` the `split` kind | selection | **re-scoped, not "one line"** — investigated firing 73: the regex still deliberately excludes `split` (`156385ff`, *"split/deprioritize verdicts leave workable content and defer nothing"*); broadening it risks over-deferring genuinely actionable splits, so this is an operator tradeoff call, not a mechanical fix |
| 4 | Fix `minutesOf` splice + add a free-variable bundle check | correctness | live bug — claimed in flight by a sibling fleet lane (`web-mtbeu5f7-gbic3z`) as of firing 73 |
| 5 | Move `selectTestCommand` inside the firing loop | gate | **DONE** — `buildGateSpec` re-reads `firingStats` per firing (`apps/dashboard/src/fly.ts:370-371`, board `web-mtb8i2ol-obncos`) |
| 6 | Gate checkpoints, or block sync-back on a checkpoint tip | gate | **DONE** (`386710dd`, board `web-mtb8i2jo-5g4fo5`) — checkpoint commits now run the gate for honest telemetry, never revert |
| 7 | Resolve the `shell.ts` sync-back conflict; make refusal loud | convergence | blocked ≥10 firings — `shell.ts` still live-claimed by a sibling fleet lane as of firing 73 |
| 8 | Add `reports` to `IGNORE_DIRS`; add a VACUUM path | housekeeping | **DONE** — `reports` in `IGNORE_DIRS` (`6b5e1af0`); `vacuumStore` + `dashboard vacuum` CLI (`1a454d4c`) |
| 9 | Wire the ~100 existing Stryker configs into the gate, diff-scoped | gate | assets already paid for — claimed in flight by a sibling fleet lane as of firing 73 |
| 10 | Board-diversity audit over `picked_rank` (already stored) | selection | **DONE** — `boardDiversityAudit` (`packages/store/src/eval-gate.ts`), wired into `MODEL-CARD.md` and the self-study pipeline |

Levers 4 and 7 are live defects; 4 is being worked and 7 stays blocked on the
same `shell.ts` contention this doc originally named. Lever 2 is one board
edit and should precede any further flight. Lever 9 is the highest-value
quality lever available and costs almost nothing to reach: `config/mutation/`
already holds ~100 Stryker configs, and **none of them gate anything** — a
sibling fleet lane has since claimed it.

*Status re-verified firing 73 (2026-08-27): of the ten levers above, six
(1, 5, 6, 8, 10, and the four "still open" gate-integrity items in §3.1) are
now shipped and gate-verified; two (4, 9) are claimed and in flight elsewhere;
one (7) remains genuinely blocked; one (3) turned out to need an operator
judgment call rather than a mechanical fix once its recent design rationale
was found. This table should not be re-investigated from scratch again —
check git log for the board ids first.*

## 5. Verdict

The engineering discipline here remains genuinely strong — the containment
model, the argv-only subprocess hygiene, the fail-safe overlap detector, the
honest doctrine doc that admits which primitive is unimplemented. What this
evaluation found is not sloppiness; it is the specific, predictable failure of
a system that grades its own homework with a fixed rubric.

The loop was not shipping bad code — the full suite passes 6,927/6,927 today.
It was shipping **unverified** code while reporting verified, and steering a
research program off that number. One `--changed` with no ref did that.

The correct next move is not another firing. It is levers 2, 4 and 7 — un-pin
the starved board, fix the live `ReferenceError`, and unblock convergence —
and only then fly again, now that the gate can actually say no.
