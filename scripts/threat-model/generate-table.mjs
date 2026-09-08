// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * threat-model/generate-table — regenerates the TOOLGRANT:TABLE block in
 * docs/THREAT-MODEL.md from `packages/engine/src/config.ts`'s
 * `DEFAULT_ALLOWED_TOOLS`/`DEFAULT_DISALLOWED_TOOLS` — the actual tool grant
 * the flying agent's CLI invocation builds (`adapters/claude-cli.ts`
 * `buildClaudeArgs`), not a hand-copied table that can drift from the code
 * that governs real behavior.
 *
 * `--check` computes the same block and fails without writing if it differs
 * from what's committed (the `ci:threat-model` gate, wired into `pnpm
 * verify`); with no flag it writes the refreshed block in place
 * (`pnpm threat-model:update`) — the same `--check`/no-flag split every
 * other marker-block generator here uses (`architecture:generate-diagram`,
 * `tokens:generate-contrast-matrix`).
 *
 * This file owns everything that needs the world to exist: the built engine
 * constants and the filesystem. The pure rendering lives next door in
 * `render-table.mjs`, which is what the unit test imports — `pnpm verify` runs
 * `test:coverage` before `build`, so anything reachable from a test may not
 * import `packages/*\/dist`. Both gates still cover the real constants: this
 * script renders them under `ci:threat-model`, which runs after the build.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ALLOWED_TOOLS,
  DEFAULT_DISALLOWED_TOOLS,
} from '../../packages/engine/dist/index.js';
import { renderTable, replaceBlock, withoutTimestamp } from './render-table.mjs';

const DOC_PATH = join(process.cwd(), 'docs', 'THREAT-MODEL.md');

/** The grant the flying agent actually launches with, straight from the built
 *  engine — the single source this table is allowed to reflect. */
const GRANT = { allowed: DEFAULT_ALLOWED_TOOLS, disallowed: DEFAULT_DISALLOWED_TOOLS };

function main() {
  const check = process.argv.includes('--check');
  const source = readFileSync(DOC_PATH, 'utf8');
  const next = replaceBlock(source, renderTable(GRANT), DOC_PATH);

  if (check) {
    if (withoutTimestamp(next) !== withoutTimestamp(source)) {
      console.error(
        "threat-model-check FAILED: docs/THREAT-MODEL.md's TOOLGRANT:TABLE is stale — run" +
          ' `pnpm threat-model:update` and commit the result.',
      );
      process.exit(1);
    }
    console.log(
      "threat-model-check OK: docs/THREAT-MODEL.md's TOOLGRANT:TABLE matches" +
        ' DEFAULT_ALLOWED_TOOLS/DEFAULT_DISALLOWED_TOOLS.',
    );
    return;
  }

  writeFileSync(DOC_PATH, next);
  console.log(
    `generate-table: TOOLGRANT:TABLE refreshed in ${DOC_PATH}` +
      ` (${GRANT.allowed.length} allowed, ${GRANT.disallowed.length} disallowed).`,
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(`generate-table FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
