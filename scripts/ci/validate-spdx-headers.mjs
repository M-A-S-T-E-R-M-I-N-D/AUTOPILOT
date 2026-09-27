// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * validate-spdx-headers — fail CI if a tracked source file lacks an SPDX
 * license header. REUSE.toml auto-annotates data files (JSON/MD/YAML/TOML), but
 * source files must carry an inline header; this gate enforces that so the
 * "Apache-2.0 + SPDX/REUSE, CI-enforced" claim (FEATURE-COVERAGE M) stays true.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NUL = String.fromCharCode(0);
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
export const HEADER_SCAN_LINES = 20;

/**
 * True when an SPDX license tag appears within the first {@link HEADER_SCAN_LINES}
 * lines of `text`. Pure — no fs/git access — so it can be unit-tested directly
 * against fixture strings, same shape as secret-scan.mjs's findSecrets().
 * @param {string} text
 * @returns {boolean}
 */
export function hasSpdxHeader(text) {
  const head = text.split('\n').slice(0, HEADER_SCAN_LINES).join('\n');
  return head.includes('SPDX-License-Identifier');
}

/** One licence tag `reuse lint` would reject: a line number and what it read. */
/** @typedef {{ line: number, expression: string }} InvalidSpdxTag */

// REUSE-IgnoreStart — the tag this check looks for, as data.
const TAG = 'SPDX-License-Identifier:';
// REUSE-IgnoreEnd
const LICENCE_ID = String.raw`[A-Za-z0-9][A-Za-z0-9.+-]*`;
const VALID_EXPRESSION = new RegExp(
  String.raw`^\(?${LICENCE_ID}(?:\s+(?:AND|OR|WITH)\s+\(?${LICENCE_ID}\)?)*\)?$`,
);

/** Comment closers a licence tag may sit before: C's, and both forms HTML
 *  accepts (`--!>` ends a comment too). Compared as strings — a regex for an
 *  HTML comment end is what CodeQL's js/bad-tag-filter rightly flags. */
const COMMENT_CLOSERS = ['*/', '-->', '--!>'];

/**
 * The expression with any trailing comment closer removed.
 * @param {string} text
 * @returns {string}
 */
function withoutCommentCloser(text) {
  const closer = COMMENT_CLOSERS.find((c) => text.endsWith(c));
  return closer === undefined ? text : text.slice(0, -closer.length).trim();
}

/**
 * THE REUSE RED THAT SAT ON MAIN (2026-09-27): a test asserting on a header
 * wrote the tag as a string literal, `reuse lint` read the quote and bracket
 * after it as part of this file's licence expression, and the repository
 * stopped being REUSE-compliant. The CI job that says so is optional and
 * nothing local ran it, so it stayed red for two days. This is that check,
 * in the gate every firing and landing runs: every licence tag outside a
 * `REUSE-IgnoreStart`/`REUSE-IgnoreEnd` block must carry a valid SPDX
 * expression (identifiers joined by AND, OR or WITH), comment closers aside.
 * Pure, like {@link hasSpdxHeader}.
 * @param {string} text
 * @returns {InvalidSpdxTag[]}
 */
export function invalidSpdxTags(text) {
  /** @type {InvalidSpdxTag[]} */
  const found = [];
  let ignoring = false;
  text.split('\n').forEach((raw, index) => {
    if (raw.includes('REUSE-IgnoreStart')) ignoring = true;
    if (raw.includes('REUSE-IgnoreEnd')) {
      ignoring = false;
      return;
    }
    const at = raw.indexOf(TAG);
    if (ignoring || at === -1) return;
    const expression = withoutCommentCloser(raw.slice(at + TAG.length).trim());
    if (!VALID_EXPRESSION.test(expression)) found.push({ line: index + 1, expression });
  });
  return found;
}

// Stryker disable all: `listFiles` shells out to `git ls-files` and `main`
// reads every tracked file from disk — both can only be exercised by
// running the gate for real. The logic they delegate to, `hasSpdxHeader`,
// IS mutation-tested.
/** @returns {string[]} */
function listFiles() {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { windowsHide: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split(NUL).filter(Boolean);
}

function main() {
  const tracked = listFiles();
  const files = tracked.filter((f) => SOURCE_EXT.test(f));
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const invalid = [];

  for (const file of tracked) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (text.includes(NUL)) continue; // binary
    if (SOURCE_EXT.test(file) && !hasSpdxHeader(text)) missing.push(file);
    for (const tag of invalidSpdxTags(text)) {
      invalid.push(`${file}:${tag.line}  "${tag.expression}"`);
    }
  }

  if (invalid.length > 0) {
    console.error(
      `spdx-headers FAILED: ${invalid.length} licence tag(s) reuse lint would reject — wrap SPDX text that is data in REUSE-IgnoreStart / REUSE-IgnoreEnd:`,
    );
    for (const i of invalid) console.error(`  ${i}`);
    process.exit(1);
  }

  if (missing.length > 0) {
    console.error(`spdx-headers FAILED: ${missing.length} source file(s) missing an SPDX header:`);
    for (const m of missing) console.error(`  ${m}`);
    // REUSE-IgnoreStart
    // (the two example lines below are printed CLI guidance, not a real header;
    // the markers stop `reuse lint` from misparsing them as this file's own tags)
    console.error('\nAdd:  // SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND');
    console.error('      // SPDX-License-Identifier: Apache-2.0');
    // REUSE-IgnoreEnd
    process.exit(1);
  }

  console.log(`spdx-headers OK: ${files.length} source file(s) carry SPDX headers`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
