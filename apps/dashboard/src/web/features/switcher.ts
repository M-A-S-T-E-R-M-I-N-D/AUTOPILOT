// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The theme switcher — the first of `web/shell.ts`'s five bundle-composing
 * assembler functions extracted into its own file under `web/features/`
 * (epic 0002 "shell decomposition", PARALLEL UNLOCK B's real extraction —
 * see docs/epics/0002-shell-decomposition.md). Unlike the pure helpers
 * `fleetJs()` embeds via `.toString()`, `switcherJs()` is itself an
 * assembler: `web/shell.ts`'s `clientJs()` imports and calls it directly, so
 * its return value — not its compiled source — is what lands in the served
 * `/app.js` text. Moving the function itself (not splicing it) is therefore
 * zero behavior change. `discoverFeatureModules('web/features')` finds this
 * file's `switcherJs` export the same way it already finds `shell.ts`'s own
 * assembler-shaped functions — proof a feature module can now be a new file
 * under `features/`, not only an edit to `shell.ts`.
 */
import { THEME_NAMES } from '@autopilot/tokens';

/** The theme switcher — vanilla, external (keeps CSP script-src 'self'). */
export function switcherJs(): string {
  const names = JSON.stringify(THEME_NAMES);
  return `
const THEMES = ${names};
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('ap-theme', t); } catch {}
  document.querySelectorAll('[data-theme-btn]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.themeBtn === t));
  });
}
let savedTheme = null;
try { savedTheme = localStorage.getItem('ap-theme'); } catch {}
if (savedTheme && THEMES.includes(savedTheme)) applyTheme(savedTheme);
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-theme-btn]');
  if (b) applyTheme(b.dataset.themeBtn);
});
`.trim();
}
