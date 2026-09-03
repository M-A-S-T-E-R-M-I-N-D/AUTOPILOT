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
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ALLOWED_TOOLS,
  DEFAULT_DISALLOWED_TOOLS,
} from '../../packages/engine/dist/index.js';

const DOC_PATH = join(process.cwd(), 'docs', 'THREAT-MODEL.md');
const MARKER_START = '<!-- TOOLGRANT:TABLE:START -->';
const MARKER_END = '<!-- TOOLGRANT:TABLE:END -->';

export function renderTable() {
  const generatedAt = new Date().toISOString();
  const lines = [
    MARKER_START,
    `_Generated ${generatedAt} by \`pnpm threat-model:update\` from` +
      ' `packages/engine/src/config.ts` `DEFAULT_ALLOWED_TOOLS` /' +
      " `DEFAULT_DISALLOWED_TOOLS` — the source the flying agent's CLI invocation" +
      ' actually builds its `--allowedTools`/`--disallowedTools` args from._',
    '',
    '| Tool | Grant |',
    '|---|---|',
  ];
  for (const tool of DEFAULT_ALLOWED_TOOLS) lines.push(`| ${tool} | ✅ allowed |`);
  for (const tool of DEFAULT_DISALLOWED_TOOLS) lines.push(`| ${tool} | ⛔ disallowed |`);
  lines.push(MARKER_END);
  return lines.join('\n');
}

export function replaceBlock(source, block) {
  const start = source.indexOf(MARKER_START);
  const end = source.indexOf(MARKER_END);
  if (start === -1 || end === -1) {
    throw new Error(
      `generate-table: markers not found in ${DOC_PATH} — expected ${MARKER_START} / ${MARKER_END}`,
    );
  }
  return source.slice(0, start) + block + source.slice(end + MARKER_END.length);
}

/** The generated block embeds a `_Generated <timestamp>_` line, which always
 *  differs run to run — strip it before comparing so `--check` only fails on
 *  a REAL drift (a tool grant added/removed/reclassified), not on the
 *  clock. */
export function withoutTimestamp(text) {
  return text.replace(/^_Generated .+$/m, '_Generated_');
}

function main() {
  const check = process.argv.includes('--check');
  const source = readFileSync(DOC_PATH, 'utf8');
  const next = replaceBlock(source, renderTable());

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
      ` (${DEFAULT_ALLOWED_TOOLS.length} allowed, ${DEFAULT_DISALLOWED_TOOLS.length} disallowed).`,
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
