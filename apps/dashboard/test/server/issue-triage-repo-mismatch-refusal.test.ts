// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0019 S3's per-project repo-mismatch guard, ported from MIRROR PASS to
 * KEEPER TRIAGE (debrief 2026-10-01-verdict-ap-munfszto-0: triage's GitHub
 * reads/writes are bound to the dashboard process's own repo, but its board
 * reads/writes are bound to whatever project id the caller names — so a
 * project checked out of another GitHub repository got that OTHER
 * repository's issues judged against and filed onto its own board). Same
 * shape as `mirror-pass-preview-refusal.test.ts`: a gated dependency throws
 * `MirrorPassRepoMismatchError`, and each route keeps its existing body shape
 * while adding why, so the panel can say "this project is not the repository
 * gh acts on" instead of silently showing nothing or a bare 500.
 */

import { describe, it, expect, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createServer, type ServerDeps } from '../../src/server/server.js';
import { MirrorPassRepoMismatchError } from '../../src/flight/mirror-pass-execute.js';
import { IssueTriageRepoUnboundError } from '../../src/flight/issue-triage-execute.js';

let server: Server | null = null;

afterEach(() => {
  server?.close();
  server = null;
});

async function start(deps: ServerDeps): Promise<string> {
  server = createServer(deps);
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  return `http://127.0.0.1:${addr.port}`;
}

const refuse = async (): Promise<never> => {
  throw new MirrorPassRepoMismatchError('someone-else/their-project', 'octocat/hello-world');
};

describe('KEEPER TRIAGE routes refuse a checkout of another repository (EPIC 0019 S3 ported to issue-triage)', () => {
  it('GET /api/issue-triage keeps its null body and names both repositories', async () => {
    const base = await start({ issueTriage: refuse } as ServerDeps);

    const res = await fetch(`${base}/api/issue-triage?project=p1`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      triage: null,
      skippedReason: 'repo-mismatch',
      projectRepo: 'someone-else/their-project',
      ghRepo: 'octocat/hello-world',
    });
  });

  it('GET /api/issue-triage still degrades any other failure to the bare null body', async () => {
    const base = await start({
      issueTriage: async () => {
        throw new Error('gh unavailable');
      },
    } as ServerDeps);

    const res = await fetch(`${base}/api/issue-triage?project=p1`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ triage: null });
  });

  it('POST /api/issue-triage/execute reports the refusal instead of a 500, with no gh mutation', async () => {
    const base = await start({ issueTriageExecute: refuse } as ServerDeps);

    const res = await fetch(`${base}/api/issue-triage/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      skippedReason: 'repo-mismatch',
      projectRepo: 'someone-else/their-project',
      ghRepo: 'octocat/hello-world',
      plans: [],
      commandResults: [],
      tasksCreated: 0,
    });
  });

  it('POST /api/issue-triage/execute still 500s on any other failure', async () => {
    const base = await start({
      issueTriageExecute: async () => {
        throw new Error('gh exploded');
      },
    } as ServerDeps);

    const res = await fetch(`${base}/api/issue-triage/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1' }),
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'gh exploded' });
  });
});

// Board ap-mupqfryv-0: refuseUnboundIssueTriage also refuses a project with
// no GitHub origin at all. Both routes report it the same way as the
// mismatch above, minus the project repository it does not have.
const refuseUnbound = async (): Promise<never> => {
  throw new IssueTriageRepoUnboundError('octocat/hello-world');
};

describe('KEEPER TRIAGE routes refuse a project with no GitHub origin (board ap-mupqfryv-0)', () => {
  it('GET /api/issue-triage keeps its null body and names the repository gh acts on', async () => {
    const base = await start({ issueTriage: refuseUnbound } as ServerDeps);

    const res = await fetch(`${base}/api/issue-triage?project=p1`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      triage: null,
      skippedReason: 'repo-unbound',
      ghRepo: 'octocat/hello-world',
    });
  });

  it('POST /api/issue-triage/execute reports the refusal instead of a 500, with no gh mutation', async () => {
    const base = await start({ issueTriageExecute: refuseUnbound } as ServerDeps);

    const res = await fetch(`${base}/api/issue-triage/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      skippedReason: 'repo-unbound',
      ghRepo: 'octocat/hello-world',
      plans: [],
      commandResults: [],
      tasksCreated: 0,
      error:
        'issue triage: this project has no GitHub origin, so it is not octocat/hello-world, the repository gh acts on',
    });
  });
});
