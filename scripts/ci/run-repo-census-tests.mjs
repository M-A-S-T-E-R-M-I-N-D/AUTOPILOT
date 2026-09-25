// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `pnpm run test:registry-guards` — the tests every per-firing gate runs on
 * top of the impacted set, DISCOVERED rather than listed.
 *
 * WHY (2026-09-25): the per-firing gate runs `vitest run --changed HEAD~1`,
 * which selects tests through the import graph. A test that reads the
 * repository BY PATH — README.md, docs/, config/, .github/ — imports none of
 * what it checks, so no change to those files ever selects it. A lane added a
 * Stryker config; the test pinning README's "N Stryker mutation-testing runs"
 * never ran at the per-firing gate, and the flight branch went red four times
 * in one round before a full gate caught it. Four hand-listed registry tests
 * already rode along here; every such test now does, found by what it reads.
 * The whole set runs in about fifty seconds.
 *
 * Usage: node scripts/ci/run-repo-census-tests.mjs [--list]
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** The registry tests this script replaced the hand list of — always run. */
export const ALWAYS = [
  'apps/dashboard/test/flight/pr-review.test.ts',
  'apps/dashboard/test/tooling/generate-splice-manifest.test.ts',
  'apps/dashboard/test/tooling/chunks.test.ts',
  'apps/dashboard/test/server/client-bundle-size-budget.test.ts',
];

/** The test touches the filesystem at all. */
const FS_READ_RE = /\b(?:readFileSync|readdirSync|existsSync)\(/;

/** The test names a repository path the import graph cannot see — as a
 *  string literal, often in a constant far from the read that uses it. */
const REPO_PATH_RE = /['"`/](?:README\.md|CHANGELOG\.md|docs|config|\.github)(?:['"`/\\]|$)/m;

/** True for a test source that reads the repository by path: it reads the
 *  filesystem, and it names a repository path somewhere in the file. */
export function isRepoReadingTest(source) {
  return FS_READ_RE.test(source) && REPO_PATH_RE.test(source);
}

function testFilesUnder(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : testFilesUnder(path);
    return name.endsWith('.test.ts') ? [path] : [];
  });
}

/** Every test to run, repo-relative with forward slashes, sorted, unique. */
export function censusTestFiles(root = ROOT) {
  const roots = ['apps', 'packages'].flatMap((top) => {
    let names;
    try {
      names = readdirSync(join(root, top));
    } catch {
      return [];
    }
    return names.map((name) => join(root, top, name, 'test'));
  });
  const found = roots
    .flatMap(testFilesUnder)
    // Stryker disable next-line StringLiteral: readFileSync's `'utf8'` vs a
    // Buffer is unobservable through isRepoReadingTest — RegExp#test coerces
    // its argument with ToString, and Buffer#toString() also defaults to
    // utf8, so `RE.test(buf)` and `RE.test(buf.toString('utf8'))` agree on
    // every fixture (proven with a throwaway probe, deleted before commit).
    .filter((path) => isRepoReadingTest(readFileSync(path, 'utf8')))
    // Stryker disable next-line StringLiteral: this runs on ubuntu-latest
    // (see .github/workflows/mutation.yml), where node:path never emits
    // `\` — `.split('\\')` always returns a single-element array, so the
    // `.join('/')` separator has nothing to join and is unreachable (proven:
    // 'a/b'.split('\\').join('') === 'a/b'.split('\\').join('/')). The
    // `split('\\')` argument itself stays live and is killed by every
    // exact-path assertion in run-repo-census-tests.test.ts.
    .map((path) => relative(root, path).split('\\').join('/'));
  return [...new Set([...ALWAYS, ...found])].sort();
}

// Stryker disable all: the process shell — it spawns vitest and exits with
// its status. The discovery above is the logic, and it is tested.
function main() {
  const files = censusTestFiles();
  if (process.argv.includes('--list')) {
    for (const f of files) console.log(f);
    return;
  }
  console.log(
    `run-repo-census-tests: ${files.length} test file(s) that read the repository by path`,
  );
  try {
    execFileSync('pnpm', ['exec', 'vitest', 'run', ...files], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      windowsHide: true,
    });
  } catch (error) {
    process.exit(typeof error?.status === 'number' ? error.status : 1);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
// Stryker restore all
