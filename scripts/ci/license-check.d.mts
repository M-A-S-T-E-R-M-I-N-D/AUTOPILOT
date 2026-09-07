// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `license-check.mjs`, so
 * `apps/dashboard/test/tooling/license-check.test.ts` typechecks — the
 * same sibling-`.d.mts` pattern `scripts/ci/dependency-audit.d.mts` already
 * uses. Keep in step with the JSDoc types in the `.mjs`.
 */

export function isAllowedLicenseId(id: string): boolean;

export function isAllowedLicenseExpression(license: string): boolean;

export interface LicensedPackage {
  name: string;
  versions?: readonly string[];
  license?: string;
}

export interface LicenseViolation {
  license: string;
  name: string;
  versions: readonly string[];
}

export function findLicenseViolations(
  licensesJson: Record<string, readonly LicensedPackage[]>,
): LicenseViolation[];
