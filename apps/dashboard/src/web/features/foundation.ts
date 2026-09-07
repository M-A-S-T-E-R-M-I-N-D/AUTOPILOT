// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

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
 * QR rendering (chain-tagged, local, no third-party QR service) is out of
 * scope for this slice — chain tag, address text, and a copy-to-clipboard
 * button are the full expression shipped here.
 */

/** The Foundation panel client — vanilla, external (keeps CSP script-src 'self'). */
export function foundationJs(): string {
  return `
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
    row.appendChild(el('span', 'foundation-chain foundation-chain-' + entry.chain, String(entry.chain).toUpperCase()));
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
