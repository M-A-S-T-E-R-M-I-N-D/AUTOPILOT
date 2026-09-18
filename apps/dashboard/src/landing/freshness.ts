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

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The modules a landing's verdict depends on, relative to `apps/dashboard`
 *  and without an extension: `src/<m>.ts` is the source, `dist/<m>.js` the
 *  build this server loaded. */
export const LANDING_CODE_MODULES: readonly string[] = [
  'landing/execute',
  'control/ci-status',
  'gate-commands',
];

/** Where the build records what each landing module was compiled from —
 *  `scripts/build/stamp-landing-code.mjs` writes it right after `tsc -b`,
 *  relative to `apps/dashboard`. Module → sha256 of its source. */
export const LANDING_STAMP_FILE = 'dist/landing/freshness-stamp.json';

export type LandingStamp = Readonly<Record<string, string>>;

/** sha256 hex of a file's bytes (or a string) — the one hash the stamp and
 *  the check share. Bytes, not decoded text: nothing to decode, nothing to
 *  disagree about. */
export function sha256Of(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

/** The stamp's hash of a file's current content, or `null` when it cannot be read. */
export type HashOf = (path: string) => string | null;

export function fileHashOf(path: string): string | null {
  try {
    return sha256Of(readFileSync(path));
  } catch {
    return null;
  }
}

/** The build stamp under `dashboardRoot`, or `null` when there is none or
 *  it is not a plain object — an absent stamp means "fall back to mtimes",
 *  never an error. */
export function readLandingStamp(dashboardRoot: string): LandingStamp | null {
  let raw: unknown = null;
  try {
    raw = JSON.parse(String(readFileSync(join(dashboardRoot, LANDING_STAMP_FILE))));
  } catch {
    /* unreadable or malformed: raw stays null and is rejected just below */
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const stamp: Record<string, string> = {};
  for (const [module, hash] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof hash === 'string') stamp[module] = hash;
  }
  return stamp;
}

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
 * LANDING_CODE_MODULES} order. A module is stale when its build is newer
 * than `serverStartedMs` (rebuilt, but this process predates the rebuild),
 * or when its source is not what the build was compiled from: by CONTENT
 * when the build left a stamp (`LANDING_STAMP_FILE`), by mtime otherwise.
 * The stamp matters: the first self-landing after this note shipped
 * (cfec0974, 2026-09-18) reported all three modules stale on mtimes alone —
 * the merge had rewritten byte-identical files. A module whose source or
 * build cannot be read is never reported — an unreadable file is not
 * evidence of staleness.
 */
export function landingCodeIsStale(
  dashboardRoot: string,
  serverStartedMs: number,
  mtimeOf: MtimeOf = fileMtimeOf,
  stamp: LandingStamp | null = readLandingStamp(dashboardRoot),
  hashOf: HashOf = fileHashOf,
): readonly string[] {
  return LANDING_CODE_MODULES.filter((module) => {
    const srcPath = join(dashboardRoot, 'src', `${module}.ts`);
    const src = mtimeOf(srcPath);
    const dist = mtimeOf(join(dashboardRoot, 'dist', `${module}.js`));
    if (src === null || dist === null) return false;
    if (dist > serverStartedMs) return true;
    const built = stamp?.[module];
    if (built !== undefined) {
      const now = hashOf(srcPath);
      return now !== null && now !== built;
    }
    return src > dist;
  });
}

/** The sentence appended to a landing's `details` when {@link
 *  landingCodeIsStale} names anything — empty otherwise, so a fresh server
 *  changes nothing about the text. */
export function staleCodeNote(modules: readonly string[]): string {
  if (modules.length === 0) return '';
  return ` · note: the dashboard's ${modules.join(', ')} code is newer than the build this server is running — rebuild and restart the dashboard before relying on it`;
}
