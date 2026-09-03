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

/** Map a flat `GateSpec` (fly.ts's own detected gate, or the `gate_config`
 *  column's parsed JSON) into a runnable command list, in gate order. */
export function gateCommands(spec: GateSpec): GateShellCommand[] {
  const kinds: (keyof GateSpec)[] = ['typecheck', 'lint', 'format', 'test', 'build'];
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
  return commands;
}
