<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Translation doctrine — native quality, or nothing

Binding for EVERY task that adds or edits a non-English string (UI
`STRINGS`, the LLM issue composer's report language, docs translations).
Born from an operator catch (2026-09-07): the landing panel said
"אין מה לנחות" — but לנחות is intransitive (the plane lands); landing
*something* is להנחית. A native speaker winces; a calque never notices.

## The laws

1. **Native phrasing beats literal mapping.** Translate the MEANING a
   native UI would use, never word-by-word English. Test: "would a
   fluent speaker say this sentence, unprompted, in this register?"
   If unsure, rewrite the thought from scratch in the target language.
2. **Grammar is load-bearing.** In Hebrew specifically: verb binyan
   (עומד/יוצא — לנחות vs להנחית), gender agreement, smichut vs של,
   register (UI = plain modern; no archaisms, no slang). Equivalent
   care per language (e.g. German case/compounds, French register).
3. **Authoritative sources, not vibes.** When coining or checking a
   term, consult the language's normative authority and living
   dictionaries — for Hebrew: the Academy of the Hebrew Language
   (hebrew-academy.org.il, including its term database), plus a modern
   dictionary (e.g. Rav-Milim/Morfix) for how the word actually lives.
   A translation task MAY and SHOULD use WebSearch/WebFetch on these
   sources when any term is in doubt; cite the source in the commit
   body for coined terms.
4. **Never invent words** (the composer's language law, generalized):
   if the right term is unknown and sources do not settle it, keep the
   English term in Latin script rather than fabricate — an honest
   loanword beats a fake Hebrew word.
5. **Review pass is part of the slice.** An i18n slice is not done at
   "strings compile": the final step is reading every added string
   ALOUD as a native user would meet it, in context (which panel, what
   moment), and fixing what winces. Parity tests keep the tables
   aligned; only this pass keeps them right.
6. **RTL is grammar too.** Punctuation placement, bidi isolation of
   Latin/technical fragments inside RTL sentences (the fenced-English
   rule), and number formatting follow the target language's rules.

## Standing debt

The existing Hebrew table (300+ keys) predates this doctrine — a full
native-quality audit pass over `packages/tokens/src/strings.ts` is
boarded; findings fix in place, one commit per panel-sized batch.
