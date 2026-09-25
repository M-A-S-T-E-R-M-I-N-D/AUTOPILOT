// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Map a project's flat `GateSpec` into a runnable command list — the ONE
 * source `fly.ts` (a live flight) and `landing/execute.ts` (a LANDING
 * EXECUTE) both gate through, so the two paths can no longer drift apart
 * (epic 0002 "shell decomposition", slice 1: hand-sync duplication moved to
 * a real shared module). A flight and a landing execute must gate
 * identically, including which steps run concurrently.
 */

import type { GateCommand, GateSpec } from '@autopilot/onboarding';

export interface GateShellCommand {
  readonly bin: string;
  readonly args: string[];
  readonly label: string;
  readonly parallel?: boolean;
}

// typecheck/lint/format each read the source tree independently and don't
// depend on one another's output — safe to run concurrently. test/build stay
// sequential (build wants a green typecheck; both are heavier/order-sensitive).
export const PARALLEL_GATE_KINDS: ReadonlySet<keyof GateSpec> = new Set([
  'typecheck',
  'lint',
  'format',
]);

export interface GateCommandsOptions {
  /** Append `spec.ciExtras` (every detected `ci:*` script — bundle-size
   *  budget, launcher smokes, generated-doc census suites, …) after the core
   *  kinds. Landing/convergence call sites opt in to all of them (board
   *  web-mtqtec7m-dhxd9h "pre-push PARITY GATE"); the per-firing gate opts in
   *  to the fast ones through {@link perFiringGateCommands} (2026-09-25).
   *  Defaults to `false`. */
  readonly includeCiExtras?: boolean;
  /** Leave out the `ciExtras` entries this names (by label) — see
   *  {@link perFiringGateCommands}. */
  readonly skipCiExtra?: (label: string) => boolean;
}

/** Map a flat `GateSpec` (fly.ts's own detected gate, or the `gate_config`
 *  column's parsed JSON) into a runnable command list, in gate order. */
export function gateCommands(
  spec: GateSpec,
  options: GateCommandsOptions = {},
): GateShellCommand[] {
  // `install` first and alone: every other leg judges the tree AGAINST its
  // node_modules, so the sync must be done before any of them start.
  const kinds: (keyof GateSpec)[] = ['install', 'typecheck', 'lint', 'format', 'test', 'build'];
  const commands: GateShellCommand[] = [];
  for (const kind of kinds) {
    const command = spec[kind] as GateCommand | undefined;
    if (command?.bin) {
      commands.push({
        bin: command.bin,
        args: [...command.args],
        label: command.label,
        ...(PARALLEL_GATE_KINDS.has(kind) ? { parallel: true } : {}),
      });
    }
  }
  if (options.includeCiExtras) {
    // Stryker disable next-line ArrayDeclaration: equivalent by construction —
    // the loop admits an entry only through `if (extra.bin)` below, so whatever
    // a mutated default holds, a non-entry has no bin and never becomes a
    // command. The empty default is the honest reading of "no extras".
    for (const extra of spec.ciExtras ?? []) {
      if (extra.bin && !options.skipCiExtra?.(extra.label)) {
        commands.push({ bin: extra.bin, args: [...extra.args], label: extra.label });
      }
    }
  }
  return commands;
}

/** `ci:*` scripts too slow for every firing: they stay at the convergence
 *  and landing gates. Measured 2026-09-25 on the fleet's disk, idle: the
 *  packaging smoke test 18s; every other check at most 6s, 28s together. */
export const SLOW_CI_EXTRAS: readonly string[] = ['ci:npx-smoke-test'];

/**
 * THE PER-FIRING GATE RUNS THE FAST CI CHECKS (2026-09-25). It used to run
 * none of them, to keep firing cadence, so a commit that failed one — a
 * debrief citing unreachable commits, a drive letter in a test, a scan that
 * read stdin — reached the flight branch and turned the convergence gate
 * red, or first failed at the landing twenty minutes into its gate. Every
 * `ci:*` check but the slow ones now runs where the commit is made.
 */
export function perFiringGateCommands(spec: GateSpec): GateShellCommand[] {
  return gateCommands(spec, {
    includeCiExtras: true,
    skipCiExtra: (label) => SLOW_CI_EXTRAS.some((script) => label.endsWith(script)),
  });
}
