// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE CLAIM CONTRACT (operator directive, 2026-09-12): a person who claims a
 * pool issue gets their own pilot FOCUSED on it, delivering a slice per
 * firing, until THEY close the issue. Three readers must agree — the claim
 * path (task body + focus), the firing's done-hook (never closes it), and
 * the mirror pass (settles it on the claimant's close, never reopens on its
 * account). This file proves all three against the same marker.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openStore, migrate, createTask, type Store } from '@autopilot/store';
import type { GitVcs, FiringOutcome } from '@autopilot/engine';
import type { CliExec } from '../../src/connection/cli-probe.js';
import {
  HUMAN_CLOSES_MARKER,
  CLAIMED_TASK_PROMPT_NOTE,
  claimContractBody,
  isHumanClosedTask,
} from '../../src/flight/claim-contract.js';
import {
  planPoolIssueTask,
  planClaimPoolIssue,
  claimAndQueuePoolIssueTask,
} from '../../src/flight/pool-client.js';
import {
  claimLedger,
  CLAIM_WINDOW_DAYS,
  CLAIM_COMMAND,
  UNCLAIM_COMMAND,
} from '../../src/flight/claim-ledger.js';
import { markTaskDoneIfShipped } from '../../src/flight/firing-hooks.js';
import {
  planMirrorPassReconcile,
  planMirrorPassCommands,
  planMirrorPassStaleClaimReaper,
} from '../../src/flight/mirror-pass.js';
import { poolClaimConfirmMessage } from '../../src/web/pool-client-panel.js';

function memoryStore(): Store {
  const store = openStore(':memory:');
  migrate(store);
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', 1, 1)`,
    )
    .run();
  return store;
}

function taskRow(store: Store, id: string): { status: string; focus: number; body: string | null } {
  return store.db.prepare('SELECT status, focus, body FROM tasks WHERE id = ?').get(id) as {
    status: string;
    focus: number;
    body: string | null;
  };
}

const POOL_ISSUE = {
  number: 42,
  title: 'Keyboard nav is broken',
  url: 'https://github.com/example/repo/issues/42',
  labels: [{ name: 'pool: accessibility' }],
  assignees: [],
};

function execFor(issues: unknown[], viewerLogin: string): CliExec {
  return vi.fn(async (_bin, args) => {
    if (args[0] === 'issue' && args[1] === 'list')
      return { code: 0, stdout: JSON.stringify(issues) };
    if (args[0] === 'api' && args[1] === 'user')
      return { code: 0, stdout: JSON.stringify({ login: viewerLogin }) };
    return { code: 0, stdout: '' };
  });
}

function outcomeWithRecord(record: {
  shipped: boolean;
  item: string;
  completion: 'slice' | 'complete';
  sha: string;
}): FiringOutcome {
  return { record } as unknown as FiringOutcome;
}

const vcs = {
  head: async () => 'headsha',
  showPatch: async () => '',
  fileExists: async () => false,
} as unknown as GitVcs;

describe('the marker', () => {
  it('is carried by the contract body and read back from any row shape', () => {
    const body = claimContractBody(42, 'https://github.com/example/repo/issues/42');
    expect(body).toContain('#42');
    expect(body).toContain(HUMAN_CLOSES_MARKER);
    expect(isHumanClosedTask({ body })).toBe(true);
    expect(isHumanClosedTask({ body: 'an ordinary task' })).toBe(false);
    expect(isHumanClosedTask({ body: null })).toBe(false);
    expect(isHumanClosedTask({})).toBe(false);
  });
});

describe('the holder line', () => {
  const MARKER_LINE = `${HUMAN_CLOSES_MARKER} — deliver a slice per firing; this task closes only when its claimant closes the issue.`;

  it('names the claimant on its own line, between the issue line and an untouched marker line', () => {
    const body = claimContractBody(42, POOL_ISSUE.url, { claimant: 'octocat' });
    expect(body.split('\n')).toEqual([
      `Claimed from the pool: #42 ${POOL_ISSUE.url}`,
      'claimed by @octocat',
      MARKER_LINE,
    ]);
    expect(isHumanClosedTask({ body })).toBe(true);
  });

  it('names every holder a contested claim rides over, in order, and still reads as the contract', () => {
    const body = claimContractBody(42, undefined, {
      claimant: 'octocat',
      contestedWith: ['gabibi555', 'M-A-S-T-E-R-M-I-N-D'],
    });
    expect(body.split('\n')).toEqual([
      'Claimed from the pool: #42',
      'claimed by @octocat — contested with @gabibi555, @M-A-S-T-E-R-M-I-N-D (both solutions get compared)',
      MARKER_LINE,
    ]);
    expect(isHumanClosedTask({ body })).toBe(true);
  });

  it('an empty contest list reads exactly like an uncontested claim', () => {
    expect(claimContractBody(42, undefined, { claimant: 'octocat', contestedWith: [] })).toBe(
      claimContractBody(42, undefined, { claimant: 'octocat' }),
    );
  });

  it('with no holder the body is just the issue line and the marker line', () => {
    expect(claimContractBody(42).split('\n')).toEqual(['Claimed from the pool: #42', MARKER_LINE]);
  });
});

describe('the claim path', () => {
  it('plans the claimed issue as a task that carries the contract', () => {
    const input = planPoolIssueTask(
      {
        number: 42,
        title: 'Keyboard nav is broken',
        url: POOL_ISSUE.url,
        labels: ['pool: accessibility'],
        assignees: [],
      },
      { decision: 'claim', reasoning: 'r', claimant: 'octocat', releases: [] },
      'p1',
      100,
    );
    expect(input?.id).toBe('github-42');
    expect(isHumanClosedTask({ body: input?.body ?? null })).toBe(true);
  });

  it('queues the task FOCUSED, so the next firing claims it first and keeps slicing', async () => {
    const store = memoryStore();
    const result = await claimAndQueuePoolIssueTask(
      42,
      'p1',
      execFor([POOL_ISSUE], 'octocat'),
      store,
      () => 100,
    );
    expect(result.decision.decision).toBe('claim');
    expect(result.taskQueued).toBe(true);
    expect(result.focused).toBe(true);
    const row = taskRow(store, 'github-42');
    expect(row.status).toBe('queued');
    expect(row.focus).toBe(1);
    expect(row.body).toContain(HUMAN_CLOSES_MARKER);
    store.close();
  });

  describe('from the claims ledger', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const T0 = Date.UTC(2026, 8, 1);
    const heldBy = (login: string) => ({
      number: 42,
      title: 'Keyboard nav is broken',
      url: POOL_ISSUE.url,
      labels: ['pool: accessibility'],
      assignees: [],
      claims: claimLedger(
        [],
        [{ author: login, createdAt: T0, body: `Claimed by ${login} via the pool client.` }],
      ),
    });

    it('a claim over a live holder is a contest, and the task body names whom it rides over', () => {
      const issue = heldBy('gabibi555');
      const decision = planClaimPoolIssue(issue, 'octocat', T0 + DAY);
      expect(decision.decision).toBe('contest');
      const body = planPoolIssueTask(issue, decision, 'p1', 100)?.body ?? null;
      expect(body).toContain(
        'claimed by @octocat — contested with @gabibi555 (both solutions get compared)',
      );
      expect(isHumanClosedTask({ body })).toBe(true);
    });

    it('a claim over a stale holder releases it, and the task body names no contest', () => {
      const issue = heldBy('gabibi555');
      const decision = planClaimPoolIssue(issue, 'octocat', T0 + CLAIM_WINDOW_DAYS * DAY);
      expect(decision.decision).toBe('claim');
      const body = planPoolIssueTask(issue, decision, 'p1', 100)?.body ?? null;
      expect(body).toContain('claimed by @octocat');
      expect(body).not.toContain('contested');
      expect(isHumanClosedTask({ body })).toBe(true);
    });

    it('a claim right after the holder handed back with /unclaim is a plain claim, not a contest', () => {
      const issue = {
        ...heldBy('gabibi555'),
        claims: claimLedger(
          [],
          [
            {
              author: 'gabibi555',
              createdAt: T0,
              body: 'Claimed by gabibi555 via the pool client.',
            },
            { author: 'gabibi555', createdAt: T0 + DAY, body: '/unclaim' },
          ],
        ),
      };
      const decision = planClaimPoolIssue(issue, 'octocat', T0 + 2 * DAY);
      expect(decision).toMatchObject({ decision: 'claim', releases: [] });
      expect(planPoolIssueTask(issue, decision, 'p1', 100)?.body).not.toContain('contested');
    });

    it('a claim after the reaper workflow auto-released the holder posts no second release note', () => {
      const issue = {
        ...heldBy('gabibi555'),
        claims: claimLedger(
          [],
          [
            {
              author: 'gabibi555',
              createdAt: T0,
              body: 'Claimed by gabibi555 via the pool client.',
            },
            {
              author: 'github-actions',
              createdAt: T0 + 15 * DAY,
              body: '15 quiet days with no comment or commit from @gabibi555 — auto-released per the claim protocol (docs/ROADMAP.md).',
            },
          ],
        ),
      };
      const decision = planClaimPoolIssue(issue, 'octocat', T0 + 16 * DAY);
      expect(decision).toMatchObject({ decision: 'claim', releases: [] });
    });
  });

  it('the prompt note tells the agent to slice, not to finish', () => {
    expect(CLAIMED_TASK_PROMPT_NOTE).toMatch(/slice/);
    expect(CLAIMED_TASK_PROMPT_NOTE).toMatch(/claimant closes/);
  });
});

describe("the firing's done-hook", () => {
  let store: Store;
  beforeEach(() => {
    store = memoryStore();
    createTask(store, {
      id: 'github-42',
      projectId: 'p1',
      title: 'Keyboard nav is broken',
      body: claimContractBody(42),
      source: 'github',
      createdAt: 1,
    });
  });

  it('demotes a "complete" tag on a claimed task and tells the next firing why', async () => {
    const note = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'github-42', completion: 'complete', sha: 'abc' }),
      vcs,
    );
    expect(note).toContain('COMPLETION DEMOTED');
    expect(note).toContain('claim contract');
    expect(taskRow(store, 'github-42').status).toBe('queued');
  });

  it('demotes a "complete" on a contested claim too — the contest clause never hides the marker', async () => {
    createTask(store, {
      id: 'github-43',
      projectId: 'p1',
      title: 'Screen reader skips the fly bar',
      body: claimContractBody(43, undefined, { claimant: 'octocat', contestedWith: ['gabibi555'] }),
      source: 'github',
      createdAt: 1,
    });
    const note = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'github-43', completion: 'complete', sha: 'abc' }),
      vcs,
    );
    expect(note).toContain('COMPLETION DEMOTED');
    expect(taskRow(store, 'github-43').status).toBe('queued');
  });

  it('lets a slice through and keeps the task open', async () => {
    const note = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'github-42', completion: 'slice', sha: 'abc' }),
      vcs,
    );
    expect(note).toBeUndefined();
    expect(taskRow(store, 'github-42').status).toBe('queued');
  });

  it('still closes an ordinary task on a verified complete', async () => {
    createTask(store, { id: 'web-a', projectId: 'p1', title: 'Ordinary task', createdAt: 1 });
    await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'web-a', completion: 'complete', sha: 'abc' }),
      vcs,
    );
    expect(taskRow(store, 'web-a').status).toBe('done');
  });
});

describe('the mirror pass', () => {
  it("settles the task when the claimant closed the issue — the claimant's word is the only one that counts", () => {
    const finding = planMirrorPassReconcile(
      { id: 'github-42', status: 'in_progress', landedSha: null, humanCloses: true },
      { number: 42, state: 'closed' },
    );
    expect(finding).toMatchObject({
      action: 'settle-claimed',
      taskId: 'github-42',
      issueNumber: 42,
    });
    const commands = planMirrorPassCommands(finding!);
    expect(commands).toHaveLength(1);
    expect(commands[0]!.args.slice(0, 3)).toEqual(['issue', 'comment', '42']);
  });

  it('still reopens honestly when an ordinary task is not done', () => {
    const finding = planMirrorPassReconcile(
      { id: 'github-42', status: 'in_progress', landedSha: null },
      { number: 42, state: 'closed' },
    );
    expect(finding?.action).toBe('reopen-honestly');
  });

  it('leaves a claimed task alone while its issue is still open', () => {
    expect(
      planMirrorPassReconcile(
        { id: 'github-42', status: 'queued', landedSha: null, humanCloses: true },
        { number: 42, state: 'open' },
      ),
    ).toBeNull();
  });
});

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k), the claim's quiet
// window. Five places release a quiet claim or tell a claimer when it will
// be released: the reaper workflow's QUIET_DAYS, the /claim reply in
// claim.yml, the ledger's CLAIM_WINDOW_DAYS (the pool client releases a
// stale holder on the next claim), the mirror pass's flight-end reaper, and
// the pool panel's claim confirm. The confirm types its number by hand,
// because the client serializes it with .toString() and it can reach no
// constant. taxonomy-seed.test.ts ties the two workflows together, but
// nothing tied them to the flight side. If one side moves, a claim is freed
// earlier or later than the claimer was told, and nothing reports an error.
describe('the quiet window', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const T0 = Date.UTC(2026, 8, 1);
  const workflow = (name: string): string =>
    readFileSync(join(process.cwd(), '.github/workflows', name), 'utf8');

  it("is the reaper workflow's QUIET_DAYS", () => {
    const enforced = /QUIET_DAYS=(\d+)/.exec(workflow('stale-claim-reaper.yml'))?.[1];
    expect(enforced).toBe(String(CLAIM_WINDOW_DAYS));
  });

  it('is what the /claim reply promises', () => {
    const promised = /(\d+) quiet days auto-release it/.exec(workflow('claim.yml'))?.[1];
    expect(promised).toBe(String(CLAIM_WINDOW_DAYS));
  });

  it("is the day the mirror pass's flight-end reaper starts releasing", () => {
    const quietFor = (days: number) =>
      planMirrorPassStaleClaimReaper(
        { number: 42, state: 'open', assignee: 'gabibi555', lastActivityAt: T0 },
        T0 + days * DAY,
      );
    expect(quietFor(CLAIM_WINDOW_DAYS - 1)).toBeNull();
    expect(quietFor(CLAIM_WINDOW_DAYS)?.quietDays).toBe(CLAIM_WINDOW_DAYS);
  });

  it("is the only day count the pool panel's claim confirm states, for a claim and a contest", () => {
    const issue = { number: 42, title: POOL_ISSUE.title, url: POOL_ISSUE.url, assignees: [] };
    for (const decision of ['claim', 'contest']) {
      const message = poolClaimConfirmMessage(issue, { decision, reasoning: 'r' });
      const stated = [...message.matchAll(/(\d+) (?:quiet )?days/g)].map((m) => Number(m[1]));
      expect(stated.length, decision).toBeGreaterThan(0);
      expect(new Set(stated), decision).toEqual(new Set([CLAIM_WINDOW_DAYS]));
    }
  });
});

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k), where the claim
// protocol is written down. claim.yml and the reaper workflow both cite the
// doc that spells the rules out, and the reaper's auto-release note sends
// every released claimer there. They cited docs/ROADMAP.md "How work gets
// shared", a section ed6f7cb1 cut when the roadmap was rewritten, so the note
// pointed people at a page with no /claim on it. Nothing read the citation.
describe('where the claim protocol is written down', () => {
  const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
  const workflow = (name: string): string => read(join('.github/workflows', name));
  /** The `<doc> "<heading>"` a workflow's header comment cites, read across its `#` line breaks. */
  const citation = (name: string): { doc: string; heading: string } => {
    const prose = workflow(name).replace(/\n#\s*/g, ' ');
    const match = /\(([\w./-]+\.md) "([^"]+)"/.exec(prose);
    if (match?.[1] === undefined || match[2] === undefined) {
      throw new Error(`${name} cites no doc section for the claim protocol`);
    }
    return { doc: match[1], heading: match[2] };
  };
  /** The `## <heading>` section of `doc`, up to the next `## ` heading; '' when absent. */
  const section = (doc: string, heading: string): string => {
    const text = read(doc);
    const start = text.indexOf(`\n## ${heading}\n`);
    if (start < 0) return '';
    const end = text.indexOf('\n## ', start + 1);
    return text.slice(start, end < 0 ? undefined : end);
  };

  it.each(['claim.yml', 'stale-claim-reaper.yml'])(
    '%s cites a section that spells out the claim, the hand-back and the quiet window',
    (name) => {
      const { doc, heading } = citation(name);
      const rules = section(doc, heading);
      expect(rules, `${doc} "${heading}"`).toContain(`\`${CLAIM_COMMAND}\``);
      expect(rules, `${doc} "${heading}"`).toContain(`\`${UNCLAIM_COMMAND}\``);
      expect(rules, `${doc} "${heading}"`).toContain(`${CLAIM_WINDOW_DAYS} quiet days`);
    },
  );

  it('has both workflows cite the same section', () => {
    expect(citation('stale-claim-reaper.yml')).toEqual(citation('claim.yml'));
  });

  it("sends the reaper's released claimer to the doc that section lives in", () => {
    const reaper = workflow('stale-claim-reaper.yml');
    const bodyStart = reaper.indexOf('--body "', reaper.indexOf('gh issue comment'));
    const note = reaper.slice(bodyStart, reaper.indexOf('"\n', bodyStart));
    expect(/per the claim protocol \(([^)]+)\)/.exec(note)?.[1]).toBe(
      citation('stale-claim-reaper.yml').doc,
    );
  });
});
