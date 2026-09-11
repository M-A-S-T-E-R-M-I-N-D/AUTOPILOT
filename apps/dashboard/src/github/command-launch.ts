// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Turns a bare command name into something Windows' CreateProcess can actually
 * start.
 *
 * `pnpm`, `npm`, `yarn` and `claude` all install as `.CMD` batch shims on
 * Windows. CreateProcess cannot launch a batch file, so `execFile('pnpm', …)`
 * fails with errno `ENOENT` and an EMPTY stderr — which is how the
 * over-the-air update came to report a bare "pnpm install failed" that named
 * nothing and pointed nowhere. `git` kept working the whole time because it
 * ships a real `git.exe`, so the failure read as "pnpm is broken" rather than
 * "we cannot start batch shims".
 *
 * Only a shim that genuinely cannot be started directly earns the cmd.exe
 * detour. This resolution feeds `realRunner`, which is shared with calls that
 * pass user-derived values (branch and repo names) — cmd.exe would re-parse
 * those, `execFile` does not, so routing everything through a command
 * processor would buy one fix and sell a quoting hazard.
 *
 * Kept pure, with `platform`/`env`/`exists` injected: the defect does not exist
 * on POSIX, so a test that only exercised the host's real behaviour would prove
 * nothing on the machines where it actually bites.
 */

import { win32 as pathWin32 } from 'node:path';

export interface LaunchProbe {
  readonly platform: NodeJS.Platform;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** True when a concrete path names an existing file. */
  readonly exists: (path: string) => boolean;
}

/** What to hand `execFile` — never a shell string. */
export interface Launch {
  readonly file: string;
  readonly args: readonly string[];
}

/** Extensions CreateProcess refuses: they need a command processor. */
const BATCH_SHIM = /\.(cmd|bat)$/i;

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

/** Windows environment names are case-insensitive (`Path`, `PATH`, `ComSpec`,
 *  `COMSPEC` are all the same variable); a plain injected object is not. */
function envValue(env: LaunchProbe['env'], name: string): string | undefined {
  const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : env[key];
}

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/** The concrete file Windows would start for `command`, or undefined when
 *  nothing on PATH matches — searched the way Windows itself searches: each
 *  PATH directory in turn, each PATHEXT extension within it. */
function resolveOnWindows(command: string, probe: LaunchProbe): string | undefined {
  const extensions = splitList(envValue(probe.env, 'PATHEXT'));
  const pathext = extensions.length > 0 ? extensions : splitList(DEFAULT_PATHEXT);
  const spelledWithDirectory = command.includes(pathWin32.sep) || command.includes('/');
  const directories = spelledWithDirectory ? [''] : splitList(envValue(probe.env, 'PATH'));

  for (const directory of directories) {
    const base = directory === '' ? command : pathWin32.join(directory, command);
    // A command spelled with its own extension is tried exactly as written —
    // appending PATHEXT to `pnpm.cmd` would look for `pnpm.cmd.exe`.
    const carriesExtension = pathext.some((ext) => base.toLowerCase().endsWith(ext.toLowerCase()));
    const candidates = carriesExtension ? [base] : pathext.map((ext) => base + ext);
    for (const candidate of candidates) {
      if (probe.exists(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * How to launch `command` with `args` on this platform.
 *
 * An unresolvable command is handed back untouched rather than rewritten into
 * a guess: inventing a path would turn a plain "not installed" into a
 * confusing "cannot start <fabricated path>", and `execFile`'s own errno is
 * the better message.
 */
export function commandLaunch(
  command: string,
  args: readonly string[],
  probe: LaunchProbe,
): Launch {
  if (probe.platform !== 'win32') return { file: command, args: [...args] };

  const resolved = resolveOnWindows(command, probe);
  if (resolved === undefined) return { file: command, args: [...args] };
  if (!BATCH_SHIM.test(resolved)) return { file: resolved, args: [...args] };

  const comspec = envValue(probe.env, 'ComSpec') ?? 'cmd.exe';
  // `/d` skips AutoRun commands from the registry, `/s` keeps cmd from
  // stripping quotes around the path it is handed, `/c` runs and exits.
  return { file: comspec, args: ['/d', '/s', '/c', resolved, ...args] };
}
