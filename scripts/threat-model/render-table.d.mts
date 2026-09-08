// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `render-table.mjs`, so
 * `apps/dashboard/test/tooling/generate-table.test.ts` typechecks — the same
 * sibling-`.d.mts` pattern `scripts/self-study/history-guard.d.mts` and
 * `scripts/github/verify-branch-protection.d.mts` already use. Keep in step
 * with the JSDoc/exports in the `.mjs`.
 */

export interface ToolGrant {
  readonly allowed: readonly string[];
  readonly disallowed: readonly string[];
}

export const MARKER_START: string;
export const MARKER_END: string;
export function renderTable(grant: ToolGrant): string;
export function replaceBlock(source: string, block: string, docPath?: string): string;
export function withoutTimestamp(text: string): string;
