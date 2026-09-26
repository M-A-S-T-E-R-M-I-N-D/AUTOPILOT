// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The LANDING card's EXECUTE action (web-msnqeegt-ki7dm0 — the HTTP half of
 * "Landing EXECUTE v3"; the engine-level gate-then-merge primitives shipped
 * first, in packages/engine/src/landing.ts + GitVcs.land). Given a known
 * project id, builds a REAL gate from its stored gate_config (the same
 * typecheck→lint→format→test→build mapping fly.ts uses to gate a live
 * flight) and a GitVcs against its root_path, resolves the base branch fresh
 * (never trusts a client-supplied base — the preview and the execute must
 * agree on what "base" means), then hands off to the engine's
 * `executeLanding`: gate-then-merge, refusing to touch git at all on a red
 * gate.
 *
 * On a successful land of the SELF-hosted project (the folder this dashboard
 * is running from — see self-restart.ts), fires the rebuild+restart trigger.
 * Fire-and-forget: never awaited, never blocks or changes the returned
 * result — a rebuild is a background concern, not part of "did it land".
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { openStore, listProjects, type Store } from '@autopilot/store';
import {
  GateRunner,
  GitVcs,
  addDetachedWorktree,
  executeLanding,
  removeWorktree,
  type GateProgressEvent,
  type LandingExecuteResult,
} from '@autopilot/engine';
import { detectGate, readFsSnapshot, type GateSpec } from '@autopilot/onboarding';
import type { SelfRestartTrigger } from './self-restart.js';
import { fileURLToPath } from 'node:url';
import { landingCodeIsStale, staleCodeNote } from './freshness.js';
import { samePath } from '../paths.js';
import { gateCommands } from '../gate-commands.js';
import { ciWorkflowStatus, createGhRun, type GhRun } from '../control/ci-status.js';
import type { PostPushWatchTrigger } from '../control/post-push-watch.js';
import { isAnyFlightLockLive } from '../flight/lock.js';

/** The dashboard's own root, paired with the trigger to fire when the
 *  landed project's root_path resolves to this same folder. Path comparison
 *  is case-insensitive on win32 (NTFS paths aren't case-sensitive). */
export interface SelfRestart {
  readonly root: string;
  readonly trigger: SelfRestartTrigger;
}

export type { LandingExecuteResult } from '@autopilot/engine';

/** `gate_config` stores `JSON.stringify(GateSpec)` (onboard.ts) — a flat
 *  object, not wrapped. Malformed/missing JSON degrades to "no gate
 *  commands" rather than throwing — GateRunner already treats an empty
 *  command list as a vacuous pass, so a project onboarded before gate
 *  detection existed still lands (just without gate protection). */
function parseGateSpec(gateConfig: string | null): GateSpec | null {
  if (!gateConfig) return null;
  try {
    const spec = JSON.parse(gateConfig) as GateSpec;
    return typeof spec.ecosystem === 'string' ? spec : null;
  } catch {
    return null;
  }
}

/**
 * A stored gate spec that predates a detector field. `gate_config` is written
 * ONCE, at onboarding, and never revisited — so when the detector learned to
 * list a project's `ci:*` scripts as `ciExtras`, every project onboarded
 * before that kept a spec without them, and the landing's PARITY GATE opt-in
 * (`includeCiExtras: true`) had nothing to include: the ritual ran five
 * commands and called it parity, while CI ran the scanners it had never seen
 * (2026-09-18: a test with literal drive-letter paths landed green and
 * reddened main on `no-personal-paths`). The landing is the one call site
 * that wants parity, so it is the one that re-detects.
 */
export function gateSpecNeedsRefresh(spec: GateSpec | null): boolean {
  // A repo without a lockfile never gains an install leg, so it re-detects on
  // every landing: one filesystem snapshot, cheap next to the gate it guards.
  return spec !== null && (spec.ciExtras === undefined || spec.install === undefined);
}

/** The stored spec with the freshly detected `ciExtras` folded in — nothing
 *  else moves, so an operator-edited command list is never overwritten by a
 *  re-detection that happens to disagree with it. */
export function mergeDetectedCiExtras(stored: GateSpec, detected: GateSpec): GateSpec {
  // The install leg (2026-09-19) rides the same refresh: a spec stored
  // before it existed gains it, and nothing else moves.
  const withInstall =
    detected.install === undefined || stored.install !== undefined
      ? stored
      : { ...stored, install: detected.install };
  return detected.ciExtras === undefined
    ? withInstall
    : { ...withInstall, ciExtras: detected.ciExtras };
}

/** Detects a folder's gate spec — injectable so tests never walk a real tree. */
export type GateSpecDetector = (rootPath: string) => GateSpec | null;

const detectGateSpec: GateSpecDetector = (rootPath) => {
  try {
    return detectGate(readFsSnapshot(rootPath)).spec;
  } catch {
    return null;
  }
};

/** `apps/dashboard`, whichever of `src/` or `dist/` this module runs from. */
const DASHBOARD_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The modules this landing's verdict depends on that are newer than the
 *  build this server runs — see `landing/freshness.ts`. */
export type StaleCodeCheck = () => readonly string[];

const staleLandingCode: StaleCodeCheck = () =>
  landingCodeIsStale(DASHBOARD_ROOT, Date.now() - process.uptime() * 1000);

/** Best-effort audit row (`events` table, no firing) — telemetry can never
 *  change a landing verdict, so a failed write is swallowed, not surfaced. */
function recordLandingEvent(store: Store, projectId: string, type: string, payload: unknown): void {
  try {
    store.db
      .prepare(
        'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, NULL, ?, ?, ?)',
      )
      .run(projectId, type, JSON.stringify(payload), Date.now());
  } catch {
    /* audit telemetry is best-effort — never fail a verdict over it */
  }
}

/** `LandingExecuteResult['reason']` widened with the refusal reasons that
 *  never reach the engine at all: a flight is running against this project
 *  (`'flight-running'`), so the gate/merge is refused before either even
 *  starts; or the converged branch's own e2e is red (`'e2e-red'`, operator
 *  decision 09-02, "option A" of ADR 0008 — see {@link E2eLandGuard}). */
export type LandingExecuteApiReason = LandingExecuteResult['reason'] | 'flight-running' | 'e2e-red';

/** One `git push` attempt's outcome as the LANDING panel and the durable
 *  history record ({@link readRecentLandingOutcome}) both see it — see THE
 *  PUSH LEG below for why this exists as its own row rather than folding
 *  into the merge's own `ok`. */
export interface LandingPushResult {
  readonly ok: boolean;
  readonly detail: string;
}

/** A `LandingExecuteResult` plus whether this attempt fired the self-restart
 *  trigger — the CSRF-guarded endpoint passes this straight through so the
 *  LANDING panel can show a "rebuilding…" affordance instead of going quiet
 *  mid-swap. `false` on every path that isn't a self-hosted green land.
 *  `push` is present only once a green land has attempted (or skipped, for a
 *  remote-less repo) its push leg — see THE PUSH LEG below. */
export type LandingExecuteApiResult = Omit<LandingExecuteResult, 'reason'> & {
  readonly reason: LandingExecuteApiReason;
  readonly restarting: boolean;
  readonly push?: LandingPushResult;
};

/** One LANDING EXECUTE attempt for a project, or `null` when the project id
 *  is unknown (the HTTP handler turns that into a 404, same convention as
 *  the other project-scoped write actions). */
export type LandingExecuteApi = (projectId: string) => Promise<LandingExecuteApiResult | null>;

/** Live gate-step reporting for the LANDING job registry (`landing/job.ts`):
 *  the gate runs for minutes, so the job needs to know WHICH step is running
 *  to show an operator anything honest meanwhile. Purely observational — the
 *  gate's own verdict is untouched, and omitting this changes nothing. */
export type LandingGateProgress = (projectId: string, event: GateProgressEvent) => void;

/** Fire-and-forget hook invoked when EXECUTE is refused because a flight is
 *  running — the one moment the real gate is skipped entirely, since the
 *  live checkout is off-limits to `land()` while the flight owns it (SAFETY
 *  comment above). A real implementation ({@link
 *  createOutOfBandLandGateCheck}) runs the SAME gate in an isolated
 *  worktree and alarms if it's red, so the operator learns the converged
 *  branch wouldn't pass BEFORE the flight even finishes — without touching
 *  or blocking it. The caller never awaits this: an implementation MUST
 *  swallow its own errors and MUST NOT throw synchronously. Omit it (e.g. in
 *  tests) and a flight-running refusal does nothing beyond the refusal
 *  itself, same as before this hook existed. */
export type OutOfBandLandGateCheck = (
  projectId: string,
  rootPath: string,
  gateConfig: string | null,
) => void;

/** One converged-branch e2e health read — `ok: false` means the base branch's
 *  own e2e is currently red and this landing should be refused before it
 *  even starts. `detail` is a short, human-readable line (surfaced verbatim
 *  in the refusal's `details`, which the LANDING panel already renders for
 *  ANY refusal reason — see `web/landing-panel.ts`'s `landingExecuteResult`). */
export interface E2eLandGuardResult {
  readonly ok: boolean;
  readonly detail: string;
  /** On a fresh red: the repo-relative files that run's own failure names
   *  (see {@link implicatedFilesFromFailedLog}) — what lets the landing
   *  decide whether it carries the remedy (see {@link remedyFilesOf}).
   *  Absent/empty when green, when the run id is unknown, or when the log
   *  could not be read: the escape is only ever earned by evidence. */
  readonly implicatedFiles?: readonly string[];
  /** On a fresh red: true when every failure in that run is a screenshot
   *  mismatch (see {@link isVisualOnlyFailure}) — what lets a landing that
   *  changes the rendered UI clear it (see {@link landingTouchesRenderedUi}). */
  readonly visualOnly?: boolean;
}

/** Pre-land converged-branch e2e guard (epic 0010 slice 4, operator decision
 *  09-02, "option A" of ADR 0008 — `docs/adr/0008-e2e-does-not-gate-direct-push-landings.md`):
 *  consulted BEFORE `executeLanding` runs, against `base` (the branch this
 *  landing would merge into — "the converged branch"). Synchronous and
 *  cheap by construction: a real implementation ({@link
 *  createRealE2eLandGuard}) reads the LATEST already-computed GitHub Actions
 *  result for `base` rather than running e2e itself, so this never adds the
 *  multi-minute Playwright cost ADR 0008 refused to put in the landing's own
 *  critical path. Omit it (e.g. in tests) and every land proceeds exactly as
 *  before this guard existed. */
export type E2eLandGuard = (rootPath: string, base: string) => E2eLandGuardResult;

/** Builds the real {@link E2eLandGuard}: the converged branch's latest
 *  `ci.yml` run (epic 0010 slice 2's `ciWorkflowStatus`, filtered to `base`
 *  so a PR-triggered run never outranks the actual push-to-base result the
 *  fleet's own direct-push landings care about) — already computed by GitHub
 *  Actions on the last push to `base`, never re-run here. `gh`
 *  absent/unauthenticated, no runs yet, or malformed output all degrade to
 *  `ok: true` (never block a landing on an UNKNOWN e2e state, only a
 *  genuinely red one), same posture `ciWorkflowStatus` itself already takes. */
export function createRealE2eLandGuard(
  run?: (rootPath: string) => GhRun,
  now: () => number = Date.now,
): E2eLandGuard {
  return (rootPath, base) => {
    const nowMs = now();
    const gh = (run ?? createGhRun)(rootPath);
    const status = ciWorkflowStatus('ci.yml', gh, nowMs, base);
    // A CANCELLED run is not a red one: ci.yml cancels the older run of a
    // branch the moment a newer push arrives (`cancel-in-progress`), so the
    // conclusion says "superseded", not "failed". The CI report still lists
    // it as needing a look (`ciWorkflowStatus` is unchanged); the land guard
    // treats it as the unknown it is — never block on unknown.
    if (status.conclusion === 'cancelled') {
      return {
        ok: true,
        detail: `cancelled run ignored (${status.detail}) — a superseded run is no verdict`,
      };
    }
    // STALENESS (EVALUATION 2026-09-02, caught on this guard's FIRST live
    // refusal): ci.yml's e2e job runs on PRs, and the fleet lands by direct
    // push — so `base` often has NO fresh run at all, and "the latest" can be
    // a failure from a week-old commit. A red verdict older than the
    // freshness window says nothing about the branch being landed NOW, so it
    // degrades to the same never-block-on-UNKNOWN posture gh-absent already
    // takes. A fresh red still refuses. The real fix — an out-of-band run
    // against the converged branch itself — is the E2E LANDING DAEMON slice.
    if (
      !status.ok &&
      status.createdAtMs !== null &&
      nowMs - status.createdAtMs > E2E_VERDICT_FRESHNESS_MS
    ) {
      return {
        ok: true,
        detail: `stale e2e verdict ignored (${status.detail}) — no fresh run exists for '${base}'; the pre-land daemon slice will close this`,
      };
    }
    if (status.ok || status.runId === null) return { ok: status.ok, detail: status.detail };
    // A FRESH red with a known run: read which files that run's failure
    // names, so the caller can tell a landing that carries the remedy from
    // one that piles more work onto a broken branch (remedyFilesOf). An
    // unreadable log yields no files, which keeps the refusal.
    let log: string;
    try {
      log = gh(['run', 'view', String(status.runId), '--log-failed']);
    } catch {
      log = '';
    }
    return {
      ok: false,
      detail: status.detail,
      implicatedFiles: implicatedFilesFromFailedLog(log),
      visualOnly: isVisualOnlyFailure(log),
    };
  };
}

/** How old a RED e2e verdict may be and still refuse a landing — older than
 *  this and it describes a long-gone commit, not the branch landing now. */
export const E2E_VERDICT_FRESHNESS_MS = 48 * 60 * 60 * 1000;

/** Where Playwright keeps the committed, CI-canonical visual baselines. */
const SNAPSHOT_DIR_MARKER = '.spec.ts-snapshots/';

/**
 * Whether the branch about to land is plausibly the REMEDY for a red
 * converged branch, rather than more weight piled on top of it.
 *
 * THE TRAP THIS CLOSES (operator, 2026-09-15: "how did you finish red?").
 * Visual baselines are CI-canonical — only a CI run on the canonical
 * platform can regenerate them — so any change to the rendered UI leaves
 * the converged branch red for exactly one cycle, until the freshly
 * rendered baselines are adopted and landed. But the e2e guard above
 * refuses to land INTO a red converged branch. So the guard blocked the
 * one commit that could clear the redness it was reporting, and the ritual
 * had no way out of a state it had just created. That is a deadlock, not a
 * safeguard: a guard whose refusal cannot be cleared by the fix has stopped
 * guarding anything.
 *
 * The escape is deliberately narrow — the pending landing must actually
 * touch the committed snapshots. A branch that changes anything else still
 * waits exactly as before, so this does not weaken the thing the guard
 * exists for: keeping unrelated work off a broken branch.
 */
export function landingCarriesBaselineFix(changedFiles: readonly string[]): boolean {
  return changedFiles.some((file) => file.replace(/\\/g, '/').includes(SNAPSHOT_DIR_MARKER));
}

/**
 * THE THIRD ESCAPE (2026-09-26): a red made only of screenshot mismatches
 * has exactly two remedies — new baselines, or a change to the UI that
 * renders them. The baseline escape above covers the first. The second was
 * missing: a spacing fix grew every fleet screenshot by 16px, the
 * follow-up that took the height back out changed only the stylesheet,
 * and a screenshot failure names only its spec file — so the guard refused
 * the one commit that could clear it, the same deadlock as before.
 *
 * As narrow as the others: every failure in the red run must be a
 * screenshot mismatch, and the landing must change the rendered UI (the
 * dashboard's web sources or the token package). A red with any other
 * kind of failure, or a landing that touches neither, still waits.
 */
const RENDERED_UI_DIRS = ['apps/dashboard/src/web/', 'packages/tokens/src/'];

export function landingTouchesRenderedUi(changedFiles: readonly string[]): boolean {
  return changedFiles.some((file) => {
    const f = file.replace(/\\/g, '/');
    return RENDERED_UI_DIRS.some((dir) => f.startsWith(dir));
  });
}

/** Whether every failure a Playwright run reports is a screenshot
 * mismatch: at least one `toHaveScreenshot` failure, and no `Error:` line
 * of any other kind. An unreadable or empty log is not visual-only. */
export function isVisualOnlyFailure(log: string): boolean {
  const errors = log
    .split('\n')
    .filter((line) => /\bError: /.test(line))
    .map((line) => line.replace(ANSI_RE, ''));
  return errors.length > 0 && errors.every((line) => line.includes('toHaveScreenshot'));
}

/** Terminal colour/style codes — `gh run view --log-failed` hands back the
 *  job's raw output, and vitest colours every failure header. */
const ANSI_RE = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, 'g');

/** A repo-relative source or test path as vitest prints one in a failure:
 *  after `FAIL` (optionally preceded by the pool label, `node`/`jsdom`) in
 *  the failed-tests summary, or after `❯` in a stack frame (`file:line:col`).
 *  At least one directory segment and a JS/TS extension, so a bare word
 *  like the pool label can never pass for a file. */
const FAILED_FILE_RE =
  /(?:\bFAIL\b|❯)\s+(?:\S+\s+)?([A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+\.(?:[cm]?[jt]sx?))(?=[\s:>]|$)|(?:^|[\s(])([A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+\.[A-Za-z0-9]+)[:(]\d+|\[warn\]\s+([A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+\.[A-Za-z0-9]+)\s*$|(?:^|\s)(\/?(?:[A-Za-z]:)?[A-Za-z0-9_.@-]+(?:[\\/][A-Za-z0-9_.@-]+)+\.[A-Za-z0-9]+)\s*$/gm;

/**
 * The files a failed CI run's own output names — the evidence behind the
 * second escape from a red converged branch (2026-09-17, ADR 0008): the
 * worktree test that reddened `main` was fixed in the very branch the guard
 * then refused to land, the same deadlock the baseline escape had already
 * closed for rendered snapshots. Reads the `FAIL <file> > …` summary lines
 * and the `❯ <file>:<line>:<col>` frames vitest prints, colour codes
 * stripped, de-duplicated in order of first appearance. Anything that is
 * not one of those shapes contributes nothing — a log with no vitest
 * failure in it (a build error, a scanner) yields an empty list.
 */
/** Playwright's list reporter prints every PASSING test as well (`ok 12
 *  [chromium] › e2e/x.spec.ts:54:3 › …`), and `--log-failed` returns the
 *  failed JOB's whole step log — so those lines name files that clear
 *  nothing and are dropped before the path scan. */
const PASSING_LINE_RE = /(?:^|\s)ok\s+\d+\s+\[/;

export function implicatedFilesFromFailedLog(log: string): readonly string[] {
  const files = new Set<string>();
  // Backslashes are normalised BEFORE the scan, not after: the windows-latest
  // runner prints `apps\dashboard\e2e\dashboard.spec.ts:8:3`, which no
  // forward-slash path group could match — the first live refusal of a
  // landing that carried the exact spec fix (2026-09-18, run 35325023691)
  // implicated nothing, and the remedy escape never got a chance.
  const text = log
    .replace(ANSI_RE, '')
    .split('\n')
    .filter((line) => !PASSING_LINE_RE.test(line))
    .join('\n')
    .replace(/\\/g, '/');
  for (const match of text.matchAll(FAILED_FILE_RE)) {
    // Group 1: the vitest `FAIL` header. Group 2: any `path:line` or
    // `path(line` reference — vitest's `❯` frames, Playwright's `✘ … ›
    // e2e/x.spec.ts:12:5`, tsc's diagnostics, and the repo's own scanners
    // (`no-personal-paths FAILED: … path:line [rule]`), which is how a red
    // caused by a scanner names the file that clears it. Group 3: prettier's
    // `[warn] path`. Group 4: a line that is nothing but a path — eslint
    // prints the file (absolute on the runner) on its own line above its
    // `line:col` rows. Paths that are relative to a package or absolute are
    // matched by suffix in remedyFilesOf.
    const file = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (file !== undefined) files.add(file.replace(/\\/g, '/'));
  }
  return [...files];
}

/**
 * Which of the red run's implicated files the pending landing actually
 * changes — non-empty means the landing carries the remedy and may land
 * into the red branch. Narrow on purpose, exactly like
 * {@link landingCarriesBaselineFix}: the branch must touch a file the
 * failure names; a branch that changes anything else still waits, so the
 * guard keeps unrelated work off a broken branch. Paths compare with `/`
 * separators either way, since `git diff --name-only` and vitest both print
 * forward slashes but a caller on Windows may not.
 */
export function remedyFilesOf(
  changedFiles: readonly string[],
  implicatedFiles: readonly string[],
): readonly string[] {
  const implicated = implicatedFiles.map((file) => file.replace(/\\/g, '/'));
  // A tool run from a package directory prints paths relative to IT
  // (Playwright: `e2e/x.spec.ts`), and eslint prints the runner's absolute
  // path — so a changed file counts when either spelling ends in the other
  // at a path boundary. The result is the CHANGED (repo-relative) spelling:
  // that is the file the audit row and the operator can act on.
  return changedFiles
    .map((file) => file.replace(/\\/g, '/'))
    .filter((changed) =>
      implicated.some(
        (file) => file === changed || changed.endsWith(`/${file}`) || file.endsWith(`/${changed}`),
      ),
    );
}

/** Build the LANDING execute API against the real store + real git/gate —
 *  the production wiring `main.ts` injects into the server. `selfRestart`
 *  is optional: omit it (e.g. in tests) and a landed self-project simply
 *  doesn't trigger a rebuild — the land itself is unaffected either way.
 *
 *  `isFlightRunning` (SAFETY — the FlightRunnerRegistry consult this API
 *  previously skipped entirely) reports whether a flight is currently
 *  running against a folder. A live flight ends its firing with its OWN
 *  commit against this same repo; landing concurrently would checkout/merge
 *  the base branch out from under it — a real git race, not a theoretical
 *  one. Refused BEFORE the gate even runs, same as a red gate: neither git
 *  nor the self-restart trigger is ever touched on this path. Omit it (e.g.
 *  in tests, or a caller with no registry to consult) and this check alone
 *  no longer refuses anything.
 *
 *  Unconditionally ALSO consults {@link isAnyFlightLockLive} against the
 *  same cross-process lockfile `fly.ts` itself writes (board ap-mtm4qzty-1):
 *  `isFlightRunning` only knows about flights THIS dashboard process spawned
 *  or adopted, so a flight started by a different process — a stray
 *  terminal `fly.ts`, another dashboard server, an N-way fleet sibling — was
 *  previously invisible here and a concurrent land would race its commits
 *  in the SAME primary directory. This check has no injection seam: it
 *  reads real lock files unconditionally, in production and in tests alike,
 *  so a test wanting a "no flight running" land must simply not create one.
 *
 *  `postPushWatch` (POST-PUSH VERDICT RITUAL slice 3, board
 *  web-mtpbmay4-94ii65) fires fire-and-forget, same contract as
 *  `outOfBandGateCheck` above, on EVERY green land — never on a refusal of
 *  any kind (`gate-red`, `merge-failed`, `flight-running`, `e2e-red`). Omit
 *  it (e.g. in tests) and a green land behaves exactly as it did before this
 *  slice existed. */
export function createLandingExecuteApi(
  dbPath: string,
  selfRestart?: SelfRestart,
  isFlightRunning?: (folder: string) => boolean,
  outOfBandGateCheck?: OutOfBandLandGateCheck,
  e2eLandGuard?: E2eLandGuard,
  onGateProgress?: LandingGateProgress,
  postPushWatch?: PostPushWatchTrigger,
  detectGateFor: GateSpecDetector = detectGateSpec,
  staleCode: StaleCodeCheck = staleLandingCode,
): LandingExecuteApi {
  return async (projectId) => {
    const store = openStore(dbPath);
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;

      if (
        isFlightRunning?.(project.root_path) ||
        isAnyFlightLockLive(dirname(dbPath), project.root_path)
      ) {
        outOfBandGateCheck?.(projectId, project.root_path, project.gate_config);
        return {
          ok: false,
          reason: 'flight-running',
          details:
            'a flight is currently running against this project — wait for it to finish or pause it first',
          restarting: false,
        };
      }

      const vcs = new GitVcs(project.root_path);
      const base = await vcs.defaultBranch();
      if (base === '') {
        return {
          ok: false,
          reason: 'merge-failed',
          details: 'no discoverable base branch (main/master) to land onto',
          restarting: false,
        };
      }

      // A dirty tree cannot land, and `executeLanding` says so — AFTER the
      // full gate has run for minutes against that same tree (2026-09-18: two
      // test edits made while a landing was in flight cost the whole cycle).
      // The same refusal, the same reason, one cheap status read earlier.
      // The post-gate check stays: the gate itself can dirty the tree.
      if (await vcs.isDirty()) {
        return {
          ok: false,
          reason: 'merge-failed',
          details:
            'nothing to land: the working tree is dirty — commit or stash first (checked before the gate)',
          restarting: false,
        };
      }

      const e2eHealth = e2eLandGuard?.(project.root_path, base);
      // A red converged branch normally refuses the land. Two exceptions,
      // both the same shape — the pending landing IS the remedy: a branch
      // that re-renders the very baselines the branch is red on
      // (landingCarriesBaselineFix), or one that touches a file the red
      // run's own failure names (remedyFilesOf) — see both for why refusing
      // THOSE is a deadlock rather than a safeguard. Failing to read the diff
      // yields an empty list, which takes the refusal, so an unreadable repo
      // never buys a landing it has not earned.
      const pendingFiles = await vcs.changedFiles(base, 'HEAD').catch((): readonly string[] => []);
      const carriesBaselineFix =
        landingCarriesBaselineFix(pendingFiles) ||
        (e2eHealth?.visualOnly === true && landingTouchesRenderedUi(pendingFiles));
      const remedyFiles = remedyFilesOf(pendingFiles, e2eHealth?.implicatedFiles ?? []);
      if (e2eHealth && !e2eHealth.ok && !carriesBaselineFix && remedyFiles.length === 0) {
        // Alarm event, same best-effort/never-fail-the-refusal-over-it
        // posture as the 'landed' event write below — an audit trail entry,
        // not something that can itself block anything.
        recordLandingEvent(store, projectId, 'e2e-land-block', { detail: e2eHealth.detail });
        return {
          ok: false,
          reason: 'e2e-red',
          details: `converged branch '${base}' e2e is red — ${e2eHealth.detail}`,
          restarting: false,
        };
      }
      if (e2eHealth && !e2eHealth.ok && remedyFiles.length > 0) {
        // The escape leaves the same kind of trail the refusal does, so a
        // landing that went INTO a red branch is never invisible afterwards.
        recordLandingEvent(store, projectId, 'e2e-land-remedy', {
          detail: e2eHealth.detail,
          files: remedyFiles,
        });
      }

      let spec = parseGateSpec(project.gate_config);
      if (spec !== null && gateSpecNeedsRefresh(spec)) {
        const detected = detectGateFor(project.root_path);
        if (detected !== null) {
          spec = mergeDetectedCiExtras(spec, detected);
          // Persist so the LANDING preview, the out-of-band check and the
          // next landing all see the same command list — best-effort, the
          // landing in hand runs the refreshed spec regardless.
          try {
            store.db
              .prepare('UPDATE projects SET gate_config = ?, updated_at = ? WHERE id = ?')
              .run(JSON.stringify(spec), Date.now(), projectId);
          } catch {
            /* the refreshed spec still gates this landing */
          }
        }
      }
      const gate = new GateRunner({
        cwd: project.root_path,
        // PARITY GATE (board web-mtqtec7m-dhxd9h): a LANDING EXECUTE is the
        // landing/convergence call site, so it opts into the CI-only extras
        // (`ciExtras`) — the same set CI runs on push, run here before the
        // push happens instead of after.
        commands: spec ? gateCommands(spec, { includeCiExtras: true }) : [],
        ...(onGateProgress
          ? { onProgress: (event: GateProgressEvent) => onGateProgress(projectId, event) }
          : {}),
      });
      const landed = await executeLanding(gate, vcs, base);
      // Gap C (INSTRUCTIONS 2026-09-18): the stale-build note becomes part of
      // the details HERE, before the `landed` audit row below is written, so
      // the row and the reply the caller sees never disagree about the text.
      const result = { ...landed, details: landed.details + staleCodeNote(staleCode()) };
      /** The push leg's own outcome — see the block below. `undefined`
       *  when the land never got as far as merging. */
      let push: LandingPushResult | undefined;
      if (result.ok) {
        // THE PUSH LEG (FAILURE-DOCTRINE row 8, closed 2026-09-09). Until
        // now this ritual merged into `base` LOCALLY and stopped: an
        // operator clicked "Execute landing → main", watched the full gate
        // pass, saw a green land — and GitHub knew nothing. The hook
        // immediately below is literally named for a push that never
        // happened, which is how long this sat unnoticed.
        //
        // Deliberately NON-FATAL: the merge already succeeded and nothing
        // undoes it, so a failed push must not report the land as failed.
        // It gets its own row in the result instead — row 8's own
        // prescription, "push result surfaced as its own landing row" —
        // because a silent push failure is exactly what left GitHub a day
        // stale. A non-fast-forward is named separately since it has a
        // specific remedy the generic failure text cannot offer.
        //
        // Runs BEFORE the audit row below is written (board web-mufftwd7-b2yuml,
        // 2026-09-24): `readRecentLandingOutcome` rebuilds a landing's result
        // from that SAME row after this process restarts — the exact moment a
        // self-hosted green land triggers — so an audit row written before the
        // push even attempted could never carry a GH013 rejection through a
        // restart. The operator's reconnecting page would see a plain green
        // "landed" while GitHub sat behind, unaware.
        try {
          if (await vcs.hasRemote()) {
            const pushed = await vcs.pushBranch(base);
            push = pushed.ok
              ? { ok: true, detail: `pushed ${base} to origin` }
              : {
                  ok: false,
                  detail: pushed.nonFastForward
                    ? `${base} is behind origin — someone pushed first. Integrate, then land again.`
                    : `push failed: ${pushed.detail}`,
                };
          } else {
            push = { ok: true, detail: 'no remote configured — nothing to push' };
          }
        } catch (error) {
          push = {
            ok: false,
            detail: `push failed: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
        // Notifications channel flight-landed event (board web-msnsndlk-exw3t9):
        // persist one `landed` events row per green gate-then-merge, same
        // events-are-the-audit-trail contract as 'guard-denial' in fly.ts —
        // this is the ONE code path both the manual EXECUTE button and the
        // automatic land-watchdog go through, so a single write here covers
        // both triggers. Best-effort — never fail a real land over telemetry.
        // Carries `push` so the durable record ({@link readRecentLandingOutcome})
        // can answer "did it reach GitHub?" even after this process is gone.
        try {
          store.db
            .prepare(
              'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, NULL, ?, ?, ?)',
            )
            .run(
              projectId,
              'landed',
              JSON.stringify({ details: result.details, push }),
              Date.now(),
            );
        } catch {
          /* landed telemetry is best-effort — never fail the land over it */
        }
        // POST-PUSH VERDICT RITUAL slice 3: fire-and-forget, never awaited —
        // a hung or slow watch must never make EXECUTE itself hang. `head()`
        // reads the just-landed base branch's new tip, the commit whichever
        // CI run this watch observes actually describes.
        try {
          postPushWatch?.(projectId, project.root_path, base, await vcs.head());
        } catch {
          /* best-effort — see postPushWatch's own doc above */
        }
      }
      const restarting =
        result.ok && !!selfRestart && samePath(project.root_path, selfRestart.root);
      if (restarting) selfRestart?.trigger();
      return {
        ...result,
        restarting,
        ...(push ? { push } : {}),
      };
    } finally {
      store.close();
    }
  };
}

/**
 * Builds the real {@link OutOfBandLandGateCheck}: on a flight-running
 * refusal, runs the SAME gate `spec ? gateCommands(spec, { includeCiExtras:
 * true }) : []` produces — but against a disposable DETACHED worktree of the
 * project's current HEAD (`addDetachedWorktree`) instead of the live
 * checkout `land()` itself uses.
 * A detached checkout never contends for git's one-checkout-per-branch slot,
 * so this runs safely alongside the flight that already has that same
 * commit's branch checked out live.
 *
 * No gate commands configured ⇒ no worktree is even created — nothing to
 * verify. Persists a `land-gate-alarm` events row ONLY on a red gate, the
 * same alarm-only-on-trouble convention as fly.ts's `guard-denial`: a green
 * out-of-band check is silently reassuring, not news worth a row. Every
 * failure mode here (worktree add/remove, the gate itself throwing, the
 * event insert) is swallowed — this is a best-effort early warning, never a
 * reason to disturb the flight it's checking up on.
 */
export function createOutOfBandLandGateCheck(dbPath: string): OutOfBandLandGateCheck {
  return (projectId, rootPath, gateConfig) => {
    const spec = parseGateSpec(gateConfig);
    // Same PARITY GATE opt-in as the real EXECUTE path above — this check
    // exists to warn BEFORE a landing whether the converged branch would
    // pass, so it must gate on the identical command set EXECUTE itself uses.
    const commands = spec ? gateCommands(spec, { includeCiExtras: true }) : [];
    if (commands.length === 0) return;

    void (async () => {
      let worktreePath: string | undefined;
      try {
        worktreePath = mkdtempSync(join(tmpdir(), 'autopilot-land-gate-'));
        const added = await addDetachedWorktree(rootPath, worktreePath, 'HEAD');
        if (!added.ok) return;

        const gate = new GateRunner({ cwd: added.path, commands });
        const result = await gate.run();
        if (result.ok) return;

        const store = openStore(dbPath);
        try {
          store.db
            .prepare(
              'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, NULL, ?, ?, ?)',
            )
            .run(
              projectId,
              'land-gate-alarm',
              JSON.stringify({ details: result.details }),
              Date.now(),
            );
        } finally {
          store.close();
        }
      } catch {
        /* best-effort out-of-band check — never surface a failure here */
      } finally {
        if (worktreePath) {
          try {
            await removeWorktree(rootPath, worktreePath);
          } catch {
            /* cleanup is best-effort too — a leftover scratch worktree is harmless */
          }
        }
      }
    })();
  };
}
