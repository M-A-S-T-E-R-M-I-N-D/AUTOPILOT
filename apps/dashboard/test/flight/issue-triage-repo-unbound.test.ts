// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Board ap-mupqfryv-0: KEEPER issue triage misroutes from any non-AUTOPILOT
 * project page. Every `gh` call triage makes acts on the ONE repository the
 * dashboard process runs in, while its board reads and writes follow the
 * project id the page names. 9a299ca4 refused a project whose origin is
 * ANOTHER GitHub repository, but `refuseRepoMismatchedPreview` lets an
 * unknown answer through — so a project with no GitHub origin at all (a
 * fully-local repo, a GitLab checkout, a folder git cannot answer for) still
 * had gh's repository's open issues judged against its board, and an execute
 * would have labeled them upstream and filed the accepted ones onto it.
 *
 * Triage needs a POSITIVE answer, the same rule `project-repo.ts`'s
 * `routeClaimToProject` applies to the pool panel: a task is bound to the
 * project it belongs to, and a project with no GitHub origin is connected to
 * no GitHub issue. `refuseUnboundIssueTriage` therefore refuses that project
 * too, before a single issue is read.
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, recentTasks, type Store } from '@autopilot/store';
import {
  IssueTriageRepoUnboundError,
  createIssueTriageExecuteApi,
  createIssueTriagePreviewApi,
  refuseUnboundIssueTriage,
} from '../../src/flight/issue-triage-execute.js';
import { MirrorPassRepoMismatchError } from '../../src/flight/mirror-pass-execute.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

type Call = readonly [string, readonly string[]];

const GH_REPO_URL = 'https://github.com/octocat/hello-world';
const OTHER_REPO_URL = 'https://github.com/someone-else/their-project.git';
const NON_GITHUB_URL = 'https://gitlab.com/octocat/hello-world.git';

/** One open issue filed on the bug template, so it plans as an accept. */
const OPEN_ISSUE = {
  number: 7,
  title: 'Dashboard crashes on an empty board',
  body: '### What happened?\nIt crashed.\n\n### Steps to reproduce\n1. open it\n\n### Expected behavior\nIt works.\n',
  url: `${GH_REPO_URL}/issues/7`,
  labels: [],
  assignees: [],
  author: { login: 'someone' },
  createdAt: '2026-10-01T00:00:00Z',
  milestone: null,
};

function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

function project(s: Store, id: string, rootPath: string): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', NULL, ?, ?)`,
    )
    .run(id, id, id, rootPath, 100, 100);
}

function seedProject(dir: string): string {
  const dbPath = join(dir, 'a.db');
  const s = openStore(dbPath);
  migrate(s);
  project(s, 'p1', dir);
  s.close();
  return dbPath;
}

/** gh resolves `octocat` acting on `octocat/hello-world` (its maintainer);
 *  git answers `originUrl` for the project's origin, or fails when it is
 *  null; `gh issue list` reports {@link OPEN_ISSUE}; every call lands in
 *  `calls`. */
function ghAndGitExec(
  originUrl: string | null,
  calls: Call[],
  options: { readonly identityResolves?: boolean } = {},
): CliExec {
  const identityResolves = options.identityResolves ?? true;
  return vi.fn(async (bin: string, args: readonly string[]) => {
    calls.push([bin, args]);
    if (bin === 'git' && args[2] === 'remote' && args[3] === 'get-url') {
      return originUrl === null ? { code: 2, stdout: '' } : { code: 0, stdout: `${originUrl}\n` };
    }
    if (args[0] === 'api' && args[1] === 'user') {
      return identityResolves
        ? { code: 0, stdout: JSON.stringify({ login: 'octocat' }) }
        : { code: 1, stdout: '' };
    }
    if (args[0] === 'repo' && args[1] === 'view') {
      return {
        code: 0,
        stdout: JSON.stringify({
          nameWithOwner: 'octocat/hello-world',
          url: GH_REPO_URL,
          isPrivate: false,
        }),
      };
    }
    if (args[0] === 'issue' && args[1] === 'list') {
      return { code: 0, stdout: JSON.stringify([OPEN_ISSUE]) };
    }
    return { code: 0, stdout: '' };
  });
}

function touchesAnIssue(calls: readonly Call[]): boolean {
  return calls.some(([bin, args]) => bin === 'gh' && args[0] === 'issue');
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (err: unknown) => err,
  );
}

describe('refuseUnboundIssueTriage — triage runs only for a checkout of the repository gh acts on (board ap-mupqfryv-0)', () => {
  it.each([
    ['its origin is not a GitHub repository', NON_GITHUB_URL],
    ['git cannot answer for an origin at all', null],
  ] as const)(
    'refuses the preview when %s, naming the repository gh acts on, before any issue is read',
    async (_why, originUrl) => {
      const dir = mkdtempSync(join(tmpdir(), 'ap-dash-triage-unbound-preview-'));
      try {
        const dbPath = seedProject(dir);
        const calls: Call[] = [];
        const exec = ghAndGitExec(originUrl, calls);
        const gated = refuseUnboundIssueTriage(
          dbPath,
          createIssueTriagePreviewApi(dbPath, exec),
          exec,
        );

        const refusal = await rejection(gated('p1'));

        expect(refusal).toBeInstanceOf(IssueTriageRepoUnboundError);
        expect(refusal).toMatchObject({
          skippedReason: 'repo-unbound',
          ghRepo: 'octocat/hello-world',
        });
        expect(touchesAnIssue(calls)).toBe(false);
      } finally {
        cleanupDir(dir);
      }
    },
  );

  it('refuses the execute for a project with no GitHub origin: no gh issue call, no board task', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-triage-unbound-execute-'));
    try {
      const dbPath = seedProject(dir);
      const calls: Call[] = [];
      const exec = ghAndGitExec(null, calls);
      const gated = refuseUnboundIssueTriage(
        dbPath,
        createIssueTriageExecuteApi(dbPath, exec),
        exec,
      );

      expect(await rejection(gated('p1'))).toBeInstanceOf(IssueTriageRepoUnboundError);
      expect(touchesAnIssue(calls)).toBe(false);
      const s = openStore(dbPath, { readonly: true });
      try {
        expect(recentTasks(s.db, 'p1')).toEqual([]);
      } finally {
        s.close();
      }
    } finally {
      cleanupDir(dir);
    }
  });

  it("still refuses a checkout of another GitHub repository with 9a299ca4's repo-mismatch error", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-triage-unbound-mismatch-'));
    try {
      const dbPath = seedProject(dir);
      const calls: Call[] = [];
      const exec = ghAndGitExec(OTHER_REPO_URL, calls);

      const refusal = await rejection(
        refuseUnboundIssueTriage(dbPath, createIssueTriagePreviewApi(dbPath, exec), exec)('p1'),
      );

      expect(refusal).toBeInstanceOf(MirrorPassRepoMismatchError);
      expect(refusal).toMatchObject({
        skippedReason: 'repo-mismatch',
        projectRepo: 'someone-else/their-project',
        ghRepo: 'octocat/hello-world',
      });
      expect(touchesAnIssue(calls)).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it("plans gh's open issues as before for a checkout of gh's own repository, in any URL form", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-triage-unbound-match-'));
    try {
      const dbPath = seedProject(dir);
      const exec = ghAndGitExec('git@github.com:OctoCat/Hello-World.git', []);

      const plans = await refuseUnboundIssueTriage(
        dbPath,
        createIssueTriagePreviewApi(dbPath, exec),
        exec,
      )('p1');

      expect(plans?.map((plan) => [plan.issue.number, plan.decision.decision])).toEqual([
        [7, 'accept'],
      ]);
    } finally {
      cleanupDir(dir);
    }
  });

  it('refuses nothing when gh cannot resolve who is acting — an unknown gh repository is not a refusal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-triage-unbound-noidentity-'));
    try {
      const dbPath = seedProject(dir);
      const preview = vi.fn(async () => ['plan']);
      const exec = ghAndGitExec(null, [], { identityResolves: false });

      expect(await refuseUnboundIssueTriage(dbPath, preview, exec)('p1')).toEqual(['plan']);
      expect(preview).toHaveBeenCalledWith('p1');
    } finally {
      cleanupDir(dir);
    }
  });

  it("hands an unknown project id straight to the api, keeping its own 'unknown ⇒ null' answer", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-triage-unbound-unknown-'));
    try {
      const dbPath = seedProject(dir);
      const calls: Call[] = [];
      const preview = vi.fn(async () => null);

      expect(
        await refuseUnboundIssueTriage(dbPath, preview, ghAndGitExec(null, calls))('nope'),
      ).toBeNull();
      expect(preview).toHaveBeenCalledWith('nope');
      expect(calls).toEqual([]);
    } finally {
      cleanupDir(dir);
    }
  });
});

// The production wiring is the policy: the server serves whatever `main.ts`
// hands it, so both triage routes must be wired through the strict guard —
// census-diffs-the-disk, the same stance mirror-pass-preview-repo-gate.test.ts
// takes for the mirror-pass previews.
describe('main.ts wires both KEEPER triage routes through refuseUnboundIssueTriage', () => {
  const MAIN = readFileSync(join(process.cwd(), 'apps/dashboard/src/server/main.ts'), 'utf8');

  it.each([
    ['issueTriage', 'createIssueTriagePreviewApi'],
    ['issueTriageExecute', 'createIssueTriageExecuteApi'],
  ])('%s: refuseUnboundIssueTriage(dbPath, %s(dbPath))', (dep, factory) => {
    const wired = new RegExp(
      `\\b${dep}: refuseUnboundIssueTriage\\(\\s*dbPath,\\s*${factory}\\(dbPath\\),?\\s*\\),`,
    );
    expect(MAIN).toMatch(wired);
  });
});
