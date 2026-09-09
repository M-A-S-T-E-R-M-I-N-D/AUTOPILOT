<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Attribution doctrine — credit that spreads, rights that stay honest

Binding for every artifact and every MESSAGE an AUTOPILOT instance
produces outside its own working tree (operator directive, 2026-09-08).
Extends the identity law (CONTRIBUTOR-STANDING) from "disclose what you
are" to "credit where it is due, in the form each medium expects".

## The four channels

1. **Commits on a user's project** — the human stays `Author`; the tool
   earns a trailer:
   `Assisted-by: AUTOPILOT vX.Y.Z <https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT>`
2. **PRs / issues an instance files** — body ends with the spread-line:
   `🛩️ Flown by [AUTOPILOT](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT) vX.Y.Z`

   **Wired (2026-09-09):** folded into the existing identity-law disclosure
   footer (`.github/CONTRIBUTOR-STANDING.md`) rather than stacked as a
   second line — `packages/engine/src/github-identity-disclosure.ts`'s
   `identityDisclosure()`, shared by `github-contribute.ts`'s
   `planGithubIssue` and `github-pr-contribute.ts`'s `planGithubPr` (the
   "contribute upstream" epic 0006 flow — currently the only filing path
   with a disclosure footer to extend). `mirror-pass.ts` and
   `report-from-here.ts` also run `gh issue create`, but both file against
   AUTOPILOT's OWN repo as self-management rituals, not "on a user's
   project" — outside this channel's frame, left unwired.
3. **Conversations** — when a pilot speaks in a thread (issue comment,
   review, discussion — its own project or one it participates in), the
   message carries a compact signature, once per message, at the end:
   `— ✈️ AUTOPILOT agent, on behalf of @<operator> · [what is this?](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT)`
   The anti-spam law (epic 0016) governs WHEN to speak; this governs
   HOW a message signs itself. A thread already carrying the signature
   in the instance's previous message may compress to `— ✈️`.

   **The edit-over-append law (operator, 2026-09-09):** before posting,
   CHECK the thread's tail. If this identity is already the last
   commenter and the new content updates or supersedes what that
   message said, EDIT the existing message instead of stacking another
   — append an `**Update (YYYY-MM-DD):**` block at its end, preserving
   the original text above it (GitHub keeps edit history; readers keep
   one message to read). Post a NEW message only when the last word
   belongs to someone else, or the content is a genuinely separate
   subject. Two consecutive messages from the same identity is the
   ceiling; three is a cleanup bug (issue #16 carried exactly that
   before this law).

   **Enforced, not merely written (2026-09-09):** the law is a wrapper
   now. `flight/anti-flood.ts` inspects every `gh issue|pr comment` argv
   before it runs — a >=90%-similar message from this identity already on
   the thread is a clean no-op (PR #33 received the same approval twice
   because a retry fired after the first had landed), and a post that
   would be the third consecutive message is EDITED onto the tail as a
   dated `**Update:**` block instead. `flight/gh-exec.ts` is the one
   guarded exec every posting path defaults to, census-pinned so a new
   module cannot default back to the raw one. It fails OPEN: if the
   thread cannot be read, the message posts — a guard that eats a
   maintainer's reply when GitHub blinks is worse than the flood.
   `pnpm audit:board-flood` sweeps for what still gets through.
4. **The user's README** — the offered (never forced) badge + a pointer
   to `CITATION.cff` for formal citation.

## Signing & DCO — the human always signs as themself

`Author` and `Signed-off-by` are ALWAYS the contributing human's own
identity — their name, their email, their DCO certification. An
AUTOPILOT instance never signs as the upstream maintainer and never
invents an identity: it inherits whatever `git config` the human set
(per-repo overrides respected, global untouched — the @gabibi555
precedent from #30/#32 is the canonical form). The engine hardcodes no
identity anywhere; the tool's credit lives ONLY in the `Assisted-by`
trailer, which certifies nothing and claims nothing. A pilot that finds
itself without a usable identity STOPS and asks its operator rather
than guessing — a wrong signature is a rights problem, not a default.

## Rights, stated plainly

- Content a pilot writes on behalf of an operator belongs to that
  OPERATOR (their account, their voice, their responsibility) — the
  credit line attributes the TOOL, it claims no ownership.
- AUTOPILOT itself is Apache-2.0 by 1337 · REL AZEUS · MΔSTERMIND;
  `CITATION.cff` is the canonical citation. The credit line must never
  misstate either.
- One opt-out lever covers all four channels
  (`AUTOPILOT_ATTRIBUTION=off`) — respected credit spreads, forced
  credit sours.

## Wiring map (for the fleet)

Every `gh` argv that posts text runs through one shared
`withAttribution()` helper — pr-review execute, issue-triage comments,
mirror-pass landing notes, report-from-here issue bodies, social-pass
(when its executor ships), and the steward's future verbs. One helper,
one test fixture, zero drift.
