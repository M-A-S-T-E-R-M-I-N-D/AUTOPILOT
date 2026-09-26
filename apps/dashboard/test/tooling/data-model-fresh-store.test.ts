// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE DATA-MODEL GENERATOR'S STORE LOADER (`scripts/data-model/fresh-store.mjs`).
 *
 * `generate-doc.mjs` introspects the schema through `packages/store/dist/`,
 * the BUILT store. It used to import that build directly, so a migration
 * added to `src/schema.ts` and not yet compiled regenerated DATA-MODEL.md
 * from the pre-edit build — the new migration silently missing — and a local
 * `ci:data-model --check` passed against it
 * (docs/debriefs/2026-09-26-cost-unknown-revert-root-cause-stale-dist-trap.md).
 * The loader brings the build up to date first, and a failed build is fatal
 * rather than a quiet fallback to whatever `dist/` already holds.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importFreshStore, storeBuildArgv } from '../../../../scripts/data-model/fresh-store.mjs';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

describe('importFreshStore', () => {
  it('builds the store before it loads the build, and loads packages/store/dist/index.js', async () => {
    const calls: string[] = [];
    const store = { MIGRATIONS: [] };

    const loaded = await importFreshStore('/repo', {
      build: (root) => {
        calls.push(`build ${root}`);
      },
      load: (href) => {
        calls.push(`load ${href}`);
        return Promise.resolve(store);
      },
    });

    expect(calls).toEqual([
      'build /repo',
      `load ${pathToFileURL(join('/repo', 'packages', 'store', 'dist', 'index.js')).href}`,
    ]);
    expect(loaded).toBe(store);
  });

  it('never loads a build that failed to refresh — the stale dist is not a fallback', async () => {
    let loads = 0;

    const pending = importFreshStore('/repo', {
      build: () => {
        throw new Error('tsc -b exited 2');
      },
      load: () => {
        loads += 1;
        return Promise.resolve({});
      },
    });

    await expect(pending).rejects.toThrow('tsc -b exited 2');
    expect(loads).toBe(0);
  });
});

describe('storeBuildArgv', () => {
  it("runs this checkout's own TypeScript compiler in build mode over packages/store", () => {
    const { file, args } = storeBuildArgv(REPO);

    expect(file).toBe(process.execPath);
    expect(args).toHaveLength(3);
    expect(existsSync(args[0] ?? '')).toBe(true);
    expect((args[0] ?? '').replaceAll('\\', '/')).toMatch(/\/typescript\/bin\/tsc$/);
    expect(args.slice(1)).toEqual(['-b', join(REPO, 'packages', 'store')]);
  });
});

describe('generate-doc.mjs', () => {
  it('reaches the store only through importFreshStore, never a static import of dist', () => {
    const source = readFileSync(join(REPO, 'scripts', 'data-model', 'generate-doc.mjs'), 'utf8');

    expect(source).not.toMatch(/from\s+['"][^'"]*packages\/store\/dist/);
    expect(source).toMatch(/await importFreshStore\(repoRoot\)/);
  });
});
