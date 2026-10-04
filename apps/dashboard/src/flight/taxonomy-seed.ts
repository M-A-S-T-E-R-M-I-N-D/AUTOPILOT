// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0019 "GitHub Steward" slice 1 (docs/epics/0019-github-steward.md,
 * board web-mtrh1hjq-760dic): the taxonomy seeder ritual. Stamps the house
 * label scheme + a starter milestone set onto any repo the acting identity
 * owns — idempotent (`gh label create --force` upserts a label every run;
 * a milestone already present by title is left alone, never duplicated or
 * overwritten). Role-gated through `social-pass.ts`'s
 * `resolveSocialIdentity` (epic law 1, inherited from epic 0016 law 5): a
 * guest identity gets a plan with zero actions and a `skippedReason`,
 * never a write attempt against a repo it does not own. The taxonomy
 * itself (which labels, which milestones, and why) is documented in
 * docs/GOVERNANCE.md, cited from this module rather than redefined by it —
 * this ritual applies that doc, it is not a second place to edit the
 * scheme.
 *
 * Same pure-planner-plus-injectable-executor seam `mirror-pass.ts` and
 * `social-pass.ts` already use: {@link planTaxonomySeed} is deterministic
 * and I/O-free, {@link executeTaxonomySeed} is the only thing that shells
 * out, and {@link runTaxonomySeed} composes resolve → fetch existing →
 * plan → execute behind one call, skipping every read/write entirely for
 * an identity that cannot act as maintainer here (never a doomed `gh` call
 * against a repo the viewer doesn't own).
 */

import type { CliExec } from '../connection/cli-probe.js';
import { ghExec } from './gh-exec.js';
import { resolveSocialIdentity, type SocialIdentity } from './social-pass.js';

export interface TaxonomyLabel {
  readonly name: string;
  readonly color: string;
  readonly description: string;
}

export interface TaxonomyMilestone {
  readonly title: string;
  readonly description: string;
}

/** The house label scheme (docs/GOVERNANCE.md is the source of truth this
 *  constant transcribes): priority + area + status groups, the `epic`
 *  marker, and the community set. Deliberately excludes GitHub's own stock
 *  defaults (`bug`, `enhancement`, ...) and the separate `pool: *` set,
 *  which already has its own sync mechanism (.github/labels.json +
 *  .github/workflows/labels.yml) — this scheme is additive to both, never
 *  a second source of truth for either. */
export const HOUSE_TAXONOMY_LABELS: readonly TaxonomyLabel[] = [
  {
    name: 'priority: critical',
    color: 'b60205',
    description: 'Drop everything — safety or data-loss class',
  },
  {
    name: 'priority: high',
    color: 'd93f0b',
    description: 'Next up — blocks a milestone or a user',
  },
  { name: 'priority: medium', color: 'fbca04', description: 'Scheduled — normal queue order' },
  {
    name: 'priority: low',
    color: 'c2e0c6',
    description: 'Nice to have — when the queue clears',
  },
  { name: 'area: dashboard', color: '1d76db', description: 'Web cockpit UI/UX' },
  {
    name: 'area: flight-engine',
    color: '0e4b8a',
    description: 'Firings, gates, landing, fleet orchestration',
  },
  {
    name: 'area: foundation',
    color: '8250df',
    description: 'Donations, transparency, the Foundation surface',
  },
  { name: 'area: ci', color: '000000', description: 'Gates, scanners, workflows' },
  { name: 'area: i18n', color: '006b75', description: 'Localization and RTL' },
  {
    name: 'area: community',
    color: 'c5def5',
    description: 'Contributors, claims, collaboration protocol',
  },
  {
    name: 'status: awaiting-human',
    color: 'f9d0c4',
    description: 'Waiting on an operator/maintainer decision by design',
  },
  {
    name: 'status: blocked',
    color: 'e4e669',
    description: 'Cannot proceed — blocker named in a comment',
  },
  {
    // The issue protocol gate's label (issue-triage.ts, NEEDS_FORMAT_LABEL):
    // `gh issue edit --add-label` resolves the NAME against the repo's live
    // labels and fails the whole edit on an unknown one, so the gate could
    // not fire until this seeded it (board web-mtxey8h4-6z9g5o).
    name: 'status: needs-format',
    color: 'fef2c0',
    description:
      'Filed off the issue template — KEEPER named the missing sections; lifts once the body conforms',
  },
  {
    name: 'epic',
    color: '3e1046',
    description: 'Multi-slice initiative with its own doc under docs/epics/',
  },
  {
    name: 'claimed',
    color: '0e8a16',
    description: 'Publicly claimed via /claim — one assignee ever',
  },
  {
    name: 'declined',
    color: 'd93f0b',
    description: 'Triaged and declined — the reason is in a comment',
  },
  { name: 'roadmap', color: '1d76db', description: 'Tracks a docs/ROADMAP.md direction item' },
  {
    name: 'agent-ok',
    color: 'c5def5',
    description: 'A disclosed AUTOPILOT instance of an Active partner may work this (under caps)',
  },
  {
    name: 'partner-application',
    color: '8250df',
    description:
      'Active-partner standing application — KEEPER attaches a dossier, the maintainer decides in the open',
  },
  {
    // The dossier ritual's idempotency marker (contributor-dossier.ts,
    // DOSSIER_POSTED_LABEL): added by name before the dossier comment, so an
    // unseeded name failed the edit and later KEEPER passes re-posted.
    name: 'dossier-posted',
    color: 'd4c5f9',
    description: 'KEEPER posted its evidence dossier here — later passes skip this application',
  },
];

/** A generic starter set — bootstrapping structure for a fresh repo, never
 *  this (or any) project's own hand-authored initiatives (docs/GOVERNANCE.md
 *  covers that distinction). Left alone once a same-titled milestone
 *  already exists: unlike labels, GitHub milestones have no `--force`
 *  upsert, and a maintainer may have already edited its description — this
 *  ritual only ever fills a gap, never overwrites a human's edit. */
export const HOUSE_STARTER_MILESTONES: readonly TaxonomyMilestone[] = [
  {
    title: 'Foundations',
    description: 'Core scaffolding, CI/gate, and initial architecture in place.',
  },
  { title: 'V1', description: 'First user-facing release — the MVP surface.' },
  {
    title: 'Hardening',
    description: 'Security, accessibility, and performance passes before wider release.',
  },
];

export type TaxonomySeedAction =
  | { readonly kind: 'create-label' | 'update-label'; readonly label: TaxonomyLabel }
  | { readonly kind: 'create-milestone'; readonly milestone: TaxonomyMilestone };

export type TaxonomySeedSkipReason = 'identity-unresolved' | 'guest';

/** The planner's verdict: `actions` a maintainer identity may apply now,
 *  or an empty plan plus `skippedReason` when role honesty (epic law 1)
 *  forbids writing at all. */
export interface TaxonomySeedPlan {
  readonly identity: SocialIdentity | undefined;
  readonly actions: readonly TaxonomySeedAction[];
  readonly skippedReason?: TaxonomySeedSkipReason;
}

/** How one run is narrowed (board ap-musvu2h1-2). `labelsOnly` leaves the
 *  starter milestones out of the plan, for a repo that already carries
 *  milestones of its own: without it a re-seed creates the generic set
 *  next to them (debrief 2026-10-03-verdict-ap-mui04ldw-0). `dryRun` reads
 *  the live repo and plans, but writes nothing. */
export interface TaxonomySeedOptions {
  readonly labelsOnly?: boolean;
  readonly dryRun?: boolean;
}

/** Pure planner (epic law 1, role honesty): a guest identity — or one that
 *  failed to resolve at all — gets a plan with zero actions and a
 *  `skippedReason`, never a write attempt against a repo it does not own.
 *  A maintainer identity gets the full label set every time (labels are
 *  `--force` upserts, so re-planning an already-seeded repo is cheap and
 *  harmless — idempotent per the epic's own wording) plus only the
 *  starter milestones not already present by title, unless `labelsOnly`
 *  asks for none of them.
 *
 *  A label counts as existing in any casing: GitHub keeps one label per
 *  name in any casing and `--force` upserts onto it, so a repo's
 *  `Priority: High` is the label a seed of `priority: high` overwrites, and
 *  the dry run must say so. */
export function planTaxonomySeed(
  identity: SocialIdentity | undefined,
  existingLabelNames: ReadonlySet<string>,
  existingMilestoneTitles: ReadonlySet<string>,
  options: Pick<TaxonomySeedOptions, 'labelsOnly'> = {},
): TaxonomySeedPlan {
  if (identity === undefined) {
    return { identity: undefined, actions: [], skippedReason: 'identity-unresolved' };
  }
  if (identity.role !== 'maintainer') {
    return { identity, actions: [], skippedReason: 'guest' };
  }
  const existing = new Set([...existingLabelNames].map((name) => name.toLowerCase()));
  const labelActions: TaxonomySeedAction[] = HOUSE_TAXONOMY_LABELS.map((label) => ({
    kind: existing.has(label.name.toLowerCase()) ? 'update-label' : 'create-label',
    label,
  }));
  if (options.labelsOnly === true) return { identity, actions: labelActions };
  const milestoneActions: TaxonomySeedAction[] = HOUSE_STARTER_MILESTONES.filter(
    (milestone) => !existingMilestoneTitles.has(milestone.title),
  ).map((milestone) => ({ kind: 'create-milestone' as const, milestone }));
  return { identity, actions: [...labelActions, ...milestoneActions] };
}

/** The CLI flags `taxonomy-seed` accepts, and the option each one sets. */
const TAXONOMY_SEED_FLAGS: Readonly<Record<string, keyof TaxonomySeedOptions>> = {
  '--labels-only': 'labelsOnly',
  '--dry-run': 'dryRun',
};

export type TaxonomySeedArgs =
  | { readonly ok: true; readonly options: TaxonomySeedOptions }
  | { readonly ok: false; readonly unknown: string };

/** Reads `taxonomy-seed`'s arguments. Anything it does not know is refused
 *  rather than ignored: a mistyped `--dry-run` must never fall through to a
 *  run that writes to GitHub. */
export function parseTaxonomySeedArgs(args: readonly string[]): TaxonomySeedArgs {
  let options: TaxonomySeedOptions = {};
  for (const arg of args) {
    const option = TAXONOMY_SEED_FLAGS[arg];
    if (option === undefined) return { ok: false, unknown: arg };
    options = { ...options, [option]: true };
  }
  return { ok: true, options };
}

/** The most labels one `gh label list` read asks for. With no `--limit`, gh
 *  quietly returns its default 30, oldest first, so on a repo carrying more
 *  than that every house label created after the thirtieth read as missing
 *  and was planned as a `create-label`. Same fix `issue-triage.ts`'s
 *  `MAX_ISSUE_LIST` made for `gh issue list`. */
export const MAX_LABEL_LIST = 1000;

/** `gh label list`'s live names on the current repo (up to
 *  {@link MAX_LABEL_LIST}) — fails closed to an
 *  empty set on a non-zero exit, unparseable stdout, a non-array payload,
 *  or an entry missing `name` (never blocks planning: a `gh` failure here
 *  just makes every label look "new", which `--force` makes harmless). */
export async function fetchExistingLabelNames(exec: CliExec): Promise<ReadonlySet<string>> {
  const { code, stdout } = await exec('gh', [
    'label',
    'list',
    '--limit',
    String(MAX_LABEL_LIST),
    '--json',
    'name',
  ]);
  if (code !== 0) return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return new Set();
  }
  if (!Array.isArray(parsed)) return new Set();
  const names: string[] = [];
  for (const raw of parsed) {
    if (typeof raw !== 'object' || raw === null) continue;
    const name = (raw as { name?: unknown }).name;
    if (typeof name === 'string') names.push(name);
  }
  return new Set(names);
}

/** Milestones per page of the milestone read: the REST endpoint's maximum
 *  (docs.github.com/en/rest/issues/milestones, `per_page` "Default: 30"). */
export const MILESTONE_PAGE_SIZE = 100;

/** The most pages the milestone read walks — 1000 milestones, the same
 *  ceiling {@link MAX_LABEL_LIST} puts on the label read. */
export const MAX_MILESTONE_PAGES = 10;

/** One page of the milestone list in `state` (every milestone by default),
 *  or `undefined` on a non-zero exit, unparseable stdout or a non-array
 *  payload. Exported for `routing-console.ts`'s open-milestone read. */
export async function fetchMilestonePage(
  exec: CliExec,
  page: number,
  state: 'all' | 'open' = 'all',
): Promise<unknown[] | undefined> {
  const { code, stdout } = await exec('gh', [
    'api',
    `repos/{owner}/{repo}/milestones?state=${state}&per_page=${MILESTONE_PAGE_SIZE}&page=${page}`,
  ]);
  if (code !== 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  return Array.isArray(parsed) ? parsed : undefined;
}

/** `gh api .../milestones?state=all`'s live titles on the current repo —
 *  both states so a closed milestone from a prior seed is never
 *  recreated. Pages forward until a short page (at most
 *  {@link MAX_MILESTONE_PAGES}): one `per_page=100` read was the first
 *  hundred milestones only, so on a repo past that a starter milestone on
 *  a later page read as missing and was planned as a create again. Fails
 *  closed to an empty set the same way {@link fetchExistingLabelNames}
 *  does — a failed page fails the whole read, never a partial one. */
export async function fetchExistingMilestoneTitles(exec: CliExec): Promise<ReadonlySet<string>> {
  const titles: string[] = [];
  for (let page = 1; page <= MAX_MILESTONE_PAGES; page += 1) {
    const rows = await fetchMilestonePage(exec, page);
    if (rows === undefined) return new Set();
    for (const raw of rows) {
      if (typeof raw !== 'object' || raw === null) continue;
      const title = (raw as { title?: unknown }).title;
      if (typeof title === 'string') titles.push(title);
    }
    if (rows.length < MILESTONE_PAGE_SIZE) break;
  }
  return new Set(titles);
}

export interface TaxonomySeedResult {
  readonly applied: readonly TaxonomySeedAction[];
  readonly failed: readonly TaxonomySeedAction[];
}

async function applyOne(exec: CliExec, action: TaxonomySeedAction): Promise<boolean> {
  if (action.kind === 'create-milestone') {
    const { code } = await exec('gh', [
      'api',
      'repos/{owner}/{repo}/milestones',
      '-f',
      `title=${action.milestone.title}`,
      '-f',
      `description=${action.milestone.description}`,
    ]);
    return code === 0;
  }
  const { code } = await exec('gh', [
    'label',
    'create',
    action.label.name,
    '--color',
    action.label.color,
    '--description',
    action.label.description,
    '--force',
  ]);
  return code === 0;
}

/** Applies a plan's actions in order, one `gh` call each — never throws; a
 *  failed action lands in `failed` rather than aborting the rest (a
 *  transient failure on label #3 must not skip labels #4-20). */
export async function executeTaxonomySeed(
  exec: CliExec,
  plan: TaxonomySeedPlan,
): Promise<TaxonomySeedResult> {
  const applied: TaxonomySeedAction[] = [];
  const failed: TaxonomySeedAction[] = [];
  for (const action of plan.actions) {
    const ok = await applyOne(exec, action);
    (ok ? applied : failed).push(action);
  }
  return { applied, failed };
}

export interface TaxonomySeedReport {
  readonly plan: TaxonomySeedPlan;
  /** `undefined` when the plan has zero actions (guest, or unresolved
   *  identity) or the run was a dry run — nothing was executed, so there
   *  is no result to report. */
  readonly result: TaxonomySeedResult | undefined;
}

/** Composes resolve → fetch existing → plan → execute behind one call —
 *  the injectable-`exec`-with-a-real-default seam `social-pass.ts`'s
 *  `fetchSocialPassReport` already establishes. Skips both existing-state
 *  reads entirely once identity resolution rules out a maintainer write
 *  (unresolved, or a guest) — there is nothing to plan against a repo this
 *  identity cannot act on — and the milestone read under `labelsOnly`,
 *  whose plan has no milestone in it. A `dryRun` stops after the plan. */
export async function runTaxonomySeed(
  exec: CliExec = ghExec,
  options: TaxonomySeedOptions = {},
): Promise<TaxonomySeedReport> {
  const identity = await resolveSocialIdentity(exec);
  if (identity === undefined || identity.role !== 'maintainer') {
    return { plan: planTaxonomySeed(identity, new Set(), new Set()), result: undefined };
  }
  const [existingLabelNames, existingMilestoneTitles] = await Promise.all([
    fetchExistingLabelNames(exec),
    options.labelsOnly === true
      ? Promise.resolve<ReadonlySet<string>>(new Set())
      : fetchExistingMilestoneTitles(exec),
  ]);
  const plan = planTaxonomySeed(identity, existingLabelNames, existingMilestoneTitles, options);
  if (options.dryRun === true) return { plan, result: undefined };
  const result = await executeTaxonomySeed(exec, plan);
  return { plan, result };
}

/** One planned action in words, for the dry run's list. An update says it
 *  overwrites: `gh label create --force` rewrites the live color and
 *  description, so a label recolored by hand goes back to the seed's. */
export function describeTaxonomySeedAction(action: TaxonomySeedAction): string {
  switch (action.kind) {
    case 'create-label':
      return `create label "${action.label.name}"`;
    case 'update-label':
      return `update label "${action.label.name}" (overwrites its color and description)`;
    case 'create-milestone':
      return `create milestone "${action.milestone.title}"`;
  }
}

export interface TaxonomySeedSummary {
  /** False when the seeder declined to write or any write failed — the
   *  CLI's exit code. */
  readonly ok: boolean;
  readonly lines: readonly string[];
}

/** What `pnpm dashboard:taxonomy-seed` prints for a report, and whether it
 *  exits 0. A dry run lists every planned action under its summary line so
 *  the operator sees, before any write, what a real run would do. */
export function summarizeTaxonomySeed(
  report: TaxonomySeedReport,
  options: TaxonomySeedOptions = {},
): TaxonomySeedSummary {
  const { plan, result } = report;
  if (plan.skippedReason === 'identity-unresolved') {
    return {
      ok: false,
      lines: ['[!!] taxonomy-seed: could not resolve a GitHub identity — nothing seeded'],
    };
  }
  if (plan.skippedReason === 'guest') {
    return {
      ok: false,
      lines: [
        `[!!] taxonomy-seed: ${plan.identity?.login} is a guest on ` +
          `${plan.identity?.nameWithOwner} — nothing seeded (role honesty, epic 0019 law 1)`,
      ],
    };
  }
  const repo = plan.identity?.nameWithOwner;
  const scope = options.labelsOnly === true ? ' (labels only — starter milestones skipped)' : '';
  if (options.dryRun === true) {
    return {
      ok: true,
      lines: [
        `[ok] taxonomy-seed: dry run on ${repo} — ${plan.actions.length} planned, nothing written${scope}`,
        ...plan.actions.map((action) => `      - ${describeTaxonomySeedAction(action)}`),
      ],
    };
  }
  const applied = result?.applied.length ?? 0;
  const failed = result?.failed.length ?? 0;
  return {
    ok: failed === 0,
    lines: [
      `[${failed === 0 ? 'ok' : '!!'}] taxonomy-seed: ${applied} applied, ${failed} failed ` +
        `on ${repo}${scope}`,
    ],
  };
}
