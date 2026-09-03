// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression guard for the silent-gate incident (EVALUATION 2026-08-27).
 *
 * The flight gate runs AFTER the firing's own `git commit` (`firing.ts`,
 * `if (headAdvanced) gate.run()`), so by gate time the working tree is clean.
 * `test:impacted` was `vitest run --changed`, and a bare `--changed` diffs the
 * *uncommitted* tree — which is empty at exactly that moment. Vitest then
 * force-enables `passWithNoTests` for `--changed` runs, so the step exited 0
 * in ~1.5s having executed zero tests, and the gate recorded `passed`.
 *
 * 15 of 19 firings shipped through that no-op step. These two invariants are
 * what keep the "test" leg of the gate from silently testing nothing:
 *
 *  1. the impacted command diffs against a git REF (the commit just made),
 *     not the bare working tree, and
 *  2. the full command stays UNSCOPED, so the every-Nth-firing full run
 *     (`FULL_TEST_EVERY_N_FIRINGS`) remains a real whole-suite backstop.
 *
 * Note on `passWithNoTests`: forcing it false was considered and rejected. Once
 * the impacted command is ref-scoped, an empty scope no longer means "the tree
 * was clean" — it means the commit genuinely touched no testable code (a
 * docs-only commit, which is a legitimate green). Forcing it false would turn
 * every docs commit red. Invariant 1 is what actually closes the hole.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = new URL('../../../../', import.meta.url);

const readRepoFile = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, REPO_ROOT)), 'utf8');

describe('the flight gate actually runs tests', () => {
  it('scopes test:impacted to a git ref, so it diffs the commit the gate is judging', () => {
    const scripts = JSON.parse(readRepoFile('package.json')).scripts as Record<string, string>;
    const impacted = scripts['test:impacted'];
    if (impacted === undefined) {
      throw new Error('test:impacted must exist — the gate schedules around it');
    }
    expect(impacted).toContain('--changed');

    // The whole bug: `--changed` with no ref means "uncommitted changes", and
    // the gate runs on a clean tree. A ref argument must follow it.
    const ref = impacted.slice(impacted.indexOf('--changed') + '--changed'.length).trim();
    expect(
      ref,
      '`--changed` with no ref diffs the (clean, post-commit) working tree and silently runs zero tests',
    ).not.toBe('');
  });

  it('keeps the full test command unscoped, so the scheduled full run is a real backstop', () => {
    const scripts = JSON.parse(readRepoFile('package.json')).scripts as Record<string, string>;

    expect(
      scripts['test'],
      'the full `test` command must run the whole suite — diff-scoping it would erase the ' +
        'every-Nth-firing backstop that catches what the changed-file graph misses',
    ).not.toContain('--changed');
  });
});
