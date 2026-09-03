// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `detect-flaky.mjs`, so
 * `apps/dashboard/test/tooling/detect-flaky.test.ts` typechecks — the same
 * sibling-`.d.mts` pattern `scripts/ci/quarantine-report.d.mts` already uses.
 * Keep in step with the JSDoc types in the `.mjs`.
 */

export interface FlakySummary {
  runs: number;
  passCount: number;
  failCount: number;
  flaky: boolean;
}

export function summarizeRuns(results: readonly boolean[]): FlakySummary;

export function formatVerdict(summary: FlakySummary, testPath: string): string;
