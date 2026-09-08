// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  engineLockFileName,
  flightLogFileName,
  guardSettingsFileName,
  askEscalationGuardSettingsFileName,
  deriveFlyProjectId,
  readFlightOwnerPid,
  isFlightOwnerAlive,
  isAnyFlightLockLive,
} from '../../src/flight/lock.js';

describe('engineLockFileName', () => {
  it('keys the lockfile name on the project id', () => {
    expect(engineLockFileName('fly-my-app')).toBe('engine-fly-my-app.lock');
  });

  it('produces DIFFERENT lock names for different projects (no cross-project contention)', () => {
    expect(engineLockFileName('fly-app-a')).not.toBe(engineLockFileName('fly-app-b'));
  });

  it('produces the SAME lock name for the same project id every time (same project stays single-instance)', () => {
    expect(engineLockFileName('fly-my-app')).toBe(engineLockFileName('fly-my-app'));
  });

  describe('instanceId (PARALLEL UNLOCK C — N-way same-folder spawn)', () => {
    it('omitting instanceId is byte-for-byte the single-instance name (backward compatible)', () => {
      expect(engineLockFileName('fly-my-app', undefined)).toBe(engineLockFileName('fly-my-app'));
    });

    it('derives a DIFFERENT lock name for two instances of the SAME project (no self-refusal)', () => {
      const a = engineLockFileName('fly-widget', '1');
      const b = engineLockFileName('fly-widget', '2');
      expect(a).not.toBe(b);
      expect(a).not.toBe(engineLockFileName('fly-widget'));
    });

    it('is deterministic for the same project + instance id', () => {
      expect(engineLockFileName('fly-widget', 'a')).toBe(engineLockFileName('fly-widget', 'a'));
    });

    it('sanitizes a path-traversal instance id', () => {
      const name = engineLockFileName('fly-widget', '../../etc/passwd');
      expect(name).not.toContain('..');
      expect(name).not.toContain('/');
    });
  });
});

describe('flightLogFileName', () => {
  it('keys the log file name on the project id', () => {
    expect(flightLogFileName('fly-my-app')).toBe('flight-fly-my-app.log');
  });

  it('produces DIFFERENT log names for different projects (no cross-project interleaving)', () => {
    expect(flightLogFileName('fly-app-a')).not.toBe(flightLogFileName('fly-app-b'));
  });

  it('produces the SAME log name for the same project id every time', () => {
    expect(flightLogFileName('fly-my-app')).toBe(flightLogFileName('fly-my-app'));
  });

  describe('instanceId (PARALLEL UNLOCK C — N-way same-folder spawn)', () => {
    it('omitting instanceId is byte-for-byte the single-instance name (backward compatible)', () => {
      expect(flightLogFileName('fly-my-app', undefined)).toBe(flightLogFileName('fly-my-app'));
    });

    it('derives a DIFFERENT log name for two instances of the SAME project (no interleaving)', () => {
      const a = flightLogFileName('fly-widget', '1');
      const b = flightLogFileName('fly-widget', '2');
      expect(a).not.toBe(b);
      expect(a).not.toBe(flightLogFileName('fly-widget'));
    });
  });
});

describe('guardSettingsFileName', () => {
  it('keys the guard-settings file name on the project id', () => {
    expect(guardSettingsFileName('fly-my-app')).toBe('flight-guard-fly-my-app.settings.json');
  });

  it('produces DIFFERENT guard-settings names for different projects', () => {
    expect(guardSettingsFileName('fly-app-a')).not.toBe(guardSettingsFileName('fly-app-b'));
  });

  it('produces the SAME guard-settings name for the same project id every time', () => {
    expect(guardSettingsFileName('fly-my-app')).toBe(guardSettingsFileName('fly-my-app'));
  });

  describe('instanceId (PARALLEL UNLOCK C — N-way same-folder spawn)', () => {
    it('omitting instanceId is byte-for-byte the single-instance name (backward compatible)', () => {
      expect(guardSettingsFileName('fly-my-app', undefined)).toBe(
        guardSettingsFileName('fly-my-app'),
      );
    });

    it("derives a DIFFERENT guard-settings name for two instances of the SAME project — regression: two concurrent flights against one project must never share a PreToolUse containment-guard settings file, or the last writer silently redirects the other instance's containment target", () => {
      const a = guardSettingsFileName('fly-widget', 'fleet-2');
      const b = guardSettingsFileName('fly-widget', 'fleet-3');
      expect(a).not.toBe(b);
      expect(a).not.toBe(guardSettingsFileName('fly-widget'));
    });

    it('is deterministic for the same project + instance id', () => {
      expect(guardSettingsFileName('fly-widget', 'a')).toBe(
        guardSettingsFileName('fly-widget', 'a'),
      );
    });

    it('sanitizes a path-traversal instance id', () => {
      const traversal = ['..', '..', 'etc', 'passwd'].join(String.fromCharCode(47));
      const name = guardSettingsFileName('fly-widget', traversal);
      expect(name).not.toContain('..');
      expect(name).not.toContain(String.fromCharCode(47));
    });
  });
});

describe('askEscalationGuardSettingsFileName', () => {
  it('keys the guard-settings file name on the project id, under a distinct prefix', () => {
    expect(askEscalationGuardSettingsFileName('fly-my-app')).toBe(
      'ask-escalation-guard-fly-my-app.settings.json',
    );
  });

  it("never collides with a flight's own guardSettingsFileName for the same project id", () => {
    expect(askEscalationGuardSettingsFileName('fly-my-app')).not.toBe(
      guardSettingsFileName('fly-my-app'),
    );
  });

  it('produces DIFFERENT guard-settings names for different projects', () => {
    expect(askEscalationGuardSettingsFileName('fly-app-a')).not.toBe(
      askEscalationGuardSettingsFileName('fly-app-b'),
    );
  });

  it('sanitizes a path-traversal project id', () => {
    const traversal = ['..', '..', 'etc', 'passwd'].join(String.fromCharCode(47));
    const name = askEscalationGuardSettingsFileName(traversal);
    expect(name).not.toContain('..');
    expect(name).not.toContain(String.fromCharCode(47));
  });
});

describe('deriveFlyProjectId', () => {
  it('slugifies the target folder basename with a fly- prefix', () => {
    expect(deriveFlyProjectId('/repos/My Cool App')).toBe('fly-my-cool-app');
  });

  it('is deterministic for the same target path', () => {
    expect(deriveFlyProjectId('/repos/widget')).toBe(deriveFlyProjectId('/repos/widget'));
  });

  it('derives different ids for different target folders', () => {
    expect(deriveFlyProjectId('/repos/widget-a')).not.toBe(deriveFlyProjectId('/repos/widget-b'));
  });
});

describe('readFlightOwnerPid (RUNBOOK §4 — the pid half of isFlightOwnerAlive)', () => {
  function withTmpDir<T>(fn: (dir: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-lock-'));
    try {
      return fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('returns null when no engine lock file exists for the project', () => {
    withTmpDir((dir) => {
      const target = join(dir, 'my-project');
      expect(readFlightOwnerPid(dir, target)).toBeNull();
      expect(isFlightOwnerAlive(dir, target)).toBe(false);
    });
  });

  it('returns the pid when the engine lock records a live pid', () => {
    withTmpDir((dir) => {
      const target = join(dir, 'my-project');
      const lockPath = join(dir, engineLockFileName(deriveFlyProjectId(target)));
      writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));

      expect(readFlightOwnerPid(dir, target)).toBe(process.pid);
      expect(isFlightOwnerAlive(dir, target)).toBe(true);
    });
  });

  it('returns null when the recorded pid is dead', () => {
    withTmpDir((dir) => {
      const target = join(dir, 'my-project');
      const lockPath = join(dir, engineLockFileName(deriveFlyProjectId(target)));
      writeFileSync(lockPath, JSON.stringify({ pid: 999_999_999, startedAt: Date.now() }));

      expect(readFlightOwnerPid(dir, target)).toBeNull();
      expect(isFlightOwnerAlive(dir, target)).toBe(false);
    });
  });

  it('returns null when the lock file contents do not parse', () => {
    withTmpDir((dir) => {
      const target = join(dir, 'my-project');
      const lockPath = join(dir, engineLockFileName(deriveFlyProjectId(target)));
      writeFileSync(lockPath, 'not json');

      expect(readFlightOwnerPid(dir, target)).toBeNull();
    });
  });

  it('keys on instanceId the same way isFlightOwnerAlive does, so a same-folder N-way flight is read from its own lock file', () => {
    withTmpDir((dir) => {
      const target = join(dir, 'my-project');
      const lockPath = join(dir, engineLockFileName(deriveFlyProjectId(target), 'fleet-2'));
      writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));

      expect(readFlightOwnerPid(dir, target)).toBeNull(); // bare key: no lock there
      expect(readFlightOwnerPid(dir, target, 'fleet-2')).toBe(process.pid);
    });
  });
});

describe('isAnyFlightLockLive excludePid (board ap-mtm4qzty-1 slice (a): a flight must not self-match its own just-acquired lock when checking whether a SIBLING already owns the shared primary checkout)', () => {
  function withTmpDir<T>(fn: (dir: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-lock-anylive-'));
    try {
      return fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('returns false with no lock files at all', () => {
    withTmpDir((dir) => {
      const target = join(dir, 'my-project');
      expect(isAnyFlightLockLive(dir, target)).toBe(false);
      expect(isAnyFlightLockLive(dir, target, process.pid)).toBe(false);
    });
  });

  it('returns true for a live lock when no excludePid is given (backward compatible)', () => {
    withTmpDir((dir) => {
      const target = join(dir, 'my-project');
      writeFileSync(
        join(dir, engineLockFileName(deriveFlyProjectId(target))),
        JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
      );
      expect(isAnyFlightLockLive(dir, target)).toBe(true);
    });
  });

  it("excludes the caller's OWN just-acquired lock via excludePid, instead of self-matching it", () => {
    withTmpDir((dir) => {
      const target = join(dir, 'my-project');
      writeFileSync(
        join(dir, engineLockFileName(deriveFlyProjectId(target))),
        JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
      );
      expect(isAnyFlightLockLive(dir, target, process.pid)).toBe(false);
    });
  });

  it("still reports true when a DIFFERENT live pid holds an instanced (fleet sibling) lock, even with excludePid set to the caller's own pid", () => {
    withTmpDir((dir) => {
      const target = join(dir, 'my-project');
      // process.ppid is a real, currently-alive process distinct from our own
      // pid — a stand-in for a live sibling flight's lock.
      const siblingPid = process.ppid;
      writeFileSync(
        join(dir, engineLockFileName(deriveFlyProjectId(target), 'fleet-2')),
        JSON.stringify({ pid: siblingPid, startedAt: Date.now() }),
      );
      expect(isAnyFlightLockLive(dir, target, process.pid)).toBe(true);
    });
  });

  it('returns false when the only lock is stale (dead pid), regardless of excludePid', () => {
    withTmpDir((dir) => {
      const target = join(dir, 'my-project');
      writeFileSync(
        join(dir, engineLockFileName(deriveFlyProjectId(target))),
        JSON.stringify({ pid: 999_999_999, startedAt: Date.now() }),
      );
      expect(isAnyFlightLockLive(dir, target, process.pid)).toBe(false);
    });
  });

  describe('two lock files, one live one dead (slice (d), docs/epics/0002-shell-decomposition.md) — a stale sibling lock left behind by a crashed flight must never mask a genuinely live one, regardless of which entry readdirSync happens to visit first', () => {
    it('finds the live instanced lock even though the bare project lock is dead', () => {
      withTmpDir((dir) => {
        const target = join(dir, 'my-project');
        writeFileSync(
          join(dir, engineLockFileName(deriveFlyProjectId(target))),
          JSON.stringify({ pid: 999_999_999, startedAt: Date.now() }),
        );
        writeFileSync(
          join(dir, engineLockFileName(deriveFlyProjectId(target), 'fleet-2')),
          JSON.stringify({ pid: process.ppid, startedAt: Date.now() }),
        );
        expect(isAnyFlightLockLive(dir, target, process.pid)).toBe(true);
      });
    });

    it('finds the live bare project lock even though an instanced sibling lock is dead', () => {
      withTmpDir((dir) => {
        const target = join(dir, 'my-project');
        writeFileSync(
          join(dir, engineLockFileName(deriveFlyProjectId(target))),
          JSON.stringify({ pid: process.ppid, startedAt: Date.now() }),
        );
        writeFileSync(
          join(dir, engineLockFileName(deriveFlyProjectId(target), 'fleet-2')),
          JSON.stringify({ pid: 999_999_999, startedAt: Date.now() }),
        );
        expect(isAnyFlightLockLive(dir, target, process.pid)).toBe(true);
      });
    });

    it('returns false when BOTH lock files are dead (a dead entry never counts, even alongside another dead one)', () => {
      withTmpDir((dir) => {
        const target = join(dir, 'my-project');
        writeFileSync(
          join(dir, engineLockFileName(deriveFlyProjectId(target))),
          JSON.stringify({ pid: 999_999_998, startedAt: Date.now() }),
        );
        writeFileSync(
          join(dir, engineLockFileName(deriveFlyProjectId(target), 'fleet-2')),
          JSON.stringify({ pid: 999_999_999, startedAt: Date.now() }),
        );
        expect(isAnyFlightLockLive(dir, target, process.pid)).toBe(false);
      });
    });

    it("still finds the live sibling when excludePid matches this flight's OWN lock entry among the two files", () => {
      withTmpDir((dir) => {
        const target = join(dir, 'my-project');
        // This flight's own just-acquired lock — must be excluded, not
        // read as "another dead/live lock happens to sit alongside it".
        writeFileSync(
          join(dir, engineLockFileName(deriveFlyProjectId(target))),
          JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
        );
        writeFileSync(
          join(dir, engineLockFileName(deriveFlyProjectId(target), 'fleet-2')),
          JSON.stringify({ pid: process.ppid, startedAt: Date.now() }),
        );
        expect(isAnyFlightLockLive(dir, target, process.pid)).toBe(true);
      });
    });
  });
});
