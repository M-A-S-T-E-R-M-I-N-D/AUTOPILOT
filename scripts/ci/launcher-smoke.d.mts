// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `launcher-smoke.mjs`, so
 * `apps/dashboard/test/tooling/launcher-smoke.test.ts` typechecks — the same
 * sibling-`.d.mts` pattern `scripts/ci/check-bundle-size.d.mts` already uses.
 * Keep in step with the exports of the `.mjs`.
 */

/** One launcher's expected behavior. `pnpmInvocations`, when present, pins
 *  the exact pnpm argv instead of just "built first". */
export interface LauncherEntry {
  file: string;
  buildsFirst: boolean;
  requiresDist: boolean;
  nodeInvocations: string[][];
  pnpmInvocations?: string[];
}

export interface Scenario {
  simulateBuildFailure: boolean;
  includeDist: boolean;
}

/** What one scenario's `bash` run produced. */
export interface ScenarioRun {
  exitCode: number;
  output: string;
  nodeCalls: string[];
  pnpmCalls: string[];
}

export const MANIFEST: LauncherEntry[];

export function isShLauncher(name: string): boolean;

export function discoverShLaunchers(root?: string): string[];

export function assertManifestCovers(discovered: string[], manifest: LauncherEntry[]): void;

export function scenariosFor(entry: LauncherEntry): Scenario[];

export function readRecord(recordFile: string): string[];

export function checkScenario(entry: LauncherEntry, scenario: Scenario, run: ScenarioRun): void;
