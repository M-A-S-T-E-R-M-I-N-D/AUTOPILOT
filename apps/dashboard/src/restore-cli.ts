// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `pnpm dashboard:restore` process entry point — runs the tested `runRestore`
 * core (restore.ts) against the real store. Kept in its own file, never
 * imported by anything else, so `restore.ts` stays import-safe (a test
 * importing `runRestore` never triggers a real run as a side effect).
 */

import { runRestore } from './restore.js';

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function main(): Promise<void> {
  process.exitCode = await runRestore();
}

main().catch((err) => {
  out(`restore failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
