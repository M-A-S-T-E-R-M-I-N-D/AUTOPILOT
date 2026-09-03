// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * INBOX (backlog I, web-msnt26uk-osohaz) — the write half. The read half
 * (packages/engine/src/inbox.ts + apps/dashboard/src/flight/inbox.ts) already
 * splices `<project>/INBOX/*` into every firing's prompt; this is how a note
 * gets there without the operator touching a filesystem — a dashboard message
 * box that drops a timestamped file into the same folder a firing already
 * reads. Auto-triage into a note/task/plan (source:'inbox' on the task board)
 * is a deliberate follow-up, not this slice.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openStore, listProjects } from '@autopilot/store';

export interface InboxAddResult {
  readonly ok: boolean;
  readonly file: string;
}

/** One INBOX drop for a known project, or `null` when the project id is
 *  unknown (the HTTP handler turns that into a 404, same convention as every
 *  other project-scoped write action). */
export type InboxAddApi = (projectId: string, message: string) => Promise<InboxAddResult | null>;

/** ISO timestamp with colons swapped for hyphens — `:` is invalid in a
 *  Windows filename, and sorting stays chronological either way. */
function inboxFilename(now: number): string {
  return `${new Date(now).toISOString().replace(/[:.]/g, '-')}-dashboard.md`;
}

/** Build the INBOX add API against the real store + real filesystem — the
 *  production wiring `main.ts` injects into the server. `now` is threaded in
 *  (rather than read from `Date.now()` here) purely so this stays deterministic
 *  under test. */
export function createInboxAddApi(dbPath: string, now: () => number = Date.now): InboxAddApi {
  return async (projectId, message) => {
    const store = openStore(dbPath);
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;
      const dir = join(project.root_path, 'INBOX');
      mkdirSync(dir, { recursive: true });
      const file = inboxFilename(now());
      writeFileSync(join(dir, file), `${message}\n`, 'utf8');
      return { ok: true, file };
    } finally {
      store.close();
    }
  };
}
