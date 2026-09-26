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

   **Wired (2026-09-09):** `packages/engine/src/prompt.ts`'s `buildFiringPrompt`
   splices the trailer instruction into COMMIT step 5, next to the existing
   Model/Firing-Prompt-Version/Harness provenance trailers, whenever the
   caller supplies a running `productVersion` — `apps/dashboard/src/fly.ts`
   passes `info.ts`'s `PRODUCT_VERSION` on every firing. The module itself
   stays pure (no `process.env` read): `fly.ts` resolves the opt-out via the
   SAME `flight/attribution.ts`'s `attributionEnabled()` channel 3 already
   uses, so the one lever still covers channel 1 too.
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
   because a retry fired after the first had landed) — judged on what the
   two messages say, the `— ✈️` signature stripped from both, since the
   guard runs before signing and a footer alone once sank a short retry
   below the ratio — and a post that
   would be the third consecutive message is EDITED onto the tail as a
   dated `**Update:**` block instead. `flight/gh-exec.ts` is the one
   guarded exec every posting path defaults to, census-pinned so a new
   module cannot default back to the raw one. It fails OPEN: if the
   thread cannot be read, the message posts — a guard that eats a
   maintainer's reply when GitHub blinks is worse than the flood.
   `pnpm audit:board-flood` sweeps for what still gets through.
4. **The user's README** — the offered (never forced) badge + a pointer
   to `CITATION.cff` for formal citation.

   **Wired (2026-09-09):** [`docs/BADGE.md`](BADGE.md) carries the
   shields.io snippet and the `CITATION.cff` pointer, written for a
   maintainer to paste in voluntarily. Unlike channels 1-3, no ritual here
   ever writes to a user's README, so there is no opt-out lever to wire —
   the offer itself is the whole implementation.

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

## The target repository's policy beats ours (2026-09-14)

Researched before building, because the answer was not what we expected.
Three findings changed the design, and a future firing that "helpfully"
standardises the format everywhere will break all three.

**There is no common format, and the projects that care most disagree.**

| Project | Its rule |
|---|---|
| Linux kernel | `Assisted-by: LLM` required; an agent MUST NOT add `Signed-off-by` |
| LLVM | `Assisted-by: <assistant>` recommended, issues and PR comments included |
| Apache Software Foundation | `Generated-by:` recommended, not required |
| Kubernetes | **forbids** the `assisted-by`/`co-developed` trailer; prose in the PR instead |
| Homebrew | must disclose the tool in the issue or PR, but **no AI commit trailer** |
| attrs, pip, requests | "no LLM bots in `Co-authored-by:`s" |
| curl | disclosure **mandatory on issues**, not on PRs |
| NumPy | must name the tool AND what it generated; autonomous agent PRs not accepted |
| QEMU, Gentoo | AI-generated contributions banned outright |

One fixed format emitted everywhere violates somebody's policy by
construction. `packages/engine/src/provenance.ts` therefore picks a
profile per target from the target's OWN published policy text, and an
unread policy resolves to `minimal` — failing toward less output, because
emitting more than a project allows is the expensive mistake and emitting
less is merely quiet.

**The Linux kernel deliberately removed the model name.** Its policy first
required `Assisted-by: AGENT:MODEL_VERSION`. In August 2026 that was
simplified to plain `Assisted-by: LLM`, with five reviewers, for a reason
worth quoting: naming the model "provides free advertising to proprietary
software companies while adding little or no useful information." This is
the most-scrutinised decision anyone has published on the question, and it
went AGAINST naming the model and its vendor. Academia goes the other way
— ICMJE and Elsevier both require naming the tool. The split is real and
unresolved, which is why the model name is a per-profile choice here rather
than a doctrine.

**The clause with legal weight is the review state, not the model name.**
EU AI Act Article 50 has applied since 2026-08-02, and Article 2(12)'s
open-source exemption expressly does not cover it. The Commission's
guidelines put source code and its integral comments outside Article 50(2),
but say nothing about issue bodies, PR descriptions or comments. Article
50(4)'s carve-out is the exit: text a human reviewed before publication,
with a person holding editorial responsibility, needs no label. The ASF
states the same rule in one sentence — **review it before you publish it,
or label it** — and Anthropic's usage policy requires that review
independently, treating automatic generation published for external
consumption as a high-risk use case. So every artifact carries whether a
human reviewed it, and says so in words.

**Cost and tokens do not go on a public artifact.** Our own figure is API
list price, of which cache reads are most, self-reported by the agent whose
performance it describes (`docs/MODEL-CARD.md`, `docs/RESEARCH-LIBRARY.md`).
A maintainer reads "$2.40" as what their project cost someone; it is not.
No provenance standard carries a money field — not C2PA, not SPDX 3.0's AI
profile, not CycloneDX, not W3C PROV. The cross-pilot cost table is a good
feature and it belongs on AUTOPILOT's own dashboard, where the caveats
travel with the number and the reader can interpret them.

One note on the section below: keeping a contributor's `Co-authored-by`
trailer in history remains right. But it is not a pattern to propagate —
several major projects now forbid that form, and nothing here emits one.

## AI co-authors that arrive in someone else's contribution

A contribution can carry a model's own `Co-authored-by` trailer, added by
the CONTRIBUTOR's local tooling rather than by anything here. AUTOPILOT has
exactly one so far: `Co-authored-by: Claude Opus 5 <noreply@anthropic.com>`
on the commit that landed PR #47 (@gabibi555's fix for the update loop —
the update sequence never compiled the source it had just pulled). Their
Claude Code session wrote it; our engine did not, and channel 1's
`Assisted-by` trailer is a different line for a different purpose.

The policy, in two halves:

- **Keep the credit.** A trailer a contributor chose to add is theirs to
  add, it is accurate, and rewriting someone's commit message to strip a
  co-author would be both rude and dishonest. It stays in the log.
- **Never file in a model's name.** No application, issue, comment or
  standing entry is ever opened "from" a model, however real its help was.
  There is no account behind that trailer to consent, and an instance that
  invents an identity breaks the signing law above. The credit lives where
  the contributor put it — in the commit — and nowhere it would read as a
  person who applied to join.

This is the same asymmetry the signing section draws: tools get credited,
humans get counted.

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

  **Wired for channel 3 (2026-09-09):** `flight/attribution.ts`'s
  `withAttribution()` checks the env var before the identity lookup and
  posts unsigned when it is `off` — no extra `gh api user` call spent on a
  signature that will not be added.

  **Wired for channel 1 (2026-09-09):** `fly.ts` resolves the SAME
  `attributionEnabled()` before calling `buildFiringPrompt`, so
  `AUTOPILOT_ATTRIBUTION=off` drops the commit-trailer instruction too —
  one function, checked once per firing, gating two channels. Channel 4
  (the README badge, `docs/BADGE.md`) has nothing to gate — no ritual ever
  writes to a user's README, so there is no default-on behavior to opt out
  of in the first place. Channel 2's `identityDisclosure()` folds the
  credit line into the SAME footer text as the identity law's own mandatory
  self-disclosure (CONTRIBUTOR-STANDING.md, non-optional) — the lever
  cannot switch off one half of a single fused string without also
  suppressing the identity law, so it is deliberately left unwired there
  until that footer is split back into two independently-gateable lines.

## Wiring map (for the fleet)

Every `gh` argv that posts text runs through one shared
`withAttribution()` helper — pr-review execute, issue-triage comments,
mirror-pass landing notes, report-from-here issue bodies, social-pass
(when its executor ships), and the steward's future verbs. One helper,
one test fixture, zero drift.
