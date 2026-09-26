// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `launcher-smoke-cmd.mjs`, so
 * `apps/dashboard/test/tooling/launcher-smoke-cmd.test.ts` typechecks — the
 * same sibling-`.d.mts` pattern `scripts/ci/launcher-smoke.d.mts` already
 * uses. Keep in step with the exports of the `.mjs`.
 */

/** One `.cmd` launcher's expected behavior. `target`/`targetType` name the
 *  file real `node.exe` is pointed at; `nodeInvocations` is the argv each
 *  `node` call should record AFTER the script path. */
export interface LauncherEntry {
  file: string;
  buildsFirst: boolean;
  requiresDist: boolean;
  target: string;
  targetType: 'esm' | 'cjs';
  nodeInvocations: string[][];
}

export interface Scenario {
  simulateBuildFailure: boolean;
  includeDist: boolean;
}

/** What one scenario's `cmd.exe` run produced. */
export interface ScenarioRun {
  exitCode: number;
  output: string;
  nodeCalls: string[];
  pnpmCalls: string[];
}

export const MANIFEST: LauncherEntry[];

export function isCmdLauncher(name: string): boolean;

export function discoverCmdLaunchers(root?: string): string[];

export function assertManifestCovers(discovered: string[], manifest: LauncherEntry[]): void;

export function scenariosFor(entry: LauncherEntry): Scenario[];

export function readRecord(recordFile: string): string[];

export function checkScenario(entry: LauncherEntry, scenario: Scenario, run: ScenarioRun): void;
