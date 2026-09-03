// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  ensureWorktree,
  syncWorktreeBranch,
  guardedPathsFor,
  snapshotGuardedHeads,
  detectContainmentBreaches,
  classifyBreaches,
  GitHeadReader,
} from '@autopilot/engine';
import { deriveWorktreePlan } from '../../src/flight/worktree.js';

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function initRepo(dir: string): void {
  gitSync(dir, ['init', '-q']);
  gitSync(dir, ['config', 'user.email', 'test@autopilot.dev']);
  gitSync(dir, ['config', 'user.name', 'Test']);
  gitSync(dir, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'a.txt'), 'one');
  gitSync(dir, ['add', '-A']);
  gitSync(dir, ['commit', '-q', '-m', 'feat: AP-1 first']);
}

/**
 * Slice 4 (docs/epics/0004-bash-containment-worktree.md): proves the guard
 * re-scope landed in slice 3 actually holds. Wires the SAME real pieces
 * fly.ts wires — deriveWorktreePlan, ensureWorktree/syncWorktreeBranch, and
 * the containment audit against a REAL GitHeadReader — over real temp git
 * repos, not the fakeReader containment.test.ts uses to prove the pure logic
 * alone.
 */
describe('bash containment: worktree escape (slice 4)', () => {
  let root: string;
  let target: string;
  let flightRoot: string;
  let branch: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'autopilot-escape-'));
    target = join(root, 'target-repo');
    mkdirSync(target);
    initRepo(target);
    const plan = deriveWorktreePlan(target, 'escape-test');
    mkdirSync(dirname(plan.path), { recursive: true });
    flightRoot = plan.path;
    branch = plan.branch;
    const created = await ensureWorktree(target, flightRoot, branch);
    expect(created.ok).toBe(true);
  });

  afterEach(() => {
    // flightRoot lives under `root` (deriveWorktreePlan: dirname(target),
    // and target is itself under root) — one recursive remove tears down
    // target's checkout, its .git worktree metadata, AND the worktree
    // directory together; no state survives outside the temp dir.
    //
    // Every `it` here awaits its own git subprocesses before returning, so
    // none is still running when this fires — but on Windows the OS can hold
    // a just-closed git process's handle on a worktree/index file a few
    // milliseconds past exit (antivirus scan, deferred handle release), and
    // this immediate rmSync races that release. maxRetries/retryDelay is the
    // same proven mitigation landing/execute.test.ts's cleanupDir already
    // applies for the identical Windows EBUSY class (e4f7215b, 34a286c1).
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('a cd-relative escape from inside the worktree never reaches target — byte-identical before/after', () => {
    const headBefore = gitSync(target, ['rev-parse', 'HEAD']);
    const contentBefore = readFileSync(join(target, 'a.txt'), 'utf8');

    // Historical escape shape (docs/FLIGHT-CONTAINMENT.md): `cd` out of the
    // flight dir, then git add/commit "elsewhere". flightRoot is a SIBLING
    // of target (deriveWorktreePlan), never nested inside it, so a relative
    // `cd ..` walk from flightRoot's cwd lands in scratch space — it can
    // never reach target's directory by accident.
    const escapeLandingDir = dirname(flightRoot);
    writeFileSync(join(escapeLandingDir, 'escaped.txt'), 'written by the escape');

    expect(existsSync(join(target, 'escaped.txt'))).toBe(false);
    expect(gitSync(target, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(readFileSync(join(target, 'a.txt'), 'utf8')).toBe(contentBefore);
  });

  it('detects a breach when an escape DOES reach target directly (the audit backstop)', () => {
    const reader = new GitHeadReader();
    const guarded = snapshotGuardedHeads(reader, guardedPathsFor(flightRoot, [target]));

    // The PreToolUse guard (layer 2, out of scope for this epic slice) is
    // what's meant to stop this in the first place; this proves the audit
    // (layer 1) still catches it if that guard is ever bypassed — an
    // absolute-path commit landing directly in target.
    writeFileSync(join(target, 'escaped.txt'), 'written by an absolute-path escape');
    gitSync(target, ['add', '-A']);
    gitSync(target, ['commit', '-q', '-m', 'feat: an escaped commit landed directly in target']);

    const breaches = detectContainmentBreaches(reader, guarded);
    expect(breaches).toHaveLength(1);
    expect(breaches[0]?.repoPath).toBe(target);
  });

  /**
   * CONTAINMENT vs OPERATOR (web-msu3x5ub-vqxjhu): under real worktree
   * isolation, `target`'s HEAD moving mid-flight is NOT reachable by this
   * flight's own Bash (it's confined to flightRoot, a sibling directory) —
   * fly.ts now classifies it as operator activity and keeps flying instead
   * of aborting a healthy flight for the operator's own commit.
   */
  it('classifies a target HEAD move as operator activity (not a hard breach) while isolated', () => {
    const reader = new GitHeadReader();
    const guarded = snapshotGuardedHeads(reader, guardedPathsFor(flightRoot, [target]));

    // The operator, working the SAME live checkout in parallel — nothing to
    // do with this flight's own worktree-confined Bash.
    writeFileSync(join(target, 'operator-edit.txt'), 'a human commit landed here mid-flight');
    gitSync(target, ['add', '-A']);
    gitSync(target, ['commit', '-q', '-m', 'chore: operator commit during takeoff']);

    const found = detectContainmentBreaches(reader, guarded);
    expect(found).toHaveLength(1);

    const isolationActive = flightRoot !== target; // true here — a real linked worktree
    const { hard, operator } = classifyBreaches(found, isolationActive);
    expect(hard).toEqual([]);
    expect(operator).toHaveLength(1);
  });

  it('a legitimate sync-back moves target HEAD without tripping a false breach', async () => {
    const targetBranch = gitSync(target, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const reader = new GitHeadReader();

    // A firing's Bash work, confined to flightRoot exactly as fly.ts wires it.
    writeFileSync(join(flightRoot, 'shipped.txt'), 'work done inside the worktree');
    gitSync(flightRoot, ['add', '-A']);
    gitSync(flightRoot, ['commit', '-q', '-m', 'feat: AP-2 shipped from the worktree']);

    const sync = await syncWorktreeBranch(target, targetBranch, branch);
    expect(sync.ok).toBe(true);
    expect(existsSync(join(target, 'shipped.txt'))).toBe(true);

    // fly.ts's onFiringComplete re-snapshots the guard baseline right after a
    // successful sync — this sanctioned HEAD movement must read as the new
    // normal, not a breach.
    const guarded = snapshotGuardedHeads(reader, guardedPathsFor(flightRoot, [target]));
    expect(detectContainmentBreaches(reader, guarded)).toEqual([]);
  });

  /**
   * CONTAINMENT vs OPERATOR (web-msu3x5ub-vqxjhu): the self-study ritual
   * (flight/ritual-lock.ts, fly.ts's post-loop SELF-STUDY updater) commits
   * into `process.cwd()` — THIS dashboard checkout's own repo, guarded
   * whenever it differs from `flightRoot`, which is virtually always —
   * "regardless of which project was flown". Stood in here as `dashboardRepo`
   * since it is a plain, unrelated guarded repo from the audit's point of
   * view, not `target` or `flightRoot`.
   */
  it('an unaccounted ritual commit into a guarded repo trips a false breach', () => {
    const dashboardRepo = join(root, 'dashboard-repo');
    mkdirSync(dashboardRepo);
    initRepo(dashboardRepo);
    const reader = new GitHeadReader();
    const guarded = snapshotGuardedHeads(reader, guardedPathsFor(flightRoot, [dashboardRepo]));

    // The self-study ritual's own commit (commitSelfStudyIfDirty) — sanctioned,
    // first-party, and entirely unrelated to the flight's work in flightRoot.
    writeFileSync(join(dashboardRepo, 'PAPER.md'), 'refreshed');
    gitSync(dashboardRepo, ['add', '-A']);
    gitSync(dashboardRepo, [
      'commit',
      '-q',
      '-m',
      'docs(self-study): flight-end automated data refresh',
    ]);

    // Without a re-baseline, the audit can't tell this apart from an escape —
    // this is the false positive that killed a live flight.
    expect(detectContainmentBreaches(reader, guarded)).toHaveLength(1);
  });

  it('re-baselining right after the ritual commit clears the false breach', () => {
    const dashboardRepo = join(root, 'dashboard-repo');
    mkdirSync(dashboardRepo);
    initRepo(dashboardRepo);
    const reader = new GitHeadReader();

    writeFileSync(join(dashboardRepo, 'PAPER.md'), 'refreshed');
    gitSync(dashboardRepo, ['add', '-A']);
    gitSync(dashboardRepo, [
      'commit',
      '-q',
      '-m',
      'docs(self-study): flight-end automated data refresh',
    ]);

    // fly.ts now re-snapshots right after commitSelfStudyIfDirty returns
    // true — the same pattern the sync-back path above already relies on.
    const guarded = snapshotGuardedHeads(reader, guardedPathsFor(flightRoot, [dashboardRepo]));
    expect(detectContainmentBreaches(reader, guarded)).toEqual([]);
  });

  /**
   * SYNC-BACK DRIFT SURFACING (web-msupuosk-gjll3p): a dirty operator
   * checkout at the instant onFiringComplete's sync-back runs used to strand
   * a firing's commits on the worktree branch for good — nothing in fly.ts
   * tried again before the flight ended. fly.ts now attempts one more
   * sync-back at flight-end (after the self-study ritual). Proves the
   * scenario that stranded 144 real commits: refused while dirty, then
   * succeeds once target is clean again — the exact two calls fly.ts now
   * makes (onFiringComplete, then the flight-end retry).
   */
  it('a sync-back refused while target is dirty succeeds on a later retry once target is clean', async () => {
    const targetBranch = gitSync(target, ['rev-parse', '--abbrev-ref', 'HEAD']);

    // A firing's Bash work, confined to flightRoot exactly as fly.ts wires it.
    writeFileSync(join(flightRoot, 'shipped.txt'), 'work done inside the worktree');
    gitSync(flightRoot, ['add', '-A']);
    gitSync(flightRoot, ['commit', '-q', '-m', 'feat: AP-2 shipped from the worktree']);

    // The operator, mid-edit in target's own live checkout — exactly the
    // condition that refused every sync-back for 2 days straight.
    writeFileSync(join(target, 'operator-wip.txt'), 'uncommitted operator edit');

    const duringFiring = await syncWorktreeBranch(target, targetBranch, branch);
    expect(duringFiring.ok).toBe(false);
    expect(existsSync(join(target, 'shipped.txt'))).toBe(false);

    // The operator finishes up (or reverts) their edit — target is clean again.
    gitSync(target, ['checkout', '--', '.']);
    gitSync(target, ['clean', '-fq']);

    const flightEndRetry = await syncWorktreeBranch(target, targetBranch, branch);
    expect(flightEndRetry.ok).toBe(true);
    expect(existsSync(join(target, 'shipped.txt'))).toBe(true);
  });
});
