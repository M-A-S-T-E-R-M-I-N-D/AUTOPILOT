// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { EcosystemDetector, MutableGateCommands } from '../types.js';
import {
  safeJsonParse,
  packageScripts,
  scriptCommand,
  execCommand,
  type PackageManager,
} from '../manifests.js';
import type { FsSnapshot } from '../snapshot.js';

function packageManager(snap: FsSnapshot): PackageManager {
  if (snap.has('pnpm-lock.yaml')) return 'pnpm';
  if (snap.has('yarn.lock')) return 'yarn';
  return 'npm';
}

const JS_SUFFIXES = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'] as const;

/**
 * True when an impacted-test script scopes its run to the WORKING TREE rather
 * than to a git ref — `vitest run --changed` with no ref after it.
 *
 * This is the silent-gate trap (EVALUATION 2026-08-27). The flight gate runs
 * *after* the firing commits, so the working tree is clean by then; a bare
 * `--changed` therefore resolves zero test files, and Vitest force-enables
 * `passWithNoTests` for `--changed` runs, so the step exits 0 in ~1.5s having
 * executed nothing. In this repo that shipped 15 of 19 firings through a test
 * leg that never ran. `--changed HEAD~1` (or any ref) is the correct form.
 */
export function isWorkingTreeScopedTestCommand(script: string): boolean {
  const tokens = script.trim().split(/\s+/);
  const i = tokens.indexOf('--changed');
  if (i === -1) return false;
  const ref = tokens[i + 1];
  // No following token, or the next token is another flag → no ref was given.
  return ref === undefined || ref.startsWith('-');
}

/**
 * JS/TS gate detector. Prefers explicit package.json scripts (the source of
 * truth a repo already trusts); falls back to config-file presence for the tools.
 */
export const jsDetector: EcosystemDetector = {
  id: 'js',
  detect(snap) {
    const pkgText = snap.read('package.json');
    if (pkgText === null && !snap.hasSuffix(...JS_SUFFIXES)) return null;

    const pm = packageManager(snap);
    const scripts = packageScripts(safeJsonParse(pkgText));
    const evidence: string[] = [];
    if (pkgText !== null) evidence.push('package.json');
    evidence.push(`pm:${pm}`);

    const gate: MutableGateCommands = {};

    if (scripts['typecheck']) {
      gate.typecheck = scriptCommand(pm, 'typecheck');
      evidence.push('scripts.typecheck');
    } else if (snap.hasGlob('tsconfig*.json')) {
      gate.typecheck = execCommand(pm, 'tsc', ['--noEmit']);
      evidence.push('tsconfig');
    }

    if (scripts['test']) {
      gate.test = scriptCommand(pm, 'test');
      evidence.push('scripts.test');
    } else if (snap.hasGlob('vitest.config.*') || snap.hasGlob('vitest.workspace.*')) {
      gate.test = execCommand(pm, 'vitest', ['run']);
      evidence.push('vitest.config');
    } else if (snap.hasGlob('jest.config.*')) {
      gate.test = execCommand(pm, 'jest', []);
      evidence.push('jest.config');
    }

    // Adopt an impacted-test fast path only when it scopes to a git ref. A
    // working-tree-scoped one silently tests nothing at gate time, so leaving
    // `testImpacted` unset is the fail-safe: the scheduler falls back to the
    // full `test` command — slower, but it actually runs.
    const impacted = scripts['test:impacted'];
    if (impacted && !isWorkingTreeScopedTestCommand(impacted)) {
      gate.testImpacted = scriptCommand(pm, 'test:impacted');
      evidence.push('scripts.test:impacted');
    }

    if (scripts['build']) {
      gate.build = scriptCommand(pm, 'build');
      evidence.push('scripts.build');
    }

    if (scripts['lint']) {
      gate.lint = scriptCommand(pm, 'lint');
      evidence.push('scripts.lint');
    } else if (snap.hasGlob('eslint.config.*') || snap.hasGlob('.eslintrc*')) {
      gate.lint = execCommand(pm, 'eslint', ['.']);
      evidence.push('eslint.config');
    }

    if (scripts['format:check']) {
      gate.format = scriptCommand(pm, 'format:check');
      evidence.push('scripts.format:check');
    }

    const detected = Object.keys(gate).length;
    const score = detected + (pkgText !== null ? 1 : 0);
    return { gate, score, evidence };
  },
};
