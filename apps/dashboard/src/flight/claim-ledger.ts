// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE CLAIMS LEDGER — who holds a pool issue, since when, and whether the
 * claim is still alive (operator directive, 2026-09-13, after #27 was
 * claimed twice without a word of warning).
 *
 * Why a ledger and not the assignee: GitHub only lets a repo assign someone
 * who already has a footprint on the issue (a collaborator, or a commenter),
 * so an outside contributor's `--add-assignee` fails silently and only their
 * claim comment lands. Reading `assignees` alone then calls the issue free,
 * and the next claimant walks straight over the first. The comment is the
 * durable half of the claim, so the ledger reads BOTH: every claim comment
 * the pool client posts (`Claimed by <login> via the pool client` — the
 * exact sentence `pool-client.ts` writes, with `Also claimed` marking a
 * deliberate second claim) and every assignee, merged per login.
 *
 * A claim lives while it moves. The claimant's own later comments count as
 * activity (a progress note keeps the claim); anyone else's do not. Past
 * {@link CLAIM_WINDOW_DAYS} of quiet the claim is STALE: the next claimant
 * releases it inline, and the flight-end sweep (`post-flight-sweeps.ts`)
 * releases it on its own — the "system that really frees claims" the
 * operator asked for. A release note (`Releasing @login` / the reaper's
 * `Unassigning @login`) ends the claim in the ledger, so a freed issue
 * reads free again on the very next fetch.
 *
 * Pure: parses what `gh` already returns, never calls anything.
 */

import { STALE_TASK_DAYS } from '../web/task-queue.js';

/** Quiet days after which a claim releases — the same 14-day convention the
 *  board's STALE chip and the mirror pass reaper already use. */
export const CLAIM_WINDOW_DAYS = STALE_TASK_DAYS;

const DAY_MS = 24 * 60 * 60 * 1000;

/** One issue comment as the ledger reads it — author login, posting time,
 *  and the body to match claim/release sentences against. */
export interface IssueCommentLike {
  readonly author: string;
  readonly createdAt: number;
  readonly body: string;
}

/** One login's live claim on a pool issue. */
export interface PoolClaim {
  readonly login: string;
  /** When the claim comment was posted — `null` for an assignee the ledger
   *  never saw a claim comment from (the date is simply unknown). */
  readonly claimedAt: number | null;
  /** True when GitHub also lists this login as an assignee. */
  readonly assigned: boolean;
  /** The claimant's latest own comment (progress counts), else the claim
   *  itself; `null` when neither is known (assignee-only claim). */
  readonly lastActivityAt: number | null;
  /** True for a deliberate second claim ("Also claimed …") over a live one. */
  readonly contested: boolean;
}

/** The claim sentence `pool-client.ts` posts. `Also claimed` marks a
 *  deliberate second claim over a live one. The `@` is optional so a
 *  hand-written claim in the same words still counts. */
export const CLAIM_COMMENT_RE =
  /^(Also c|C)laimed by @?([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?) via the pool client/m;

/** A release sentence — the pool client's inline release or the mirror pass
 *  reaper's note — ends that login's claim. */
export const CLAIM_RELEASE_RE =
  /^(?:Releasing|Unassigning) @([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)/m;

/**
 * Derives every live claim on an issue from its assignees and comments.
 * Comments are walked oldest-first: a claim sentence opens (or renews) that
 * login's claim, a release sentence closes it, and any later comment by a
 * live claimant refreshes their activity. Assignees without a claim comment
 * are claims of unknown date. A login last released stays released even if
 * it is still in `assignees` — the reaper's release note lands before its
 * paired `--remove-assignee` call, so a failed unassign must not resurrect
 * the claim it just ended. Ordered oldest claim first, unknown dates first
 * (an assignee with no comment was almost certainly there earliest).
 */
export function claimLedger(
  assignees: readonly string[],
  comments: readonly IssueCommentLike[],
): readonly PoolClaim[] {
  const live = new Map<string, PoolClaim>();
  // Logins whose most recent comment event was a release, not yet reopened
  // by a later claim. GitHub's own assignee list can still name one of
  // these — the reaper posts its release note before the paired
  // `--remove-assignee` call, so a failed unassign leaves them assigned —
  // and the release note must win: it is the durable, deliberate half of
  // the claim, the raw assignee list is just what the API call happened to
  // manage.
  const released = new Set<string>();
  const ordered = [...comments].sort((a, b) => a.createdAt - b.createdAt);
  for (const comment of ordered) {
    const claim = CLAIM_COMMENT_RE.exec(comment.body);
    if (claim) {
      const login = claim[2] as string;
      released.delete(login);
      live.set(login, {
        login,
        claimedAt: comment.createdAt,
        assigned: false,
        lastActivityAt: comment.createdAt,
        contested: claim[1] === 'Also c',
      });
      continue;
    }
    const release = CLAIM_RELEASE_RE.exec(comment.body);
    if (release) {
      const login = release[1] as string;
      live.delete(login);
      released.add(login);
      continue;
    }
    const own = live.get(comment.author);
    if (own) live.set(comment.author, { ...own, lastActivityAt: comment.createdAt });
  }
  for (const login of assignees) {
    if (released.has(login)) continue;
    const known = live.get(login);
    live.set(
      login,
      known
        ? { ...known, assigned: true }
        : { login, claimedAt: null, assigned: true, lastActivityAt: null, contested: false },
    );
  }
  return [...live.values()].sort((a, b) => (a.claimedAt ?? 0) - (b.claimedAt ?? 0));
}

/** A claim measured against the clock: how long its holder has been quiet
 *  and when it releases. Serializable as-is — the browse endpoint sends it
 *  verbatim so the panel can say "held by @x since …, releases …". */
export interface ClaimStanding {
  readonly claim: PoolClaim;
  /** Whole days since the claimant's last own activity; `null` when the
   *  ledger has no date for the claim at all. */
  readonly quietDays: number | null;
  /** When the claim releases on its own; `null` when undated. */
  readonly releasesAt: number | null;
  /** True once the claim has been quiet for {@link CLAIM_WINDOW_DAYS}. An
   *  undated claim is never called stale — the ledger never guesses. */
  readonly stale: boolean;
}

/** Measures one claim at `nowMs`. */
export function claimStanding(
  claim: PoolClaim,
  nowMs: number,
  windowDays: number = CLAIM_WINDOW_DAYS,
): ClaimStanding {
  if (claim.lastActivityAt === null) {
    return { claim, quietDays: null, releasesAt: null, stale: false };
  }
  const quietDays = Math.max(0, Math.floor((nowMs - claim.lastActivityAt) / DAY_MS));
  return {
    claim,
    quietDays,
    releasesAt: claim.lastActivityAt + windowDays * DAY_MS,
    stale: quietDays >= windowDays,
  };
}

/** Every claim measured — the ledger the browse endpoint ships per issue. */
export function claimStandings(
  claims: readonly PoolClaim[],
  nowMs: number,
  windowDays: number = CLAIM_WINDOW_DAYS,
): readonly ClaimStanding[] {
  return claims.map((claim) => claimStanding(claim, nowMs, windowDays));
}
