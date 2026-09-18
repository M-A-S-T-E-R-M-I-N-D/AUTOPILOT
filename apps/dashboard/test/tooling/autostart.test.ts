// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * SURVIVING A REBOOT (2026-09-18: the machine restarted and the dashboard
 * stayed down until a hand start). `pnpm dashboard:autostart`
 * drops a two-line VBScript into the current user's Startup folder — no
 * admin rights, unlike Task Scheduler's logon trigger, which is denied
 * without elevation on a standard account — that runs the KEEPALIVE
 * launcher hidden: the server-lifecycle watchdog and nothing else. Pinned
 * here through the script's own `--print-plan`: the entry runs the KEEPALIVE
 * launcher (never `dashboard watch`, which spawns flights for every idle
 * project), it lands in the Startup folder under APPDATA, and every path in
 * the plan is absolute inside this checkout.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/[\\/]+$/, '');

interface Plan {
  readonly platform: string;
  readonly supported: boolean;
  readonly taskName: string;
  readonly launcherPath: string;
  readonly startupDir: string | null;
  readonly startupPath: string | null;
  readonly vbs: string;
  readonly logPath: string;
}

function printPlan(env: NodeJS.ProcessEnv = process.env): Plan {
  const out = execFileSync(process.execPath, ['scripts/dashboard/autostart.mjs', '--print-plan'], {
    cwd: REPO,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
    env,
  });
  return JSON.parse(out) as Plan;
}

describe('dashboard autostart — the plan the Startup entry is written from', () => {
  const p = printPlan({ ...process.env, APPDATA: join(REPO, 'fake-appdata') });

  it('runs the KEEPALIVE launcher of THIS checkout, hidden, from a VBScript in the Startup folder under APPDATA', () => {
    expect(p.launcherPath).toBe(join(REPO, 'KEEPALIVE-DASHBOARD.cmd'));
    expect(existsSync(p.launcherPath)).toBe(true);
    expect(p.vbs).toContain(`Run """${p.launcherPath}""", 0, False`);
    expect(p.vbs).not.toContain('WATCH-DASHBOARD');
    expect(p.logPath).toBe(join(REPO, '.autopilot', 'keepalive.log'));
    if (p.platform === 'win32') {
      expect(p.supported).toBe(true);
      expect(p.startupDir).toBe(
        join(REPO, 'fake-appdata', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'),
      );
      expect(p.startupPath).toBe(join(p.startupDir!, `${p.taskName}.vbs`));
    } else {
      expect(p.supported).toBe(false);
      expect(p.startupPath).toBeNull();
    }
  });

  it('never registers the fleet supervisor — the launcher it points at runs `keepalive`, not `watch`, and never builds', () => {
    const launcher = readFileSync(p.launcherPath, 'utf8');
    expect(launcher).toContain('cli.js keepalive');
    expect(launcher).not.toMatch(/cli\.js watch/);
    expect(launcher).not.toContain('pnpm run build');
    expect(launcher).toContain('keepalive.log');
  });

  it('is unsupported without APPDATA even on Windows, and says so instead of guessing a folder', () => {
    const env = { ...process.env };
    delete env['APPDATA'];
    const q = printPlan(env);
    expect(q.supported).toBe(false);
    expect(q.startupPath).toBeNull();
  });
});
