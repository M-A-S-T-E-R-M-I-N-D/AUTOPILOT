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

## Setup

```bash
git clone https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT.git
cd autopilot
pnpm install
pnpm run verify   # typecheck + lint + format + test+coverage + build + CI validators
```

## Development workflow

1. **Branch** off `main`: `git switch -c feat/<short-topic>`.
2. **Write tests first** where logic is testable (TDD: RED → GREEN → refactor).
3. **Implement**, keeping files small and focused (< 800 lines; functions < 50).
4. **Run the gate**: `pnpm run verify`.
5. **Commit** using [Conventional Commits](#commit-messages).
6. **Open a PR** and fill in the template.

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

Every change is reviewed for quality, security, and maintainability. Security-
sensitive changes (auth, input handling, file/DB/network access) receive a
dedicated security review. See [`docs/ACTION-PLAN.md`](../docs/ACTION-PLAN.md) for
the milestone-gated build order.

## Reporting bugs / requesting features

Use the issue templates. For **security vulnerabilities**, do **not** open a
public issue — follow [`SECURITY.md`](SECURITY.md).
