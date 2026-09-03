// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure search-bar math: the remembered-queries autocomplete list, and the
 * project-picker diff signature — both client-only (no server counterpart),
 * so they live in `web/` rather than `shared/` (epic 0002 "shell
 * decomposition", slice 2: feature-module split of `shell.ts`), following
 * the same pattern `task-queue.ts`'s `moveTaskOrder` and `flights.ts`'s
 * `flightsSig` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `searchJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** The new remembered-query list after submitting `query` — any prior
 *  occurrence of `query` is dropped, `query` moves to the front, and the
 *  result is capped at `max` entries (oldest dropped first). Does not
 *  mutate `list`. */
export function rememberedHistory(list: readonly string[], query: string, max: number): string[] {
  const next = list.filter((prev) => prev !== query);
  next.unshift(query);
  const cap = Math.max(0, max);
  if (next.length > cap) next.length = cap;
  return next;
}

/** The fields {@link searchProjectsSig} reads off each project in the search
 *  bar's live project list. */
export interface SearchBarProject {
  readonly id: string;
  readonly name?: string;
  readonly slug?: string;
}

/** A diff signature for the search bar's project list — changes only when a
 *  project's id or displayed name/slug changes, so a live SSE tick that
 *  hasn't actually changed the project set never rebuilds the `<select>`
 *  and clobbers a mid-typed selection. */
export function searchProjectsSig(projects: readonly SearchBarProject[]): string {
  return projects
    .map((p) => p.id + String.fromCharCode(1) + (p.name || p.slug || p.id))
    .join(String.fromCharCode(2));
}

/** A `.search-hit` row's `data-tip`/`aria-label` pair. */
export interface SearchHitMeta {
  readonly tip: string;
  readonly ariaLabel: string;
}

/** The search results list's per-hit `data-tip`/`aria-label` math — language +
 *  relevance score (rounded to one decimal, "higher matches better") for the
 *  tip, with `path` prefixed onto the aria-label so screen readers get the
 *  file identity too, not just the score. D1 ATTRIBUTE PAYLOAD (epic 0015):
 *  the aria-label restates only the essential path/language/score facts —
 *  the tip alone carries the "(higher matches better)" explanatory clause,
 *  so the two attributes stop duplicating each other verbatim. */
export function searchHitMeta(path: string, language: string, score: number): SearchHitMeta {
  const scoreText = language + ' — relevance ' + score.toFixed(1);
  const tip = scoreText + ' (higher matches better)';
  return { tip, ariaLabel: path + ': ' + scoreText };
}
