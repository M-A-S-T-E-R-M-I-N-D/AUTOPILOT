// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * architecture/generate-diagram — regenerates the CONTAINER:DIAGRAM block in
 * docs/ARCHITECTURE.md from the real workspace package graph: every
 * package.json under packages/ or apps/ — name, description, and
 * `@autopilot/*` dependencies (the same workspace-walking approach
 * `ci:npx-smoke-test` uses) — not a hand-drawn diagram that can silently
 * drift from what actually depends on what.
 *
 * `--check` computes the same block and fails without writing if it differs
 * from what's committed (the `ci:architecture` gate, wired into `pnpm
 * verify`); with no flag it writes the refreshed block in place
 * (`pnpm architecture:update`).
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const DOC_PATH = join(repoRoot, 'docs', 'ARCHITECTURE.md');
const WORKSPACE_GLOBS = ['packages', 'apps'];
const MARKER_START = '<!-- CONTAINER:DIAGRAM:START -->';
const MARKER_END = '<!-- CONTAINER:DIAGRAM:END -->';

/** @typedef {{ name: string, group: string, dir: string, description: string, deps: string[] }} PackageNode */

/** @returns {PackageNode[]} sorted by group then name, so the generated block is diff-stable. */
function discoverPackages() {
  /** @type {PackageNode[]} */
  const nodes = [];
  for (const group of WORKSPACE_GLOBS) {
    const groupDir = join(repoRoot, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir)) {
      const pkgJsonPath = join(groupDir, entry, 'package.json');
      if (!existsSync(pkgJsonPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
      const deps = Object.keys(pkg.dependencies ?? {}).filter((d) => d.startsWith('@autopilot/'));
      nodes.push({
        name: pkg.name,
        group,
        dir: `${group}/${entry}`,
        description: pkg.description ?? '',
        deps: deps.sort(),
      });
    }
  }
  return nodes.sort((a, b) =>
    a.group === b.group ? a.name.localeCompare(b.name) : a.group.localeCompare(b.group),
  );
}

/** Mermaid node ids can't contain `@`, `/`, `-` — drop the scope and sanitize. */
function nodeId(name) {
  return name.replace('@autopilot/', '').replace(/[^a-zA-Z0-9]/g, '_');
}

function escapeLabel(text) {
  return text.replace(/"/g, '#quot;');
}

/** @param {PackageNode[]} nodes */
function renderMermaid(nodes) {
  const lines = ['```mermaid', 'flowchart TD'];
  for (const group of WORKSPACE_GLOBS) {
    const inGroup = nodes.filter((n) => n.group === group);
    if (inGroup.length === 0) continue;
    lines.push(`  subgraph ${group}["${group}/"]`);
    for (const n of inGroup) {
      const short = n.name.replace('@autopilot/', '');
      lines.push(`    ${nodeId(n.name)}["**${short}**<br/>${escapeLabel(n.description)}"]`);
    }
    lines.push('  end');
  }
  for (const n of nodes) {
    for (const dep of n.deps) {
      lines.push(`  ${nodeId(n.name)} --> ${nodeId(dep)}`);
    }
  }
  lines.push('```');
  return lines.join('\n');
}

/** @param {PackageNode[]} nodes */
function renderTable(nodes) {
  const lines = ['| Package | Path | Responsibility |', '|---|---|---|'];
  for (const n of nodes) {
    lines.push(`| \`${n.name}\` | \`${n.dir}\` | ${n.description} |`);
  }
  return lines.join('\n');
}

/** @param {PackageNode[]} nodes */
function renderBlock(nodes) {
  const generatedAt = new Date().toISOString();
  return [
    MARKER_START,
    `_Generated ${generatedAt} by \`pnpm architecture:update\` from every` +
      ' `packages/*/package.json` / `apps/*/package.json` — name, description, and' +
      ' `@autopilot/*` dependencies — not a hand-drawn diagram that can drift from' +
      ' what actually depends on what._',
    '',
    renderMermaid(nodes),
    '',
    renderTable(nodes),
    MARKER_END,
  ].join('\n');
}

function replaceBlock(source, block) {
  const start = source.indexOf(MARKER_START);
  const end = source.indexOf(MARKER_END);
  if (start === -1 || end === -1) {
    throw new Error(
      `generate-diagram: markers not found in ${DOC_PATH} — expected ${MARKER_START} / ${MARKER_END}`,
    );
  }
  return source.slice(0, start) + block + source.slice(end + MARKER_END.length);
}

/** The generated block embeds a `_Generated <timestamp>_` line, which always
 *  differs run to run — strip it before comparing so `--check` only fails on
 *  a REAL drift (a package added/removed/redescribed/redependent), not on
 *  the clock. */
function withoutTimestamp(text) {
  return text.replace(/^_Generated .+$/m, '_Generated_');
}

function main() {
  const check = process.argv.includes('--check');
  const nodes = discoverPackages();
  const block = renderBlock(nodes);
  const source = readFileSync(DOC_PATH, 'utf8');
  const next = replaceBlock(source, block);

  if (check) {
    if (withoutTimestamp(next) !== withoutTimestamp(source)) {
      console.error(
        "architecture-check FAILED: docs/ARCHITECTURE.md's container diagram is stale — " +
          'run `pnpm architecture:update` and commit the result.',
      );
      process.exit(1);
    }
    console.log('architecture-check OK: docs/ARCHITECTURE.md matches the real package graph.');
    return;
  }

  writeFileSync(DOC_PATH, next);
  console.log(
    `generate-diagram: CONTAINER:DIAGRAM refreshed in ${DOC_PATH} (${nodes.length} packages).`,
  );
}

try {
  main();
} catch (err) {
  console.error(`generate-diagram FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
