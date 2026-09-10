<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-mtuks0jr-1`: ATTRIBUTION 2/3 spread-line claim — refuted

Board: `ap-mtuks0jr-1` (VERDICT close, targeting `web-mtt056ng-zt77x5`) —
"ATTRIBUTION 2/3 spread-line already wired+tested (github-identity-disclosure.ts,
planGithubIssue/planGithubPr)".

## What `docs/ATTRIBUTION.md` actually specifies for channel 2

`docs/ATTRIBUTION.md`'s four channels are distinct requirements. Channel 2
("PRs / issues an instance files") specifies a literal format:

```
🛩️ Flown by [AUTOPILOT](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT) vX.Y.Z
```

— a markdown link to the AUTOPILOT project plus its version. The doc is
explicit that this channel EXTENDS a separate, older requirement (the
`.github/CONTRIBUTOR-STANDING.md` "identity law") "from 'disclose what you
are' to 'credit where it is due, in the form each medium expects'" — i.e.
channel 2 is additional, tool-credit content, not a restatement of the
identity law.

## Verification of the claim

1. **What `github-identity-disclosure.ts` actually emits.**
   `identityDisclosure()` (`packages/engine/src/github-identity-disclosure.ts:15-17`)
   produces:
   ```
   🛩️ Flown by AUTOPILOT on behalf of @${operatorHandle}

   Autopilot-Agent: true
   ```
   This is the `.github/CONTRIBUTOR-STANDING.md` identity-law disclosure
   (the "always discloses itself" / `Autopilot-Agent:` marker requirement,
   board `web-mtq07kf7-lylkor`) — not ATTRIBUTION.md's channel-2 spread-line.
   It carries neither a markdown link to the AUTOPILOT repo nor a version
   number, and it carries text (`on behalf of @operator`, the
   `Autopilot-Agent:` marker) that channel 2's literal spread-line does not
   call for at all.

2. **`planGithubIssue`/`planGithubPr` only ever call this same function.**
   `packages/engine/src/github-contribute.ts:67-68` and
   `packages/engine/src/github-pr-contribute.ts:122-123` both append
   `identityDisclosure(...)` to the body — the identity-law text above,
   unchanged. Neither file imports or constructs anything resembling the
   channel-2 spread-line.

3. **No version constant exists to build a `vX.Y.Z` spread-line from.** A
   repo-wide search for `AUTOPILOT_VERSION` / `export const VERSION` /
   `autopilotVersion` in `apps/dashboard/src` and `packages/engine/src`
   returns nothing. The spread-line's `vX.Y.Z` segment has no source to
   read from today — this is not "wired but untested", the version
   plumbing itself does not exist yet.

4. **Tests assert only the identity-law text, never the spread-line.**
   `packages/engine/test/github-contribute.test.ts` and
   `packages/engine/test/github-pr-contribute.test.ts` assert the exact
   string `🛩️ Flown by AUTOPILOT on behalf of @copilot\n\nAutopilot-Agent: true`
   in every relevant case (e.g. `github-contribute.test.ts:47,98`,
   `github-pr-contribute.test.ts:79,164,179`). No test in either file, or
   anywhere in the repo, asserts the literal channel-2 string containing
   `[AUTOPILOT](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT) v`.

5. **The repo link does appear elsewhere, in a different channel's format.**
   `apps/dashboard/src/flight/discussions-triage.ts:141` uses
   `[what is this?](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT)` —
   this is channel 3 (conversations), format
   `— ✈️ AUTOPILOT agent, on behalf of @<operator> · [what is this?](<link>)`,
   confirmed by `discussions-triage.test.ts:98,107`. It is a real,
   separately-shipped channel — but it is channel 3, not channel 2, and it
   still carries no version number.

## VERDICT

**Refuted.** `github-identity-disclosure.ts`'s `identityDisclosure()` (used
by `planGithubIssue`/`planGithubPr`) implements the
`.github/CONTRIBUTOR-STANDING.md` identity law, not ATTRIBUTION.md's
channel-2 spread-line. The two share the `🛩️ Flown by AUTOPILOT` prefix by
coincidence of wording, but the literal spread-line
(`[AUTOPILOT](<link>) vX.Y.Z`) is not present in either the implementation
or its tests, and the version-number plumbing it would need does not exist
yet. Channel 2 remains open work. This firing leaves `web-mtt056ng-zt77x5`
itself untouched (per the VERDICT-processing protocol, a verdict's target
is evidence for this report, never an invitation to build it) — a future
firing should either (a) implement the literal channel-2 spread-line
alongside a version-constant source, or (b) if the operator judges the
identity-law text sufficient credit on its own, amend ATTRIBUTION.md to say
so explicitly rather than leaving the two specs silently divergent.

## Verification note for this firing's own METRICS

This firing's unit of work is this debrief file plus `.autopilot-intent`
(git-ignored, not part of the commit), added with a scoped `git add
<this-path>`. It is a pure documentation addition: `docs/` is excluded from
`prettier --check .` (`.prettierignore`) and from ESLint's configured
`files` globs (`eslint.config.js` targets only `*.ts`/`*.mjs`/`*.js`), and
it adds no source or test code, so `typecheck`/`build`/`test` are
structurally unaffected by it.
