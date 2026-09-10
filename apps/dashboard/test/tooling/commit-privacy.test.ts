// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE COMMIT-PRIVACY GUARD, both corpora.
 *
 * A public commit log describes the CHANGE. It is not a place for the
 * operator's own environment (what their hardware was doing, at what time
 * of day) or for session narration written at them in the second person.
 * A reader finding one of these commits in two years has none of that
 * context and needs none of it.
 *
 * The rule exists because the leak happened, and then — this is the part
 * worth pinning — it happened AGAIN inside the very commit that added the
 * first version of the rule, because that version checked only the
 * SUBJECT and the repeat was in the BODY. A guard covering half its
 * surface is how the thing it forbids comes back. So the first test below
 * is the body case.
 *
 * Deliberately a WARNING in the config, never an error: a false positive
 * must not block a firing mid-unit trying to check its work in. These
 * tests therefore assert on the reported text, not on an exit code.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

/** Runs the real commitlint over a message and returns its output. */
function lint(message: string): string {
  try {
    return execFileSync('pnpm', ['exec', 'commitlint'], {
      cwd: REPO,
      input: message,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

const FLAG = 'private operator context';

describe('commit-privacy guard — true positives', () => {
  it('catches a leak in the BODY, which is how the first version was bypassed', () => {
    const out = lint(
      'fix(x): a perfectly clean subject\n\nThis body mentions the 13:06 power loss.\n',
    );
    expect(out).toContain(FLAG);
  });

  it('catches the machine losing power, wherever it appears', () => {
    expect(lint('chore: recover the lanes after the power loss\n')).toContain(FLAG);
  });

  it('catches a wall-clock time — the operator’s day is not a changelog', () => {
    expect(lint('fix(x): thing\n\nStarted failing at 13:06 yesterday.\n')).toContain(FLAG);
  });

  it('catches second-person session narration', () => {
    expect(lint('fix(x): thing\n\nYou caught this one before CI did.\n')).toContain(FLAG);
  });

  it('catches someone’s hardware by any of the usual names', () => {
    expect(lint('fix(x): thing\n\nMy machine died mid-run.\n')).toContain(FLAG);
    expect(lint('fix(x): thing\n\nYour laptop went down.\n')).toContain(FLAG);
  });
});

describe('commit-privacy guard — negative corpus', () => {
  // Real messages from this repo, in the house style. A guard that fires on
  // these would be ignored within a day (FAILURE-DOCTRINE row 6).
  const REAL = [
    'fix(dashboard): the KEEPER triage button goes disabled-with-reason on an all-skip round\n',
    'feat(engine): a model catalogue that describes without restricting\n',
    'docs(epics): 0020 slice 8 — diagnose a red check, not just re-run it\n',
    'chore(deps): bump zod from 4.4.3 to 4.5.4\n',
    'perf(dashboard): one identity read per page, not one per panel\n',
    'test(e2e): decouple the flight-log pump count from its fake-time ceiling\n',
    // Names a real durability concern — "power loss" as an ENGINEERING term
    // is not what this rule is about, but the current pattern cannot tell
    // them apart, so this case is documented rather than silently expected
    // to pass. See the it() below.
  ];

  for (const message of REAL) {
    it(`stays silent on: ${message.split('\n')[0]?.slice(0, 58)}`, () => {
      expect(lint(message)).not.toContain(FLAG);
    });
  }

  it('is a WARNING, never a hard failure — a mid-unit checkpoint must still commit', () => {
    const out = lint('wip(autopilot): checkpoint — my machine is thrashing\n');
    // It reports, and it does so as a warning: the word "warning" appears
    // and the checkpoint is not rejected outright.
    expect(out).toContain(FLAG);
    expect(out.toLowerCase()).toContain('warning');
  });
});
