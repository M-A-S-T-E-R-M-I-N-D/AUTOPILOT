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

import { realCliExec, type CliExec } from '../connection/cli-probe.js';
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

/** Pure planner (epic law 1, role honesty): a guest identity — or one that
 *  failed to resolve at all — gets a plan with zero actions and a
 *  `skippedReason`, never a write attempt against a repo it does not own.
 *  A maintainer identity gets the full label set every time (labels are
 *  `--force` upserts, so re-planning an already-seeded repo is cheap and
 *  harmless — idempotent per the epic's own wording) plus only the
 *  starter milestones not already present by title. */
export function planTaxonomySeed(
  identity: SocialIdentity | undefined,
  existingLabelNames: ReadonlySet<string>,
  existingMilestoneTitles: ReadonlySet<string>,
): TaxonomySeedPlan {
  if (identity === undefined) {
    return { identity: undefined, actions: [], skippedReason: 'identity-unresolved' };
  }
  if (identity.role !== 'maintainer') {
    return { identity, actions: [], skippedReason: 'guest' };
  }
  const labelActions: TaxonomySeedAction[] = HOUSE_TAXONOMY_LABELS.map((label) => ({
    kind: existingLabelNames.has(label.name) ? 'update-label' : 'create-label',
    label,
  }));
  const milestoneActions: TaxonomySeedAction[] = HOUSE_STARTER_MILESTONES.filter(
    (milestone) => !existingMilestoneTitles.has(milestone.title),
  ).map((milestone) => ({ kind: 'create-milestone' as const, milestone }));
  return { identity, actions: [...labelActions, ...milestoneActions] };
}

/** `gh label list`'s live names on the current repo — fails closed to an
 *  empty set on a non-zero exit, unparseable stdout, a non-array payload,
 *  or an entry missing `name` (never blocks planning: a `gh` failure here
 *  just makes every label look "new", which `--force` makes harmless). */
export async function fetchExistingLabelNames(exec: CliExec): Promise<ReadonlySet<string>> {
  const { code, stdout } = await exec('gh', ['label', 'list', '--json', 'name']);
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

/** `gh api .../milestones?state=all`'s live titles on the current repo —
 *  both states so a closed milestone from a prior seed is never
 *  recreated. Fails closed to an empty set the same way
 *  {@link fetchExistingLabelNames} does. */
export async function fetchExistingMilestoneTitles(exec: CliExec): Promise<ReadonlySet<string>> {
  const { code, stdout } = await exec('gh', [
    'api',
    'repos/{owner}/{repo}/milestones?state=all&per_page=100',
  ]);
  if (code !== 0) return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return new Set();
  }
  if (!Array.isArray(parsed)) return new Set();
  const titles: string[] = [];
  for (const raw of parsed) {
    if (typeof raw !== 'object' || raw === null) continue;
    const title = (raw as { title?: unknown }).title;
    if (typeof title === 'string') titles.push(title);
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
 *  transient failure on label #3 must not skip labels #4-18). */
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
   *  identity) — nothing was executed, so there is no result to report. */
  readonly result: TaxonomySeedResult | undefined;
}

/** Composes resolve → fetch existing → plan → execute behind one call —
 *  the injectable-`exec`-with-a-real-default seam `social-pass.ts`'s
 *  `fetchSocialPassReport` already establishes. Skips both existing-state
 *  reads entirely once identity resolution rules out a maintainer write
 *  (unresolved, or a guest) — there is nothing to plan against a repo this
 *  identity cannot act on. */
export async function runTaxonomySeed(exec: CliExec = realCliExec): Promise<TaxonomySeedReport> {
  const identity = await resolveSocialIdentity(exec);
  if (identity === undefined || identity.role !== 'maintainer') {
    return { plan: planTaxonomySeed(identity, new Set(), new Set()), result: undefined };
  }
  const [existingLabelNames, existingMilestoneTitles] = await Promise.all([
    fetchExistingLabelNames(exec),
    fetchExistingMilestoneTitles(exec),
  ]);
  const plan = planTaxonomySeed(identity, existingLabelNames, existingMilestoneTitles);
  const result = await executeTaxonomySeed(exec, plan);
  return { plan, result };
}
