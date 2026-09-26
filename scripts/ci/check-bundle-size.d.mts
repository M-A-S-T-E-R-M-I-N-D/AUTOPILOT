// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `check-bundle-size.mjs`, so
 * `apps/dashboard/test/tooling/check-bundle-size.test.ts` typechecks — the
 * same sibling-`.d.mts` pattern `scripts/ci/npx-smoke-test.d.mts` already
 * uses. Keep in step with the exports of the `.mjs`.
 */

export const CORE_RAW_BUDGET: number;
export const CORE_GZIP_BUDGET: number;
export const PROJECT_RAW_BUDGET: number;
export const PROJECT_GZIP_BUDGET: number;
export const PANELS_RAW_BUDGET: number;
export const PANELS_GZIP_BUDGET: number;
export const WHATS_NEW_RAW_BUDGET: number;
export const WHATS_NEW_GZIP_BUDGET: number;
export const BENCHMARK_RAW_BUDGET: number;
export const BENCHMARK_GZIP_BUDGET: number;

/** The five chunk builders of the compiled client-bundle module. */
export interface ClientBundle {
  minifiedCoreJs(): string;
  minifiedProjectJs(): string;
  minifiedPanelsJs(): string;
  minifiedWhatsNewJs(): string;
  minifiedBenchmarkJs(): string;
}

export function formatKb(bytes: number): string;

export function measure(
  name: string,
  js: string,
  rawBudget: number,
  gzipBudget: number,
  errors: string[],
): number;

export function checkBundleSize(bundle: ClientBundle): 0 | 1;
