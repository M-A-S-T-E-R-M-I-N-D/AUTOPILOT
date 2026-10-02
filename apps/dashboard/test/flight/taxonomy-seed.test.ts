// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { DIMENSIONS, type Dimension } from '@autopilot/store';
import {
  HOUSE_TAXONOMY_LABELS,
  HOUSE_STARTER_MILESTONES,
  planTaxonomySeed,
  fetchExistingLabelNames,
  fetchExistingMilestoneTitles,
  MAX_MILESTONE_PAGES,
  executeTaxonomySeed,
  runTaxonomySeed,
  type TaxonomyLabel,
  type TaxonomySeedAction,
} from '../../src/flight/taxonomy-seed.js';
import {
  DOSSIER_POSTED_LABEL,
  PARTNER_APPLICATION_LABEL,
} from '../../src/flight/contributor-dossier.js';
import {
  AGENT_OK_LABEL,
  HOLD_LABELS,
  MAX_ISSUE_LIST,
  NEEDS_FORMAT_LABEL,
  POOL_LABEL_PREFIX,
  classifyIssueMilestone,
  planIssueTriage,
  planIssueTriageCommands,
  type AreaLabel,
  type IncomingIssue,
  type MilestoneTitle,
  type PriorityLabel,
} from '../../src/flight/issue-triage.js';
import { planBoardIssueExportCommands } from '../../src/flight/board-issue-export.js';
import {
  planDiscussionTriage,
  runDiscussionTriageRitual,
} from '../../src/flight/discussions-triage.js';
import { HELP_WANTED_LABEL } from '../../src/flight/help-wanted-items.js';
import { luckyFitLine, type FitOperator } from '../../src/flight/lucky-fit.js';
import {
  DECLINED_LABEL,
  claimPoolIssue,
  fetchPoolIssues,
  planClaimPoolIssue,
  planPoolIssueTask,
} from '../../src/flight/pool-client.js';
import { ROADMAP_LABEL, fetchRoadmapItems, isRoadmapItem } from '../../src/flight/roadmap-items.js';
import type { CliExec } from '../../src/connection/cli-probe.js';
import type { SocialIdentity } from '../../src/flight/social-pass.js';

// import.meta.url is an http: URL under jsdom, so resolve from cwd (same fix
// contributor-standing-panel.test.ts uses for a repo-root file read).
const PARTNER_APPLICATION_TEMPLATE = readFileSync(
  join(process.cwd(), '.github/ISSUE_TEMPLATE/partner-application.yml'),
  'utf8',
);

const MAINTAINER: SocialIdentity = {
  login: 'octocat',
  nameWithOwner: 'octocat/hello-world',
  role: 'maintainer',
};
const GUEST: SocialIdentity = {
  login: 'a-contributor',
  nameWithOwner: 'octocat/hello-world',
  role: 'user',
};

function execFor(responses: Record<string, { code: number; stdout: string }>): CliExec {
  return vi.fn(async (bin: string, args: readonly string[]) => {
    const key = [bin, ...args].join(' ');
    for (const [pattern, response] of Object.entries(responses)) {
      if (key.includes(pattern)) return response;
    }
    return { code: 1, stdout: '' };
  });
}

describe('planTaxonomySeed', () => {
  it('skips with identity-unresolved and zero actions when identity failed to resolve', () => {
    const plan = planTaxonomySeed(undefined, new Set(), new Set());
    expect(plan).toEqual({
      identity: undefined,
      actions: [],
      skippedReason: 'identity-unresolved',
    });
  });

  it('skips with guest and zero actions for a non-maintainer identity', () => {
    const plan = planTaxonomySeed(GUEST, new Set(), new Set());
    expect(plan).toEqual({ identity: GUEST, actions: [], skippedReason: 'guest' });
  });

  it('plans a create-label action for every house label on a bare repo', () => {
    const plan = planTaxonomySeed(MAINTAINER, new Set(), new Set());
    const labelActions = plan.actions.filter((a) => a.kind !== 'create-milestone');
    expect(labelActions).toHaveLength(HOUSE_TAXONOMY_LABELS.length);
    expect(labelActions.every((a) => a.kind === 'create-label')).toBe(true);
    expect(plan.skippedReason).toBeUndefined();
  });

  it('plans an update-label action for a label that already exists by name', () => {
    const existing = new Set([HOUSE_TAXONOMY_LABELS[0]!.name]);
    const plan = planTaxonomySeed(MAINTAINER, existing, new Set());
    const first = plan.actions.find(
      (a) => a.kind !== 'create-milestone' && a.label.name === HOUSE_TAXONOMY_LABELS[0]!.name,
    );
    expect(first?.kind).toBe('update-label');
  });

  it('plans a create-milestone action for every starter milestone on a bare repo', () => {
    const plan = planTaxonomySeed(MAINTAINER, new Set(), new Set());
    const milestoneActions = plan.actions.filter((a) => a.kind === 'create-milestone');
    expect(milestoneActions).toHaveLength(HOUSE_STARTER_MILESTONES.length);
  });

  it('never re-plans a milestone that already exists by title', () => {
    const existing = new Set([HOUSE_STARTER_MILESTONES[0]!.title]);
    const plan = planTaxonomySeed(MAINTAINER, new Set(), existing);
    const milestoneActions = plan.actions.filter((a) => a.kind === 'create-milestone');
    expect(milestoneActions).toHaveLength(HOUSE_STARTER_MILESTONES.length - 1);
    expect(
      milestoneActions.some(
        (a) =>
          a.kind === 'create-milestone' && a.milestone.title === HOUSE_STARTER_MILESTONES[0]!.title,
      ),
    ).toBe(false);
  });
});

describe('fetchExistingLabelNames', () => {
  it('parses names from gh label list --json name', async () => {
    const exec = execFor({
      'label list': {
        code: 0,
        stdout: JSON.stringify([{ name: 'bug' }, { name: 'priority: high' }]),
      },
    });
    expect(await fetchExistingLabelNames(exec)).toEqual(new Set(['bug', 'priority: high']));
  });

  it('fails closed to an empty set on a non-zero exit', async () => {
    const exec = execFor({ 'label list': { code: 1, stdout: '' } });
    expect(await fetchExistingLabelNames(exec)).toEqual(new Set());
  });

  it('fails closed to an empty set on unparseable stdout', async () => {
    const exec = execFor({ 'label list': { code: 0, stdout: 'not json' } });
    expect(await fetchExistingLabelNames(exec)).toEqual(new Set());
  });

  it('fails closed to an empty set when the payload is not an array', async () => {
    const exec = execFor({ 'label list': { code: 0, stdout: JSON.stringify({ nope: true }) } });
    expect(await fetchExistingLabelNames(exec)).toEqual(new Set());
  });

  it('skips an entry missing a name field', async () => {
    const exec = execFor({
      'label list': { code: 0, stdout: JSON.stringify([{ color: 'fff' }, { name: 'ok' }]) },
    });
    expect(await fetchExistingLabelNames(exec)).toEqual(new Set(['ok']));
  });
});

/** A `gh label list` stand-in that returns rows the way gh does: oldest
 *  first, at most `--limit` of them, and 30 when the flag is absent. */
function ghLabelListOf(names: readonly string[]): CliExec {
  return vi.fn(async (_bin: string, args: readonly string[]) => {
    const flag = args.indexOf('--limit');
    const limit = flag < 0 ? 30 : Number(args[flag + 1]);
    return { code: 0, stdout: JSON.stringify(names.slice(0, limit).map((name) => ({ name }))) };
  });
}

// Same law, the seeder's own read of what is already there. With no
// `--limit`, `gh label list` returns 30 labels, oldest first, so on a repo
// carrying more than that (this one carries 40) every house label created
// after the thirtieth read as missing and was planned as a `create-label`.
describe('fetchExistingLabelNames × a repo with more labels than gh returns by default (regression, epic 0019 additive-only law)', () => {
  const OLDER = Array.from({ length: 30 }, (_, i) => `older label ${i + 1}`);
  const HOUSE = HOUSE_TAXONOMY_LABELS.map((label) => label.name);

  it('reads every label, not the oldest 30', async () => {
    const names = await fetchExistingLabelNames(ghLabelListOf([...OLDER, ...HOUSE]));

    expect(names.size).toBe(OLDER.length + HOUSE.length);
    expect(HOUSE.filter((name) => !names.has(name))).toEqual([]);
  });

  it('plans an already-seeded house label as an update, never a create', async () => {
    const existing = await fetchExistingLabelNames(ghLabelListOf([...OLDER, ...HOUSE]));

    const plan = planTaxonomySeed(MAINTAINER, existing, new Set());

    expect(plan.actions.filter((a) => a.kind === 'create-label')).toEqual([]);
  });
});

describe('fetchExistingMilestoneTitles', () => {
  it('parses titles from gh api .../milestones?state=all', async () => {
    const exec = execFor({
      milestones: { code: 0, stdout: JSON.stringify([{ title: 'V1' }, { title: 'Hardening' }]) },
    });
    expect(await fetchExistingMilestoneTitles(exec)).toEqual(new Set(['V1', 'Hardening']));
  });

  it('fails closed to an empty set on a non-zero exit', async () => {
    const exec = execFor({ milestones: { code: 1, stdout: '' } });
    expect(await fetchExistingMilestoneTitles(exec)).toEqual(new Set());
  });

  it('fails closed to an empty set on unparseable stdout', async () => {
    const exec = execFor({ milestones: { code: 0, stdout: 'not json' } });
    expect(await fetchExistingMilestoneTitles(exec)).toEqual(new Set());
  });
});

/** A `gh api .../milestones` stand-in that pages rows the way the REST
 *  endpoint does: `per_page` of them (30 when absent) from `page` (1 when
 *  absent). */
function ghMilestonesOf(titles: readonly string[]): CliExec {
  return vi.fn(async (_bin: string, args: readonly string[]) => {
    const path = args.find((arg) => arg.includes('milestones')) ?? '';
    const query = new URLSearchParams(path.split('?')[1] ?? '');
    const perPage = Number(query.get('per_page') ?? 30);
    const page = Number(query.get('page') ?? 1);
    const rows = titles.slice((page - 1) * perPage, page * perPage).map((title) => ({ title }));
    return { code: 0, stdout: JSON.stringify(rows) };
  });
}

// Same law, the milestone read. One `per_page=100` page is the first hundred
// milestones and nothing after, so on a repo past a hundred (closed ones
// count: the read asks for `state=all`) a starter milestone on a later page
// read as missing and was planned as a `create-milestone` all over again.
describe('fetchExistingMilestoneTitles × a repo with more milestones than one page holds (regression, epic 0019 additive-only law)', () => {
  const OLDER = Array.from({ length: 100 }, (_, i) => `older milestone ${i + 1}`);
  const HOUSE = HOUSE_STARTER_MILESTONES.map((milestone) => milestone.title);

  it('reads every milestone, not the first page of 100', async () => {
    const titles = await fetchExistingMilestoneTitles(ghMilestonesOf([...OLDER, ...HOUSE]));

    expect(titles.size).toBe(OLDER.length + HOUSE.length);
    expect(HOUSE.filter((title) => !titles.has(title))).toEqual([]);
  });

  it('plans no starter milestone the repo already carries on a later page', async () => {
    const existing = await fetchExistingMilestoneTitles(ghMilestonesOf([...OLDER, ...HOUSE]));

    const plan = planTaxonomySeed(MAINTAINER, new Set(), existing);

    expect(plan.actions.filter((a) => a.kind === 'create-milestone')).toEqual([]);
  });

  it('stops at the first short page', async () => {
    const exec = ghMilestonesOf([...OLDER, ...HOUSE]);

    await fetchExistingMilestoneTitles(exec);

    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('stops after MAX_MILESTONE_PAGES pages when every page comes back full', async () => {
    const fullPage = JSON.stringify(OLDER.map((title) => ({ title })));
    const exec: CliExec = vi.fn(async () => ({ code: 0, stdout: fullPage }));

    expect(await fetchExistingMilestoneTitles(exec)).toEqual(new Set(OLDER));
    expect(exec).toHaveBeenCalledTimes(MAX_MILESTONE_PAGES);
  });

  it('fails closed to an empty set when a later page fails, never a partial read', async () => {
    const firstPage = JSON.stringify(OLDER.map((title) => ({ title })));
    const exec: CliExec = vi.fn(async (_bin: string, args: readonly string[]) =>
      args.some((arg) => arg.endsWith('&page=1'))
        ? { code: 0, stdout: firstPage }
        : { code: 1, stdout: '' },
    );

    expect(await fetchExistingMilestoneTitles(exec)).toEqual(new Set());
  });
});

/**
 * EPIC 0019 additive-only law — the edge branches the first tests walked
 * past. Each pins how an existing-state read degrades ONE malformed entry of
 * a `gh` payload without losing its well-formed siblings, or fails closed to
 * an empty set on a payload of the wrong shape (taxonomy-seed.ts: "never
 * blocks planning"); none of them changes a contract.
 */
describe('taxonomy-seed existing-state reads — malformed gh payload edge branches (regression, epic 0019 additive-only law)', () => {
  it('fetchExistingLabelNames skips null, non-object and non-string-name entries, keeping the rest', async () => {
    const exec = execFor({
      'label list': {
        code: 0,
        stdout: JSON.stringify([null, 'stray', 7, { name: 3 }, { name: 'ok' }]),
      },
    });

    expect(await fetchExistingLabelNames(exec)).toEqual(new Set(['ok']));
  });

  it('fetchExistingMilestoneTitles fails closed to an empty set when the payload is not an array', async () => {
    const exec = execFor({
      milestones: { code: 0, stdout: JSON.stringify({ message: 'Not Found' }) },
    });

    expect(await fetchExistingMilestoneTitles(exec)).toEqual(new Set());
  });

  it('fetchExistingMilestoneTitles skips null, non-object and title-less entries, keeping the rest', async () => {
    const exec = execFor({
      milestones: {
        code: 0,
        stdout: JSON.stringify([null, 'stray', { number: 1 }, { title: 2 }, { title: 'V1' }]),
      },
    });

    expect(await fetchExistingMilestoneTitles(exec)).toEqual(new Set(['V1']));
  });
});

describe('executeTaxonomySeed', () => {
  it('applies a create-label action via gh label create --force', async () => {
    const exec = execFor({ 'label create': { code: 0, stdout: '' } });
    const label = HOUSE_TAXONOMY_LABELS[0]!;
    const action: TaxonomySeedAction = { kind: 'create-label', label };

    const result = await executeTaxonomySeed(exec, {
      identity: MAINTAINER,
      actions: [action],
    });

    expect(result).toEqual({ applied: [action], failed: [] });
    expect(exec).toHaveBeenCalledWith('gh', [
      'label',
      'create',
      label.name,
      '--color',
      label.color,
      '--description',
      label.description,
      '--force',
    ]);
  });

  it('applies a create-milestone action via gh api POST', async () => {
    const exec = execFor({ 'api repos/{owner}/{repo}/milestones': { code: 0, stdout: '' } });
    const milestone = HOUSE_STARTER_MILESTONES[0]!;
    const action: TaxonomySeedAction = { kind: 'create-milestone', milestone };

    const result = await executeTaxonomySeed(exec, {
      identity: MAINTAINER,
      actions: [action],
    });

    expect(result).toEqual({ applied: [action], failed: [] });
    expect(exec).toHaveBeenCalledWith('gh', [
      'api',
      'repos/{owner}/{repo}/milestones',
      '-f',
      `title=${milestone.title}`,
      '-f',
      `description=${milestone.description}`,
    ]);
  });

  it('collects a failed action rather than aborting the rest of the plan', async () => {
    const first = HOUSE_TAXONOMY_LABELS[0]!;
    const second = HOUSE_TAXONOMY_LABELS[1]!;
    const exec: CliExec = vi.fn(async (_bin, args: readonly string[]) => {
      return args.includes(first.name) ? { code: 1, stdout: '' } : { code: 0, stdout: '' };
    });
    const firstAction: TaxonomySeedAction = { kind: 'create-label', label: first };
    const secondAction: TaxonomySeedAction = { kind: 'create-label', label: second };

    const result = await executeTaxonomySeed(exec, {
      identity: MAINTAINER,
      actions: [firstAction, secondAction],
    });

    expect(result).toEqual({ applied: [secondAction], failed: [firstAction] });
  });
});

describe('runTaxonomySeed', () => {
  it('never reads existing labels/milestones when identity is unresolved', async () => {
    const exec = execFor({ 'gh api user': { code: 1, stdout: '' } });
    const report = await runTaxonomySeed(exec);
    expect(report.plan.skippedReason).toBe('identity-unresolved');
    expect(report.result).toBeUndefined();
    expect(exec).not.toHaveBeenCalledWith('gh', expect.arrayContaining(['label']));
  });

  it('never reads existing labels/milestones for a guest identity', async () => {
    const exec = execFor({
      'gh api user': { code: 0, stdout: JSON.stringify({ login: 'a-contributor' }) },
      'gh repo view': {
        code: 0,
        stdout: JSON.stringify({
          nameWithOwner: 'octocat/hello-world',
          url: 'https://github.com/octocat/hello-world',
          isPrivate: false,
        }),
      },
    });
    const report = await runTaxonomySeed(exec);
    expect(report.plan.skippedReason).toBe('guest');
    expect(report.result).toBeUndefined();
    expect(exec).not.toHaveBeenCalledWith('gh', expect.arrayContaining(['label', 'list']));
  });

  it('plans and executes the full seed for a maintainer on a bare repo', async () => {
    const exec = execFor({
      'gh api user': { code: 0, stdout: JSON.stringify({ login: 'octocat' }) },
      'gh repo view': {
        code: 0,
        stdout: JSON.stringify({
          nameWithOwner: 'octocat/hello-world',
          url: 'https://github.com/octocat/hello-world',
          isPrivate: false,
        }),
      },
      'label list': { code: 0, stdout: '[]' },
      milestones: { code: 0, stdout: '[]' },
      'label create': { code: 0, stdout: '' },
      'api repos/{owner}/{repo}/milestones': { code: 0, stdout: '' },
    });

    const report = await runTaxonomySeed(exec);

    expect(report.plan.skippedReason).toBeUndefined();
    expect(report.result?.applied).toHaveLength(
      HOUSE_TAXONOMY_LABELS.length + HOUSE_STARTER_MILESTONES.length,
    );
    expect(report.result?.failed).toEqual([]);
  });
});

// Epic 0019 additive-only law (docs/FAILURE-DOCTRINE.md): every steward slice
// ships a regression test over an existing neighboring flow it must never
// silently break. taxonomy-seed.ts is the ONLY place the house label scheme
// is authored; contributor-dossier.ts's PARTNER_APPLICATION_LABEL is the ONE
// signal that routes a standing-application issue to the KEEPER dossier path
// instead of issue-triage.ts's ordinary autonomous accept/duplicate/skip
// verdict (contributor-dossier.ts:38-40). If the label name ever drifts
// between the three places that hardcode it — this file's house taxonomy,
// contributor-dossier.ts's routing constant, and the issue template that
// applies the label at creation — a partner application would fall through
// to the wrong path with no error, exactly what CONTRIBUTOR-STANDING.md
// promises never happens.
describe('HOUSE_TAXONOMY_LABELS × KEEPER dossier routing (regression, epic 0019 additive-only law)', () => {
  it('seeds the exact label name contributor-dossier.ts routes standing applications on', () => {
    expect(HOUSE_TAXONOMY_LABELS.map((label) => label.name)).toContain(PARTNER_APPLICATION_LABEL);
  });

  it('matches the label the issue template itself applies at creation', () => {
    expect(PARTNER_APPLICATION_TEMPLATE).toContain(`labels: ['${PARTNER_APPLICATION_LABEL}']`);
  });

  // The dossier ritual's idempotency marker: planContributorDossierCommands
  // runs `gh issue edit --add-label dossier-posted` before the comment, and
  // issue-triage.ts skips an application that already carries it. `gh` fails
  // that edit on an unseeded name, and executeIssueTriageCommands used to run
  // the comment after it anyway — so the marker never landed, and every later
  // KEEPER pass re-decided 'dossier' and re-posted, with only the anti-flood
  // guard standing between the applicant's issue and a repeat dossier. (It
  // now withholds the reply after a failed marker edit, board ap-mur9xjwq-0 —
  // which turns that repeat into a silent miss, so the seed still matters.)
  it('seeds the label the dossier ritual marks a posted dossier with', () => {
    expect(HOUSE_TAXONOMY_LABELS.map((label) => label.name)).toContain(DOSSIER_POSTED_LABEL);
  });

  it('files the marker in the community set, right after the application label it answers', () => {
    const names = HOUSE_TAXONOMY_LABELS.map((label) => label.name);
    expect(names.indexOf(DOSSIER_POSTED_LABEL)).toBe(names.indexOf(PARTNER_APPLICATION_LABEL) + 1);
  });

  it('is named in the governance doc this constant transcribes', () => {
    const governance = readFileSync(join(process.cwd(), 'docs/GOVERNANCE.md'), 'utf8');
    expect(governance).toContain(`\`${DOSSIER_POSTED_LABEL}\``);
  });
});

// Same law, the second seam over the same constant: the issue protocol gate
// (issue-triage.ts, operator directive 2026-09-12) puts `status: needs-format`
// on an off-template issue with `gh issue edit --add-label`, and `gh` resolves
// a label NAME against the repo's live label list before it edits anything —
// an unseeded name fails the whole edit ("'status: needs-format' not found"),
// so the gate's label and its ONE reply never reached an issue (board
// web-mtxey8h4-6z9g5o). Every label issue-triage.ts adds on its own
// initiative is therefore authored here; GitHub's stock `duplicate` is the
// one it relies on a fresh repo to already carry.
describe('HOUSE_TAXONOMY_LABELS × KEEPER issue protocol gate (regression, epic 0019 additive-only law)', () => {
  const names = HOUSE_TAXONOMY_LABELS.map((label) => label.name);

  it('seeds every label the triage ritual adds on its own initiative', () => {
    expect(names).toContain(AGENT_OK_LABEL);
    expect(names).toContain(NEEDS_FORMAT_LABEL);
  });

  it('files the protocol label under the status group, after its siblings', () => {
    const statusGroup = names.filter((name) => name.startsWith('status: '));
    expect(statusGroup).toEqual(['status: awaiting-human', 'status: blocked', NEEDS_FORMAT_LABEL]);
  });

  it('is named, and counted, in the governance doc this constant transcribes', () => {
    const governance = readFileSync(join(process.cwd(), 'docs/GOVERNANCE.md'), 'utf8');
    expect(governance).toContain(`\`${NEEDS_FORMAT_LABEL}\``);
    expect(governance).toContain(`${HOUSE_TAXONOMY_LABELS.length} labels total`);
  });
});

// Same law, the accept edit itself: planIssueTriageCommands puts an accepted
// issue's pool, area and priority labels on it in ONE `gh issue edit`, which
// fails whole on a single unseeded name (the block above) — so one drifted
// name in any family leaves the issue without the `pool:` marker every later
// KEEPER pass recognizes a triaged issue by. Area and priority are seeded
// here; the pool family is `.github/labels.json`'s, which labels.yml syncs.
const POOL_LABELS = JSON.parse(
  readFileSync(join(process.cwd(), '.github/labels.json'), 'utf8'),
) as readonly TaxonomyLabel[];
const POOL_LABEL_NAMES: readonly string[] = POOL_LABELS.map((label) => label.name);

/** Every area and priority the classifiers can hand the accept edit. The
 *  constants are module-private, so `satisfies` keeps these whole instead:
 *  typecheck fails the moment issue-triage.ts adds, drops or renames one. */
const TRIAGE_AREAS = Object.keys({
  'area: dashboard': true,
  'area: flight-engine': true,
  'area: foundation': true,
  'area: ci': true,
  'area: i18n': true,
  'area: community': true,
} satisfies Record<AreaLabel, true>) as AreaLabel[];
const TRIAGE_PRIORITIES = Object.keys({
  'priority: critical': true,
  'priority: high': true,
  'priority: medium': true,
  'priority: low': true,
} satisfies Record<PriorityLabel, true>) as PriorityLabel[];

/** The `--add-label` values of the accept edit for one classification — an
 *  expired human reservation included, so `agent-ok` rides along too. */
function acceptEditLabels(
  dimension: Dimension,
  area: AreaLabel,
  priority: PriorityLabel,
): string[] {
  const issue: IncomingIssue = { number: 7, title: 'An accepted issue', body: '' };
  const [edit] = planIssueTriageCommands(issue, {
    decision: 'accept',
    releasedFromHumansAfterDays: 15,
    dimension,
    area,
    priority,
    reasoning: '',
  });
  const args = edit?.args ?? [];
  return args.filter((_, i) => args[i - 1] === '--add-label');
}

describe('HOUSE_TAXONOMY_LABELS + .github/labels.json × KEEPER accept edit (regression, epic 0019 additive-only law)', () => {
  it('labels each dimension with the pool label labels.json syncs, spelled with POOL_LABEL_PREFIX', () => {
    // The accept edit spells its pool label by hand; the skip that keeps
    // re-runs idempotent, and the discussions ritual, both go through the
    // prefix constant. A drift between them re-triages every accepted issue.
    for (const dimension of DIMENSIONS) {
      const [pool] = acceptEditLabels(dimension, 'area: dashboard', 'priority: medium');
      expect(pool).toBe(`${POOL_LABEL_PREFIX}${dimension}`);
      expect(POOL_LABEL_NAMES).toContain(pool);
    }
  });

  it('adds no label that neither the house taxonomy nor labels.json seeds, across every classification', () => {
    const seeded = new Set([
      ...HOUSE_TAXONOMY_LABELS.map((label) => label.name),
      ...POOL_LABEL_NAMES,
    ]);
    const added = new Set(
      DIMENSIONS.flatMap((dimension) =>
        TRIAGE_AREAS.flatMap((area) =>
          TRIAGE_PRIORITIES.flatMap((priority) => acceptEditLabels(dimension, area, priority)),
        ),
      ),
    );

    // Every classification reaches the edit: one label per dimension, area and
    // priority, plus agent-ok for the expired reservation.
    expect(added.size).toBe(DIMENSIONS.length + TRIAGE_AREAS.length + TRIAGE_PRIORITIES.length + 1);
    expect([...added].filter((label) => !seeded.has(label))).toEqual([]);
  });
});

// Same law, the SEEDING itself: every name pin in this file assumes the label
// exists on the live repo, and both seed sources get it there through `gh
// label create --force` — executeTaxonomySeed for the house taxonomy,
// labels.yml for the pool set. The create-label endpoint refuses a
// description over 100 characters and wants the color "without the leading
// #" (docs.github.com, REST "Create a label"). A refused label is never
// created: the seeder collects the failure and moves on, and labels.yml's
// `set -euo pipefail` loop stops there, so no pool label after it syncs
// either. partner-application's description is 99 characters long.
const GITHUB_LABEL_DESCRIPTION_MAX = 100;

const LABELS_WORKFLOW = readFileSync(join(process.cwd(), '.github/workflows/labels.yml'), 'utf8');

const SEEDED_LABELS: readonly { readonly source: string; readonly label: TaxonomyLabel }[] = [
  ...HOUSE_TAXONOMY_LABELS.map((label) => ({ source: 'HOUSE_TAXONOMY_LABELS', label })),
  ...POOL_LABELS.map((label) => ({ source: '.github/labels.json', label })),
];

describe("HOUSE_TAXONOMY_LABELS + .github/labels.json × GitHub's create-label limits (regression, epic 0019 additive-only law)", () => {
  it('gives every labels.json entry a string name, color and description', () => {
    // labels.yml reads each field with `jq -r`, which prints a missing one as
    // the word "null": a pool label described as "null", or a create refused
    // for its color.
    expect(POOL_LABELS.length).toBeGreaterThan(0);
    for (const label of POOL_LABELS) {
      expect(label).toEqual({
        name: expect.any(String),
        color: expect.any(String),
        description: expect.any(String),
      });
    }
  });

  it('keeps every seeded description to 100 characters or fewer', () => {
    // Counted in code points, so an emoji in a description counts once.
    const tooLong = SEEDED_LABELS.filter(
      ({ label }) => [...label.description].length > GITHUB_LABEL_DESCRIPTION_MAX,
    ).map(({ source, label }) => `${source}: ${label.name} (${[...label.description].length})`);
    expect(tooLong).toEqual([]);
  });

  it('gives every seeded label a six-digit hex color with no leading #', () => {
    const malformed = SEEDED_LABELS.filter(({ label }) => !/^[0-9a-f]{6}$/i.test(label.color)).map(
      ({ source, label }) => `${source}: ${label.name} (${label.color})`,
    );
    expect(malformed).toEqual([]);
  });

  it('has labels.yml upsert every labels.json entry, and run when the file changes', () => {
    expect(LABELS_WORKFLOW).toContain("jq -c '.[]' .github/labels.json");
    expect(LABELS_WORKFLOW).toMatch(/paths:\n(?:\s+- .+\n)*\s+- \.github\/labels\.json\n/);
    expect(LABELS_WORKFLOW).toContain(
      'gh label create "$name" --color "$color" --description "$description" --force',
    );
  });
});

// Same law, the TEMPLATES flow: an issue form applies its `labels:` at
// creation only if the repo already has them. GitHub skips a missing one
// without a word ("If a label does not already exist in the repository, it
// will not be automatically added to the issue", docs.github.com, "Syntax for
// issue forms"). bug_report.yml and feature_request.yml both applied a
// `triage` that no seed source ever created, so no report ever carried it,
// and nothing read it either: KEEPER knows a triaged issue by its `pool:`
// label. Every form label comes from a seed source: this house taxonomy, the
// pool set labels.json syncs, or the defaults GitHub gives every new repo.
const ISSUE_TEMPLATE_DIR = join(process.cwd(), '.github/ISSUE_TEMPLATE');

/** GitHub's default labels, the set every new repository starts with
 *  (docs.github.com, "Managing labels", "About default labels"). */
const GITHUB_DEFAULT_LABELS: readonly string[] = [
  'accessibility',
  'bug',
  'documentation',
  'duplicate',
  'enhancement',
  'good first issue',
  'help wanted',
  'invalid',
  'question',
  'wontfix',
];

/** Every issue form on disk, not a hand-kept list, with the labels its
 *  `labels: [...]` line applies. `config.yml` is the chooser, not a form. */
function issueFormLabels(): { readonly file: string; readonly labels: readonly string[] }[] {
  return readdirSync(ISSUE_TEMPLATE_DIR)
    .filter((file) => /\.ya?ml$/.test(file) && !/^config\.ya?ml$/.test(file))
    .sort()
    .map((file) => {
      const line = /^labels:(.*)$/m.exec(readFileSync(join(ISSUE_TEMPLATE_DIR, file), 'utf8'));
      if (line === null) return { file, labels: [] };
      const inline = /^\s*\[(.*)\]\s*$/.exec(line[1] ?? '');
      // A comma string or a block list would read as no labels here, and
      // pass the pin below without checking a thing.
      if (inline === null) throw new Error(`${file}: expected an inline [..] labels list`);
      const labels = (inline[1] ?? '')
        .split(',')
        .map((label) => label.trim().replace(/^['"]|['"]$/g, ''))
        .filter((label) => label !== '');
      return { file, labels };
    });
}

describe('issue forms × the seeded label sources (regression, epic 0019 additive-only law)', () => {
  const forms = issueFormLabels();

  it('reads every form on disk and the labels each applies', () => {
    expect(forms.map((form) => form.file)).toEqual(
      expect.arrayContaining(['bug_report.yml', 'feature_request.yml', 'partner-application.yml']),
    );
    expect(forms.find((form) => form.file === 'bug_report.yml')?.labels).toContain('bug');
  });

  it('applies no label that neither a seed source nor GitHub itself creates', () => {
    const seeded = new Set([
      ...HOUSE_TAXONOMY_LABELS.map((label) => label.name),
      ...POOL_LABEL_NAMES,
      ...GITHUB_DEFAULT_LABELS,
    ]);
    const unseeded = forms.flatMap(({ file, labels }) =>
      labels.filter((label) => !seeded.has(label)).map((label) => `${file}: ${label}`),
    );
    expect(unseeded).toEqual([]);
  });
});

// Same law, the TEMPLATES flow's pool field: the bug and feature forms ask the
// reporter which pool a report falls under, from a dropdown that lists the
// dimensions by hand and points at `.github/labels.json`. Nothing tied that
// list to either. A dimension added to DIMENSIONS and labels.json (pinned to
// each other elsewhere in this file) would never be offered, and a renamed one
// would still be, under a name no `pool:` label or board task carries. GitHub
// accepts any option list, so no check failed.
const POOL_FIELD_ID = 'pool';
const POOL_UNSURE_OPTION = 'Unsure';

/** The options of the `id: pool` dropdown on each issue form that has one. */
function poolDropdownOptions(): [file: string, options: readonly string[]][] {
  return readdirSync(ISSUE_TEMPLATE_DIR)
    .filter((file) => /\.ya?ml$/.test(file) && !/^config\.ya?ml$/.test(file))
    .sort()
    .flatMap((file): [string, readonly string[]][] => {
      const text = readFileSync(join(ISSUE_TEMPLATE_DIR, file), 'utf8').replace(/\r\n/g, '\n');
      const field = text
        .split(/^ {2}- type:\s*/m)
        .slice(1)
        .find(
          (block) =>
            block.startsWith('dropdown') &&
            new RegExp(`^ {4}id:\\s*${POOL_FIELD_ID}\\s*$`, 'm').test(block),
        );
      if (field === undefined) return [];
      const list = /^ {6}options:[ \t]*\n((?: {8}- [^\n]*(?:\n|$))+)/m.exec(field)?.[1] ?? '';
      const options = list
        .split('\n')
        .map((line) =>
          line
            .replace(/^ {8}- /, '')
            .trim()
            .replace(/^['"]|['"]$/g, ''),
        )
        .filter((option) => option !== '');
      return [[file, options]];
    });
}

describe('issue forms × the pools a report can be filed under (regression, epic 0019 additive-only law)', () => {
  const forms = poolDropdownOptions();

  it('finds the pool dropdown, with its options, on the bug and feature forms', () => {
    // Guards the reader: a renamed id or a reshaped list would read as no
    // forms or no options, and the pins below would pass without checking.
    expect(forms.map(([file]) => file)).toEqual(['bug_report.yml', 'feature_request.yml']);
    for (const [, options] of forms) expect(options.length).toBeGreaterThan(0);
  });

  it.each(forms)('%s offers every dimension and Unsure, and nothing else', (_file, options) => {
    expect([...options].sort()).toEqual([POOL_UNSURE_OPTION, ...DIMENSIONS].sort());
  });

  it.each(forms)('%s offers only pools labels.json syncs a label for', (_file, options) => {
    const unlabeled = options
      .filter((option) => option !== POOL_UNSURE_OPTION)
      .filter((option) => !POOL_LABEL_NAMES.includes(`${POOL_LABEL_PREFIX}${option}`));
    expect(unlabeled).toEqual([]);
  });
});

// Same law, the CLAIM flow (.github/CONTRIBUTING.md "Claiming work — the
// shared-task protocol"): claim.yml puts `claimed` on a /claim'd issue, stale-claim-reaper.yml finds claims by
// that label and takes it off again, and this constant is the only thing that
// makes the label exist on a fresh repo. Both workflows swallow a failed label
// edit (`2>/dev/null || true`), so a name drift between the three fails with
// no error. /unclaim must take off `claimed` alone: a bare DELETE on the
// issue's `/labels` endpoint is GitHub's "remove all labels" call, which also
// stripped `help wanted`, `pool: *` and the priority off the very issue the
// reply had just handed back to the next claimer.
const CLAIMED_LABEL = 'claimed';
const CLAIM_WORKFLOW = readFileSync(join(process.cwd(), '.github/workflows/claim.yml'), 'utf8');
const STALE_CLAIM_REAPER = readFileSync(
  join(process.cwd(), '.github/workflows/stale-claim-reaper.yml'),
  'utf8',
);

/** One `case` branch of claim.yml's run script, from its pattern to its `;;`. */
function claimBranch(pattern: '/claim*' | '/unclaim*'): string {
  const start = CLAIM_WORKFLOW.indexOf(`${pattern})`);
  const end = CLAIM_WORKFLOW.indexOf(';;', start);
  if (start < 0 || end < 0) throw new Error(`claim.yml has no \`${pattern})\` branch`);
  return CLAIM_WORKFLOW.slice(start, end);
}

describe('HOUSE_TAXONOMY_LABELS × claim protocol (regression, epic 0019 additive-only law)', () => {
  it('seeds the label /claim puts on a claimed issue', () => {
    expect(HOUSE_TAXONOMY_LABELS.map((label) => label.name)).toContain(CLAIMED_LABEL);
    expect(claimBranch('/claim*')).toContain(`--add-label "${CLAIMED_LABEL}"`);
  });

  it('has the reaper find claims by that label and release them by it', () => {
    expect(STALE_CLAIM_REAPER).toContain(`--label ${CLAIMED_LABEL} `);
    expect(STALE_CLAIM_REAPER).toContain(`--remove-label ${CLAIMED_LABEL} `);
  });

  it('has /unclaim take off the claimed label, the same way the reaper does', () => {
    expect(claimBranch('/unclaim*')).toContain(`--remove-label ${CLAIMED_LABEL} `);
  });

  it('never has /unclaim call the endpoint that removes every label on the issue', () => {
    // `.../issues/$NUM/labels` with no `/<name>` after it is the remove-all call.
    expect(claimBranch('/unclaim*')).not.toMatch(/\/issues\/\$NUM\/labels(?!\/)/);
  });

  it('has the reaper list every claim, not the newest 30 gh returns by default', () => {
    // No `--limit` meant gh's default 30, newest first, so the OLDEST claims,
    // the likeliest to have gone quiet, were never checked or released.
    expect(STALE_CLAIM_REAPER).toContain(
      `gh issue list --repo "$REPO" --label ${CLAIMED_LABEL} --state open --limit ${MAX_ISSUE_LIST} `,
    );
  });

  it('has the reaper keep the quiet window the /claim reply promises', () => {
    const promised = /(\d+) quiet days auto-release it/.exec(claimBranch('/claim*'))?.[1];
    const enforced = /QUIET_DAYS=(\d+)/.exec(STALE_CLAIM_REAPER)?.[1];
    expect(promised).toBeDefined();
    expect(enforced).toBe(promised);
  });
});

// Same law, the claim flow's turn-away: /claim on an issue someone already
// holds replies with a link to "another help-wanted issue". That link is a
// GitHub search spelling `label:"help wanted"` by hand, while the board export
// files every shared task under HELP_WANTED_LABEL. A search on a label nobody
// applies is not an error, just an empty list, so a rename on either side
// would send every turned-away claimer to an empty page, and nothing failed.
/** The already-claimed reply's issue search, with `$REPO` expanded to `repo`. */
function helpWantedLink(repo: string): URL {
  const link = /\]\((https:\/\/github\.com\/\$REPO\/issues\?q=[^)\s]+)\)/.exec(
    claimBranch('/claim*'),
  )?.[1];
  if (link === undefined) throw new Error("claim.yml's /claim reply has no issue-search link");
  return new URL(link.replace('$REPO', repo));
}

describe("claim.yml's already-claimed reply × the board export's label (regression, epic 0019 additive-only law)", () => {
  const url = helpWantedLink('some-owner/some-repo');
  const query = url.searchParams.get('q') ?? '';

  it("points at the replying repo's open issues", () => {
    expect(url.origin + url.pathname).toBe('https://github.com/some-owner/some-repo/issues');
    expect(query.split(' ')).toEqual(expect.arrayContaining(['is:issue', 'is:open']));
  });

  it('searches the label the board export files shared tasks under', () => {
    const qualifier = /(?:^| )label:(?:"([^"]*)"|(\S+))/.exec(query);
    const [create] = planBoardIssueExportCommands({
      action: 'create',
      taskId: 'task-1',
      title: 'A shared task',
      body: '',
      reasoning: '',
    });
    const args = create?.args ?? [];

    expect(qualifier?.[1] ?? qualifier?.[2]).toBe(HELP_WANTED_LABEL);
    expect(args[args.indexOf('--label') + 1]).toBe(HELP_WANTED_LABEL);
    expect(GITHUB_DEFAULT_LABELS).toContain(HELP_WANTED_LABEL);
  });

  it('offers only issues nobody holds yet, not another claimed one', () => {
    expect(query.split(' ')).toContain('no:assignee');
  });
});

// Same law, the triage MILESTONE (S2: "accepted issues get area/priority
// labels + a milestone"). issue-triage.ts classifies an accepted issue into a
// starter title of its own, copied by hand from HOUSE_STARTER_MILESTONES
// rather than imported, and milestoneToSet sets a title only when the repo
// has it. A rename on either side would leave every accepted issue on a
// freshly seeded repo with no milestone: no flag, no error, nothing said.
/** Every title the milestone classifier can pick. The constant is
 *  module-private, so `satisfies` keeps this whole instead: typecheck fails
 *  the moment issue-triage.ts adds, drops or renames one. */
const TRIAGE_MILESTONES = Object.keys({
  Foundations: true,
  V1: true,
  Hardening: true,
} satisfies Record<MilestoneTitle, true>) as MilestoneTitle[];

/** An issue title the classifier reads as each milestone; V1 is its fallback. */
const MILESTONE_SIGNAL: Record<MilestoneTitle, string> = {
  Foundations: 'Scaffold the initial architecture',
  V1: 'The fleet table loses focus',
  Hardening: 'Harden the settings form against a security hole',
};

describe("HOUSE_STARTER_MILESTONES × KEEPER triage's milestone (regression, epic 0019 additive-only law)", () => {
  // The titles a bare repo carries once the seeder has run, from its own plan.
  const freshlySeeded = planTaxonomySeed(MAINTAINER, new Set(), new Set()).actions.flatMap(
    (action) => (action.kind === 'create-milestone' ? [action.milestone.title] : []),
  );

  it('picks only milestones the seeder creates', () => {
    expect(freshlySeeded).toEqual(HOUSE_STARTER_MILESTONES.map((milestone) => milestone.title));
    expect(TRIAGE_MILESTONES.filter((title) => !freshlySeeded.includes(title))).toEqual([]);
  });

  it('sets each classified milestone on an accepted issue in a freshly seeded repo', () => {
    for (const title of TRIAGE_MILESTONES) {
      expect(classifyIssueMilestone(MILESTONE_SIGNAL[title])).toBe(title);

      // Maintainer-authored, so the issue template gate lets a bare body through.
      const issue: IncomingIssue = {
        number: 7,
        title: MILESTONE_SIGNAL[title],
        body: '',
        author: MAINTAINER.login,
      };
      const decision = planIssueTriage(
        issue,
        [],
        [],
        undefined,
        undefined,
        MAINTAINER.login,
        freshlySeeded,
      );
      const [edit] = planIssueTriageCommands(issue, decision);
      const args = edit?.args ?? [];

      expect(decision).toMatchObject({ decision: 'accept', milestone: title });
      expect(args[args.indexOf('--milestone') + 1]).toBe(title);
    }
  });
});

// Same law, the READ side: three flows find their work by a seeded label's
// exact name, and a rename on either side reads as "nothing here", never as
// an error. The collaboration panel's roadmap column lists `gh issue list
// --label roadmap`, and a label no issue carries lists nothing. KEEPER's
// template gate waves an `epic` tracking issue through; a drifted name would
// label a contributor's epic `status: needs-format` and ask them for a bug
// report's sections. The lucky fit scorer weighs `area: i18n`, `epic` and the
// rest by name, and an unknown one is simply no signal.
const LUCKY_FIT_SOURCE = readFileSync(
  join(process.cwd(), 'apps/dashboard/src/flight/lucky-fit.ts'),
  'utf8',
);

/** Every label lucky-fit.ts weighs, read off its `hasLabel(c.labels, '…')`
 *  calls on disk, so a label it starts weighing joins the pin by itself. */
const LUCKY_FIT_LABELS: readonly string[] = [
  ...LUCKY_FIT_SOURCE.matchAll(/hasLabel\(c\.labels, '([^']+)'\)/g),
].map((match) => match[1] ?? '');

/** An operator every label signal fires for: a non-English locale, no firing
 *  flown yet, one evening, one lane. */
const EVERY_SIGNAL_OPERATOR: FitOperator = {
  locale: 'he',
  attention: 'evening',
  lanes: 1,
  firingsFlown: 0,
};

function luckyFitOf(labels: readonly string[]): number | undefined {
  return luckyFitLine(
    {
      number: 7,
      title: 'A claimable issue',
      url: 'https://github.com/octocat/hello-world/issues/7',
      labels,
      assignees: [],
      source: 'pool',
    },
    EVERY_SIGNAL_OPERATOR,
  )?.fit;
}

describe('HOUSE_TAXONOMY_LABELS × the flows that find work by a seeded label (regression, epic 0019 additive-only law)', () => {
  const names = HOUSE_TAXONOMY_LABELS.map((label) => label.name);

  it("lists the collaboration panel's roadmap column by a seeded label", async () => {
    let listArgs: readonly string[] = [];
    const exec: CliExec = async (_bin, args) => {
      listArgs = args;
      return { code: 0, stdout: '[]' };
    };
    await fetchRoadmapItems(exec);
    const listed = listArgs[listArgs.indexOf('--label') + 1] ?? '';

    expect(listed).toBe(ROADMAP_LABEL);
    expect(names).toContain(listed);
    expect(isRoadmapItem([listed])).toBe(true);
  });

  it("waves a contributor's tracking issue carrying the seeded epic label past the template gate", () => {
    const epic = HOUSE_TAXONOMY_LABELS.find((label) => label.name === 'epic');
    // Filed by someone other than the owner, with a body that follows no template.
    const issue: IncomingIssue = {
      number: 7,
      title: 'Track the icon system',
      body: 'Slices to follow.',
      author: GUEST.login,
    };
    const triage = (labels: readonly string[]) =>
      planIssueTriage({ ...issue, labels }, [], [], undefined, undefined, MAINTAINER.login)
        .decision;

    expect(epic?.description).toContain('docs/epics/');
    expect(triage([])).toBe('needs-format');
    expect(triage([epic?.name ?? ''])).toBe('accept');
  });

  it("reads the lucky fit scorer's weighed labels off its source", () => {
    expect(LUCKY_FIT_LABELS).toEqual(expect.arrayContaining(['epic', 'priority: high']));
  });

  it('has the lucky fit scorer weigh only labels a seed source or GitHub itself creates', () => {
    const seeded = new Set([...names, ...POOL_LABEL_NAMES, ...GITHUB_DEFAULT_LABELS]);
    expect(LUCKY_FIT_LABELS.filter((label) => !seeded.has(label))).toEqual([]);
  });

  it('moves the fit for every label the scorer weighs, so each name is a live read', () => {
    const bare = luckyFitOf([]);
    for (const label of LUCKY_FIT_LABELS) {
      expect(luckyFitOf([label]), label).not.toBe(bare);
    }
  });
});

// Same law, KEEPER's DISCUSSIONS ritual: an accepted discussion gets the same
// `pool: <dimension>` label an accepted issue does, and that label is the only
// thing a later pass knows a handled discussion by. Discussions labels are
// GraphQL-only and keyed by node ID, so runDiscussionTriageRitual first looks
// the label up by its exact NAME and holds the reply back when the repo has no
// such label. A pool label spelled apart from what labels.json syncs is never
// an error: every accepted discussion is skipped 'pool-label-unresolved' on
// every pass, and nobody who asked ever hears back.
/** A discussion title the classifier reads as each dimension. `Record` keeps
 *  it whole: typecheck fails the moment DIMENSIONS gains or drops one. */
const DISCUSSION_SIGNAL: Record<Dimension, string> = {
  accessibility: 'Screen reader support for the fleet table',
  cybersecurity: 'A security hole in the settings form',
  ux: 'The fleet table is confusing',
  human_interaction: 'The operator notification never arrives',
  learnings: 'A postmortem on the red landing',
  information: 'The README has a typo',
  data: 'The schema migration drops a column',
  priorities: 'The backlog order ranking is off',
};

/** A repo carrying exactly the labels labels.json syncs, with one open
 *  discussion per {@link DISCUSSION_SIGNAL} title. The label lookup answers
 *  only a name labels.json carries, every post succeeds, and each name the
 *  ritual looks up is pushed onto `lookedUp`. */
function poolSyncedRepo(lookedUp: string[] = []): CliExec {
  const nodes = DIMENSIONS.map((dimension, i) => ({
    id: `D_${i + 1}`,
    number: i + 1,
    title: DISCUSSION_SIGNAL[dimension],
    body: '',
    isAnswered: false,
    locked: false,
    category: { name: 'Ideas' },
    labels: { nodes: [] },
  }));
  return async (_bin, args) => {
    const query = args.find((arg) => arg.startsWith('query=')) ?? '';
    if (query.includes('discussions(states: OPEN')) {
      return {
        code: 0,
        stdout: JSON.stringify({ data: { repository: { discussions: { nodes } } } }),
      };
    }
    if (query.includes('label(name: $label)')) {
      const name = args.find((arg) => arg.startsWith('label='))?.slice('label='.length) ?? '';
      lookedUp.push(name);
      const label = POOL_LABEL_NAMES.includes(name) ? { id: `LA_${name}` } : null;
      return { code: 0, stdout: JSON.stringify({ data: { repository: { label } } }) };
    }
    return { code: 0, stdout: JSON.stringify({ data: {} }) };
  };
}

describe('.github/labels.json × KEEPER discussions ritual (regression, epic 0019 additive-only law)', () => {
  it('accepts one open discussion into each dimension', async () => {
    const { plans } = await runDiscussionTriageRitual(poolSyncedRepo(), MAINTAINER.login);
    const dimensions = plans.map(({ decision }) =>
      decision.decision === 'accept' ? decision.dimension : decision.decision,
    );
    expect(dimensions).toEqual([...DIMENSIONS]);
  });

  it('looks up, for each dimension, the pool label labels.json syncs', async () => {
    const lookedUp: string[] = [];
    await runDiscussionTriageRitual(poolSyncedRepo(lookedUp), MAINTAINER.login);

    expect(lookedUp).toEqual(DIMENSIONS.map((dimension) => `${POOL_LABEL_PREFIX}${dimension}`));
    expect(lookedUp.filter((name) => !POOL_LABEL_NAMES.includes(name))).toEqual([]);
  });

  it('holds no reply back on a repo labels.json has synced, and labels every reply it posts', async () => {
    const { outcomes } = await runDiscussionTriageRitual(poolSyncedRepo(), MAINTAINER.login);

    expect(outcomes).toHaveLength(DIMENSIONS.length);
    for (const outcome of outcomes) {
      const discussion = `#${outcome.discussionNumber}`;
      expect(outcome.skippedReason, discussion).toBeUndefined();
      expect(outcome.replyResult?.code, discussion).toBe(0);
      expect(outcome.labelResult?.code, discussion).toBe(0);
    }
  });

  it('skips each discussion on the next pass once it carries the label it was given', async () => {
    const lookedUp: string[] = [];
    await runDiscussionTriageRitual(poolSyncedRepo(lookedUp), MAINTAINER.login);

    expect(lookedUp).toHaveLength(DIMENSIONS.length);
    DIMENSIONS.forEach((dimension, i) => {
      const next = planDiscussionTriage({
        id: `D_${i + 1}`,
        number: i + 1,
        title: DISCUSSION_SIGNAL[dimension],
        body: '',
        category: 'Ideas',
        isAnswered: false,
        locked: false,
        labels: [lookedUp[i] ?? ''],
      });
      expect(next.decision, dimension).toBe('skip');
    });
  });
});

// Same law, the CLAIM flow's pool leg: the pool client lists every open issue
// and keeps the ones carrying a `pool: <dimension>` label, and a claimed one is
// queued onto the claimer's board under that label's suffix, kept only when it
// names a DIMENSIONS entry (anything else degrades to no dimension rather than
// a task the store refuses). The accept-edit pin above holds labels.json to a
// label for every dimension, not the reverse: a pool label added there, or one
// respelled (`pool: human-interaction`), is still browsed and claimable, but
// every task claimed off it queues with no dimension, and nothing says so.
/** A repo whose open issues carry one labels.json pool label each, numbered in
 *  labels.json's order, every one unassigned and uncommented. */
function poolLabeledRepo(): CliExec {
  const issues = POOL_LABEL_NAMES.map((name, i) => ({
    number: i + 1,
    title: `Filed under ${name}`,
    url: `https://github.com/${MAINTAINER.nameWithOwner}/issues/${i + 1}`,
    labels: [{ name }],
    assignees: [],
    comments: [],
  }));
  return execFor({ 'gh issue list': { code: 0, stdout: JSON.stringify(issues) } });
}

describe('.github/labels.json × the pool claim (regression, epic 0019 additive-only law)', () => {
  it('browses an issue under every pool label labels.json syncs', async () => {
    const pool = await fetchPoolIssues(poolLabeledRepo());

    expect(pool.map((issue) => issue.labels)).toEqual(POOL_LABEL_NAMES.map((name) => [name]));
  });

  it('queues each claimed issue under the dimension its pool label names', async () => {
    const pool = await fetchPoolIssues(poolLabeledRepo());
    const queued = pool.map((issue) => {
      const decision = planClaimPoolIssue(issue, GUEST.login);
      return planPoolIssueTask(issue, decision, 'p1', 100)?.dimension;
    });

    expect(queued).toEqual(POOL_LABEL_NAMES.map((name) => name.slice(POOL_LABEL_PREFIX.length)));
  });
});

// Same law, KEEPER triage × the seeded `declined` label: the maintainer's
// verdict on an issue is a steering input (epic law 2). CONTRIBUTING.md keeps
// a declined issue open for the reporter to argue with ("Disagree? Reply"),
// and KEEPER lists every OPEN issue — so a pass that does not read the label
// boards the issue for the fleet anyway, or asks its reporter to fill in a
// template on an issue that was already answered.
describe("HOUSE_TAXONOMY_LABELS × KEEPER triage's declined issues (regression, epic 0019 additive-only law)", () => {
  const declined = HOUSE_TAXONOMY_LABELS.find((label) => label.name === 'declined');
  // Filed by a contributor on the bug template, like nothing on the board.
  const issue: IncomingIssue = {
    number: 7,
    title: 'The fleet table drops a column',
    body:
      '### What happened?\nA column vanished.\n\n' +
      '### Steps to reproduce\n1. Open the fleet view\n\n' +
      '### Expected behavior\nEvery column shows.\n',
    author: GUEST.login,
  };
  const triage = (labels: readonly string[], body = issue.body) =>
    planIssueTriage({ ...issue, body, labels }, [], [], undefined, undefined, MAINTAINER.login)
      .decision;

  it('seeds the label, with its reason left to a comment', () => {
    expect(declined?.description).toContain('comment');
  });

  it('never boards an open issue the maintainer has declined', () => {
    expect(triage([])).toBe('accept');
    expect(triage([declined?.name ?? ''])).toBe('skip');
  });

  it('never asks a declined issue to fill in the template', () => {
    expect(triage([], 'It broke.')).toBe('needs-format');
    expect(triage([declined?.name ?? ''], 'It broke.')).toBe('skip');
  });
});

// Same law, the pool claim × the seeded `declined` label. An issue KEEPER
// accepted keeps its `pool: <dimension>` label, and the maintainer may decline
// it after that. It stays open for its reporter to reply to, so the pool
// client still lists it. Triage reads the label (above); the claim did not,
// and offered the issue to every co-pilot as claimable, then posted a claim
// and an assignee on an issue the maintainer had already answered no.
describe("HOUSE_TAXONOMY_LABELS × the pool claim's declined issues (regression, epic 0019 additive-only law)", () => {
  const declined = HOUSE_TAXONOMY_LABELS.find((label) => label.name === 'declined')?.name ?? '';
  const pool = `${POOL_LABEL_PREFIX}ux`;
  const issue = (labels: readonly string[]) => ({
    number: 7,
    title: 'The fleet table drops a column',
    url: `https://github.com/${MAINTAINER.nameWithOwner}/issues/7`,
    labels,
    assignees: [],
  });

  it('reads the label the seeder stamps', () => {
    expect(DECLINED_LABEL).toBe(declined);
  });

  it('never offers a declined pool issue to a claimant', () => {
    expect(planClaimPoolIssue(issue([pool]), GUEST.login).decision).toBe('claim');

    const decision = planClaimPoolIssue(issue([pool, declined]), GUEST.login);
    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain(`"${declined}"`);
    expect(planPoolIssueTask(issue([pool, declined]), decision, 'p1', 100)).toBeNull();
  });

  it('spends no gh write on a claim for one', async () => {
    const listed = { ...issue([]), labels: [{ name: pool }, { name: declined }], comments: [] };
    const exec = execFor({
      'gh issue list': { code: 0, stdout: JSON.stringify([listed]) },
      'gh api user': { code: 0, stdout: JSON.stringify({ login: GUEST.login }) },
    });

    const result = await claimPoolIssue(7, exec);

    expect(result.decision.decision).toBe('skip');
    expect(result.commandResults).toEqual([]);
    const ran = vi.mocked(exec).mock.calls.map(([, args]) => args.slice(0, 2).join(' '));
    expect(ran.sort()).toEqual(['api user', 'issue list']);
  });
});

// Same law, the pool claim × the seeded hold labels. The maintainer may put an
// accepted pool issue on hold by hand: `status: awaiting-human` ("waiting on an
// operator/maintainer decision by design") or `status: blocked` ("cannot
// proceed — blocker named in a comment"). Triage holds both (issue-triage.ts
// HOLD_LABELS) and so does the auto-merge (pr-review.ts HOLD_LABEL_MARKERS).
// The claim read only `declined`, so it offered a held issue as claimable,
// then posted a claim and an assignee on it and queued it for a flight.
describe("HOUSE_TAXONOMY_LABELS × the pool claim's held issues (regression, epic 0019 additive-only law)", () => {
  const seeded = (name: string) =>
    HOUSE_TAXONOMY_LABELS.find((label) => label.name === name)?.name ?? '';
  const holds = [seeded('status: awaiting-human'), seeded('status: blocked')];
  const pool = `${POOL_LABEL_PREFIX}ux`;
  const issue = (labels: readonly string[]) => ({
    number: 7,
    title: 'The fleet table drops a column',
    url: `https://github.com/${MAINTAINER.nameWithOwner}/issues/7`,
    labels,
    assignees: [],
  });

  it('reads the labels the seeder stamps', () => {
    expect(HOLD_LABELS).toEqual(holds);
  });

  it.each(holds)('never offers a pool issue held by "%s" to a claimant', (hold) => {
    expect(planClaimPoolIssue(issue([pool]), GUEST.login).decision).toBe('claim');

    const decision = planClaimPoolIssue(issue([pool, hold]), GUEST.login);
    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain(`"${hold}"`);
    expect(planPoolIssueTask(issue([pool, hold]), decision, 'p1', 100)).toBeNull();
  });

  it.each(holds)('spends no gh write on a claim for one held by "%s"', async (hold) => {
    const listed = { ...issue([]), labels: [{ name: pool }, { name: hold }], comments: [] };
    const exec = execFor({
      'gh issue list': { code: 0, stdout: JSON.stringify([listed]) },
      'gh api user': { code: 0, stdout: JSON.stringify({ login: GUEST.login }) },
    });

    const result = await claimPoolIssue(7, exec);

    expect(result.decision.decision).toBe('skip');
    expect(result.commandResults).toEqual([]);
    const ran = vi.mocked(exec).mock.calls.map(([, args]) => args.slice(0, 2).join(' '));
    expect(ran.sort()).toEqual(['api user', 'issue list']);
  });
});

// Same law, the seeder against the doc it applies. docs/GOVERNANCE.md calls
// itself the taxonomy's source of truth, and taxonomy-seed.ts says it only
// transcribes it. Every flow pinned above reads one label off the constant,
// and the doc is where a maintainer looks up the scheme they are steering
// with (epic law 2). The pins above checked the doc's label count and two of
// its names, so a label renamed, swapped or dropped on one side kept every
// test green while the doc and the repo the seeder stamps disagreed.
const GOVERNANCE = readFileSync(join(process.cwd(), 'docs/GOVERNANCE.md'), 'utf8').replace(
  /\r\n/g,
  '\n',
);

/** The `| **<bold>** | <cell> |` rows of the GOVERNANCE.md section headed
 *  `## <heading>`, in doc order. */
function governanceTableRows(heading: string): { readonly key: string; readonly cell: string }[] {
  const section = GOVERNANCE.split(/^## /m).find((part) => part.startsWith(`${heading}\n`)) ?? '';
  return [...section.matchAll(/^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|$/gm)].map((row) => ({
    key: row[1] ?? '',
    cell: row[2] ?? '',
  }));
}

/** A label row's cell leads with its labels as a comma-separated run of code
 *  spans; anything after the run (an em-dash gloss, a parenthesis) is prose,
 *  and the code spans inside it are not labels. */
function leadingCodeSpans(cell: string): string[] {
  const run = /^`[^`]+`(?:, `[^`]+`)*/.exec(cell)?.[0] ?? '';
  return [...run.matchAll(/`([^`]+)`/g)].map((span) => span[1] ?? '');
}

describe('docs/GOVERNANCE.md × the taxonomy seeder (regression, epic 0019 additive-only law)', () => {
  const labelRows = governanceTableRows('The label scheme').map(({ key, cell }) => ({
    group: key,
    labels: leadingCodeSpans(cell),
  }));
  const milestoneRows = governanceTableRows('Starter milestones');

  it('reads both tables at all, so the pins below are not vacuous', () => {
    expect(labelRows.map((row) => row.group)).toEqual([
      'priority',
      'area',
      'status',
      'epic',
      'community',
    ]);
    expect(labelRows.every((row) => row.labels.length > 0)).toBe(true);
    expect(milestoneRows.length).toBeGreaterThan(0);
  });

  it('names exactly the labels the seeder stamps, in the order it stamps them', () => {
    expect(labelRows.flatMap((row) => row.labels)).toEqual(
      HOUSE_TAXONOMY_LABELS.map((label) => label.name),
    );
  });

  it('files each prefixed label under the group its prefix names', () => {
    for (const { group, labels } of labelRows) {
      const prefixed = labels.filter((label) => label.includes(': '));
      const expected = ['priority', 'area', 'status'].includes(group) ? labels : [];
      expect(prefixed, group).toEqual(expected);
      expect(
        prefixed.filter((label) => !label.startsWith(`${group}: `)),
        group,
      ).toEqual([]);
    }
  });

  it('lists exactly the starter milestones the seeder creates, each with the description it writes', () => {
    expect(milestoneRows.map(({ key, cell }) => ({ title: key, description: cell }))).toEqual(
      HOUSE_STARTER_MILESTONES.map(({ title, description }) => ({ title, description })),
    );
  });

  it('stamps none of the labels the doc leaves to another source', () => {
    // The doc keeps GitHub's defaults and the pool set out of the seeder, so
    // labels.yml stays the one writer of a pool label's colour and description.
    const outOfScope = new Set([...GITHUB_DEFAULT_LABELS, ...POOL_LABEL_NAMES]);
    expect(GOVERNANCE).toContain('.github/labels.json');
    expect(HOUSE_TAXONOMY_LABELS.filter((label) => outOfScope.has(label.name))).toEqual([]);
    expect(
      HOUSE_TAXONOMY_LABELS.filter((label) => label.name.startsWith(POOL_LABEL_PREFIX)),
    ).toEqual([]);
  });
});
