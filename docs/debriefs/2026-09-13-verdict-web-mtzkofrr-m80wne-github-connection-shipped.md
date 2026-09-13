<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `web-mtzkofrr-m80wne`: EPIC 0029 S2 GitHub connection is already fully shipped

Board (high): "EPIC 0029 S2 GITHUB CONNECTION: the Connect popover gains
GitHub verbs — log in (`gh auth login --web`, the one-time code relayed to
the screen), switch account, log out — each a preview/execute pa[ir]…"
Ranked #7 this firing; see Deviation below for why ranks #1–#6 were passed
over first.

## Verification of the claim

**The three verbs exist end to end.** `connection/gh-login.ts`'s
`GH_AUTH_KINDS = ['login', 'switch', 'logout']` maps each to one fixed `gh
auth …` literal (`gh auth login --web --git-protocol https`, `gh auth
switch`, `gh auth logout`) and a per-platform terminal launcher
(`ghTerminalCommand`, mirroring `login.ts`'s `loginTerminalCommand` for the
Claude button). `server/gh-connection.ts`'s `handleGhAuth` wires `POST
/api/connection/gh/<kind>`: 404 when the `GhApi.auth` capability isn't
wired, 405 off `POST`, 415 without an `application/json` Content-Type (the
same CSRF guard every state-changing route here uses), 200 + the launched
command otherwise. `web/features/connect.ts`'s `ghAuth(kind)` POSTs the verb
and `paintGhAuth(s)` shows exactly `login` when `gh` isn't authenticated and
adds `switch`/`logout` once it is, with the whole GitHub section hidden when
`gh` itself isn't installed (`s.present`).

**Tests pass clean.** Ran the full suite touching this surface from a clean
tree:

```
npx vitest run gh-login gh-probe connect server
Test Files  36 passed (36)
     Tests  681 passed (681)
```

Directly relevant: `connection/gh-login.test.ts` (7), `connection/gh-probe.test.ts`
(8), `server/gh-connection.test.ts` (16), `web/features/connect.test.ts` (20),
`web/connect-panel.test.ts` (48).

**One deliberate divergence from the board title's literal wording.** The
board text parenthesizes login as "the one-time code relayed to the
screen." The shipped design does not do that: `gh-login.ts`'s own doc
comment and epic 0029 slice 2's note both say the code prints inside the
terminal `gh` itself opens, and AUTOPILOT never reads or relays it —
relaying would mean AUTOPILOT driving the auth flow on the operator's
behalf, which epic 0006's law forbids. This reads as a documented
refinement made while building the slice (the board title predates it,
seeded 2026-09-12 before slice 2 shipped 2026-09-13), not a gap: the
capability the title actually asks for — log in / switch / log out reachable
from the Connect popover, each a distinct guarded verb — is present and
tested exactly as epic 0029 §Slices item 2 describes it as "Shipped
2026-09-13."

## VERDICT

**Close — already fully shipped.** All three GitHub auth verbs are reachable
from the Connect popover's GitHub section, each opens a terminal running one
fixed, never-user-input `gh auth` command (POST-only, CSRF-guarded, 404 when
unwired), and the popover's own status line re-reads `gh auth status`
afterward. The one wording mismatch (code shown in-terminal vs. "relayed to
the screen") is a principled, previously-documented design choice, not
missed work. No further slice is actionable here.

## Deviation note (PICK DISCIPLINE)

`picked_rank: 7`. Ranks #1–#6 were checked first and each ruled out on its
own evidence, not skipped for convenience:

- **#1 `web-mtvpuoj4-tv1z09`** (EPIC 0020 S8 diagnose/fix a red check): the
  classifier, its API route, and the 🔧 Diagnose button are already shipped
  (`flight/check-diagnosis.ts`, `createCheckDiagnosisApi`,
  `web/features/pr-review.ts`'s `data-pr-diagnose` wiring). The one piece
  the epic itself still lists open — preparing an actual fix commit and a
  diff-for-approval UI for the `defect` verdict — requires generating a
  correct code change for an arbitrary red check, an open-ended capability
  well beyond one firing's budget, not a bounded implementation gap.
- **#2 `web-mtsylqbd-q2rg8k`** (EPIC 0019 additive-only regression-test
  law): already assessed today by re-reading
  `docs/debriefs/2026-09-13-verdict-web-mtt3f7j6-3bj899-role-gated-dashboard-shipped.md`,
  which reached the same conclusion this session would have: this is a
  standing law binding *future* steward slices, and auditing whether the
  two shipped slices (`taxonomy-seed.ts`, `mirror-pass.ts`) regression-test
  every neighboring flow (claim ledger, KEEPER rituals, auto-merge, issue
  templates) is a materially larger cross-cutting audit than one firing.
- **#3 `web-mtrh1hlh-62l41b`** (EPIC 0019 S3 issues⇄board mirror): the
  "board task done ⇒ close issue with landing SHA" half is shipped
  (`mirror-pass.ts`'s settle-finding path). The remaining half — "issue
  labeled/milestoned by the maintainer ⇒ board priority follows" — means
  translating a categorical GitHub label onto `tasks.priority`, which this
  codebase defines as a *relative ordering position* shared across the
  whole fleet's triage (`packages/store/src/mutate.ts`'s `reorderTasks`,
  consumed by every instance's `runBoardTriage`). Landing a first cut of
  that mapping blind, without design sign-off on how a label reorders
  everyone else's queue, is exactly the high-blast-radius change the gate
  numbers ask me to avoid — this needs a scoped design pass, not a rushed
  slice.
- **#4–#6 (`web-mtywp7wk-tkdwhi` pipeline redesign, `web-mtywp7to-rbebh4`
  docs reader, `web-mtywp82m-zodn7z` tasks screen):** all three epics
  (0024, 0023, 0026) are marked `Status: Draft` with no slice shipped yet —
  ground-up UI builds, not small/certain single-firing units.

Rank #7 was concretely verifiable end-to-end with clean evidence of already
being fully done, so it was closed instead.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file, added with a scoped
`git add <this-path>` — the only file staged. Pure documentation: `docs/` is
excluded from `prettier --check .` (`.prettierignore`) and from ESLint's
configured `files` globs (`eslint.config.js` targets only
`*.ts`/`*.mjs`/`*.js`), so it adds no source or test code and
`typecheck`/`build` are structurally unaffected. The 681 tests above were
already run in full during verification and passed clean.
