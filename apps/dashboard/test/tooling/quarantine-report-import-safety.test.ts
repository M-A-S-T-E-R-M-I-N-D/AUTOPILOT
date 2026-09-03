// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression guard: scripts/ci/quarantine-report.mjs must not run main() as
 * an import side effect. Its sibling scripts/ci/run-all-mutation.mjs guards
 * its main() call with an `isMain` check (process.argv[1] === this file);
 * quarantine-report.mjs lacked that guard, so merely importing it for unit
 * testing (see quarantine-report.test.ts) executed main() for real — reading
 * config/quarantine/flaky-tests.json off disk and, on a malformed entry,
 * calling process.exit(1) mid test run. Isolated in its own file so nothing
 * else imports the module first and masks the side effect.
 */
import { describe, it, expect, vi } from 'vitest';

describe('scripts/ci/quarantine-report.mjs — import safety', () => {
  it('does not execute main() merely by being imported', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await import('../../../../scripts/ci/quarantine-report.mjs');

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
