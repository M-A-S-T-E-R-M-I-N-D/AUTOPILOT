// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { GateCommand } from './types.js';

/** Safe JSON parse → an object (or null). Never throws on untrusted manifest text. */
export function safeJsonParse(text: string | null): Record<string, unknown> | null {
  // Stryker disable next-line ConditionalExpression: exists to narrow `text` to
  // `string` for the compiler. At runtime `JSON.parse(null)` coerces via
  // ToString to "null" and returns the JS value `null` — identical to this
  // early return — so removing the guard changes no observable output.
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    // Stryker disable next-line ConditionalExpression: when `value` is null,
    // the true branch's `(value as Record<string, unknown>)` is a cast, not a
    // conversion — it still evaluates to `null`, the same as the false
    // branch's literal `null`. Dropping `value !== null` changes no output.
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The string-valued `scripts` map from a parsed package.json (empty if absent). */
export function packageScripts(pkg: Record<string, unknown> | null): Record<string, string> {
  const raw = pkg?.['scripts'];
  if (raw === null || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/** Lightweight TOML-section presence check (no TOML dependency) — e.g. `[tool.ruff]`.
 *  Matches the exact section or a nested sub-table (`[tool.pytest.ini_options]`), but
 *  not an unrelated section that merely shares the prefix (`[tool.mypyc]` must NOT
 *  satisfy a `tool.mypy` lookup — a real, distinct tool, not a mypy config marker). */
export function tomlHasSection(text: string | null, section: string): boolean {
  if (text === null) return false;
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\[${escaped}(?:[.\\s]|\\])`);
  return text.split('\n').some((line) => pattern.test(line.trimStart()));
}

// ---- shared command builders (argv arrays, never shell strings) -------------

export type PackageManager = 'pnpm' | 'yarn' | 'npm';

/** Run a package.json script via the detected package manager. */
export function scriptCommand(pm: PackageManager, script: string): GateCommand {
  return pm === 'yarn'
    ? { bin: 'yarn', args: [script], label: `yarn ${script}` }
    : { bin: pm, args: ['run', script], label: `${pm} run ${script}` };
}

/** Run a tool binary through the package manager's exec (npx for npm). */
export function execCommand(
  pm: PackageManager,
  tool: string,
  args: readonly string[],
): GateCommand {
  const label = `${tool} ${args.join(' ')}`.trimEnd();
  return pm === 'npm'
    ? { bin: 'npx', args: ['--no-install', tool, ...args], label }
    : { bin: pm, args: ['exec', tool, ...args], label };
}

/** A direct tool invocation (for ecosystems whose tools are on PATH: go/cargo/pytest). */
export function directCommand(bin: string, args: readonly string[]): GateCommand {
  return { bin, args, label: `${bin} ${args.join(' ')}`.trimEnd() };
}
