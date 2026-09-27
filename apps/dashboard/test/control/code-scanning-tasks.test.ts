// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * CODE-SCANNING ALERTS REACH THE BOARD (operator, 2026-09-27): four high
 * CodeQL alerts sat open for three days because an alert never fails a run.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, setAutoApprove, type Store } from '@autopilot/store';
import {
  alertTaskTitle,
  parseCodeScanningAlerts,
  readOpenCodeScanningAlerts,
  syncCodeScanningTasks,
  type CodeScanningAlert,
} from '../../src/control/code-scanning-tasks.js';

/** One alert as `gh api repos/{repo}/code-scanning/alerts` returns it. */
function apiRow(number: number, line = 202): Record<string, unknown> {
  return {
    number,
    state: 'open',
    rule: {
      id: 'js/incomplete-sanitization',
      security_severity_level: 'high',
      severity: 'warning',
    },
    most_recent_instance: {
      location: {
        path: 'apps/dashboard/test/tooling/generate-donate-doc.test.ts',
        start_line: line,
      },
      message: { text: "This replaces only the first occurrence of '\\['." },
    },
  };
}

describe('parseCodeScanningAlerts', () => {
  it('reads number, rule, severity, place and message from the API rows', () => {
    expect(parseCodeScanningAlerts(JSON.stringify([apiRow(17)]))).toEqual([
      {
        number: 17,
        rule: 'js/incomplete-sanitization',
        severity: 'high',
        path: 'apps/dashboard/test/tooling/generate-donate-doc.test.ts',
        line: 202,
        message: "This replaces only the first occurrence of '\\['.",
      },
    ]);
  });

  it('drops malformed rows and reads non-JSON as no alerts', () => {
    expect(parseCodeScanningAlerts(JSON.stringify([{ number: 'x' }, apiRow(3)]))).toHaveLength(1);
    expect(parseCodeScanningAlerts('not json')).toEqual([]);
    expect(parseCodeScanningAlerts('{"message":"Not Found"}')).toEqual([]);
  });

  it('skips a null or non-object row instead of throwing away every alert around it', () => {
    const alerts = parseCodeScanningAlerts(JSON.stringify([null, apiRow(3), 'nope', 7]));
    expect(alerts.map((a) => a.number)).toEqual([3]);
  });

  it('asks GitHub for open alerts only', () => {
    const gh = vi.fn(() => '[]');
    readOpenCodeScanningAlerts(gh, 'o/r');
    expect(gh).toHaveBeenCalledWith([
      'api',
      'repos/o/r/code-scanning/alerts?state=open&per_page=100',
    ]);
  });
});

describe('syncCodeScanningTasks', () => {
  let dir: string;
  let store: Store;
  const alert = (n: number): CodeScanningAlert =>
    parseCodeScanningAlerts(JSON.stringify([apiRow(n)]))[0]!;
  const tasks = (): { title: string; status: string }[] =>
    store.db.prepare('SELECT title, status FROM tasks ORDER BY title').all() as {
      title: string;
      status: string;
    }[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ap-codescan-'));
    store = openStore(join(dir, 'db.sqlite'));
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'registered', NULL, 1, 1)`,
      )
      .run();
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('files one task per open alert, once, and auto mode sends it straight to the pool', () => {
    setAutoApprove(store, 'p1', true, 1);
    expect(syncCodeScanningTasks(store, 'p1', [alert(16), alert(17)], 10)).toEqual({
      filed: 2,
      closed: 0,
    });
    expect(syncCodeScanningTasks(store, 'p1', [alert(16), alert(17)], 20)).toEqual({
      filed: 0,
      closed: 0,
    });
    expect(tasks()).toEqual([
      { title: alertTaskTitle(alert(16)), status: 'queued' },
      { title: alertTaskTitle(alert(17)), status: 'queued' },
    ]);
    expect(tasks()[0]!.title).toMatch(/^CODE-SCANNING #16 \(high js\/incomplete-sanitization\): /);
  });

  it('closes the task of an alert the scanner no longer reports open', () => {
    syncCodeScanningTasks(store, 'p1', [alert(16), alert(17)], 10);
    expect(syncCodeScanningTasks(store, 'p1', [alert(17)], 20)).toEqual({ filed: 0, closed: 1 });
    expect(tasks().map((t) => t.status)).toEqual(['done', 'needs_approval']);
  });

  it('keeps a long message to one bounded title line', () => {
    const long = { ...alert(1), message: 'x'.repeat(500) };
    expect(alertTaskTitle(long).length).toBeLessThanOrEqual(240);
  });
});
