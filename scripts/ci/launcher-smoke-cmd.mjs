// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * launcher-smoke-cmd (board web-mtqanfe4-pil22i, slice 2/2 — `.cmd` launchers):
 * {@link file://./launcher-smoke.mjs} covers the five root `.sh` launchers
 * with `bash -n` plus a stubbed execution; that file's own doc comment
 * flagged the Windows `.cmd` launchers as a follow-up because `cmd.exe` has
 * no `bash -n`-equivalent syntax-only mode. This is that follow-up: it runs
 * every real, committed `.cmd` launcher with `cmd.exe` end to end.
 *
 * Windows-only by construction (`cmd.exe` does not exist elsewhere), so this
 * exits 0 with a notice on any other platform — CI only invokes it on the
 * `windows-latest` leg of the verify matrix.
 *
 * Unlike the `.sh` smoke test, `node` itself is never stubbed: on Windows a
 * batch file (`.cmd`) invoked WITHOUT `call` transfers control permanently —
 * the parent script never resumes, so a stub `node.cmd` would silently
 * swallow every command after the first `node` invocation (discovered by
 * running STATUS-DASHBOARD.cmd's two sequential `node ... status` / `node
 * ... doctor` calls against a `node.cmd` stub: only the first was ever
 * recorded). `pnpm` stays a `.cmd` stub because every launcher invokes it
 * through `call pnpm run build`, where that transfer-of-control quirk does
 * not apply. Real `node.exe` instead runs a tiny recorder written to each
 * launcher's actual target path (`cli.js`, `demo.js`, `flight.js`,
 * `setup.mjs`), which appends its own `argv` to a file named by the
 * `RECORD_FILE` env var — capturing the real Windows argument-quoting
 * behavior (e.g. `WATCH-DASHBOARD.cmd`'s `"%~1" %2 %3` forwarding an absent
 * first argument as a literal empty string, not as an omitted one).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/** Same marker shape as `SECURITY_SENSITIVE_PATH_MARKERS` in pr-review.ts:
 *  `setup.cmd` verbatim, or any `*-dashboard.cmd` (case-insensitive). A newly
 *  added launcher fails LOUDLY here (manifest mismatch) instead of silently
 *  never running through this smoke test. */
function discoverCmdLaunchers() {
  const isLauncher = (name) =>
    name.toLowerCase() === 'setup.cmd' || name.toLowerCase().endsWith('-dashboard.cmd');
  const dirs = ['.', 'scripts/launchers'];
  const found = [];
  for (const dir of dirs) {
    const abs = join(repoRoot, dir);
    for (const name of readdirSync(abs)) {
      if (isLauncher(name)) found.push(dir === '.' ? name : `${dir}/${name}`);
    }
  }
  return found.sort();
}

/** Expected behavior per launcher — hand-written, not derived, so a change to
 *  a script's actual invocation sequence fails this test until the manifest
 *  is updated to match. `target`/`targetType` name the file real `node.exe`
 *  is pointed at; `nodeInvocations` is one entry per separate `node` call the
 *  launcher makes, each the argv the recorder should see AFTER the script
 *  path (so `['status']`, not `['cli.js', 'status']`). */
const MANIFEST = [
  {
    file: 'SETUP.cmd',
    buildsFirst: false,
    requiresDist: false,
    target: 'scripts/setup.mjs',
    targetType: 'esm',
    nodeInvocations: [[]],
  },
  {
    file: 'START-DASHBOARD.cmd',
    buildsFirst: true,
    requiresDist: false,
    target: 'apps/dashboard/dist/control/cli.js',
    targetType: 'cjs',
    nodeInvocations: [['start']],
  },
  {
    file: 'RESTART-DASHBOARD.cmd',
    buildsFirst: true,
    requiresDist: false,
    target: 'apps/dashboard/dist/control/cli.js',
    targetType: 'cjs',
    nodeInvocations: [['restart']],
  },
  {
    file: 'STOP-DASHBOARD.cmd',
    buildsFirst: false,
    requiresDist: true,
    target: 'apps/dashboard/dist/control/cli.js',
    targetType: 'cjs',
    nodeInvocations: [['stop']],
  },
  {
    file: 'STATUS-DASHBOARD.cmd',
    buildsFirst: false,
    requiresDist: true,
    target: 'apps/dashboard/dist/control/cli.js',
    targetType: 'cjs',
    nodeInvocations: [['status'], ['doctor']],
  },
  {
    file: 'WATCH-DASHBOARD.cmd',
    buildsFirst: true,
    requiresDist: false,
    target: 'apps/dashboard/dist/control/cli.js',
    targetType: 'cjs',
    // No args given: `"%~1"` forwards an empty QUOTED string (kept as one
    // real argv entry), while the unset `%2 %3` vanish entirely.
    nodeInvocations: [['watch', '']],
  },
  {
    file: 'scripts/launchers/DEMO-DASHBOARD.cmd',
    buildsFirst: true,
    requiresDist: false,
    target: 'apps/dashboard/dist/demo.js',
    targetType: 'cjs',
    nodeInvocations: [[]],
  },
  {
    file: 'scripts/launchers/FLY-DASHBOARD.cmd',
    buildsFirst: true,
    requiresDist: false,
    target: 'apps/dashboard/dist/flight.js',
    targetType: 'cjs',
    nodeInvocations: [[]],
  },
];

const PNPM_STUB = (recordFile) =>
  `@echo off\r\necho %* >> "${recordFile}"\r\nif exist "${recordFile}.fail" exit /b 1\r\nexit /b 0\r\n`;

/** Appends its own argv (joined with a space) to `%RECORD_FILE%`, then exits
 *  1 if `%RECORD_FILE%.fail` exists — real `node.exe` running this is what
 *  lets multi-invocation launchers (STATUS-DASHBOARD.cmd) keep control
 *  between calls, unlike a `.cmd` stub would. */
const CJS_RECORDER =
  'const fs=require("fs");const r=process.env.RECORD_FILE;' +
  'fs.appendFileSync(r, process.argv.slice(2).join(" ")+"\\n");' +
  'if(fs.existsSync(r+".fail"))process.exit(1);';
const ESM_RECORDER =
  'import {appendFileSync,existsSync} from "node:fs";const r=process.env.RECORD_FILE;' +
  'appendFileSync(r, process.argv.slice(2).join(" ")+"\\n");' +
  'if(existsSync(r+".fail"))process.exit(1);';

/** Splits into one entry per recorded line, WITHOUT `.filter(Boolean)`: an
 *  empty string is a valid, meaningful invocation here (e.g. SETUP.cmd's
 *  no-arg call, or WATCH-DASHBOARD.cmd's `"%~1"` forwarding an absent first
 *  argument as a literal empty string) — filtering falsy lines would drop
 *  those real invocations instead of just trailing whitespace. */
function readRecord(recordFile) {
  try {
    const raw = readFileSync(recordFile, 'utf8');
    if (raw === '') return [];
    // Each line is LF-terminated (recorder/stub always appends a trailing
    // `\n`); drop the one empty element `split` leaves after that final
    // terminator, and strip a `\r` some Windows batch commands print before
    // it (unlike the recorder's own line endings, `echo` in a `.cmd` stub is
    // CRLF).
    return raw
      .split('\n')
      .slice(0, -1)
      .map((line) => line.replace(/\r$/, ''));
  } catch {
    return [];
  }
}

/** Runs one manifest entry's happy path plus its one relevant guard branch
 *  (build failure short-circuit for a builder, "not built yet" for a
 *  dist-requiring launcher) — each in its own disposable scratch dir. */
function smokeTestLauncher(entry) {
  runScenario(entry, { simulateBuildFailure: false, includeDist: true });
  if (entry.buildsFirst) {
    runScenario(entry, { simulateBuildFailure: true, includeDist: true });
  } else if (entry.requiresDist) {
    runScenario(entry, { simulateBuildFailure: false, includeDist: false });
  }
}

function runScenario(entry, { simulateBuildFailure, includeDist }) {
  const scratch = mkdtempSync(join(tmpdir(), 'autopilot-launcher-smoke-cmd-'));
  try {
    const scriptCopy = join(scratch, entry.file);
    mkdirSync(dirname(scriptCopy), { recursive: true });
    writeFileSync(scriptCopy, readFileSync(join(repoRoot, entry.file)));

    if (includeDist) {
      const targetPath = join(scratch, entry.target);
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, entry.targetType === 'esm' ? ESM_RECORDER : CJS_RECORDER);
    }

    const binDir = join(scratch, 'stubbin');
    mkdirSync(binDir, { recursive: true });
    const nodeRecord = join(scratch, 'node.calls');
    const pnpmRecord = join(scratch, 'pnpm.calls');
    writeFileSync(join(binDir, 'pnpm.cmd'), PNPM_STUB(pnpmRecord));
    if (simulateBuildFailure) writeFileSync(`${pnpmRecord}.fail`, '');

    let exitCode = 0;
    let output = '';
    try {
      output = execFileSync('cmd.exe', ['/c', scriptCopy], {
        cwd: scratch,
        env: {
          ...process.env,
          PATH: `${binDir}${delimiter}${process.env.PATH}`,
          RECORD_FILE: nodeRecord,
        },
        // Closes stdin immediately (equivalent to `< nul`) so every
        // launcher's trailing `pause` returns at once instead of blocking
        // forever on a keypress that will never come.
        input: '',
        encoding: 'utf8',
      });
    } catch (err) {
      exitCode = typeof err.status === 'number' ? err.status : 1;
      output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }

    const nodeCalls = readRecord(nodeRecord);
    const pnpmCalls = readRecord(pnpmRecord);

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
        `${entry.file}: missing ${entry.target} must exit 0 gracefully (nothing to do yet), got ${exitCode}`,
      );
      assert(
        nodeCalls.length === 0,
        `${entry.file}: missing ${entry.target} must never invoke node, saw: ${nodeCalls.join(' | ')}`,
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
    if (entry.buildsFirst) {
      assert(
        // `.trim()` here only: cmd.exe's `echo %*` in the pnpm stub appends
        // a trailing space before the CRLF this platform's `call pnpm run
        // build` doesn't itself write anywhere else, unrelated to the
        // meaningful trailing space in a node invocation line above.
        pnpmCalls.some((c) => c.trim() === 'run build'),
        `${entry.file}: expected \`pnpm run build\` before launching, saw: ${pnpmCalls.join(' | ')}`,
      );
    } else {
      assert(
        pnpmCalls.length === 0,
        `${entry.file}: does not build, but pnpm was invoked: ${pnpmCalls.join(' | ')}`,
      );
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  if (process.platform !== 'win32') {
    console.log('launcher-smoke-cmd: skipped — cmd.exe launchers only run on Windows');
    return;
  }

  const discovered = discoverCmdLaunchers();
  const known = MANIFEST.map((e) => e.file).sort();
  assert(
    JSON.stringify(discovered) === JSON.stringify(known),
    `launcher-smoke-cmd's manifest is out of date — discovered [${discovered.join(', ')}] but the manifest covers [${known.join(', ')}]. Add the new launcher to MANIFEST in scripts/ci/launcher-smoke-cmd.mjs.`,
  );

  for (const entry of MANIFEST) {
    smokeTestLauncher(entry);
    console.log(`launcher-smoke-cmd: ${entry.file} OK`);
  }
  console.log('launcher-smoke-cmd OK');
}

try {
  main();
} catch (err) {
  console.error(`launcher-smoke-cmd FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
