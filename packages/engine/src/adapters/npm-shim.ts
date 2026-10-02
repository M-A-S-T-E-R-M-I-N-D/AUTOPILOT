// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * A route past `cmd.exe` for a CLI npm installed on Windows (epic 0036,
 * docs/epics/0036-provider-parity.md, finding 3).
 *
 * npm installs a bin there as a `<name>.cmd` shim, which `execFile` cannot
 * launch itself (ENOENT), so `gate.ts`'s `buildInvocation` runs a bare name
 * through `cmd.exe /c`. That route parses every argument as cmd.exe syntax,
 * which is why the CLI adapters refuse any argument outside `CMD_SAFE_ARG`.
 * But the shim only runs node on a JS entry: npm/cmd-shim's `writeShim_`
 * (lib/index.js) writes, for a bin whose shebang names `node`,
 *
 *     IF EXIST "%dp0%\node.exe" ( SET "_prog=%dp0%\node.exe" ) ELSE ( SET "_prog=node" )
 *     … & "%_prog%"  "%dp0%\<entry>" %*
 *
 * where `%dp0%` is the shim's own folder. {@link resolveNpmShim} reads that
 * entry and hands back node and the entry as a direct launch, so argv reaches
 * the CLI as given: `@openai/codex`'s `bin/codex.js` spawns its native binary
 * with `process.argv.slice(2)` and no shell.
 *
 * It finds the shim the way cmd.exe would, folder by folder along PATH, each
 * in PATHEXT order, and declines (null) whenever cmd.exe would run anything
 * else, so the caller keeps its `cmd.exe /c` route for every shape this does
 * not read. cmd.exe searches `.;%PATH%` unless NoDefaultCurrentDirectoryInExePath
 * is set (learn.microsoft.com, NeedCurrentDirectoryForExePathW); this walks
 * absolute PATH folders only, so a shim planted in the working directory, a
 * flight's target, is never what a resolved launch runs.
 */

import { readFileSync, statSync } from 'node:fs';
import { win32 } from 'node:path';

/** The file reads {@link resolveNpmShim} makes, injectable so its search is
 *  provable on any machine. `readText` is null for a file it cannot read. */
export interface NpmShimFs {
  readonly isFile: (path: string) => boolean;
  readonly readText: (path: string) => string | null;
}

/** A process to spawn directly, with no shell: node, then the entry. */
export interface NodeLaunch {
  readonly bin: string;
  readonly args: readonly string[];
}

const NODE_FS: NpmShimFs = {
  isFile: (path) => {
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  },
  readText: (path) => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  },
};

/** cmd.exe's own PATHEXT when the environment sets none. */
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

/** The program a node shim runs: `node.exe` beside it, else `node`. */
const NODE_PROG_RE = /^IF EXIST "%dp0%\\node\.exe" \(/im;

/** The run line: the program, then the entry with nothing between them. A
 *  shim that hands node flags first fails this, since a bare launch would
 *  drop them. */
const RUN_LINE_RE = /"%_prog%"\s+"%dp0%\\([^"\r\n]+)"\s+%\*/;

/** The entry, relative to the shim's folder, that an npm `.cmd` shim runs
 *  under node — or null for any other shape (a non-node shebang, node flags,
 *  a bin with no shebang, a batch file npm never wrote). */
export function npmShimTarget(shimText: string): string | null {
  if (!NODE_PROG_RE.test(shimText)) return null;
  return RUN_LINE_RE.exec(shimText)?.[1] ?? null;
}

/** An environment variable by name, under any casing: a copy of Windows'
 *  `process.env` keeps `Path` as the OS spelled it. */
function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const key = Object.keys(env).find((k) => k.toUpperCase() === name);
  return key === undefined ? undefined : env[key];
}

/** The absolute PATH folders, in order, quotes stripped. */
function pathFolders(env: NodeJS.ProcessEnv): string[] {
  return (envValue(env, 'PATH') ?? '')
    .split(';')
    .map((dir) => dir.trim().replace(/^"(.*)"$/, '$1'))
    .filter((dir) => dir !== '' && win32.isAbsolute(dir));
}

/** The first file cmd.exe would find for a bare `name`, PATH folders only. */
function firstOnPath(name: string, env: NodeJS.ProcessEnv, fs: NpmShimFs): string | null {
  const exts = (envValue(env, 'PATHEXT') ?? DEFAULT_PATHEXT).split(';').filter((e) => e !== '');
  for (const dir of pathFolders(env)) {
    for (const ext of exts) {
      const candidate = win32.join(dir, name + ext.toLowerCase());
      if (fs.isFile(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * The direct launch of npm's `.cmd` shim for a bare `name`, or null when the
 * caller should keep its `cmd.exe /c` route: a name with a path or extension,
 * nothing on PATH, a first match that is not a `.cmd`, a `.cmd` npm did not
 * write for node, or an entry that is gone. Node is the `node.exe` beside the
 * shim when there is one, as in the shim, else `nodePath` (the node running
 * this process) rather than a bare `node` a PATH lookup would pick.
 */
export function resolveNpmShim(
  name: string,
  env: NodeJS.ProcessEnv,
  fs: NpmShimFs = NODE_FS,
  nodePath: string = process.execPath,
): NodeLaunch | null {
  if (!/^[\w-]+$/.test(name)) return null;
  const shim = firstOnPath(name, env, fs);
  if (shim === null || win32.extname(shim).toLowerCase() !== '.cmd') return null;
  const text = fs.readText(shim);
  const target = text === null ? null : npmShimTarget(text);
  if (target === null) return null;
  const dir = win32.dirname(shim);
  const entry = win32.join(dir, target);
  if (!fs.isFile(entry)) return null;
  const localNode = win32.join(dir, 'node.exe');
  return { bin: fs.isFile(localNode) ? localNode : nodePath, args: [entry] };
}
