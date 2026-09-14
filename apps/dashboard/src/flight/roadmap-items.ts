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
import { parseIssueLabels, parseAssignees } from './issue-triage.js';

/** The label `taxonomy-seed.ts` seeds for "tracks a docs/ROADMAP.md
 *  direction item" — the only label this module reads by. */
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
}

/** True when `labels` carries the `roadmap` label. */
export function isRoadmapItem(labels: readonly string[]): boolean {
  return labels.includes(ROADMAP_LABEL);
}

/** One issue entry as `gh issue list --json number,title,url,labels,
 *  assignees` emits it — untrusted process output, parsed defensively
 *  rather than trusted as already shaped like {@link RoadmapItem}. */
interface RawRoadmapItem {
  readonly number?: unknown;
  readonly title?: unknown;
  readonly url?: unknown;
  readonly labels?: unknown;
  readonly assignees?: unknown;
}

/**
 * Lists every open issue carrying the `roadmap` label via `gh issue list
 * --state open --label roadmap --json number,title,url,labels,assignees`,
 * run through the injectable `exec` — the same `CliExec` shape
 * `issue-triage.ts`'s `fetchOpenIssues` and `pool-client.ts`'s
 * `fetchPoolIssues` use. Returns `[]` on a non-zero exit or
 * unparseable/non-array stdout rather than throwing — an empty roadmap is a
 * valid outcome, and a flaky `gh` call shouldn't crash the read. Entries
 * missing a numeric `number`, string `title`, or string `url` are dropped
 * rather than passed through malformed, the same defensive shape
 * `pool-client.ts`'s `fetchPoolIssues` uses.
 */
export async function fetchRoadmapItems(exec: CliExec): Promise<RoadmapItem[]> {
  const { code, stdout } = await exec('gh', [
    'issue',
    'list',
    '--state',
    'open',
    '--label',
    ROADMAP_LABEL,
    '--json',
    'number,title,url,labels,assignees',
  ]);
  if (code !== 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return (parsed as RawRoadmapItem[])
    .filter(
      (raw) =>
        typeof raw.number === 'number' &&
        typeof raw.title === 'string' &&
        typeof raw.url === 'string',
    )
    .map((raw) => ({
      number: raw.number as number,
      title: raw.title as string,
      url: raw.url as string,
      labels: parseIssueLabels(raw.labels),
      assignees: parseAssignees(raw.assignees),
    }))
    .filter((item) => isRoadmapItem(item.labels));
}
