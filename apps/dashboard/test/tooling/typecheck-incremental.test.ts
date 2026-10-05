// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE TYPECHECK REUSES ITS LAST RUN.
 *
 * `pnpm run typecheck` runs nine `tsc -p` in a row, and most firings run it
 * once themselves before the gate runs it again (board task
 * web-muutc8il-0xldf2: 75% of firings, 172 s on average under fleet load).
 * Every typecheck config used to set `incremental: false`, so each of those
 * runs re-checked the whole tree from nothing. With `incremental: true` each
 * config keeps a `.tsbuildinfo`, and a re-run re-checks only the changed
 * files and their dependents (measured 2026-10-05: 56 s cold, 14 s warm).
 *
 * Every cache lives under the git-ignored `node_modules/.cache/typecheck/`,
 * one file per config. The configs extend a package `tsconfig.json` whose
 * `tsBuildInfoFile` is the BUILD's `dist/.tsbuildinfo`; a typecheck config
 * that inherited it would overwrite the `tsc -b` state with a noEmit
 * program's. Two configs sharing one file would each read the other's state.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const CACHE_DIR = join(ROOT, 'node_modules', '.cache', 'typecheck');

interface TypecheckConfig {
  readonly compilerOptions?: {
    readonly incremental?: boolean;
    readonly tsBuildInfoFile?: string;
  };
}

const script = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    readonly scripts: Readonly<Record<string, string>>;
  }
).scripts['typecheck'];

const configs = [...(script ?? '').matchAll(/\btsc -p (\S+)/g)].map((m) => m[1] ?? '');

function options(config: string): NonNullable<TypecheckConfig['compilerOptions']> {
  const parsed = JSON.parse(readFileSync(join(ROOT, config), 'utf8')) as TypecheckConfig;
  return parsed.compilerOptions ?? {};
}

/** The config's `tsBuildInfoFile`, resolved against the config's own folder. */
function buildInfoPath(config: string): string {
  const file = options(config).tsBuildInfoFile ?? '';
  return resolve(dirname(join(ROOT, config)), file);
}

describe('every typecheck config keeps an incremental cache of its own', () => {
  it('finds the nine tsc -p runs in the typecheck script', () => {
    expect(configs).toHaveLength(9);
  });

  it.each(configs)('%s sets incremental: true', (config) => {
    expect(options(config).incremental).toBe(true);
  });

  it.each(configs)('%s writes its tsbuildinfo under node_modules/.cache/typecheck/', (config) => {
    expect(options(config).tsBuildInfoFile, 'tsBuildInfoFile is set').toBeTypeOf('string');
    expect(buildInfoPath(config).startsWith(CACHE_DIR + sep)).toBe(true);
    expect(buildInfoPath(config).endsWith('.tsbuildinfo')).toBe(true);
  });

  it('gives no two configs the same tsbuildinfo', () => {
    const paths = configs.map(buildInfoPath);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
