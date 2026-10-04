// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Roadmap items (BOARD web-mtpzqrxl-z7jgbu, "COLLABORATION panel" — roadmap
 * items, help-wanted issues with claim state, my-claims): the read-only data
 * source the dashboard needs to show what the maestro is flying right now,
 * sourced from GitHub rather than re-parsed out of `docs/ROADMAP.md`'s
 * prose. The `roadmap` label (`flight/taxonomy-seed.ts`, "Tracks a
 * docs/ROADMAP.md direction item") already exists for exactly this, but
 * nothing reads it back yet. Ships {@link RoadmapItem} and the read wiring
 * {@link fetchRoadmapItems} — the same injectable `CliExec` `pool-client.ts`'s
 * `fetchPoolIssues` and `issue-triage.ts`'s `fetchOpenIssues` use, so this
 * stays deterministically testable without a real `gh` on PATH.
 *
 * Unlike the `pool: <dimension>` label family (`pool-client.ts`, which must
 * fetch every open issue and classify client-side because `gh issue list
 * --label` ANDs multiple labels together), `roadmap` is a single literal
 * label, so `--label roadmap` filters correctly server-side. {@link
 * isRoadmapItem} still re-checks it defensively rather than trusting that
 * filter blindly — the same fetch-then-classify belt-and-suspenders
 * `pool-client.ts`'s `isPoolIssue` applies to its own (necessarily
 * unfiltered) fetch. Read-only: never assigns, labels, or comments, only
 * lists.
 *
 * This is a data source only — the COLLABORATION panel's server route, UI,
 * and "my-claims" filter over pool issues are further slices of the same
 * board task.
 */

import type { CliExec } from '../connection/cli-probe.js';
import { MAX_ISSUE_LIST, parseIssueLabels, parseAssignees } from './issue-triage.js';
import { isMaintainerMarked } from './contributor-issue-list.js';
import { normalizeLabel } from './pool-client.js';
import { commentClaims } from './help-wanted-items.js';

/** The label `taxonomy-seed.ts` seeds for "tracks a docs/ROADMAP.md
 *  direction item" — the only label this module reads by. Read in any casing
 *  ({@link isRoadmapItem}): `gh issue list --label` runs a GitHub search,
 *  which matches a label name in any casing, and the seeder's `gh label create
 *  --force` keeps an existing label's casing, so a repo's label may read
 *  `Roadmap`. */
export const ROADMAP_LABEL = 'roadmap';

/** One open, `roadmap`-labeled GitHub issue — the subset `gh issue list`
 *  reports that the dashboard needs to show what's currently being flown
 *  and who (if anyone) is on it. */
export interface RoadmapItem {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly labels: readonly string[];
  readonly assignees: readonly string[];
  /** Logins holding the issue by a live claim comment alone, with no
   *  assignment behind it, oldest claim first: THE CLAIMS LEDGER
   *  (claim-ledger.ts) read the way the pool reads it, as the help-wanted
   *  group beside this one reads it (help-wanted-items.ts). A roadmap issue
   *  in the pool is claimed like any other, and an outside contributor's
   *  claim is often its comment alone, because the assign after it needs
   *  triage rights on the repo (#27). Present only when the ledger names
   *  someone {@link assignees} does not, so an issue with no such claim keeps
   *  the shape it always had. */
  readonly claimedByComment?: readonly string[];
}

/** True when `labels` carries the `roadmap` label, in any casing, compared
 *  the way the help-wanted group beside it and the maintainer's marks are
 *  (pool-client.ts normalizeLabel). */
export function isRoadmapItem(labels: readonly string[]): boolean {
  return labels.some((label) => normalizeLabel(label) === ROADMAP_LABEL);
}

/** True when nobody holds the item and the maintainer has declined it or put
 *  it on hold. The panel would show it as "Unclaimed" under "what the fleet is
 *  flying and what's open to claim", while the help-wanted group beside it
 *  (help-wanted-items.ts), the pool claim and the Good-first list all skip it
 *  (epic 0019 law 2: the maintainer's mark outranks a listing). A marked item
 *  someone holds stays listed: "Claimed by" is still true, and the holder's My
 *  claims filter still finds it. A claim comment holds it as an assignment
 *  does ({@link RoadmapItem.claimedByComment}). */
function isMarkedAndUnclaimed(item: RoadmapItem): boolean {
  const held = item.assignees.length > 0 || (item.claimedByComment ?? []).length > 0;
  return !held && isMaintainerMarked(item.labels);
}

/** One issue entry as `gh issue list --json number,title,url,labels,
 *  assignees,comments` emits it — untrusted process output, parsed
 *  defensively rather than trusted as already shaped like {@link
 *  RoadmapItem}. */
interface RawRoadmapItem {
  readonly number?: unknown;
  readonly title?: unknown;
  readonly url?: unknown;
  readonly labels?: unknown;
  readonly assignees?: unknown;
  readonly comments?: unknown;
}

/**
 * Lists every open issue carrying the `roadmap` label (up to
 * `MAX_ISSUE_LIST`) via `gh issue list --state open --label roadmap --json
 * number,title,url,labels,assignees,comments`, run through the injectable `exec` —
 * the same `CliExec` shape `issue-triage.ts`'s `fetchOpenIssues` and
 * `pool-client.ts`'s `fetchPoolIssues` use. Returns `[]` on a non-zero exit or
 * unparseable/non-array stdout rather than throwing — an empty roadmap is a
 * valid outcome, and a flaky `gh` call shouldn't crash the read. Rows that
 * are not objects (a `null` included) and entries missing a numeric
 * `number`, string `title`, or string `url` are dropped rather than passed
 * through malformed — a single bad row must not throw, because
 * `collaboration.ts` composes this read with `help-wanted-items.ts`'s and a
 * throw there would blank both panels. The comments are read for the claims
 * ledger alone, the fields `pool-client.ts`'s `fetchPoolIssues` asks for: a
 * claim held only by its comment rides {@link RoadmapItem.claimedByComment},
 * so the panel says who holds it. An issue nobody holds that the maintainer
 * has declined or put on hold is dropped ({@link isMarkedAndUnclaimed}).
 */
export async function fetchRoadmapItems(exec: CliExec): Promise<RoadmapItem[]> {
  const { code, stdout } = await exec('gh', [
    'issue',
    'list',
    '--state',
    'open',
    '--label',
    ROADMAP_LABEL,
    '--limit',
    String(MAX_ISSUE_LIST),
    '--json',
    'number,title,url,labels,assignees,comments',
  ]);
  if (code !== 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return (parsed as unknown[])
    .filter((raw): raw is RawRoadmapItem => typeof raw === 'object' && raw !== null)
    .filter(
      (raw) =>
        typeof raw.number === 'number' &&
        typeof raw.title === 'string' &&
        typeof raw.url === 'string',
    )
    .map((raw) => {
      const assignees = parseAssignees(raw.assignees);
      return {
        number: raw.number as number,
        title: raw.title as string,
        url: raw.url as string,
        labels: parseIssueLabels(raw.labels),
        assignees,
        ...commentClaims(assignees, raw.comments),
      };
    })
    .filter((item) => isRoadmapItem(item.labels) && !isMarkedAndUnclaimed(item));
}
