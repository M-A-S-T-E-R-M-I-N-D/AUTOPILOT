// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE ASK SHEET (epic 0026 slice 3; operator 2026-09-12: "the Ask agent —
 * Architect and Genius — reachable from a floating button, in a side
 * sheet"): one floating action button, bottom trailing, opens Ask as a side
 * sheet from `lg` up and as a bottom sheet below it — the pattern the
 * assistant panels of modern IDEs and office suites use. The page beneath
 * stays live and scrollable (the sheet is non-modal: `aria-modal="false"`,
 * nothing is made inert); Escape or the close button puts everything back.
 *
 * It MOVES the existing search/ask section (`#searchbar` — one input, one
 * Ask button, the persona switch, the streamed answer, the offer and the
 * proposal) into the sheet's body and moves it back on close, so every
 * handler the search and ask clients bound by id keeps working and no state
 * is copied. While the section lives in the sheet its `data-subject` is
 * lifted (and restored on close) so the one-subject-at-a-time rule never
 * hides it there. The open state is remembered for the session
 * (`ap-ask-sheet`) so a reload keeps the sheet where you left it. Every DOM
 * write is guarded (epic 0018 law 3).
 *
 * Core chunk: the button must be there on every page, and the shell renders
 * the button and the empty sheet server-side so nothing pops in.
 */

/** The Ask sheet client — vanilla, external (keeps CSP script-src 'self'). */
export function askSheetJs(): string {
  return `
// THE ASK SHEET (epic 0026 slice 3) — see web/features/ask-sheet.ts.
var ASK_SHEET_KEY = 'ap-ask-sheet';
var askSheetPlaceholder = null;
var askSheetSubject = null;
function askSheetNodes() {
  return {
    fab: document.getElementById('ask-fab'),
    sheet: document.getElementById('ask-sheet'),
    body: document.getElementById('ask-sheet-body'),
    close: document.getElementById('ask-sheet-close'),
    bar: document.getElementById('searchbar'),
  };
}
function askSheetIsOpen() {
  var n = askSheetNodes();
  return !!(n.sheet && !n.sheet.hidden);
}
function askSheetOpen() {
  var n = askSheetNodes();
  if (!n.fab || !n.sheet || !n.body || !n.bar) return;
  if (!n.sheet.hidden) return;
  // Leave a marker where the section stood so close() can put it back
  // exactly there — before whatever sibling followed it.
  askSheetPlaceholder = document.createComment('ask-sheet: searchbar lives in the sheet');
  n.bar.parentNode.insertBefore(askSheetPlaceholder, n.bar);
  askSheetSubject = n.bar.getAttribute('data-subject');
  n.bar.removeAttribute('data-subject');
  n.body.appendChild(n.bar);
  if (n.bar.hidden) n.bar.hidden = false;
  n.sheet.hidden = false;
  n.fab.setAttribute('aria-expanded', 'true');
  if (document.documentElement.getAttribute('data-ask-sheet') !== 'open') {
    document.documentElement.setAttribute('data-ask-sheet', 'open');
  }
  try { sessionStorage.setItem(ASK_SHEET_KEY, 'open'); } catch (e) {}
  var q = document.getElementById('search-q');
  if (q) { try { q.focus(); } catch (e) {} }
}
function askSheetClose(returnFocus) {
  var n = askSheetNodes();
  if (!n.fab || !n.sheet || !n.bar) return;
  if (n.sheet.hidden) return;
  if (askSheetPlaceholder && askSheetPlaceholder.parentNode) {
    askSheetPlaceholder.parentNode.insertBefore(n.bar, askSheetPlaceholder);
    askSheetPlaceholder.parentNode.removeChild(askSheetPlaceholder);
  }
  askSheetPlaceholder = null;
  if (askSheetSubject !== null) n.bar.setAttribute('data-subject', askSheetSubject);
  askSheetSubject = null;
  n.sheet.hidden = true;
  n.fab.setAttribute('aria-expanded', 'false');
  if (document.documentElement.hasAttribute('data-ask-sheet')) {
    document.documentElement.removeAttribute('data-ask-sheet');
  }
  try { sessionStorage.removeItem(ASK_SHEET_KEY); } catch (e) {}
  if (returnFocus) { try { n.fab.focus(); } catch (e) {} }
}
function askSheetToggle() {
  if (askSheetIsOpen()) askSheetClose(true);
  else askSheetOpen();
}
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('#ask-fab')) { e.preventDefault(); askSheetToggle(); return; }
  if (t.closest('#ask-sheet-close')) { e.preventDefault(); askSheetClose(true); }
});
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape' || !askSheetIsOpen()) return;
  var n = askSheetNodes();
  // Only when the sheet holds the focus — Escape elsewhere belongs to
  // whatever owns it (the palette, a popover, the ritual scrim).
  if (n.sheet && document.activeElement && n.sheet.contains(document.activeElement)) {
    e.preventDefault();
    askSheetClose(true);
  }
});
(function askSheetRestore() {
  var remembered = null;
  try { remembered = sessionStorage.getItem(ASK_SHEET_KEY); } catch (e) {}
  if (remembered === 'open') askSheetOpen();
})();
`.trim();
}
