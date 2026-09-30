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

  it('disclaims the powerful browser features the dashboard never uses', () => {
    const h = securityHeaders();
    // Permissions-Policy empty allowlists: no origin, not even our own, can
    // ask the browser for a location fix, a camera, a microphone or a USB
    // device from a dashboard page — nothing in the client needs them, so a
    // future script (or a CSP slip) gets no prompt to abuse.
    expect(h['Permissions-Policy']).toBe('camera=(), geolocation=(), microphone=(), usb=()');
  });

  it('leaves clipboard-write at its default so the copy buttons keep working', () => {
    const h = securityHeaders();
    // report-menu.ts and foundation.ts copy via navigator.clipboard.writeText;
    // an explicit `clipboard-write=()` would silently break both, so the
    // policy must never name that feature.
    expect(h['Permissions-Policy']).not.toContain('clipboard');
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
