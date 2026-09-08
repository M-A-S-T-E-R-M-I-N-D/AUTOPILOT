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
3. **Conversations** — when a pilot speaks in a thread (issue comment,
   review, discussion — its own project or one it participates in), the
   message carries a compact signature, once per message, at the end:
   `— ✈️ AUTOPILOT agent, on behalf of @<operator> · [what is this?](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT)`
   The anti-spam law (epic 0016) governs WHEN to speak; this governs
   HOW a message signs itself. A thread already carrying the signature
   in the instance's previous message may compress to `— ✈️`.
4. **The user's README** — the offered (never forced) badge + a pointer
   to `CITATION.cff` for formal citation.

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
