// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * A GatePort that rebuilds its command list on every `run()` instead of once
 * at construction. `GateRunner` freezes `commands` in its constructor, which
 * is wrong for a caller whose command list depends on which firing is about
 * to run (e.g. `flight/gate-schedule.ts`'s every-Nth-firing full-suite
 * backstop) — a gate built once before a multi-firing flight's loop starts
 * can never re-evaluate that schedule for firing 2, 3, ... N. `DynamicGate`
 * defers command selection to run time by taking a factory instead of a
 * fixed array, then delegates to a fresh `GateRunner` per call.
 */

import type { GatePort, GateResult } from '../ports.js';
import { GateRunner, type GateCommandSpec, type GateExec } from './gate.js';

export interface DynamicGateOptions {
  readonly cwd: string;
  /** Re-invoked on every run() — the seam a per-firing schedule needs. */
  readonly commands: () => readonly GateCommandSpec[];
  readonly timeoutMs?: number;
  /** Test seam: forwarded to the fresh GateRunner built for each run(). */
  readonly exec?: GateExec;
}

export class DynamicGate implements GatePort {
  constructor(private readonly opts: DynamicGateOptions) {}

  run(): Promise<GateResult> {
    return new GateRunner({
      cwd: this.opts.cwd,
      commands: this.opts.commands(),
      ...(this.opts.timeoutMs !== undefined ? { timeoutMs: this.opts.timeoutMs } : {}),
      ...(this.opts.exec !== undefined ? { exec: this.opts.exec } : {}),
    }).run();
  }
}
