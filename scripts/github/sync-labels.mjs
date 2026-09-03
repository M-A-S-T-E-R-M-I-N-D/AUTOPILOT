// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * sync-labels — applies `.github/labels.json` (validated against
 * `tasks.dimension` by `ci:validate-configs`) to the LIVE repo via `gh label
 * create --force`. Deliberately NOT wired into the CI gate: every other
 * `ci:*` script only reads the tracked tree, but this one mutates GitHub's
 * remote label list, so it stays an explicit, operator-run command
 * (`pnpm run gh:sync-labels`) instead of something that fires on every push.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** @typedef {{ name: string, color: string, description: string }} LabelDef */

/** @returns {LabelDef[]} */
function loadLabels() {
  const raw = readFileSync('.github/labels.json', 'utf8');
  return /** @type {LabelDef[]} */ (JSON.parse(raw));
}

/** @param {LabelDef} label */
function applyLabel(label) {
  execFileSync(
    'gh',
    [
      'label',
      'create',
      label.name,
      '--color',
      label.color,
      '--description',
      label.description,
      '--force',
    ],
    { stdio: 'inherit' },
  );
}

function main() {
  const labels = loadLabels();
  for (const label of labels) {
    applyLabel(label);
    console.log(`synced: ${label.name}`);
  }
  console.log(`gh:sync-labels OK: ${labels.length} label(s) applied to the live repo`);
}

main();
