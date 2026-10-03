// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * refresh-status — the living facts every status page used to carry by hand.
 *
 * On 2026-10-03 an inventory of the docs found the same kind of drift in
 * nine of them: a version two releases behind, "11 anomaly kinds" against
 * fifteen in the code, "110 Stryker configs" against 130 on disk, "160+ real
 * firings" against nine hundred, a Node floor two minors old. Each had been
 * refreshed by hand a few times and then forgotten. The citation generator
 * already keeps the version pins honest; this does the same for the counts,
 * from the one place each count is actually true:
 *
 *   version        package.json
 *   released       CHANGELOG.md — the latest dated section
 *   node           package.json engines.node
 *   prompt         packages/engine/src/prompt.ts FIRING_PROMPT_VERSION
 *   test files     git ls-files *.test.ts / .tsx / .mjs / .js (rounded to ten,
 *                  so a lane adding one test does not have to regenerate)
 *   mutation       config/mutation/stryker.*.config.mjs
 *   anomaly kinds  apps/dashboard/src/read/anomalies.ts AnomalyKind union
 *   doctrine rows  docs/FAILURE-DOCTRINE.md numbered rows
 *   epics          docs/epics/00NN-*.md Status: lines, bucketed
 *
 * Every file in STATUS_TARGETS carries one
 * `<!-- STATUS:FACTS:START --> … <!-- STATUS:FACTS:END -->` block; the block
 * is rewritten whole, nothing outside it is touched. The recorded-firings
 * count stays with the self-study paper on purpose: it changes at every
 * flight end, and a count that moves without a commit cannot be a CI gate.
 *
 *   node scripts/docs/refresh-status.mjs          rewrite the blocks
 *   node scripts/docs/refresh-status.mjs --check  exit 1 when any block drifts
 *
 * `ci:docs-status` runs the check; it is part of every firing's gate like the
 * other ci:* scripts, so a lane that changes a counted fact runs
 * `pnpm docs:status` and commits the result with its work.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The docs that carry a STATUS:FACTS block. Relative to the repo root. */
export const STATUS_TARGETS = [
  'README.md',
  'docs/ROADMAP.md',
  'docs/ACTION-PLAN.md',
  'docs/FEATURE-COVERAGE.md',
  'docs/BACKLOG-999.md',
  'docs/LIVING-REPO-SPEC.md',
  'docs/MUTATION-DEBT.md',
  '.github/CONTRIBUTING.md',
];

const START = '<!-- STATUS:FACTS:START -->';
const END = '<!-- STATUS:FACTS:END -->';

/** @param {string} rel */
function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** The epic Status: vocabulary, bucketed. Anything unrecognised counts as
 *  active rather than vanishing from the total. */
export function epicBucket(statusLine) {
  const s = statusLine.toLowerCase();
  if (/^(done|shipped|all .*shipped|complete)/.test(s)) return 'shipped';
  if (/^(draft|specified)/.test(s)) return 'draft';
  return 'active';
}

/** Gather every fact from its source of truth. Pure apart from reading the
 *  tree and asking git for the test-file list. */
export function collectFacts(root = ROOT) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  const released = /^## \[(\d+\.\d+\.\d+)\] — (\d{4}-\d{2}-\d{2})/m.exec(changelog);
  const prompt = readFileSync(join(root, 'packages/engine/src/prompt.ts'), 'utf8');
  const promptVersion = /FIRING_PROMPT_VERSION = '([^']+)'/.exec(prompt)?.[1] ?? 'unknown';
  const anomalies = readFileSync(join(root, 'apps/dashboard/src/read/anomalies.ts'), 'utf8');
  const kindUnion = /export type AnomalyKind =([\s\S]*?);/.exec(anomalies)?.[1] ?? '';
  // `e2e-land-block` carries a digit — the class is [a-z0-9-], not [a-z-].
  const anomalyKinds = (kindUnion.match(/\|\s*'[a-z0-9-]+'/g) ?? []).length;
  const doctrine = readFileSync(join(root, 'docs/FAILURE-DOCTRINE.md'), 'utf8');
  const doctrineRows = (doctrine.match(/^\| \d+ \|/gm) ?? []).length;
  const mutationConfigs = readdirSync(join(root, 'config/mutation')).filter((f) =>
    /^stryker\..*\.config\.mjs$/.test(f),
  ).length;
  const testFiles = execFileSync(
    'git',
    ['ls-files', '*.test.ts', '*.test.tsx', '*.test.mjs', '*.test.js'],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\n')
    .filter((l) => l.trim() !== '').length;
  const epics = { shipped: 0, active: 0, draft: 0 };
  for (const f of readdirSync(join(root, 'docs/epics'))) {
    if (!/^\d{4}-.*\.md$/.test(f)) continue;
    const status = /^Status:\s*(.+)$/m.exec(readFileSync(join(root, 'docs/epics', f), 'utf8'));
    if (!status) continue;
    epics[epicBucket(status[1])] += 1;
  }
  return {
    version: String(pkg.version),
    released: released ? released[2] : 'unreleased',
    nodeFloor: String(pkg.engines?.node ?? '').replace(/^>=\s*/, ''),
    promptVersion,
    testFilesRounded: Math.round(testFiles / 10) * 10,
    mutationConfigs,
    anomalyKinds,
    doctrineRows,
    epics,
  };
}

/** The one line every target carries. Prose, not a table, so it reads in a
 *  README and in a spec alike. */
export function renderFacts(f) {
  return (
    `_Living status, as of v${f.version} (released ${f.released}): ` +
    `about ${f.testFilesRounded} test files · ${f.mutationConfigs} mutation configs at a 100% break threshold · ` +
    `${f.anomalyKinds} anomaly kinds on the Health panel · ${f.doctrineRows} rows in the failure doctrine · ` +
    `firing prompt \`${f.promptVersion}\` · Node ≥ ${f.nodeFloor} · ` +
    `epics: ${f.epics.shipped} shipped, ${f.epics.active} active, ${f.epics.draft} draft. ` +
    'Regenerated by `pnpm docs:status`; `ci:docs-status` fails when it drifts. ' +
    'Recorded firings live in the self-study paper, which the fleet regenerates at every flight end._'
  );
}

/** The file with its block rewritten, or null when it carries no block. The
 *  blank lines framing the content inside the markers are kept as they are:
 *  Prettier adds one after the opening marker where the block follows a
 *  list, and a generator that fought the formatter would never be stable. */
export function rewriteBlock(text, line) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start < 0 || end < 0 || end < start) return null;
  const inner = text.slice(start + START.length, end);
  const lead = /^(?:[ \t]*\n)+/.exec(inner)?.[0] ?? '\n';
  const trail = /(?:\n[ \t]*)+$/.exec(inner.slice(lead.length))?.[0] ?? '\n';
  return `${text.slice(0, start + START.length)}${lead}${line}${trail}${text.slice(end)}`;
}

function main(argv) {
  const check = argv.includes('--check');
  const line = renderFacts(collectFacts());
  const drifted = [];
  const missing = [];
  for (const rel of STATUS_TARGETS) {
    const current = read(rel);
    const next = rewriteBlock(current, line);
    if (next === null) {
      missing.push(rel);
      continue;
    }
    if (next === current) continue;
    if (check) drifted.push(rel);
    else writeFileSync(join(ROOT, rel), next);
  }
  if (missing.length > 0) {
    console.error(`refresh-status: no STATUS:FACTS block in ${missing.join(', ')}`);
    process.exit(2);
  }
  if (check) {
    if (drifted.length > 0) {
      console.error(
        `check-docs-status FAILED: ${drifted.join(', ')} — run \`pnpm docs:status\` and commit the result`,
      );
      process.exit(1);
    }
    console.log(`check-docs-status OK (${STATUS_TARGETS.length} blocks current)`);
    return;
  }
  console.log(`refresh-status: ${STATUS_TARGETS.length} blocks written\n${line}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
