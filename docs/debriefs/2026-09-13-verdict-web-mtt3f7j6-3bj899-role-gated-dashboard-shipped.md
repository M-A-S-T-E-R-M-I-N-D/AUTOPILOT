<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `web-mtt3f7j6-3bj899`: role-gated dashboard is already fully shipped

Board (high): "EPIC 0019 role-gated dashboard: panels and buttons render by
resolved role (resolveSocialIdentity) — non-owners never SEE maintainer verbs
(release, KEEPER Apply, steward writes) on repos they do not own." Ranked
#2 this firing (rank #1, `web-mtsylqbd-q2rg8k`, is a standing regression-test
law for future steward slices, not a closeable single-firing deliverable —
see Deviation below). Picked this one up expecting a remaining gap and found
none: this firing's unit is the verification that closes it.

## Verification of the claim

**Inventory of every panel with a maintainer-write action.** Grepped all of
`apps/dashboard/src/web/*.ts` for write-shaped buttons
(`execute`/`apply`/`merge`/`write`/`run`/`seed`/`create`/`update`/`delete`/`close`
data-attributes). Exactly five panels carry one, matching the board title's
own three named examples plus two more slices of the same law:

| Panel | Maintainer verb(s) | Guest gate | Guest test |
|---|---|---|---|
| `release-panel.ts` | release actions | `releaseGuestNote` | `release-panel-guest.test.ts` (1 test) |
| `pr-review-panel.ts` | Apply / merge / re-run / update-branch | `prReviewGuestNote` | `pr-review-panel-guest.test.ts` (4 tests) |
| `issue-triage-panel.ts` | KEEPER Apply | `issueTriageGuestNote` | `issue-triage-panel-guest.test.ts` (3 tests) |
| `discussions-triage-panel.ts` | KEEPER Apply (discussions) | `discussionsTriageCanExecute` | `discussions-triage-panel.test.ts` (17 tests, role-gate cases included) |
| `mirror-pass-panel.ts` | reconcile / drift-fix / landing-note / stale-claim execute (steward writes) | four `*CanExecute` gates | `mirror-pass-panel-guest.test.ts` (19 tests) |

Every other panel in that directory (backlog, coordination, pool-client,
publicity, report, console, contributor-issue-list, contributor-standing,
docs, flight-summary, landing, pipeline, connect) is read-only — no
write-shaped button, nothing to gate.

**Every gate follows the same law, cited by this exact board ID.** Each of
the five modules' guest-note/gate function carries a doc comment reading
"epic 0019 law 1 extended to the UI, board web-mtt3f7j6-3bj899" and the same
shape: a confirmed non-owner (`identity.role !== 'maintainer'`) loses the
write button and sees a guest note instead; an *unresolved* identity (no
`gh`, no GitHub remote — the common fully-local project) is deliberately
**not** treated as a guest, so the button stays visible when ownership can't
be determined at all. `pr-review-panel.ts` additionally keeps its read-only
🔧 Diagnose button visible to a confirmed guest (only the mutating buttons
are gated) — the same read/write split the law implies.

**Tests pass clean.** Ran the five guest/role-gate suites from a clean tree:

```
npx vitest run --project jsdom release-panel-guest pr-review-panel-guest \
  issue-triage-panel-guest mirror-pass-panel-guest discussions-triage-panel

Test Files  5 passed (5)
     Tests  44 passed (44)
```

## VERDICT

**Close — already fully shipped.** All five panels that expose a
maintainer-write action gate it on resolved role, hide it behind a guest
note for a confirmed non-owner, and keep it visible when identity can't be
resolved at all — the exact behavior the board title describes, each
citing this board ID directly in its own source. No further slice is
actionable here; this reads as a stale board entry (created before, or not
synced after, the last of these guest gates landed) rather than open work.

## Deviation note (PICK DISCIPLINE)

`picked_rank: 2`. Rank #1, `web-mtsylqbd-q2rg8k`, reads as a standing
regression-test law ("every steward slice ships a regression test over the
existing neighboring flows... and never changes an existing contract
without[...]") rather than a single closeable deliverable — it binds every
*future* EPIC 0019 slice, not a specific gap to fix now. The two shipped
steward slices it would apply to retroactively (`taxonomy-seed.ts`,
`mirror-pass.ts`) already carry their own dedicated test files
(`taxonomy-seed.test.ts`, `mirror-pass.test.ts`, `mirror-pass-execute.test.ts`)
covering their own contracts; auditing whether those specifically regression
-test every *neighboring* flow (claim ledger, KEEPER rituals, auto-merge,
issue templates) is a materially larger cross-cutting audit than fits one
firing's budget. Rank #2 was concretely verifiable end-to-end in this firing
and had cleaner evidence of being fully done, so it was worked first.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file, added with a scoped
`git add <this-path>` — the only file this firing staged or touched. Pure
documentation: `docs/` is excluded from `prettier --check .`
(`.prettierignore`) and from ESLint's configured `files` globs
(`eslint.config.js` targets only `*.ts`/`*.mjs`/`*.js`), so it adds no source
or test code and `typecheck`/`build` are structurally unaffected. The 44
tests above were already run in full during verification and passed clean.
