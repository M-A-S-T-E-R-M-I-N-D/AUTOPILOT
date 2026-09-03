// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * setup-branch-protection — applies `.github/branch-protection.json` (epic
 * 0007 slice 1's "canonical lock": main writable by MASTERMIND only) to the
 * LIVE repo via `gh api`. Same shape as gh:sync-labels: deliberately NOT
 * wired into the CI gate — this mutates GitHub's remote branch-protection
 * settings, a security-sensitive one-writer lock, so it stays an explicit,
 * operator-run command (`pnpm run gh:setup-branch-protection`) executed with
 * the operator's own authenticated `gh` CLI rather than an automatic token.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** @returns {Record<string, unknown>} */
function loadConfig() {
  const raw = readFileSync('.github/branch-protection.json', 'utf8');
  return /** @type {Record<string, unknown>} */ (JSON.parse(raw));
}

function main() {
  const { branch, ...protection } = loadConfig();
  if (typeof branch !== 'string' || branch === '') {
    throw new Error('.github/branch-protection.json: missing "branch"');
  }
  execFileSync(
    'gh',
    [
      'api',
      '--method',
      'PUT',
      `repos/{owner}/{repo}/branches/${branch}/protection`,
      '--input',
      '-',
    ],
    { input: JSON.stringify(protection), stdio: ['pipe', 'inherit', 'inherit'] },
  );
  console.log(
    `gh:setup-branch-protection OK: "${branch}" locked per .github/branch-protection.json`,
  );
}

main();
