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
