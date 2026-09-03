// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The retrieval core (M4 chat/RAG foundation; REACTIVITY §1.1). A thin adapter
 * over the v4 `project_search` FTS5 table: index a file's content, then search it
 * with bm25 ranking + a match snippet. The trigram tokenizer makes queries match
 * substrings inside code identifiers ("cart" → `addToCart`). User queries are
 * sanitized to word tokens before they ever reach FTS5, so no query string can be
 * a MATCH-syntax injection — the same discipline as parameterized SQL.
 */

import type { Store } from './db.js';
import { reciprocalRankFusion } from './rank.js';
import type { SqliteVecStore } from './vector.js';

/** One retrieved document, best match first. */
export interface SearchHit {
  readonly path: string;
  readonly language: string;
  /** Relevance — higher is more relevant (negated bm25; 0 when unranked). */
  readonly score: number;
  /** A short excerpt around the match, with the hit bracketed. */
  readonly snippet: string;
}

export interface SearchStorePort {
  /** Index (or re-index) one file's content for a project. Idempotent per path. */
  indexDocument(projectId: string, path: string, content: string, language: string): void;
  /** Drop one file from the index (e.g. it was deleted from the repo). */
  removeDocument(projectId: string, path: string): void;
  /** Drop every indexed document for a project. */
  removeProject(projectId: string): void;
  /** How many documents are indexed for a project. */
  documentCount(projectId: string): number;
  /** Retrieve the most relevant documents for a free-text query. */
  search(projectId: string, query: string, limit?: number): readonly SearchHit[];
  /** A document's full indexed content (retrieval-augmented ask), or null. */
  documentContent(projectId: string, path: string): string | null;
}

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 50;
const MAX_QUERY_TOKENS = 16;
const MIN_TOKEN_LEN = 3; // the trigram tokenizer cannot match shorter fragments
const TOKEN_RE = new RegExp(`[\\p{L}\\p{N}_]{${MIN_TOKEN_LEN},}`, 'gu');

/** Clamp a caller-supplied limit to `[1, MAX_LIMIT]` — shared by every limit consumer
 * (`search`'s SQL `LIMIT`, `hybridSearch`'s vector leg, and its fused-result slice) so
 * they can never disagree on how many results is "too many" or crash on a negative,
 * fractional, or NaN input (Math.max/min/floor all propagate NaN, and a NaN `LIMIT`
 * bind throws "datatype mismatch" — mirrors `read.ts`'s `clampFiringsPage`). */
function clampLimit(limit: number): number {
  const safeLimit = Number.isFinite(limit) ? limit : DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(safeLimit)), MAX_LIMIT);
}

/**
 * Turn a free-text query into a safe FTS5 MATCH expression: extract word tokens
 * of length ≥3 (trigram's floor), de-dupe, cap, quote each as a phrase, and OR
 * them for recall. Returns null when nothing usable remains (caller returns []).
 */
export function buildMatchExpression(query: string): string | null {
  const tokens = query.toLowerCase().match(TOKEN_RE) ?? [];
  if (tokens.length === 0) return null;
  const unique = [...new Set(tokens)].slice(0, MAX_QUERY_TOKENS);
  // Tokens are word-chars only (the regex excludes quotes), so quoting is safe.
  return unique.map((t) => `"${t}"`).join(' OR ');
}

interface RawHit {
  readonly path: string;
  readonly language: string;
  readonly score: number;
  readonly snippet: string;
}

export class SqliteSearchStore implements SearchStorePort {
  constructor(private readonly store: Store) {}

  indexDocument(projectId: string, path: string, content: string, language: string): void {
    // FTS5 has no UPSERT; delete-by-key then insert keeps one row per (project, path).
    const tx = this.store.db.transaction(() => {
      this.store.db
        .prepare('DELETE FROM project_search WHERE project_id = ? AND path = ?')
        .run(projectId, path);
      this.store.db
        .prepare(
          'INSERT INTO project_search (project_id, path, content, language) VALUES (?, ?, ?, ?)',
        )
        .run(projectId, path, content, language);
    });
    tx();
  }

  removeDocument(projectId: string, path: string): void {
    this.store.db
      .prepare('DELETE FROM project_search WHERE project_id = ? AND path = ?')
      .run(projectId, path);
  }

  removeProject(projectId: string): void {
    this.store.db.prepare('DELETE FROM project_search WHERE project_id = ?').run(projectId);
  }

  documentCount(projectId: string): number {
    const row = this.store.db
      .prepare('SELECT COUNT(*) AS c FROM project_search WHERE project_id = ?')
      .get(projectId) as { c: number };
    return row.c;
  }

  /** A document's full indexed content (retrieval-augmented ask), or null. */
  documentContent(projectId: string, path: string): string | null {
    const row = this.store.db
      .prepare('SELECT content FROM project_search WHERE project_id = ? AND path = ?')
      .get(projectId, path) as { content: string } | undefined;
    return row?.content ?? null;
  }

  /**
   * Hybrid retrieval: BM25 keyword ranks fused with vector-similarity ranks via
   * Reciprocal Rank Fusion (rank-based, so the incompatible score scales never
   * need calibrating). Degrades transparently: with no vector store or no query
   * vector it IS plain BM25 search — callers never branch.
   */
  hybridSearch(
    projectId: string,
    query: string,
    queryVector: Float32Array | null,
    vec: SqliteVecStore | null,
    limit: number = DEFAULT_LIMIT,
  ): readonly SearchHit[] {
    const cap = clampLimit(limit);
    const ftsHits = this.search(projectId, query, cap);
    if (vec === null || queryVector === null) return ftsHits;

    const vecHits = vec.knn(projectId, queryVector, cap);
    if (vecHits.length === 0) return ftsHits;

    const byPath = new Map(ftsHits.map((h) => [h.path, h]));
    const fused = reciprocalRankFusion([ftsHits.map((h) => h.path), vecHits.map((h) => h.path)]);

    const hits: SearchHit[] = [];
    for (const { id: path, score } of fused.slice(0, cap)) {
      const existing = byPath.get(path);
      if (existing) {
        hits.push({ ...existing, score });
      } else {
        // Vector-only hit — no BM25 snippet; excerpt the indexed content instead.
        const content = this.documentContent(projectId, path);
        hits.push({
          path,
          language: this.languageOf(projectId, path) ?? 'other',
          score,
          snippet: content !== null ? content.slice(0, 160) : '',
        });
      }
    }
    return hits;
  }

  private languageOf(projectId: string, path: string): string | null {
    const row = this.store.db
      .prepare('SELECT language FROM project_search WHERE project_id = ? AND path = ?')
      .get(projectId, path) as { language: string } | undefined;
    return row?.language ?? null;
  }

  search(projectId: string, query: string, limit: number = DEFAULT_LIMIT): readonly SearchHit[] {
    const match = buildMatchExpression(query);
    if (match === null) return [];
    const cap = clampLimit(limit);
    // bm25(project_search) is negative, more-negative = better; ORDER BY rank is
    // FTS5's built-in best-first. snippet() excerpts the `content` column (index 2).
    const rows = this.store.db
      .prepare(
        `SELECT path, language, bm25(project_search) AS score,
                snippet(project_search, 2, '[', ']', '…', 12) AS snippet
           FROM project_search
          WHERE project_search MATCH ? AND project_id = ?
          ORDER BY rank
          LIMIT ?`,
      )
      .all(match, projectId, cap) as RawHit[];
    return rows.map((r) => ({
      path: r.path,
      language: r.language,
      score: -r.score, // flip so higher = more relevant for callers
      snippet: r.snippet,
    }));
  }
}
