// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { countText } from './wordcount.js';

/** Pure argv -> output-line mapping, kept separate from the process entry point for testability. */
export function run(argv: readonly string[]): string {
  const [filePath] = argv;
  if (filePath === undefined) {
    throw new Error('Usage: sample-node-cli <file>');
  }

  const text = readFileSync(filePath, 'utf8');
  const { lines, words, chars } = countText(text);
  return `${lines} ${words} ${chars} ${filePath}`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(run(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
