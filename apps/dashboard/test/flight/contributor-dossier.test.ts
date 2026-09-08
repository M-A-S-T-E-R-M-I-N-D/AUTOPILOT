// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  PARTNER_APPLICATION_LABEL,
  DOSSIER_POSTED_LABEL,
  isPartnerApplicationIssue,
  formatContributorDossier,
  fetchContributorFacts,
  planContributorDossierCommands,
  type ContributorFacts,
} from '../../src/flight/contributor-dossier.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

describe('isPartnerApplicationIssue', () => {
  it('is true when the partner-application label is present', () => {
    expect(isPartnerApplicationIssue([PARTNER_APPLICATION_LABEL])).toBe(true);
    expect(isPartnerApplicationIssue(['pool: ux', PARTNER_APPLICATION_LABEL])).toBe(true);
  });

  it('is false for an ordinary issue', () => {
    expect(isPartnerApplicationIssue([])).toBe(false);
    expect(isPartnerApplicationIssue(['pool: ux', 'duplicate'])).toBe(false);
  });
});

describe('formatContributorDossier', () => {
  const nowMs = Date.parse('2026-09-08T00:00:00Z');

  it('renders every fact line when the applicant has a full history', () => {
    const facts: ContributorFacts = {
      login: 'gabibi555',
      accountCreatedAt: '2024-09-08T00:00:00Z',
      publicRepos: 12,
      followers: 34,
      mergedPrCount: 2,
      mergedPrTitles: ['Fix the flaky test', 'Add a missing type'],
      dcoCleanCount: 3,
      dcoTotalChecked: 4,
    };

    const text = formatContributorDossier(facts, nowMs);

    expect(text).toContain('### KEEPER evidence dossier — @gabibi555');
    expect(text).toContain('account age: 730d (~2.0y), created 2024-09-08T00:00:00Z');
    expect(text).toContain('public repos: 12 · followers: 34');
    expect(text).toContain('merged with us: 2 PR(s) — "Fix the flaky test", "Add a missing type"');
    expect(text).toContain('DCO cleanliness: 3/4 merged commit(s) carry Signed-off-by');
    expect(text).toContain('The maintainer decides');
  });

  it('degrades every unavailable fact to an explicit unknown/none line, never throwing', () => {
    const facts: ContributorFacts = {
      login: 'freshaccount',
      accountCreatedAt: null,
      publicRepos: null,
      followers: null,
      mergedPrCount: 0,
      mergedPrTitles: [],
      dcoCleanCount: 0,
      dcoTotalChecked: 0,
    };

    const text = formatContributorDossier(facts, nowMs);

    expect(text).toContain('account age: unknown (gh api lookup failed)');
    expect(text).toContain('public repos: unknown (gh api lookup failed)');
    expect(text).toContain('merged with us: none yet');
    expect(text).toContain('DCO cleanliness: no merged commits to check yet');
  });

  it('reports an unparseable created_at distinctly from a failed lookup', () => {
    const facts: ContributorFacts = {
      login: 'weird',
      accountCreatedAt: 'not-a-date',
      publicRepos: 1,
      followers: 0,
      mergedPrCount: 0,
      mergedPrTitles: [],
      dcoCleanCount: 0,
      dcoTotalChecked: 0,
    };

    expect(formatContributorDossier(facts, nowMs)).toContain(
      'account age: unknown (unparseable created_at)',
    );
  });
});

describe('fetchContributorFacts', () => {
  it('parses account facts and merged-PR DCO cleanliness off two gh calls', async () => {
    const exec: CliExec = vi.fn(async (_bin, args) => {
      if (args[0] === 'api') {
        return {
          code: 0,
          stdout: JSON.stringify({
            created_at: '2024-01-01T00:00:00Z',
            public_repos: 5,
            followers: 9,
          }),
        };
      }
      if (args[0] === 'pr' && args[1] === 'list') {
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              title: 'Fix a bug',
              commits: [
                { messageBody: 'body text\n\nSigned-off-by: A <a@example.com>' },
                { messageBody: 'no trailer here' },
              ],
            },
            { title: 'Add a feature', commits: [{ messageBody: 'Signed-off-by: A <a@example.com>' }] },
          ]),
        };
      }
      return { code: 1, stdout: '' };
    });

    const facts = await fetchContributorFacts('gabibi555', exec);

    expect(facts).toEqual({
      login: 'gabibi555',
      accountCreatedAt: '2024-01-01T00:00:00Z',
      publicRepos: 5,
      followers: 9,
      mergedPrCount: 2,
      mergedPrTitles: ['Fix a bug', 'Add a feature'],
      dcoCleanCount: 2,
      dcoTotalChecked: 3,
    });
    expect(exec).toHaveBeenCalledWith('gh', ['api', 'users/gabibi555']);
    expect(exec).toHaveBeenCalledWith('gh', [
      'pr',
      'list',
      '--state',
      'merged',
      '--author',
      'gabibi555',
      '--json',
      'title,commits',
      '--limit',
      '50',
    ]);
  });

  it('degrades to unknown/zero facts when both gh calls fail, never throwing', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });

    const facts = await fetchContributorFacts('nobody', exec);

    expect(facts).toEqual({
      login: 'nobody',
      accountCreatedAt: null,
      publicRepos: null,
      followers: null,
      mergedPrCount: 0,
      mergedPrTitles: [],
      dcoCleanCount: 0,
      dcoTotalChecked: 0,
    });
  });

  it('degrades gracefully when exec throws', async () => {
    const exec: CliExec = vi.fn().mockRejectedValue(new Error('gh not on PATH'));

    const facts = await fetchContributorFacts('nobody', exec);

    expect(facts.accountCreatedAt).toBeNull();
    expect(facts.mergedPrCount).toBe(0);
  });

  it('degrades gracefully on unparseable JSON from either call', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: 'not json' });

    const facts = await fetchContributorFacts('nobody', exec);

    expect(facts.accountCreatedAt).toBeNull();
    expect(facts.mergedPrCount).toBe(0);
  });
});

describe('planContributorDossierCommands', () => {
  it('plans a dossier-posted label edit followed by the dossier comment', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '[]' });

    const commands = await planContributorDossierCommands(42, 'gabibi555', exec, 1000);

    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual({
      command: 'gh',
      args: ['issue', 'edit', '42', '--add-label', DOSSIER_POSTED_LABEL],
      details: `labeling #42 "${DOSSIER_POSTED_LABEL}" so later KEEPER passes skip it`,
    });
    expect(commands[1]?.command).toBe('gh');
    expect(commands[1]?.args.slice(0, 3)).toEqual(['issue', 'comment', '42']);
    expect(commands[1]?.args[3]).toBe('--body');
    expect(commands[1]?.args[4]).toContain('@gabibi555');
  });

  it('plans nothing when the applicant login is empty', async () => {
    const exec: CliExec = vi.fn();

    const commands = await planContributorDossierCommands(42, '', exec, 1000);

    expect(commands).toEqual([]);
    expect(exec).not.toHaveBeenCalled();
  });
});
