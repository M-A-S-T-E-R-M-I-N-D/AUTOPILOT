// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Social Flight's weave-in pass (epic 0016 "The GitHub Social Flight",
 * slice 3/6 — board web-mtpzzx7v-72q2dv): the I/O half of what
 * `social-flight-trigger.ts` decides purely. `fly.ts` calls
 * {@link runSocialFlightPass} at all three phases — start (takeoff),
 * interval (from the engine loop's per-firing hook, between firings only:
 * `isBetweenFirings` keeps it off the last planned firing, where the end
 * pass speaks) and end (with the end-of-flight sweeps); the fly-bar toggle
 * is a follow-up slice. Everything the epic's own slice wording asks of the
 * weave-in is decided here, in this order:
 *
 *   1. the toggle — `AUTOPILOT_SOCIAL_FLIGHT=off|start|end|full`, parsed
 *      fail-closed by {@link parseSocialFlightToggle} and gated per phase by
 *      {@link shouldRunSocialFlight}; an unset var never reaches GitHub at
 *      all, not even for a read;
 *   2. the self-target guard — `ghExec` runs in the engine's own checkout,
 *      so a flight over someone else's folder would inventory (and, once a
 *      candidate source exists, speak on) THIS repository; the same guard
 *      `post-flight-sweeps.ts`'s `runStaleClaimSweep` carries (operator,
 *      2026-09-14: no cross-project leaks);
 *   3. "refuses cleanly when gh is not connected" — {@link
 *      resolveSocialIdentity} comes back `undefined` whenever `gh api user`
 *      or `gh repo view` cannot answer (no `gh`, not authenticated, not a
 *      GitHub repo), and a social pass must never guess at its own identity
 *      or verb set, so the pass says why in the flight log and stops before
 *      a single inventory read;
 *   4. the pass itself — the read-only inventories ({@link
 *      fetchOwnSubmissions}, {@link fetchOpenThreads}) and the protocol
 *      engine ({@link planSocialProtocol}) over the candidates this call was
 *      handed — the resolved login handed along, so a question asked of
 *      some other human is refused rather than answered in their place
 *      (epic law 5's second half) — with the caps printed in the flight log
 *      (epic law 4, "caps visible in the flight log").
 *
 * READ-ONLY BY CONSTRUCTION in this slice: no caller supplies candidates yet
 * (deriving them from mirror-pass findings is its own slice), so
 * `candidates` defaults to none, the verdict is empty, and nothing here ever
 * calls `executeSocialCommands` — the execute half is wired in only once a
 * candidate source exists, the same pure-planner-first order every
 * `social-pass.ts` law shipped in. Best-effort like every other sweep
 * `fly.ts` runs: a `gh` hiccup is reported as a skip, never thrown, so the
 * social pass can never fail the flight it is woven into.
 */

import { existsSync } from 'node:fs';
import { openStore, type Store } from '@autopilot/store';
import { SqliteProjectStore } from '@autopilot/onboarding';
import type { CliExec } from '../connection/cli-probe.js';
import { resolveDbPath } from '../read/config.js';
import { ghExec } from './gh-exec.js';
import { out } from './firing-hooks.js';
import {
  parseSocialFlightToggle,
  shouldRunSocialFlight,
  type SocialFlightPhase,
  type SocialFlightToggle,
} from './social-flight-trigger.js';
import {
  fetchOpenThreads,
  fetchOwnSubmissions,
  planSocialProtocol,
  resolveSocialIdentity,
  type SocialCandidateAction,
  type SocialIdentity,
  type SocialProtocolCaps,
  type SocialProtocolVerdict,
} from './social-pass.js';
import { createMirrorPassPreviewApi } from './mirror-pass-execute.js';
import type { MirrorPassPlan } from './mirror-pass.js';

/** Per-pass caps for the woven-in pass (epic law 4, "budgeted voice"):
 *  deliberately tight for a pass nobody is watching live — one new issue
 *  and three comments per pass — and printed in the flight log every time
 *  the pass runs, so an operator can see the budget rather than trust it.
 *  {@link planSocialProtocol} queues (never drops) whatever exceeds them. */
export const SOCIAL_FLIGHT_PASS_CAPS: SocialProtocolCaps = { maxNewIssues: 1, maxComments: 3 };

/** Why a pass did not run. `'toggle-off'`: the env var is unset or not one
 *  of the four values (the fail-closed default). `'phase-not-enabled'`: the
 *  toggle is on, but not for this phase (`start` at the flight's end, `end`
 *  at its start). `'foreign-target'`: the flight flies a folder that is not
 *  this engine checkout. `'gh-disconnected'`: `gh` could not resolve an
 *  identity (absent, unauthenticated, not a GitHub repo), or the read
 *  itself threw. */
export type SocialFlightSkipReason =
  'toggle-off' | 'phase-not-enabled' | 'foreign-target' | 'gh-disconnected';

export interface SocialFlightPassSkipped {
  readonly ran: false;
  readonly phase: SocialFlightPhase;
  readonly toggle: SocialFlightToggle;
  readonly reason: SocialFlightSkipReason;
}

export interface SocialFlightPassRan {
  readonly ran: true;
  readonly phase: SocialFlightPhase;
  readonly toggle: SocialFlightToggle;
  readonly identity: SocialIdentity;
  readonly ownSubmissions: number;
  readonly openThreads: number;
  readonly caps: SocialProtocolCaps;
  readonly verdict: SocialProtocolVerdict;
}

export type SocialFlightPassOutcome = SocialFlightPassSkipped | SocialFlightPassRan;

export interface SocialFlightPassOptions {
  /** Defaults to the fleet's one guarded `gh` exec; tests inject a double. */
  readonly exec?: CliExec;
  /** The flown folder. When given and not `engineRepo`, the pass refuses:
   *  it would speak for THIS repository, not the flown one. */
  readonly target?: string;
  /** This engine checkout; defaults to `process.cwd()` like every sibling
   *  sweep's self-target guard. */
  readonly engineRepo?: string;
  /** Candidate actions for the protocol engine — none today (see the module
   *  doc); a later slice derives them from mirror-pass findings. */
  readonly candidates?: readonly SocialCandidateAction[];
  readonly caps?: SocialProtocolCaps;
  /** The dashboard store path the standalone Fly GitHub flight reads its
   *  mirror-pass preview from ({@link runGithubOnlyMirrorPreview}); defaults
   *  to {@link resolveDbPath}'s own env + cwd resolution. Tests inject a
   *  fixture store path. */
  readonly dbPath?: string;
}

function capsText(caps: SocialProtocolCaps): string {
  return `caps ≤${caps.maxNewIssues} new issue(s), ≤${caps.maxComments} comment(s)`;
}

function verdictText(candidates: number, verdict: SocialProtocolVerdict): string {
  return (
    `${candidates} candidate(s): ${verdict.allowed.length} allowed, ` +
    `${verdict.queued.length} queued, ${verdict.duplicate.length} duplicate, ` +
    `${verdict.refused.length} refused`
  );
}

/**
 * Runs one woven-in social pass for `phase` under the raw
 * `AUTOPILOT_SOCIAL_FLIGHT` value (passed in, never read from `process.env`
 * here, so callers and tests control it without env mutation). Never
 * throws: every reason not to run is returned as a `ran: false` outcome,
 * and the ones an operator who turned the toggle ON would want explained
 * (a foreign target, a disconnected `gh`) are also said in the flight log.
 * A silent `'toggle-off'` or `'phase-not-enabled'` is the expected case,
 * not a surprise, so those print nothing.
 */
export async function runSocialFlightPass(
  phase: SocialFlightPhase,
  rawToggle: string | undefined,
  options: SocialFlightPassOptions = {},
): Promise<SocialFlightPassOutcome> {
  const toggle = parseSocialFlightToggle(rawToggle);
  const skipped = (reason: SocialFlightSkipReason): SocialFlightPassSkipped => ({
    ran: false,
    phase,
    toggle,
    reason,
  });
  if (toggle === 'off') return skipped('toggle-off');
  if (!shouldRunSocialFlight(toggle, phase)) return skipped('phase-not-enabled');

  const engineRepo = options.engineRepo ?? process.cwd();
  if (options.target !== undefined && options.target !== engineRepo) {
    out(
      `  🗣 social pass (${phase}) skipped: the flown folder is not this engine checkout — ` +
        `the pass would speak for THIS repository, never the flown one.`,
    );
    return skipped('foreign-target');
  }

  const exec = options.exec ?? ghExec;
  const candidates = options.candidates ?? [];
  const caps = options.caps ?? SOCIAL_FLIGHT_PASS_CAPS;
  try {
    const identity = await resolveSocialIdentity(exec);
    if (identity === undefined) {
      out(
        `  🗣 social pass (${phase}) skipped: gh is not connected or not authenticated for this ` +
          `repo — identity unresolved, so the pass has no voice to speak with. Connect gh to weave it in.`,
      );
      return skipped('gh-disconnected');
    }
    const [ownSubmissions, openThreads] = await Promise.all([
      fetchOwnSubmissions(exec, identity.login),
      fetchOpenThreads(exec),
    ]);
    // The resolved login rides along so the engine can tell a question asked
    // of THIS identity from one asked of someone else (law 5's second half).
    const verdict = planSocialProtocol(
      candidates,
      caps,
      ownSubmissions,
      identity.role,
      openThreads,
      identity.login,
    );
    out(
      `  🗣 social pass (${phase}) as @${identity.login} [${identity.role}] on ` +
        `${identity.nameWithOwner} — ${ownSubmissions.length} own submission(s), ` +
        `${openThreads.length} open thread(s); ${capsText(caps)}; ` +
        `${verdictText(candidates.length, verdict)} (read-only pass — nothing posted).`,
    );
    return {
      ran: true,
      phase,
      toggle,
      identity,
      ownSubmissions: ownSubmissions.length,
      openThreads: openThreads.length,
      caps,
      verdict,
    };
  } catch {
    out(
      `  🗣 social pass (${phase}) skipped: the gh identity read failed — treating gh as ` +
        `disconnected (best-effort, non-fatal).`,
    );
    return skipped('gh-disconnected');
  }
}

/** Why {@link runGithubOnlyMirrorPreview} printed nothing this flight — all
 *  best-effort, never a reason to fail the flight. `'no-store'`: the
 *  dashboard store does not exist at the resolved path at all.
 *  `'project-unknown'`: the store exists but never onboarded this folder, so
 *  it has no board to reconcile. `'preview-error'`: the store or `gh` read
 *  itself threw. */
export type MirrorPreviewSkipReason = 'no-store' | 'project-unknown' | 'preview-error';

export interface MirrorPreviewSkipped {
  readonly ran: false;
  readonly reason: MirrorPreviewSkipReason;
}

/** How many of the project's `github-<n>` board tasks {@link
 *  createMirrorPassPreviewApi}'s reconcile derivation would act on — never
 *  applied here, only counted, so the standalone flight's own log line can
 *  say what the dashboard's mirror-pass button would do without doing it. */
export interface MirrorPreviewRan {
  readonly ran: true;
  readonly checked: number;
  readonly toClose: number;
  readonly toReopen: number;
  readonly toNote: number;
  readonly toSettle: number;
  readonly inSync: number;
}

export type MirrorPreviewOutcome = MirrorPreviewSkipped | MirrorPreviewRan;

/** What {@link runGithubOnlyFlight} flew: its one social pass, plus the
 *  mirror preview's outcome whenever that pass ran — absent when the pass
 *  refused, since the preview never runs then. */
export type GithubOnlyFlightOutcome = SocialFlightPassOutcome & {
  readonly mirror?: MirrorPreviewOutcome;
};

function summarizeMirrorPlans(plans: readonly MirrorPassPlan[]): MirrorPreviewRan {
  let toClose = 0;
  let toReopen = 0;
  let toNote = 0;
  let toSettle = 0;
  let inSync = 0;
  for (const plan of plans) {
    switch (plan.finding?.action) {
      case 'close-with-landing-note':
      case 'close-by-assignee':
        toClose++;
        break;
      case 'reopen-honestly':
        toReopen++;
        break;
      case 'note-unverified':
        toNote++;
        break;
      case 'settle-claimed':
        toSettle++;
        break;
      default:
        inSync++;
    }
  }
  return { ran: true, checked: plans.length, toClose, toReopen, toNote, toSettle, inSync };
}

function mirrorPreviewText(summary: MirrorPreviewRan): string {
  return (
    `${summary.checked} github-linked board task(s) checked — ${summary.toClose} to close, ` +
    `${summary.toReopen} to reopen, ${summary.toNote} unverified note(s), ` +
    `${summary.toSettle} to settle, ${summary.inSync} already in sync ` +
    `(read-only — apply from the dashboard's mirror-pass button).`
  );
}

/**
 * The standalone Fly GitHub flight's mirror-pass half (epic 0016 slice 4/6,
 * "still open: the mirror pass beside the social pass — this mode runs the
 * social pass alone today"). A read-only preview of `mirror-pass.ts`'s
 * reconcile derivation (board task done ⇄ linked issue state actually
 * closed) over the flown project's own board, printed in the flight log
 * beside the social pass's own line — never mutates anything, the same
 * read-only-first posture the social pass itself still has until its own
 * execute half is wired. Composes `mirror-pass-execute.ts`'s
 * {@link createMirrorPassPreviewApi} exactly as the dashboard's own preview
 * route does, so this is the same plan an operator would see there, not a
 * second implementation of it. Best-effort like every other sweep woven into
 * this flight: no store at `dbPath`, a folder never onboarded as a project,
 * or a read failure all skip quietly rather than failing the flight.
 */
export async function runGithubOnlyMirrorPreview(
  dbPath: string,
  target: string,
  exec: CliExec = ghExec,
): Promise<MirrorPreviewOutcome> {
  if (!existsSync(dbPath)) return { ran: false, reason: 'no-store' };
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    const project = new SqliteProjectStore(store).findByRoot(target);
    if (!project) return { ran: false, reason: 'project-unknown' };
    const plans = await createMirrorPassPreviewApi(dbPath, exec)(project.id);
    if (!plans) return { ran: false, reason: 'project-unknown' };
    const summary = summarizeMirrorPlans(plans);
    out(`  🪞 mirror pass: ${mirrorPreviewText(summary)}`);
    return summary;
  } catch {
    return { ran: false, reason: 'preview-error' };
  } finally {
    store?.close();
  }
}

/**
 * The standalone "Fly GitHub" flight (epic 0016 slice 4/6): what `fly.ts`
 * runs INSTEAD of a code flight when `AUTOPILOT_FLY_TARGET=github` — the
 * social pass, now joined by the mirror pass's own read-only preview (board
 * `web-mtpzzxn4-69csqx`), "social+mirror passes only". Choosing the GitHub
 * target is itself the operator's opt-in, so `AUTOPILOT_SOCIAL_FLIGHT` is
 * never consulted: the social pass runs as `'full'`, the whole social
 * flight, and with no firings to be between, that is exactly one takeoff
 * (`'start'`) pass. The mirror preview only runs once the social pass
 * actually ran — gh connected, this engine's own checkout — since it needs
 * the same two preconditions and would refuse identically otherwise; its own
 * read/store failures never fail the flight (see
 * {@link runGithubOnlyMirrorPreview}). Every other law still holds — the
 * self-target guard, the clean refusal when gh is not connected, the caps,
 * read-only (nothing posted, nothing applied) until the execute halves are
 * wired. The preview's outcome comes back as `mirror` beside the pass's own,
 * so `fly.ts` folds its counts into the SOCIAL debrief (epic 0016 slice 5/6).
 */
export async function runGithubOnlyFlight(
  options: SocialFlightPassOptions = {},
): Promise<GithubOnlyFlightOutcome> {
  const outcome = await runSocialFlightPass('start', 'full', options);
  if (!outcome.ran) return outcome;
  const target = options.target ?? options.engineRepo ?? process.cwd();
  const mirror = await runGithubOnlyMirrorPreview(
    options.dbPath ?? resolveDbPath(),
    target,
    options.exec ?? ghExec,
  );
  return { ...outcome, mirror };
}
