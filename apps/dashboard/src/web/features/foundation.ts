// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { QRCODE_LIB_JS } from '../qrcode-lib.js';

/**
 * The Foundation funding panel client (FOUNDATION 1/3, board
 * web-mtq0rsit-ywz1m7) — the masthead heart (`#foundation`, a `<details>`
 * disclosure like `#connect`/`#notify`) and its body (`#foundation-body`),
 * populated from `GET /api/donations` (`server/donations.ts`'s
 * `handleDonations`, `flight/donations.ts`'s pure core). Stays entirely
 * hidden while that read reports zero entries — `docs/FOUNDATION.md`'s own
 * custody promise ("addresses… published only once verified — never
 * before") means this is the honest default in most installs today, not an
 * edge case. Same self-init, CSP-clean, `tr()`-localized shape as every
 * other `web/features/` module; `discoverFeatureModules` finds `foundationJs`
 * the same way it finds `publicity.ts`'s export. A slow-changing fact once
 * addresses ship (like `publicity.ts`'s repo identity), so this loads once
 * rather than riding a poll timer.
 *
 * QR rendering (chain-tagged, local, no third-party QR service — the earlier
 * slice's deferred item) rides `qrcode-lib.ts`'s trimmed vendor copy: each
 * row builds its own module matrix (`qrcode(0, 'M')` — auto-picks the
 * smallest version that fits, error-correction level M) and hand-draws it as
 * an inline `<svg>` (`buildQrSvg`) instead of upstream's raster/GIF
 * exporters, which this vendor copy dropped entirely. No network request —
 * the matrix comes from the address string already in `entries`.
 */

/** The Foundation panel client — vanilla, external (keeps CSP script-src 'self'). */
export function foundationJs(): string {
  return `
${QRCODE_LIB_JS}
function buildQrSvg(text, ariaLabel) {
  var qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  var count = qr.getModuleCount();
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 ' + count + ' ' + count);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', ariaLabel);
  svg.setAttribute('class', 'foundation-qr');
  var bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', String(count));
  bg.setAttribute('height', String(count));
  bg.setAttribute('fill', '#fff');
  svg.appendChild(bg);
  var d = '';
  for (var r = 0; r < count; r++) {
    for (var c = 0; c < count; c++) {
      if (qr.isDark(r, c)) d += 'M' + c + ',' + r + 'h1v1h-1z';
    }
  }
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', '#000');
  svg.appendChild(path);
  return svg;
}
function renderFoundationPanel(entries) {
  var host = document.getElementById('foundation');
  var body = document.getElementById('foundation-body');
  if (!host || !body) return;
  entries = entries || [];
  body.replaceChildren();
  host.hidden = entries.length === 0;
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var row = el('div', 'foundation-row');
    var chainLabel = String(entry.chain).toUpperCase();
    row.appendChild(el('span', 'foundation-chain foundation-chain-' + entry.chain, chainLabel));
    if (entry.label) row.appendChild(el('span', 'foundation-label', entry.label));
    row.appendChild(el('code', 'foundation-address', entry.address));
    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'foundation-copy';
    copyBtn.textContent = tr('foundationCopyAddress');
    copyBtn.addEventListener('click', function (address, btn, label) {
      return function () {
        if (!navigator.clipboard || !navigator.clipboard.writeText) return;
        navigator.clipboard.writeText(address).then(function () {
          btn.textContent = tr('foundationCopied');
          setTimeout(function () { btn.textContent = label; }, 2000);
        }).catch(function () {});
      };
    }(entry.address, copyBtn, copyBtn.textContent));
    row.appendChild(copyBtn);
    try {
      row.appendChild(buildQrSvg(entry.address, tr('foundationQrAlt', chainLabel)));
    } catch (e) {}
    body.appendChild(row);
  }
}
function loadFoundationPanel() {
  fetch('/api/donations', { headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : { entries: [] }; })
    .then(function (data) { renderFoundationPanel(data && data.entries); })
    .catch(function () {});
}
loadFoundationPanel();
`.trim();
}
