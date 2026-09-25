// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE SNACKBAR (epic 0031): one transient message surface for every
 * interaction that has an outcome but no place of its own to say it. Until
 * now an outcome either wrote into the nearest inline status line — where a
 * long sentence wrapped into the layout and pushed the page around (the
 * operator, 2026-09-14: the Lucky roll's paragraph "with strange line
 * breaks") — or said nothing at all.
 *
 * Laws:
 * 1. ONE PLACE. Every snack appears in the same host at the bottom of the
 *    viewport, above the phone's nav bar and inside the safe area. Nothing
 *    in the page moves when one appears.
 * 2. SHORT AND WHOLE. A snack is one sentence. Detail belongs in the panel
 *    the interaction owns; a snack may carry ONE action that goes there.
 * 3. IT LEAVES ON ITS OWN, BUT NEVER MID-READ. It dismisses after its
 *    timeout, the timer pauses while the pointer is over it or focus is
 *    inside it, and a close button ends it at once.
 * 4. ANNOUNCED, NOT STOLEN. The host is a polite live region; a failure is
 *    `role="alert"`. Focus never moves on its own — a snack is never a
 *    dialog.
 * 5. AT MOST THREE. Beyond three the oldest goes, so the stack can never
 *    become a wall.
 *
 * Core chunk: every page can raise one.
 */

/** How long a snack stays, by kind (ms). A failure gets longer to read. */
export const SNACK_TIMEOUT_MS = 6000;
export const SNACK_ERROR_TIMEOUT_MS = 11000;
/** Beyond this the oldest snack is dropped, never stacked. */
export const SNACK_MAX = 3;

/** The snackbar client — vanilla, external (keeps CSP script-src 'self'). */
export function snackbarJs(): string {
  return `
// THE SNACKBAR (epic 0031) — see web/features/snackbar.ts.
var SNACK_TIMEOUT_MS = ${SNACK_TIMEOUT_MS};
var SNACK_ERROR_TIMEOUT_MS = ${SNACK_ERROR_TIMEOUT_MS};
var SNACK_MAX = ${SNACK_MAX};
function snackHost() {
  return document.getElementById('snackbar-host');
}
function snackDismiss(node) {
  if (!node || !node.parentNode) return;
  if (node.dataset.snackTimer) { clearTimeout(Number(node.dataset.snackTimer)); delete node.dataset.snackTimer; }
  node.parentNode.removeChild(node);
}
function snackArm(node, ms) {
  if (node.dataset.snackTimer) clearTimeout(Number(node.dataset.snackTimer));
  node.dataset.snackTimer = String(setTimeout(function () { snackDismiss(node); }, ms));
}
/** One sentence, one optional action. kind: '' | 'ok' | 'warn' | 'err'. */
function snack(text, kind, action) {
  var host = snackHost();
  if (!host || !text) return null;
  while (host.children.length >= SNACK_MAX) snackDismiss(host.firstElementChild);
  var node = document.createElement('div');
  node.className = 'snack' + (kind ? ' snack-' + kind : '');
  // A failure interrupts; everything else waits its turn in the polite host.
  if (kind === 'err') node.setAttribute('role', 'alert');
  var line = document.createElement('span');
  line.className = 'snack-text';
  line.textContent = text;
  node.appendChild(line);
  if (action && action.label && typeof action.run === 'function') {
    var act = document.createElement('button');
    act.type = 'button';
    act.className = 'snack-action';
    act.textContent = action.label;
    act.addEventListener('click', function () { snackDismiss(node); action.run(); });
    node.appendChild(act);
  }
  var close = document.createElement('button');
  close.type = 'button';
  close.className = 'snack-close';
  close.setAttribute('aria-label', tr('snackDismiss'));
  close.appendChild(iconEl('x'));
  close.addEventListener('click', function () { snackDismiss(node); });
  node.appendChild(close);
  var ms = kind === 'err' ? SNACK_ERROR_TIMEOUT_MS : SNACK_TIMEOUT_MS;
  // Law 3: never mid-read — the pointer or the keyboard holds it open.
  node.addEventListener('mouseenter', function () { if (node.dataset.snackTimer) { clearTimeout(Number(node.dataset.snackTimer)); delete node.dataset.snackTimer; } });
  node.addEventListener('mouseleave', function () { snackArm(node, ms); });
  node.addEventListener('focusin', function () { if (node.dataset.snackTimer) { clearTimeout(Number(node.dataset.snackTimer)); delete node.dataset.snackTimer; } });
  node.addEventListener('focusout', function () { snackArm(node, ms); });
  host.appendChild(node);
  snackArm(node, ms);
  return node;
}
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  var host = snackHost();
  if (!host || !host.children.length) return;
  var inside = document.activeElement && host.contains(document.activeElement);
  if (inside) snackDismiss(document.activeElement.closest('.snack'));
});
`.trim();
}
