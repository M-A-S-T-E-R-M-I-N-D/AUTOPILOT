// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Publicity affordances (BOARD web-mss50iak-g176g8, "PLATFORM 7/7 - page
 * upkeep + publicity"). Epic 0007's own wording: "Publicity affordances for
 * the public-day: repo links, watch/star/discussion links — surfaced
 * in-app, dormant while private." Ships the pure decision core —
 * {@link fetchRepoIdentity} (the same injectable `CliExec` wiring
 * `pool-client.ts`'s `fetchPoolIssues` and `pr-review.ts`'s
 * `fetchViewerLogin` use, so this stays deterministically testable without a
 * real `gh` on PATH) and {@link planPublicityAffordances}, which decides
 * every affordance's dormant state and reasoning off `gh`-reported facts
 * only (`isPrivate`), never a guess. An unresolved repo identity (`gh` not
 * present, not authenticated, or no remote configured) fails the same way a
 * private repo does — dormant, with its own reasoning — since "surfaced,
 * but inert" is the honest state either way, matching the fail-closed
 * convention `pool-client.ts`'s `planPoolBrowseBatch` uses for an
 * unresolved viewer login — and {@link createPublicityPreviewApi}, the
 * `GET /api/publicity` read `server.ts` wires (mirrors `pool-client-
 * execute.ts`'s `createPoolClientPreviewApi`: same injectable-`exec`-with-a-
 * real-default shape, degrading to the same dormant-with-reasoning verdict
 * on a resolution failure rather than a second error path). The operator
 * panel is `web/publicity-panel.ts`, embedded via `web/shell.ts`.
 */

import { realCliExec, type CliExec } from '../connection/cli-probe.js';

/** The subset of `gh repo view`'s JSON output a publicity decision needs. */
export interface RepoIdentity {
  readonly nameWithOwner: string;
  readonly url: string;
  readonly isPrivate: boolean;
}

/**
 * Resolves the current repo's GitHub identity via `gh repo view --json
 * nameWithOwner,url,isPrivate`, run through the injectable `exec`.
 * Read-only: never mutates anything. Returns `undefined` on a non-zero
 * exit, unparseable stdout, or a payload missing any of the three fields —
 * the same "skip, don't guess" degradation `pr-review.ts`'s
 * `fetchViewerLogin` uses for an unresolved identity.
 */
export async function fetchRepoIdentity(exec: CliExec): Promise<RepoIdentity | undefined> {
  const { code, stdout } = await exec('gh', [
    'repo',
    'view',
    '--json',
    'nameWithOwner,url,isPrivate',
  ]);
  if (code !== 0) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;

  const raw = parsed as { nameWithOwner?: unknown; url?: unknown; isPrivate?: unknown };
  if (
    typeof raw.nameWithOwner !== 'string' ||
    raw.nameWithOwner === '' ||
    typeof raw.url !== 'string' ||
    raw.url === '' ||
    typeof raw.isPrivate !== 'boolean'
  ) {
    return undefined;
  }
  return { nameWithOwner: raw.nameWithOwner, url: raw.url, isPrivate: raw.isPrivate };
}

/** One publicity affordance's identity, display label, and target URL —
 *  every affordance points at the repo's own page except `discussions`,
 *  which GitHub hosts at its own path; `watch` and `star` are both actions
 *  taken ON the repo page itself (GitHub has no separate deep-link page for
 *  either), so both point straight at it. */
const AFFORDANCE_DEFS: readonly {
  readonly id: 'repo' | 'watch' | 'star' | 'discussions';
  readonly label: string;
  readonly path: string;
}[] = [
  { id: 'repo', label: 'View repo', path: '' },
  { id: 'watch', label: 'Watch', path: '' },
  { id: 'star', label: 'Star', path: '' },
  { id: 'discussions', label: 'Discussions', path: '/discussions' },
];

/** One publicity affordance's computed display state — always present
 *  ("surfaced in-app"), with `dormant: true` while it should render
 *  disabled. */
export interface PublicityAffordance {
  readonly id: 'repo' | 'watch' | 'star' | 'discussions';
  readonly label: string;
  readonly url: string;
  readonly dormant: boolean;
  readonly reasoning: string;
}

/**
 * Decides every publicity affordance's dormant state and URL for `repo`.
 * `repo === undefined` (identity not resolved) dormants every affordance
 * with a `href="#"` placeholder and a reasoning naming the unresolved
 * identity; `repo.isPrivate` dormants every affordance at the repo's real
 * URL with a reasoning naming the epic's own "dormant while private"
 * doctrine; a public repo's affordances are all live. Pure: no I/O, no
 * `gh`, so this is trivially unit-testable independent of {@link
 * fetchRepoIdentity}'s wiring.
 */
export function planPublicityAffordances(
  repo: RepoIdentity | undefined,
): readonly PublicityAffordance[] {
  if (repo === undefined) {
    return AFFORDANCE_DEFS.map(({ id, label }) => ({
      id,
      label,
      url: '#',
      dormant: true,
      reasoning: 'GitHub repo identity unavailable — connect gh to enable',
    }));
  }
  const dormant = repo.isPrivate;
  const reasoning = dormant
    ? `${repo.nameWithOwner} is private — publicity affordances stay dormant until it goes public`
    : `${repo.nameWithOwner} is public — publicity affordances are live`;
  return AFFORDANCE_DEFS.map(({ id, label, path }) => ({
    id,
    label,
    url: repo.url + path,
    dormant,
    reasoning,
  }));
}

/** The publicity preview read `GET /api/publicity` wires — composes {@link
 *  fetchRepoIdentity} and {@link planPublicityAffordances} behind one call. */
export type PublicityPreviewApi = () => Promise<readonly PublicityAffordance[]>;

/**
 * Builds the publicity preview read, defaulting to the real `gh` CLI like
 * `pool-client-execute.ts`'s `createPoolClientPreviewApi` does. Never
 * rejects: an `exec` failure (a thrown error, not just a non-zero exit —
 * {@link fetchRepoIdentity} already degrades that to `undefined`) still
 * resolves to the unresolved-identity affordance set instead of crashing the
 * route, the same fail-closed stance the identity resolution itself takes.
 */
export function createPublicityPreviewApi(exec: CliExec = realCliExec): PublicityPreviewApi {
  return async () => {
    try {
      return planPublicityAffordances(await fetchRepoIdentity(exec));
    } catch {
      return planPublicityAffordances(undefined);
    }
  };
}
