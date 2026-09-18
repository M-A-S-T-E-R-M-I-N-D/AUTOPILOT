// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE TYPECHECK MUST NEVER READ A STALE BUILD.
 *
 * `pnpm run typecheck` runs each package's `tsconfig.typecheck.json` with
 * `--noEmit`, so the dashboard resolves a workspace package through whatever
 * `paths` maps it to — its SOURCE — or, for one left off the map, through
 * that package's built `dist/index.d.ts`. The convergence gate of the
 * 2026-09-18 round went red on exactly that: a lane added `localLinkPaths`
 * to `@autopilot/docs-links`, another lane imported it, both were green
 * alone, and the flight-end typecheck failed because docs-links (the newest
 * package) had no `paths` entry and its dist predated the round. Every
 * `@autopilot/*` dependency of the dashboard must map to its source here.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DASHBOARD = fileURLToPath(new URL('../../', import.meta.url));

interface PackageJson {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

interface TypecheckConfig {
  readonly compilerOptions: { readonly paths?: Readonly<Record<string, readonly string[]>> };
}

describe('the dashboard typecheck resolves every workspace package from SOURCE', () => {
  const pkg = JSON.parse(readFileSync(join(DASHBOARD, 'package.json'), 'utf8')) as PackageJson;
  const config = JSON.parse(
    readFileSync(join(DASHBOARD, 'tsconfig.typecheck.json'), 'utf8'),
  ) as TypecheckConfig;
  const paths = config.compilerOptions.paths ?? {};
  const workspaceDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
    (name) => name.startsWith('@autopilot/'),
  );

  it('depends on at least one workspace package (the census has something to count)', () => {
    expect(workspaceDeps.length).toBeGreaterThan(0);
  });

  it('maps each @autopilot/* dependency to ../../packages/<name>/src/index.ts, and that file exists', () => {
    for (const dep of workspaceDeps) {
      const short = dep.slice('@autopilot/'.length);
      const expected = `../../packages/${short}/src/index.ts`;
      expect(paths[dep], `${dep} is missing from tsconfig.typecheck.json paths`).toEqual([
        expected,
      ]);
      expect(existsSync(join(DASHBOARD, expected)), `${expected} exists`).toBe(true);
    }
  });

  it('maps nothing the dashboard does not depend on', () => {
    for (const mapped of Object.keys(paths)) {
      expect(workspaceDeps, `${mapped} is mapped but not a dependency`).toContain(mapped);
    }
  });
});
