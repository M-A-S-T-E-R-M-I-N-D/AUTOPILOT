// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the Foundation funding panel client
 * (`web/features/foundation.ts`) — mirrors `publicity.test.ts`'s
 * static-source-assertion shape (the generated string is a classic script,
 * never executed under vitest/jsdom here).
 */

import { describe, it, expect } from 'vitest';
import { foundationJs } from '../../../src/web/features/foundation.js';

describe('foundationJs', () => {
  it('declares renderFoundationPanel and loadFoundationPanel', () => {
    const out = foundationJs();
    expect(out).toContain('function renderFoundationPanel(entries) {');
    expect(out).toContain('function loadFoundationPanel() {');
  });

  it('fetches /api/donations on demand', () => {
    expect(foundationJs()).toContain(
      "fetch('/api/donations', { headers: { accept: 'application/json' } })",
    );
  });

  it('self-initializes once — a single loadFoundationPanel() call, no poll timer', () => {
    const out = foundationJs();
    expect(out).toContain('loadFoundationPanel();');
    expect(out).not.toContain('setInterval');
  });

  it('hides the #foundation host whenever there are zero entries', () => {
    expect(foundationJs()).toContain('host.hidden = entries.length === 0;');
  });

  it('renders a copy button wired to the clipboard, localized via tr()', () => {
    const out = foundationJs();
    expect(out).toContain("tr('foundationCopyAddress')");
    expect(out).toContain('navigator.clipboard.writeText(address)');
    expect(out).toContain("tr('foundationCopied')");
  });

  it('embeds the vendored QR library and renders each entry as an inline, local SVG', () => {
    const out = foundationJs();
    expect(out).toContain('var qrcode = function() {');
    expect(out).toContain('function buildQrSvg(text, ariaLabel)');
    expect(out).toContain("qr.addData(text, 'Byte')");
    expect(out).toContain("document.createElementNS('http://www.w3.org/2000/svg', 'svg')");
    expect(out).toContain('row.appendChild(buildQrSvg(entry.address');
    expect(out).not.toContain(".createElement('img'");
  });

  it("localizes the QR's accessible name via tr('foundationQrAlt', ...)", () => {
    expect(foundationJs()).toContain("tr('foundationQrAlt', chainLabel)");
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = foundationJs();
    expect(out).toBe(out.trim());
  });
});
