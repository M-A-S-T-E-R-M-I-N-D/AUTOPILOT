// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Reciprocal Rank Fusion — the fusion half of the hybrid ranker (M4 RAG;
 * docs/ECOSYSTEM-RESEARCH.md §2). RRF combines multiple ranked lists (BM25
 * keyword ranks + vector-similarity ranks) using rank POSITIONS only, so the
 * incompatible score scales of FTS5 and cosine distance never need calibrating:
 *
 *   score(d) = Σ over lists  1 / (k + rank_of_d_in_list)
 *
 * k = 60 per the original Cormack/Clarke/Buettcher paper — it damps the
 * influence of any single retriever's top ranks. Pure math, zero dependencies;
 * the sqlite-vec vector leg plugs into this without touching the fusion.
 */

/** The standard damping constant from the RRF paper. */
export const RRF_K = 60;

export interface FusedRank {
  readonly id: string;
  readonly score: number;
}

/**
 * Fuse ranked id lists (best first) into one consensus ranking, best first.
 * Documents appearing in several lists accumulate score from each; ties keep
 * first-appearance order (stable, deterministic).
 */
export function reciprocalRankFusion(
  rankedLists: readonly (readonly string[])[],
  k: number = RRF_K,
): FusedRank[] {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    // Stryker disable next-line EqualityOperator: `rank <= list.length` runs one
    // extra iteration where `list[rank]` is `undefined` at any array density
    // (index === length is always out of bounds) — the guard below skips it,
    // so output is identical either way. Provably equivalent, not killable.
    for (let rank = 0; rank < list.length; rank += 1) {
      const id = list[rank];
      if (id === undefined) continue;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    }
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
