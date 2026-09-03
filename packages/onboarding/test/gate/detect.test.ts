// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { detectGate } from '../../src/gate/detect.js';
import { makeFsSnapshot } from '../../src/gate/snapshot.js';

function snap(files: readonly string[], contents: Record<string, string> = {}) {
  return makeFsSnapshot({ files, contents });
}

describe('detectGate — JS/TS', () => {
  it('prefers package.json scripts via the detected package manager (pnpm)', () => {
    const s = snap(['package.json', 'pnpm-lock.yaml', 'tsconfig.json'], {
      'package.json': JSON.stringify({
        scripts: {
          typecheck: 'tsc --noEmit',
          test: 'vitest run',
          build: 'tsc -b',
          lint: 'eslint .',
        },
      }),
    });
    const d = detectGate(s);
    expect(d.spec.ecosystem).toBe('js');
    expect(d.ambiguity).toBe('single');
    expect(d.spec.test).toMatchObject({
      bin: 'pnpm',
      args: ['run', 'test'],
      label: 'pnpm run test',
    });
    expect(d.spec.typecheck?.label).toBe('pnpm run typecheck');
    expect(d.spec.build).toMatchObject({
      bin: 'pnpm',
      args: ['run', 'build'],
      label: 'pnpm run build',
    });
    expect(d.spec.lint).toMatchObject({
      bin: 'pnpm',
      args: ['run', 'lint'],
      label: 'pnpm run lint',
    });
    expect(d.candidates[0]?.evidence).toEqual([
      'package.json',
      'pm:pnpm',
      'scripts.typecheck',
      'scripts.test',
      'scripts.build',
      'scripts.lint',
    ]);
    expect(d.candidates[0]?.tier).toBe('high');
  });

  it('detects a format:check script (formatting drift fails full gates too)', () => {
    const s = snap(['package.json', 'pnpm-lock.yaml'], {
      'package.json': JSON.stringify({
        scripts: { test: 'vitest run', 'format:check': 'prettier --check .' },
      }),
    });
    const d = detectGate(s);
    expect(d.spec.format).toMatchObject({
      bin: 'pnpm',
      args: ['run', 'format:check'],
      label: 'pnpm run format:check',
    });
    expect(d.candidates[0]?.evidence).toContain('scripts.format:check');
  });

  it('detects a ref-scoped test:impacted script (impacted-tests-first gate scheduling, web-msnt26tn-jvyihy)', () => {
    const s = snap(['package.json', 'pnpm-lock.yaml'], {
      'package.json': JSON.stringify({
        scripts: { test: 'vitest run', 'test:impacted': 'vitest run --changed HEAD~1' },
      }),
    });
    const d = detectGate(s);
    expect(d.spec.testImpacted).toMatchObject({
      bin: 'pnpm',
      args: ['run', 'test:impacted'],
      label: 'pnpm run test:impacted',
    });
    expect(d.candidates[0]?.evidence).toContain('scripts.test:impacted');
  });

  // EVALUATION 2026-08-27: the flight gate runs AFTER the firing's commit, so
  // the working tree is clean. A `--changed` with no ref therefore resolves
  // zero test files and exits 0 — 15 of 19 firings shipped through a test leg
  // that never ran. Refusing to adopt it falls back to the full `test`
  // command, which is slower but honest.
  it('refuses a working-tree-scoped test:impacted script, so the gate falls back to the full suite', () => {
    const s = snap(['package.json', 'pnpm-lock.yaml'], {
      'package.json': JSON.stringify({
        scripts: { test: 'vitest run', 'test:impacted': 'vitest run --changed' },
      }),
    });
    const d = detectGate(s);
    expect(d.spec.testImpacted).toBeUndefined();
    expect(d.candidates[0]?.evidence).not.toContain('scripts.test:impacted');
    // The full command is still detected — the gate keeps a real test leg.
    expect(d.spec.test?.label).toBe('pnpm run test');
  });

  it('refuses a working-tree-scoped script even when another flag follows --changed', () => {
    const s = snap(['package.json', 'pnpm-lock.yaml'], {
      'package.json': JSON.stringify({
        scripts: { test: 'vitest run', 'test:impacted': 'vitest run --changed --silent' },
      }),
    });
    expect(detectGate(s).spec.testImpacted).toBeUndefined();
  });

  it('leaves testImpacted absent when there is no test:impacted script', () => {
    const s = snap(['package.json', 'pnpm-lock.yaml'], {
      'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }),
    });
    expect(detectGate(s).spec.testImpacted).toBeUndefined();
  });

  it('falls back to config-file tools with npx when there are no scripts (npm)', () => {
    const s = snap(['package.json', 'tsconfig.json', 'vitest.config.ts', 'eslint.config.js'], {
      'package.json': '{}',
    });
    const d = detectGate(s);
    expect(d.spec.ecosystem).toBe('js');
    expect(d.spec.typecheck).toMatchObject({
      bin: 'npx',
      args: ['--no-install', 'tsc', '--noEmit'],
    });
    expect(d.spec.test?.label).toBe('vitest run');
    expect(d.spec.lint).toMatchObject({ bin: 'npx', args: ['--no-install', 'eslint', '.'] });
    expect(d.spec.build).toBeUndefined(); // no build script, no safe fallback
    expect(d.candidates[0]?.evidence).toEqual([
      'package.json',
      'pm:npm',
      'tsconfig',
      'vitest.config',
      'eslint.config',
    ]);
  });

  it('falls back to a vitest.workspace.* config when there is no vitest.config.*', () => {
    const s = snap(['package.json', 'vitest.workspace.ts'], { 'package.json': '{}' });
    const d = detectGate(s);
    expect(d.spec.test?.label).toBe('vitest run');
    expect(d.candidates[0]?.evidence).toContain('vitest.config');
  });

  it('falls back to a .eslintrc* config when there is no eslint.config.*', () => {
    const s = snap(['package.json', '.eslintrc.json'], { 'package.json': '{}' });
    const d = detectGate(s);
    expect(d.spec.lint).toMatchObject({ bin: 'npx', args: ['--no-install', 'eslint', '.'] });
    expect(d.candidates[0]?.evidence).toContain('eslint.config');
  });

  it('uses yarn without the "run" keyword', () => {
    const s = snap(['package.json', 'yarn.lock'], {
      'package.json': JSON.stringify({ scripts: { test: 'jest' } }),
    });
    expect(detectGate(s).spec.test).toMatchObject({ bin: 'yarn', args: ['test'] });
  });

  it('falls back to jest.config.* when there is no test script or vitest config', () => {
    const s = snap(['package.json', 'jest.config.js'], { 'package.json': '{}' });
    const d = detectGate(s);
    expect(d.spec.test).toMatchObject({ bin: 'npx', args: ['--no-install', 'jest'] });
    expect(d.candidates[0]?.evidence).toContain('jest.config');
  });

  it('does not record package.json evidence when there is no package.json', () => {
    const s = snap(['index.ts']);
    const d = detectGate(s);
    expect(d.spec.ecosystem).toBe('js');
    expect(d.candidates[0]?.evidence).not.toContain('package.json');
  });

  it('scores a bare .js file with no manifest or config as "low" confidence', () => {
    // No package.json and no tsconfig/vitest/jest/eslint config: zero gate
    // commands detected and no manifest bonus, so the score is 0 — the one
    // path that reaches tierOf's "low" branch (score < 1).
    const s = snap(['index.js']);
    const d = detectGate(s);
    expect(d.spec.ecosystem).toBe('js');
    expect(d.spec).toEqual({ ecosystem: 'js' });
    expect(d.ambiguity).toBe('single');
    expect(d.candidates[0]?.score).toBe(0);
    expect(d.candidates[0]?.tier).toBe('low');
  });
});

describe('detectGate — Python', () => {
  it('maps pytest / ruff / mypy from pyproject sections', () => {
    const s = snap(['pyproject.toml', 'app/__init__.py'], {
      'pyproject.toml': '[tool.pytest.ini_options]\n[tool.ruff]\n[tool.mypy]\n',
    });
    const d = detectGate(s);
    expect(d.spec.ecosystem).toBe('python');
    expect(d.spec.test).toMatchObject({ bin: 'pytest' });
    expect(d.spec.lint).toMatchObject({ bin: 'ruff', args: ['check', '.'] });
    expect(d.spec.typecheck).toMatchObject({ bin: 'mypy', args: ['.'] });
    expect(d.candidates[0]?.evidence).toContain('pyproject.toml');
    // detected: test+lint+typecheck = 3, plus the pyproject.toml manifest bonus = 4.
    expect(d.candidates[0]?.score).toBe(4);
  });

  it('detects pytest from test_*.py + flake8 config', () => {
    const s = snap(['requirements.txt', 'test_app.py', '.flake8']);
    const d = detectGate(s);
    expect(d.spec.ecosystem).toBe('python');
    expect(d.spec.test).toMatchObject({ bin: 'pytest', args: [] });
    expect(d.spec.lint).toMatchObject({ bin: 'flake8' });
  });

  it('does not propose pytest/mypy from unrelated same-prefix sections', () => {
    // [tool.pytest_asyncio] and [tool.mypyc] are real, distinct tools — not
    // pytest/mypy config markers — so neither should satisfy detection on their own.
    const s = snap(['pyproject.toml', 'app/__init__.py'], {
      'pyproject.toml': '[tool.pytest_asyncio]\n[tool.mypyc]\n',
    });
    const d = detectGate(s);
    expect(d.spec.test).toBeUndefined();
    expect(d.spec.typecheck).toBeUndefined();
  });

  it('records setup.py as evidence when there is no pyproject.toml', () => {
    // Exercises the else-if branch in the evidence chain (pyproject.toml absent,
    // setup.py present) that the pyproject-driven tests above never reach.
    const s = snap(['setup.py', 'app/__init__.py']);
    const d = detectGate(s);
    expect(d.spec.ecosystem).toBe('python');
    expect(d.candidates[0]?.evidence).toContain('setup.py');
    expect(d.candidates[0]?.score).toBe(1); // no gate commands detected + the manifest bonus.
  });

  it('scores a manifest-less repo via .py suffix alone with no manifest bonus', () => {
    // No pyproject.toml/setup.py/setup.cfg/requirements.txt: hasManifest is false,
    // so detection falls through to the hasSuffix('.py') check and the score's
    // "hasManifest ? 1 : 0" ternary takes its false branch.
    const s = snap(['pytest.ini', 'test_app.py']);
    const d = detectGate(s);
    expect(d.spec.ecosystem).toBe('python');
    expect(d.spec.test).toMatchObject({ bin: 'pytest' });
    expect(d.candidates[0]?.evidence).toEqual(['pytest']);
    expect(d.candidates[0]?.score).toBe(1);
    expect(d.candidates[0]?.tier).toBe('medium');
  });

  it('treats setup.cfg as a manifest signal on its own', () => {
    const s = snap(['setup.cfg']);
    const d = detectGate(s);
    expect(d.spec.ecosystem).toBe('python');
    expect(d.candidates[0]?.score).toBe(1);
    expect(d.candidates[0]?.evidence).toEqual(['setup.cfg']);
  });

  it('treats requirements.txt as a manifest signal on its own', () => {
    const s = snap(['requirements.txt']);
    const d = detectGate(s);
    expect(d.spec.ecosystem).toBe('python');
    expect(d.candidates[0]?.score).toBe(1);
    expect(d.candidates[0]?.evidence).toEqual(['requirements.txt']);
  });

  it('detects pytest via pytest.ini alone (no test_*.py/*_test.py glob match)', () => {
    const s = snap(['pytest.ini', 'main.py']);
    const d = detectGate(s);
    expect(d.spec.test).toMatchObject({ bin: 'pytest', args: [] });
    expect(d.candidates[0]?.evidence).toContain('pytest');
  });

  it('detects pytest via tox.ini alone', () => {
    const s = snap(['tox.ini', 'main.py']);
    const d = detectGate(s);
    expect(d.spec.test?.bin).toBe('pytest');
  });

  it('detects pytest via a *_test.py glob match alone', () => {
    const s = snap(['app_test.py']);
    const d = detectGate(s);
    expect(d.spec.test?.bin).toBe('pytest');
  });

  it('detects mypy via mypy.ini alone', () => {
    const s = snap(['mypy.ini', 'app.py']);
    const d = detectGate(s);
    expect(d.spec.typecheck).toMatchObject({ bin: 'mypy', args: ['.'] });
    expect(d.candidates[0]?.evidence).toContain('mypy');
  });

  it('detects ruff via ruff.toml alone', () => {
    const s = snap(['ruff.toml', 'app.py']);
    const d = detectGate(s);
    expect(d.spec.lint).toMatchObject({ bin: 'ruff', args: ['check', '.'] });
    expect(d.candidates[0]?.evidence).toContain('ruff');
  });

  it('detects ruff via .ruff.toml alone', () => {
    const s = snap(['.ruff.toml', 'app.py']);
    const d = detectGate(s);
    expect(d.spec.lint?.bin).toBe('ruff');
  });

  it('detects flake8 via a pyproject [tool.flake8] section', () => {
    const s = snap(['pyproject.toml', 'app.py'], { 'pyproject.toml': '[tool.flake8]\n' });
    const d = detectGate(s);
    expect(d.spec.lint).toMatchObject({ bin: 'flake8', args: [] });
    expect(d.candidates[0]?.evidence).toContain('flake8');
  });
});

describe('detectGate — Go', () => {
  it('maps go test/build + go vet without golangci-lint', () => {
    const d = detectGate(snap(['go.mod', 'main.go']));
    expect(d.spec.ecosystem).toBe('go');
    expect(d.spec.test).toMatchObject({ bin: 'go', args: ['test', './...'] });
    expect(d.spec.build).toMatchObject({ bin: 'go', args: ['build', './...'] });
    expect(d.spec.lint).toMatchObject({ bin: 'go', args: ['vet', './...'] });
    expect(d.candidates[0]?.evidence).toEqual(['go.mod', 'go vet']);
  });

  it('prefers golangci-lint when configured', () => {
    const d = detectGate(snap(['go.mod', '.golangci.yml']));
    expect(d.spec.lint).toMatchObject({ bin: 'golangci-lint', args: ['run'] });
    expect(d.candidates[0]?.evidence).toEqual(['go.mod', 'golangci-lint']);
  });
});

describe('detectGate — Rust', () => {
  it('maps cargo check/test/build/clippy and adds --workspace', () => {
    const d = detectGate(snap(['Cargo.toml'], { 'Cargo.toml': '[workspace]\nmembers = ["a"]\n' }));
    expect(d.spec.ecosystem).toBe('rust');
    expect(d.spec.typecheck).toMatchObject({ bin: 'cargo', args: ['check', '--workspace'] });
    expect(d.spec.test).toMatchObject({ bin: 'cargo', args: ['test', '--workspace'] });
    expect(d.spec.lint).toMatchObject({ bin: 'cargo', args: ['clippy', '--workspace'] });
    expect(d.candidates[0]?.evidence).toEqual(['Cargo.toml', 'workspace']);
    // detected: typecheck+test+build+lint = 4, plus the Cargo.toml manifest bonus = 5.
    expect(d.candidates[0]?.score).toBe(5);
  });

  it('omits --workspace for a single crate', () => {
    const d = detectGate(snap(['Cargo.toml'], { 'Cargo.toml': '[package]\nname = "x"\n' }));
    expect(d.spec.build).toMatchObject({ bin: 'cargo', args: ['build'] });
    expect(d.candidates[0]?.evidence).toEqual(['Cargo.toml']);
    expect(d.candidates[0]?.score).toBe(5);
  });
});

describe('detectGate — resolution', () => {
  it('returns "unknown" with no candidates for an unrecognised repo', () => {
    const d = detectGate(snap(['README.md', 'LICENSE']));
    expect(d.spec).toEqual({ ecosystem: 'unknown' });
    expect(d.candidates).toHaveLength(0);
    expect(d.ambiguity).toBe('none');
  });

  it('reports multi-stack ambiguity and ranks the stronger stack first', () => {
    const s = snap(['package.json', 'pnpm-lock.yaml', 'go.mod'], {
      // 4 scripts + manifest (score 5) beats go's 3 commands + manifest (score 4).
      'package.json': JSON.stringify({
        scripts: { typecheck: 'tsc', test: 'vitest', build: 'x', lint: 'y' },
      }),
    });
    const d = detectGate(s);
    expect(d.ambiguity).toBe('multi');
    expect(d.candidates.map((c) => c.spec.ecosystem)).toContain('go');
    expect(d.spec.ecosystem).toBe('js');
  });

  it('breaks a genuine score tie deterministically by ecosystem id', () => {
    // JS (3 scripts + manifest = 4) ties Go (3 cmds + manifest = 4) → 'go' wins alphabetically.
    const s = snap(['package.json', 'pnpm-lock.yaml', 'go.mod'], {
      'package.json': JSON.stringify({ scripts: { test: 'vitest', build: 'x', lint: 'y' } }),
    });
    const d = detectGate(s);
    expect(d.ambiguity).toBe('multi');
    expect(d.spec.ecosystem).toBe('go');
  });

  it('assigns "high" tier at the exact score=3 boundary', () => {
    // 2 detected commands (test, build) + manifest present = score 3 exactly,
    // the lowest score tierOf's `score >= 3` still classifies as "high".
    const s = snap(['package.json', 'pnpm-lock.yaml'], {
      'package.json': JSON.stringify({ scripts: { test: 'vitest', build: 'x' } }),
    });
    const d = detectGate(s);
    expect(d.candidates[0]?.score).toBe(3);
    expect(d.candidates[0]?.tier).toBe('high');
  });
});
