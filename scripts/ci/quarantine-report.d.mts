// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `quarantine-report.mjs`, so
 * `apps/dashboard/test/tooling/quarantine-report.test.ts` typechecks — the
 * same sibling-`.d.mts` pattern `scripts/codemod/*.d.mts` already uses for
 * the splice-manifest and region-split CLIs. Keep in step with the JSDoc
 * types in the `.mjs`.
 */

export interface QuarantineEntry {
  testPath: string;
  owner: string;
  reason: string;
  addedDate: string;
}

export function validateQuarantineList(data: unknown): {
  errors: string[];
  entries: QuarantineEntry[];
};

export function summarizeQuarantine(entries: readonly QuarantineEntry[]): string;
