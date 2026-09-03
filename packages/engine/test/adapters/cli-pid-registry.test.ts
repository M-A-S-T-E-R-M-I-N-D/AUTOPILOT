// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliDescendantRegistry, parseTrackedCliPid } from '../../src/adapters/cli-pid-registry.js';

describe('parseTrackedCliPid', () => {
  it('parses a well-formed entry', () => {
    expect(parseTrackedCliPid('{"ownerPid":123,"startedAt":456}')).toEqual({
      ownerPid: 123,
      startedAt: 456,
    });
  });

  it.each([
    'not json',
    '{}',
    '{"ownerPid":"123","startedAt":456}',
    '{"ownerPid":0,"startedAt":456}',
    '{"ownerPid":-1,"startedAt":1}',
    '{"ownerPid":1.5,"startedAt":1}',
    '{"ownerPid":123,"startedAt":"456"}',
  ])('returns null for unparseable/invalid content: %s', (raw) => {
    expect(parseTrackedCliPid(raw)).toBeNull();
  });
});

describe('CliDescendantRegistry', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-cli-pid-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe('track', () => {
    it('creates one file per tracked pid holding ownerPid + startedAt', () => {
      const registry = new CliDescendantRegistry(
        join(dir, 'orphan-pids'),
        () => true,
        4242,
        () => 1000,
      );
      registry.track(9999);
      const path = join(dir, 'orphan-pids', '9999.json');
      expect(existsSync(path)).toBe(true);
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ ownerPid: 4242, startedAt: 1000 });
    });

    it('two pids tracked by the same owner get two independent files', () => {
      const registry = new CliDescendantRegistry(dir, () => true, 111);
      registry.track(1);
      registry.track(2);
      expect(existsSync(join(dir, '1.json'))).toBe(true);
      expect(existsSync(join(dir, '2.json'))).toBe(true);
    });

    it('never throws when the directory cannot be created (best-effort)', () => {
      // A file where a directory needs to be makes mkdirSync fail — track()
      // must swallow it rather than take down the invocation it's tracking.
      const blocked = join(dir, 'blocked');
      writeFileSync(blocked, 'not a directory');
      const registry = new CliDescendantRegistry(join(blocked, 'nested'));
      expect(() => registry.track(1)).not.toThrow();
    });
  });

  describe('untrack', () => {
    it('removes a previously tracked pid entry', () => {
      const registry = new CliDescendantRegistry(dir, () => true, 111);
      registry.track(7);
      registry.untrack(7);
      expect(existsSync(join(dir, '7.json'))).toBe(false);
    });

    it('is a no-op (never throws) for a pid that was never tracked', () => {
      const registry = new CliDescendantRegistry(dir);
      expect(() => registry.untrack(12345)).not.toThrow();
    });
  });

  describe('sweepStale', () => {
    it('reaps and clears an entry whose owning process is confirmed dead', () => {
      const registry = new CliDescendantRegistry(dir, () => false, 111);
      registry.track(7);
      const reap = vi.fn();

      const count = registry.sweepStale(reap);

      expect(reap).toHaveBeenCalledWith(7);
      expect(count).toBe(1);
      expect(existsSync(join(dir, '7.json'))).toBe(false);
    });

    it('leaves an entry owned by a still-alive process untouched', () => {
      const registry = new CliDescendantRegistry(dir, () => true, 111);
      registry.track(7);
      const reap = vi.fn();

      const count = registry.sweepStale(reap);

      expect(reap).not.toHaveBeenCalled();
      expect(count).toBe(0);
      expect(existsSync(join(dir, '7.json'))).toBe(true);
    });

    it('treats a corrupt entry file as stale and reaps it', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, '7.json'), 'not json at all');
      const registry = new CliDescendantRegistry(dir, () => true, 111);
      const reap = vi.fn();

      expect(registry.sweepStale(reap)).toBe(1);
      expect(reap).toHaveBeenCalledWith(7);
    });

    it('sweeps a mix of dead- and alive-owned entries independently, by pid', () => {
      const isAlive = (pid: number): boolean => pid === 111;
      const registry = new CliDescendantRegistry(dir, isAlive, 111);
      registry.track(1); // owned by 111 (alive) — kept
      const dead = new CliDescendantRegistry(dir, isAlive, 999);
      dead.track(2); // owned by 999 (dead) — reaped
      const reap = vi.fn();

      expect(registry.sweepStale(reap)).toBe(1);
      expect(reap).toHaveBeenCalledWith(2);
      expect(reap).not.toHaveBeenCalledWith(1);
      expect(existsSync(join(dir, '1.json'))).toBe(true);
      expect(existsSync(join(dir, '2.json'))).toBe(false);
    });

    it('returns 0 and never throws when the directory was never created', () => {
      const registry = new CliDescendantRegistry(join(dir, 'never-created'));
      const reap = vi.fn();
      expect(registry.sweepStale(reap)).toBe(0);
      expect(reap).not.toHaveBeenCalled();
    });

    it('ignores non-entry files in the same directory', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'README.md'), 'not a pid entry');
      const registry = new CliDescendantRegistry(dir, () => false, 111);
      const reap = vi.fn();
      expect(registry.sweepStale(reap)).toBe(0);
      expect(reap).not.toHaveBeenCalled();
    });
  });

  it('a full track/untrack cycle across a crash-free invocation leaves nothing for sweepStale', () => {
    const registry = new CliDescendantRegistry(dir, () => false, 111);
    registry.track(7);
    registry.untrack(7);
    const reap = vi.fn();
    expect(registry.sweepStale(reap)).toBe(0);
    expect(reap).not.toHaveBeenCalled();
  });
});
