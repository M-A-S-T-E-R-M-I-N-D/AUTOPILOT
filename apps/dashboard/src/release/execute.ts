// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The RELEASE card's EXECUTE action (BACKLOG web-msnshavs-z0obmh, "Release
 * automation" — the HTTP half; the engine-level `executeRelease` policy
 * shipped first, in packages/engine/src/release.ts). Given a known project
 * id, gathers the same real inputs `readReleaseInfo` already previews with
 * (`package.json`'s version, `CHANGELOG.md`'s text, the commits since the
 * last release tag) and hands off to the engine's `executeRelease`: plan →
 * write `package.json` + `CHANGELOG.md` → `git commit --signoff` → annotated
 * `git tag`. Refuses (`reason: 'no-op'`) up front, touching nothing, when
 * there is no prior tag to diff against or no release-worthy commit since it
 * — the same "nothing to do" stance `planRelease` itself takes.
 *
 * The `git notes` attestation leg is wired in — `executeRelease` attaches it
 * automatically once the tag lands. An optional caller-supplied `milestoneTag`
 * (`docs/RELEASING.md`'s `m<N>`) is forwarded straight through to
 * `executeRelease`, which tags it at the same commit; the HTTP handler
 * (`server.ts`'s `handleReleaseExecute`) validates its shape before it ever
 * reaches here, so a malformed one reaching this function would be an
 * integration bug, not a normal refusal.
 *
 * `ghRelease` (epic 0006 "GitHub connected mode", slice 3 "maintainer flow":
 * board web-mss4lpwl-z0w495) is the optional publish-upstream leg: once
 * `executeRelease` lands a real `v<version>` tag, an operator opting in gets
 * that ONE tag (never the branch itself — that stays the separate, existing
 * "Sync to GitHub" action) pushed to the project's remote, then `gh release
 * create` turns it into a real GitHub Release using the annotated tag's own
 * message as notes (`--notes-from-tag`) — never fabricated text. `gh` shells
 * through the same injectable, `execFile`-backed `CommandRunner`
 * `github/execute.ts` already defined for `gh repo create`/`git push`, reused
 * here rather than duplicated. Same non-fatal-degradation stance as
 * `attestation`/`milestoneTag`: a failed push or a failed `gh release create`
 * never flips the overall `ok`/`reason` — the release itself (commit + tag)
 * already succeeded by that point — it only ever surfaces under the
 * `ghRelease` sub-result.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openStore, listProjects } from '@autopilot/store';
import {
  GitVcs,
  executeRelease,
  type ReleaseExecuteResult as EngineReleaseExecuteResult,
  type ReleaseWriter,
} from '@autopilot/engine';
import { realRunner, type CommandRunner } from '../github/execute.js';
import { releaseMaturityOf, type MaturityChoice, type ReleaseMaturity } from './maturity.js';

/** Outcome of the optional `gh release create` step — same shape as
 *  `attestation`/`milestoneTag`'s sub-results, plus the maturity verdict
 *  that decided the `--prerelease` flag (auditable, never a silent guess). */
export interface GhReleaseSubResult {
  readonly ok: boolean;
  readonly details: string;
  readonly maturity?: ReleaseMaturity;
}

/** {@link EngineReleaseExecuteResult} plus the dashboard-only `ghRelease` leg
 *  `executeRelease` (the pure engine policy) knows nothing about — it only
 *  ever shells to `git`/`gh`, which stays out of `packages/engine` on
 *  purpose (see `github-sync.ts`'s own doc comment: policy stays pure, I/O
 *  lives here). */
export type ReleaseExecuteResult = EngineReleaseExecuteResult & {
  readonly ghRelease?: GhReleaseSubResult;
};

/** One RELEASE EXECUTE attempt for a project, or `null` when the project id
 *  is unknown (the HTTP handler turns that into a 404, same convention as
 *  {@link import('../landing/execute.js').LandingExecuteApi}). `milestoneTag`
 *  is optional — an operator names a milestone (`m<N>`) only when this
 *  release actually completes one. `ghRelease: true` opts into the
 *  push-tag + `gh release create` leg described above; omitted/false leaves
 *  this attempt exactly as it was before that leg existed. */
export type ReleaseExecuteApi = (
  projectId: string,
  milestoneTag?: string,
  ghRelease?: boolean,
  maturity?: MaturityChoice,
) => Promise<ReleaseExecuteResult | null>;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replaces the `"version": "<currentVersion>"` occurrence matching the
 *  version already read from this same package.json — NOT just the first
 *  `"version": "..."` in the file. An onboarded project's manifest is
 *  arbitrary, not one this repo wrote: an npm `scripts.version` lifecycle
 *  hook (npm's own `version` script convention) or any other nested
 *  `"version"` key appearing before the top-level one in raw text would
 *  otherwise be corrupted instead of the real field. Anchoring on the known
 *  current value narrows the match to (almost certainly) the real one while
 *  still doing a targeted text replace instead of `JSON.parse`+`stringify`,
 *  which preserves the file's existing formatting (indentation, key order,
 *  trailing newline) exactly. */
function withBumpedVersion(raw: string, currentVersion: string, newVersion: string): string {
  const pattern = new RegExp(`"version"\\s*:\\s*"${escapeRegExp(currentVersion)}"`);
  return raw.replace(pattern, `"version": "${newVersion}"`);
}

/** `apps/dashboard/src/info.ts`'s hand-written `PRODUCT_VERSION` constant,
 *  relative to a project root — present only when the project being released
 *  IS this dashboard's own repo. Matched independently of its current value
 *  (unlike {@link withBumpedVersion}, which anchors on the known
 *  `package.json` version) because staleness is exactly the bug this closes:
 *  2026-08-24 incident, `apps/dashboard/test/info.test.ts`'s drift guard —
 *  `executeRelease` bumped `package.json`/`CHANGELOG.md` but never touched
 *  this hand-written constant, so a released dashboard reported a version
 *  three releases stale. */
const PRODUCT_VERSION_PATTERN = /(export const PRODUCT_VERSION = ')[^']+(';)/;

function withBumpedProductVersion(raw: string, newVersion: string): string {
  return raw.replace(PRODUCT_VERSION_PATTERN, `$1${newVersion}$2`);
}

/** Build the RELEASE execute API against the real store + real git/fs — the
 *  production wiring `main.ts` injects into the server. `runCommand` defaults
 *  to the real `execFile`-backed runner (`github/execute.ts`'s `realRunner`);
 *  tests inject a fake so no real `git push`/`gh release create` ever fires. */
export function createReleaseExecuteApi(
  dbPath: string,
  runCommand: CommandRunner = realRunner,
): ReleaseExecuteApi {
  return async (projectId, milestoneTag, ghRelease, maturity) => {
    const store = openStore(dbPath);
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;

      const pkgPath = join(project.root_path, 'package.json');
      const changelogPath = join(project.root_path, 'CHANGELOG.md');

      let pkgRaw: string;
      let currentVersion: string;
      try {
        pkgRaw = readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(pkgRaw) as { version?: unknown };
        currentVersion = typeof pkg.version === 'string' ? pkg.version : '';
      } catch {
        return { ok: false, reason: 'no-op', details: 'package.json is missing or unreadable' };
      }
      if (!currentVersion) {
        return { ok: false, reason: 'no-op', details: 'package.json has no string "version"' };
      }

      const vcs = new GitVcs(project.root_path);
      const tag = await vcs.lastTag();
      if (!tag) {
        return {
          ok: false,
          reason: 'no-op',
          details: 'no prior release tag to diff commits against',
        };
      }

      let changelog: string;
      try {
        changelog = readFileSync(changelogPath, 'utf8');
      } catch {
        return { ok: false, reason: 'no-op', details: 'CHANGELOG.md is missing or unreadable' };
      }

      const commits = await vcs.commitsAhead(tag.name);
      const date = new Date().toISOString().slice(0, 10);

      const infoPath = join(project.root_path, 'apps/dashboard/src/info.ts');
      let infoRaw: string | undefined;
      try {
        infoRaw = readFileSync(infoPath, 'utf8');
      } catch {
        infoRaw = undefined;
      }

      const writer: ReleaseWriter = {
        writeVersion: (version) => {
          writeFileSync(pkgPath, withBumpedVersion(pkgRaw, currentVersion, version));
          if (infoRaw !== undefined && PRODUCT_VERSION_PATTERN.test(infoRaw)) {
            writeFileSync(infoPath, withBumpedProductVersion(infoRaw, version));
          }
        },
        writeChangelog: (cl) => writeFileSync(changelogPath, cl),
      };

      const result = await executeRelease(
        currentVersion,
        changelog,
        commits.map((c) => c.subject),
        date,
        writer,
        vcs,
        milestoneTag,
      );

      if (!ghRelease || !result.ok) return result;
      const ghResult = await publishGithubRelease(
        vcs,
        runCommand,
        project.root_path,
        result.version!,
        maturity,
        project.name,
      );
      return { ...result, ghRelease: ghResult };
    } finally {
      store.close();
    }
  };
}

/** The optional publish-upstream leg (see the module doc comment): pushes
 *  ONLY the new `v<version>` tag — never the branch, which stays the
 *  separate "Sync to GitHub" action — then runs `gh release create` against
 *  it. Refuses up front, without running either command, when the project
 *  has no GitHub remote configured yet; a failed push never attempts the
 *  `gh` call. `--verify-tag` refuses rather than letting `gh` silently
 *  auto-create a mismatched tag off the default branch's HEAD if the push
 *  somehow didn't take. */
async function publishGithubRelease(
  vcs: GitVcs,
  runCommand: CommandRunner,
  cwd: string,
  version: string,
  maturityChoice?: MaturityChoice,
  displayName?: string,
): Promise<GhReleaseSubResult> {
  const tagName = `v${version}`;
  // Maturity intelligence (release/maturity.ts): a 0.x or `-alpha`-suffixed
  // version publishes with --prerelease, so GitHub badges it "Pre-release"
  // and never crowns it "Latest" — the honest public signal an alpha owes
  // its visitors. The operator's explicit choice overrides detection.
  const maturity = releaseMaturityOf(version, maturityChoice ?? 'auto');

  const hasRemote = await vcs.hasRemote();
  if (!hasRemote) {
    return {
      ok: false,
      details: 'no GitHub remote configured — sync this project to GitHub first',
      maturity,
    };
  }

  const push = await runCommand('git', ['push', 'origin', tagName], cwd);
  if (push.exitCode !== 0) {
    return {
      ok: false,
      details: push.stderr.trim() || `git push exited ${push.exitCode}`,
      maturity,
    };
  }

  // Title: "<project name> v<version> — <phase>" for a pre-release, so the
  // releases page reads like a maintainer wrote it (the 2026-09-04 v0.22.0
  // lesson: a bare "v0.22.0" title next to the hand-crafted genesis release
  // read like a placeholder). Stable releases drop the phase suffix; a
  // project with no display name falls back to the tag alone.
  const releaseTitle =
    (displayName ? `${displayName} ${tagName}` : tagName) +
    (maturity.prerelease
      ? ` — ${maturity.phase === 'rc' ? 'release candidate' : maturity.phase}`
      : '');
  const release = await runCommand(
    'gh',
    [
      'release',
      'create',
      tagName,
      '--verify-tag',
      '--notes-from-tag',
      '--title',
      releaseTitle,
      ...(maturity.prerelease ? ['--prerelease'] : []),
    ],
    cwd,
  );
  return {
    ok: release.exitCode === 0,
    details:
      release.exitCode === 0
        ? (release.stdout.trim() || `published GitHub Release ${tagName}`) +
          ` (${maturity.phase}: ${maturity.reasoning})`
        : release.stderr.trim() || `gh release create exited ${release.exitCode}`,
    maturity,
  };
}
