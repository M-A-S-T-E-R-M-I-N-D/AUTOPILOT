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

  it('maps pytest / mypy / flake8 from setup.cfg sections, in that evidence order', () => {
    // setup.cfg is the one place flake8 reads natively (it has no pyproject
    // support), and pytest and mypy both document it — the snapshot already
    // captures its text, so a setup.cfg-configured project must not get an
    // empty gate.
    const d = pythonDetector.detect(
      snap(['setup.cfg', 'pkg/__init__.py'], {
        'setup.cfg':
          '[metadata]\r\nname = pkg\r\n\r\n[tool:pytest]\r\ntestpaths = tests\r\n\r\n' +
          '[mypy]\r\nstrict = True\r\n\r\n[flake8]\r\nmax-line-length = 100\r\n',
      }),
    );
    expect(d?.evidence).toEqual(['setup.cfg', 'pytest', 'mypy', 'flake8']);
    expect(d?.gate.test).toEqual({ bin: 'pytest', args: [], label: 'pytest' });
    expect(d?.gate.typecheck).toEqual({ bin: 'mypy', args: ['.'], label: 'mypy .' });
    expect(d?.gate.lint).toEqual({ bin: 'flake8', args: [], label: 'flake8' });
  });

  it('ignores setup.cfg sections that are not the tool’s own config', () => {
    // A per-module `[mypy-requests.*]` only refines a global `[mypy]` section,
    // and `[coverage:run]` configures coverage.py, not pytest.
    const d = pythonDetector.detect(
      snap(['setup.cfg'], {
        'setup.cfg': '[mypy-requests.*]\nignore_missing_imports = True\n[coverage:run]\n',
      }),
    );
    expect(d?.gate).toEqual({});
    expect(d?.evidence).toEqual(['setup.cfg']);
  });

  it('maps flake8 from a [flake8] section in tox.ini', () => {
    // flake8 reads its config from setup.cfg, tox.ini or .flake8 (its own
    // configuration docs), so a project that keeps it in tox.ini gets a lint.
    const d = pythonDetector.detect(
      snap(['setup.py', 'tox.ini'], {
        'tox.ini':
          '[tox]\r\nenvlist = py312\r\n\r\n[testenv]\r\ncommands = pytest\r\n\r\n' +
          '[flake8]\r\nmax-line-length = 100\r\n',
      }),
    );
    expect(d?.gate.lint).toEqual({ bin: 'flake8', args: [], label: 'flake8' });
    expect(d?.evidence).toEqual(['setup.py', 'pytest', 'flake8']);
  });

  it('reads no lint or typecheck from a tox.ini that does not configure flake8', () => {
    // mypy never reads tox.ini (mypy.ini, .mypy.ini, pyproject.toml and
    // setup.cfg only), so its section there is not mypy's config.
    const d = pythonDetector.detect(
      snap(['setup.py', 'tox.ini'], {
        'tox.ini': '[tox]\nenvlist = py312\n[testenv]\ncommands = pytest\n[mypy]\nstrict = True\n',
      }),
    );
    expect(d?.gate.lint).toBeUndefined();
    expect(d?.gate.typecheck).toBeUndefined();
    expect(d?.evidence).toEqual(['setup.py', 'pytest']);
  });

  it.each(['pytest.ini', '.pytest.ini', 'pytest.toml', '.pytest.toml'])(
    'detects pytest from its own config file %s alone',
    (file) => {
      // pytest's documented search order opens with these four (pytest.toml and
      // its hidden twin since pytest 9.0) — each is pytest's alone, even empty.
      const d = pythonDetector.detect(snap(['setup.py', file]));
      expect(d?.gate.test).toEqual({ bin: 'pytest', args: [], label: 'pytest' });
      expect(d?.evidence).toEqual(['setup.py', 'pytest']);
    },
  );

  it.each(['mypy.ini', '.mypy.ini'])('detects mypy from its own config file %s alone', (file) => {
    // mypy looks for mypy.ini, then the hidden .mypy.ini, before pyproject/setup.cfg.
    const d = pythonDetector.detect(snap(['setup.py', file]));
    expect(d?.gate.typecheck).toEqual({ bin: 'mypy', args: ['.'], label: 'mypy .' });
    expect(d?.evidence).toEqual(['setup.py', 'mypy']);
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
