// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cost semantics v3 (docs/epics/0013-cost-semantics-v3.md) — operator-supplied
 * config for `EngineConfig.subscriptionPriceUsd`/`usagePoolDirs`, read from the
 * environment the same way `flight/budget.ts`'s `cliTimeoutMsFromEnv` reads
 * `AUTOPILOT_CLI_TIMEOUT_MS`. Both env vars are unset by default, which keeps
 * the feature fully opt-in — the epic's Acceptance criteria forbids guessing a
 * subscription price or a pool directory scope; an operator must state both.
 */

/** `AUTOPILOT_SUBSCRIPTION_PRICE_USD` — a positive number, else unconfigured (`null`). */
export function subscriptionPriceUsdFromEnv(
  env: Record<string, string | undefined>,
): number | null {
  const raw = Number(env['AUTOPILOT_SUBSCRIPTION_PRICE_USD']);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

/**
 * `AUTOPILOT_USAGE_POOL_DIRS` — a comma-separated list of directories to scan
 * for session transcript JSONL files (the epic's "MACHINE-WIDE" pool scope).
 * Blank entries are dropped; unset/blank yields `[]` (no scan, per
 * `scanUsagePoolListPriceUsd`'s "empty dirs → null total" contract).
 */
export function usagePoolDirsFromEnv(env: Record<string, string | undefined>): readonly string[] {
  const raw = env['AUTOPILOT_USAGE_POOL_DIRS'];
  if (raw === undefined) return [];
  return raw
    .split(',')
    .map((dir) => dir.trim())
    .filter((dir) => dir.length > 0);
}
