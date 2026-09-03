// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { securityHeaders, isAllowedHost } from '../../src/server/security.js';

describe('security', () => {
  it('sets a strict CSP and hardening headers', () => {
    const h = securityHeaders();
    expect(h['Content-Security-Policy']).toContain("default-src 'self'");
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Referrer-Policy']).toBe('no-referrer');
    expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin');
    // No caching: a stale /app.js must never survive a restart.
    expect(h['Cache-Control']).toBe('no-store');
  });

  it('allows only loopback hosts (DNS-rebind guard)', () => {
    expect(isAllowedHost('localhost:4317')).toBe(true);
    expect(isAllowedHost('127.0.0.1')).toBe(true);
    expect(isAllowedHost('evil.example.com')).toBe(false);
    expect(isAllowedHost(undefined)).toBe(false);
  });

  it('allows bracketed IPv6 loopback hosts, with or without a port', () => {
    expect(isAllowedHost('[::1]')).toBe(true);
    expect(isAllowedHost('[::1]:4317')).toBe(true);
    expect(isAllowedHost('[::2]:4317')).toBe(false);
  });

  it('requires the bracketed form to span the whole host, not just contain it', () => {
    // A bracketed loopback trailing other text must not sneak past the
    // start/end anchors — e.g. an attacker-controlled Host header that
    // merely embeds "[::1]" inside a larger, non-loopback string.
    expect(isAllowedHost('evil[::1]')).toBe(false);
    expect(isAllowedHost('[::1]evil')).toBe(false);
  });
});
