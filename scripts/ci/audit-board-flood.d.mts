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
}

export const DUPLICATE_RATIO: number;
export const RAPID_FIRE_MS: number;
export const CONSECUTIVE_CEILING: number;
export const MIN_COMPARE_LENGTH: number;

export function normalize(body: string): string;
export function similarity(a: string, b: string): number;
export function auditThread(thread: string, messages: FloodThreadMessage[]): FloodFinding[];
