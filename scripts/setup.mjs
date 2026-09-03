// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * setup — first-run bootstrap. Detects missing prerequisites (git, pnpm,
 * project dependencies, the Claude Code CLI) and installs what it safely can,
 * then prints a doctor-style report. Node itself must already be present to
 * run this script at all (SETUP.cmd checks that first); everything else here
 * is idempotent, so re-running is always safe.
 *
 * Field-tested failure this file must survive (2026-08-13, a fresh Windows
 * machine): `corepack enable pnpm` writes its shim into the Node install
 * directory (under Program Files) and dies with EPERM in any
 * non-elevated shell. pnpm acquisition is therefore a LADDER, not one
 * command: PATH → corepack enable → `npm install -g pnpm` (lands in the
 * user-writable npm prefix, no admin needed) → run-through-`corepack pnpm`
 * as a last resort — with explicit guidance only when every rung fails.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/**
 * @typedef {{ name: string, ok: boolean, detail: string }} Check
 */

/** @param {string} range e.g. ">=22.12.0" @returns {[number, number, number]} */
function parseMinVersion(range) {
  const match = range.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** @param {string} version @param {[number, number, number]} min @returns {boolean} */
function versionAtLeast(version, min) {
  const parts = version.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const part = parts[i] ?? 0;
    if (part > min[i]) return true;
    if (part < min[i]) return false;
  }
  return true;
}

/** Run a FIXED command string silently; true on exit 0. Never takes user
 *  input (string-only, no arg concatenation — avoids DEP0190 entirely). */
function trySilent(command) {
  try {
    execSync(command, { stdio: 'ignore', cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

/** Run a FIXED command string with inherited stdio (visible progress). */
function tryLoud(command) {
  try {
    execSync(command, { stdio: 'inherit', cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

/** @returns {Check} */
function checkNode() {
  const min = parseMinVersion(pkg.engines?.node ?? '>=22.12.0');
  const ok = versionAtLeast(process.version, min);
  return { name: 'node', ok, detail: process.version };
}

/** @returns {Check} */
function checkGit() {
  const ok = trySilent('git --version');
  return {
    name: 'git',
    ok,
    detail: ok
      ? 'available'
      : 'not found — AUTOPILOT cannot back up or fly a repo without it. Install: https://git-scm.com/download',
  };
}

/**
 * The pnpm ladder. Resolves BOTH a doctor check and the command prefix the
 * dependency install should use (`pnpm` when a real shim exists, `corepack
 * pnpm` when only the corepack passthrough works).
 * @returns {{ check: Check, invoke: string | null }}
 */
function resolvePnpm() {
  if (trySilent('pnpm --version')) {
    return { check: { name: 'pnpm', ok: true, detail: 'available' }, invoke: 'pnpm' };
  }

  console.log('pnpm not found — trying corepack enable...');
  if (!trySilent('corepack enable pnpm')) {
    console.log(
      '  corepack could not write its shim (on Windows this needs an elevated shell' +
        ' when Node lives in Program Files) — falling back to "npm install -g pnpm"...',
    );
  }
  if (trySilent('pnpm --version')) {
    return { check: { name: 'pnpm', ok: true, detail: 'enabled via corepack' }, invoke: 'pnpm' };
  }

  // npm's global prefix is user-writable (no admin) and already on PATH.
  tryLoud('npm install -g pnpm@10');
  if (trySilent('pnpm --version')) {
    return {
      check: { name: 'pnpm', ok: true, detail: 'installed via npm (user scope)' },
      invoke: 'pnpm',
    };
  }

  // Last resort: corepack can RUN pnpm without ever installing a shim.
  if (trySilent('corepack pnpm --version')) {
    return {
      check: {
        name: 'pnpm',
        ok: true,
        detail:
          'usable via "corepack pnpm" (no shim on PATH — the .cmd launchers need one:' +
          ' run SETUP.cmd as Administrator once, or run: npm install -g pnpm)',
      },
      invoke: 'corepack pnpm',
    };
  }

  return {
    check: {
      name: 'pnpm',
      ok: false,
      detail: 'run SETUP.cmd as Administrator once, or run: npm install -g pnpm',
    },
    invoke: null,
  };
}

/** @param {string | null} pnpmInvoke @returns {Check} */
function checkDependencies(pnpmInvoke) {
  if (!pnpmInvoke) {
    return { name: 'dependencies', ok: false, detail: 'pnpm unavailable — cannot install' };
  }
  console.log(`Installing dependencies (${pnpmInvoke} install)...`);
  const installed = tryLoud(`${pnpmInvoke} install`);
  const ok = installed && existsSync(join(ROOT, 'node_modules'));
  return { name: 'dependencies', ok, detail: ok ? 'installed' : `run: ${pnpmInvoke} install` };
}

/** @returns {Check} */
function checkClaudeCli() {
  let ok = trySilent('claude --version');
  if (!ok) {
    console.log('Claude Code CLI not found — installing via npm...');
    tryLoud('npm install -g @anthropic-ai/claude-code');
    ok = trySilent('claude --version');
  }
  return {
    name: 'claude-cli',
    ok,
    detail: ok ? 'available' : 'run: npm install -g @anthropic-ai/claude-code',
  };
}

/** @param {Check[]} checks */
function printReport(checks) {
  console.log('\nAUTOPILOT setup — doctor report');
  for (const check of checks) {
    console.log(`  [${check.ok ? 'OK' : 'MISSING'}] ${check.name} — ${check.detail}`);
  }
}

function main() {
  const nodeCheck = checkNode();
  if (!nodeCheck.ok) {
    printReport([nodeCheck]);
    console.error(`\nNode.js ${pkg.engines?.node ?? '>=22.12.0'} required. Install a newer`);
    console.error('Node.js (https://nodejs.org/), then re-run this setup.');
    process.exitCode = 1;
    return;
  }

  const gitCheck = checkGit();
  const pnpm = resolvePnpm();
  const dependenciesCheck = checkDependencies(pnpm.invoke);
  const claudeCheck = checkClaudeCli();
  const checks = [nodeCheck, gitCheck, pnpm.check, dependenciesCheck, claudeCheck];
  printReport(checks);

  const criticalOk = [nodeCheck, gitCheck, pnpm.check, dependenciesCheck].every(
    (check) => check.ok,
  );
  if (!criticalOk) {
    console.error('\nSetup could not finish — see MISSING items above.');
    process.exitCode = 1;
    return;
  }

  if (claudeCheck.ok) {
    console.log('\nAll set. Run `claude` once to log in if you have not already, then');
    console.log('double-click START-DASHBOARD.cmd (or `pnpm dashboard:start`).');
  } else {
    console.log('\nCore setup is done. The Claude Code CLI is optional for setup but required');
    console.log('to fly a repo — install it manually, then run `claude` once to log in.');
  }
}

main();
