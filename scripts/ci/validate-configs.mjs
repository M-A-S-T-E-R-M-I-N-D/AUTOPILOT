// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * validate-configs — schema/shape gate for the repo's declarative configs
 * (PATTERNS-AND-STANDARDS §4, "validators-as-gates"):
 *   1. every tracked *.json / *.jsonc parses (JSONC-tolerant for tsconfig*);
 *   2. root package.json is Apache-2.0 and private;
 *   3. every workspace package.json has name/version/license/type=module;
 *   4. every tsconfig reference path exists on disk;
 *   5. "verify" stays a FAST gate: it must chain no mutation:* step, and the
 *      "mutation" script must invoke the discovery runner
 *      (scripts/ci/run-all-mutation.mjs), which finds every config under
 *      config/mutation/ by itself — so a newly wired module is always covered
 *      by the deep gate without ever fattening the fast one.
 *   6. `.github/labels.json`'s "pool: *" labels match `tasks.dimension`'s CHECK
 *      constraint (packages/store/src/schema.ts) 1:1 — the GitHub-facing pool
 *      labels a future KEEPER triage ritual (web-mss50i9u-ldv513) maps incoming
 *      issues onto are useless if they silently drift from the board's own
 *      dimension enum.
 *   7. `.github/branch-protection.json`'s required-status-check contexts match
 *      the `verify (${{ matrix.os }})` jobs AND the `e2e` job in
 *      `.github/workflows/ci.yml` 1:1 — the canonical-lock config (epic 0007
 *      slice 1, gh:setup-branch-protection) is useless if it silently drifts
 *      from the CI job names it must name exactly to actually gate merges.
 *      The live incident this closes (board web-mtbeu5f7-gbic3z, EVAL 08-27):
 *      the e2e job runs a real browser against the compiled dashboard and
 *      would have caught a cross-lane `.toString()`-embedded name mismatch,
 *      but was never a required check, so a red e2e run never blocked a
 *      merge.
 *   8. every `uses:` step in `.github/workflows/*.yml` is pinned to a full
 *      40-hex commit SHA, never a mutable tag/branch (MAINTENANCE RITUAL
 *      "action-pin bumps", board web-mstdokr6-qgxqz8) — the machine-checkable
 *      floor a periodic pin-bump sweep relies on to know pinning discipline
 *      hasn't silently drifted back to a floating ref.
 *   9. every `ci:*` script chained into package.json's "verify" also appears
 *      as its own `run: pnpm run ci:*` step somewhere in
 *      `.github/workflows/ci.yml` — the live incident this check closes: the
 *      flaky-test quarantine groundwork (web-msnsqjc7-tg8lqv) wired
 *      `ci:quarantine-report` into "verify" but never added a matching CI
 *      workflow step, so the check ran locally but silently never executed
 *      in real CI. "verify" staying green locally is not proof a check is
 *      actually gating anything upstream.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const NUL = String.fromCharCode(0);

/** @param {string} src */
function stripJsonComments(src) {
  // Remove /* */ and // comments and trailing commas (JSONC → JSON).
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/(^|[^:"'])\/\/[^\n\r]*/g, '$1');
  out = out.replace(/,(\s*[}\]])/g, '$1');
  return out;
}

/** @param {string} file @returns {unknown} */
function parseConfig(file) {
  const raw = readFileSync(file, 'utf8');
  const jsonc = /tsconfig.*\.json$|\.jsonc$/.test(file);
  return JSON.parse(jsonc ? stripJsonComments(raw) : raw);
}

/** @returns {string[]} */
function listTrackedFiles() {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return out.split(NUL).filter(Boolean);
}

function main() {
  const files = listTrackedFiles();
  /** @type {string[]} */
  const errors = [];

  // 1 — every JSON/JSONC parses.
  const jsonFiles = files.filter((f) => /\.jsonc?$/.test(f));
  /** @type {Map<string, Record<string, unknown>>} */
  const parsed = new Map();
  for (const file of jsonFiles) {
    try {
      parsed.set(file, /** @type {Record<string, unknown>} */ (parseConfig(file)));
    } catch (err) {
      errors.push(`parse error: ${file} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2 — root package.json shape.
  const rootPkg = parsed.get('package.json');
  if (!rootPkg) {
    errors.push('missing or unparseable root package.json');
  } else {
    if (rootPkg['license'] !== 'Apache-2.0')
      errors.push('root package.json license must be "Apache-2.0"');
    if (rootPkg['private'] !== true) errors.push('root package.json must be private:true');
  }

  // 3 — workspace package manifests.
  const wsManifests = jsonFiles.filter(
    (f) => /^(packages|apps)\/[^/]+\/package\.json$/.test(f) && parsed.has(f),
  );
  if (wsManifests.length === 0) errors.push('no workspace package.json manifests found');
  for (const f of wsManifests) {
    const pkg = parsed.get(f);
    if (!pkg) continue;
    for (const key of ['name', 'version', 'license']) {
      if (typeof pkg[key] !== 'string' || pkg[key] === '') errors.push(`${f}: missing "${key}"`);
    }
    if (pkg['license'] !== 'Apache-2.0') errors.push(`${f}: license must be "Apache-2.0"`);
    if (pkg['type'] !== 'module') errors.push(`${f}: must set "type": "module"`);
    if (typeof pkg['name'] === 'string' && !pkg['name'].startsWith('@autopilot/')) {
      errors.push(`${f}: name should be scoped "@autopilot/*"`);
    }
  }

  // 4 — tsconfig references resolve on disk.
  const tsconfigs = jsonFiles.filter((f) => /tsconfig.*\.json$/.test(f) && parsed.has(f));
  for (const f of tsconfigs) {
    const cfg = parsed.get(f);
    const refs = cfg?.['references'];
    if (!Array.isArray(refs)) continue;
    for (const ref of refs) {
      const p = /** @type {{ path?: string }} */ (ref)?.path;
      if (typeof p !== 'string') continue;
      const target = join(dirname(f), p);
      const asFile = existsSync(target);
      const asDir = existsSync(join(target, 'tsconfig.json'));
      if (!asFile && !asDir) errors.push(`${f}: reference path does not exist: ${p}`);
    }
  }

  // 5 — INVERTED (the VERIFY DIET rule): mutation runs live in the discovery
  // runner (scripts/ci/run-all-mutation.mjs, `pnpm run mutation`), NEVER in
  // the fast gate. The old rule here REQUIRED every mutation:* script inside
  // verify — which is exactly how verify grew to 74 chained Stryker runs that
  // nobody executed (see RESEARCH-LIBRARY, "runaway-task economics"). The
  // fast gate and the deep gate must not drift back together.
  if (rootPkg) {
    const scripts = /** @type {Record<string, unknown>} */ (rootPkg['scripts']) ?? {};
    const verifyScript = typeof scripts['verify'] === 'string' ? scripts['verify'] : '';
    if (/pnpm run mutation:/.test(verifyScript)) {
      errors.push(
        'package.json: "verify" must not chain mutation:* steps — deep runs belong to "pnpm run mutation" (run-all-mutation.mjs)',
      );
    }
    const mutationRunner = scripts['mutation'];
    if (typeof mutationRunner !== 'string' || !mutationRunner.includes('run-all-mutation')) {
      errors.push(
        'package.json: the "mutation" script must invoke scripts/ci/run-all-mutation.mjs',
      );
    }
  }

  // 6 — `.github/labels.json` pool labels match the `tasks.dimension` enum.
  const schemaPath = 'packages/store/src/schema.ts';
  if (existsSync(schemaPath) && parsed.has('.github/labels.json')) {
    const schemaSrc = readFileSync(schemaPath, 'utf8');
    const dimensionMatch = schemaSrc.match(/dimension IS NULL OR dimension IN\s*\(([^)]*)\)/);
    if (!dimensionMatch) {
      errors.push(`${schemaPath}: could not locate the "dimension" CHECK constraint`);
    } else {
      const dimensions = new Set(Array.from(dimensionMatch[1].matchAll(/'([^']+)'/g), (m) => m[1]));
      const labels = /** @type {unknown} */ (parsed.get('.github/labels.json'));
      const poolNames = Array.isArray(labels)
        ? labels
            .map((l) => /** @type {{ name?: unknown }} */ (l)?.name)
            .filter((n) => typeof n === 'string' && n.startsWith('pool: '))
            .map((n) => /** @type {string} */ (n).slice('pool: '.length))
        : [];
      const labeled = new Set(poolNames);
      for (const dim of dimensions) {
        if (!labeled.has(dim)) errors.push(`.github/labels.json: missing "pool: ${dim}" label`);
      }
      for (const name of labeled) {
        if (!dimensions.has(name)) {
          errors.push(`.github/labels.json: "pool: ${name}" has no matching tasks.dimension value`);
        }
      }
    }
  }

  // 7 — `.github/branch-protection.json` required-check contexts match CI's
  // matrix jobs AND the e2e job (board web-mtbeu5f7-gbic3z: e2e ran in CI but
  // was never a required check, so a red real-browser run never blocked a
  // merge).
  const ciWorkflowPath = '.github/workflows/ci.yml';
  if (existsSync(ciWorkflowPath) && parsed.has('.github/branch-protection.json')) {
    const ciSrc = readFileSync(ciWorkflowPath, 'utf8');
    const osMatch = ciSrc.match(
      /name:\s*verify \(\$\{\{\s*matrix\.os\s*\}\}\)[\s\S]*?os:\s*\[([^\]]*)\]/,
    );
    const e2eMatch = ciSrc.match(/^ {2}e2e:\s*\n\s*name:\s*(.+)$/m);
    if (!osMatch) {
      errors.push(`${ciWorkflowPath}: could not locate the "verify" job's os matrix`);
    } else if (!e2eMatch) {
      errors.push(`${ciWorkflowPath}: could not locate the "e2e" job's name`);
    } else {
      const expected = new Set(
        Array.from(osMatch[1].matchAll(/[\w-]+/g), (m) => `verify (${m[0]})`),
      );
      expected.add(e2eMatch[1].trim());
      const config = /** @type {{ required_status_checks?: { contexts?: unknown } }} */ (
        parsed.get('.github/branch-protection.json')
      );
      const contexts = new Set(
        Array.isArray(config?.required_status_checks?.contexts)
          ? config.required_status_checks.contexts
          : [],
      );
      for (const ctx of expected) {
        if (!contexts.has(ctx)) {
          errors.push(`.github/branch-protection.json: missing required-check context "${ctx}"`);
        }
      }
      for (const ctx of contexts) {
        if (!expected.has(ctx)) {
          errors.push(
            `.github/branch-protection.json: "${ctx}" has no matching CI job in ${ciWorkflowPath}`,
          );
        }
      }
    }
  }

  // 8 — every workflow `uses:` step is pinned to a full commit SHA. A
  // floating ref (`@v7`, `@main`) lets the action owner silently swap what
  // runs in CI — the well-known GitHub Actions supply-chain risk. Local
  // actions (`./...`) and Docker actions (`docker://...`) carry no upstream
  // ref to pin, so they are exempt.
  const workflowFiles = files.filter((f) => /^\.github\/workflows\/.*\.ya?ml$/.test(f));
  const SHA_RE = /^[0-9a-f]{40}$/i;
  for (const f of workflowFiles) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)) {
      const ref = m[1];
      if (ref.startsWith('./') || ref.startsWith('docker://')) continue;
      const at = ref.lastIndexOf('@');
      if (at < 0) {
        errors.push(`${f}: action "${ref}" has no @ref — pin it to a full commit SHA`);
        continue;
      }
      const sha = ref.slice(at + 1);
      if (!SHA_RE.test(sha)) {
        errors.push(`${f}: action "${ref}" is not pinned to a full commit SHA (found "${sha}")`);
      }
    }
  }

  // 9 — every `ci:*` script chained into "verify" has a matching CI step.
  if (rootPkg && existsSync(ciWorkflowPath)) {
    const scripts = /** @type {Record<string, unknown>} */ (rootPkg['scripts']) ?? {};
    const verifyScript = typeof scripts['verify'] === 'string' ? scripts['verify'] : '';
    const chained = new Set(
      Array.from(verifyScript.matchAll(/pnpm run (ci:[\w-]+)/g), (m) => m[1]),
    );
    const ciSrc = readFileSync(ciWorkflowPath, 'utf8');
    const wired = new Set(Array.from(ciSrc.matchAll(/run:\s*pnpm run (ci:[\w-]+)/g), (m) => m[1]));
    for (const name of chained) {
      if (!wired.has(name)) {
        errors.push(
          `${ciWorkflowPath}: "verify" chains "pnpm run ${name}" but no step runs it here`,
        );
      }
    }
  }

  if (errors.length > 0) {
    console.error(`validate-configs FAILED: ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`validate-configs OK: ${jsonFiles.length} JSON config(s) valid`);
}

main();
