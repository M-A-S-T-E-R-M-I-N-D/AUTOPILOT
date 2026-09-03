// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `pnpm dashboard:reset` — clear the local fleet for a fresh real run: delete the
 * store DB + the demo/flight sample repos under `.autopilot/`, but KEEP your saved
 * connection (login stays). After this, onboard your real folder with
 * `pnpm dashboard:fly <folder>`.
 */

import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveDbPath } from './read/config.js';

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

export interface RunResetOptions {
  readonly dbPath?: string;
  readonly log?: (line: string) => void;
}

/**
 * Core `dashboard:reset` logic — dbPath/log are injectable so this is
 * unit-testable without touching the real store. Removing already-absent
 * files is a no-op (force: true), never an error.
 */
export function runReset(options: RunResetOptions = {}): void {
  const log = options.log ?? out;
  const dbPath = options.dbPath ?? resolveDbPath();
  const workspace = dirname(dbPath);

  for (const file of ['autopilot.db', 'autopilot.db-wal', 'autopilot.db-shm']) {
    rmSync(join(workspace, file), { force: true });
  }
  rmSync(join(workspace, 'demo'), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

  log('Fleet cleared — store DB + demo/sample repos removed (your login is kept).');
  log('Fly your real folder next:  pnpm dashboard:fly <folder>');
}
