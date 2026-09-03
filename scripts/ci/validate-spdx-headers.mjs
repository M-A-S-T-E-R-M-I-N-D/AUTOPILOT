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

const NUL = String.fromCharCode(0);
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const HEADER_SCAN_LINES = 20;

/** @returns {string[]} */
function listFiles() {
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
  const files = listFiles().filter((f) => SOURCE_EXT.test(f));
  /** @type {string[]} */
  const missing = [];

  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const head = text.split('\n').slice(0, HEADER_SCAN_LINES).join('\n');
    if (!head.includes('SPDX-License-Identifier')) missing.push(file);
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

main();
