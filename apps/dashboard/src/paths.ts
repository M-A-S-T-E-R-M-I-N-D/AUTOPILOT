// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { resolve } from 'node:path';

/** Do `a` and `b` resolve to the same filesystem path? Case-insensitive on
 *  win32 (NTFS paths aren't case-sensitive) — used wherever a project's
 *  stored `root_path` is compared against a folder the caller passed in. */
export function samePath(a: string, b: string): boolean {
  const ra = resolve(a);
  const rb = resolve(b);
  return process.platform === 'win32' ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}
