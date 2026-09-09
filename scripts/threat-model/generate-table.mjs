// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * threat-model/generate-table — regenerates the TOOLGRANT:TABLE block in
 * docs/THREAT-MODEL.md from the actual exported tool-grant constants each
 * agent's CLI invocation is built from, never a hand-copied table that can
 * drift from the code governing real behavior.
 *
 * Covers every agent whose grant is a named, exported constant today. An agent
 * whose grant is still an inline literal at its call site is NOT in this list:
 * extract that literal into an exported constant first — the same move
 * `TOOL_LESS_ALLOWED_TOOLS`/`TOOL_LESS_DISALLOWED_TOOLS` made for post-flight
 * triage and "Ask your project" — then add the row here. Extraction is the
 * point, not bookkeeping: a literal at a call site cannot be rendered from its
 * own source, so it can drift from this table forever without anything noticing.
 *
 * `--check` computes the same block and fails without writing if it differs
 * from what's committed (the `ci:threat-model` gate, wired into `pnpm
 * verify`); with no flag it writes the refreshed block in place
 * (`pnpm threat-model:update`) — the same `--check`/no-flag split every
 * other marker-block generator here uses (`architecture:generate-diagram`,
 * `tokens:generate-contrast-matrix`).
 *
 * This file owns everything needing the world to exist: the built engine
 * constants and the filesystem. The pure rendering lives next door in
 * `render-table.mjs`, which is what the unit test imports — `pnpm verify` runs
 * `test:coverage` before `build`, so anything reachable from a test may not
 * import built output. Both halves stay covered: this script renders the real
 * constants under `ci:threat-model`, which runs after the build.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ALLOWED_TOOLS,
  DEFAULT_DISALLOWED_TOOLS,
  TOOL_LESS_ALLOWED_TOOLS,
  TOOL_LESS_DISALLOWED_TOOLS,
  ASK_ESCALATION_ALLOWED_TOOLS,
  ASK_ESCALATION_DISALLOWED_TOOLS,
} from '../../packages/engine/dist/index.js';
import { renderTable, replaceBlock, withoutTimestamp } from './render-table.mjs';

const DOC_PATH = join(process.cwd(), 'docs', 'THREAT-MODEL.md');

const TOOL_LESS_SOURCE = '`config.ts` `TOOL_LESS_ALLOWED_TOOLS`/`TOOL_LESS_DISALLOWED_TOOLS`';

/** One row per agent whose tool grant is a named exported constant — the source
 *  each agent's real CLI invocation reads its `--allowedTools`/
 *  `--disallowedTools` args from. `source` cites where to look the constant up
 *  when a row needs explaining. */
const AGENTS = [
  {
    name: 'Main flying agent',
    allowed: DEFAULT_ALLOWED_TOOLS,
    disallowed: DEFAULT_DISALLOWED_TOOLS,
    source: '`config.ts` `DEFAULT_ALLOWED_TOOLS`/`DEFAULT_DISALLOWED_TOOLS`',
  },
  {
    name: 'Post-flight triage',
    allowed: TOOL_LESS_ALLOWED_TOOLS,
    disallowed: TOOL_LESS_DISALLOWED_TOOLS,
    source: TOOL_LESS_SOURCE,
  },
  {
    name: '"Ask your project" (tier 1)',
    allowed: TOOL_LESS_ALLOWED_TOOLS,
    disallowed: TOOL_LESS_DISALLOWED_TOOLS,
    source: TOOL_LESS_SOURCE,
  },
  {
    name: '"Ask your project" (escalated, read-only agentic)',
    allowed: ASK_ESCALATION_ALLOWED_TOOLS,
    disallowed: ASK_ESCALATION_DISALLOWED_TOOLS,
    source: '`ask-escalation.ts` `ASK_ESCALATION_ALLOWED_TOOLS`/`ASK_ESCALATION_DISALLOWED_TOOLS`',
  },
];

function main() {
  const check = process.argv.includes('--check');
  const source = readFileSync(DOC_PATH, 'utf8');
  const next = replaceBlock(source, renderTable(AGENTS), DOC_PATH);

  if (check) {
    if (withoutTimestamp(next) !== withoutTimestamp(source)) {
      console.error(
        "threat-model-check FAILED: docs/THREAT-MODEL.md's TOOLGRANT:TABLE is stale — run" +
          ' `pnpm threat-model:update` and commit the result.',
      );
      process.exit(1);
    }
    console.log(
      "threat-model-check OK: docs/THREAT-MODEL.md's TOOLGRANT:TABLE matches every agent's" +
        ' exported tool-grant constants.',
    );
    return;
  }

  writeFileSync(DOC_PATH, next);
  console.log(
    `generate-table: TOOLGRANT:TABLE refreshed in ${DOC_PATH} (${AGENTS.length} agents).`,
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
