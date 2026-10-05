// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0019 S4 (board web-mtrh1hn3-8x9f0z), steering from the dashboard's
 * side: the routing console's one write. The console lists the open issues
 * no `priority:` label routes yet; routing one adds ONE house priority label
 * to it on GitHub, so the page and the board steer by the same label (law 2).
 *
 * {@link planRouteIssue} is the pure decision over a fresh read of the
 * issue, and {@link createRoutingConsoleRouteApi} is the wiring `POST
 * /api/routing-console/route` (`server/routing-console.ts`) runs. Additive
 * only: it adds a label and never removes one, so it refuses an issue that
 * already carries a priority label rather than giving it a second. Role
 * honesty (law 1): only the repository's own maintainer routes. The issue is
 * re-read when the route runs, never taken from the panel's last poll.
 */

import type { CliExec } from '../connection/cli-probe.js';
import { ghExec } from './gh-exec.js';
import { fetchIssueState, type MirrorPassIssueState } from './mirror-pass.js';
import { normalizeLabel } from './pool-client.js';
import { fetchViewerLogin } from './pr-review.js';
import { ROUTING_PRIORITY_LABELS, carriesPriorityLabel, projectRepoOf } from './routing-console.js';
import { resolveSocialIdentity } from './social-pass.js';

/** Why a route sent no label edit. `'identity-unresolved'` and `'guest'` are
 *  the mirror-pass execute gate's own names for law 1's two refusals. */
export type RouteIssueRefusal =
  | 'not-a-priority-label'
  | 'identity-unresolved'
  | 'guest'
  | 'issue-unreadable'
  | 'issue-closed'
  | 'already-prioritized';

/** What one route did. */
export interface RouteIssueResult {
  readonly issue: number;
  /** The house label as the taxonomy spells it, or as sent when it is none. */
  readonly label: string;
  /** The `owner/name` a project page's route acted on, its checkout's own
   *  `origin`. Absent when it acted on the repository `gh` resolves. */
  readonly repo?: string;
  readonly routed: boolean;
  readonly refusedReason?: RouteIssueRefusal;
  /** `gh`'s own words when the label edit itself failed. */
  readonly error?: string;
}

/** The routing console's write (injected) — see
 *  {@link createRoutingConsoleRouteApi}. `projectId` names the project page
 *  asking, and is omitted for the home page. */
export type RoutingConsoleRouteApi = (
  issue: number,
  label: string,
  projectId?: string,
) => Promise<RouteIssueResult>;

/** `label` as the house taxonomy spells it, when it is one of the priority
 *  labels in any casing (`pool-client.ts`'s `normalizeLabel`). */
export function housePriorityLabel(label: string): string | undefined {
  const wanted = normalizeLabel(label);
  return ROUTING_PRIORITY_LABELS.find((house) => normalizeLabel(house) === wanted);
}

/** {@link planRouteIssue}'s verdict: the label edit to send, or why none. */
export type RouteIssuePlan =
  | { readonly route: true; readonly argv: readonly string[] }
  | { readonly route: false; readonly refusedReason: RouteIssueRefusal };

/**
 * Decides one route from the issue as `gh` reads it now. `state` is null
 * when the read failed, and an unread issue is never routed. A closed issue
 * has left the queue, and one that already carries a priority label, in any
 * casing, is routed already: the console listed it as unrouted on a poll the
 * page has since moved past. `repo` (`owner/repo`) puts `--repo` on the edit;
 * without it the edit acts on the repository `gh` resolves.
 */
export function planRouteIssue(
  issue: number,
  label: string,
  state: MirrorPassIssueState | null,
  repo?: string,
): RouteIssuePlan {
  const house = housePriorityLabel(label);
  if (house === undefined) return { route: false, refusedReason: 'not-a-priority-label' };
  if (state === null) return { route: false, refusedReason: 'issue-unreadable' };
  if (state.state !== 'open') return { route: false, refusedReason: 'issue-closed' };
  if (carriesPriorityLabel(state.labels ?? [])) {
    return { route: false, refusedReason: 'already-prioritized' };
  }
  return {
    route: true,
    argv: [
      'issue',
      'edit',
      String(issue),
      '--add-label',
      house,
      ...(repo === undefined ? [] : ['--repo', repo]),
    ],
  };
}

/** Law 1 for the repository the route acts on. A project page's route acts
 *  on its own `repo`, whose owner is its maintainer, the same login-against-
 *  owner rule `social-pass.ts`'s `resolveSocialIdentity` applies to the
 *  repository `gh` resolves, which the home page's route acts on. */
async function routeRefusedByRole(
  exec: CliExec,
  repo: string | null,
): Promise<RouteIssueRefusal | undefined> {
  if (repo === null) {
    const identity = await resolveSocialIdentity(exec);
    if (identity === undefined) return 'identity-unresolved';
    return identity.role === 'maintainer' ? undefined : 'guest';
  }
  const login = await fetchViewerLogin(exec);
  if (login === undefined) return 'identity-unresolved';
  return repo.split('/')[0]?.toLowerCase() === login.toLowerCase() ? undefined : 'guest';
}

/**
 * Builds the routing console's write, defaulting to the fleet's guarded
 * `gh`. A label that is not a house priority label is refused before any
 * read. A project page's route is pinned to its checkout's own repository,
 * the one its console was read from (`readProjectRoutingConsole`); the home
 * page, an unknown project and one with no GitHub origin act on the
 * repository `gh` resolves. Then the role gate, a fresh read of the issue,
 * and at most one `gh issue edit --add-label`.
 */
export function createRoutingConsoleRouteApi(
  dbPath: string,
  exec: CliExec = ghExec,
): RoutingConsoleRouteApi {
  return async (issue, label, projectId) => {
    const house = housePriorityLabel(label);
    if (house === undefined) {
      return { issue, label, routed: false, refusedReason: 'not-a-priority-label' };
    }
    const repo = projectId === undefined ? null : await projectRepoOf(dbPath, projectId, exec);
    const pinned = repo ?? undefined;
    const base = { issue, label: house, ...(repo === null ? {} : { repo }) };
    const refusedByRole = await routeRefusedByRole(exec, repo);
    if (refusedByRole !== undefined) {
      return { ...base, routed: false, refusedReason: refusedByRole };
    }
    const state = await fetchIssueState(exec, issue, pinned);
    const plan = planRouteIssue(issue, house, state, pinned);
    if (!plan.route) return { ...base, routed: false, refusedReason: plan.refusedReason };
    const { code, stderr } = await exec('gh', plan.argv);
    if (code === 0) return { ...base, routed: true };
    return { ...base, routed: false, error: stderr?.trim() || `gh exited ${code}` };
  };
}
