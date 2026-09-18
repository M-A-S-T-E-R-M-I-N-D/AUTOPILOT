// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Keeps the dashboard alive across reboots.
 *
 *   node scripts/dashboard/autostart.mjs --install | --remove | --status | --print-plan
 *   pnpm dashboard:autostart          (= --install)
 *   pnpm dashboard:autostart:off      (= --remove)
 *   pnpm dashboard:autostart:status   (= --status)
 *
 * THE INCIDENT (2026-09-18): after a reboot the dashboard — started by hand,
 * kept alive by nothing — stayed down until someone started it by hand
 * again. Nothing on the host knew it should come back.
 *
 * WHAT THIS REGISTERS: a two-line VBScript in the current user's Startup
 * folder (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`). Windows
 * runs everything there at that user's logon, no admin rights involved —
 * Task Scheduler's logon trigger was tried first and is denied without
 * elevation on a standard account. The script runs `KEEPALIVE-DASHBOARD.cmd`
 * in a hidden window; that launcher runs `dashboard keepalive`: the
 * server-lifecycle watchdog and nothing else — every 15s, start the server
 * if it is not running. NEVER `dashboard watch`: that is the fleet
 * supervisor and would spawn a flight for every idle project the moment the
 * operator logs in.
 *
 * `--print-plan` shows every path before anything is written, `--install`
 * also starts the keepalive right away, and `--remove` takes it all back.
 * Other platforms: nothing is registered; the login-item recipe is printed
 * (`./KEEPALIVE-DASHBOARD.sh`).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TASK_NAME = 'AUTOPILOT dashboard keepalive';
export const LAUNCHER = 'KEEPALIVE-DASHBOARD.cmd';

/** The VBScript that runs the launcher hidden (window style 0, no wait).
 *  Doubled quotes are VBScript's escape for a quote inside a string. */
export function vbsSource(launcherPath) {
  return [
    "' AUTOPILOT dashboard keepalive - written by scripts/dashboard/autostart.mjs; remove with pnpm dashboard:autostart:off",
    `CreateObject("WScript.Shell").Run """${launcherPath}""", 0, False`,
    '',
  ].join('\r\n');
}

/** The current user's Startup folder, or null when APPDATA is not set. */
export function startupDir(appData) {
  if (!appData) return null;
  return join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

/** Everything `--install` would do, as data — printed by --print-plan and
 *  asserted by apps/dashboard/test/tooling/autostart.test.ts. */
export function plan(
  repoRoot,
  { platform = process.platform, appData = process.env['APPDATA'] } = {},
) {
  const launcherPath = join(repoRoot, LAUNCHER);
  const dir = platform === 'win32' ? startupDir(appData) : null;
  return {
    platform,
    supported: dir !== null,
    taskName: TASK_NAME,
    launcherPath,
    startupDir: dir,
    startupPath: dir === null ? null : join(dir, `${TASK_NAME}.vbs`),
    vbs: vbsSource(launcherPath),
    logPath: join(repoRoot, '.autopilot', 'keepalive.log'),
  };
}

function unsupportedNote(p) {
  return [
    `autostart: only the Windows Startup folder is wired (this is ${p.platform}${p.platform === 'win32' ? ', APPDATA unset' : ''}).`,
    'Register ./KEEPALIVE-DASHBOARD.sh yourself: a systemd --user service (WantedBy=default.target,',
    'Restart=always) on Linux, or a launchd LaunchAgent with RunAtLoad and KeepAlive on macOS.',
    'It starts the dashboard when it is not running and never spawns a flight.',
  ].join('\n');
}

function main() {
  const op = process.argv[2] ?? '--status';
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]+$/, '');
  const p = plan(repoRoot);
  if (op === '--print-plan') {
    process.stdout.write(`${JSON.stringify(p, null, 2)}\n`);
    return;
  }
  if (!p.supported) {
    process.stdout.write(`${unsupportedNote(p)}\n`);
    return;
  }
  if (op === '--install') {
    if (!existsSync(p.launcherPath)) throw new Error(`autostart: ${p.launcherPath} is missing`);
    mkdirSync(p.startupDir, { recursive: true });
    writeFileSync(p.startupPath, p.vbs);
    // Start it now too — the next logon is not the first time it should help.
    execFileSync('wscript.exe', [p.startupPath], { windowsHide: true, stdio: 'ignore' });
    process.stdout.write(
      `autostart: registered "${TASK_NAME}" in the Startup folder and started it now.\n` +
        `  entry: ${p.startupPath}\n  runs:  ${p.launcherPath}\n  log:   ${p.logPath}\n` +
        '  undo:  pnpm dashboard:autostart:off\n',
    );
    return;
  }
  if (op === '--remove') {
    const had = existsSync(p.startupPath);
    rmSync(p.startupPath, { force: true });
    process.stdout.write(
      had
        ? `autostart: removed ${p.startupPath}. A keepalive already running keeps running until you log out.\n`
        : `autostart: nothing was registered at ${p.startupPath}; nothing to remove.\n`,
    );
    return;
  }
  if (op === '--status') {
    if (existsSync(p.startupPath)) {
      process.stdout.write(
        `autostart: registered — ${p.startupPath}\n  runs: ${p.launcherPath}\n  log:  ${p.logPath}\n`,
      );
    } else {
      process.stdout.write(
        `autostart: not registered (${p.startupPath}). Register it: pnpm dashboard:autostart\n`,
      );
      process.exitCode = 1;
    }
    return;
  }
  throw new Error(
    `autostart: unknown option '${op}' (use --install | --remove | --status | --print-plan)`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
