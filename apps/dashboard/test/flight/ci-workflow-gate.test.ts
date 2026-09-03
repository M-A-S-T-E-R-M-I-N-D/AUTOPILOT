// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * CI-workflow drift guard (PLATFORM 2/7 close-out, epic 0007): CI verify on
 * PRs is the PREREQUISITE for autonomous merge, so the workflow must keep
 * running the FULL gate — typecheck / lint / format:check / build /
 * test:coverage — plus EVERY `ci:*` scan declared in package.json, with the
 * mutation sweep staying nightly (the epic's cost constraint). The ci:* leg
 * is dynamic: adding a new ci:* script without wiring it into ci.yml fails
 * here, on the machine that added it, instead of silently never running in CI.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

const CI_WORKFLOW = readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
const MUTATION_WORKFLOW = readFileSync(join(REPO_ROOT, '.github/workflows/mutation.yml'), 'utf8');
const README = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');

/** Same discovery rule as scripts/ci/run-all-mutation.mjs, reimplemented (not
 *  imported — that script runs `process.exit` at module scope) so this stays
 *  a plain file-read assertion like the rest of this file. */
function discoveredMutationConfigCount(): number {
  return readdirSync(join(REPO_ROOT, 'config', 'mutation')).filter(
    (f) => f.startsWith('stryker.') && f.endsWith('.config.mjs'),
  ).length;
}

/** The per-PR gate the epic calls non-negotiable (mutation is nightly, listed below). */
const GATE_SCRIPTS = ['typecheck', 'lint', 'format:check', 'build', 'test:coverage'];

function ciScanScripts(): string[] {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  return Object.keys(pkg.scripts ?? {}).filter((name) => name.startsWith('ci:'));
}

describe('ci.yml runs the full gate on every PR', () => {
  it('triggers on pull_request and push to main', () => {
    expect(CI_WORKFLOW).toMatch(/pull_request:/);
    expect(CI_WORKFLOW).toMatch(/push:/);
  });

  it.each(GATE_SCRIPTS.map((s) => [s]))('runs `pnpm run %s`', (script) => {
    expect(CI_WORKFLOW).toContain(`pnpm run ${script}`);
  });

  it('finds a non-trivial ci:* scan set in package.json', () => {
    expect(ciScanScripts().length).toBeGreaterThanOrEqual(5);
  });

  it.each(ciScanScripts().map((s) => [s]))('runs the `%s` scan', (script) => {
    expect(CI_WORKFLOW).toContain(`pnpm run ${script}`);
  });
});

describe('mutation.yml keeps the Stryker sweep nightly, off the PR path', () => {
  it('runs on a schedule, not on pull_request', () => {
    expect(MUTATION_WORKFLOW).toMatch(/schedule:/);
    expect(MUTATION_WORKFLOW).toMatch(/cron:/);
    expect(MUTATION_WORKFLOW).not.toMatch(/pull_request:/);
  });

  it('runs the full mutation sweep', () => {
    expect(MUTATION_WORKFLOW).toContain('pnpm run mutation');
  });
});

describe("README's Quickstart mutation-run count stays accurate", () => {
  // This exact drift already happened once (74 -> 100, commit d31cd81) with
  // nothing catching it — the count only ever grows as modules get widened,
  // so a plain equality check would just need updating here alongside the
  // README each time a new config lands, same discipline the ci:* scan loop
  // above already enforces for package.json.
  it('matches the number of Stryker configs run-all-mutation.mjs actually discovers', () => {
    const count = discoveredMutationConfigCount();
    expect(count).toBeGreaterThan(0);
    expect(README).toContain(`${count} Stryker mutation-testing runs`);
  });
});
