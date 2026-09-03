// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { run } from './cli.js';

test('throws a usage error when no file argument is given', () => {
  assert.throws(() => run([]), /Usage: sample-node-cli <file>/);
});

test('counts a real file and echoes its path, like wc', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sample-node-cli-'));
  const filePath = join(dir, 'fixture.txt');
  writeFileSync(filePath, 'a b c\n');

  try {
    assert.equal(run([filePath]), `1 3 6 ${filePath}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runs as a real CLI process and prints to stdout (exercises the entry-point guard, not just run())', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sample-node-cli-'));
  const filePath = join(dir, 'fixture.txt');
  writeFileSync(filePath, 'a b c\n');
  const cliPath = join(dirname(fileURLToPath(import.meta.url)), 'cli.js');

  try {
    const stdout = execFileSync(process.execPath, [cliPath, filePath], { encoding: 'utf8' });
    assert.equal(stdout.trim(), `1 3 6 ${filePath}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
