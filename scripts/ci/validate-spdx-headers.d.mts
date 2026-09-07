// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `validate-spdx-headers.mjs`, so
 * `apps/dashboard/test/tooling/validate-spdx-headers.test.ts` typechecks —
 * the same sibling-`.d.mts` pattern `scripts/ci/secret-scan.d.mts` already
 * uses. Keep in step with the JSDoc types in the `.mjs`.
 */

export const HEADER_SCAN_LINES: number;

export function hasSpdxHeader(text: string): boolean;
