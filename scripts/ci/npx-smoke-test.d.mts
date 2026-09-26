// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `npx-smoke-test.mjs`, so
 * `apps/dashboard/test/tooling/npx-smoke-test.test.ts` typechecks — the same
 * sibling-`.d.mts` pattern `scripts/ci/validate-configs.d.mts` already uses.
 * Keep in step with the JSDoc types in the `.mjs`.
 */

export interface WorkspacePackage {
  dir: string;
  version: string;
  pkg: {
    name: string;
    dependencies?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface ScratchManifest {
  name: string;
  private: boolean;
  version: string;
  dependencies: Record<string, string>;
  overrides: Record<string, string>;
}

export function workspaceClosure(
  rootName: string,
  packages: ReadonlyMap<string, WorkspacePackage>,
): Set<string>;

export function tarballName(entry: Pick<WorkspacePackage, 'version' | 'pkg'>): string;

export function packedFileOffenders(paths: readonly string[]): string[];

export function assertShebangIsLf(raw: Buffer, binRelPath: string): void;

export function buildScratchManifest(
  packages: ReadonlyMap<string, WorkspacePackage>,
  dashboardEntry: WorkspacePackage,
  closureNames: Iterable<string>,
  packDir: string,
): ScratchManifest;
