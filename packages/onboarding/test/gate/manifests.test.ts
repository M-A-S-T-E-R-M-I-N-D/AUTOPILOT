// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  tomlHasSection,
  safeJsonParse,
  packageScripts,
  scriptCommand,
  execCommand,
  directCommand,
} from '../../src/gate/manifests.js';

describe('safeJsonParse', () => {
  it('returns null for null input', () => {
    expect(safeJsonParse(null)).toBeNull();
  });

  it('parses a valid JSON object', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null when the parsed value is not an object', () => {
    expect(safeJsonParse('42')).toBeNull();
    expect(safeJsonParse('"a string"')).toBeNull();
  });

  it('returns null when JSON.parse throws on malformed text', () => {
    expect(safeJsonParse('{not valid json')).toBeNull();
  });
});

describe('packageScripts', () => {
  it('returns an empty object for a null pkg', () => {
    expect(packageScripts(null)).toEqual({});
  });

  it('returns an empty object when scripts is absent or not an object', () => {
    expect(packageScripts({})).toEqual({});
    expect(packageScripts({ scripts: 'nope' })).toEqual({});
    expect(packageScripts({ scripts: null })).toEqual({});
  });

  it('keeps only string-valued script entries', () => {
    expect(packageScripts({ scripts: { build: 'tsc', weird: 5 } })).toEqual({ build: 'tsc' });
  });
});

describe('scriptCommand', () => {
  it('uses the bare script name for yarn', () => {
    expect(scriptCommand('yarn', 'test')).toEqual({
      bin: 'yarn',
      args: ['test'],
      label: 'yarn test',
    });
  });

  it('uses "run <script>" for pnpm/npm', () => {
    expect(scriptCommand('pnpm', 'build')).toEqual({
      bin: 'pnpm',
      args: ['run', 'build'],
      label: 'pnpm run build',
    });
  });
});

describe('execCommand', () => {
  it('routes through npx --no-install for npm', () => {
    expect(execCommand('npm', 'tsc', ['--noEmit'])).toEqual({
      bin: 'npx',
      args: ['--no-install', 'tsc', '--noEmit'],
      label: 'tsc --noEmit',
    });
  });

  it('routes through "<pm> exec" for non-npm package managers', () => {
    expect(execCommand('pnpm', 'eslint', ['.'])).toEqual({
      bin: 'pnpm',
      args: ['exec', 'eslint', '.'],
      label: 'eslint .',
    });
  });

  it('joins multiple args with a space in the label', () => {
    expect(execCommand('pnpm', 'eslint', ['--fix', '.']).label).toBe('eslint --fix .');
  });

  it('trims the trailing space left by an empty args array', () => {
    expect(execCommand('npm', 'tsc', []).label).toBe('tsc');
  });
});

describe('directCommand', () => {
  it('passes bin/args through unchanged and builds a trimmed label', () => {
    expect(directCommand('cargo', ['build'])).toEqual({
      bin: 'cargo',
      args: ['build'],
      label: 'cargo build',
    });
    expect(directCommand('go', [])).toEqual({ bin: 'go', args: [], label: 'go' });
  });

  it('joins multiple args with a space in the label', () => {
    expect(directCommand('git', ['commit', '-m', 'msg']).label).toBe('git commit -m msg');
  });
});

describe('tomlHasSection', () => {
  it('matches an exact top-level section', () => {
    expect(tomlHasSection('[tool.mypy]\n', 'tool.mypy')).toBe(true);
  });

  it('matches a nested sub-table of the section', () => {
    expect(tomlHasSection('[tool.pytest.ini_options]\n', 'tool.pytest')).toBe(true);
  });

  it('matches a section with trailing whitespace before the bracket', () => {
    expect(tomlHasSection('[tool.mypy ]\n', 'tool.mypy')).toBe(true);
  });

  it('matches an indented section (nested TOML formatting)', () => {
    expect(tomlHasSection('  [tool.ruff]\n', 'tool.ruff')).toBe(true);
  });

  it('does NOT match an unrelated section that merely shares the prefix', () => {
    // [tool.mypyc] is the real, distinct mypy-to-C compiler config — not a mypy config marker.
    expect(tomlHasSection('[tool.mypyc]\n', 'tool.mypy')).toBe(false);
  });

  it('does NOT match a differently-suffixed plugin section', () => {
    // [tool.pytest_asyncio] is the pytest-asyncio plugin's own section, not pytest itself.
    expect(tomlHasSection('[tool.pytest_asyncio]\n', 'tool.pytest')).toBe(false);
  });

  it('returns false for null text', () => {
    expect(tomlHasSection(null, 'tool.mypy')).toBe(false);
  });

  it('returns false when the section is absent', () => {
    expect(tomlHasSection('[build-system]\nrequires = ["setuptools"]\n', 'tool.mypy')).toBe(false);
  });
});
