// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Records what the landing code was BUILT FROM.
 *
 *   node scripts/build/stamp-landing-code.mjs [<apps/dashboard root>]
 *
 * Runs right after `tsc -b` (see the root `build` script) and writes
 * `dist/landing/freshness-stamp.json`: a sha256 of every source module in
 * `LANDING_CODE_MODULES` (`apps/dashboard/src/landing/freshness.ts`). The
 * landing ritual's freshness note compares the SOURCE IN THE TREE against
 * this stamp, so it fires only when the content actually differs from the
 * build the server runs — not when a checkout merely bumped a file's mtime.
 * The first self-landing after the note shipped (cfec0974, 2026-09-18)
 * reported all three modules stale on mtimes alone: the merge had rewritten
 * byte-identical files. A missing stamp is not an error — the note falls
 * back to the mtime heuristic and says nothing new.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = process.argv[2] ?? fileURLToPath(new URL('../../apps/dashboard/', import.meta.url));

const { LANDING_CODE_MODULES, LANDING_STAMP_FILE } = await import(
  pathToFileURL(join(root, 'dist', 'landing', 'freshness.js')).href
);

const stamp = {};
for (const module of LANDING_CODE_MODULES) {
  // Raw bytes, exactly as fileHashOf() in freshness.ts hashes them.
  const source = readFileSync(join(root, 'src', `${module}.ts`));
  stamp[module] = createHash('sha256').update(source).digest('hex');
}

const out = join(root, LANDING_STAMP_FILE);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(stamp, null, 2)}\n`);
process.stdout.write(
  `stamp-landing-code: ${Object.keys(stamp).length} module(s) -> ${LANDING_STAMP_FILE}\n`,
);
