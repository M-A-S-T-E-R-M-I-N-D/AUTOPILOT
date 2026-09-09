#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * MODEL FRESHNESS — makes a stale catalogue loud instead of silent.
 *
 * The fleet's defaults are family ALIASES (`fable`, `opus`), so new
 * versions are picked up with no code change. That covers versions. It
 * does not cover two other kinds of staleness, and the operator named
 * both (2026-09-09):
 *
 *   1. A pinned id in the catalogue names a version that is no longer
 *      current, so the "Fable 5.1" a picker offers is not what `fable`
 *      actually resolves to any more.
 *   2. A whole new FAMILY ships. Aliases cannot track that — there is no
 *      alias for a family nobody has written down — so the fleet keeps
 *      flying the old set forever and nothing says a word.
 *
 * This check asks the installed Claude CLI what it will actually accept
 * and compares that to the catalogue. It is INFORMATIONAL by default:
 * a model launch must never turn into a red build for us. `--strict`
 * makes it fail, for a maintainer who wants the reminder to block.
 *
 * Usage:
 *   node scripts/ci/check-model-freshness.mjs [--strict]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STRICT = process.argv.includes('--strict');
const CATALOGUE_SRC = fileURLToPath(
  new URL('../../packages/engine/src/models.ts', import.meta.url),
);

/** The catalogue's ids, read from the source rather than imported: this
 *  script stays dependency-free and runs on an unbuilt tree, the same
 *  constraint `check-doc-commit-refs` and the threat-model generator's
 *  render half already work under. */
function catalogueIds() {
  const src = readFileSync(CATALOGUE_SRC, 'utf8');
  return [...src.matchAll(/^\s*id:\s*'([^']+)'/gm)].map((m) => m[1]);
}

function catalogueFamilies() {
  const src = readFileSync(CATALOGUE_SRC, 'utf8');
  const match = src.match(/MODEL_FAMILIES:\s*readonly ModelFamily\[\]\s*=\s*\[([^\]]+)\]/);
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** What the installed CLI advertises. Absent CLI is not a failure — a
 *  contributor without Claude installed still gets a green build. */
function cliModelHelp() {
  try {
    return execFileSync('claude', ['--help'], { encoding: 'utf8', timeout: 30_000 });
  } catch {
    return null;
  }
}

function main() {
  const ids = catalogueIds();
  const families = catalogueFamilies();
  const help = cliModelHelp();

  if (help === null) {
    console.log('model-freshness SKIPPED: no `claude` CLI on PATH to ask.');
    console.log(`  catalogue carries ${ids.length} model(s) across ${families.length} families.`);
    return;
  }

  // Scoped to the ONE sentence that names aliases — "Provide an alias for
  // the latest model (e.g. 'fable', 'opus', or 'sonnet')" — not to every
  // quoted word in the help text. The loose version flagged `'agent'` from
  // an unrelated flag on its first run: a check that cries wolf trains
  // everyone to ignore it (guard-precision doctrine, FAILURE-DOCTRINE
  // row 6), and this one is meant to be believed the day it fires for real.
  const sentence = help.match(/alias for the latest model[^)]*\)/i)?.[0] ?? '';
  const advertised = [
    ...new Set([...sentence.matchAll(/'([a-z][a-z0-9]{2,11})'/g)].map((m) => m[1])),
  ];
  const unknownFamilies = advertised.filter((word) => !families.includes(word));

  const findings = [];
  if (unknownFamilies.length > 0) {
    findings.push(
      `the CLI advertises alias(es) the catalogue does not list: ${unknownFamilies.join(', ')}`,
    );
  }

  if (findings.length === 0) {
    console.log(`model-freshness OK: catalogue covers every alias the CLI advertises.`);
    console.log(`  families: ${families.join(', ')} · ${ids.length} catalogued model(s).`);
    return;
  }

  const label = STRICT ? '✗' : '⚠';
  console.log(`${label} model-freshness: ${findings.length} finding(s)`);
  for (const f of findings) console.log(`  - ${f}`);
  console.log('  Update packages/engine/src/models.ts (and docs/MODELS.md) to offer them.');
  console.log('  Nothing is broken meanwhile: an unlisted model still flies — the');
  console.log('  catalogue describes, it never restricts.');
  if (STRICT) process.exitCode = 1;
}

main();
