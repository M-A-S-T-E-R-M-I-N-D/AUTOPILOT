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
  type TaxonomySeedAction,
} from '../../src/flight/taxonomy-seed.js';
import {
  DOSSIER_POSTED_LABEL,
  PARTNER_APPLICATION_LABEL,
} from '../../src/flight/contributor-dossier.js';
import {
  AGENT_OK_LABEL,
  MAX_ISSUE_LIST,
  NEEDS_FORMAT_LABEL,
  POOL_LABEL_PREFIX,
  planIssueTriageCommands,
  type AreaLabel,
  type IncomingIssue,
  type PriorityLabel,
} from '../../src/flight/issue-triage.js';
import { planBoardIssueExportCommands } from '../../src/flight/board-issue-export.js';
import { HELP_WANTED_LABEL } from '../../src/flight/help-wanted-items.js';
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
  // that edit on an unseeded name, and executeIssueTriageCommands still runs
  // the comment after it — so the marker never landed, and every later KEEPER
  // pass re-decided 'dossier' and re-posted, with only the anti-flood guard
  // standing between the applicant's issue and a repeat dossier.
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
const POOL_LABEL_NAMES: readonly string[] = (
  JSON.parse(readFileSync(join(process.cwd(), '.github/labels.json'), 'utf8')) as {
    readonly name: string;
  }[]
).map((label) => label.name);

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

// Same law, the CLAIM flow (docs/ROADMAP.md "How work gets shared"): claim.yml
// puts `claimed` on a /claim'd issue, stale-claim-reaper.yml finds claims by
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
