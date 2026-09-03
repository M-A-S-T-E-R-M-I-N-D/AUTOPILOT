// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `generate-table.mjs`, so
 * `apps/dashboard/test/tooling/generate-table.test.ts` typechecks — the
 * same sibling-`.d.mts` pattern `scripts/github/verify-branch-protection.d.mts`
 * already uses. Keep in step with the JSDoc/exports in the `.mjs`.
 */

export function renderTable(): string;
export function replaceBlock(source: string, block: string): string;
export function withoutTimestamp(text: string): string;
