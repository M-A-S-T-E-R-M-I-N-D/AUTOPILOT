// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { isWorkingTreeScopedTestCommand, jsDetector } from '../../../src/gate/detectors/js.js';
import { makeFsSnapshot } from '../../../src/gate/snapshot.js';

function snap(files: readonly string[], contents: Record<string, string> = {}) {
  return makeFsSnapshot({ files, contents });
}

// EVALUATION 2026-08-27 (see js.ts): this predicate exists to stop a
// working-tree-scoped `--changed` from silently no-op'ing the gate's test
// leg. detect.test.ts only exercises it indirectly through scripts that
// always contain a `--changed` token, so the "no `--changed` token at all"
// branch (line `if (i === -1) return false`) has never actually run.
describe('isWorkingTreeScopedTestCommand', () => {
  it('returns false when the script has no --changed token at all', () => {
    expect(isWorkingTreeScopedTestCommand('vitest run --related')).toBe(false);
  });

  it('returns false when --changed is followed by a git ref', () => {
    expect(isWorkingTreeScopedTestCommand('vitest run --changed HEAD~1')).toBe(false);
    expect(isWorkingTreeScopedTestCommand('vitest run --changed main')).toBe(false);
  });

  it('returns true when --changed is the last token', () => {
    expect(isWorkingTreeScopedTestCommand('vitest run --changed')).toBe(true);
  });

  it('returns true when --changed is immediately followed by another flag', () => {
    expect(isWorkingTreeScopedTestCommand('vitest run --changed --silent')).toBe(true);
  });

  it('tolerates surrounding and repeated whitespace', () => {
    expect(isWorkingTreeScopedTestCommand('  vitest   run   --changed  ')).toBe(true);
    expect(isWorkingTreeScopedTestCommand('  vitest run --changed  HEAD~1  ')).toBe(false);
  });
});

// Direct unit coverage for jsDetector.detect (gate/detectors/js.ts). detect.test.ts
// only exercises it indirectly through detectGate's ecosystem-selection pipeline;
// these tests call jsDetector.detect directly against a bare FsSnapshot. js.ts is
// the last of the four detectors (go/rust/python already got this treatment) —
// higher-risk than its siblings because of the package-manager/script-command
// indirection layered on top of manifest evidence.
describe('jsDetector', () => {
  it('returns null when there is no package.json and no JS/TS-suffixed file', () => {
    expect(jsDetector.detect(snap(['README.md']))).toBeNull();
  });

  it('detects via a bare .ts file with no manifest, so no evidence beyond the package manager', () => {
    const d = jsDetector.detect(snap(['index.ts']));
    expect(d).not.toBeNull();
    expect(d?.evidence).toEqual(['pm:npm']);
    expect(d?.gate).toEqual({});
    expect(d?.score).toBe(0);
  });

  it('prefers pnpm when both pnpm-lock.yaml and yarn.lock are present', () => {
    const d = jsDetector.detect(
      snap(['package.json', 'pnpm-lock.yaml', 'yarn.lock'], {
        'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }),
      }),
    );
    expect(d?.gate.test).toEqual({ bin: 'pnpm', args: ['run', 'test'], label: 'pnpm run test' });
  });

  it('builds a yarn script command in yarn\'s own two-token form, not "yarn run"', () => {
    const d = jsDetector.detect(
      snap(['package.json', 'yarn.lock'], {
        'package.json': JSON.stringify({ scripts: { test: 'jest' } }),
      }),
    );
    expect(d?.gate.test).toEqual({ bin: 'yarn', args: ['test'], label: 'yarn test' });
  });

  it('falls back to npm when there is no lockfile at all', () => {
    const d = jsDetector.detect(snap(['package.json'], { 'package.json': '{}' }));
    expect(d?.evidence).toEqual(['package.json', 'pm:npm']);
  });

  it('prefers scripts.typecheck over tsconfig presence', () => {
    const d = jsDetector.detect(
      snap(['package.json', 'tsconfig.json'], {
        'package.json': JSON.stringify({ scripts: { typecheck: 'tsc --noEmit -p .' } }),
      }),
    );
    expect(d?.gate.typecheck).toEqual({
      bin: 'npm',
      args: ['run', 'typecheck'],
      label: 'npm run typecheck',
    });
    expect(d?.evidence).toContain('scripts.typecheck');
    expect(d?.evidence).not.toContain('tsconfig');
  });

  it('falls back to a direct tsc invocation via npx when only tsconfig.json is present', () => {
    const d = jsDetector.detect(snap(['package.json', 'tsconfig.json'], { 'package.json': '{}' }));
    expect(d?.gate.typecheck).toEqual({
      bin: 'npx',
      args: ['--no-install', 'tsc', '--noEmit'],
      label: 'tsc --noEmit',
    });
    expect(d?.evidence).toContain('tsconfig');
  });

  it('runs tsc through "pnpm exec", not npx, once pnpm is the detected package manager', () => {
    const d = jsDetector.detect(
      snap(['package.json', 'pnpm-lock.yaml', 'tsconfig.json'], { 'package.json': '{}' }),
    );
    expect(d?.gate.typecheck).toEqual({
      bin: 'pnpm',
      args: ['exec', 'tsc', '--noEmit'],
      label: 'tsc --noEmit',
    });
  });

  it('prefers scripts.test over vitest/jest config presence, and vitest.config over jest.config', () => {
    const withScript = jsDetector.detect(
      snap(['package.json', 'vitest.config.ts', 'jest.config.js'], {
        'package.json': JSON.stringify({ scripts: { test: 'node run-tests.js' } }),
      }),
    );
    expect(withScript?.gate.test).toEqual({
      bin: 'npm',
      args: ['run', 'test'],
      label: 'npm run test',
    });

    const withoutScript = jsDetector.detect(
      snap(['package.json', 'vitest.config.ts', 'jest.config.js'], { 'package.json': '{}' }),
    );
    expect(withoutScript?.gate.test).toEqual({
      bin: 'npx',
      args: ['--no-install', 'vitest', 'run'],
      label: 'vitest run',
    });

    const jestOnly = jsDetector.detect(
      snap(['package.json', 'jest.config.js'], { 'package.json': '{}' }),
    );
    expect(jestOnly?.gate.test).toEqual({
      bin: 'npx',
      args: ['--no-install', 'jest'],
      label: 'jest',
    });
  });

  it('adopts scripts["test:impacted"] only when it is scoped to a git ref, the fail-safe path', () => {
    const scoped = jsDetector.detect(
      snap(['package.json'], {
        'package.json': JSON.stringify({
          scripts: { 'test:impacted': 'vitest run --changed HEAD~1' },
        }),
      }),
    );
    expect(scoped?.gate.testImpacted).toEqual({
      bin: 'npm',
      args: ['run', 'test:impacted'],
      label: 'npm run test:impacted',
    });

    const workingTreeScoped = jsDetector.detect(
      snap(['package.json'], {
        'package.json': JSON.stringify({ scripts: { 'test:impacted': 'vitest run --changed' } }),
      }),
    );
    expect(workingTreeScoped?.gate.testImpacted).toBeUndefined();
    expect(workingTreeScoped?.evidence).not.toContain('scripts.test:impacted');
  });

  it('records scripts.build and scripts.lint when present, falling back to eslint config for lint', () => {
    const d = jsDetector.detect(
      snap(['package.json', 'eslint.config.js'], {
        'package.json': JSON.stringify({ scripts: { build: 'tsc -b' } }),
      }),
    );
    expect(d?.gate.build).toEqual({ bin: 'npm', args: ['run', 'build'], label: 'npm run build' });
    expect(d?.gate.lint).toEqual({
      bin: 'npx',
      args: ['--no-install', 'eslint', '.'],
      label: 'eslint .',
    });
  });

  it('records scripts["format:check"] as the format command with no config-file fallback', () => {
    const d = jsDetector.detect(
      snap(['package.json'], {
        'package.json': JSON.stringify({ scripts: { 'format:check': 'prettier --check .' } }),
      }),
    );
    expect(d?.gate.format).toEqual({
      bin: 'npm',
      args: ['run', 'format:check'],
      label: 'npm run format:check',
    });
  });

  it('scores as detected-commands count plus the package.json manifest bonus', () => {
    const d = jsDetector.detect(
      snap(['package.json'], {
        'package.json': JSON.stringify({ scripts: { test: 'vitest run', build: 'tsc -b' } }),
      }),
    );
    // 2 gate commands (test/build) + 1 manifest bonus.
    expect(d?.score).toBe(3);
  });
});
