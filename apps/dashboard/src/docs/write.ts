// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The docs reader's editor, execute half (epic 0023 "The docs reader" slice
 * 3, board web-mtywp7to-rbebh4): turns `flight/docs-write.ts`'s pure {@link
 * planDocsWrite} into a real file write, the same
 * validate-in-a-pure-planner-then-write-for-real split `inbox/add.ts` already
 * uses for its own project-scoped disk write (`projectId` → `root_path` via
 * the store, same lookup). This module never talks to `gh` or HTTP — the
 * guarded HTTP endpoint (`server.ts`'s `handleDocsWrite`) resolves the acting
 * identity and calls this.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openStore, listProjects } from '@autopilot/store';
import { planDocsWrite } from '../flight/docs-write.js';

export interface DocsWriteApiResult {
  readonly ok: true;
  /** The same allow-listed path the request carried, once validated. */
  readonly path: string;
}

export interface DocsWriteApiRejection {
  readonly ok: false;
  /** Why the save was refused — `planDocsWrite`'s own reason, surfaced
   *  verbatim so a human reviewing a refused save can act on it. */
  readonly reason: string;
}

/** One docs-editor save for a known project; `null` when the project id is
 *  unknown (the HTTP handler turns that into a 404, same convention as
 *  `inbox/add.ts`'s `InboxAddApi`). */
export type DocsWriteApi = (
  projectId: string,
  path: string,
  content: string,
  author: string,
  page: string,
) => Promise<DocsWriteApiResult | DocsWriteApiRejection | null>;

/** Builds the docs-write API against the real store + real filesystem — the
 *  production wiring `main.ts` injects into the server. `now` is threaded in
 *  (rather than read from `Date.now()` here) purely so this stays
 *  deterministic under test, same as `createInboxAddApi`. */
export function createDocsWriteApi(dbPath: string, now: () => number = Date.now): DocsWriteApi {
  return async (projectId, path, content, author, page) => {
    const store = openStore(dbPath);
    let rootPath: string | undefined;
    try {
      rootPath = listProjects(store.db).find((p) => p.id === projectId)?.root_path;
    } finally {
      store.close();
    }
    if (rootPath === undefined) return null;

    const plan = planDocsWrite({
      path,
      content,
      author,
      when: new Date(now()).toISOString(),
      page,
    });
    if (!plan.ok) return plan;

    const absolute = join(rootPath, plan.path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, plan.content, 'utf8');
    return { ok: true, path: plan.path };
  };
}
