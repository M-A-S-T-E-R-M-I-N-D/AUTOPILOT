// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k), the taxonomy seeder
// × a house label the repo already carries in another casing. GitHub keeps one
// label per name in any casing, and `gh label create --force` upserts onto
// that label, so a seed run on a repo whose label reads `Priority: High`
// overwrites its color and description. The planner matched the live names
// exactly, so the dry run (082ca978) listed that label as `create label
// "priority: high"` and kept back the one warning it exists to give.

import { describe, it, expect, vi } from 'vitest';
import {
  HOUSE_TAXONOMY_LABELS,
  planTaxonomySeed,
  runTaxonomySeed,
  summarizeTaxonomySeed,
  type TaxonomySeedAction,
} from '../../src/flight/taxonomy-seed.js';
import type { CliExec } from '../../src/connection/cli-probe.js';
import type { SocialIdentity } from '../../src/flight/social-pass.js';

const MAINTAINER: SocialIdentity = {
  login: 'octocat',
  nameWithOwner: 'octocat/hello-world',
  role: 'maintainer',
};

const titleCase = (name: string): string => name.replace(/\b\w/g, (c) => c.toUpperCase());

const variants = [
  ['priority: high', 'Priority: High'],
  ['priority: high', 'PRIORITY: HIGH'],
  ['area: flight-engine', 'Area: Flight-Engine'],
  ['status: needs-format', 'Status: Needs-Format'],
  ['epic', 'Epic'],
  ['agent-ok', 'Agent-OK'],
] as const;

// Different labels to GitHub, so the house label is still missing.
const nearMisses = [
  ['area: flight-engine', 'area: flight engine'],
  ['priority: high', 'priority:high'],
  ['priority: high', 'priorities: high'],
  ['epic', 'epics'],
] as const;

const kindOf = (actions: readonly TaxonomySeedAction[], name: string): string | undefined =>
  actions.find((a) => a.kind !== 'create-milestone' && a.label.name === name)?.kind;

/** A maintainer's repo whose label list reads `live`; every call recorded. */
function repoWithLabels(live: readonly string[]): { exec: CliExec; calls: string[] } {
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
    if (key.includes('label list')) {
      return { code: 0, stdout: JSON.stringify(live.map((name) => ({ name }))) };
    }
    return { code: 0, stdout: '' };
  });
  return { exec, calls };
}

describe('the taxonomy seeder × a house label in any casing (regression, epic 0019 additive-only law)', () => {
  it.each(variants)('plans "%s" as an update when the repo carries "%s"', (house, live) => {
    const plan = planTaxonomySeed(MAINTAINER, new Set([live]), new Set(), { labelsOnly: true });

    expect(kindOf(plan.actions, house)).toBe('update-label');
  });

  it.each(nearMisses)('still plans "%s" as a create next to "%s"', (house, live) => {
    const plan = planTaxonomySeed(MAINTAINER, new Set([live]), new Set(), { labelsOnly: true });

    expect(kindOf(plan.actions, house)).toBe('create-label');
  });

  it('the dry run warns of the overwrite for every house label the repo carries title-cased', async () => {
    const { exec, calls } = repoWithLabels(HOUSE_TAXONOMY_LABELS.map((l) => titleCase(l.name)));

    const report = await runTaxonomySeed(exec, { dryRun: true, labelsOnly: true });
    const { lines } = summarizeTaxonomySeed(report, { dryRun: true, labelsOnly: true });

    expect(lines.slice(1)).toEqual(
      HOUSE_TAXONOMY_LABELS.map(
        (l) => `      - update label "${l.name}" (overwrites its color and description)`,
      ),
    );
    expect(calls.filter((call) => call.includes('label create'))).toEqual([]);
  });

  it('a real run still upserts each house label by its house name, once', async () => {
    const { exec, calls } = repoWithLabels(HOUSE_TAXONOMY_LABELS.map((l) => titleCase(l.name)));

    const report = await runTaxonomySeed(exec, { labelsOnly: true });

    expect(report.result?.failed).toEqual([]);
    expect(calls.filter((call) => call.includes('label create'))).toEqual(
      HOUSE_TAXONOMY_LABELS.map(
        (l) =>
          `gh label create ${l.name} --color ${l.color} --description ${l.description} --force`,
      ),
    );
  });
});
