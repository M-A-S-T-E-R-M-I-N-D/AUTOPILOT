<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-mtui8t6l-0`: the payload census still takes any `.field` as a read, split confirmed with two live false negatives

Board: "VERDICT split `web-mtt8loaw-ceogs1`: static field-name census can't
distinguish 'read' from 'name coincidentally appears elsewhere'". This is a
VERDICT task, a prior firing's proposal about another task, not buildable
work itself. Under the VERDICT-processing protocol this firing verifies the
claim against the current code, proposes the concrete slices, and completes
this task with the evidence. It does not attempt the underlying fix.

## Which census the verdict means

Neither task id appears anywhere in the repository or its history, so the
target is identified by content and timing. The only static field-name
census in the tree is `apps/dashboard/test/flight/payload-census.test.ts`,
epic 0020 slice 6 ("a test that fails when a field fetched by a flight
module never reaches any client renderer",
[`docs/epics/0020-legible-surface.md`](../epics/0020-legible-surface.md)).
The timestamps fit. The target id `mtt8loaw` decodes (base-36 ms) to
2026-09-08 22:24 UTC. The verdict id `mtui8t6l` decodes to 2026-09-09
19:42 UTC. The census file first appears 30 minutes later, in firing 391's
checkpoint `6f04245f` (2026-09-09 20:12 UTC). The firing that filed the
verdict went on to ship a bounded slice anyway. It solved a *different*
problem (fields that exist only to steer a decision) with a curated
interface list, and left the verdict's problem in place.

## Verification of the claim

The census decides "this field reaches the panel" with one test, at
`payload-census.test.ts:126`:

```ts
const reference = new RegExp(`\\.${field}\\b`);
```

It runs that regex over the renderer file plus every relative `.js` import
it splices in (`rendererSourceWithLocalImports`, line 48). Any `.url`
anywhere in that text satisfies `PrCheckRun.url`: a different payload's
field, a DOM property, or a doc comment. It does not have to be a read of
the censused payload. A read-only probe that applies the test's own matcher
line by line found three censused fields held green by a match that is not
a read of the censused payload:

| Censused field | What actually satisfies the regex |
| --- | --- |
| `PrCheckRun.url` | `plan.pr.url`, the **PR's** own URL (`web/features/pr-review.ts:267`, `:270`, `:271`, `:359`), besides the real `check.url` reads at `:312`, `:325`, `:326` |
| `PoolIssue.claims` | `entry.claims` (`web/features/pool-client.ts:229`), which is `PoolClientEntry.claims: ClaimStanding[]` (`flight/pool-client.ts:503`), a different interface's derived field. The other match is a **doc comment**, `` entries[].claims[] `` in `web/pool-client-panel.ts:64` |
| `PublicityAffordance.id` | `desc.id = descId` (`web/features/publicity.ts:102`), a DOM element's `id` property, besides the real `affordance.id` read at `:98` |

Two live mutations turn that into observed false negatives against the real
test (`pnpm exec vitest run apps/dashboard/test/flight/payload-census.test.ts`,
each file restored with `git checkout --` right after, tree clean):

1. **Every `check.url` read removed** from `web/features/pr-review.ts`
   (three lines, `check.url` → `(void 0)`). The per-check chip loses its
   deep link to the check's log, which is exactly the "fetched and
   discarded at the client boundary" failure the census exists to stop.
   Result: **3/3 green.** `plan.pr.url` alone keeps `PrCheckRun.url`
   "rendered".
2. **The claims-ledger read removed** from `web/features/pool-client.ts`
   (`poolClaimLedgerText(entry.claims)` → `poolClaimLedgerText([])`). The
   panel stops painting who holds an issue. Result: **3/3 green.** The doc
   comment at `web/pool-client-panel.ts:64` is now the only `.claims`
   left, and it satisfies the regex on its own.

A second, smaller gap turned up while reading the file. The third case is
named "keeps the exclusion list honest — every excused field still exists
**and is still unread**" (line 138), but its body only checks that the field
still exists (line 154). It never re-runs the renderer match. If the pool
panel starts showing `labels` or `assignees`, their `EXCUSED` entries stay
behind with nothing to flag them, which is the silent carve-out the list's
own doc comment forbids.

One piece of drift: epic 0020's slice-6 row still lists only `PoolIssue` and
`PublicityAffordance`. `f8d766a6` added `PrCheckRun` to the census on
2026-09-10 and did not update the row.

## VERDICT

**Confirmed, and the split call is right.** A name-only static match cannot
tell "the renderer reads this payload's field" from "some token with the
same name appears in the renderer's text". The two mutations above show it
passing while a censused field is genuinely dropped. Three slices, each
independently shippable, in this order:

- **(a) Make the static matcher fail closed, and make the honesty check do
  what its name says.** Strip comments from the renderer text before
  matching. Give each `PAYLOAD_INTERFACES` entry the receiver names its
  renderer binds the payload to (`PrCheckRun` → `check`/`c`, `PoolIssue` →
  `issue`/`entry.issue`, `PublicityAffordance` → `affordance`), and match
  `\b(?:check|c)\.url\b` instead of a bare `\.url\b`. A renamed receiver
  then turns the census red, which is the safe direction. In the same
  slice, have the third case assert every `EXCUSED` field is still
  *unmatched*, and refresh epic 0020's slice-6 row to name `PrCheckRun`.
  This is a small, test-only change. Its acceptance test is the two
  mutations above, which must each turn the census red.
- **(b) A render-and-diff census, the sound version.** Boot the real client
  bundle the way `test/web/pool-client-link.test.ts` already does
  (`renderShell()` + `clientJs()` behind a mocked `fetch`). For each
  censused field, render the panel twice with only that field varied and
  assert the panel's DOM differs. That measures "reaches the browser"
  instead of inferring it from source text. It also covers fields that
  never render verbatim (`dormant`, `optional`, `state`'s glyph and class,
  `elapsedMs`'s formatted duration, `claims`' ledger text), which a
  sentinel-string check would miss. Once (b) is green for all three
  interfaces, (a)'s receiver lists can be retired.
- **(c) Extend the census past the three hand-verified interfaces**
  (`PrReviewCandidate`, `IssueTriageDossier`, the `MirrorPass*Finding`
  payloads, as the test's header already defers). This needs per-field
  adjudication of display versus decision-only fields, and it should land
  only after (a) or (b). Widening a check that passes on coincidence widens
  false confidence, not coverage.

This firing does not attempt (a) through (c). Its unit is the verification
and the proposals above.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief plus the regenerated
`docs/debriefs/README.md` index (`node scripts/docs/generate-debriefs-index.mjs`),
staged with a scoped `git add` of exactly those two paths. Both mutations
above were reverted in the same command that ran them, and `git status` was
clean afterwards. The commit touches documentation only: `docs/` is in
`.prettierignore`, ESLint's `files` globs target only source, and
`typecheck`/`test`/`build` are structurally unaffected.
