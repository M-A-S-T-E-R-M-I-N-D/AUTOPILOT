// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  HOUSE_TAXONOMY_LABELS,
  HOUSE_STARTER_MILESTONES,
  planTaxonomySeed,
  fetchExistingLabelNames,
  fetchExistingMilestoneTitles,
  executeTaxonomySeed,
  runTaxonomySeed,
  type TaxonomySeedAction,
} from '../../src/flight/taxonomy-seed.js';
import type { CliExec } from '../../src/connection/cli-probe.js';
import type { SocialIdentity } from '../../src/flight/social-pass.js';

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
