<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# @autopilot/onboarding

Locking onto a project: take a folder, back it up, detect its gate, index it, register it in the
store — safely, and idempotently.

Part of the [AUTOPILOT](../../README.md) monorepo; not published on its own (`private`).

## What lives here

- `onboard/` — the ritual (`onboard.ts`): the folder lock and triage, issue detection, the SOUL
  prompt, the seeded backlog, the project record; `task-id.ts` is `taskIdSource(prefix)`, the
  collision-free task ids a shared store needs.
- `backup/` — the **MYTH + LEGACY** snapshot tiers, the backup a flight can always fall back to.
- `gate/` — gate detection per ecosystem (`pnpm run typecheck/lint/format:check/test/build` for JS;
  the equivalents elsewhere).
- `index/` — the search index build (the content Ask and the Docs reader read; root-jailed).
- The size guard and the secret guard run before anything is copied or indexed: a folder over the
  size ceiling or carrying secrets is refused.

## Laws worth knowing

- **Never index a secret.** The secret guard runs before the indexer; its fixtures are assembled at
  test time so no real-looking secret is ever committed.
- **Idempotent.** Onboarding the same folder twice updates the record; it never duplicates it
  (`projects.slug` is unique — and the drive letter must be capitalised on Windows for `resolve()` to
  agree with itself).

Tests: `pnpm exec vitest run packages/onboarding`. Mutation configs: `config/mutation/stryker.onboarding-*`.
