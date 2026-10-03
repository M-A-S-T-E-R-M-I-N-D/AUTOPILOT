// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Every `@autopilot/*` import a mutation config's code reaches must resolve
 * inside the Stryker sandbox.
 *
 * The sandbox is a copy of the repo run with `symlinkNodeModules: false`, so
 * only the repo root's node_modules is reachable from it, and that has no
 * link to the workspace packages. A module whose import chain reaches
 * `@autopilot/engine` without an alias for it fails to load there: "Cannot
 * find package '@autopilot/engine'", `vitest related` finds no tests, and the
 * nightly files the config as surviving mutants when none ran. The 2026-10-03
 * nightly went red that way for runner, registry, spawn-flight and watchdog
 * at once (47c7649b gave firing-engine.ts the import they all reach), and
 * service failed the narrower way: its alias points at one engine source
 * file, which did not export the `isAuthReady` service.ts had started to
 * import. The ordinary test run cannot see either failure, because the root
 * vitest.config.ts aliases every workspace package.
 *
 * So this walks each config's mutated files and test files through their
 * relative imports, and through the source files its aliases point at, and
 * requires every runtime `@autopilot/*` import it meets to be aliased by the
 * config, to a file that exports each name imported from it. Type-only
 * imports are skipped: esbuild erases them before anything resolves.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const CONFIG_DIR = join(ROOT, 'config', 'mutation');
const WORKSPACE_SPECIFIER = /^@autopilot\/[^/]+/;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs'];
// Build output and installs are not source: every config's ignorePatterns
// keeps `dist` out of the sandbox, and whether a local build exists must not
// change this test's answer.
const NOT_SOURCE_RE = /[\\/](?:dist|node_modules)[\\/]/;
const FROM_IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/gm;
const BARE_IMPORT_RE = /^\s*import\s*['"]([^'"]+)['"]/gm;
const DYNAMIC_IMPORT_RE = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
// `const enum` ahead of `const`, or `export const enum E` would name `enum`.
const DECLARED_EXPORT_RE =
  /^\s*export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|class|const\s+enum|const|let|var|enum|interface|type|namespace)\s+([A-Za-z_$][\w$]*)/gm;

interface ImportRef {
  readonly specifier: string;
  /** Named value imports; null when they cannot be listed (`* as ns`). */
  readonly names: readonly string[] | null;
}

interface MutationSetup {
  readonly name: string;
  readonly entries: readonly string[];
  readonly alias: Readonly<Record<string, string>>;
}

const posix = (path: string): string => relative(ROOT, path).split(sep).join('/');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The value names an import or re-export clause binds; null for a namespace. */
function clauseNames(clause: string): readonly string[] | null {
  if (clause.includes('*')) return null;
  const braced = /\{([^}]*)\}/.exec(clause);
  const names = (braced?.[1] ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith('type '))
    .map((part) => part.split(/\s+as\s+/)[0] ?? part);
  const defaultName = clause.replace(/\{[^}]*\}|,/g, '').trim();
  return defaultName.length > 0 ? ['default', ...names] : names;
}

/** The runtime imports and re-exports of a source file. */
function runtimeImports(source: string): ImportRef[] {
  const code = stripComments(source);
  const refs: ImportRef[] = [];
  for (const match of code.matchAll(FROM_IMPORT_RE)) {
    const [, typeOnly, clause = '', specifier = ''] = match;
    if (typeOnly) continue;
    const names = clauseNames(clause);
    // `import { type A }` alone is erased just like `import type { A }`.
    if (names !== null && names.length === 0 && clause.includes('{')) continue;
    refs.push({ specifier, names });
  }
  for (const match of code.matchAll(BARE_IMPORT_RE)) {
    refs.push({ specifier: match[1] ?? '', names: [] });
  }
  for (const match of code.matchAll(DYNAMIC_IMPORT_RE)) {
    refs.push({ specifier: match[1] ?? '', names: null });
  }
  return refs;
}

/** The names a source file exports, following its `export * from` re-exports. */
function exportedNames(file: string, seen = new Set<string>()): Set<string> {
  const names = new Set<string>();
  if (seen.has(file)) return names;
  seen.add(file);
  const code = stripComments(readFileSync(file, 'utf8'));
  for (const match of code.matchAll(DECLARED_EXPORT_RE)) names.add(match[1] ?? '');
  if (/^\s*export\s+default\b/m.test(code)) names.add('default');
  for (const match of code.matchAll(/^\s*export\s+(?:type\s+)?\{([^}]*)\}/gm)) {
    for (const part of (match[1] ?? '').split(',')) {
      // The last identifier is the exported name: `a`, `type A`, `a as b`.
      const exported = /([A-Za-z_$][\w$]*)\s*$/.exec(part)?.[1];
      if (exported) names.add(exported);
    }
  }
  for (const match of code.matchAll(/^\s*export\s+\*\s+as\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(match[1] ?? '');
  }
  for (const match of code.matchAll(/^\s*export\s+\*\s+from\s*['"]([^'"]+)['"]/gm)) {
    const target = resolveRelative(file, match[1] ?? '');
    if (target) for (const name of exportedNames(target, seen)) names.add(name);
  }
  return names;
}

function resolveRelative(fromFile: string, specifier: string): string | null {
  const base = resolve(dirname(fromFile), specifier);
  const stem = base.replace(/\.(?:[cm]?js|jsx)$/, '');
  const candidates = [
    ...SOURCE_EXTENSIONS.map((ext) => stem + ext),
    base,
    ...SOURCE_EXTENSIONS.map((ext) => join(base, `index${ext}`)),
  ];
  return candidates.find((path) => existsSync(path) && statSync(path).isFile()) ?? null;
}

function aliasFor(
  specifier: string,
  alias: Readonly<Record<string, string>>,
): [key: string, target: string] | null {
  const key = Object.keys(alias).find((k) => specifier === k || specifier.startsWith(`${k}/`));
  return key === undefined ? null : [key, alias[key] ?? ''];
}

/** What a sandbox run of this config would fail to resolve, one line per gap. */
function sandboxGaps(setup: MutationSetup): string[] {
  const gaps: string[] = [];
  const queue = [...setup.entries];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const file = queue.shift() ?? '';
    if (visited.has(file) || NOT_SOURCE_RE.test(file)) continue;
    if (!SOURCE_EXTENSIONS.some((ext) => file.endsWith(ext))) continue;
    visited.add(file);
    for (const ref of runtimeImports(readFileSync(file, 'utf8'))) {
      if (ref.specifier.startsWith('.')) {
        const target = resolveRelative(file, ref.specifier);
        if (target) queue.push(target);
        continue;
      }
      if (!WORKSPACE_SPECIFIER.test(ref.specifier)) continue;
      const aliased = aliasFor(ref.specifier, setup.alias);
      if (!aliased) {
        gaps.push(`${posix(file)} imports ${ref.specifier}, which the config does not alias`);
        continue;
      }
      const [key, target] = aliased;
      if (!existsSync(target) || !statSync(target).isFile()) continue;
      queue.push(target);
      if (ref.names === null || ref.specifier !== key) continue;
      const exported = exportedNames(target);
      for (const name of ref.names.filter((n) => !exported.has(n))) {
        gaps.push(
          `${posix(file)} imports ${name} from ${key}, which ${posix(target)} does not export`,
        );
      }
    }
  }
  return gaps;
}

function globToRegExp(pattern: string): RegExp {
  const segment = (part: string): string =>
    part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${pattern.split('**/').map(segment).join('(?:.*/)?')}$`);
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

function expandPattern(pattern: string): string[] {
  if (!pattern.includes('*')) return [join(ROOT, pattern)];
  const base = pattern.slice(0, pattern.indexOf('*')).replace(/[^/]*$/, '');
  const matcher = globToRegExp(pattern);
  return listFiles(join(ROOT, base)).filter((file) => matcher.test(posix(file)));
}

interface StrykerConfig {
  readonly mutate: readonly string[];
  readonly vitest?: { readonly configFile?: string };
}

interface VitestConfig {
  readonly resolve?: { readonly alias?: Record<string, string> };
  readonly test?: { readonly include?: readonly string[] };
}

async function importDefault<T>(path: string): Promise<T> {
  const module = (await import(pathToFileURL(path).href)) as { default: T };
  return module.default;
}

async function loadSetups(): Promise<MutationSetup[]> {
  const files = readdirSync(CONFIG_DIR).filter((f) => /^stryker\..+\.config\.mjs$/.test(f));
  return Promise.all(
    files.map(async (file) => {
      const stryker = await importDefault<StrykerConfig>(join(CONFIG_DIR, file));
      const vitestFile = stryker.vitest?.configFile;
      if (!vitestFile) throw new Error(`${file} names no vitest.configFile`);
      const vitest = await importDefault<VitestConfig>(join(ROOT, vitestFile));
      return {
        name: file,
        entries: [
          ...stryker.mutate.flatMap(expandPattern),
          ...(vitest.test?.include ?? []).flatMap(expandPattern),
        ],
        alias: vitest.resolve?.alias ?? {},
      };
    }),
  );
}

describe('runtimeImports', () => {
  it('lists the value names of each import and re-export, a namespace as null', () => {
    const source = [
      "import { a, type B, c as d } from './x.js';",
      "import def, { e } from '@autopilot/engine';",
      "import * as ns from '@autopilot/store';",
      'import {',
      '  multi,',
      '  line,',
      "} from './y.js';",
      "export { f } from './z.js';",
      "import './side-effect.js';",
      "const lazy = await import('@autopilot/mcp');",
    ].join('\n');

    expect(runtimeImports(source)).toEqual([
      { specifier: './x.js', names: ['a', 'c'] },
      { specifier: '@autopilot/engine', names: ['default', 'e'] },
      { specifier: '@autopilot/store', names: null },
      { specifier: './y.js', names: ['multi', 'line'] },
      { specifier: './z.js', names: ['f'] },
      { specifier: './side-effect.js', names: [] },
      { specifier: '@autopilot/mcp', names: null },
    ]);
  });

  it('skips what esbuild erases and what is commented out', () => {
    const source = [
      "import type { A } from '@autopilot/engine';",
      "import { type B, type C } from '@autopilot/engine';",
      "export type { D } from '@autopilot/engine';",
      "// import { e } from '@autopilot/engine';",
      '/*',
      "import { f } from '@autopilot/engine';",
      '*/',
    ].join('\n');

    expect(runtimeImports(source)).toEqual([]);
  });
});

describe('sandboxGaps', () => {
  const runner = join(ROOT, 'apps/dashboard/src/flight/runner.ts');

  // runner.ts reaches @autopilot/engine only through ./firing-engine.ts, so
  // these pin the walk following relative imports, not just the entry file.
  it('names the module whose import the config leaves unaliased', () => {
    expect(sandboxGaps({ name: 'runner', entries: [runner], alias: {} })).toContain(
      'apps/dashboard/src/flight/firing-engine.ts imports @autopilot/engine, which the config does not alias',
    );
  });

  it('names each imported value the alias target does not export', () => {
    const alias = { '@autopilot/engine': join(ROOT, 'packages/engine/src/auth.ts') };

    expect(sandboxGaps({ name: 'runner', entries: [runner], alias })).toEqual([
      'apps/dashboard/src/flight/firing-engine.ts imports isLocallyServed from @autopilot/engine, which packages/engine/src/auth.ts does not export',
      'apps/dashboard/src/flight/firing-engine.ts imports resolveModelVendor from @autopilot/engine, which packages/engine/src/auth.ts does not export',
    ]);
  });
});

describe('mutation sandbox imports', () => {
  it('every @autopilot/* import a mutation config reaches is aliased to a file exporting it', async () => {
    const setups = await loadSetups();
    expect(setups.length).toBeGreaterThanOrEqual(100);

    const gaps = setups.flatMap((setup) =>
      sandboxGaps(setup).map((gap) => `${setup.name}: ${gap}`),
    );

    expect(gaps).toEqual([]);
  }, 60_000);
});
