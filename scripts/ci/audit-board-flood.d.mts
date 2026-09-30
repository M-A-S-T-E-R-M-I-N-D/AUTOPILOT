// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `audit-board-flood.mjs`, so
 * `apps/dashboard/test/tooling/audit-board-flood.test.ts` typechecks — the
 * same sibling-`.d.mts` pattern `scripts/ci/secret-scan.d.mts` already uses.
 * Keep in step with the JSDoc types / shapes in the `.mjs`.
 */

export interface FloodThreadMessage {
  kind: string;
  id: number;
  author: string;
  at: string;
  body: string;
  url: string;
}

export interface FloodFinding {
  thread: string;
  kind: 'NEAR-DUPLICATE' | 'CONSECUTIVE-RUN' | 'RAPID-FIRE';
  author: string;
  detail: string;
  url: string;
  snippet: string;
}

export const DUPLICATE_RATIO: number;
export const RAPID_FIRE_MS: number;
export const CONSECUTIVE_CEILING: number;
export const MIN_COMPARE_LENGTH: number;
export const SNIPPET_LENGTH: number;

export interface FloodBoardThread {
  number: number;
  isPr: boolean;
}

/** A missing body (`null`/`undefined`) normalizes to `''`, not a crash. */
export function normalize(body: string | null | undefined): string;
export function similarity(a: string, b: string): number;
/** `issues` is one `gh api repos/…/issues` page — untrusted process output,
 *  so not even the array is assumed (a `null` page reads as no threads). */
export function boardThreads(issues: unknown): FloodBoardThread[];
/** `comments` and `reviews` are `gh api` pages — untrusted process output,
 *  so not even the arrays are assumed (a `null` page reads as no messages). */
export function threadTimeline(comments: unknown, reviews: unknown): FloodThreadMessage[];
export function auditThread(thread: string, messages: FloodThreadMessage[]): FloodFinding[];
/** The value after `flag` in `argv` (default `process.argv`); undefined when absent. */
export function argValue(flag: string, argv?: readonly string[]): string | undefined;
