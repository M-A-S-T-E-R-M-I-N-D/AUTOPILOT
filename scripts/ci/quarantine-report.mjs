// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * quarantine-report — reads `config/quarantine/flaky-tests.json` (the flaky-test
 * quarantine list, board web-msnsqjc7-tg8lqv: groundwork before browser E2E lands
 * its inherent flake risk) and reports it in verify output. Validates each entry
 * carries a non-empty `testPath`/`owner`/`reason`/`addedDate` — an owner-less or
 * reason-less quarantine entry is exactly the kind of silent-drift a declarative
 * config gate exists to catch (PATTERNS-AND-STANDARDS §4, "validators-as-gates").
 * Detection-only: it does not skip or allow-fail quarantined tests in
 * `vitest.config.ts` — that would risk masking a real regression rather than just
 * tracking a known-flaky one. See `scripts/ci/detect-flaky.mjs` for the sampler
 * that finds candidates to add here.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUARANTINE_PATH = 'config/quarantine/flaky-tests.json';
const REQUIRED_FIELDS = ['testPath', 'owner', 'reason', 'addedDate'];

/**
 * @param {unknown} data
 * @returns {{ errors: string[], entries: Array<{ testPath: string, owner: string, reason: string, addedDate: string }> }}
 */
export function validateQuarantineList(data) {
  /** @type {string[]} */
  const errors = [];
  if (!Array.isArray(data)) {
    return { errors: [`${QUARANTINE_PATH}: must be a JSON array`], entries: [] };
  }

  /** @type {Array<{ testPath: string, owner: string, reason: string, addedDate: string }>} */
  const entries = [];
  data.forEach((raw, i) => {
    const entry = /** @type {Record<string, unknown>} */ (raw);
    for (const field of REQUIRED_FIELDS) {
      if (typeof entry?.[field] !== 'string' || entry[field] === '') {
        errors.push(`${QUARANTINE_PATH}[${i}]: missing or empty "${field}"`);
      }
    }
    if (
      REQUIRED_FIELDS.every((field) => typeof entry?.[field] === 'string' && entry[field] !== '')
    ) {
      entries.push(
        /** @type {{ testPath: string, owner: string, reason: string, addedDate: string }} */ (
          entry
        ),
      );
    }
  });
  return { errors, entries };
}

/** @param {ReturnType<typeof validateQuarantineList>['entries']} entries */
export function summarizeQuarantine(entries) {
  if (entries.length === 0) return 'quarantine-report: 0 test(s) quarantined';
  const lines = entries.map((e) => `  - ${e.testPath} (owner: ${e.owner}, reason: ${e.reason})`);
  return [`quarantine-report: ${entries.length} test(s) quarantined:`, ...lines].join('\n');
}

function main() {
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(readFileSync(QUARANTINE_PATH, 'utf8'));
  } catch (err) {
    console.error(
      `quarantine-report FAILED: could not read/parse ${QUARANTINE_PATH} — ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
    return;
  }

  const { errors, entries } = validateQuarantineList(data);
  if (errors.length > 0) {
    console.error(`quarantine-report FAILED: ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
    return;
  }

  console.log(summarizeQuarantine(entries));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
