// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression coverage for ap-musv31hq-0: `pnpm run lint` walks every file on
 * disk regardless of git tracking status. A firing's own untracked scratch
 * output under .tmp-autopilot/ (git-ignored, but not eslint-ignored before
 * this fix) could carry lint errors and fail the gate on a commit that
 * never touched it — exactly what happened to c33c392c, reverted by
 * 5d524950 for a gate failure caused by an unrelated .tmp-autopilot scratch
 * file.
 *
 * eslint.config.js's own `ignores` list is protected by a config-protection
 * hook that blocks every edit to that file unconditionally (including this
 * firing's attempt — see the commit body), so the fix instead threads
 * `--ignore-pattern` through the root `lint`/`lint:fix` scripts in
 * package.json, which translate-cli-options.js maps onto the ESLint Node
 * API's `ignorePatterns` constructor option. This test parses the real
 * `lint` script and constructs an ESLint instance the same way, so it
 * fails if a future edit changes the script and silently drops the
 * protection.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

function ignorePatternsFromLintScript(): string[] {
  const pkg: { scripts?: Record<string, string> } = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../../../package.json', import.meta.url)), 'utf8'),
  );
  const lintScript = pkg.scripts?.['lint'] ?? '';
  const patterns: string[] = [];
  const pattern = /--ignore-pattern\s+"([^"]+)"/g;
  let match = pattern.exec(lintScript);
  while (match !== null) {
    const [, capturedPattern] = match;
    if (capturedPattern !== undefined) {
      patterns.push(capturedPattern);
    }
    match = pattern.exec(lintScript);
  }
  return patterns;
}

describe('the root lint script ignores firing scratch output', () => {
  it('threads --ignore-pattern for .tmp-autopilot/** through to ESLint', () => {
    expect(ignorePatternsFromLintScript()).toContain('.tmp-autopilot/**');
  });

  it('ignores a file under .tmp-autopilot/', async () => {
    const eslint = new ESLint({ cwd: REPO_ROOT, ignorePatterns: ignorePatternsFromLintScript() });

    const ignored = await eslint.isPathIgnored(
      fileURLToPath(new URL('../../../../.tmp-autopilot/sweep.mjs', import.meta.url)),
    );

    expect(ignored).toBe(true);
  });

  it('ignores a nested file under .tmp-autopilot/', async () => {
    const eslint = new ESLint({ cwd: REPO_ROOT, ignorePatterns: ignorePatternsFromLintScript() });

    const ignored = await eslint.isPathIgnored(
      fileURLToPath(new URL('../../../../.tmp-autopilot/nested/probe.ts', import.meta.url)),
    );

    expect(ignored).toBe(true);
  });
});
