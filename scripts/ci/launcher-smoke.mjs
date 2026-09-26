// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * launcher-smoke (board web-mtqanfe4-pil22i, slice 1/2 — `.sh` only): PR #20
 * shipped 7 green checks while its `.sh` launcher spawned a flight against a
 * real directory named `--` at runtime — nothing in the gate had ever
 * actually EXECUTED a launcher script. `parseWatchArgs` closed that one bug
 * at the TS-unit level (`apps/dashboard/test/control/flight-watchdog.test.ts`),
 * but a shell-syntax or quoting mistake in the launcher's OWN `.sh` text —
 * the file every operator actually double-clicks or runs — would still slip
 * through every existing check untouched.
 *
 * This runs the real, committed `.sh` files with `bash`, not a description of
 * them: `bash -n` for a syntax check, then a full execution in an isolated
 * scratch copy with `pnpm`/`node` replaced by recording stubs on `PATH`, so
 * the actual argument-forwarding logic — cd-to-script-dir, guard checks,
 * build-then-launch sequencing — runs for real without touching this
 * machine's real pnpm, node, or dashboard. `.cmd` launchers (Windows-only,
 * `cmd.exe` has no `bash -n`-equivalent syntax-only mode) are a follow-up
 * slice, not this one.
 *
 * The decisions — which files count as launchers, whether the manifest still
 * covers them, which scenarios each launcher gets and whether a run passed —
 * are exported pure helpers, mutation-tested by
 * config/mutation/stryker.ci-launcher-smoke.config.mjs. The `bash` runs
 * themselves only execute when this file is the entry point.
 */
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/** Same marker shape as `touchesSecuritySensitivePath` in pr-review.ts:
 *  `setup.sh` verbatim, or any `*-dashboard.sh` (case-insensitive). */
export function isShLauncher(name) {
  return name.toLowerCase() === 'setup.sh' || name.toLowerCase().endsWith('-dashboard.sh');
}

/** Scanned in the same two places the pr-review.ts marker cares about, so a
 *  newly added launcher fails LOUDLY here (manifest mismatch) instead of
 *  silently never running through this smoke test. `root` defaults to this
 *  repo; the test points it at a scratch tree. */
export function discoverShLaunchers(root = repoRoot) {
  const dirs = ['.', 'scripts/launchers'];
  const found = [];
  for (const dir of dirs) {
    const abs = join(root, dir);
    for (const name of readdirSync(abs)) {
      if (isShLauncher(name)) found.push(dir === '.' ? name : `${dir}/${name}`);
    }
  }
  return found.sort();
}

/** Expected behavior per launcher — hand-written, not derived, so a change to
 *  a script's actual invocation sequence fails this test until the manifest
 *  is updated to match (the point of a smoke test, not a bug in it). */
export const MANIFEST = [
  {
    file: 'SETUP.sh',
    buildsFirst: false,
    requiresDist: false,
    nodeInvocations: [['scripts/setup.mjs']],
  },
  {
    file: 'START-DASHBOARD.sh',
    buildsFirst: true,
    requiresDist: false,
    nodeInvocations: [['apps/dashboard/dist/control/cli.js', 'start']],
  },
  {
    file: 'RESTART-DASHBOARD.sh',
    buildsFirst: true,
    requiresDist: false,
    nodeInvocations: [['apps/dashboard/dist/control/cli.js', 'restart']],
  },
  {
    file: 'STOP-DASHBOARD.sh',
    buildsFirst: false,
    requiresDist: true,
    nodeInvocations: [['apps/dashboard/dist/control/cli.js', 'stop']],
  },
  {
    file: 'STATUS-DASHBOARD.sh',
    buildsFirst: false,
    requiresDist: true,
    nodeInvocations: [
      ['apps/dashboard/dist/control/cli.js', 'status'],
      ['apps/dashboard/dist/control/cli.js', 'doctor'],
    ],
  },
  {
    // The keep-alive twin for login items / user services: no build, exactly
    // one `keepalive` invocation, never `watch` (which spawns flights).
    file: 'KEEPALIVE-DASHBOARD.sh',
    buildsFirst: false,
    requiresDist: true,
    nodeInvocations: [['apps/dashboard/dist/control/cli.js', 'keepalive']],
  },
  {
    // The PR #20 launcher — the one whose runtime bug (a literal `--`
    // forwarded to the CLI as a phantom project folder, observed spawning a
    // flight for a folder named `--`) motivated this whole smoke gate. It
    // launches via pnpm, not node, so the exact pnpm argv is pinned instead:
    // `dashboard:watch` with NO separator and NO stray argument.
    file: 'WATCH-DASHBOARD.sh',
    buildsFirst: true,
    requiresDist: false,
    nodeInvocations: [],
    pnpmInvocations: ['run build', 'dashboard:watch'],
  },
];

/** `discovered` is the sorted list `discoverShLaunchers` returns; the
 *  manifest must name exactly those files, no more and no fewer. */
export function assertManifestCovers(discovered, manifest) {
  const known = manifest.map((e) => e.file).sort();
  assert(
    JSON.stringify(discovered) === JSON.stringify(known),
    `launcher-smoke's manifest is out of date — discovered [${discovered.join(', ')}] but the manifest covers [${known.join(', ')}]. Add the new launcher to MANIFEST in scripts/ci/launcher-smoke.mjs.`,
  );
}

/** Every launcher gets its happy path plus its one relevant guard branch:
 *  build failure short-circuit for a builder, "not built yet" for a
 *  dist-requiring launcher. A builder never gets the "not built yet" run. */
export function scenariosFor(entry) {
  const happy = { simulateBuildFailure: false, includeDist: true };
  if (entry.buildsFirst) return [happy, { simulateBuildFailure: true, includeDist: true }];
  if (entry.requiresDist) return [happy, { simulateBuildFailure: false, includeDist: false }];
  return [happy];
}

// Stryker disable all: the stub body and its writer only matter under a real
// `bash` run — exercised by running the gate for real.
const STUB_BODY = (recordFile) => `#!/usr/bin/env bash
echo "$@" >> "${recordFile}"
if [ -f "${recordFile}.fail" ]; then
  exit 1
fi
exit 0
`;

function writeStub(binDir, name, recordFile) {
  const path = join(binDir, name);
  writeFileSync(path, STUB_BODY(recordFile));
  chmodSync(path, 0o755);
}
// Stryker restore all

/** One stub's recorded calls, one line per invocation. A stub that never ran
 *  wrote no file, which reads as no calls. */
export function readRecord(recordFile) {
  try {
    return readFileSync(recordFile, 'utf8').trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// Stryker disable all: `smokeTestLauncher` and `runScenario` shell out to
// `bash` in a scratch copy — exercised only by running the gate for real. The
// plan they follow (`scenariosFor`) and the verdict they apply
// (`checkScenario`) ARE mutation-tested.
/** Runs every scenario `scenariosFor` plans for one manifest entry, each in
 *  its own disposable scratch dir. */
function smokeTestLauncher(entry) {
  execFileSync('bash', ['-n', join(repoRoot, entry.file)], { windowsHide: true, stdio: 'pipe' });

  for (const scenario of scenariosFor(entry)) runScenario(entry, scenario);
}

function runScenario(entry, scenario) {
  const { simulateBuildFailure, includeDist } = scenario;
  const scratch = mkdtempSync(join(tmpdir(), 'autopilot-launcher-smoke-'));
  try {
    const scriptCopy = join(scratch, entry.file.split('/').pop());
    writeFileSync(scriptCopy, readFileSync(join(repoRoot, entry.file)));
    chmodSync(scriptCopy, 0o755);

    if (includeDist) {
      mkdirSync(join(scratch, 'apps/dashboard/dist/control'), { recursive: true });
      writeFileSync(join(scratch, 'apps/dashboard/dist/control/cli.js'), '');
    }

    const binDir = join(scratch, 'stubbin');
    mkdirSync(binDir, { recursive: true });
    const nodeRecord = join(scratch, 'node.calls');
    const pnpmRecord = join(scratch, 'pnpm.calls');
    writeStub(binDir, 'node', nodeRecord);
    writeStub(binDir, 'pnpm', pnpmRecord);
    if (simulateBuildFailure) writeFileSync(`${pnpmRecord}.fail`, '');

    let exitCode = 0;
    let output = '';
    try {
      output = execFileSync('bash', [scriptCopy], {
        windowsHide: true,
        cwd: scratch,
        env: { ...process.env, PATH: `${binDir}${delimiter}${process.env.PATH}` },
        encoding: 'utf8',
      });
    } catch (err) {
      exitCode = typeof err.status === 'number' ? err.status : 1;
      output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }

    checkScenario(entry, scenario, {
      exitCode,
      output,
      nodeCalls: readRecord(nodeRecord),
      pnpmCalls: readRecord(pnpmRecord),
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
// Stryker restore all

/** The verdict on one scenario's run: `run` is the launcher's exit code, its
 *  combined output and the calls each stub recorded. Throws naming the first
 *  broken expectation. */
export function checkScenario(entry, { simulateBuildFailure, includeDist }, run) {
  const { exitCode, output, nodeCalls, pnpmCalls } = run;

  if (simulateBuildFailure) {
    assert(exitCode === 1, `${entry.file}: expected exit 1 on a failed build, got ${exitCode}`);
    assert(
      nodeCalls.length === 0,
      `${entry.file}: a failed \`pnpm run build\` must short-circuit before ever invoking node, saw: ${nodeCalls.join(' | ')}`,
    );
    assert(
      /BUILD FAILED/.test(output),
      `${entry.file}: a failed build must print a "BUILD FAILED" notice, got: ${output}`,
    );
    return;
  }

  if (entry.requiresDist && !includeDist) {
    assert(
      exitCode === 0,
      `${entry.file}: missing dist/cli.js must exit 0 gracefully (nothing to do yet), got ${exitCode}`,
    );
    assert(
      nodeCalls.length === 0,
      `${entry.file}: missing dist/cli.js must never invoke node, saw: ${nodeCalls.join(' | ')}`,
    );
    return;
  }

  assert(
    exitCode === 0,
    `${entry.file}: expected a clean exit 0, got ${exitCode}. Output: ${output}`,
  );
  assert(
    nodeCalls.length === entry.nodeInvocations.length,
    `${entry.file}: expected ${entry.nodeInvocations.length} node invocation(s), saw ${nodeCalls.length}: ${nodeCalls.join(' | ')}`,
  );
  entry.nodeInvocations.forEach((expected, i) => {
    const expectedLine = expected.join(' ');
    assert(
      nodeCalls[i] === expectedLine,
      `${entry.file}: node invocation #${i + 1} expected "${expectedLine}", got "${nodeCalls[i]}"`,
    );
  });
  if (entry.pnpmInvocations) {
    // Exact pnpm argv pin — this is what makes a forwarded stray token
    // (e.g. WATCH-DASHBOARD.sh's original `dashboard:watch --`) a red
    // gate instead of a runtime surprise.
    assert(
      JSON.stringify(pnpmCalls) === JSON.stringify(entry.pnpmInvocations),
      `${entry.file}: pnpm invocations expected [${entry.pnpmInvocations.join(' | ')}], saw [${pnpmCalls.join(' | ')}]`,
    );
  } else if (entry.buildsFirst) {
    assert(
      pnpmCalls.some((c) => c === 'run build'),
      `${entry.file}: expected \`pnpm run build\` before launching, saw: ${pnpmCalls.join(' | ')}`,
    );
  } else {
    assert(
      pnpmCalls.length === 0,
      `${entry.file}: does not build, but pnpm was invoked: ${pnpmCalls.join(' | ')}`,
    );
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Stryker disable all: `main` runs every launcher for real and exits the
// process — exercised only by running the gate for real.
function main() {
  assertManifestCovers(discoverShLaunchers(), MANIFEST);

  for (const entry of MANIFEST) {
    smokeTestLauncher(entry);
    console.log(`launcher-smoke: ${entry.file} OK`);
  }
  console.log('launcher-smoke OK');
}

// Run only as the entry point, so the test file can import the helpers above
// without running a single launcher.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(`launcher-smoke FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
// Stryker restore all
