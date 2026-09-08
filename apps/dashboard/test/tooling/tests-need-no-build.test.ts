// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression guard for the build-order hole in `pnpm verify`.
 *
 * `verify` runs `test:coverage` BEFORE `build`, and every `packages/*\/dist` is
 * git-ignored. So on any tree that has not been built — a fresh clone, a CI
 * job that reaches the tests first, a contributor's first `pnpm verify` — the
 * built output simply is not there when the suite runs. `vitest.config.ts`
 * already states the resulting law in its header ("Cross-package specifiers
 * resolve to source so tests need no prior build") and enforces it for the
 * three `@autopilot/*` bare specifiers via `resolve.alias`.
 *
 * That alias cannot see a RELATIVE path. A `scripts/**\/*.mjs` helper that does
 * `import { X } from '../../packages/engine/dist/index.js'` walks straight past
 * it, and the moment a test imports that helper the whole file dies at import
 * time with ERR_MODULE_NOT_FOUND — before a single assertion runs. It is a
 * quiet failure mode: it stays invisible to anyone whose working tree happens
 * to hold a build, and CI hides it too, because `ci.yml` builds (step "build")
 * before it tests (step "test:coverage"). Only `pnpm verify` on a clean tree
 * shows it, which is exactly the command contributors are told to run.
 *
 * The convention that keeps this closed is already the de-facto practice —
 * every other tooling test imports a dependency-free script, and where a
 * generator genuinely needs built output the pure half is split into its own
 * module (`scripts/self-study/history-guard.mjs` beside `generate-data.mjs`,
 * `scripts/threat-model/render-table.mjs` beside `generate-table.mjs`). This
 * gate is what turns that practice into something that fails loudly instead of
 * being rediscovered by the next contributor whose clone happens to be clean.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** Every `from '...'` / `import '...'` specifier in a source file. */
const SPECIFIERS = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/** A relative import that reaches into a workspace package's BUILD output. */
const BUILT_OUTPUT = /packages\/[^/]+\/dist\//;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

function testFiles(): string[] {
  const found: string[] = [];
  for (const group of ['apps', 'packages']) {
    const groupDir = join(REPO_ROOT, group);
    for (const pkg of readdirSync(groupDir, { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue;
      const testDir = join(groupDir, pkg.name, 'test');
      try {
        if (statSync(testDir).isDirectory()) walk(testDir, found);
      } catch {
        // A package without a test/ directory is fine — nothing to scan.
      }
    }
  }
  return found;
}

/**
 * Import scanning has to ignore prose. This very file documents the bad shape
 * it hunts for, and a doc comment quoting an import is an example, not an
 * import — any other test that explains itself has the same right. Strip block
 * comments and whole-line `//` comments before matching. (Deliberately not a
 * regex: a naive one would also cut a `//` out of the middle of a URL string
 * literal and leave an unterminated quote behind.)
 */
function withoutComments(source: string): string {
  let out = '';
  let rest = source;
  for (;;) {
    const open = rest.indexOf('/*');
    if (open === -1) break;
    const close = rest.indexOf('*/', open + 2);
    if (close === -1) break;
    out += rest.slice(0, open);
    rest = rest.slice(close + 2);
  }
  out += rest;
  return out
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

function specifiersIn(file: string): string[] {
  const out: string[] = [];
  for (const match of withoutComments(readFileSync(file, 'utf8')).matchAll(SPECIFIERS)) {
    const spec = match[1];
    if (spec !== undefined) out.push(spec);
  }
  return out;
}

/** `specifiersIn` for a file the walk merely *reached*: an unreadable or
 *  unparseable hop is not this gate’s business to fail on. Applied to the
 *  test files too, so a filesystem hiccup mid-scan surfaces as "no imports"
 *  rather than tearing down the whole run. */
function specifiersOrNone(file: string): string[] {
  try {
    return specifiersIn(file);
  } catch {
    return [];
  }
}

/** Keeps the walk inside the repository. A specifier is only text read out of
 *  a file, so a `../` chain could otherwise send readFileSync somewhere off
 *  the tree being gated; nothing beyond REPO_ROOT is in scope here. */
function insideRepo(file: string): boolean {
  return resolvePath(file).startsWith(REPO_ROOT);
}

const asPosix = (file: string): string => relative(REPO_ROOT, file).split(sep).join('/');

/** Relative-import extensions the walk follows — the three a Node ESM module
 *  can actually load at runtime. Everything under scripts/ is `.mjs` today, but
 *  naming the set means a future `./helper.js` hop cannot quietly drop a whole
 *  branch of the graph. */
const FOLLOWABLE = ['.mjs', '.js', '.cjs'];

const isFollowable = (spec: string): boolean => FOLLOWABLE.some((ext) => spec.endsWith(ext));

/**
 * Walks the import graph reachable from the test suite and reports every path
 * that lands on built output.
 *
 * Two shapes count, and both must: a test that imports a package's dist folder
 * DIRECTLY, and a test that imports a `scripts/` helper which does. The direct
 * shape is the simpler of the two and involves no `scripts/` hop at all, so
 * every test specifier is checked on its own before it is ever considered as a
 * seed for the walk.
 *
 * `violations` are human-readable chains ("test -> script -> dist import") so a
 * failure says exactly where to look; `reached` is every file the walk actually
 * opened, which is what keeps this gate from passing vacuously if the walk ever
 * stops resolving anything.
 */
function scanTestImportGraph(): { violations: string[]; reached: Set<string> } {
  const violations: string[] = [];
  const reached = new Set<string>();

  for (const test of testFiles()) {
    for (const spec of specifiersOrNone(test)) {
      // The simplest violation there is: no indirection, straight into dist.
      if (BUILT_OUTPUT.test(spec)) {
        violations.push(`${asPosix(test)} → imports ${spec}`);
        continue;
      }
      if (!spec.includes('/scripts/') || !isFollowable(spec)) continue;

      const entry = resolvePath(dirname(test), spec);
      if (!insideRepo(entry)) continue;

      const seen = new Set<string>();
      const queue: Array<{ file: string; chain: string[] }> = [
        { file: entry, chain: [asPosix(entry)] },
      ];

      while (queue.length > 0) {
        const { file, chain } = queue.shift()!;
        if (seen.has(file)) continue;
        seen.add(file);
        reached.add(asPosix(file));

        for (const next of specifiersOrNone(file)) {
          if (BUILT_OUTPUT.test(next)) {
            violations.push(`${asPosix(test)} → ${chain.join(' → ')} → imports ${next}`);
            continue;
          }
          if (!next.startsWith('.') || !isFollowable(next)) continue;

          const hop = resolvePath(dirname(file), next);
          if (!insideRepo(hop)) continue;
          queue.push({ file: hop, chain: [...chain, asPosix(hop)] });
        }
      }
    }
  }

  return { violations: violations.sort(), reached };
}

describe('the test suite needs no prior build', () => {
  it('reaches no built package output from any test', () => {
    const { violations } = scanTestImportGraph();

    expect(
      violations,
      'These tests can reach built output, but `pnpm verify` runs test:coverage BEFORE ' +
        'build and every packages/*/dist is git-ignored — so on a fresh clone the file ' +
        'dies at import with ERR_MODULE_NOT_FOUND before a single assertion runs. Import ' +
        'the source through its `@autopilot/*` specifier (vitest.config.ts aliases those ' +
        'to src), or split the pure logic into a dependency-free module and import that ' +
        'instead (see scripts/threat-model/render-table.mjs), leaving the dist-reading ' +
        'half to a post-build CI gate:\n  ' +
        violations.join('\n  '),
    ).toEqual([]);
  });

  it('recognizes both violation shapes — direct, and via a script hop', () => {
    // A guard that scans a clean tree passes whether or not its detection
    // works. Exercise the predicate itself, including the no-indirection shape
    // a test can reach without touching scripts/ at all.
    expect(BUILT_OUTPUT.test('../../../../packages/engine/dist/index.js')).toBe(true);
    expect(BUILT_OUTPUT.test('../../packages/store/dist/index.js')).toBe(true);
    expect(BUILT_OUTPUT.test('./render-table.mjs')).toBe(false);
    expect(BUILT_OUTPUT.test('@autopilot/engine')).toBe(false);
    expect(BUILT_OUTPUT.test('../../packages/engine/src/index.ts')).toBe(false);
  });

  it('reads imports, not prose — a comment quoting an import is not one', () => {
    // How the previous revision of this gate failed: its own header documents
    // the bad shape it hunts for, and the scanner counted that example as a
    // real import and flagged this file. Placeholders below, not real paths,
    // so the fixture cannot re-create that same confusion.
    const source = [
      '/** example: import a from "IN_BLOCK_COMMENT" */',
      '// import b from "IN_LINE_COMMENT"',
      'import c from "./real.mjs";',
    ].join('\n');

    const scanned = withoutComments(source);

    expect(scanned).not.toContain('IN_BLOCK_COMMENT');
    expect(scanned).not.toContain('IN_LINE_COMMENT');
    expect(scanned).toContain('./real.mjs');
  });

  it('follows every runtime-loadable relative hop, not only .mjs', () => {
    // scripts/ is all .mjs today. If that ever stops being true, a dropped hop
    // would silently shrink the graph this gate walks.
    expect(isFollowable('./helper.mjs')).toBe(true);
    expect(isFollowable('./helper.js')).toBe(true);
    expect(isFollowable('./helper.cjs')).toBe(true);
    expect(isFollowable('./styles.css')).toBe(false);
  });

  it('actually opened the scripts it claims to have walked', () => {
    // If the walk stopped resolving anything — a moved directory, a renamed
    // suffix, a REPO_ROOT that no longer points at the repo — the first
    // assertion would pass on an empty set. Anchor it to a hop this repo really
    // has: generate-table.test.ts imports render-table.mjs.
    const { reached } = scanTestImportGraph();
    const files = testFiles().map(asPosix);

    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('apps/dashboard/test/tooling/generate-table.test.ts');
    expect([...reached]).toContain('scripts/threat-model/render-table.mjs');
  });
});
