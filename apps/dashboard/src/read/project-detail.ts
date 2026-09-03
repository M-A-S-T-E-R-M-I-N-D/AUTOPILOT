// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * On-demand, single-project reads: firing drill-downs (activity trace, diff,
 * flight log tail, "load more" firings page), the LANDING/ROUND/RELEASE/BACKLOG
 * previews, and the ask-your-project retrieval context (search, docs, project
 * map, live state). None of this feeds the polled `/api/state` gather in
 * ./source.ts — each function here opens its own store handle on demand and
 * degrades to an honest empty/null result on any failure, the same read-only
 * contract as the rest of read/.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  openStore,
  listProjects,
  getIndexMeta,
  firingStats,
  activityEventsForFiring,
  firingCommitRef,
  recentTasks,
  SqliteSearchStore,
  type Store,
  type SearchHit,
} from '@autopilot/store';
import {
  GitVcs,
  planRelease,
  fenceTitle,
  type DiffStat,
  type CommitWithFiles,
  type ReleasePlan,
  type LandingOverlapWarning,
} from '@autopilot/engine';
import { gatherLandingOverlaps } from '../landing/overlap.js';
import { liveFiring, type ActivityEntry, type FlightEntry } from './fleet.js';
import { tailFlightLog } from './flightlog.js';
import { deriveFlyProjectId, flightLogFileName } from '../flight/lock.js';
import { deriveWorktreePlan } from '../flight/worktree.js';
import { findReconciliationCandidates, type ReconciliationCandidate } from './reconcile.js';
import { buildFleetDigest } from '../flight/fleet-digest.js';
import {
  FLIGHT_LOG_PAGE_SIZE,
  mapFlightEntries,
  mapTaskEntries,
  parseActivities,
  parseActivityRows,
  parseLanguages,
  parseTopDirs,
  parseHotFiles,
} from './source.js';

export interface FiringsPage {
  readonly entries: readonly FlightEntry[];
  readonly hasMore: boolean;
}

/**
 * One older page of a project's flight log (web-msnf2heh-2znbbu): `/api/firings`
 * "Load more" past the `FLIGHT_LOG_PAGE_SIZE` window baked into `/api/state`.
 * Returns null for an unknown project or a missing/unreadable store — same
 * honest-degrade contract as {@link readFleetFromStore}.
 */
export function readFiringsPage(
  dbPath: string,
  projectId: string,
  offset: number,
): FiringsPage | null {
  if (!existsSync(dbPath)) return null;
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    const p = listProjects(store.db).find((x) => x.id === projectId);
    if (!p) return null;
    // Same "fetch one extra row" hasMore trick as gather() — no COUNT query.
    const page = mapFlightEntries(store.db, p.id, FLIGHT_LOG_PAGE_SIZE + 1, offset);
    return {
      entries: page.slice(0, FLIGHT_LOG_PAGE_SIZE),
      hasMore: page.length > FLIGHT_LOG_PAGE_SIZE,
    };
  } catch {
    return null;
  } finally {
    store?.close();
  }
}

export interface FiringActivityPage {
  readonly entries: readonly ActivityEntry[];
}

/**
 * One firing's COMPLETE activity trace, on demand (`/api/firing-activity`) —
 * the Firing Replay viewer's first slice (viz research, docs/RESEARCH-LIBRARY.md
 * "Agent observability & visualization"). `/api/state`'s own activity feed
 * caps at the newest N events project-wide ({@link recentActivityEvents}'s
 * default `limit`), so the per-firing drill-down for anything but the most
 * recent firing(s) can render truncated or empty even though the full trace
 * is durably stored. This reads it directly by firing id, uncapped. Returns
 * null for an unknown project or a missing/unreadable store — same
 * honest-degrade contract as {@link readFiringsPage}.
 */
export function readFiringActivity(
  dbPath: string,
  projectId: string,
  firingId: string,
): FiringActivityPage | null {
  if (!existsSync(dbPath)) return null;
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    const p = listProjects(store.db).find((x) => x.id === projectId);
    if (!p) return null;
    return { entries: parseActivityRows(activityEventsForFiring(store.db, p.id, firingId)) };
  } catch {
    return null;
  } finally {
    store?.close();
  }
}

export interface FiringDiffInfo {
  /** The firing's full commit patch (message + diff), or `null` when the
   *  firing recorded no commit (never shipped, reverted) or the sha it
   *  recorded no longer resolves (e.g. a squashed/rewritten history). */
  readonly patch: string | null;
}

/**
 * One firing's commit diff, on demand (`/api/firing-diff`) — the Firing
 * Replay viewer's diff-capture slice (BOARD web-msnt26yk-5fzo6j), following
 * slice 1's activity-trace lazy-fetch pattern. No new capture/instrumentation
 * needed: `metrics.sha` already records the commit a shipped firing produced
 * (SOUL's "one firing = one commit" contract), so the diff is read straight
 * from git via `GitVcs.showPatch` rather than stored per-step. Returns null
 * for an unknown project or firing id, or a missing/unreadable store — same
 * honest-degrade contract as {@link readFiringActivity}. A known firing with
 * no recorded sha (or a sha git can no longer resolve) still returns a page,
 * just with `patch: null` — "nothing to show" is not the same as "not found".
 */
export async function readFiringDiff(
  dbPath: string,
  projectId: string,
  firingId: string,
): Promise<FiringDiffInfo | null> {
  if (!existsSync(dbPath)) return null;
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    const p = listProjects(store.db).find((x) => x.id === projectId);
    if (!p) return null;
    const ref = firingCommitRef(store.db, p.id, firingId);
    if (!ref) return null;
    if (!ref.sha) return { patch: null };
    const patch = await new GitVcs(p.root_path).showPatch(ref.sha);
    return { patch: patch || null };
  } catch {
    return null;
  } finally {
    store?.close();
  }
}

/**
 * The tail of ONE project's flight console (PARALLEL FLIGHTS 4/6): a
 * project's flight is spawned against its `root_path` (`spawn-flight.ts`),
 * which is the same input `deriveFlyProjectId`/`flightLogFileName` key off
 * of — NOT the project's own (possibly differently-minted, e.g. a
 * `self-`-prefixed self-onboard id) `id` column — so the log path is
 * re-derived from `root_path` here rather than built from `projectId`
 * directly. Returns an empty tail for an unknown project or a missing/
 * unreadable store — same honest-degrade contract as {@link readFiringsPage}.
 */
export function readFlightLogForProject(dbPath: string, projectId: string): readonly string[] {
  if (!existsSync(dbPath)) return [];
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    const p = listProjects(store.db).find((x) => x.id === projectId);
    if (!p) return [];
    const logPath = join(dirname(dbPath), flightLogFileName(deriveFlyProjectId(p.root_path)));
    return tailFlightLog(logPath);
  } catch {
    return [];
  } finally {
    store?.close();
  }
}

/** The post-flight LANDING card's preview (web-msm59yvg-hk7hkw): what a
 *  project's checked-out branch would bring into its base branch. `overlaps`
 *  (RESEARCH-LIBRARY fleet anti-duplication, defense-stack item 3) flags any
 *  sibling flight branch whose own unlanded commits touch the same files —
 *  `[]` when flying solo or nothing overlaps. `worktreeAhead`
 *  (web-msvbzahx-uiemjb, follow-up of `a81221f`) flags commits present on
 *  this project's linked flight worktree branch that a refusing sync-back
 *  never brought into THIS checked-out branch — `[]` when in sync or this
 *  project has never flown with worktree isolation. */
export interface LandingInfo {
  readonly branch: string;
  readonly base: string;
  readonly commits: readonly CommitWithFiles[];
  readonly diffstat: DiffStat;
  readonly overlaps: readonly LandingOverlapWarning[];
  readonly worktreeAhead: readonly CommitWithFiles[];
}

/**
 * Gather the LANDING preview for one project: its checked-out branch, the base
 * branch it would merge into, the commits ahead of that base, their combined
 * diffstat, and any same-file overlap with a sibling flight branch's own
 * unlanded work. Deliberately NOT part of `readFleet`/`gather` — those feed
 * the polled `/api/state` and SSE stream, and shelling out to git for every
 * project on every poll tick would be wasteful; this runs on demand only,
 * when the LANDING card is actually opened. Returns null when the project is
 * unknown, has no git repo, or has no discoverable base branch (e.g. a repo
 * with only the flight branch) — an honest "nothing to preview" rather than
 * a fabricated empty card.
 */
export async function readLandingInfo(
  dbPath: string,
  projectId: string,
): Promise<LandingInfo | null> {
  if (!existsSync(dbPath)) return null;
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    const project = listProjects(store.db).find((p) => p.id === projectId);
    if (!project) return null;
    const vcs = new GitVcs(project.root_path);
    const [branch, base] = await Promise.all([vcs.currentBranch(), vcs.defaultBranch()]);
    if (base === '' || base === branch) return null;
    const [commits, diffstat] = await Promise.all([
      vcs.commitsAhead(base),
      vcs.diffstat(base, 'HEAD'),
    ]);
    const myFiles = [...new Set(commits.flatMap((c) => c.files))];
    const overlaps = await gatherLandingOverlaps(
      vcs,
      project.root_path,
      projectId,
      branch,
      base,
      myFiles,
    );
    // Keyed the same deterministic way fly.ts derives the worktree it
    // actually flies (root_path, NOT `projectId` — see
    // readFlightLogForProject above for why the two can differ for a
    // self-onboarded project). No new git primitive needed: a linked
    // worktree shares refs with its origin checkout, so the worktree branch
    // is readable straight off `vcs` (rooted at `project.root_path`) without
    // a second GitVcs pointed at the worktree path.
    const worktreePlan = deriveWorktreePlan(
      project.root_path,
      deriveFlyProjectId(project.root_path),
    );
    const worktreeAhead = existsSync(worktreePlan.path)
      ? await vcs.commitsAhead(branch, worktreePlan.branch)
      : [];
    return { branch, base, commits, diffstat, overlaps, worktreeAhead };
  } catch {
    return null;
  } finally {
    store?.close();
  }
}

/** The CURRENT ROUND view (web-msntc6cx-yios2n): a project's totals since its
 *  most recent git release tag — a non-destructive alternative to "Start over"
 *  (which actually deletes firing history to show a fresh 0/0). `roundStartAt`/
 *  `tagName` are null when the repo has no tags yet — an honest "no round
 *  boundary defined" rather than a fabricated one; `firings`/`shipped`/`cost`
 *  are then simply the all-time totals (the whole history IS the round so far). */
export interface RoundInfo {
  readonly roundStartAt: number | null;
  readonly tagName: string | null;
  readonly firings: number;
  readonly shipped: number;
  readonly cost: number;
  readonly shipRate: number | null;
  readonly costPerShipped: number | null;
}

/**
 * Gather the CURRENT ROUND totals for one project. Deliberately NOT part of
 * `readFleet`/`gather` for the same reason as {@link readLandingInfo}: it
 * shells out to git on demand, and folding a per-project git call into the
 * polled `/api/state` would be wasteful. Returns null when the project is
 * unknown or the read itself fails; never crashes the dashboard.
 */
export async function readRoundInfo(dbPath: string, projectId: string): Promise<RoundInfo | null> {
  if (!existsSync(dbPath)) return null;
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    const project = listProjects(store.db).find((p) => p.id === projectId);
    if (!project) return null;
    const vcs = new GitVcs(project.root_path);
    const tag = await vcs.lastTag();
    const stats = firingStats(store.db, projectId, tag?.at);
    return {
      roundStartAt: tag?.at ?? null,
      tagName: tag?.name ?? null,
      firings: stats.firings,
      shipped: stats.shipped,
      cost: stats.cost,
      shipRate: stats.firings > 0 ? stats.shipped / stats.firings : null,
      costPerShipped: stats.shipped > 0 ? stats.cost / stats.shipped : null,
    };
  } catch {
    return null;
  } finally {
    store?.close();
  }
}

// Commit window `findReconciliationCandidates` scores open task titles
// against — mirrors fly.ts's end-of-flight RECONCILE_COMMIT_WINDOW (kept as
// a separate constant: that one runs once per flight, this one on demand
// per project-page load, and the two call sites have no shared module to
// own a common export without new coupling for a single integer).
const BACKLOG_COMMIT_WINDOW = 50;

/**
 * The project page's DETECTED BACKLOG panel (headless-surfacing sweep,
 * web-msnqqjmd-9bx0wd): `findReconciliationCandidates` (read/reconcile.ts)
 * already scores every open board task's title against recent commit
 * subjects/changed-file paths — but fly.ts's end-of-flight sweep only ever
 * PRINTS the result to the flight console, telling the operator to "review on
 * the dashboard" even though no dashboard surface ever read it. This recomputes
 * the same match on demand for the project page, the same on-demand-not-polled
 * reasoning as `readLandingInfo`/`readRoundInfo` — shelling out to git on every
 * poll tick would be wasteful. Returns [] when the project is unknown, has no
 * open tasks, has no repo, or the read itself fails — an honest "nothing
 * detected" rather than a crash.
 */
export async function readBacklogCandidates(
  dbPath: string,
  projectId: string,
): Promise<readonly ReconciliationCandidate[]> {
  if (!existsSync(dbPath)) return [];
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    const project = listProjects(store.db).find((p) => p.id === projectId);
    if (!project) return [];
    const openTasks = recentTasks(store.db, projectId).filter(
      (t) => t.status === 'queued' || t.status === 'in_progress',
    );
    if (openTasks.length === 0) return [];
    const vcs = new GitVcs(project.root_path);
    const commits = await vcs.recentCommits(BACKLOG_COMMIT_WINDOW);
    return findReconciliationCandidates(
      openTasks,
      commits.map((c) => ({ sha: c.shortSha, subject: c.subject, files: c.files })),
    );
  } catch {
    return [];
  } finally {
    store?.close();
  }
}

/**
 * FLEET COORDINATION VISIBILITY (BOARD web-mtbp0t8z-aftrnm, "NO VISIBLE
 * INTER-LANE COORDINATION" — operator-found): lanes coordinate via task
 * claims (leases: a `tasks` row's `assignee`/`status`, see
 * `@autopilot/store`'s `claimTask`) and declared `.autopilot-intent` files,
 * but neither was ever surfaced anywhere an operator could see it — only
 * into a SIBLING's own firing prompt (`fly.ts`'s `buildFleetDigest`, "who
 * else has claimed what / what is each sibling branch touching"). Reuses
 * that exact digest rather than standing up a second query: an empty
 * `instanceKey` excludes nothing from the CLAIMED-by lines (`assignee` is
 * never the empty string), so every held claim renders here, not just a
 * caller's siblings' as the firing-prompt call site does for itself. Same
 * on-demand-not-polled, project-not-found/no-repo-degrades-to-[] contract as
 * `readBacklogCandidates` above.
 */
export async function readCoordinationState(
  dbPath: string,
  projectId: string,
): Promise<readonly string[]> {
  if (!existsSync(dbPath)) return [];
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    const project = listProjects(store.db).find((p) => p.id === projectId);
    if (!project) return [];
    const digest = await buildFleetDigest(store, projectId, '', project.root_path);
    return digest === '' ? [] : digest.split('\n');
  } catch {
    return [];
  } finally {
    store?.close();
  }
}

/** The RELEASE preview (BACKLOG web-msnshavs-z0obmh, "Release automation"):
 *  what the next release would cut, computed against a project's real
 *  `package.json` version, `CHANGELOG.md` text, and the commits since its
 *  last release tag via `planRelease` (packages/engine/src/release.ts, a
 *  pure policy function). Read-only — nothing here writes `package.json`/
 *  `CHANGELOG.md` or creates a tag; that HTTP write+tag wiring is a
 *  follow-up slice under the same backlog id, the same way LANDING shipped
 *  a read-only preview (`readLandingInfo`) well before EXECUTE did the real
 *  merge. `plan` is null only when there is no last tag yet — no boundary to
 *  diff commits against — rather than guessing at one; once a tag exists,
 *  `plan` is `planRelease`'s real verdict, including its `ok: false` "no
 *  release-worthy commits" case. */
export interface ReleaseInfo {
  readonly tagName: string | null;
  readonly currentVersion: string;
  readonly plan: ReleasePlan | null;
}

/**
 * Gather the RELEASE preview for one project. Deliberately NOT part of
 * `readFleet`/`gather` for the same on-demand-only reasoning as
 * `readLandingInfo`/`readRoundInfo` — shelling out to git and re-reading
 * `package.json`/`CHANGELOG.md` on every poll tick would be wasteful.
 * Returns null when the project is unknown, its `package.json` has no
 * string `version`, either file can't be read, or `planRelease` itself
 * throws (a malformed version or a changelog with no `[Unreleased]`
 * heading) — an honest "nothing to preview" rather than a crash.
 */
export async function readReleaseInfo(
  dbPath: string,
  projectId: string,
): Promise<ReleaseInfo | null> {
  if (!existsSync(dbPath)) return null;
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    const project = listProjects(store.db).find((p) => p.id === projectId);
    if (!project) return null;
    const pkg = JSON.parse(readFileSync(join(project.root_path, 'package.json'), 'utf8')) as {
      version?: unknown;
    };
    const currentVersion = typeof pkg.version === 'string' ? pkg.version : '';
    if (!currentVersion) return null;
    const vcs = new GitVcs(project.root_path);
    const tag = await vcs.lastTag();
    if (!tag) return { tagName: null, currentVersion, plan: null };
    const changelog = readFileSync(join(project.root_path, 'CHANGELOG.md'), 'utf8');
    const commits = await vcs.commitsAhead(tag.name);
    const date = new Date().toISOString().slice(0, 10);
    const plan = planRelease(
      currentVersion,
      changelog,
      commits.map((c) => c.subject),
      date,
    );
    return { tagName: tag.name, currentVersion, plan };
  } catch {
    return null;
  } finally {
    store?.close();
  }
}

/**
 * Full-text search over one project's indexed content. Opens the store, queries
 * the FTS5 index, closes. Any failure (no DB yet, unmigrated/no search table,
 * bad query) degrades to no hits — search must never crash the dashboard.
 */
export function readSearchFromStore(
  dbPath: string,
  projectId: string,
  query: string,
  limit: number,
): readonly SearchHit[] {
  if (!existsSync(dbPath)) return [];
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    return new SqliteSearchStore(store).search(projectId, query, limit);
  } catch {
    return [];
  } finally {
    store?.close();
  }
}

/** Doc-ish indexed paths for the Docs reader panel (README, licenses, docs/, *.md). */
export function listProjectDocs(dbPath: string, projectId: string): readonly string[] {
  if (!existsSync(dbPath)) return [];
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    const rows = store.db
      .prepare(
        `SELECT path FROM project_search
          WHERE project_id = ?
            AND (path LIKE 'README%' OR path LIKE 'LICENSE%' OR path LIKE 'LICENSES/%'
                 OR path LIKE 'docs/%' OR path LIKE '%.md')
          ORDER BY
            CASE WHEN path LIKE 'README%' THEN 0
                 WHEN path LIKE 'docs/%' THEN 1
                 WHEN path LIKE 'LICENSE%' OR path LIKE 'LICENSES/%' THEN 2
                 ELSE 3 END,
            path`,
      )
      .all(projectId) as { path: string }[];
    return rows.map((r) => r.path);
  } catch {
    return [];
  } finally {
    store?.close();
  }
}

/** Serve one indexed document's content (root-jailed BY CONSTRUCTION: only
 *  indexed files exist in the search store — no filesystem path ever touched). */
export function readProjectDoc(dbPath: string, projectId: string, path: string): string | null {
  if (!existsSync(dbPath)) return null;
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    return new SqliteSearchStore(store).documentContent(projectId, path);
  } catch {
    return null;
  } finally {
    store?.close();
  }
}

/** Max characters of one file fed to the ask prompt (grounding, cost-capped). */
const ASK_EXCERPT_CHARS = 3000;
const ASK_HIT_LIMIT = 3;

/**
 * Retrieval for ask-your-project: top-ranked files for the question, each with
 * its indexed content truncated to a prompt-sized excerpt. Degrades to [] on any
 * store failure (the ask flow then answers honestly without spending quota).
 */
export function gatherAskSources(
  dbPath: string,
  projectId: string,
  question: string,
): { path: string; excerpt: string }[] {
  if (!existsSync(dbPath)) return [];
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    const search = new SqliteSearchStore(store);
    const sources: { path: string; excerpt: string }[] = [];
    for (const hit of search.search(projectId, question, ASK_HIT_LIMIT)) {
      const content = search.documentContent(projectId, hit.path);
      if (content !== null) {
        sources.push({ path: hit.path, excerpt: content.slice(0, ASK_EXCERPT_CHARS) });
      }
    }
    return sources;
  } catch {
    return [];
  } finally {
    store?.close();
  }
}

/**
 * A compact, always-available PROJECT MAP for retrieval-augmented ask: name,
 * scale, languages, top directories, hot files, and the open board. This makes
 * the ask 100%-aware of the project's structure even when no indexed CONTENT
 * matches the question — structure questions get real answers, never a shrug.
 */
export function gatherProjectMap(dbPath: string, projectId: string): string | null {
  if (!existsSync(dbPath)) return null;
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    const p = listProjects(store.db).find((x) => x.id === projectId);
    if (!p) return null;
    const meta = getIndexMeta(store.db, p.id);
    const langs = parseLanguages(meta)
      .map((l) => `${l.language} (${l.files} files)`)
      .join(', ');
    const dirs = parseTopDirs(meta)
      .map((d) => `${d.dir}/ (${d.files})`)
      .join(', ');
    const hot = parseHotFiles(meta).join(', ');
    // fenceTitle: same untrusted tasks.title column prompt.ts's board/FOCUS
    // sections fence — this excerpt is always-included ask context, not opt-in.
    const tasks = recentTasks(store.db, p.id)
      .filter((t) => t.status !== 'done')
      .slice(0, 8)
      .map((t) => `[${t.status}] ${fenceTitle(t.title)}`)
      .join('; ');
    return [
      `Project: ${p.name} (status: ${p.status})`,
      meta ? `Scale: ${meta.file_count} files, ${meta.total_bytes} bytes indexed` : null,
      langs ? `Languages: ${langs}` : null,
      dirs ? `Top directories: ${dirs}` : null,
      hot ? `Hot files (most active): ${hot}` : null,
      tasks ? `Open board: ${tasks}` : null,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
  } catch {
    return null;
  } finally {
    store?.close();
  }
}

/**
 * The project's root folder on disk (epic 0012 slice 2): the ask-escalation
 * composition root needs this to spawn the read-only agentic session's CLI
 * `cwd` and the containment guard's `targetRoot` against the actual project
 * being asked about, not the dashboard's own folder. Same lookup pattern (and
 * same honest-degrade-to-null on any store failure) as {@link gatherProjectMap}.
 */
export function gatherProjectRoot(dbPath: string, projectId: string): string | null {
  if (!existsSync(dbPath)) return null;
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    return listProjects(store.db).find((x) => x.id === projectId)?.root_path ?? null;
  } catch {
    return null;
  } finally {
    store?.close();
  }
}

/** How many of the most recent firings LIVE STATE reports (freshest telemetry, capped). */
const LIVE_STATE_RECENT_FIRINGS = 3;

/**
 * A live-telemetry snapshot for retrieval-augmented ask: is a flight running
 * RIGHT NOW (firing, phase, claimed task), the last few firings (shipped +
 * cost), and board counts by status. Indexed content is a snapshot from the
 * last onboard/reindex — this reads the store fresh every call, so it is
 * never stale the way a document excerpt can be (engine's ask.ts LIVE_STATE_LABEL
 * rule tells the model to prefer this source for what's-happening-now questions).
 */
export function gatherLiveState(dbPath: string, projectId: string): string | null {
  if (!existsSync(dbPath)) return null;
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    const p = listProjects(store.db).find((x) => x.id === projectId);
    if (!p) return null;

    const tasks = mapTaskEntries(store.db, p.id);
    const flightLog = mapFlightEntries(store.db, p.id);
    const live = liveFiring({
      status: p.status,
      activity: parseActivities(store, p.id),
      flightLog,
      tasks,
    });

    // fenceTitle on focusTask/f.item: same untrusted-text treatment as the
    // board/FOCUS sections — this excerpt is always-included ask context.
    const flightLine = live
      ? `Flight: RUNNING right now — ${live.firingId}, phase: ${live.phase}, claimed task: ` +
        `${live.focusTask ? fenceTitle(live.focusTask) : '(none focused — working the open queue)'}. ${live.narrator}`
      : `Flight: not running right now (project status: ${p.status}).`;

    const recent = flightLog
      .slice(0, LIVE_STATE_RECENT_FIRINGS)
      .map(
        (f) =>
          `${f.id} — ${f.shipped ? 'shipped' : 'not shipped'}${f.item ? ` (${fenceTitle(f.item)})` : ''}, $${f.cost.toFixed(2)}`,
      )
      .join('; ');

    const counts = new Map<string, number>();
    for (const t of tasks) counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
    const board =
      counts.size > 0
        ? [...counts.entries()].map(([status, n]) => `${n} ${status}`).join(', ')
        : 'empty';

    return [flightLine, recent ? `Last firings: ${recent}` : null, `Board: ${board}`]
      .filter((line): line is string => line !== null)
      .join('\n');
  } catch {
    return null;
  } finally {
    store?.close();
  }
}
