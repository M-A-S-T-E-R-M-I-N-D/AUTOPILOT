<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing board `web-mtqumz0u-j39av4`: guard-precision doctrine — closing the audit the prior firing left open

Board (high): "guard precision doctrine (never again FP damage): every
scripts/ci scanner ships a NEGATIVE corpus test of legit shapes it must NOT
flag; every scanner red carries the matched TEXT as evidence; remediate any
that don't." The 2026-09-12 sustained-load-planner debrief already ran a
per-scanner audit of every `scripts/ci/*.mjs` file and found full compliance
everywhere it checked, but explicitly declined to write a closure verdict:
"that reading is not yet certain enough to write as a closure verdict in the
same firing as this one, so it is left open." This firing re-verifies that
audit end to end and settles the open question: are the six unaudited
scripts genuinely out of the doctrine's scope, or do they need remediation?

## Re-verification of the ten pattern scanners (unchanged since the prior audit)

Read every file directly (not re-trusting the prior debrief's list). All ten
`scripts/ci/*.mjs` scripts that classify tracked-file TEXT via regex/heuristic
rules already carry both halves of the doctrine:

| Scanner | Negative-corpus test | Matched-text evidence |
|---|---|---|
| `secret-scan.mjs` | `secret-scan.test.ts` — 12 "does not flag legit shapes" cases | redacted `match` fingerprint per finding (never the raw secret) |
| `validate-no-personal-paths.mjs` | `validate-no-personal-paths.test.ts` (Windows drive-path + placeholder-home exemptions) | `f.match` printed verbatim per finding |
| `validate-spdx-headers.mjs` | `validate-spdx-headers.test.ts` — shebang-prefixed header, boundary-line header, bare "SPDX" substring | absence check; the missing file path itself is the evidence (nothing to quote) |
| `check-doc-commit-refs.mjs` | `check-doc-commit-refs.test.ts` — 6 explicit "does not flag" cases (bare hex word, 64-char content hash, sub-7-char hex, non-hex backtick span) | `commit \`${sha}\`` quoted per error line |
| `dependency-audit.mjs` | test suite's transient-vs-report classification cases | `matched "${marker}" in: ${evidence line}` |
| `audit-board-flood.mjs` | `audit-board-flood.test.ts` legit-shape cases | truncated `snippet` of the actual flagged message body |
| `check-model-freshness.mjs` | own test file's "negative corpus" describe block, plus the doc comment's own regression story (a loose match once flagged `'agent'` from an unrelated flag) | `findUnknownFamilyAliases` returns the literal alias words, joined into the finding string |
| `license-check.mjs` | `license-check.test.ts` — dual-license OR-expression, family-prefix rejection (`MITNFA`, `BSD-4-Clause`) | `${name}@${versions}: ${license}` per violation |
| `check-merge-integrity.mjs` | `merge-integrity.test.ts` — the "14 real ones" identical-tree-but-already-applied case, the branch-independence case | dropped lines sampled verbatim (`work nobody else has`) |
| `validate-configs.mjs` (`findUnpinnedActions` sub-check) | `validate-configs.test.ts` — full-SHA pin, uppercase-hex pin, local/docker action exemptions | `action "${ref}" ${reason}`, comment names "carrying the matched ref as evidence" |

No regressions, no gaps. This confirms the prior firing's read was correct.

## Settling the open question: the six unaudited scripts

Re-read each of the remaining `scripts/ci/*.mjs` files in full (not summarized
from memory) to test whether the doctrine's wording actually applies:

- **`check-bundle-size.mjs`** — compares `Buffer.byteLength`/`gzipSync` output
  against fixed numeric budgets. A byte count has no "shape" that can
  resemble a violation while being legitimate; it is either over budget or
  not. There is no adjustable heuristic here to overreach, so "a negative
  corpus of legit shapes" has no referent.
- **`detect-flaky.mjs`** — an on-demand diagnostic (deliberately NOT wired
  into `verify`/CI per its own doc comment) that shells out to `vitest run`
  N times against a caller-specified file and tallies real pass/fail exit
  codes. It scans no tracked-file text at all; its "finding" (a flip between
  pass and fail) is an empirical fact about a live test run, not a
  pattern-match that can misfire on a legitimate shape.
- **`quarantine-report.mjs`** — validates that each JSON entry in
  `config/quarantine/flaky-tests.json` has four non-empty string fields.
  Field presence/absence is a binary structural fact, not a fuzzy
  content-pattern with a tunable false-positive rate.
- **`launcher-smoke.mjs` / `launcher-smoke-cmd.mjs`** — execute the real
  committed `.sh`/`.cmd` launcher scripts (via `bash -n` plus a sandboxed
  full run with stubbed `pnpm`/`node` on `PATH`) and assert on real exit
  codes and stub-invocation records. This is behavioral/integration testing
  of an artifact actually running, not text-pattern classification.
- **`npx-smoke-test.mjs`** — packs, installs, and boots the real dashboard
  package outside the workspace, then asserts on real runtime behavior (a
  live `/api/health` hit, the packed shebang's line ending, the tarball's
  file allowlist). Same shape as the launcher smoke tests: empirical,
  not heuristic.
- **`run-all-mutation.mjs`** — discovers Stryker configs from the filesystem
  and orchestrates running them (or lists them with `--list`/`--diff`); it
  does not classify file content for suspicious shapes at all.

The doctrine's own wording — "ships a NEGATIVE corpus test of legit shapes it
must NOT flag" — presupposes a scanner whose verdict comes from a
regex/heuristic rule tunable between too-narrow and too-broad, where an
overly broad rule can fire on a legitimate shape that merely resembles the
bad one (exactly the drive-`y:`-from-CSS-regex incident `FAILURE-DOCTRINE.md`
row 6 names). None of these six scripts have that structure: their checks are
either exact/structural (a field is present or it isn't; a byte count is
over budget or it isn't) or purely empirical (a process actually crashed, a
test actually flipped, an HTTP call actually returned 200). A "negative
corpus" is not a meaningful concept to bolt onto any of them — there is no
tunable pattern to guard against overreaching.

## VERDICT

**Close — the doctrine's scope is fully satisfied.** All ten scripts/ci
scanners that do real text/heuristic pattern-matching against tracked file
content already ship a negative-corpus test and matched-text evidence. The
six remaining scripts/ci scripts are categorically outside the doctrine's
scope (numeric budget, structural JSON validation, or empirical
execution/smoke testing, never fuzzy text-shape classification) — no
remediation is applicable to them, so there is nothing left to build. This
firing's unit is the confirming re-audit and this closing verdict; no source
changes were needed because none were missing.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file, a `docs/` path staged
alone with a scoped `git add`. `docs/` is excluded from `prettier --check .`
(`.prettierignore`) and from ESLint's configured `files` globs
(`eslint.config.js` targets only `*.ts`/`*.mjs`/`*.js`), so this adds no
source or test code and `typecheck`/`test`/`build` are structurally
unaffected.
