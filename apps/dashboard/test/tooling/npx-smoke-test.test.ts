// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure helpers of scripts/ci/npx-smoke-test.mjs, the gate
 * that packs the dashboard's workspace closure, installs it outside the
 * workspace and boots the installed bin the way `npx` would:
 * workspaceClosure() (which packages get packed), tarballName() (the file
 * `pnpm pack` writes), packedFileOffenders() (the "files" allowlist check),
 * assertShebangIsLf() (the CRLF-shebang check) and buildScratchManifest()
 * (the scratch install's package.json). `main()` itself stays unimported —
 * it shells out to pnpm/npm/npx and boots a real server, same stance
 * validate-configs.test.ts takes for its sibling script. All five helpers
 * are mutation-tested (config/mutation/stryker.ci-npx-smoke-test.config.mjs).
 */
import { describe, it, expect } from 'vitest';
import {
  assertShebangIsLf,
  buildScratchManifest,
  packedFileOffenders,
  tarballName,
  workspaceClosure,
  type WorkspacePackage,
} from '../../../../scripts/ci/npx-smoke-test.mjs';

function pkg(name: string, dependencies?: Record<string, unknown>): WorkspacePackage {
  return {
    dir: `packages/${name.split('/').pop()}`,
    version: '0.54.0',
    pkg: dependencies === undefined ? { name } : { name, dependencies },
  };
}

function registry(...entries: WorkspacePackage[]): Map<string, WorkspacePackage> {
  return new Map(entries.map((e) => [e.pkg.name, e]));
}

describe('workspaceClosure', () => {
  it('returns just the root when it has no dependencies field at all', () => {
    const packages = registry(pkg('@autopilot/dashboard'));
    expect([...workspaceClosure('@autopilot/dashboard', packages)]).toEqual([
      '@autopilot/dashboard',
    ]);
  });

  it('follows workspace: deps transitively, root first, breadth-first', () => {
    const packages = registry(
      pkg('@autopilot/dashboard', {
        '@autopilot/engine': 'workspace:*',
        '@autopilot/store': 'workspace:^',
      }),
      pkg('@autopilot/engine', { '@autopilot/core': 'workspace:*' }),
      pkg('@autopilot/store'),
      pkg('@autopilot/core'),
    );
    expect([...workspaceClosure('@autopilot/dashboard', packages)]).toEqual([
      '@autopilot/dashboard',
      '@autopilot/engine',
      '@autopilot/store',
      '@autopilot/core',
    ]);
  });

  it('skips registry deps — they resolve from npm, never from a local tarball', () => {
    // Not in the workspace map at all: following it would throw "not found".
    const packages = registry(
      pkg('@autopilot/dashboard', {
        'better-sqlite3': '^12.0.0',
        '@autopilot/store': 'workspace:*',
      }),
      pkg('@autopilot/store'),
    );
    expect([...workspaceClosure('@autopilot/dashboard', packages)]).toEqual([
      '@autopilot/dashboard',
      '@autopilot/store',
    ]);
  });

  it('only matches a workspace: PREFIX, not the word anywhere in the range', () => {
    const packages = registry(pkg('@autopilot/dashboard', { 'odd-dep': 'npm:not-workspace:' }));
    expect([...workspaceClosure('@autopilot/dashboard', packages)]).toEqual([
      '@autopilot/dashboard',
    ]);
  });

  it('skips a non-string range instead of crashing on it', () => {
    const packages = registry(pkg('@autopilot/dashboard', { 'broken-dep': 1 }));
    expect([...workspaceClosure('@autopilot/dashboard', packages)]).toEqual([
      '@autopilot/dashboard',
    ]);
  });

  it('visits each package once, so a dependency cycle still terminates', () => {
    const packages = registry(
      pkg('@autopilot/a', { '@autopilot/b': 'workspace:*' }),
      pkg('@autopilot/b', { '@autopilot/a': 'workspace:*' }),
    );
    expect([...workspaceClosure('@autopilot/a', packages)]).toEqual([
      '@autopilot/a',
      '@autopilot/b',
    ]);
  });

  it('throws naming the missing package when a workspace: dep is not in the map', () => {
    const packages = registry(pkg('@autopilot/dashboard', { '@autopilot/gone': 'workspace:*' }));
    expect(() => workspaceClosure('@autopilot/dashboard', packages)).toThrow(
      'workspace package not found: @autopilot/gone',
    );
  });
});

describe('tarballName', () => {
  it('names a scoped package the way pnpm pack does: scope and name joined by a dash', () => {
    expect(tarballName(pkg('@autopilot/dashboard'))).toBe('autopilot-dashboard-0.54.0.tgz');
  });

  it('leaves an unscoped name as-is', () => {
    expect(tarballName({ version: '1.2.3', pkg: { name: 'plain' } })).toBe('plain-1.2.3.tgz');
  });
});

describe('packedFileOffenders', () => {
  it('passes everything under dist/', () => {
    expect(packedFileOffenders(['dist/control/cli.js', 'dist/server/client-bundle.js'])).toEqual(
      [],
    );
  });

  it('passes the files npm always packs: package.json, README and LICENSE (LICENCE too), with or without an extension, in any case', () => {
    expect(
      packedFileOffenders([
        'package.json',
        'README',
        'README.md',
        'readme.markdown',
        'LICENSE',
        'LICENSE.md',
        'LICENCE',
        'LICENCE.txt',
      ]),
    ).toEqual([]);
  });

  it('flags source and config files outside dist/', () => {
    expect(packedFileOffenders(['src/index.ts', 'tsconfig.json', 'dist/cli.js'])).toEqual([
      'src/index.ts',
      'tsconfig.json',
    ]);
  });

  it('flags a dist-looking prefix without the slash', () => {
    expect(packedFileOffenders(['dist-old/cli.js', 'distribution.txt'])).toEqual([
      'dist-old/cli.js',
      'distribution.txt',
    ]);
  });

  it('flags an always-packed NAME nested below the package root', () => {
    expect(packedFileOffenders(['src/README.md', 'docs/LICENSE'])).toEqual([
      'src/README.md',
      'docs/LICENSE',
    ]);
  });

  it('flags a name that merely starts like an always-packed file', () => {
    expect(packedFileOffenders(['package.json.orig', 'README.md/notes.ts', 'LICENSES/x'])).toEqual([
      'package.json.orig',
      'README.md/notes.ts',
      'LICENSES/x',
    ]);
  });
});

describe('assertShebangIsLf', () => {
  const buf = (s: string) => Buffer.from(s, 'utf8');

  it('accepts `#!/usr/bin/env node` ended by a bare LF', () => {
    expect(() =>
      assertShebangIsLf(buf('#!/usr/bin/env node\nimport x;\n'), 'bin.js'),
    ).not.toThrow();
  });

  it('rejects a CRLF shebang line — the OS loader reads `node\\r` as the interpreter', () => {
    expect(() => assertShebangIsLf(buf('#!/usr/bin/env node\r\nimport x;\r\n'), 'bin.js')).toThrow(
      'bin.js: shebang line ends in CRLF, not LF',
    );
  });

  it('rejects a file with no newline at all', () => {
    expect(() => assertShebangIsLf(buf('#!/usr/bin/env node'), 'bin.js')).toThrow(
      'bin.js: no newline found',
    );
  });

  it('rejects an empty first line as "no newline found" (the newline at index 0 is the boundary)', () => {
    expect(() => assertShebangIsLf(buf('\n#!/usr/bin/env node\n'), 'bin.js')).toThrow(
      'bin.js: no newline found',
    );
  });

  it('rejects a first line that is not the node shebang, naming what it found', () => {
    expect(() => assertShebangIsLf(buf('#!/bin/sh\n'), 'bin.js')).toThrow(
      'bin.js: expected a "#!/usr/bin/env node" shebang, got: #!/bin/sh',
    );
  });

  it('rejects a BOM in front of the shebang — `#!` must be the first two bytes', () => {
    expect(() => assertShebangIsLf(buf('\uFEFF#!/usr/bin/env node\n'), 'bin.js')).toThrow(
      /expected a "#!\/usr\/bin\/env node" shebang/,
    );
  });
});

describe('buildScratchManifest', () => {
  it('depends on the dashboard tarball and overrides every other closure member with its own, slashes forward', () => {
    const dashboard = pkg('@autopilot/dashboard', { '@autopilot/store': 'workspace:*' });
    const packages = registry(dashboard, pkg('@autopilot/store'), pkg('@autopilot/engine'));
    const manifest = buildScratchManifest(
      packages,
      dashboard,
      ['@autopilot/dashboard', '@autopilot/store', '@autopilot/engine'],
      // Backslashes, as mkdtempSync hands back on win32 — npm wants `file:`
      // specs with forward slashes on every platform.
      'scratch\\npx-smoke\\pack',
    );
    expect(manifest).toEqual({
      name: 'autopilot-npx-smoke-test-scratch',
      private: true,
      version: '0.0.0',
      dependencies: {
        '@autopilot/dashboard': 'file:scratch/npx-smoke/pack/autopilot-dashboard-0.54.0.tgz',
      },
      overrides: {
        '@autopilot/store': 'file:scratch/npx-smoke/pack/autopilot-store-0.54.0.tgz',
        '@autopilot/engine': 'file:scratch/npx-smoke/pack/autopilot-engine-0.54.0.tgz',
      },
    });
  });
});
