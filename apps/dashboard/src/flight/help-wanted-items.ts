// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Help-wanted items (BOARD web-mtpzqrxl-z7jgbu, "COLLABORATION panel" —
 * roadmap items [shipped, `roadmap-items.ts`], help-wanted issues with claim
 * state, my-claims), slice 2: the read-only data source for GitHub's
 * `help wanted` default label, WITH its assignee carried through as the
 * issue's claim state. This deliberately does NOT reuse
 * `contributor-issue-list.ts`'s `fetchContributorFacingIssues` — that read
 * exists for a visiting contributor's pick list and drops already-assigned
 * issues outright (`planContributorIssueList`'s `if (issue.assignees.length
 * > 0) continue`), the opposite of what a maestro's own "who does what"
 * panel needs, which wants precisely the assignee shown. Ships {@link
 * HelpWantedItem} and the read wiring {@link fetchHelpWantedItems} — the
 * same injectable `CliExec` `roadmap-items.ts`'s `fetchRoadmapItems` and
 * `pool-client.ts`'s `fetchPoolIssues` use, so this stays deterministically
 * testable without a real `gh` on PATH.
 *
 * `help wanted` is a single literal label like `roadmap`, not the
 * `pool: <dimension>` family, so `--label` filters correctly server-side
 * (`roadmap-items.ts`'s own reasoning) — unlike `contributor-issue-list.ts`,
 * which ORs `good first issue`/`help wanted` and so cannot use `--label` at
 * all. {@link isHelpWantedItem} still re-checks it defensively rather than
 * trusting that filter blindly, the same belt-and-suspenders
 * `roadmap-items.ts`'s `isRoadmapItem` applies, and normalizes casing/hyphen
 * spelling the way `contributor-issue-list.ts`'s own `normalizeLabel` does —
 * `help wanted` is a GitHub *default* label, not one this repo's own
 * `taxonomy-seed.ts` seeds, so its exact spelling is never guaranteed.
 * Read-only: never assigns, labels, or comments, only lists.
 *
 * This is a data source only — the COLLABORATION panel's server route, UI,
 * and "my-claims" filter are further slices of the same board task (see
 * `roadmap-items.ts`'s header for the same note on its own slice).
 */

import type { CliExec } from '../connection/cli-probe.js';
import { parseIssueLabels, parseAssignees } from './issue-triage.js';

/** GitHub's default "help wanted" label — the only label this module reads
 *  by. Not seeded by this repo's own `taxonomy-seed.ts` (a GitHub default,
 *  not a locally-defined one), so {@link isHelpWantedItem} normalizes
 *  casing/hyphenation rather than trusting an exact string match. */
export const HELP_WANTED_LABEL = 'help wanted';

/** One open, `help wanted`-labeled GitHub issue — the subset `gh issue list`
 *  reports that the dashboard needs to show what's up for grabs (or already
 *  claimed, and by whom) right now. */
export interface HelpWantedItem {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly labels: readonly string[];
  readonly assignees: readonly string[];
}

/** Lowercases and folds hyphens to spaces — the same normalization
 *  `contributor-issue-list.ts`'s own `normalizeLabel` applies, so
 *  `Help-Wanted`/`HELP WANTED`/`help wanted` all match the one label this
 *  module cares about. */
function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/-/g, ' ').trim();
}

/** True when `labels` carries the `help wanted` label, in any casing or
 *  hyphenation. */
export function isHelpWantedItem(labels: readonly string[]): boolean {
  return labels.some((label) => normalizeLabel(label) === HELP_WANTED_LABEL);
}

/** One issue entry as `gh issue list --json number,title,url,labels,
 *  assignees` emits it — untrusted process output, parsed defensively
 *  rather than trusted as already shaped like {@link HelpWantedItem}. */
interface RawHelpWantedItem {
  readonly number?: unknown;
  readonly title?: unknown;
  readonly url?: unknown;
  readonly labels?: unknown;
  readonly assignees?: unknown;
}

/**
 * Lists every open issue carrying the `help wanted` label via `gh issue list
 * --state open --label "help wanted" --json number,title,url,labels,
 * assignees`, run through the injectable `exec` — the same `CliExec` shape
 * `roadmap-items.ts`'s `fetchRoadmapItems` and `pool-client.ts`'s
 * `fetchPoolIssues` use. Returns `[]` on a non-zero exit or
 * unparseable/non-array stdout rather than throwing — no open help-wanted
 * issues is a valid outcome, and a flaky `gh` call shouldn't crash the read.
 * Entries missing a numeric `number`, string `title`, or string `url` are
 * dropped rather than passed through malformed, the same defensive shape
 * `roadmap-items.ts`'s `fetchRoadmapItems` uses. Assignees are carried
 * through as-is (including empty) rather than filtered — the caller's claim
 * state, unlike `contributor-issue-list.ts`'s pick list, which drops
 * already-assigned issues instead.
 */
export async function fetchHelpWantedItems(exec: CliExec): Promise<HelpWantedItem[]> {
  const { code, stdout } = await exec('gh', [
    'issue',
    'list',
    '--state',
    'open',
    '--label',
    HELP_WANTED_LABEL,
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

  return (parsed as RawHelpWantedItem[])
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
    .filter((item) => isHelpWantedItem(item.labels));
}
