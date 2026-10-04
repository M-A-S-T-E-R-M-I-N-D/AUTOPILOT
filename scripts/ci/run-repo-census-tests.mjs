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
 * A test that reads a workspace SOURCE file as text is the same blind spot
 * (2026-09-30): five suites pin fly.ts's wiring by its source text, and a
 * fly.ts edit selected zero tests at the per-firing gate
 * (docs/debriefs/2026-09-30-verdict-ap-mun9xrba-2-test-impacted-blast-radius-refuted.md).
 *
 * The same read, spelled with `join(process.cwd(), …)` instead of `new
 * URL(…, import.meta.url)`, is the same blind spot again (2026-10-04): under
 * jsdom `import.meta.url` is an http: URL, not file:, so every suite that
 * pins a workspace source file's text from a jsdom environment resolves it
 * from `process.cwd()` instead — `main.ts`'s two repo-binding guards and the
 * icon-system emoji census (which reads the whole `src/web/` folder this
 * way) rode along on no change to the file they pin.
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

/** The test resolves a workspace source file or folder against its own
 *  location — `new URL('../../src/fly.ts', import.meta.url)` — to read it as
 *  TEXT. A source read imports nothing, so the import graph cannot see it. */
const SOURCE_URL_RE =
  /new URL\(\s*(['"`])\.\.\/(?:[^'"`]*\/)?src\/[^'"`]*\1\s*,\s*import\.meta\.url\b/;

/** The same workspace-source-as-text read, resolved from `process.cwd()`
 *  instead of `import.meta.url` — what a jsdom-environment suite must use,
 *  since `import.meta.url` there is an http: URL, not file:. */
const SOURCE_CWD_RE = /\bjoin\(\s*process\.cwd\(\)\s*,\s*(['"`])(?:[^'"`]*\/)?src\/[^'"`]*\1/;

/** Git's `config` subcommand opening an argv array — `gitSync(dir, ['config',
 *  'user.email', …])`, the setup of every real-git suite. It names no path. */
const GIT_CONFIG_ARGV_RE = /\[\s*(['"`])config\1/g;

/** True for a test source that reads the repository by path: it reads the
 *  filesystem, and it names a repository path somewhere in the file. */
export function isRepoReadingTest(source) {
  // A test that lists the tracked sources itself (`git ls-files`) scans the
  // whole repository — the windowsHide census missed a new script this way
  // (2026-09-26): no change to a scanned file ever selects it.
  if (FS_READ_RE.test(source) && source.includes("'ls-files'")) return true;
  // A test that pins a module's wiring by its source text (2026-09-30): five
  // suites read fly.ts that way, and a fly.ts edit selected none of them.
  // The same read spelled via process.cwd() (2026-10-04) is the same case.
  if (FS_READ_RE.test(source) && (SOURCE_URL_RE.test(source) || SOURCE_CWD_RE.test(source))) {
    return true;
  }
  // A `git config` argv is not the config/ directory (2026-09-28). Read as
  // one, it put five real-git suites that read no repository path into every
  // per-firing gate, and under fleet load their timeouts crashed the gate.
  const paths = source.replace(GIT_CONFIG_ARGV_RE, '[');
  return FS_READ_RE.test(source) && REPO_PATH_RE.test(paths);
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
      // Stryker disable next-line ArrayDeclaration: any name returned here
      // becomes <root>/<top>/<name>/test under a top that does not exist, and
      // testFilesUnder reads a missing directory as no tests.
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
    .map((path) => repoRelative(root, path));
  return [...new Set([...ALWAYS, ...found])].sort();
}

/** A path relative to `root`, with forward slashes. */
function repoRelative(root, path) {
  // Stryker disable next-line StringLiteral: this runs on ubuntu-latest
  // (see .github/workflows/mutation.yml), where node:path never emits
  // `\` — `.split('\\')` always returns a single-element array, so the
  // `.join('/')` separator has nothing to join and is unreachable (proven:
  // 'a/b'.split('\\').join('') === 'a/b'.split('\\').join('/')). The
  // `split('\\')` argument itself stays live and is killed by every
  // exact-path assertion in run-repo-census-tests.test.ts. It sits in its
  // own statement because inside a method chain the directive bound to an
  // inner node, and the nightly run of 2026-09-28 reported the mutant anyway.
  return relative(root, path).split('\\').join('/');
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
