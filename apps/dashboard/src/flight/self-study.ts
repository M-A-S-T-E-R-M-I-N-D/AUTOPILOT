// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * SELF-STUDY updater (web-msniol02-ho2w5x): decides whether a flight should
 * trigger `docs/SELF-STUDY/PAPER.md`'s automated refresh
 * (`scripts/self-study/generate-data.mjs`) and builds the child-process
 * invocation for it. The actual spawn + file-existence checks stay in
 * `fly.ts` (best-effort — a spawn failure must never fail the flight); this
 * file is pure so the decision and the exact args/env it builds are
 * unit-testable without a real subprocess.
 */

export interface SelfStudyInvocation {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv;
}

/**
 * The "defined update trigger" the board task calls for (JMIR
 * living-synthesis model): a flight that shipped zero firings produced no
 * new evidence, so it must not spawn anything or spam the paper's §8
 * Evidence Log — `null` means "skip". `SELF_STUDY_FLIGHT_FIRINGS`/
 * `SELF_STUDY_FLIGHT_SHIPPED` are how the spawned script tells an automated
 * flight-triggered run apart from a plain `pnpm self-study:update` run by
 * hand (which only refreshes §4, unchanged). `execPath` is threaded in
 * (rather than read from `process.execPath` here) purely so this stays a
 * pure function under test.
 */
/** Minimal git capability the post-flight self-study commit needs. */
export interface SelfStudyVcs {
  isDirty(): Promise<boolean>;
  commitPaths(paths: readonly string[], message: string): Promise<boolean>;
}

/** The ONLY paths the self-study regen writes — the ritual commit is scoped
 *  to them (RITUAL SWEEP fix): the old whole-tree staging here swept ANY
 *  unrelated working-tree state — operator WIP, a supervising agent's
 *  in-progress fix — into a docs(self-study) ritual commit (it happened:
 *  72463b1 carried guard.test.ts). A ritual only ever commits its own output. */
export const SELF_STUDY_PATHS: readonly string[] = ['docs/SELF-STUDY'];

/** The "PAPER commit" post-flight ritual (RING-0 SUPERVISOR, web-msq9hfhd-ebmy8k):
 *  the self-study regen used to leave a dirty tree with nobody owning the
 *  commit, which silently blocked self-landing (`GitVcs.land` refuses on a
 *  dirty working tree — see commit 6e33f20). */
export const SELF_STUDY_COMMIT_MESSAGE = 'docs(self-study): flight-end automated data refresh';

/**
 * Commits the self-study regen's output when (and only when) it actually
 * changed something — a no-op run must not create an empty/pointless commit.
 * Returns whether a commit was made.
 */
export async function commitSelfStudyIfDirty(vcs: SelfStudyVcs): Promise<boolean> {
  if (!(await vcs.isDirty())) return false;
  return vcs.commitPaths(SELF_STUDY_PATHS, SELF_STUDY_COMMIT_MESSAGE);
}

export function selfStudyInvocation(
  execPath: string,
  scriptPath: string,
  env: NodeJS.ProcessEnv,
  flightFirings: number,
  flightShipped: number,
): SelfStudyInvocation | null {
  if (flightFirings <= 0) return null;
  return {
    command: execPath,
    args: [scriptPath],
    env: {
      ...env,
      SELF_STUDY_FLIGHT_FIRINGS: String(flightFirings),
      SELF_STUDY_FLIGHT_SHIPPED: String(Math.max(0, flightShipped)),
    },
  };
}
