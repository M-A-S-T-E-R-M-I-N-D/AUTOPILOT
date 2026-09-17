// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The COLLABORATION panel's combined read (BOARD web-mtpzqrxl-z7jgbu,
 * "roadmap items, help-wanted issues with claim state (assignee), my-claims;
 * read via gh like pool-client"), server-route slice: composes the two
 * data-source-only reads `roadmap-items.ts`'s {@link fetchRoadmapItems} and
 * `help-wanted-items.ts`'s {@link fetchHelpWantedItems} already shipped
 * behind one call, the same injectable-exec-with-a-real-default seam
 * `social-pass.ts`'s `createSocialIdentityApi` and `publicity.ts`'s
 * `createPublicityPreviewApi` use, so `server/collaboration.ts` has one API
 * to wire rather than two round trips.
 *
 * Deliberately does not derive "my-claims" here — that filter needs the
 * viewer's own login (`social-pass.ts`'s `fetchViewerLogin`, already exposed
 * via `GET /api/social-identity`), so it belongs at the UI layer that reads
 * both endpoints, not duplicated into a second `gh api user` shell-out here.
 * The dashboard panel that renders this snapshot is a further slice of the
 * same board task, same "building block ahead of its UI" stance
 * `report-from-here.ts` shipped with.
 */

import type { CliExec } from '../connection/cli-probe.js';
import { ghExec } from './gh-exec.js';
import { fetchRoadmapItems, type RoadmapItem } from './roadmap-items.js';
import { fetchHelpWantedItems, type HelpWantedItem } from './help-wanted-items.js';

/** The COLLABORATION panel's combined snapshot — every open `roadmap`
 *  issue and every open `help wanted` issue, each carrying its assignees so
 *  a "who does what" view (and, at the UI layer, a "my-claims" filter) can
 *  render without a second round trip. */
export interface CollaborationSnapshot {
  readonly roadmap: readonly RoadmapItem[];
  readonly helpWanted: readonly HelpWantedItem[];
}

/** The COLLABORATION panel's read (injected; composes {@link
 *  fetchRoadmapItems} and {@link fetchHelpWantedItems} behind one call) —
 *  see {@link createCollaborationApi}. */
export type CollaborationApi = () => Promise<CollaborationSnapshot>;

/** Fetches both label families in parallel via the injected `exec` — the
 *  same `CliExec` shape both reads already use, so this stays
 *  deterministically testable without a real `gh` on PATH. Neither read
 *  throws on its own (both degrade to `[]` on a non-zero exit or
 *  unparseable stdout), so this only rejects if `exec` itself does. */
export async function fetchCollaborationSnapshot(exec: CliExec): Promise<CollaborationSnapshot> {
  const [roadmap, helpWanted] = await Promise.all([
    fetchRoadmapItems(exec),
    fetchHelpWantedItems(exec),
  ]);
  return { roadmap, helpWanted };
}

/**
 * Builds the COLLABORATION panel's read, defaulting to the real `gh` CLI
 * like every other on-demand-not-polled panel read in this flight layer.
 * Never rejects: a thrown `exec` failure degrades to an empty snapshot
 * rather than crashing the route — the same fail-closed-to-empty stance
 * `handlePoolClient`/`handleContributorIssueList` take at the HTTP layer,
 * applied here too so a caller that skips that try/catch still gets a safe
 * default.
 */
export function createCollaborationApi(exec: CliExec = ghExec): CollaborationApi {
  return async () => {
    try {
      return await fetchCollaborationSnapshot(exec);
    } catch {
      return { roadmap: [], helpWanted: [] };
    }
  };
}
