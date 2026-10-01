// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0019 S3 per project, the PREVIEW half (board ap-muhqoogl-0). The five
 * mirror-pass EXECUTE apis refuse a project whose git origin is another
 * GitHub repository (`gateMirrorPassExecute`, 0a6a70b7), and the panel stops
 * asking for previews once it knows. The preview APIs themselves still read
 * gh's repository for any project id a caller named, so a stale client or a
 * direct call loaded the wrong repository's issues as this project's
 * findings. `refuseRepoMismatchedPreview` puts the execute gate's
 * per-project half in front of a preview: a KNOWN mismatch throws
 * `MirrorPassRepoMismatchError` before the preview runs; an unknown answer
 * (no GitHub origin, identity unresolved, unknown project) runs it as before.
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, createTask, setTaskStatus, type Store } from '@autopilot/store';
import {
  MirrorPassRepoMismatchError,
  refuseRepoMismatchedPreview,
  createMirrorPassPreviewApi,
  createMirrorPassExecuteApi,
  createMirrorPassLandingNotePreviewApi,
  createMirrorPassDriftPreviewApi,
  createMirrorPassStaleClaimPreviewApi,
  createMirrorPassPriorityFollowPreviewApi,
} from '../../src/flight/mirror-pass-execute.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

type Call = readonly [string, readonly string[]];

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

/** A board with one landed `github-42` task whose issue is still open — a
 *  reconcile finding the moment the preview is allowed to read #42. */
function seedBoard(dir: string): string {
  const dbPath = join(dir, 'a.db');
  const s = openStore(dbPath);
  migrate(s);
  project(s, 'p1', dir);
  createTask(s, { id: 'github-42', projectId: 'p1', title: 'Landed', createdAt: 100 });
  setTaskStatus(s, 'github-42', 'done', 200);
  s.close();
  return dbPath;
}

/** gh resolves `login` acting on `octocat/hello-world`; git answers
 *  `originUrl` for the project's origin (or fails when it is null); issue #42
 *  reads as open; every call lands in `calls`. */
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
          url: 'https://github.com/octocat/hello-world',
          isPrivate: false,
        }),
      };
    }
    if (args[0] === 'issue' && args[1] === 'view' && args[2] === '42') {
      return { code: 0, stdout: JSON.stringify({ number: 42, state: 'OPEN' }) };
    }
    if (args[0] === 'issue' && args[1] === 'list') return { code: 0, stdout: '[]' };
    return { code: 0, stdout: '' };
  });
}

const OTHER_REPO = 'https://github.com/someone-else/their-project.git';

function readsAnIssue(calls: readonly Call[]): boolean {
  return calls.some(([bin, args]) => bin === 'gh' && args[0] === 'issue');
}

describe('refuseRepoMismatchedPreview — the execute gate, in front of a preview (epic 0019 S3 per project)', () => {
  it('refuses a project whose origin is another repo before the preview runs, naming both repositories', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-preview-gate-refuse-'));
    try {
      const dbPath = seedBoard(dir);
      const calls: Call[] = [];
      const preview = vi.fn(async () => ['plan']);
      const gated = refuseRepoMismatchedPreview(dbPath, preview, ghAndGitExec(OTHER_REPO, calls));

      const refusal = await gated('p1').then(
        () => null,
        (err: unknown) => err,
      );

      expect(refusal).toBeInstanceOf(MirrorPassRepoMismatchError);
      expect(refusal).toMatchObject({
        skippedReason: 'repo-mismatch',
        projectRepo: 'someone-else/their-project',
        ghRepo: 'octocat/hello-world',
      });
      expect(preview).not.toHaveBeenCalled();
      expect(readsAnIssue(calls)).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it("runs the preview as before when origin is gh's own repo, in any URL form or letter case", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-preview-gate-match-'));
    try {
      const dbPath = seedBoard(dir);
      const preview = vi.fn(async () => ['plan']);
      const exec = ghAndGitExec('git@github.com:OctoCat/Hello-World.git', []);

      expect(await refuseRepoMismatchedPreview(dbPath, preview, exec)('p1')).toEqual(['plan']);
      expect(preview).toHaveBeenCalledWith('p1');
    } finally {
      cleanupDir(dir);
    }
  });

  it.each([
    ['the project has no GitHub origin', 'https://gitlab.com/octocat/hello-world.git', true],
    ['git cannot answer for an origin at all', null, true],
    ['gh cannot resolve who is acting', OTHER_REPO, false],
  ] as const)(
    'keeps the single-context behavior when %s — an unknown answer is never a mismatch',
    async (_why, originUrl, identityResolves) => {
      const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-preview-gate-unknown-'));
      try {
        const dbPath = seedBoard(dir);
        const preview = vi.fn(async () => ['plan']);
        const exec = ghAndGitExec(originUrl, [], { identityResolves });

        expect(await refuseRepoMismatchedPreview(dbPath, preview, exec)('p1')).toEqual(['plan']);
      } finally {
        cleanupDir(dir);
      }
    },
  );

  it("hands an unknown project id straight to the preview, keeping its own 'unknown ⇒ null' answer", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-preview-gate-nope-'));
    try {
      const dbPath = seedBoard(dir);
      const calls: Call[] = [];
      const preview = vi.fn(async () => null);

      expect(
        await refuseRepoMismatchedPreview(dbPath, preview, ghAndGitExec(OTHER_REPO, calls))('nope'),
      ).toBeNull();
      expect(preview).toHaveBeenCalledWith('nope');
      expect(calls).toEqual([]);
    } finally {
      cleanupDir(dir);
    }
  });

  it('reaches the same verdict as the execute gate for the same checkout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-preview-gate-parity-'));
    try {
      const dbPath = seedBoard(dir);
      const exec = ghAndGitExec(OTHER_REPO, []);

      const report = await createMirrorPassExecuteApi(dbPath, exec)('p1');
      const preview = refuseRepoMismatchedPreview(
        dbPath,
        createMirrorPassPreviewApi(dbPath, exec),
        exec,
      );

      expect(report?.skippedReason).toBe('repo-mismatch');
      await expect(preview('p1')).rejects.toBeInstanceOf(MirrorPassRepoMismatchError);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('every mirror-pass preview, gated, reads nothing of the wrong repository (epic 0019 S3 per project)', () => {
  const PREVIEWS: ReadonlyArray<
    readonly [string, (dbPath: string, exec: CliExec) => (projectId: string) => Promise<unknown>]
  > = [
    ['reconcile', (dbPath: string, exec: CliExec) => createMirrorPassPreviewApi(dbPath, exec)],
    [
      'landing-note',
      (dbPath: string, exec: CliExec) => createMirrorPassLandingNotePreviewApi(dbPath, exec),
    ],
    ['drift', (dbPath: string) => createMirrorPassDriftPreviewApi(dbPath)],
    [
      'stale-claim',
      (dbPath: string, exec: CliExec) => createMirrorPassStaleClaimPreviewApi(dbPath, exec),
    ],
    [
      'priority-follow',
      (dbPath: string, exec: CliExec) => createMirrorPassPriorityFollowPreviewApi(dbPath, exec),
    ],
  ];

  it.each(PREVIEWS)(
    '%s refuses a checkout of another repo with no issue read',
    async (_name, create) => {
      const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-preview-gate-each-'));
      try {
        const dbPath = seedBoard(dir);
        const calls: Call[] = [];
        const exec = ghAndGitExec(OTHER_REPO, calls);

        await expect(
          refuseRepoMismatchedPreview(dbPath, create(dbPath, exec), exec)('p1'),
        ).rejects.toBeInstanceOf(MirrorPassRepoMismatchError);
        expect(readsAnIssue(calls)).toBe(false);
      } finally {
        cleanupDir(dir);
      }
    },
  );

  it('the reconcile preview still plans its finding for a checkout of gh’s own repo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-preview-gate-reconcile-'));
    try {
      const dbPath = seedBoard(dir);
      const exec = ghAndGitExec('https://github.com/octocat/hello-world', []);

      const plans = await refuseRepoMismatchedPreview(
        dbPath,
        createMirrorPassPreviewApi(dbPath, exec),
        exec,
      )('p1');

      expect(plans?.map((plan) => plan.finding?.issueNumber)).toEqual([42]);
    } finally {
      cleanupDir(dir);
    }
  });
});

// The production wiring is the policy: the server serves whatever `main.ts`
// hands it, so each of the five preview routes must be wired through the gate.
// Census-diffs-the-disk, the same stance `gh-exec-census.test.ts` takes.
describe('main.ts wires every mirror-pass preview through the gate', () => {
  const MAIN = readFileSync(join(process.cwd(), 'apps/dashboard/src/server/main.ts'), 'utf8');

  it.each([
    ['mirrorPass', 'createMirrorPassPreviewApi'],
    ['mirrorPassLandingNote', 'createMirrorPassLandingNotePreviewApi'],
    ['mirrorPassDrift', 'createMirrorPassDriftPreviewApi'],
    ['mirrorPassStaleClaim', 'createMirrorPassStaleClaimPreviewApi'],
    ['mirrorPassPriorityFollow', 'createMirrorPassPriorityFollowPreviewApi'],
  ])('%s: refuseRepoMismatchedPreview(dbPath, %s(dbPath))', (dep, factory) => {
    // Whitespace-blind: the formatter wraps the longer names over four lines.
    const wired = new RegExp(
      `\\b${dep}: refuseRepoMismatchedPreview\\(\\s*dbPath,\\s*${factory}\\(dbPath\\),?\\s*\\),`,
    );
    expect(MAIN).toMatch(wired);
  });
});
