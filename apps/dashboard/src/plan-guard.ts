// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE FLIGHT PLAN'S GUARD (epic 0021 slice 3, second cut): what
 * `POST /api/plan/publish` accepts before a project's `gate_config` is
 * rewritten. The stored shape is `JSON.stringify(GateSpec)` (onboarding's
 * detector writes it; `gate-commands.ts` turns it into the commands every
 * landing and firing runs), so a published plan must be exactly that shape
 * — bounded strings, no shell, at least one step — or it is refused with
 * the reason. The gate executes `bin` + `args` through execFile, never a
 * shell, so the validator bounds sizes and shapes; it does not try to judge
 * commands, which are the operator's own on the operator's own machine.
 */
import type { GateCommand, GateSpec } from '@autopilot/onboarding';

export const PLAN_KINDS = ['typecheck', 'lint', 'format', 'test', 'build', 'testImpacted'] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

const MAX_BIN_CHARS = 200;
const MAX_ARG_CHARS = 500;
const MAX_ARGS = 32;
const MAX_LABEL_CHARS = 200;
const MAX_EXTRAS = 16;
const MAX_ECOSYSTEM_CHARS = 40;

export type PlanValidation =
  { readonly ok: true; readonly spec: GateSpec } | { readonly ok: false; readonly error: string };

function commandOf(value: unknown, where: string): GateCommand | string {
  if (typeof value !== 'object' || value === null) return `${where}: not an object`;
  const v = value as { bin?: unknown; args?: unknown; label?: unknown };
  if (typeof v.bin !== 'string' || v.bin.trim().length === 0) return `${where}: bin is required`;
  if (v.bin.length > MAX_BIN_CHARS) return `${where}: bin is too long`;
  if (/[\r\n]/.test(v.bin)) return `${where}: bin must be one line`;
  const args = v.args === undefined ? [] : v.args;
  if (!Array.isArray(args)) return `${where}: args must be a list`;
  if (args.length > MAX_ARGS) return `${where}: too many args`;
  for (const a of args) {
    if (typeof a !== 'string') return `${where}: every arg must be a string`;
    if (a.length > MAX_ARG_CHARS) return `${where}: an arg is too long`;
  }
  const label =
    typeof v.label === 'string' && v.label.trim().length > 0
      ? v.label.trim()
      : [v.bin.trim(), ...(args as string[])].join(' ');
  if (label.length > MAX_LABEL_CHARS) return `${where}: label is too long`;
  return { bin: v.bin.trim(), args: [...(args as string[])], label };
}

/** A publishable `GateSpec` from untrusted JSON, or the one reason it is not. */
export function validateGateSpec(input: unknown): PlanValidation {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'the plan must be an object' };
  }
  const raw = input as Record<string, unknown>;
  const ecosystem =
    typeof raw['ecosystem'] === 'string' && raw['ecosystem'].trim().length > 0
      ? raw['ecosystem'].trim()
      : 'unknown';
  if (ecosystem.length > MAX_ECOSYSTEM_CHARS) return { ok: false, error: 'ecosystem is too long' };
  const out: Record<string, unknown> = { ecosystem };
  let steps = 0;
  for (const kind of PLAN_KINDS) {
    const value = raw[kind];
    if (value === undefined || value === null) continue;
    const command = commandOf(value, kind);
    if (typeof command === 'string') return { ok: false, error: command };
    out[kind] = command;
    steps += 1;
  }
  if (raw['ciExtras'] !== undefined && raw['ciExtras'] !== null) {
    if (!Array.isArray(raw['ciExtras'])) return { ok: false, error: 'ciExtras must be a list' };
    if (raw['ciExtras'].length > MAX_EXTRAS) return { ok: false, error: 'too many ciExtras' };
    const extras: GateCommand[] = [];
    for (let i = 0; i < raw['ciExtras'].length; i++) {
      const command = commandOf(raw['ciExtras'][i], `ciExtras[${i}]`);
      if (typeof command === 'string') return { ok: false, error: command };
      extras.push(command);
    }
    out['ciExtras'] = extras;
  }
  if (steps === 0) return { ok: false, error: 'a plan needs at least one enabled step' };
  return { ok: true, spec: out as unknown as GateSpec };
}
