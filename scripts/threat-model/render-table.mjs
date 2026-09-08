// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * threat-model/render-table — the pure half of the TOOLGRANT:TABLE generator:
 * turns a tool grant into the marker-wrapped markdown block, splices that block
 * into a document, and normalizes the generated timestamp for comparison.
 *
 * It is deliberately dependency-free — no `node:fs`, no `packages/*\/dist`, no
 * I/O of any kind — so `apps/dashboard/test/tooling/generate-table.test.ts` can
 * import it on a tree that has never been built. Its `generate-table.mjs`
 * caller is what reads the real grant out of `packages/engine/dist` and touches
 * the filesystem; that half stays out of the test's import graph because
 * `pnpm verify` runs `test:coverage` BEFORE `build`, so a build artifact simply
 * is not there yet when the tests run. Same split, and same reason, as
 * `scripts/self-study/history-guard.mjs` beside its `generate-data.mjs`.
 *
 * Keep it that way: adding an import of built output here would turn a fresh
 * clone's `pnpm verify` red at the test step.
 */

export const MARKER_START = '<!-- TOOLGRANT:TABLE:START -->';
export const MARKER_END = '<!-- TOOLGRANT:TABLE:END -->';

/**
 * Renders the marker-wrapped TOOLGRANT:TABLE block for one tool grant.
 *
 * @param {{ allowed: readonly string[], disallowed: readonly string[] }} grant
 *   The allowed/disallowed tool lists to tabulate — supplied by the caller so
 *   this module never has to reach for the built constants itself.
 */
export function renderTable(grant) {
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
  for (const tool of grant.allowed) lines.push(`| ${tool} | ✅ allowed |`);
  for (const tool of grant.disallowed) lines.push(`| ${tool} | ⛔ disallowed |`);
  lines.push(MARKER_END);
  return lines.join('\n');
}

/**
 * Splices `block` between the TOOLGRANT markers in `source`.
 *
 * @param {string} source Document text to splice into.
 * @param {string} block Replacement block, markers included.
 * @param {string} [docPath] Where `source` came from — quoted in the failure so
 *   a missing marker names the file the operator has to go fix.
 */
export function replaceBlock(source, block, docPath = 'the target document') {
  const start = source.indexOf(MARKER_START);
  const end = source.indexOf(MARKER_END);
  if (start === -1 || end === -1) {
    throw new Error(
      `generate-table: markers not found in ${docPath} — expected ${MARKER_START} / ${MARKER_END}`,
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
