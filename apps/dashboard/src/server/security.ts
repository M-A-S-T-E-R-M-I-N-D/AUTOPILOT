// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Security posture for the localhost dashboard (web/security rules; ACTION-PLAN
 * M3/M8). A strict `default-src 'self'` CSP (the shell serves script/style as
 * separate same-origin files, so no `unsafe-inline`), plus a DNS-rebind guard
 * that only answers requests whose Host is a loopback name.
 */

export function securityHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy':
      "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    // Everything here is live/localhost — never let a browser serve a stale
    // client bundle (a cached /app.js is why a fixed dashboard can still look
    // broken after a restart). Nothing is worth caching.
    'Cache-Control': 'no-store',
  };
}

/** DNS-rebind guard: only loopback Host values are served. */
export function isAllowedHost(host: string | undefined): boolean {
  if (host === undefined) return false;
  // Bracketed IPv6 (e.g. "[::1]" or "[::1]:4317") must be unwrapped before
  // stripping the port — a naive split(':')[0] chops it at the first colon
  // inside the brackets and never matches, even for loopback.
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(host);
  // Stryker disable next-line StringLiteral: both `?? ''` fallbacks are
  // provably unreachable — `bracketed[1]`'s capture group (`[^\]]+`)
  // requires at least one char, so a successful match always populates it;
  // and String.prototype.split always returns a non-empty array, so
  // `[0]` is always defined too.
  const name = (bracketed ? (bracketed[1] ?? '') : (host.split(':')[0] ?? '')).toLowerCase();
  return name === 'localhost' || name === '127.0.0.1' || name === '::1';
}
