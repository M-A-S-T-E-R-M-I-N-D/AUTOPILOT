// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k), the stale-claim
// reaper × the claim protocol. `/claim` (claim.yml) assigns its author and adds
// the seeded `claimed` label; both of the protocol's own releases, `/unclaim`
// and the scheduled stale-claim-reaper.yml, remove the assignee and the label
// together. The steward's reaper (the mirror pass's "Free stale claim(s)" and
// the flight-end sweep) removed the assignee only. Once it had freed a quiet
// `/claim`, the issue stayed labeled `claimed` with nobody on it, and the
// workflow reaper, which only looks at a `claimed` issue that still has an
// assignee, never cleared it either.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fetchClaimedIssueClaims,
  planMirrorPassStaleClaimBatch,
  type MirrorPassCommand,
} from '../../src/flight/mirror-pass.js';
import { runStaleClaimSweep } from '../../src/flight/post-flight-sweeps.js';
import { CLAIM_RELEASE_RE, claimLedger } from '../../src/flight/claim-ledger.js';
import { HOUSE_TAXONOMY_LABELS } from '../../src/flight/taxonomy-seed.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

const CLAIMED = HOUSE_TAXONOMY_LABELS.find((label) => label.name === 'claimed')?.name ?? '';
const NOW = Date.parse('2026-10-04T00:00:00Z');
const QUIET_SINCE = '2026-09-01T00:00:00Z';
const ACTIVE_SINCE = '2026-10-02T00:00:00Z';

interface ViewedIssue {
  readonly number: number;
  readonly labels: readonly string[];
  readonly assignees: readonly string[];
  readonly comments: ReadonlyArray<{ author: string; createdAt: string; body: string }>;
}

/** `gh issue view <n> --json ...` answered as GitHub shapes it, updated last
 *  by its latest comment. */
function viewed(issue: ViewedIssue): object {
  const commentedAt = issue.comments.map((c) => c.createdAt).sort();
  return {
    number: issue.number,
    title: `issue #${issue.number}`,
    url: `https://github.com/owner/hello-world/issues/${issue.number}`,
    state: 'OPEN',
    labels: issue.labels.map((name) => ({ name })),
    assignees: issue.assignees.map((login) => ({ login })),
    comments: issue.comments.map((c) => ({
      author: { login: c.author },
      createdAt: c.createdAt,
      body: c.body,
    })),
    updatedAt: commentedAt.at(-1) ?? QUIET_SINCE,
  };
}

/** A `/claim` through the protocol: the workflow assigned `login` and added
 *  `claimed`; the claimant's `/claim` comment is the only activity. */
function protocolClaim(
  login: string,
  since: string,
  labels: readonly string[] = ['pool: ux', CLAIMED],
): ViewedIssue {
  return {
    number: 42,
    labels,
    assignees: [login],
    comments: [{ author: login, createdAt: since, body: '/claim' }],
  };
}

async function reapCommands(issue: ViewedIssue): Promise<readonly MirrorPassCommand[]> {
  const exec: CliExec = vi.fn(async () => ({ code: 0, stdout: JSON.stringify(viewed(issue)) }));
  const claims = await fetchClaimedIssueClaims(exec, issue.number);
  return planMirrorPassStaleClaimBatch(claims, NOW).flatMap((plan) => plan.commands);
}

function workflow(name: string): string {
  return readFileSync(join(process.cwd(), '.github/workflows', name), 'utf8');
}

describe('the claim protocol lifts `claimed` wherever it unassigns', () => {
  it.each(['claim.yml', 'stale-claim-reaper.yml'])(
    '%s removes the label with the assignee',
    (file) => {
      const text = workflow(file);
      expect(text).toMatch(/-X DELETE "repos\/\$REPO\/issues\/\$NUM\/assignees"/);
      expect(text).toContain(`--remove-label ${CLAIMED}`);
    },
  );
});

describe('the stale-claim reaper × the claim protocol (regression, epic 0019 additive-only law)', () => {
  it('lifts `claimed` in the same edit that unassigns a quiet sole assignee', async () => {
    const commands = await reapCommands(protocolClaim('gabibi555', QUIET_SINCE));

    expect(commands.map((c) => c.args.slice(0, 2))).toEqual([
      ['issue', 'comment'],
      ['issue', 'edit'],
    ]);
    expect(commands[1]?.args).toEqual([
      'issue',
      'edit',
      '42',
      '--remove-assignee',
      'gabibi555',
      '--remove-label',
      CLAIMED,
    ]);
    expect(commands[1]?.details).toContain(`"${CLAIMED}"`);
  });

  it.each(['Claimed', 'CLAIMED'])(
    'removes the label as the issue carries it, here "%s"',
    async (spelling) => {
      const commands = await reapCommands(
        protocolClaim('gabibi555', QUIET_SINCE, ['pool: ux', spelling]),
      );

      expect(commands[1]?.args.slice(-2)).toEqual(['--remove-label', spelling]);
    },
  );

  it('the flight-end sweep sends the lifted label with its unassign', async () => {
    const calls: Array<readonly string[]> = [];
    const issue = protocolClaim('gabibi555', QUIET_SINCE);
    const exec: CliExec = vi.fn(async (_bin, args) => {
      calls.push(args);
      if (args[0] === 'api' && args[1] === 'user') {
        return { code: 0, stdout: JSON.stringify({ login: 'owner' }) };
      }
      if (args[0] === 'repo' && args[1] === 'view') {
        return {
          code: 0,
          stdout: JSON.stringify({
            nameWithOwner: 'owner/hello-world',
            url: 'https://github.com/owner/hello-world',
            isPrivate: false,
          }),
        };
      }
      if (args[0] === 'issue' && args[1] === 'list') {
        return { code: 0, stdout: JSON.stringify([viewed(issue)]) };
      }
      if (args[0] === 'issue' && args[1] === 'view') {
        return { code: 0, stdout: JSON.stringify(viewed(issue)) };
      }
      return { code: 0, stdout: '' };
    });

    await runStaleClaimSweep(() => NOW, exec);

    expect(calls.filter((args) => args[0] === 'issue' && args[1] === 'edit')).toEqual([
      ['issue', 'edit', '42', '--remove-assignee', 'gabibi555', '--remove-label', CLAIMED],
    ]);
  });

  describe('the neighboring reaper flows stay as they were', () => {
    it('an issue without the label gets the plain unassign', async () => {
      const commands = await reapCommands(protocolClaim('gabibi555', QUIET_SINCE, ['pool: ux']));

      expect(commands[1]?.args).toEqual(['issue', 'edit', '42', '--remove-assignee', 'gabibi555']);
    });

    it('a comment-only claim is released by its note alone, the label left in place', async () => {
      const commands = await reapCommands({
        number: 42,
        labels: ['pool: ux', CLAIMED],
        assignees: [],
        comments: [
          {
            author: 'gabibi555',
            createdAt: QUIET_SINCE,
            body: 'Claimed by gabibi555 via the pool client.',
          },
        ],
      });

      expect(commands.map((c) => c.args[1])).toEqual(['comment']);
    });

    it('a claimant still within the window is not reaped at all', async () => {
      expect(await reapCommands(protocolClaim('gabibi555', ACTIVE_SINCE))).toEqual([]);
    });

    it('keeps the label while another assignee still holds the issue', async () => {
      const commands = await reapCommands({
        number: 42,
        labels: ['pool: ux', CLAIMED],
        assignees: ['gabibi555', 'octocat'],
        comments: [
          {
            author: 'gabibi555',
            createdAt: QUIET_SINCE,
            body: 'Claimed by gabibi555 via the pool client.',
          },
          {
            author: 'octocat',
            createdAt: ACTIVE_SINCE,
            body: 'Also claimed by octocat via the pool client (contested).',
          },
        ],
      });

      expect(commands.filter((c) => c.args[1] === 'edit').map((c) => c.args)).toEqual([
        ['issue', 'edit', '42', '--remove-assignee', 'gabibi555'],
      ]);
    });

    it('the note still reads as the release to the claims ledger', async () => {
      const commands = await reapCommands(protocolClaim('gabibi555', QUIET_SINCE));
      const note = commands[0]?.args[4] ?? '';

      expect(CLAIM_RELEASE_RE.exec(note)?.[1]).toBe('gabibi555');
      expect(
        claimLedger(
          ['gabibi555'],
          [
            { author: 'gabibi555', createdAt: Date.parse(QUIET_SINCE), body: '/claim' },
            { author: 'owner', createdAt: NOW, body: note },
          ],
        ),
      ).toEqual([]);
    });
  });
});
