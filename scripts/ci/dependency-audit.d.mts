// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `dependency-audit.mjs`, so
 * `apps/dashboard/test/tooling/dependency-audit.test.ts` typechecks — the
 * same sibling-`.d.mts` pattern `scripts/ci/secret-scan.d.mts` already uses.
 * Keep in step with the JSDoc types in the `.mjs`.
 */

export function isTransientAuditFailure(output: string): boolean;

export interface DependencyAuditRunResult {
  status: number;
  output: string;
}

export interface DependencyAuditRetryDeps {
  runOnce: () => DependencyAuditRunResult;
  sleep: (ms: number) => Promise<void>;
  maxAttempts?: number;
  baseDelayMs?: number;
  log?: (line: string) => void;
  warn?: (line: string) => void;
  error?: (line: string) => void;
}

export interface DependencyAuditOutcome {
  exitCode: number;
  attempts: number;
}

export function runAuditWithRetry(deps: DependencyAuditRetryDeps): Promise<DependencyAuditOutcome>;
