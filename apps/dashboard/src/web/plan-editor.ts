// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE FLIGHT PLAN EDITOR's pure half (epic 0021 slice 3, second cut) —
 * spliced by `.toString()` into `features/pipeline.ts`'s client, the same
 * way `pipeline-panel.ts`'s camera math is. Plain functions over plain
 * objects so the browser and the unit tests run the very same code: the
 * stored `GateSpec` (`gate_config`) becomes an ordered chain of steps for the
 * canvas, and the chain becomes a spec again for the draft and the publish.
 *
 * No class syntax, no destructuring, no template literals: the text is
 * pasted into a concatenated client that must stay one plain script.
 */

/** One editable node of the chain. `command` is the shell-less "bin args…"
 *  line the operator types; it is split on whitespace, never run through a
 *  shell (the gate uses execFile). */
export interface PlanStep {
  readonly kind: string;
  readonly enabled: boolean;
  readonly command: string;
  readonly label: string;
}

/** The chain's fixed order — the gate runs kinds in this order (see
 *  `gate-commands.ts`), so the canvas draws them in it and never lets the
 *  operator reorder what the engine would not honour. */
export function planStepKinds(): string[] {
  return ['typecheck', 'lint', 'format', 'test', 'build'];
}

/** The step a key moves the chain's selection to — the WAI-ARIA tabs
 *  pattern's keys (epic 0024): Left/Right one step, wrapping at the ends,
 *  Home/End to the ends. A right-to-left page draws the chain mirrored, so
 *  its arrows swap. Null for any other key or a step the chain lacks. */
export function planStepMove(
  kinds: readonly string[],
  current: string,
  key: string,
  rtl: boolean,
): string | null {
  const i = kinds.indexOf(current);
  if (i < 0) return null;
  const last = kinds.length - 1;
  if (key === 'Home') return kinds[0]!;
  if (key === 'End') return kinds[last]!;
  if (key === (rtl ? 'ArrowLeft' : 'ArrowRight')) return kinds[i === last ? 0 : i + 1]!;
  if (key === (rtl ? 'ArrowRight' : 'ArrowLeft')) return kinds[i === 0 ? last : i - 1]!;
  return null;
}

export function planApiUrl(projectId: string): string {
  return '/api/plan?project=' + encodeURIComponent(projectId);
}

/** Where a project's unpublished draft lives between visits. */
export function planDraftKey(projectId: string): string {
  return 'ap-plan-draft:' + projectId;
}

export function parseCommandLine(text: string): { bin: string; args: string[] } {
  const parts = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(function (p) {
      return p.length > 0;
    });
  return { bin: parts.length > 0 ? parts[0]! : '', args: parts.slice(1) };
}

export function planStepsFromSpec(spec: unknown): PlanStep[] {
  const s = (spec && typeof spec === 'object' ? spec : {}) as Record<string, unknown>;
  return planStepKinds().map(function (kind) {
    const c = s[kind] as { bin?: unknown; args?: unknown; label?: unknown } | undefined;
    const enabled = !!(c && typeof c.bin === 'string' && c.bin.length > 0);
    const args = enabled && Array.isArray(c!.args) ? (c!.args as unknown[]).map(String) : [];
    const command = enabled ? [String(c!.bin)].concat(args).join(' ') : '';
    const label =
      enabled && typeof c!.label === 'string' && c!.label.length > 0 ? c!.label : command;
    return { kind: kind, enabled: enabled, command: command, label: label };
  });
}

/** One command's verdict from the last recorded gate run (`GET /api/plan`'s
 *  `gate.checks`). The gate records every command under its label;
 *  `durationMs` is null when the record carries no usable number. */
export interface PlanGateCheck {
  readonly label: string;
  readonly pass: boolean;
  readonly durationMs: number | null;
}

/** The last gate run's outcome for `step`, or null when the step is off or
 *  no check carries its label. Given the `published` step of the same kind,
 *  a draft whose command or label differs from it has not run yet, and says
 *  so. A remediated gate re-runs from scratch and records a label twice (the
 *  fail, then the re-run), so the LAST match is the run's verdict. */
export function planStepOutcome(
  step: PlanStep,
  checks: readonly PlanGateCheck[],
  published?: PlanStep | null,
): PlanGateCheck | null {
  if (!step.enabled) return null;
  if (
    published &&
    (!published.enabled || published.command !== step.command || published.label !== step.label)
  ) {
    return null;
  }
  const list = checks || [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i] && list[i]!.label === step.label) return list[i]!;
  }
  return null;
}

/** The whole run at a glance: how many distinct commands it ran, how many
 *  passed, and which failed (first-seen order) — each judged by its final
 *  verdict, for the same re-run reason as {@link planStepOutcome}. */
export function gateRunTally(checks: readonly PlanGateCheck[]): {
  total: number;
  passed: number;
  failed: string[];
} {
  const order: string[] = [];
  const verdict: Record<string, boolean> = Object.create(null) as Record<string, boolean>;
  (checks || []).forEach(function (check) {
    if (!check || typeof check.label !== 'string') return;
    if (!Object.prototype.hasOwnProperty.call(verdict, check.label)) order.push(check.label);
    verdict[check.label] = !!check.pass;
  });
  const failed = order.filter(function (label) {
    return !verdict[label];
  });
  return { total: order.length, passed: order.length - failed.length, failed: failed };
}

/** The chain back into a spec: every non-step field of `base` (ecosystem,
 *  ciExtras, testImpacted) is kept as it was; an enabled step with a
 *  command becomes its `{bin, args, label}`; a disabled or empty one is
 *  dropped. */
export function planSpecFromSteps(
  steps: readonly PlanStep[],
  base: unknown,
): Record<string, unknown> {
  const b = (base && typeof base === 'object' ? base : {}) as Record<string, unknown>;
  const kinds = planStepKinds();
  const out: Record<string, unknown> = {};
  Object.keys(b).forEach(function (key) {
    if (kinds.indexOf(key) < 0) out[key] = b[key];
  });
  steps.forEach(function (step) {
    if (!step.enabled) return;
    const parsed = parseCommandLine(step.command);
    if (parsed.bin.length === 0) return;
    const label = String(step.label || '').trim();
    out[step.kind] = {
      bin: parsed.bin,
      args: parsed.args,
      label: label.length > 0 ? label : [parsed.bin].concat(parsed.args).join(' '),
    };
  });
  return out;
}
