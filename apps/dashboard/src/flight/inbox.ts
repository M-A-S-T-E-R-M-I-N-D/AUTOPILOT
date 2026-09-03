// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The operator's own loop (backlog I): `<target>/INBOX/` is a folder the
 * operator can drop notes into, read by every firing as optional context
 * (engine's buildInboxDigest, packages/engine/src/inbox.ts). This is the pure
 * half — deciding WHICH filenames in that folder count as operator notes;
 * fly.ts does the impure directory read and hands the result here.
 */

/** The convention doc itself is instructions for the operator, not a note to read back. */
const IGNORED_INBOX_FILES = new Set(['readme.md']);

/** Filter + sort a raw directory listing down to the files a firing should read. */
export function selectInboxFiles(names: readonly string[]): readonly string[] {
  return names
    .filter((name) => !name.startsWith('.') && !IGNORED_INBOX_FILES.has(name.toLowerCase()))
    .sort();
}
