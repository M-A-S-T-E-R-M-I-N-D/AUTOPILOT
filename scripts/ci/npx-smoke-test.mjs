// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * npx-smoke-test — deploy playbook step 1's last rung (web-msnswvfg-7rsizc):
 * proves the dashboard's `bin` entry actually works once installed OUTSIDE
 * the pnpm workspace, the way a real `npx @autopilot/dashboard` consumer
 * would get it. `pnpm pack` rewrites each package's `workspace:*` deps to
 * plain semver (e.g. "0.1.0") — those version strings don't exist on any
 * registry, so a real `npm install` of just the dashboard tarball 404s.
 * This packs the dashboard's whole internal dependency closure, installs
 * them together via npm `overrides` pinned to the local tarballs (external
 * deps like better-sqlite3 still resolve from the real registry), then runs
 * the installed `autopilot-dashboard` bin exactly as `npx` would resolve it.
 *
 * Also asserts the two static properties a broken repack could silently
 * regress: the packed bin file's shebang is LF-terminated (a CRLF shebang
 * is not `#!` to the OS loader), and the tarball's "files" allowlist keeps
 * source (`src/`, configs) out of what ships. Then proves the literal
 * deliverable — `npx . start` actually BOOTS the dashboard, not just that
 * the bin resolves — by starting it on a dedicated port, hitting
 * `/api/health`, and tearing it down again.
 *
 * Requires `pnpm run build` first — packs the compiled dist output, the
 * same artifact `pnpm publish` would ship.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const DASHBOARD_DIR = 'apps/dashboard';
const WORKSPACE_GLOBS = ['packages', 'apps'];

// On win32, npm/pnpm/npx resolve to `.cmd` shims, which `execFileSync` can't
// exec directly (EINVAL) without going through a shell.
const bin = (name) => (process.platform === 'win32' ? `${name}.cmd` : name);
const shellOpts = process.platform === 'win32' ? { shell: true } : {};

/** @returns {Map<string, { dir: string, version: string, pkg: Record<string, unknown> }>} */
function discoverWorkspacePackages() {
  const map = new Map();
  for (const group of WORKSPACE_GLOBS) {
    const groupDir = join(repoRoot, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir)) {
      const pkgJsonPath = join(groupDir, entry, 'package.json');
      if (!existsSync(pkgJsonPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
      map.set(pkg.name, { dir: join(group, entry), version: pkg.version, pkg });
    }
  }
  return map;
}

/** BFS the `workspace:*` dependency closure starting from `rootName`, dashboard included. */
function workspaceClosure(rootName, packages) {
  const closure = new Set();
  const queue = [rootName];
  while (queue.length > 0) {
    const name = queue.shift();
    if (closure.has(name)) continue;
    closure.add(name);
    const entry = packages.get(name);
    if (!entry) throw new Error(`workspace package not found: ${name}`);
    for (const [dep, range] of Object.entries(entry.pkg.dependencies ?? {})) {
      if (typeof range === 'string' && range.startsWith('workspace:')) queue.push(dep);
    }
  }
  return closure;
}

function tarballName(entry) {
  return `${entry.pkg.name.replace('@', '').replace('/', '-')}-${entry.version}.tgz`;
}

function assertDistBuilt(entry) {
  const distDir = join(repoRoot, entry.dir, 'dist');
  if (!existsSync(distDir)) {
    throw new Error(`${entry.dir}/dist not found — run \`pnpm run build\` first`);
  }
}

// dist/ is already built (assertDistBuilt) before every pack call here — skip
// the "prepack" lifecycle script (`pnpm run build`) so packing 5 packages
// doesn't silently trigger 5 redundant rebuilds.
const PACK_ARGS = ['pack', '--config.ignore-scripts=true'];

function packAll(packages, closureNames, destDir) {
  for (const name of closureNames) {
    const entry = packages.get(name);
    assertDistBuilt(entry);
    execFileSync(bin('pnpm'), [...PACK_ARGS, '--pack-destination', destDir], {
      cwd: join(repoRoot, entry.dir),
      stdio: 'ignore',
      ...shellOpts,
    });
    const expected = join(destDir, tarballName(entry));
    if (!existsSync(expected)) throw new Error(`pnpm pack did not produce ${expected}`);
  }
}

/** Every packed file must ship the compiled dist output only — no leaking `src/`. */
function assertFilesAllowlist(dashboardEntry) {
  assertDistBuilt(dashboardEntry);
  const json = execFileSync(bin('pnpm'), [...PACK_ARGS, '--json', '--dry-run'], {
    cwd: join(repoRoot, dashboardEntry.dir),
    encoding: 'utf8',
    ...shellOpts,
  });
  const { files } = JSON.parse(json);
  const offenders = files
    .map((f) => f.path)
    .filter((p) => p !== 'package.json' && !p.startsWith('dist/'));
  if (offenders.length > 0) {
    throw new Error(`tarball ships files outside the dist/ allowlist: ${offenders.join(', ')}`);
  }
}

/** The shebang must be `#!/usr/bin/env node` + a bare LF — a CRLF line ending
 *  makes the byte after `node` a literal `\r`, which the OS loader treats as
 *  part of the interpreter name and refuses to exec. */
function assertBinShebangIsLf(dashboardEntry) {
  const [binRelPath] = Object.values(dashboardEntry.pkg.bin ?? {});
  if (!binRelPath) throw new Error(`${dashboardEntry.pkg.name}: package.json has no "bin" entry`);
  const binPath = join(repoRoot, dashboardEntry.dir, binRelPath);
  const raw = readFileSync(binPath);
  const firstLineEnd = raw.indexOf(0x0a); // '\n'
  if (firstLineEnd <= 0) throw new Error(`${binRelPath}: no newline found`);
  const firstLine = raw.subarray(0, firstLineEnd).toString('utf8');
  if (!firstLine.startsWith('#!/usr/bin/env node')) {
    throw new Error(`${binRelPath}: expected a "#!/usr/bin/env node" shebang, got: ${firstLine}`);
  }
  if (raw[firstLineEnd - 1] === 0x0d) {
    throw new Error(`${binRelPath}: shebang line ends in CRLF, not LF`);
  }
  return binRelPath;
}

function buildScratchManifest(packages, dashboardEntry, closureNames, packDir) {
  const overrides = {};
  for (const name of closureNames) {
    if (name === dashboardEntry.pkg.name) continue;
    overrides[name] = `file:${join(packDir, tarballName(packages.get(name))).replace(/\\/g, '/')}`;
  }
  return {
    name: 'autopilot-npx-smoke-test-scratch',
    private: true,
    version: '0.0.0',
    dependencies: {
      [dashboardEntry.pkg.name]:
        `file:${join(packDir, tarballName(dashboardEntry)).replace(/\\/g, '/')}`,
    },
    overrides,
  };
}

function runSmokeInvocation(installDir, binName) {
  const stdout = execFileSync(bin('npx'), ['--no-install', binName, 'status'], {
    cwd: installDir,
    encoding: 'utf8',
    ...shellOpts,
  });
  if (!stdout.trim()) throw new Error(`${binName} status produced no output`);
  return stdout.trim();
}

/** A free loopback port — never the operator's live dashboard (whatever port
 *  that runs on), and distinct across concurrent smoke-test runs. */
function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : null;
      srv.close(() => {
        if (port) resolvePort(port);
        else reject(new Error('could not determine a free port'));
      });
    });
  });
}

/** Reads the pid `start` recorded, straight from control/state.ts's own state
 *  file — more direct than re-parsing `status`'s printed text. */
function readDashboardPid(installDir) {
  const statePath = join(installDir, '.autopilot-run', 'dashboard.json');
  if (!existsSync(statePath)) return null;
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  return typeof state.pid === 'number' ? state.pid : null;
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0); // signal 0 = existence probe, kills nothing
    return true;
  } catch {
    return false;
  }
}

/** `process.kill()` returns before the OS has actually reclaimed the target's
 *  file handles — an immediate `rmSync` on its still-open log/db files then
 *  races an EBUSY on Windows. Poll until the pid is actually gone (or give up
 *  after a bounded wait) before the caller tears down the scratch dir. */
async function waitForExit(pid, timeoutMs = 5000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (isPidAlive(pid) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** The CLI's own readiness probe (ready.ts's `waitForHealth`, called by `start`
 *  before it ever prints a line) already gives the detached server up to 5s
 *  to answer before giving up and printing a "still starting" hint instead of
 *  failing — `start` still exits 0 either way. A cold CI runner (fresh
 *  better-sqlite3 native addon, contended disk/CPU) can miss that 5s window
 *  even though the server comes up moments later, so a single unguarded
 *  `fetch()` right after `start` returns inherits the same race and turns a
 *  slow boot into a hard "fetch failed" (confirmed against real CI logs: the
 *  gap between `start` returning and the failing fetch was ~5.5s — exactly
 *  the CLI's own timeout, plus overhead). Reuse the CLI's own tested retry
 *  loop here too, with a longer budget, instead of trusting its exit to mean
 *  "already answering". Imported from the just-built dist output (not the
 *  packed tarball) since `assertDistBuilt` already guarantees it exists. */
const SMOKE_HEALTH_TIMEOUT_MS = 20_000;

async function waitForServerHealth(dashboardEntry, url) {
  const readyModule = join(repoRoot, dashboardEntry.dir, 'dist', 'ready.js');
  const { waitForHealth } = await import(pathToFileURL(readyModule).href);
  return waitForHealth(url, { timeoutMs: SMOKE_HEALTH_TIMEOUT_MS });
}

/** `status` alone only proves the bin resolves and runs — it succeeds even if
 *  `start` can never actually boot a server (e.g. a missing dist file inside
 *  the tarball). This proves the literal deliverable: `npx` boots the real
 *  dashboard, on a dedicated port, then tears it down.
 *
 *  Cleanup kills the recorded pid directly rather than through the bin's own
 *  `stop` — `stop` refuses inside a flight (AUTOPILOT_FLIGHT=1, control.ts's
 *  suicide guard), and this smoke test must tear down its own throwaway
 *  server regardless of whether it happens to run inside one. */
async function assertBinBootsTheServer(dashboardEntry, installDir, binName, port) {
  const startOutput = execFileSync(bin('npx'), ['--no-install', binName, 'start'], {
    cwd: installDir,
    encoding: 'utf8',
    env: { ...process.env, AUTOPILOT_DASHBOARD_PORT: String(port), AUTOPILOT_NO_OPEN: '1' },
    ...shellOpts,
  });
  const pid = readDashboardPid(installDir);
  try {
    const url = `http://127.0.0.1:${port}`;
    if (!startOutput.includes(url)) {
      throw new Error(`${binName} start did not report ${url}: "${startOutput.trim()}"`);
    }
    const ready = await waitForServerHealth(dashboardEntry, `${url}/api/health`);
    if (!ready) {
      throw new Error(
        `GET ${url}/api/health did not become ready within ${SMOKE_HEALTH_TIMEOUT_MS}ms`,
      );
    }
  } finally {
    if (pid !== null) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
      await waitForExit(pid);
    }
  }
  console.log(`npx-smoke-test: \`npx ${binName} start\` booted a live server on :${port}`);
}

/** The just-killed server loaded better-sqlite3's native addon; Windows can lag
 *  releasing that DLL's directory handle a few seconds after the process is
 *  confirmed dead, which races a bare rmSync into a transient EBUSY on the
 *  scratch dir itself — confirmed by hand: an identical rmSync succeeds on a
 *  later retry with no code change. rmSync's own maxRetries covers the common
 *  case; the manual fallback loop buys extra real time for the rarer slow
 *  release instead of failing the whole smoke test on a release-timing race. */
async function cleanupScratch(scratch) {
  try {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    return;
  } catch (err) {
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        rmSync(scratch, { recursive: true, force: true });
        return;
      } catch {
        /* keep retrying until the attempt budget runs out */
      }
    }
    throw err;
  }
}

async function main() {
  const packages = discoverWorkspacePackages();
  const dashboardEntry = packages.get(
    JSON.parse(readFileSync(join(repoRoot, DASHBOARD_DIR, 'package.json'), 'utf8')).name,
  );
  const closureNames = workspaceClosure(dashboardEntry.pkg.name, packages);

  console.log(`npx-smoke-test: packing ${[...closureNames].join(', ')}`);
  assertBinShebangIsLf(dashboardEntry);
  assertFilesAllowlist(dashboardEntry);

  const scratch = mkdtempSync(join(tmpdir(), 'autopilot-npx-smoke-'));
  const packDir = join(scratch, 'pack');
  const installDir = join(scratch, 'install');
  mkdirSync(packDir, { recursive: true });
  mkdirSync(installDir, { recursive: true });

  try {
    packAll(packages, closureNames, packDir);
    const manifest = buildScratchManifest(packages, dashboardEntry, closureNames, packDir);
    writeFileSync(join(installDir, 'package.json'), JSON.stringify(manifest, null, 2));

    console.log('npx-smoke-test: npm install (resolving external deps from the registry)…');
    execFileSync(bin('npm'), ['install', '--no-audit', '--no-fund'], {
      cwd: installDir,
      stdio: 'ignore',
      ...shellOpts,
    });

    const [binName] = Object.keys(dashboardEntry.pkg.bin ?? {});
    const output = runSmokeInvocation(installDir, binName);
    console.log(`npx-smoke-test: \`npx ${binName} status\` → "${output}"`);

    const port = await getFreePort();
    await assertBinBootsTheServer(dashboardEntry, installDir, binName, port);
  } finally {
    await cleanupScratch(scratch);
  }

  console.log('npx-smoke-test OK');
}

main().catch((err) => {
  console.error(`npx-smoke-test FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
