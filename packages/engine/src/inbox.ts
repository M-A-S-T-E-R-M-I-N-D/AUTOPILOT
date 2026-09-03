// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * INBOX digest — the operator's own loop (backlog I): a folder the operator
 * can drop notes/tasks/plans into, read by every firing as OPTIONAL context
 * (never a dependency — an empty or missing folder changes nothing). Pure +
 * unit-testable like REPO-MAP (repo-map.ts): the caller (apps/dashboard's
 * fly.ts) does the impure directory read and hands already-read entries here.
 */

/** One file the operator dropped into `<target>/INBOX/`. */
export interface InboxEntry {
  readonly name: string;
  readonly content: string;
}

/** Bound the section: enough to inform, never enough to bloat the prompt. */
const INBOX_MAX_ENTRIES = 10;
const INBOX_ENTRY_CHARS = 1000;

/** Render the operator's dropped notes as a compact block, or '' when the inbox is empty. */
export function buildInboxDigest(entries: readonly InboxEntry[]): string {
  if (entries.length === 0) return '';
  const lines = [
    "## INBOX — the operator's notes (optional input, never a dependency)",
    'Dropped into `INBOX/` for you to read. Use them for context if relevant to this',
    "firing's pick; they are not a task queue and completing one is not required.",
  ];
  for (const entry of entries.slice(0, INBOX_MAX_ENTRIES)) {
    lines.push('', `### ${entry.name}`, entry.content.trim().slice(0, INBOX_ENTRY_CHARS));
  }
  return lines.join('\n');
}
