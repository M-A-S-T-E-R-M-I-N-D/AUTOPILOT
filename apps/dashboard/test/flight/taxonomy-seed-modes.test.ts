// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The seeder's two narrowing modes (board ap-musvu2h1-2, epic 0019). A repo
 * that already carries milestones of its own could not be re-seeded without
 * the three generic starter milestones landing next to them, and the only
 * way to learn that was to read the planner (debrief
 * 2026-10-03-verdict-ap-mui04ldw-0-needs-format-already-live.md, "What
 * running it now would also do"). `--labels-only` drops the starter set;
 * `--dry-run` reads the live repo, plans, and writes nothing.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  HOUSE_TAXONOMY_LABELS,
  HOUSE_STARTER_MILESTONES,
  describeTaxonomySeedAction,
  parseTaxonomySeedArgs,
  planTaxonomySeed,
  runTaxonomySeed,
  summarizeTaxonomySeed,
  type TaxonomySeedAction,
  type TaxonomySeedReport,
} from '../../src/flight/taxonomy-seed.js';
import type { CliExec } from '../../src/connection/cli-probe.js';
import type { SocialIdentity } from '../../src/flight/social-pass.js';

const MAINTAINER: SocialIdentity = {
  login: 'octocat',
  nameWithOwner: 'octocat/hello-world',
  role: 'maintainer',
};

const LABEL = HOUSE_TAXONOMY_LABELS[0]!;
const MILESTONE = HOUSE_STARTER_MILESTONES[0]!;

/** A maintainer's repo with no labels and no milestones yet. Every call is
 *  recorded as one joined string so a test can ask what was written. */
function bareMaintainerRepo(): { exec: CliExec; calls: string[] } {
  const calls: string[] = [];
  const exec: CliExec = vi.fn(async (bin: string, args: readonly string[]) => {
    const key = [bin, ...args].join(' ');
    calls.push(key);
    if (key.includes('gh api user')) {
      return { code: 0, stdout: JSON.stringify({ login: MAINTAINER.login }) };
    }
    if (key.includes('gh repo view')) {
      return {
        code: 0,
        stdout: JSON.stringify({
          nameWithOwner: MAINTAINER.nameWithOwner,
          url: `https://github.com/${MAINTAINER.nameWithOwner}`,
          isPrivate: false,
        }),
      };
    }
    if (key.includes('label list') || key.includes('milestones?')) return { code: 0, stdout: '[]' };
    return { code: 0, stdout: '' };
  });
  return { exec, calls };
}

/** A label upsert, or the milestone POST (`gh api ... -f title=...`). */
const isWrite = (call: string): boolean => call.includes('label create') || call.includes(' -f ');

describe('parseTaxonomySeedArgs', () => {
  it('reads no flags as a full, writing seed', () => {
    expect(parseTaxonomySeedArgs([])).toEqual({ ok: true, options: {} });
  });

  it('reads --labels-only and --dry-run, in either order', () => {
    expect(parseTaxonomySeedArgs(['--labels-only'])).toEqual({
      ok: true,
      options: { labelsOnly: true },
    });
    expect(parseTaxonomySeedArgs(['--dry-run', '--labels-only'])).toEqual({
      ok: true,
      options: { labelsOnly: true, dryRun: true },
    });
  });

  it('refuses a flag it does not know, so a mistyped --dry-run never falls through to a write', () => {
    expect(parseTaxonomySeedArgs(['--dryrun'])).toEqual({ ok: false, unknown: '--dryrun' });
    expect(parseTaxonomySeedArgs(['--labels-only', 'extra'])).toEqual({
      ok: false,
      unknown: 'extra',
    });
  });
});

describe('planTaxonomySeed × labelsOnly', () => {
  it('plans every house label and no starter milestone on a bare repo', () => {
    const plan = planTaxonomySeed(MAINTAINER, new Set(), new Set(), { labelsOnly: true });

    expect(plan.actions).toHaveLength(HOUSE_TAXONOMY_LABELS.length);
    expect(plan.actions.filter((a) => a.kind === 'create-milestone')).toEqual([]);
  });
});

describe('runTaxonomySeed × the narrowing modes', () => {
  it('--labels-only writes every house label, no milestone, and never reads the milestones', async () => {
    const { exec, calls } = bareMaintainerRepo();

    const report = await runTaxonomySeed(exec, { labelsOnly: true });

    expect(report.result?.applied).toHaveLength(HOUSE_TAXONOMY_LABELS.length);
    expect(report.result?.failed).toEqual([]);
    expect(calls.filter((call) => call.includes('milestones'))).toEqual([]);
  });

  it('--dry-run reads the live repo and plans, but writes nothing', async () => {
    const { exec, calls } = bareMaintainerRepo();

    const report = await runTaxonomySeed(exec, { dryRun: true });

    expect(report.plan.actions).toHaveLength(
      HOUSE_TAXONOMY_LABELS.length + HOUSE_STARTER_MILESTONES.length,
    );
    expect(report.result).toBeUndefined();
    expect(calls.some((call) => call.includes('label list'))).toBe(true);
    expect(calls.some((call) => call.includes('milestones?state=all'))).toBe(true);
    expect(calls.filter(isWrite)).toEqual([]);
  });

  it('--dry-run --labels-only plans the labels alone and writes nothing', async () => {
    const { exec, calls } = bareMaintainerRepo();

    const report = await runTaxonomySeed(exec, { dryRun: true, labelsOnly: true });

    expect(report.plan.actions).toHaveLength(HOUSE_TAXONOMY_LABELS.length);
    expect(calls.filter(isWrite)).toEqual([]);
  });
});

describe('describeTaxonomySeedAction', () => {
  it('names what each kind of action would do, by label name or milestone title', () => {
    expect(describeTaxonomySeedAction({ kind: 'create-label', label: LABEL })).toBe(
      `create label "${LABEL.name}"`,
    );
    expect(describeTaxonomySeedAction({ kind: 'create-milestone', milestone: MILESTONE })).toBe(
      `create milestone "${MILESTONE.title}"`,
    );
  });

  it('warns that an update overwrites the live color and description', () => {
    // `gh label create --force` rewrites both, so a label someone recolored
    // by hand goes back to the seed's values (the debrief's item 2).
    expect(describeTaxonomySeedAction({ kind: 'update-label', label: LABEL })).toBe(
      `update label "${LABEL.name}" (overwrites its color and description)`,
    );
  });
});

describe('summarizeTaxonomySeed', () => {
  const labelAction: TaxonomySeedAction = { kind: 'create-label', label: LABEL };
  const milestoneAction: TaxonomySeedAction = { kind: 'create-milestone', milestone: MILESTONE };

  it('keeps the declined lines for an unresolved identity and a guest', () => {
    expect(
      summarizeTaxonomySeed({
        plan: { identity: undefined, actions: [], skippedReason: 'identity-unresolved' },
        result: undefined,
      }),
    ).toEqual({
      ok: false,
      lines: ['[!!] taxonomy-seed: could not resolve a GitHub identity — nothing seeded'],
    });

    const guest: SocialIdentity = { ...MAINTAINER, login: 'a-contributor', role: 'user' };
    expect(
      summarizeTaxonomySeed({
        plan: { identity: guest, actions: [], skippedReason: 'guest' },
        result: undefined,
      }),
    ).toEqual({
      ok: false,
      lines: [
        '[!!] taxonomy-seed: a-contributor is a guest on octocat/hello-world — nothing seeded ' +
          '(role honesty, epic 0019 law 1)',
      ],
    });
  });

  it('reports applied and failed counts for a writing run, red on any failure', () => {
    const report: TaxonomySeedReport = {
      plan: { identity: MAINTAINER, actions: [labelAction, milestoneAction] },
      result: { applied: [labelAction], failed: [milestoneAction] },
    };

    expect(summarizeTaxonomySeed(report)).toEqual({
      ok: false,
      lines: ['[!!] taxonomy-seed: 1 applied, 1 failed on octocat/hello-world'],
    });
  });

  it('says a labels-only run skipped the starter milestones', () => {
    const report: TaxonomySeedReport = {
      plan: { identity: MAINTAINER, actions: [labelAction] },
      result: { applied: [labelAction], failed: [] },
    };

    expect(summarizeTaxonomySeed(report, { labelsOnly: true })).toEqual({
      ok: true,
      lines: [
        '[ok] taxonomy-seed: 1 applied, 0 failed on octocat/hello-world ' +
          '(labels only — starter milestones skipped)',
      ],
    });
  });

  it('lists every planned action on a dry run and says nothing was written', () => {
    const report: TaxonomySeedReport = {
      plan: { identity: MAINTAINER, actions: [labelAction, milestoneAction] },
      result: undefined,
    };

    expect(summarizeTaxonomySeed(report, { dryRun: true })).toEqual({
      ok: true,
      lines: [
        '[ok] taxonomy-seed: dry run on octocat/hello-world — 2 planned, nothing written',
        `      - create label "${LABEL.name}"`,
        `      - create milestone "${MILESTONE.title}"`,
      ],
    });
  });
});
