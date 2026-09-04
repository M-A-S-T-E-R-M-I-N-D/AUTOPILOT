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

/** The subset of `gh repo view`'s JSON output a publicity decision needs.
 *  The three counts are OPTIONAL by contract: a `gh` old enough to not know
 *  a field, or a payload missing one, still resolves a usable identity —
 *  the affordance links must never go dormant because a nice-to-have number
 *  didn't parse. */
export interface RepoIdentity {
  readonly nameWithOwner: string;
  readonly url: string;
  readonly isPrivate: boolean;
  readonly stars?: number | undefined;
  readonly watchers?: number | undefined;
  readonly forks?: number | undefined;
}

/** A count is display-worthy only when it's a real non-negative finite
 *  number — anything else degrades to `undefined` (render no badge), never
 *  to an error. */
function countOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
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
    'nameWithOwner,url,isPrivate,stargazerCount,watchers,forkCount',
  ]);
  if (code !== 0) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;

  const raw = parsed as {
    nameWithOwner?: unknown;
    url?: unknown;
    isPrivate?: unknown;
    stargazerCount?: unknown;
    watchers?: unknown;
    forkCount?: unknown;
  };
  if (
    typeof raw.nameWithOwner !== 'string' ||
    raw.nameWithOwner === '' ||
    typeof raw.url !== 'string' ||
    raw.url === '' ||
    typeof raw.isPrivate !== 'boolean'
  ) {
    return undefined;
  }
  // gh nests the watcher count (`watchers: { totalCount: N }`) but flattens
  // stars/forks — mirror its shapes exactly, degrading each to undefined
  // independently so one malformed count never hides the other two.
  const watchersRaw =
    typeof raw.watchers === 'object' && raw.watchers !== null
      ? (raw.watchers as { totalCount?: unknown }).totalCount
      : undefined;
  return {
    nameWithOwner: raw.nameWithOwner,
    url: raw.url,
    isPrivate: raw.isPrivate,
    stars: countOf(raw.stargazerCount),
    watchers: countOf(watchersRaw),
    forks: countOf(raw.forkCount),
  };
}

/** One publicity affordance's identity, display label, target URL, and
 *  which {@link RepoIdentity} count it wears as its in-page badge. Every
 *  affordance deep-links to its OWN page — the operator caught all four
 *  landing on the repo root: GitHub really does host `/subscription` (the
 *  watch-level chooser) and `/stargazers` (the star roll, star button in
 *  its header), so `watch`/`star` go there, not to a duplicate of `repo`. */
const AFFORDANCE_DEFS: readonly {
  readonly id: 'repo' | 'watch' | 'star' | 'discussions';
  readonly label: string;
  readonly path: string;
  readonly countOfRepo: (repo: RepoIdentity) => number | undefined;
}[] = [
  { id: 'repo', label: 'View repo', path: '', countOfRepo: (repo) => repo.forks },
  { id: 'watch', label: 'Watch', path: '/subscription', countOfRepo: (repo) => repo.watchers },
  { id: 'star', label: 'Star', path: '/stargazers', countOfRepo: (repo) => repo.stars },
  { id: 'discussions', label: 'Discussions', path: '/discussions', countOfRepo: () => undefined },
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
  /** The affordance's live GitHub count (stars for `star`, watchers for
   *  `watch`, forks for `repo`) rendered as an in-page badge — the first
   *  slice of "bring the content here instead of only linking out".
   *  Absent when the identity fetch couldn't produce it. */
  readonly count?: number | undefined;
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
  return AFFORDANCE_DEFS.map(({ id, label, path, countOfRepo }) => ({
    id,
    label,
    url: repo.url + path,
    dormant,
    reasoning,
    count: countOfRepo(repo),
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
