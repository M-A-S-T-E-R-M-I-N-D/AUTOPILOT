// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * INBOX auto-triage (backlog I, web-msnt26uk-osohaz) — the last piece of the
 * operator's own loop: a dropped note doesn't just get READ as context
 * (packages/engine/src/inbox.ts), it becomes a workable task on the board
 * (`source: 'inbox'`, straight to 'queued' — the operator already authored
 * it, no self-mined-proposal approval gate needed). Runs once per firing,
 * right after the same fresh read that feeds the prompt digest, so a note
 * dropped mid-flight is triaged by the very next firing — the board's own
 * freshness contract. Once triaged, the file moves to `INBOX/.triaged/` so
 * the SAME note can never mint a second task nor keep re-appearing in future
 * digests; the note itself is never deleted (nothing is lost).
 */

import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createTask, type Store } from '@autopilot/store';
import { slugify } from '@autopilot/onboarding';

export interface InboxEntry {
  readonly name: string;
  readonly content: string;
}

/** A task board needs SOME title; a note is free-form prose, not one. */
const INBOX_TASK_TITLE_CHARS = 200;
const TRIAGED_SUBDIR = '.triaged';

/** The note's first non-blank line, or its filename when the note is blank —
 *  truncated the same way task titles are capped everywhere else on the board. */
export function inboxTaskTitle(entry: InboxEntry): string {
  const firstLine = entry.content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return (firstLine ?? entry.name).slice(0, INBOX_TASK_TITLE_CHARS);
}

/** Content-addressed by filename (not random) so re-triaging after a failed
 *  archive can never mint a second task for the same note — createTask's
 *  duplicate-PK path just returns false and the retry is harmless. */
export function inboxTaskId(name: string): string {
  return `inbox-${slugify(name)}`;
}

/**
 * Turn each dropped note into an 'inbox'-sourced task, then archive the file.
 * createTask never throws (a missing project or a rejected value just yields
 * `false`), and archiving is always attempted regardless — an unmovable file
 * (locked, already gone) is simply left in place and retried, harmlessly,
 * next firing.
 */
export function triageInboxEntries(
  store: Store,
  projectId: string,
  target: string,
  entries: readonly InboxEntry[],
  now: () => number = Date.now,
): void {
  if (entries.length === 0) return;
  const dir = join(target, 'INBOX');
  const archiveDir = join(dir, TRIAGED_SUBDIR);
  for (const entry of entries) {
    createTask(store, {
      id: inboxTaskId(entry.name),
      projectId,
      title: inboxTaskTitle(entry),
      source: 'inbox',
      createdAt: now(),
    });
    try {
      mkdirSync(archiveDir, { recursive: true });
      renameSync(join(dir, entry.name), join(archiveDir, entry.name));
    } catch {
      // unmovable (locked, already gone) — left in place, retried next firing.
    }
  }
}
