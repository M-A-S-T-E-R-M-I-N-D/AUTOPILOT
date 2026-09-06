// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  issueNumberFromTaskId,
  planMirrorPassReconcile,
  planMirrorPassCommands,
  planMirrorPassBatch,
  fetchIssueState,
  fetchMirrorPassIssueStates,
  planMirrorPassLandingNote,
  planMirrorPassLandingNoteCommand,
  planMirrorPassLandingNoteBatch,
  fetchIssueComments,
  fetchMirrorPassIssueComments,
  extractReadmeVersionClaim,
  planMirrorPassVersionDrift,
  planMirrorPassVersionDriftCommand,
  readMirrorPassVersionDrift,
  extractPackageCountClaim,
  countThirdPartyLicenseRows,
  planMirrorPassCountsDrift,
  planMirrorPassCountsDriftCommand,
  readMirrorPassCountsDrift,
  extractInternalDocLinks,
  planMirrorPassLinkDrift,
  planMirrorPassLinkDriftCommand,
  readMirrorPassLinkDrift,
  planMirrorPassStaleClaimReaper,
  planMirrorPassStaleClaimCommands,
  fetchClaimedIssueActivity,
  type MirrorPassTaskCandidate,
  type MirrorPassIssueState,
  type MirrorPassClaimedIssue,
} from '../../src/flight/mirror-pass.js';
import type { CliExec } from '../../src/connection/cli-probe.js';
import { STALE_TASK_DAYS } from '../../src/web/task-queue.js';

describe('issueNumberFromTaskId', () => {
  it('parses the github-<n> task id convention', () => {
    expect(issueNumberFromTaskId('github-42')).toBe(42);
  });

  it('returns null for a non-github task id', () => {
    expect(issueNumberFromTaskId('web-abc123')).toBeNull();
    expect(issueNumberFromTaskId('backlog:3')).toBeNull();
  });
});

function task(overrides: Partial<MirrorPassTaskCandidate> = {}): MirrorPassTaskCandidate {
  return { id: 'github-42', status: 'done', landedSha: null, ...overrides };
}

describe('planMirrorPassReconcile', () => {
  it('plans a close-with-landing-note when the board is done but the issue is still open', () => {
    const finding = planMirrorPassReconcile(task({ status: 'done', landedSha: 'abc1234' }), {
      number: 42,
      state: 'open',
    });

    expect(finding).toMatchObject({
      action: 'close-with-landing-note',
      taskId: 'github-42',
      issueNumber: 42,
      sha: 'abc1234',
    });
    expect(finding?.comment).toContain('abc1234');
  });

  it('closes without a SHA reference when no landing commit was recorded', () => {
    const finding = planMirrorPassReconcile(task({ status: 'done', landedSha: null }), {
      number: 42,
      state: 'open',
    });

    expect(finding).toMatchObject({ action: 'close-with-landing-note', sha: null });
    expect(finding?.comment).not.toContain('Landed in');
  });

  it('plans a reopen-honestly when the issue is closed but the board task is not done', () => {
    const finding = planMirrorPassReconcile(task({ status: 'in_progress' }), {
      number: 42,
      state: 'closed',
    });

    expect(finding).toMatchObject({
      action: 'reopen-honestly',
      taskId: 'github-42',
      issueNumber: 42,
    });
    expect(finding?.comment).toContain('in_progress');
  });

  it('returns null when the board and issue already agree (done + closed)', () => {
    expect(
      planMirrorPassReconcile(task({ status: 'done' }), { number: 42, state: 'closed' }),
    ).toBeNull();
  });

  it('returns null when the board and issue already agree (not done + open)', () => {
    expect(
      planMirrorPassReconcile(task({ status: 'queued' }), { number: 42, state: 'open' }),
    ).toBeNull();
  });

  it('returns null for a task not sourced from a github issue', () => {
    expect(
      planMirrorPassReconcile(task({ id: 'web-abc123', status: 'done' }), {
        number: 42,
        state: 'open',
      }),
    ).toBeNull();
  });

  it('returns null rather than guessing when the issue fetch failed', () => {
    expect(planMirrorPassReconcile(task({ status: 'done' }), undefined)).toBeNull();
  });
});

describe('planMirrorPassCommands', () => {
  it('plans the comment before the close for a close-with-landing-note finding', () => {
    const commands = planMirrorPassCommands({
      action: 'close-with-landing-note',
      taskId: 'github-42',
      issueNumber: 42,
      sha: 'abc1234',
      comment: 'Landed in abc1234 — closing.',
    });

    expect(commands).toHaveLength(2);
    expect(commands[0]).toMatchObject({
      command: 'gh',
      args: ['issue', 'comment', '42', '--body', 'Landed in abc1234 — closing.'],
    });
    expect(commands[1]).toMatchObject({ command: 'gh', args: ['issue', 'close', '42'] });
  });

  it('plans the comment before the reopen for a reopen-honestly finding', () => {
    const commands = planMirrorPassCommands({
      action: 'reopen-honestly',
      taskId: 'github-42',
      issueNumber: 42,
      comment: 'Reopening — not done.',
    });

    expect(commands).toHaveLength(2);
    expect(commands[0]!.args).toEqual([
      'issue',
      'comment',
      '42',
      '--body',
      'Reopening — not done.',
    ]);
    expect(commands[1]).toMatchObject({ command: 'gh', args: ['issue', 'reopen', '42'] });
  });
});

describe('planMirrorPassBatch', () => {
  it('produces a plan with commands only for tasks that actually need reconciling', () => {
    const tasks: MirrorPassTaskCandidate[] = [
      { id: 'github-1', status: 'done', landedSha: 'sha1' },
      { id: 'github-2', status: 'done', landedSha: null },
      { id: 'web-abc', status: 'done', landedSha: null },
    ];
    const issuesByNumber = new Map([
      [1, { number: 1, state: 'open' as const }],
      [2, { number: 2, state: 'closed' as const }],
    ]);

    const plans = planMirrorPassBatch(tasks, issuesByNumber);

    expect(plans).toHaveLength(3);
    expect(plans[0]!.finding).toMatchObject({ action: 'close-with-landing-note' });
    expect(plans[0]!.commands).toHaveLength(2);
    expect(plans[1]!.finding).toBeNull();
    expect(plans[1]!.commands).toHaveLength(0);
    expect(plans[2]!.finding).toBeNull();
  });
});

function makeExec(
  handler: (bin: string, args: readonly string[]) => { code: number; stdout: string },
): CliExec {
  return vi.fn(async (bin: string, args: readonly string[]) => handler(bin, args));
}

describe('fetchIssueState', () => {
  it('parses an open issue', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({ number: 42, state: 'OPEN' }),
    }));

    expect(await fetchIssueState(exec, 42)).toEqual({ number: 42, state: 'open' });
    expect(exec).toHaveBeenCalledWith('gh', ['issue', 'view', '42', '--json', 'number,state']);
  });

  it('parses a closed issue', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({ number: 7, state: 'CLOSED' }),
    }));

    expect(await fetchIssueState(exec, 7)).toEqual({ number: 7, state: 'closed' });
  });

  it('returns null on a non-zero exit', async () => {
    const exec = makeExec(() => ({ code: 1, stdout: '' }));

    expect(await fetchIssueState(exec, 42)).toBeNull();
  });

  it('returns null on unparseable stdout', async () => {
    const exec = makeExec(() => ({ code: 0, stdout: 'not json' }));

    expect(await fetchIssueState(exec, 42)).toBeNull();
  });

  it('returns null on a malformed state value', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({ number: 42, state: 'WAT' }),
    }));

    expect(await fetchIssueState(exec, 42)).toBeNull();
  });
});

describe('fetchMirrorPassIssueStates', () => {
  it('fetches only the distinct github-sourced issue numbers, skipping other sources', async () => {
    const exec = makeExec((_bin, args) => {
      const n = Number(args[2]);
      return { code: 0, stdout: JSON.stringify({ number: n, state: n === 1 ? 'OPEN' : 'CLOSED' }) };
    });
    const tasks: MirrorPassTaskCandidate[] = [
      { id: 'github-1', status: 'done', landedSha: null },
      { id: 'github-1', status: 'done', landedSha: null },
      { id: 'github-2', status: 'queued', landedSha: null },
      { id: 'web-abc', status: 'done', landedSha: null },
    ];

    const states = await fetchMirrorPassIssueStates(exec, tasks);

    expect(exec).toHaveBeenCalledTimes(2);
    expect(states.get(1)).toEqual({ number: 1, state: 'open' });
    expect(states.get(2)).toEqual({ number: 2, state: 'closed' });
  });

  it('omits an issue whose fetch failed rather than inserting a placeholder', async () => {
    const exec = makeExec(() => ({ code: 1, stdout: '' }));
    const tasks: MirrorPassTaskCandidate[] = [{ id: 'github-9', status: 'done', landedSha: null }];

    const states = await fetchMirrorPassIssueStates(exec, tasks);

    expect(states.has(9)).toBe(false);
  });
});

describe('planMirrorPassLandingNote', () => {
  const closed: MirrorPassIssueState = { number: 42, state: 'closed' };

  it('plans a note when the issue is closed, the task landed, and no comment mentions the sha', () => {
    const finding = planMirrorPassLandingNote(
      task({ status: 'done', landedSha: 'abc1234' }),
      closed,
      ['unrelated comment', 'another one'],
    );

    expect(finding).toMatchObject({
      action: 'note-landing-sha',
      taskId: 'github-42',
      issueNumber: 42,
      sha: 'abc1234',
    });
    expect(finding?.comment).toContain('abc1234');
  });

  it('returns null when a comment already mentions the landing sha', () => {
    const finding = planMirrorPassLandingNote(
      task({ status: 'done', landedSha: 'abc1234' }),
      closed,
      ['Landed in abc1234 — closing.'],
    );

    expect(finding).toBeNull();
  });

  it('returns null when the issue is still open (bundled into the close note instead)', () => {
    const finding = planMirrorPassLandingNote(
      task({ status: 'done', landedSha: 'abc1234' }),
      { number: 42, state: 'open' },
      [],
    );

    expect(finding).toBeNull();
  });

  it('returns null when the task has no landing sha', () => {
    expect(
      planMirrorPassLandingNote(task({ status: 'done', landedSha: null }), closed, []),
    ).toBeNull();
  });

  it('returns null when the task is not done', () => {
    expect(
      planMirrorPassLandingNote(task({ status: 'in_progress', landedSha: 'abc1234' }), closed, []),
    ).toBeNull();
  });

  it('returns null for a task not sourced from a github issue', () => {
    expect(
      planMirrorPassLandingNote(
        task({ id: 'web-abc123', status: 'done', landedSha: 'abc1234' }),
        closed,
        [],
      ),
    ).toBeNull();
  });

  it('returns null rather than guessing when the issue fetch failed', () => {
    expect(
      planMirrorPassLandingNote(task({ status: 'done', landedSha: 'abc1234' }), undefined, []),
    ).toBeNull();
  });
});

describe('planMirrorPassLandingNoteCommand', () => {
  it('plans a single comment call with no state change', () => {
    const command = planMirrorPassLandingNoteCommand({
      action: 'note-landing-sha',
      taskId: 'github-42',
      issueNumber: 42,
      sha: 'abc1234',
      comment: 'Landed in abc1234 — noting for the record.',
    });

    expect(command).toMatchObject({
      command: 'gh',
      args: ['issue', 'comment', '42', '--body', 'Landed in abc1234 — noting for the record.'],
    });
  });
});

describe('planMirrorPassLandingNoteBatch', () => {
  it('produces a plan with a command only for tasks that need a note', () => {
    const tasks: MirrorPassTaskCandidate[] = [
      { id: 'github-1', status: 'done', landedSha: 'sha1' },
      { id: 'github-2', status: 'done', landedSha: 'sha2' },
      { id: 'github-3', status: 'done', landedSha: null },
    ];
    const issuesByNumber = new Map<number, MirrorPassIssueState>([
      [1, { number: 1, state: 'closed' }],
      [2, { number: 2, state: 'closed' }],
      [3, { number: 3, state: 'closed' }],
    ]);
    const commentsByIssueNumber = new Map<number, readonly string[]>([
      [1, []],
      [2, ['Landed in sha2 — closing.']],
    ]);

    const plans = planMirrorPassLandingNoteBatch(tasks, issuesByNumber, commentsByIssueNumber);

    expect(plans).toHaveLength(3);
    expect(plans[0]!.finding).toMatchObject({ action: 'note-landing-sha', sha: 'sha1' });
    expect(plans[0]!.command).not.toBeNull();
    expect(plans[1]!.finding).toBeNull();
    expect(plans[1]!.command).toBeNull();
    expect(plans[2]!.finding).toBeNull();
  });
});

describe('fetchIssueComments', () => {
  it('parses comment bodies from gh issue view --json comments', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({ comments: [{ body: 'first' }, { body: 'second' }] }),
    }));

    expect(await fetchIssueComments(exec, 42)).toEqual(['first', 'second']);
    expect(exec).toHaveBeenCalledWith('gh', ['issue', 'view', '42', '--json', 'comments']);
  });

  it('returns an empty array on a non-zero exit', async () => {
    const exec = makeExec(() => ({ code: 1, stdout: '' }));

    expect(await fetchIssueComments(exec, 42)).toEqual([]);
  });

  it('returns an empty array on unparseable stdout', async () => {
    const exec = makeExec(() => ({ code: 0, stdout: 'not json' }));

    expect(await fetchIssueComments(exec, 42)).toEqual([]);
  });

  it('returns an empty array when comments is missing or malformed', async () => {
    const exec = makeExec(() => ({ code: 0, stdout: JSON.stringify({ comments: 'nope' }) }));

    expect(await fetchIssueComments(exec, 42)).toEqual([]);
  });

  it('skips entries with a non-string or missing body', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({ comments: [{ body: 'kept' }, { body: 7 }, {}] }),
    }));

    expect(await fetchIssueComments(exec, 42)).toEqual(['kept']);
  });
});

describe('fetchMirrorPassIssueComments', () => {
  it('fetches comments only for closed issues whose task landed', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({ comments: [{ body: 'noted' }] }),
    }));
    const tasks: MirrorPassTaskCandidate[] = [
      { id: 'github-1', status: 'done', landedSha: 'sha1' },
      { id: 'github-2', status: 'done', landedSha: null },
      { id: 'github-3', status: 'in_progress', landedSha: 'sha3' },
      { id: 'web-abc', status: 'done', landedSha: 'sha4' },
    ];
    const issuesByNumber = new Map<number, MirrorPassIssueState>([
      [1, { number: 1, state: 'closed' }],
      [2, { number: 2, state: 'closed' }],
      [3, { number: 3, state: 'closed' }],
    ]);

    const comments = await fetchMirrorPassIssueComments(exec, tasks, issuesByNumber);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(comments.get(1)).toEqual(['noted']);
    expect(comments.has(2)).toBe(false);
    expect(comments.has(3)).toBe(false);
  });
});

describe('extractReadmeVersionClaim', () => {
  it('parses the "Current version **X.Y.Z**" convention', () => {
    expect(extractReadmeVersionClaim('Current version **0.25.0** — see below.')).toBe('0.25.0');
  });

  it('is case-insensitive on "current version"', () => {
    expect(extractReadmeVersionClaim('CURRENT VERSION **1.2.3**')).toBe('1.2.3');
  });

  it('returns null when the text carries no version claim', () => {
    expect(extractReadmeVersionClaim('# Project\n\nNo version prose here.')).toBeNull();
  });
});

describe('planMirrorPassVersionDrift', () => {
  it('returns null when the readme has no version claim', () => {
    expect(planMirrorPassVersionDrift('# Project', '0.25.0')).toBeNull();
  });

  it('returns null when the claim matches the tree', () => {
    expect(
      planMirrorPassVersionDrift('Current version **0.25.0** — see below.', '0.25.0'),
    ).toBeNull();
  });

  it('plans a finding when the claim disagrees with the tree', () => {
    const finding = planMirrorPassVersionDrift('Current version **0.24.0** — see below.', '0.25.0');
    expect(finding).toEqual({
      action: 'file-version-drift-issue',
      source: 'README.md',
      claimedVersion: '0.24.0',
      actualVersion: '0.25.0',
    });
  });

  it('records the given source label instead of the default', () => {
    const finding = planMirrorPassVersionDrift(
      'Current version **0.24.0**.',
      '0.25.0',
      'docs/GUIDE.md',
    );
    expect(finding?.source).toBe('docs/GUIDE.md');
  });
});

describe('planMirrorPassVersionDriftCommand', () => {
  it('plans a gh issue create call naming both versions', () => {
    const command = planMirrorPassVersionDriftCommand({
      action: 'file-version-drift-issue',
      source: 'README.md',
      claimedVersion: '0.24.0',
      actualVersion: '0.25.0',
    });
    expect(command.command).toBe('gh');
    expect(command.args[0]).toBe('issue');
    expect(command.args[1]).toBe('create');
    expect(command.args.join(' ')).toContain('0.24.0');
    expect(command.args.join(' ')).toContain('0.25.0');
    expect(command.details).toContain('README.md');
  });
});

describe('readMirrorPassVersionDrift', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ap-mirror-pass-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('reports a drift when the readme and package.json disagree', () => {
    const readmePath = join(dir, 'README.md');
    const packageJsonPath = join(dir, 'package.json');
    writeFileSync(readmePath, 'Current version **0.24.0** — see below.');
    writeFileSync(packageJsonPath, JSON.stringify({ version: '0.25.0' }));

    expect(readMirrorPassVersionDrift(readmePath, packageJsonPath)).toEqual({
      action: 'file-version-drift-issue',
      source: 'README.md',
      claimedVersion: '0.24.0',
      actualVersion: '0.25.0',
    });
  });

  it('returns null when the readme and package.json agree', () => {
    const readmePath = join(dir, 'README.md');
    const packageJsonPath = join(dir, 'package.json');
    writeFileSync(readmePath, 'Current version **0.25.0** — see below.');
    writeFileSync(packageJsonPath, JSON.stringify({ version: '0.25.0' }));

    expect(readMirrorPassVersionDrift(readmePath, packageJsonPath)).toBeNull();
  });

  it('returns null rather than throwing when the readme is missing', () => {
    const packageJsonPath = join(dir, 'package.json');
    writeFileSync(packageJsonPath, JSON.stringify({ version: '0.25.0' }));

    expect(readMirrorPassVersionDrift(join(dir, 'missing.md'), packageJsonPath)).toBeNull();
  });

  it('returns null rather than throwing on unparseable package.json', () => {
    const readmePath = join(dir, 'README.md');
    const packageJsonPath = join(dir, 'package.json');
    writeFileSync(readmePath, 'Current version **0.25.0** — see below.');
    writeFileSync(packageJsonPath, '{ not json');

    expect(readMirrorPassVersionDrift(readmePath, packageJsonPath)).toBeNull();
  });

  it('returns null when package.json has no string version', () => {
    const readmePath = join(dir, 'README.md');
    const packageJsonPath = join(dir, 'package.json');
    writeFileSync(readmePath, 'Current version **0.25.0** — see below.');
    writeFileSync(packageJsonPath, JSON.stringify({ version: 42 }));

    expect(readMirrorPassVersionDrift(readmePath, packageJsonPath)).toBeNull();
  });
});

describe('extractPackageCountClaim', () => {
  it('parses the "<N> open-source projects" phrasing', () => {
    expect(extractPackageCountClaim('shoulders of 487 open-source projects — see THANKS.md')).toBe(
      487,
    );
  });

  it('parses the "<N> packages" phrasing', () => {
    expect(extractPackageCountClaim('(487 packages at last count; zero copyleft-strong)')).toBe(
      487,
    );
  });

  it('is case-insensitive', () => {
    expect(extractPackageCountClaim('487 OPEN-SOURCE PROJECTS')).toBe(487);
  });

  it('strips thousands separators', () => {
    expect(extractPackageCountClaim('1,234 packages deep')).toBe(1234);
  });

  it('returns null when the text carries no count claim', () => {
    expect(extractPackageCountClaim('# Project\n\nNo count prose here.')).toBeNull();
  });
});

describe('countThirdPartyLicenseRows', () => {
  it('counts data rows, excluding the header and separator', () => {
    const table = [
      '# Third-party licenses',
      '',
      '| package | version(s) | license |',
      '| --- | --- | --- |',
      '| left-pad | 1.0.0 | MIT |',
      '| right-pad | 2.0.0 | MIT |',
      '| up-pad | 3.0.0 | ISC |',
    ].join('\n');

    expect(countThirdPartyLicenseRows(table)).toBe(3);
  });

  it('returns 0 for a table with no data rows', () => {
    const table = ['| package | version(s) | license |', '| --- | --- | --- |'].join('\n');

    expect(countThirdPartyLicenseRows(table)).toBe(0);
  });
});

describe('planMirrorPassCountsDrift', () => {
  it('returns null when the doc has no count claim', () => {
    expect(planMirrorPassCountsDrift('# Project', 487)).toBeNull();
  });

  it('returns null when the claim matches the tree', () => {
    expect(planMirrorPassCountsDrift('shoulders of 487 open-source projects', 487)).toBeNull();
  });

  it('plans a finding when the claim disagrees with the tree', () => {
    const finding = planMirrorPassCountsDrift('shoulders of 480 open-source projects', 487);
    expect(finding).toEqual({
      action: 'file-counts-drift-issue',
      source: 'README.md',
      claimedCount: 480,
      actualCount: 487,
    });
  });

  it('records the given source label instead of the default', () => {
    const finding = planMirrorPassCountsDrift('487 packages at last count', 490, 'THANKS.md');
    expect(finding?.source).toBe('THANKS.md');
  });
});

describe('planMirrorPassCountsDriftCommand', () => {
  it('plans a gh issue create call naming both counts', () => {
    const command = planMirrorPassCountsDriftCommand({
      action: 'file-counts-drift-issue',
      source: 'README.md',
      claimedCount: 480,
      actualCount: 487,
    });
    expect(command.command).toBe('gh');
    expect(command.args[0]).toBe('issue');
    expect(command.args[1]).toBe('create');
    expect(command.args.join(' ')).toContain('480');
    expect(command.args.join(' ')).toContain('487');
    expect(command.details).toContain('README.md');
  });
});

describe('readMirrorPassCountsDrift', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ap-mirror-pass-counts-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  function licensesTable(rowCount: number): string {
    const header = ['| package | version(s) | license |', '| --- | --- | --- |'];
    const rows = Array.from({ length: rowCount }, (_, i) => `| pkg-${i} | 1.0.0 | MIT |`);
    return [...header, ...rows].join('\n');
  }

  it('reports a drift when the doc and license inventory disagree', () => {
    const readmePath = join(dir, 'README.md');
    const licensesPath = join(dir, 'THIRD-PARTY-LICENSES.md');
    writeFileSync(readmePath, 'shoulders of 480 open-source projects — see THANKS.md');
    writeFileSync(licensesPath, licensesTable(487));

    expect(readMirrorPassCountsDrift(readmePath, licensesPath)).toEqual({
      action: 'file-counts-drift-issue',
      source: 'README.md',
      claimedCount: 480,
      actualCount: 487,
    });
  });

  it('returns null when the doc and license inventory agree', () => {
    const readmePath = join(dir, 'README.md');
    const licensesPath = join(dir, 'THIRD-PARTY-LICENSES.md');
    writeFileSync(readmePath, 'shoulders of 487 open-source projects — see THANKS.md');
    writeFileSync(licensesPath, licensesTable(487));

    expect(readMirrorPassCountsDrift(readmePath, licensesPath)).toBeNull();
  });

  it('returns null rather than throwing when the doc is missing', () => {
    const licensesPath = join(dir, 'THIRD-PARTY-LICENSES.md');
    writeFileSync(licensesPath, licensesTable(487));

    expect(readMirrorPassCountsDrift(join(dir, 'missing.md'), licensesPath)).toBeNull();
  });

  it('returns null rather than throwing when the license inventory is missing', () => {
    const readmePath = join(dir, 'README.md');
    writeFileSync(readmePath, 'shoulders of 487 open-source projects — see THANKS.md');

    expect(readMirrorPassCountsDrift(readmePath, join(dir, 'missing.md'))).toBeNull();
  });
});

describe('extractInternalDocLinks', () => {
  it('extracts relative markdown link targets', () => {
    const content =
      '[`docs/README.md`](docs/README.md) is the index. ' +
      'See [ADR-0003](docs/adr/0003-thing.md) too.';
    expect(extractInternalDocLinks(content)).toEqual(['docs/README.md', 'docs/adr/0003-thing.md']);
  });

  it('extracts image link targets the same way', () => {
    const content = '![fleet dashboard, dark theme](docs/screens/fleet-dark.png)';
    expect(extractInternalDocLinks(content)).toEqual(['docs/screens/fleet-dark.png']);
  });

  it('strips a trailing #fragment before checking existence', () => {
    const content = '[threats to validity](docs/SELF-STUDY/PAPER.md#6-threats-to-validity)';
    expect(extractInternalDocLinks(content)).toEqual(['docs/SELF-STUDY/PAPER.md']);
  });

  it('ignores pure in-page anchors', () => {
    expect(extractInternalDocLinks('[jump](#section)')).toEqual([]);
  });

  it('ignores links with a URL scheme (http, https, mailto)', () => {
    const content = '[site](https://example.com) [mail](mailto:a@b.com) [ftp](ftp://example.com/x)';
    expect(extractInternalDocLinks(content)).toEqual([]);
  });

  it('deduplicates and sorts repeated targets', () => {
    const content = '[a](docs/b.md) [again](docs/b.md) [c](docs/a.md)';
    expect(extractInternalDocLinks(content)).toEqual(['docs/a.md', 'docs/b.md']);
  });

  it('returns an empty array when the doc has no internal links', () => {
    expect(extractInternalDocLinks('# Project\n\nNo links here.')).toEqual([]);
  });
});

describe('planMirrorPassLinkDrift', () => {
  it('returns null when every link resolves', () => {
    const finding = planMirrorPassLinkDrift(['docs/a.md', 'docs/b.md'], () => true);
    expect(finding).toBeNull();
  });

  it('returns null for an empty link list', () => {
    expect(planMirrorPassLinkDrift([], () => false)).toBeNull();
  });

  it('plans a finding naming every link that fails to resolve', () => {
    const exists = (path: string) => path !== 'docs/gone.md';
    const finding = planMirrorPassLinkDrift(['docs/a.md', 'docs/gone.md'], exists);
    expect(finding).toEqual({
      action: 'file-broken-link-issue',
      source: 'README.md',
      brokenLinks: ['docs/gone.md'],
    });
  });

  it('records the given source label instead of the default', () => {
    const finding = planMirrorPassLinkDrift(['docs/gone.md'], () => false, 'docs/README.md');
    expect(finding?.source).toBe('docs/README.md');
  });
});

describe('planMirrorPassLinkDriftCommand', () => {
  it('plans a gh issue create call naming every broken link', () => {
    const command = planMirrorPassLinkDriftCommand({
      action: 'file-broken-link-issue',
      source: 'README.md',
      brokenLinks: ['docs/gone.md', 'docs/also-gone.md'],
    });
    expect(command.command).toBe('gh');
    expect(command.args[0]).toBe('issue');
    expect(command.args[1]).toBe('create');
    expect(command.args.join(' ')).toContain('docs/gone.md');
    expect(command.args.join(' ')).toContain('docs/also-gone.md');
    expect(command.details).toContain('README.md');
  });
});

describe('readMirrorPassLinkDrift', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ap-mirror-pass-links-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('reports every link that does not resolve against the repo root', () => {
    const readmePath = join(dir, 'README.md');
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs', 'real.md'), '# real');
    writeFileSync(readmePath, '[real doc](docs/real.md) and [ghost doc](docs/ghost.md)');

    expect(readMirrorPassLinkDrift(readmePath, dir)).toEqual({
      action: 'file-broken-link-issue',
      source: 'README.md',
      brokenLinks: ['docs/ghost.md'],
    });
  });

  it('returns null when every link resolves', () => {
    const readmePath = join(dir, 'README.md');
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs', 'real.md'), '# real');
    writeFileSync(readmePath, '[real doc](docs/real.md)');

    expect(readMirrorPassLinkDrift(readmePath, dir)).toBeNull();
  });

  it('returns null rather than throwing when the doc is missing', () => {
    expect(readMirrorPassLinkDrift(join(dir, 'missing.md'), dir)).toBeNull();
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 7, 12, 0, 0);

function claimedIssue(overrides: Partial<MirrorPassClaimedIssue> = {}): MirrorPassClaimedIssue {
  return {
    number: 42,
    state: 'open',
    assignee: 'someone',
    lastActivityAt: NOW - STALE_TASK_DAYS * DAY_MS,
    ...overrides,
  };
}

describe('planMirrorPassStaleClaimReaper', () => {
  it('reaps a claim quiet for exactly the shared STALE_TASK_DAYS threshold', () => {
    const finding = planMirrorPassStaleClaimReaper(claimedIssue(), NOW);

    expect(finding).toMatchObject({
      action: 'reap-stale-claim',
      issueNumber: 42,
      assignee: 'someone',
      quietDays: STALE_TASK_DAYS,
    });
    expect(finding?.comment).toContain('@someone');
    expect(finding?.comment).toContain(String(STALE_TASK_DAYS));
  });

  it('returns null when quiet for fewer days than the threshold', () => {
    const finding = planMirrorPassStaleClaimReaper(
      claimedIssue({ lastActivityAt: NOW - (STALE_TASK_DAYS - 1) * DAY_MS }),
      NOW,
    );

    expect(finding).toBeNull();
  });

  it('returns null for an issue with no assignee', () => {
    expect(planMirrorPassStaleClaimReaper(claimedIssue({ assignee: null }), NOW)).toBeNull();
  });

  it('returns null for an already-closed issue', () => {
    expect(planMirrorPassStaleClaimReaper(claimedIssue({ state: 'closed' }), NOW)).toBeNull();
  });

  it('honors a custom threshold override', () => {
    const finding = planMirrorPassStaleClaimReaper(
      claimedIssue({ lastActivityAt: NOW - 3 * DAY_MS }),
      NOW,
      3,
    );

    expect(finding).toMatchObject({ action: 'reap-stale-claim', quietDays: 3 });
  });
});

describe('planMirrorPassStaleClaimCommands', () => {
  it('plans the comment before the unassign', () => {
    const commands = planMirrorPassStaleClaimCommands({
      action: 'reap-stale-claim',
      issueNumber: 42,
      assignee: 'someone',
      quietDays: 14,
      comment: 'Unassigning @someone — quiet for 14 days.',
    });

    expect(commands).toHaveLength(2);
    expect(commands[0]).toMatchObject({
      command: 'gh',
      args: ['issue', 'comment', '42', '--body', 'Unassigning @someone — quiet for 14 days.'],
    });
    expect(commands[1]).toMatchObject({
      command: 'gh',
      args: ['issue', 'edit', '42', '--remove-assignee', 'someone'],
    });
  });
});

describe('fetchClaimedIssueActivity', () => {
  it("uses the assignee's own last comment as the activity timestamp", async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({
        number: 42,
        state: 'OPEN',
        assignees: [{ login: 'someone' }],
        comments: [
          { author: { login: 'other' }, createdAt: '2026-09-05T00:00:00Z' },
          { author: { login: 'someone' }, createdAt: '2026-09-01T00:00:00Z' },
        ],
        updatedAt: '2026-09-06T00:00:00Z',
      }),
    }));

    const issue = await fetchClaimedIssueActivity(exec, 42);

    expect(issue).toEqual({
      number: 42,
      state: 'open',
      assignee: 'someone',
      lastActivityAt: Date.parse('2026-09-01T00:00:00Z'),
    });
    expect(exec).toHaveBeenCalledWith('gh', [
      'issue',
      'view',
      '42',
      '--json',
      'number,state,assignees,comments,updatedAt',
    ]);
  });

  it('falls back to updatedAt when the assignee never commented', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({
        number: 42,
        state: 'OPEN',
        assignees: [{ login: 'someone' }],
        comments: [{ author: { login: 'other' }, createdAt: '2026-09-05T00:00:00Z' }],
        updatedAt: '2026-09-06T00:00:00Z',
      }),
    }));

    const issue = await fetchClaimedIssueActivity(exec, 42);

    expect(issue?.lastActivityAt).toBe(Date.parse('2026-09-06T00:00:00Z'));
  });

  it('returns a null assignee for an unassigned issue', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({
        number: 42,
        state: 'OPEN',
        assignees: [],
        comments: [],
        updatedAt: '2026-09-06T00:00:00Z',
      }),
    }));

    expect((await fetchClaimedIssueActivity(exec, 42))?.assignee).toBeNull();
  });

  it('returns null on a non-zero exit', async () => {
    const exec = makeExec(() => ({ code: 1, stdout: '' }));

    expect(await fetchClaimedIssueActivity(exec, 42)).toBeNull();
  });

  it('returns null on unparseable stdout', async () => {
    const exec = makeExec(() => ({ code: 0, stdout: 'not json' }));

    expect(await fetchClaimedIssueActivity(exec, 42)).toBeNull();
  });

  it('returns null when updatedAt is missing or unparseable', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({
        number: 42,
        state: 'OPEN',
        assignees: [],
        comments: [],
        updatedAt: 'not a date',
      }),
    }));

    expect(await fetchClaimedIssueActivity(exec, 42)).toBeNull();
  });
});
