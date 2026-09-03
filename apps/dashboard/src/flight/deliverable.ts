// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * DELIVERABLE verifier (BACKLOG web-msnqeei0-71zb5a). A board task's title
 * can carry a trailing `DELIVERABLE: <clause>` — a plain-English description
 * of what "done" looks like. A firing that self-reports
 * `"completion":"complete"` on such a task is trusted by fly.ts's
 * markTaskDoneIfShipped, same as any other claim, UNLESS this cheap
 * grep-style check contradicts it: if the shipping commit's own patch
 * mentions none of the clause's significant words, the claim is almost
 * certainly a false complete — the change doesn't even mention what it says
 * it delivers — and gets demoted to a slice instead of silently closing the
 * task on an unbacked claim.
 */

import { touchedFilesInPatch } from './patch-files.js';

const DELIVERABLE_MARKER = 'DELIVERABLE:';

/** Common words too generic to prove or disprove any DELIVERABLE clause. */
const STOPWORDS = new Set([
  'that',
  'this',
  'with',
  'from',
  'into',
  'onto',
  'over',
  'under',
  'live',
  'real',
  'after',
  'before',
  'both',
  'each',
  'when',
  'what',
  'then',
  'than',
  'have',
  'been',
  'also',
  'only',
  'some',
  'more',
  'most',
  'such',
  'same',
  'very',
  'just',
  'does',
  'doing',
  'itself',
  'their',
  'there',
  'these',
  'those',
  'across',
  'about',
  'every',
]);

/** Extracts a task title's trailing `DELIVERABLE: <clause>` text, or null if it has none. */
export function extractDeliverable(title: string): string | null {
  const idx = title.indexOf(DELIVERABLE_MARKER);
  if (idx === -1) return null;
  const clause = title.slice(idx + DELIVERABLE_MARKER.length).trim();
  return clause.length > 0 ? clause : null;
}

/**
 * Lowercased, deduped, stopword-filtered words (>=4 chars) — the cheap grep
 * terms drawn from a DELIVERABLE clause. Splits on a single non-alphanumeric
 * char rather than a run of them (`+`): a run of separators just yields
 * extra empty tokens, and the `length >= 4` filter below discards those
 * regardless, so merging them buys nothing.
 */
export function deliverableKeywords(deliverable: string): readonly string[] {
  const words = deliverable
    .toLowerCase()
    .split(/[^a-z0-9]/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return Array.from(new Set(words));
}

/**
 * True when a keyword appears in the haystack, tolerating a plural↔singular
 * mismatch (e.g. a DELIVERABLE clause says "tooltips" but the diff only says
 * "tooltip"): a naive trailing-"s" strip, not real stemming — cheap on
 * purpose. The reverse direction (singular keyword, plural haystack word)
 * needs no special case: "tooltip" is already a substring of "tooltips".
 */
function keywordMatches(keyword: string, haystack: string): boolean {
  if (haystack.includes(keyword)) return true;
  if (!keyword.endsWith('s')) return false;
  const singular = keyword.slice(0, -1);
  return singular.length >= 4 && haystack.includes(singular);
}

/**
 * True when the shipping commit's patch text mentions at least one keyword
 * from the DELIVERABLE clause. This is a fast plausibility check, not a
 * semantic proof of the deliverable — it exists to catch the obvious false
 * complete (a change that shares no vocabulary at all with what it claims to
 * deliver), not to validate genuinely ambiguous claims. A clause with no
 * checkable keywords (e.g. entirely stopwords) can't be contradicted, so it
 * passes rather than blocking on an unparseable claim.
 */
export function verifyDeliverable(deliverable: string, patch: string): boolean {
  const keywords = deliverableKeywords(deliverable);
  if (keywords.length === 0) return true;
  const haystack = patch.toLowerCase();
  return keywords.some((k) => keywordMatches(k, haystack));
}

/**
 * Words in a DELIVERABLE clause that promise a user-facing capability —
 * triggers the UX-EXPRESSION DOCTRINE check below (web-msnqqjl9-6v8zio).
 * Deliberately short-word-friendly (unlike STOPWORDS-filtered
 * deliverableKeywords): "UI" and "docs" are exactly the signal, not noise.
 */
const UX_SIGNAL_WORDS = new Set([
  'ui',
  'ux',
  'panel',
  'panels',
  'chip',
  'chips',
  'button',
  'buttons',
  'tooltip',
  'tooltips',
  'docs',
  'doc',
  'visible',
  'visibly',
  'renders',
  'rendered',
  'render',
  'keyboard',
  'aria',
  'accessible',
  'accessibility',
  'axe',
  'card',
  'cards',
  'view',
  'element',
  'widget',
  'dashboard',
  'page',
  'screen',
  'toggle',
  'menu',
  'dialog',
  'modal',
]);

/**
 * True when a DELIVERABLE clause promises a user-facing capability (an
 * unfiltered word overlap with UX_SIGNAL_WORDS), the trigger for the
 * UX-EXPRESSION DOCTRINE check below. No `.filter(Boolean)` needed: every
 * word in UX_SIGNAL_WORDS is non-empty, so an empty split token (from a
 * leading/trailing/doubled separator) can never satisfy `.has()` below and
 * needs no separate pass to discard.
 */
export function promisesUxExpression(deliverable: string): boolean {
  const words = deliverable.toLowerCase().split(/[^a-z0-9]/);
  return words.some((w) => UX_SIGNAL_WORDS.has(w));
}

/**
 * True when the patch touches a surface a user can actually reach — the
 * dashboard's browser-facing `web/` layer (source or test) or a `docs/*.md`
 * entry — the "real UI element or a Docs entry" half of the UX-EXPRESSION
 * DOCTRINE. Backend/engine-only files don't count even if their prose
 * happens to use UI words (e.g. a prompt string mentioning "docs").
 */
function touchesUserFacingSurface(patch: string): boolean {
  return touchedFilesInPatch(patch).some(
    (f) => f.includes('/web/') || (f.startsWith('docs/') && f.endsWith('.md')),
  );
}

/**
 * UX-EXPRESSION DOCTRINE, machine-checked (web-msnqqjl9-6v8zio): a
 * "complete" claim whose DELIVERABLE clause promises a user-facing
 * capability must touch a UI/Docs surface, not backend logic alone — a
 * capability nobody can see or reach is a slice, no matter how green the
 * gate. A clause with no UX signal words isn't claiming a user-facing
 * capability at all, so it passes untouched (most DELIVERABLE clauses are
 * backend/API/infra work with no UX component to demand).
 */
export function verifyUxExpression(deliverable: string, patch: string): boolean {
  if (!promisesUxExpression(deliverable)) return true;
  return touchesUserFacingSurface(patch);
}
