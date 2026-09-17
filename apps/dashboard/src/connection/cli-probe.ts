// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Probe the local Claude Code CLI for presence + version (`claude --version`).
 * A cheap check that never spends model quota. Exec is injectable so the parse +
 * shape are deterministically testable.
 */

import { execFile } from 'node:child_process';

export interface CliRun {
  readonly code: number;
  readonly stdout: string;
  /** Optional: absent from callers that never populate it (most existing
   *  `CliExec` test doubles). `makeCliExec`'s real implementation always
   *  fills it — added for `pr-review.ts`'s conflicting-path parse, which
   *  reads `git apply --check`'s failure detail off stderr, never stdout. */
  readonly stderr?: string;
}

export type CliExec = (bin: string, args: readonly string[]) => Promise<CliRun>;

export interface CliProbe {
  readonly present: boolean;
  readonly version: string | null;
}

/** Extract an `x.y.z` version from `--version` output, else the trimmed text, else null.
 *
 *  The `(?<!\d)` is load-bearing (CodeQL js/polynomial-redos, 2026-09-16).
 *  Without it, a long run of digits gave the engine a fresh start position at
 *  every digit — each one re-consuming the rest of the run before failing —
 *  so the scan cost grew with the square of the run's length. Refusing to
 *  start mid-number makes every interior position fail on its first
 *  character. A word boundary would have been wrong here: `\b` after the `v`
 *  in `v1.2.3` fails, and that is the commonest shape `--version` prints. */
export function parseCliVersion(stdout: string): string | null {
  const match = stdout.match(/(?<!\d)\d+\.\d+\.\d+/);
  if (match) return match[0];
  const trimmed = stdout.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function probeClaudeCli(exec: CliExec, binary = 'claude'): Promise<CliProbe> {
  try {
    const { code, stdout } = await exec(binary, ['--version']);
    if (code !== 0) return { present: false, version: null };
    return { present: true, version: parseCliVersion(stdout) };
  } catch {
    return { present: false, version: null };
  }
}

/**
 * Build a real exec via `execFile` (no shell). Never rejects — a spawn failure ⇒
 * code 1. `env` lets the auth-probe run under a specific credential environment.
 */
export function makeCliExec(env?: NodeJS.ProcessEnv, timeoutMs = 15_000): CliExec {
  return (bin, args) =>
    new Promise((resolve) => {
      execFile(
        bin,
        [...args],
        { windowsHide: true, timeout: timeoutMs, env, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const code =
            err && typeof (err as { code?: unknown }).code === 'number'
              ? (err as { code: number }).code
              : err
                ? 1
                : 0;
          // Stryker disable next-line LogicalOperator, StringLiteral: Node's execFile
          // callback always hands stdout AND stderr over as strings unless an
          // encoding of 'buffer' is asked for, which this probe never does — both
          // `?? ''` fallbacks are unreachable defensive typing, not live behaviour
          // (the same reasoning adapters/git.ts's git() records for its stdout).
          resolve({ code, stdout: stdout ?? '', stderr: stderr ?? '' });
        },
      );
    });
}

/** Default exec for the cheap `--version` presence probe. */
export const realCliExec: CliExec = makeCliExec();
