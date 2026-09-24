// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `secret-scan-history.mjs`, so
 * `apps/dashboard/test/tooling/secret-scan-history.test.ts` typechecks — the
 * same sibling-`.d.mts` pattern `scripts/ci/secret-scan.d.mts` already uses.
 * Keep in step with the JSDoc types in the `.mjs`.
 */

export interface AddedLine {
  file: string;
  line: number;
  text: string;
}

export interface PatchFinding {
  file: string;
  line: number;
  rule: string;
  match: string;
}

export function parseAddedLines(patchText: string): AddedLine[];
export function scanPatch(patchText: string): PatchFinding[];
