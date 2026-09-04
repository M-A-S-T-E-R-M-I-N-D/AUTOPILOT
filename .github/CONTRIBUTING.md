<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Contributing to AUTOPILOT

Thank you for your interest in AUTOPILOT — a standalone, open-source, autonomous
engineering agent. This guide gets you from clone to a green pull request.

## Ground rules

- **No private or personal data — ever.** The only identity carried in this repo
  is the author brand `1337 · REL AZEUS · MΔSTERMIND`. CI enforces this
  (secret-scan + no-personal-paths gates); a PR that adds a personal path,
  secret, or PII will be blocked.
- **Gate every change.** `typecheck + lint + test (≥80% coverage) + build` must
  pass, or the change reverts cleanly. Never leave the tree red.
- **Standards-first.** See [`docs/PATTERNS-AND-STANDARDS.md`](../docs/PATTERNS-AND-STANDARDS.md)
  for the adopted architecture patterns and regulatory standards (OWASP, SLSA,
  WCAG, SemVer, SPDX/REUSE).

## Prerequisites

- **Node.js ≥ 22.12** (see [`.nvmrc`](../.nvmrc))
- **pnpm ≥ 10** — enable via Corepack: `corepack enable pnpm`

## One thing to know before anything else

**This repo is flown autonomously.** Most commits here are shipped by AUTOPILOT's
own agent fleets, every PR is first triaged by an automated review ritual (the
**KEEPER** — see below), and `main` accepts writes from exactly one human
maintainer ([`GOVERNANCE.md`](GOVERNANCE.md)). None of that changes how YOU
contribute — fork, branch, PR, like anywhere — but it explains what you'll see:
bot-cadence commits, ritual commit messages, and automated review verdicts.

## Setup (fork-first — outside contributors cannot push here)

```bash
# 1. Fork on GitHub (the Fork button), then:
git clone https://github.com/<your-username>/AUTOPILOT.git
cd AUTOPILOT
git remote add upstream https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT.git
pnpm install
pnpm run verify   # typecheck + lint + format + test+coverage + build + CI validators
```

## Development workflow

1. **Branch** in your fork: `git switch -c feat/<short-topic>` (branched from an
   up-to-date `upstream/main`).
2. **Write tests first** where logic is testable (TDD: RED → GREEN → refactor).
3. **Implement**, keeping files small and focused (< 800 lines; functions < 50).
4. **Run the gate**: `pnpm run verify`.
5. **Commit** using [Conventional Commits](#commit-messages) **with `-s`**
   ([DCO](#developer-certificate-of-origin-dco)).
6. **Open a PR** against `M-A-S-T-E-R-M-I-N-D/AUTOPILOT:main` and fill in the
   template. PRs land **squash-merged** — your branch's commits become one
   commit on `main`, so a messy WIP history in the PR is fine; the TITLE of the
   PR must itself be a valid Conventional Commit (it becomes the squash
   subject).

## What happens after you open a PR

1. **CI runs** (the same `verify` you ran, on three OSes, plus commitlint on
   the PR title and a REUSE license check).
2. **The KEEPER triages it** — an automated review ritual that reads
   gh-reported facts (CI state, diff scope, mergeability) and posts one of:
   **merge** (small, green, in-scope), **request-changes** (with the specific
   reason), or **queue-for-human** (anything security-sensitive,
   dependency-touching, or judgment-shaped — a human decides those, always).
   The full decision policy lives in [`docs/RUNBOOK.md`](../docs/RUNBOOK.md) §8
   and its source of truth is `apps/dashboard/src/flight/pr-review.ts`.
3. **The human maintainer** approves anything the KEEPER queued, and is the
   only one who can land to `main` (CODEOWNERS + branch protection).

An automated request-changes is not a rejection — fix the named reason and
push; the ritual re-triages on every update.

## Flaky tests

If a test fails intermittently (passes on retry with no code change), don't just
re-run it and move on:

1. Sample it: `pnpm run detect-flaky -- <test-file-path> [runs=5]` runs the file
   N times in a row and reports pass/fail tally — a genuinely flaky test flips
   between them.
2. If confirmed, quarantine it: add an entry to
   `config/quarantine/flaky-tests.json` with `testPath`, `owner`, `reason`, and
   `addedDate`. This tracks it (visible via `pnpm run ci:quarantine-report`,
   part of `verify`) — it does not skip or allow-fail the test, since that
   would risk masking a real regression behind a known-flaky label.

## Commit messages

We use **Conventional Commits** (enforced by commitlint):

```
<type>: <description>

<optional body>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `build`,
`revert`, `style`.

## Developer Certificate of Origin (DCO)

All commits must be signed off, certifying you have the right to submit the work
under Apache-2.0:

```bash
git commit -s -m "feat: ..."
```

This appends a `Signed-off-by:` trailer. See <https://developercertificate.org>.

## Licensing of contributions

By contributing, you agree your contributions are licensed under **Apache-2.0**.
Add an SPDX header to every new source file:

```ts
// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0
```

## Code review

Every change is reviewed for quality, security, and maintainability — first by
the automated KEEPER ritual (above), then by the human maintainer for anything
queued. Security-sensitive changes (auth, input handling, file/DB/network
access) always queue for the human. For what exists and what's in motion, read
[`CHANGELOG.md`](../CHANGELOG.md) — the live record.

## Reporting bugs / requesting features

Use the issue templates. For **security vulnerabilities**, do **not** open a
public issue — follow [`SECURITY.md`](SECURITY.md).
