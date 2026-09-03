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
