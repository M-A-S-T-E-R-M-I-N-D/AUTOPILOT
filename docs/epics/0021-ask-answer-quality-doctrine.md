<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0021. ASK answer-quality doctrine — citations, honest refusals, escalation offer, native locale

Status: Done — all 4 doctrine pieces / 3 slices shipped: citations (`56752134`),
`lowConfidence` signal (`920e8081`), and the escalation-offer UI + `en`/`he`
strings (this commit).

Board task: `web-mtt5qwjp-xns6ps` ("ASK/ARCHITECT answer-quality doctrine (SOTA
in-app answers): grounded file:line citations in every answer, honest
not-in-scope refusals, Deep-tier escalation offer on low confidence, native
He/En per…" — the fleet digest truncates the title past this point, and no
fuller copy of it is committed anywhere in the repo).

**Why this spec exists now:** three firings (2026-09-09) already landed slices
against this task from nothing but the bare board title — exactly the
re-derive-from-a-summary risk `docs/epics/README.md` and epic 0012's own
opening section warn about (`docs/RESEARCH-LIBRARY.md`'s "7→10 ramp" entry put
a ~$9.2 price on three siblings independently re-deriving scope for one
task). This file makes the four-part doctrine, and each part's actual status,
a committed fact instead of something every future firing re-derives from
`git log --grep`.

## The four doctrine pieces, and where each stands

1. **Grounded file:line citations in every answer.** Shipped (`56752134`,
   bumped `ASK_PROMPT_VERSION`/`ASK_ESCALATION_PROMPT_VERSION` to `ask-v3`/
   `ask-escalation-v2`). `gatherAskSources`
   (`apps/dashboard/src/read/project-detail.ts`) numbers every retrieved
   excerpt line (`N|`) before it reaches the prompt; `buildAskPrompt` /
   `buildAskEscalationPrompt` (`packages/engine/src/ask.ts`) both instruct the
   model to cite `path:line`, not a bare path.
2. **Honest not-in-scope refusals.** Already true by construction, predating
   this board task — not a gap this epic needed to close. `buildAskPrompt`
   has always instructed the model: `If the excerpts do not contain the
   answer, reply exactly: "I don't see that in the indexed code." — do not
   guess.` (the exported `NO_ANSWER` constant); the zero-sources case gets its
   own static `NO_SOURCES_ANSWER` (`apps/dashboard/src/ask/service.ts`). Both
   are literal, deterministic refusal paths, never the model's own judgment
   call about scope.
3. **Deep-tier escalation offer on low confidence.** Split into a signal and
   an offer:
   - The **signal** shipped (`920e8081`): `askProject`/`askProjectStream` set
     `AskResult.lowConfidence: true` when the tier-1 answer trims to the exact
     `NO_ANSWER` string — sources existed but didn't answer the question, a
     stronger signal than the already-auto-escalating zero-sources case.
     Deliberately a literal-match check, not a "model judges its own answer
     insufficient" trigger — epic 0012's Out of scope section excludes that
     fuzzier trigger by name (the "Silent model downgrade" precedent), and
     this doctrine follows the same line. `AskApiResult`
     (`apps/dashboard/src/server/ask.ts`) passes it straight through both
     `/api/ask` and `/api/ask/stream`.
   - The **offer** — a UI affordance in the Ask panel
     (`apps/dashboard/src/web/features/search.ts`) that appears on
     `lowConfidence: true` and lets the operator flip Deep and re-ask in one
     click — is shipped. `applyAskStreamFrame` (`ask-stream.ts`) carries the
     terminal frame's `lowConfidence` through to `AskStreamUpdate`; `search.ts`'s
     `renderOffer()` renders a real `<button id="ask-offer">` (translated,
     keyboard-reachable) only when `lowConfidence` is true AND the request
     was not already Deep, clearing it on every new Ask. It never auto-fires
     Deep — the operator still clicks it.
4. **Native He/En.** The infrastructure this needs already exists and is
   mature — `@autopilot/tokens`'s `STRINGS` table, the
   `data-i18n`/`data-i18n-aria`/`data-i18n-template`/… attribute family,
   `tr()`, and `translateDom()` (`apps/dashboard/src/web/features/locale.ts`)
   — and the Ask panel is ALREADY wired into it (`askThinking`, `askSources`,
   `askActivity*`, `askDeepTip`, … all carry both `en` and `he` entries in
   `packages/tokens/src/strings.ts` today). Shipped alongside piece 3:
   `askLowConfidenceOffer`/`askLowConfidenceOfferTip` carry both `en` and `he`
   entries, and the offer button is tagged `data-i18n`/`data-i18n-tip` the
   same established way as every other Ask panel string.

## Constraints

- **`packages/tokens/src/strings.ts` is a hot shared file.** At the time this
  spec was written, another fleet lane had unlanded (uncommitted-to-base)
  work touching it — new keys landed here from a different lane concurrently
  would collide at sync-back, not just waste parallel effort. A firing
  picking up piece 3 MUST check current fleet state for unlanded work against
  this file before editing it, not assume this spec's snapshot still holds.
- The offer is a signal-driven affordance, not an automatic re-run — the same
  "operator decides" boundary the signal itself already respects (epic 0012
  Out of scope). It must never auto-fire Deep; it only makes the option easy
  to take.
- Same untrusted-model-output framing as the rest of Ask: the offer's copy is
  static (translated, never model-generated), so it opens no new injection
  surface.

## Out of scope

- A fuzzier, model-judged "this answer might be wrong" trigger beyond the
  literal `NO_ANSWER` match — the same exclusion epic 0012 already made, for
  the same reason.
- Persisting the operator's response to the offer (e.g. "always Deep") as a
  standing preference — matches epic 0012's own exclusion of a persisted
  Deep-toggle default.
- Rebuilding or restructuring the i18n foundation — it already exists
  (`locale.ts`, `STRINGS`); this epic only ever needed to USE it for one new
  string.

## Slices

1. Grounded file:line citations. Shipped, `56752134`.
2. `lowConfidence` signal (tier-1, sourced-but-refused case). Shipped,
   `920e8081`.
3. The escalation-offer UI + its `en`/`he` strings. Shipped — `search.ts`'s
   `renderOffer()`, `ask-stream.ts`'s `lowConfidence` passthrough, and the
   `askLowConfidenceOffer`/`askLowConfidenceOfferTip` string pair.

## Related

- Board `web-mtt5qwjp-xns6ps` — this spec's source task.
- `docs/epics/0012-agentic-ask-escalation.md` — the escalation tier this
  doctrine's signal feeds into; its Out of scope section is the precedent for
  excluding a model-judged auto-trigger here too.
- `apps/dashboard/src/ask/service.ts`, `apps/dashboard/src/server/ask.ts`,
  `packages/engine/src/ask.ts` — the doctrine's implementation.
- `apps/dashboard/src/web/features/locale.ts`,
  `packages/tokens/src/strings.ts` — the i18n foundation piece 4 reuses.
