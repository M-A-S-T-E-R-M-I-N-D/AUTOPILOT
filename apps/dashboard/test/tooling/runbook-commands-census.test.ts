// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Census guard for docs/RUNBOOK.md as the operator's command reference:
 * every `dashboard:*` script the root package.json defines is named there
 * as `pnpm <script>`.
 *
 * A script costs one line in package.json; documenting it costs a second
 * edit that nothing asked for. Four had gone without it (found 2026-10-03):
 * `dashboard:demo` and `dashboard:flight`, whose walkthrough was lost in the
 * 2026-09-27 reland storm and never came back (that debrief calls it "a docs
 * gap, not a lost capability"); `dashboard:taxonomy-seed`, which writes
 * labels and milestones to GitHub and is the one command an operator should
 * read about before running; and `dashboard:fleet`, which §12 spelled
 * `pnpm dashboard fleet …` — the `dashboard` script, which builds and starts
 * the SERVER with the arguments ignored, never the fleet launcher.
 *
 * Deliberately a NAME census, not a format check: the runbook is free to
 * put a command in the §1 table or in prose, and to word its row however it
 * likes. It is not free to leave a script out.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

function dashboardScripts(): readonly string[] {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  return Object.keys(pkg.scripts ?? {})
    .filter((name) => name.startsWith('dashboard:'))
    .sort();
}

/** True when `runbook` names `pnpm <script>` exactly — `pnpm
 *  dashboard:autostart:off` does not count as `dashboard:autostart`. */
function namesScript(runbook: string, script: string): boolean {
  const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`pnpm (?:run )?${escaped}(?![\\w:-])`).test(runbook);
}

describe('docs/RUNBOOK.md command census', () => {
  it('finds dashboard scripts to check (the census itself is not silently empty)', () => {
    expect(dashboardScripts().length).toBeGreaterThan(10);
  });

  it('names every dashboard:* package script as `pnpm <script>`', () => {
    const runbook = readFileSync(join(ROOT, 'docs', 'RUNBOOK.md'), 'utf8');
    const missing = dashboardScripts().filter((script) => !namesScript(runbook, script));
    expect(missing, 'add a row to docs/RUNBOOK.md §1 for each').toEqual([]);
  });

  it('never spells a subcommand as `pnpm dashboard <word>` — that runs the server, not the CLI', () => {
    const runbook = readFileSync(join(ROOT, 'docs', 'RUNBOOK.md'), 'utf8');
    expect(runbook.match(/pnpm (?:run )?dashboard [a-z][\w-]*/g) ?? []).toEqual([]);
  });

  it('does not count a longer script name as coverage of a shorter one', () => {
    expect(namesScript('`pnpm dashboard:autostart:off`', 'dashboard:autostart')).toBe(false);
    expect(namesScript('`pnpm dashboard:autostart` / `:off`', 'dashboard:autostart')).toBe(true);
    expect(namesScript('pnpm run dashboard:demo.', 'dashboard:demo')).toBe(true);
    expect(namesScript('pnpm dashboard:demo-extra', 'dashboard:demo')).toBe(false);
  });
});
