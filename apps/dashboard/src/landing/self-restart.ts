// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The "rebuild + graceful restart" half of Landing EXECUTE v3
 * (web-msnqeegt-ki7dm0) — deferred by the two prior slices (engine
 * gate-then-merge, then the CSRF-guarded HTTP endpoint). Only meaningful for
 * self-hosting: an external project the dashboard merely watches has nothing
 * to restart, but when the LANDED project IS the folder this dashboard is
 * running from (AUTOPILOT flying itself — dogfooding, MASTER-PLAN §18.1), the
 * server's in-memory code is now stale relative to the branch it just merged
 * into main and needs a rebuild + process swap to actually serve it.
 *
 * This does NOT go through `DashboardControl.restart()` (stop-by-pid, then
 * start) — that pairing only works when the caller and the process being
 * replaced are different (e.g. the CLI restarting a detached server it did
 * not itself run inside of, exercised in control.test.ts's "restart replaces
 * the process"). Called from WITHIN the process it is replacing, that
 * pairing is broken: `stop()` signals our OWN pid, but a self-delivered
 * signal can't be handled until the current synchronous call finishes — so
 * `start()` always spawns the replacement while we are still bound to the
 * port, guaranteeing its `listen()` fails with EADDRINUSE and it crashes,
 * right before the signal handler finally runs and this process exits too.
 * Net result: nobody is left listening (web-msorbwfl-zzcw87 — "says
 * restarting:true, kills the server, new process never binds").
 *
 * The fix is to never signal ourselves at all: release our own listening
 * socket in-process first (`stopSelf`, a plain `server.close()` — no kill,
 * no race), THEN spawn the replacement onto the now-free port, THEN poll its
 * health before trusting it, THEN exit. Still fire-and-forget from the
 * caller's perspective (the landing-execute response is never held open on
 * this), but no longer a silent lie about whether anything is actually
 * serving afterward.
 */

import { spawn } from 'node:child_process';
import { waitForHealth } from '../ready.js';

/** Runs the rebuild; resolves `true` only on a clean (exit-0) build. */
export interface BuildRunner {
  run(): Promise<boolean>;
}

/** The process-swap side. `stopSelf` releases the port THIS process holds
 *  in-process (never a signal); `start` spawns the replacement — the
 *  `DashboardControl` instance already used elsewhere satisfies `start`
 *  directly. */
export interface RestartTarget {
  stopSelf(): Promise<void>;
  start(): { readonly url: string | null };
}

/** Test/DI seams — production code omits both and gets the real health
 *  poll (`GET {url}/api/health`) and the real `process.exit`. */
export interface SelfRestartDeps {
  readonly verifyHealth?: (url: string) => Promise<boolean>;
  readonly exit?: (code: number) => void;
}

export type SelfRestartTrigger = () => void;

/** True when spawning `bin` on `platform` needs `shell: true`: Windows batch
 *  shims (`pnpm.cmd`, `*.bat`) can no longer be spawned directly — Node throws
 *  a synchronous EINVAL (the CVE-2024-27980 hardening). Safe here because both
 *  `bin` and `args` are repo-owned constants, never user input. */
export function needsShell(bin: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
}

/** Real `BuildRunner`: spawns `bin args...` in `cwd`, ignoring its stdio (the
 *  dashboard's own log capture isn't wired here — a failed rebuild simply
 *  skips the restart, leaving the current, still-working server running). */
export function createBuildRunner(bin: string, args: readonly string[], cwd: string): BuildRunner {
  return {
    run: () =>
      new Promise((resolve) => {
        try {
          const child = spawn(bin, [...args], {
            cwd,
            stdio: 'ignore',
            windowsHide: true,
            shell: needsShell(bin),
          });
          child.on('exit', (code) => resolve(code === 0));
          child.on('error', () => resolve(false));
        } catch {
          // spawn can ALSO fail synchronously (empty bin; Windows EINVAL on a
          // .cmd shim). Same contract as the async 'error' path: a rebuild
          // that can't launch is a failed build, never a crashed server.
          resolve(false);
        }
      }),
  };
}

/** Builds a fire-and-forget trigger: rebuild first, restart only once the
 *  build actually succeeded — never swap in a server that won't start. Once
 *  it does: release our own port, spawn the replacement, verify it actually
 *  answers before exiting — a build+respawn that never binds is reported
 *  (nonzero exit, stderr), not swallowed. */
export function createSelfRestartTrigger(
  build: BuildRunner,
  target: RestartTarget,
  deps: SelfRestartDeps = {},
): SelfRestartTrigger {
  const verifyHealth = deps.verifyHealth ?? ((url: string) => waitForHealth(`${url}/api/health`));
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  return () => {
    void build.run().then(
      async (ok) => {
        if (!ok) return;
        let portReleased = false;
        try {
          await target.stopSelf();
          portReleased = true;
          const status = target.start();
          const verified = status.url !== null && (await verifyHealth(status.url));
          if (!verified) {
            process.stderr.write(
              '[self-restart] rebuild landed but the respawned server never answered its health check — start it manually.\n',
            );
          }
          exit(verified ? 0 : 1);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          process.stderr.write(`[self-restart] restart failed: ${message}\n`);
          // Port still held ⇒ we are still serving; stay alive. Port already
          // released ⇒ nobody serves either way — exit nonzero so a
          // supervisor (or the operator) knows to start a fresh one.
          if (portReleased) exit(1);
        }
      },
      (error: unknown) => {
        // A rejecting BuildRunner must degrade exactly like a failed build.
        // Before this handler existed, one synchronous spawn throw (Windows
        // EINVAL on `pnpm.cmd`) became an unhandled rejection that killed the
        // SERVER — taking the in-flight child process down with it.
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(
          `[self-restart] rebuild failed to launch: ${message} — keeping the current server.\n`,
        );
      },
    );
  };
}
