// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the Python gate detector (`gate/detectors/python.ts`).
 * `detect.test.ts` only exercises it indirectly through `detectGate`'s
 * ecosystem-selection pipeline; these tests call `pythonDetector.detect`
 * directly against a bare `FsSnapshot`.
 */

import { describe, it, expect } from 'vitest';
import { pythonDetector } from '../../../src/gate/detectors/python.js';
import { makeFsSnapshot } from '../../../src/gate/snapshot.js';

function snap(files: readonly string[], contents: Record<string, string> = {}) {
  return makeFsSnapshot({ files, contents });
}

describe('pythonDetector', () => {
  it('returns null when there is no manifest and no .py files', () => {
    expect(pythonDetector.detect(snap(['package.json']))).toBeNull();
  });

  it('maps pytest / mypy / ruff from pyproject.toml sections, in that evidence order', () => {
    const d = pythonDetector.detect(
      snap(['pyproject.toml', 'app/__init__.py'], {
        'pyproject.toml': '[tool.pytest.ini_options]\n[tool.mypy]\n[tool.ruff]\n',
      }),
    );
    expect(d).not.toBeNull();
    expect(d?.evidence).toEqual(['pyproject.toml', 'pytest', 'mypy', 'ruff']);
    expect(d?.gate.test).toEqual({ bin: 'pytest', args: [], label: 'pytest' });
    expect(d?.gate.typecheck).toEqual({ bin: 'mypy', args: ['.'], label: 'mypy .' });
    expect(d?.gate.lint).toEqual({ bin: 'ruff', args: ['check', '.'], label: 'ruff check .' });
  });

  it('records setup.py as evidence when there is no pyproject.toml', () => {
    const d = pythonDetector.detect(snap(['setup.py', 'app/__init__.py']));
    expect(d?.evidence).toEqual(['setup.py']);
    expect(d?.gate).toEqual({});
  });

  it('records setup.cfg as evidence on its own', () => {
    const d = pythonDetector.detect(snap(['setup.cfg']));
    expect(d?.evidence).toEqual(['setup.cfg']);
  });

  it('records requirements.txt as evidence on its own', () => {
    const d = pythonDetector.detect(snap(['requirements.txt']));
    expect(d?.evidence).toEqual(['requirements.txt']);
  });

  it('falls back to flake8 when ruff is not configured', () => {
    const d = pythonDetector.detect(snap(['setup.py', '.flake8']));
    expect(d?.gate.lint).toEqual({ bin: 'flake8', args: [], label: 'flake8' });
    expect(d?.evidence).toEqual(['setup.py', 'flake8']);
  });

  it('prefers ruff over flake8 when both are configured', () => {
    const d = pythonDetector.detect(snap(['setup.py', 'ruff.toml', '.flake8']));
    expect(d?.gate.lint).toEqual({ bin: 'ruff', args: ['check', '.'], label: 'ruff check .' });
    expect(d?.evidence).toEqual(['setup.py', 'ruff']);
  });

  it('detects via .py suffix alone with no manifest, so no evidence and no manifest bonus', () => {
    const d = pythonDetector.detect(snap(['main.py']));
    expect(d).not.toBeNull();
    expect(d?.evidence).toEqual([]);
    expect(d?.gate).toEqual({});
    expect(d?.score).toBe(0);
  });

  it('scores as detected-commands count (test/typecheck/lint) plus the manifest bonus', () => {
    const d = pythonDetector.detect(
      snap(['pyproject.toml', 'app/__init__.py'], {
        'pyproject.toml': '[tool.pytest.ini_options]\n[tool.mypy]\n[tool.ruff]\n',
      }),
    );
    // 3 gate commands (test/typecheck/lint) + 1 manifest bonus.
    expect(d?.score).toBe(4);
  });
});
