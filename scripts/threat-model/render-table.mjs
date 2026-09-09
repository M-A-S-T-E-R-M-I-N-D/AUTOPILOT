// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * threat-model/render-table — the pure half of the TOOLGRANT:TABLE generator:
 * turns each agent's tool grant into the marker-wrapped markdown block, splices
 * that block into a document, and normalizes the generated timestamp for
 * comparison.
 *
 * It is deliberately dependency-free — no `node:fs`, no built package output,
 * no I/O of any kind — so `apps/dashboard/test/tooling/generate-table.test.ts`
 * can import it on a tree that has never been built. Its `generate-table.mjs`
 * caller is what reads the real grants out of the built engine and touches the
 * filesystem; that half stays out of the test's import graph because
 * `pnpm verify` runs `test:coverage` BEFORE `build`. Same split, same reason,
 * as `scripts/self-study/history-guard.mjs` beside its `generate-data.mjs`;
 * `apps/dashboard/test/tooling/tests-need-no-build.test.ts` is the gate that
 * keeps it true.
 */

export const MARKER_START = '<!-- TOOLGRANT:TABLE:START -->';
export const MARKER_END = '<!-- TOOLGRANT:TABLE:END -->';

/**
 * The table rows for one agent.
 *
 * Two shapes need special handling, and both for the same reason: an agent
 * that renders ZERO rows reads as "not covered" rather than "denied
 * everything", which is the opposite of the truth in a threat model.
 *
 *  - A `'*'` in `disallowed` is a WILDCARD, not a tool named `*`. Looping over
 *    it would put a literal `| * |` row into a document meant to be read at
 *    face value, so the whole grant collapses to one honest row instead.
 *  - An agent with nothing on either list would otherwise vanish outright.
 *
 * Checked by shape rather than by matching one exact literal grant: the narrow
 * form (`allowed: []` + `disallowed: ['*']`) is the only one in the tree today,
 * but the next agent to deny everything may well encode it differently, and
 * this table going quietly wrong is precisely the failure being guarded.
 *
 * @param {{ name: string, allowed: readonly string[], disallowed: readonly string[],
 *   source: string }} agent
 * @returns {string[]}
 */
function agentRows(agent) {
  if (agent.disallowed.includes('*')) {
    const except = agent.allowed.length > 0 ? ` (except ${agent.allowed.join(', ')})` : '';
    return [
      `| ${agent.name} | _(none)_ | ⛔ all tools denied (tool-less)${except} | ${agent.source} |`,
    ];
  }

  const rows = [
    ...agent.allowed.map((tool) => `| ${agent.name} | ${tool} | ✅ allowed | ${agent.source} |`),
    ...agent.disallowed.map(
      (tool) => `| ${agent.name} | ${tool} | ⛔ disallowed | ${agent.source} |`,
    ),
  ];
  if (rows.length > 0) return rows;

  return [`| ${agent.name} | _(none)_ | ⛔ no tools granted | ${agent.source} |`];
}

/**
 * Renders the marker-wrapped TOOLGRANT:TABLE block for a list of agents.
 *
 * @param {ReadonlyArray<{
 *   name: string,
 *   allowed: readonly string[],
 *   disallowed: readonly string[],
 *   source: string,
 * }>} agents Each agent's grant plus the citation for where the constant that
 *   governs it lives — supplied by the caller so this module never has to reach
 *   for the built constants itself. Rendered in the order given.
 */
export function renderTable(agents) {
  const generatedAt = new Date().toISOString();
  const lines = [
    MARKER_START,
    `_Generated ${generatedAt} by \`pnpm threat-model:update\` from each agent's` +
      ' own exported tool-grant constant (cited per row) — the source that' +
      " agent's CLI invocation actually builds its `--allowedTools`/" +
      '`--disallowedTools` args from._',
    '',
    '| Agent | Tool | Grant | Source |',
    '|---|---|---|---|',
  ];
  for (const agent of agents) lines.push(...agentRows(agent));
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
