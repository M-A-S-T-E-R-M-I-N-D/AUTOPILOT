<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Closing `docfresh-docs-flight-containment-md-1790945497000`: the doc caught up to its subject four hours later

Board: "DOC-FRESHNESS: docs/FLIGHT-CONTAINMENT.md may be stale — packages/engine/src/guard-hook.ts
changed more recently". The id's suffix is the subject's last-touch time the sweep saw,
1790945497000 ms. That is `ebbf5796` (2026-10-02 15:51:37 +0300, "feat(engine): a Codex lane
reports the tool calls its guard hook denied (epic 0036)"). This firing set out to refresh the doc
and found it already refreshed.

## The drift was real, and it was fixed the same evening

`ebbf5796` added the per-run deny-log argument to `CodexCliModel`'s `guardHookCommand` and the
`guardHookDenialsFromLog` read-back, so `guard-hook.js` could report denials Codex's own
`exec --json` stream never surfaces. At that moment `FLIGHT-CONTAINMENT.md` had not seen it yet.

`23f33800` (2026-10-02 19:48:55 +0300, "docs(containment): the containment doc catches up to the
Codex deny log") caught it up four hours later. The doc's Codex paragraph (lines 101-114) now
names the deny-log mechanism by its exact pieces: `guardHookCommand`'s `-c hooks.PreToolUse=…`
override, the per-run deny log named as the hook command's third argument, `guard-hook.js`
appending every deny it prints there, and `codexGuardDenialsFromLog` reading it back into
`guardDenials`.

## At HEAD

- `git diff 23f33800 HEAD -- packages/engine/src/guard-hook.ts` is empty — unchanged since the
  doc's last commit.
- All three of the doc's `DOC_SUBJECTS` entries (`apps/dashboard/src/flight/doc-freshness.ts`)
  are at or before the doc's own last touch:
  - `packages/engine/src/containment.ts` — 1788468250 (`f6a2829f`)
  - `packages/engine/src/guard.ts` — 1790868135 (`b9d7a62f`)
  - `packages/engine/src/guard-hook.ts` — 1790945497 (`ebbf5796`)
  - `docs/FLIGHT-CONTAINMENT.md` itself — 1790959735 (`23f33800`)

  Every subject is older than the doc. `computeDocDrift` finds nothing to report.

## Why the row did not retire itself

The sweep's prune only defers rows still in `needs_approval` (`findStaleDocFreshnessProposalIds`
is the mint-side counterpart, not an automatic retirement); this row reached the board, so a
firing has to close it by hand, same limit the [epic 0007](2026-09-29-docfresh-epic-0007-caught-up-closed.md)
and [MODEL-CARD](2026-09-29-docfresh-model-card-lane-revert-phantom-closed.md) closes already
recorded.

## Left alone

- **The doc itself.** No content change is warranted — `23f33800` already said everything
  `ebbf5796` needed said.
- **The sweep.** Its design already defers this to the operator/a firing; not this firing's
  place to change.

## Outcome

Nothing to refresh. The doc has recorded `ebbf5796`'s `guard-hook.ts` change since `23f33800`,
and none of its three tracked subjects have moved since. The task
`docfresh-docs-flight-containment-md-1790945497000` is complete with this evidence.
