// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `secret-scan.mjs`, so
 * `apps/dashboard/test/tooling/secret-scan.test.ts` typechecks — the same
 * sibling-`.d.mts` pattern `scripts/ci/detect-flaky.d.mts` already uses. Keep
 * in step with the JSDoc types in the `.mjs`.
 */

export interface SecretFinding {
  line: number;
  rule: string;
}

export function findSecrets(text: string): SecretFinding[];
