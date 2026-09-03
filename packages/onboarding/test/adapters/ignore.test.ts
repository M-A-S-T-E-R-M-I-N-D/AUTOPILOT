// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { IGNORE_DIRS } from '../../src/adapters/ignore.js';

describe('IGNORE_DIRS', () => {
  it('contains exactly the 18 documented directory names — no more, no fewer', () => {
    expect(IGNORE_DIRS.size).toBe(18);
  });

  it.each([
    '.git',
    '.hg',
    '.svn',
    '.autopilot',
    '.autopilot-run',
    'node_modules',
    'dist',
    'coverage',
    'reports',
    '.next',
    'target',
    'build',
    'vendor',
    '__pycache__',
    '.venv',
    'venv',
    '.idea',
    '.vscode',
  ])('flags %s as ignored', (dir) => {
    expect(IGNORE_DIRS.has(dir)).toBe(true);
  });

  it('does not flag ordinary source/package directories as ignored', () => {
    expect(IGNORE_DIRS.has('src')).toBe(false);
    expect(IGNORE_DIRS.has('packages')).toBe(false);
    expect(IGNORE_DIRS.has('')).toBe(false);
  });
});
