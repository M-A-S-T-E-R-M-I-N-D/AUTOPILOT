// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `pnpm dashboard:reset` process entry point — runs the tested `runReset`
 * core (reset.ts) against the real store. Kept in its own file, never
 * imported by anything else, so `reset.ts` stays import-safe (a test
 * importing `runReset` never triggers a real run as a side effect).
 */

import { runReset } from './reset.js';

runReset();
