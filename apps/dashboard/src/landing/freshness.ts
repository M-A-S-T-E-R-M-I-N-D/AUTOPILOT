// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Is the landing code this server is RUNNING the code that is in the tree?
 *
 * The e2e/red guard, the gate command list and the landing ritual all run
 * inside the dashboard server process. A landing that ships a change to one
 * of them changes nothing about the landing that carries it — the server
 * keeps running the build it started with. Twice on 2026-09-17/18 a landing
 * was refused by a guard whose fix was sitting in the very branch being
 * landed, until the dashboard was rebuilt and restarted by hand. This module
 * makes that state visible: a note rides on the landing result whenever any
 * of the modules below is newer in `src/` than in `dist/` (edited or checked
 * out since the last build), or newer in `dist/` than this process (rebuilt
 * since the server started — a restart is due).
 */

import { statSync } from 'node:fs';
import { join } from 'node:path';

/** The modules a landing's verdict depends on, relative to `apps/dashboard`
 *  and without an extension: `src/<m>.ts` is the source, `dist/<m>.js` the
 *  build this server loaded. */
export const LANDING_CODE_MODULES: readonly string[] = [
  'landing/execute',
  'control/ci-status',
  'gate-commands',
];

/** Epoch-ms modification time of a file, or `null` when it cannot be read. */
export type MtimeOf = (path: string) => number | null;

export function fileMtimeOf(path: string): number | null {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * The modules whose running build is out of date, in {@link
 * LANDING_CODE_MODULES} order. A module is stale when its source is newer
 * than its build (not rebuilt since the change) or its build is newer than
 * `serverStartedMs` (rebuilt, but this process predates the rebuild). A
 * module whose source or build cannot be read is never reported — an
 * unreadable file is not evidence of staleness.
 */
export function landingCodeIsStale(
  dashboardRoot: string,
  serverStartedMs: number,
  mtimeOf: MtimeOf = fileMtimeOf,
): readonly string[] {
  return LANDING_CODE_MODULES.filter((module) => {
    const src = mtimeOf(join(dashboardRoot, 'src', `${module}.ts`));
    const dist = mtimeOf(join(dashboardRoot, 'dist', `${module}.js`));
    if (src === null || dist === null) return false;
    return src > dist || dist > serverStartedMs;
  });
}

/** The sentence appended to a landing's `details` when {@link
 *  landingCodeIsStale} names anything — empty otherwise, so a fresh server
 *  changes nothing about the text. */
export function staleCodeNote(modules: readonly string[]): string {
  if (modules.length === 0) return '';
  return ` · note: the dashboard's ${modules.join(', ')} code is newer than the build this server is running — rebuild and restart the dashboard before relying on it`;
}
