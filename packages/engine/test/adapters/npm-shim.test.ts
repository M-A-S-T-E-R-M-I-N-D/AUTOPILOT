// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { npmShimTarget, resolveNpmShim, type NpmShimFs } from '../../src/adapters/npm-shim.js';

/** The `.cmd` npm/cmd-shim's `writeShim_` (lib/index.js) writes for a bin
 *  whose shebang names `prog` with `args`, its line endings and all. */
function cmdShim(target: string, prog = 'node', args = ''): string {
  const head =
    '@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n' +
    ':start\r\nSETLOCAL\r\nCALL :find_dp0\r\n';
  return (
    head +
    '\r\n' +
    `IF EXIST "%dp0%\\${prog}.exe" (\r\n` +
    `  SET "_prog=%dp0%\\${prog}.exe"\r\n` +
    ') ELSE (\r\n' +
    `  SET "_prog=${prog}"\r\n` +
    ')\r\n' +
    '\r\n' +
    'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & ' +
    `set PATHEXT=%PATHEXT:;.JS;=;% & "%_prog%" ${args} "%dp0%\\${target}" %*\r\n`
  );
}

const CODEX_ENTRY = 'node_modules\\@openai\\codex\\bin\\codex.js';
/** This repo's placeholder home (validate-no-personal-paths.mjs). */
const HOME = 'C:\\Users\\operator';
/** Where npm puts its global bins on Windows. */
const NPM = `${HOME}\\AppData\\Roaming\\npm`;
const SHIM = `${NPM}\\codex.cmd`;
const ENTRY = `${NPM}\\${CODEX_ENTRY}`;
const NODE = `${HOME}\\nodejs\\node.exe`;

/** A filesystem of exactly these files, every read recorded. */
function fakeFs(files: Record<string, string>): NpmShimFs & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    isFile: (path) => Object.hasOwn(files, path),
    readText: (path) => {
      reads.push(path);
      return files[path] ?? null;
    },
  };
}

/** npm's global folder holding a codex install, plus `extra` files. */
function npmInstall(extra: Record<string, string> = {}): ReturnType<typeof fakeFs> {
  return fakeFs({ [SHIM]: cmdShim(CODEX_ENTRY), [ENTRY]: '', ...extra });
}

describe('npmShimTarget', () => {
  it("reads the JS entry out of the shim npm writes for a node bin, relative to the shim's folder", () => {
    expect(npmShimTarget(cmdShim(CODEX_ENTRY))).toBe(CODEX_ENTRY);
  });

  it('reads nothing from a shim whose program is not node, such as a #!/bin/sh bin', () => {
    expect(npmShimTarget(cmdShim('bin\\codex', 'sh'))).toBeNull();
  });

  it('reads nothing from a shim that hands node flags before the entry, which a bare launch would drop', () => {
    expect(npmShimTarget(cmdShim(CODEX_ENTRY, 'node', '--max-old-space-size=4096'))).toBeNull();
  });

  it('reads nothing from the shim npm writes for a bin with no shebang, which runs the file itself', () => {
    const shim =
      '@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n' +
      ':start\r\nSETLOCAL\r\nCALL :find_dp0\r\n"%dp0%\\bin\\codex.exe"   %*\r\n';
    expect(npmShimTarget(shim)).toBeNull();
  });

  it('reads nothing from a batch file that is no npm shim at all', () => {
    expect(npmShimTarget('@echo off\r\ncodex-real.exe %*\r\n')).toBeNull();
  });
});

describe('resolveNpmShim', () => {
  it('launches the entry the first codex.cmd on PATH names, under the node running this process', () => {
    const later = `${HOME}\\later`;
    const fs = npmInstall({ [`${later}\\codex.cmd`]: cmdShim('elsewhere.js') });

    expect(resolveNpmShim('codex', { PATH: `${HOME}\\bin;${NPM};${later}` }, fs, NODE)).toEqual({
      bin: NODE,
      args: [ENTRY],
    });
  });

  it('prefers the node.exe beside the shim, as the shim itself does', () => {
    const fs = npmInstall({ [`${NPM}\\node.exe`]: '' });

    expect(resolveNpmShim('codex', { PATH: NPM }, fs, NODE)?.bin).toBe(`${NPM}\\node.exe`);
  });

  it('defaults the node to process.execPath, never a bare "node" a PATH or cwd lookup would pick', () => {
    expect(resolveNpmShim('codex', { PATH: NPM }, npmInstall())?.bin).toBe(process.execPath);
  });

  it('declines when cmd.exe would run something else first: a codex.exe in an earlier PATH folder', () => {
    const tools = `${HOME}\\tools`;
    const fs = npmInstall({ [`${tools}\\codex.exe`]: '' });

    expect(resolveNpmShim('codex', { PATH: `${tools};${NPM}` }, fs, NODE)).toBeNull();
  });

  it('declines when PATHEXT puts another file of the same folder first', () => {
    const fs = npmInstall({ [`${NPM}\\codex.bat`]: '@echo off' });

    expect(
      resolveNpmShim('codex', { PATH: NPM, PATHEXT: '.COM;.EXE;.BAT;.CMD' }, fs, NODE),
    ).toBeNull();
    expect(resolveNpmShim('codex', { PATH: NPM, PATHEXT: '.CMD;.BAT' }, fs, NODE)).not.toBeNull();
  });

  it('never searches a relative PATH entry, which cmd.exe would resolve against the working directory', () => {
    const fs = npmInstall({
      'tools\\codex.cmd': cmdShim('planted.js'),
      'tools\\planted.js': '',
    });

    const launch = resolveNpmShim('codex', { PATH: `.;tools;${NPM}` }, fs, NODE);

    expect(launch?.args).toEqual([ENTRY]);
    expect(fs.reads).toEqual([SHIM]);
  });

  it('reads PATH under any casing, and an entry wrapped in quotes', () => {
    const spaced = `${HOME}\\Program Files\\npm`;
    const fs = fakeFs({
      [`${spaced}\\codex.cmd`]: cmdShim(CODEX_ENTRY),
      [`${spaced}\\${CODEX_ENTRY}`]: '',
    });

    expect(resolveNpmShim('codex', { Path: `"${spaced}"` }, fs, NODE)?.args).toEqual([
      `${spaced}\\${CODEX_ENTRY}`,
    ]);
  });

  it('declines a shim whose entry is gone (a half-removed install), leaving cmd.exe to report it', () => {
    const fs = fakeFs({ [SHIM]: cmdShim(CODEX_ENTRY) });

    expect(resolveNpmShim('codex', { PATH: NPM }, fs, NODE)).toBeNull();
  });

  it('declines a .cmd that is not an npm node shim, and one it cannot read', () => {
    const notShim = fakeFs({ [SHIM]: '@echo off\r\ncodex-real.exe %*\r\n' });
    const readText = vi.fn(() => null);
    const unreadable: NpmShimFs = { isFile: (path) => path.endsWith('.cmd'), readText };

    expect(resolveNpmShim('codex', { PATH: NPM }, notShim, NODE)).toBeNull();
    expect(resolveNpmShim('codex', { PATH: NPM }, unreadable, NODE)).toBeNull();
    expect(readText).toHaveBeenCalledWith(SHIM);
  });

  it('declines a name that is not bare: a path, or one carrying its own extension', () => {
    const fs = npmInstall();

    for (const name of [`${NPM}\\codex`, './codex', 'codex.cmd', 'codex.exe']) {
      expect(resolveNpmShim(name, { PATH: NPM }, fs, NODE)).toBeNull();
    }
    expect(fs.reads).toEqual([]);
  });

  it('declines when nothing on PATH answers to the name, or there is no PATH', () => {
    const fs = fakeFs({});

    expect(resolveNpmShim('codex', { PATH: `${NPM};${HOME}\\bin` }, fs, NODE)).toBeNull();
    expect(resolveNpmShim('codex', {}, fs, NODE)).toBeNull();
  });
});
