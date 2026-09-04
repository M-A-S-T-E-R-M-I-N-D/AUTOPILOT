// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Layout CSS on top of the token custom properties (makes the themes
 * visible) — served at `GET /tokens.css` (see `server/routes.ts`) alongside
 * the token stylesheet and font-face rules, never shipped as part of the
 * browser-executed `/app.js` bundle `clientJs()` builds. Because nothing here
 * reads any other module's state (pure static text, zero `${}` interpolation
 * of a binding), it needed no `.toString()`/`JSON.stringify()` splice
 * treatment the way `web/shell.ts`'s client-bundle helpers do — a real
 * `import` from `web/layout-css.js` is enough, on both the server
 * (`routes.ts`) and in tests, the same way `web/format.ts`'s `fmtCost` etc.
 * are consumed directly rather than through `shell.ts` (epic 0002 "shell
 * decomposition", slice 2 follow-on: this cut moves the whole function, not
 * just a pure-logic half, since there is no DOM-building half to leave
 * behind).
 */

/** Layout CSS on top of the token custom properties (makes the themes visible). */
export function layoutCss(): string {
  return `
* { box-sizing: border-box; }
body {
  margin: 0; font-family: var(--font-sans);
  background: var(--color-surface); color: var(--color-text);
  transition: background var(--duration-normal) var(--ease), color var(--duration-normal) var(--ease);
  /* Page-level overflow guard (operator hit sudden horizontal scroll): the page
     itself never scrolls sideways — inner panels own their overflow-x. The real
     offender gets a browser-E2E scrollWidth assertion (Playwright task queued). */
  overflow-x: clip;
}
/* Long unbroken tokens (shas, ids, paths in headlines) must wrap, not stretch. */
.firing-headline, .flight-item, .flight-detail-title, .task-title { overflow-wrap: anywhere; }
.masthead {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  background: var(--color-surface-raised); border-bottom: 1px solid var(--color-border);
  position: sticky; top: 0; z-index: 10;
}
.masthead-right { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--space-4); }
.brand { display: flex; align-items: center; gap: var(--space-2); font-weight: 700; letter-spacing: 0.02em; font-size: var(--text-lg); }
.brand-mark { display: inline-flex; width: 22px; height: 22px; flex-shrink: 0; }
.brand-mark svg { width: 100%; height: 100%; }
.updated { font-size: var(--text-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.switch { display: flex; gap: var(--space-2); }
/* Masthead pill designed states (COCKPIT 6/6): shape-morph no-ops on full
   radius (stateRadius, packages/tokens), so the pill idiom is elevation
   alone — lift on hover/focus-visible, flatten pressed. */
.switch button {
  font: inherit; font-size: var(--text-sm); cursor: pointer;
  padding: var(--space-1) var(--space-3); border-radius: var(--radius-full);
  color: var(--color-text-muted); background: transparent; border: 1px solid var(--color-border);
  transition: box-shadow var(--duration-short2) var(--easing-standard);
}
.switch button:hover, .switch button:focus-visible { color: var(--color-text); box-shadow: var(--elevation-level-1); }
.switch button:active { box-shadow: none; }
.switch button[aria-pressed='true'] { color: var(--color-accent-text); background: var(--color-accent); border-color: var(--color-accent); }

.connect { position: relative; }
.connect > summary { cursor: pointer; list-style: none; font-size: var(--text-sm); color: var(--color-text-muted); padding: var(--space-1) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-full); transition: box-shadow var(--duration-short2) var(--easing-standard); }
.connect > summary::-webkit-details-marker { display: none; }
.connect > summary:hover, .connect > summary:focus-visible { color: var(--color-text); box-shadow: var(--elevation-level-1); }
.connect > summary:active { box-shadow: none; }
.connect[open] > summary { color: var(--color-accent-text); background: var(--color-accent); border-color: var(--color-accent); }
.connect-body { position: absolute; inset-inline-end: 0; margin-top: var(--space-2); width: 320px; max-width: 88vw; z-index: 20; background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--shape-medium); padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); box-shadow: var(--elevation-level-2); }
.connect-status { margin: 0; font-size: var(--text-sm); }
.connect-ok { color: var(--color-success); }
.connect-bad { color: var(--color-sev-high); }
.connect-form { display: flex; flex-direction: column; gap: var(--space-2); }
.connect-form label { font-size: var(--text-xs); color: var(--color-text-muted); }
.connect-form select, .connect-form input { font: inherit; font-size: var(--text-sm); padding: var(--space-2); border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); }
.connect-form button { font: inherit; font-size: var(--text-sm); cursor: pointer; padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); border: 1px solid var(--color-accent); background: var(--color-accent); color: var(--color-accent-text); position: relative; overflow: hidden; box-shadow: var(--elevation-level-1); transition: box-shadow var(--duration-short4) var(--easing-standard); }
.connect-hint { margin: 0; font-size: var(--text-xs); color: var(--color-text-muted); }
.gh-issue-form { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-2); }
.gh-issue-form label { font-size: var(--text-xs); color: var(--color-text-muted); }
.gh-issue-form input, .gh-issue-form textarea { font: inherit; font-size: var(--text-sm); padding: var(--space-2); border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); resize: vertical; }
/* gh-issue-form CTA designed states (COCKPIT 6/6): same shape-morph + elevation
   hover/active pair as .tour-actions button / .browse-actions button. Rest radius
   swaps --radius-sm for --shape-extra-small (both 4px) so the state tokens pair
   with their own rest value. Reaches both the CONNECT popover's bug-report submit
   and the per-project "Open pull request" submit, which reuses this class. */
.gh-issue-form button {
  font: inherit; font-size: var(--text-sm); cursor: pointer;
  padding: var(--space-2) var(--space-3); border-radius: var(--shape-extra-small);
  border: 1px solid var(--color-border); background: transparent; color: var(--color-text);
  transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard);
}
.gh-issue-form button:not(:disabled):hover, .gh-issue-form button:not(:disabled):focus-visible { color: var(--color-text); border-color: var(--color-accent); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.gh-issue-form button:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.gh-issue-result { margin: 0; font-size: var(--text-sm); }
.gh-issue-result:empty { display: none; }
.gh-issue-result-ok { color: var(--color-success); }
.gh-issue-result-fail { color: var(--color-sev-critical); }
.conn-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--color-text-muted); margin-inline-end: 6px; vertical-align: middle; }
.conn-dot.on { background: var(--color-success); }
.conn-dot.off { background: var(--color-sev-high); }
.connect-actions { display: flex; gap: var(--space-2); }
.connect-login { flex: 1; font: inherit; font-size: var(--text-sm); font-weight: 600; cursor: pointer; padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); border: 1px solid var(--color-accent); background: var(--color-accent); color: var(--color-accent-text); position: relative; overflow: hidden; box-shadow: var(--elevation-level-1); transition: box-shadow var(--duration-short4) var(--easing-standard); }
/* connect-test CTA designed states (COCKPIT 6/6): same shape-morph +
   elevation hover/active pair as .gh-issue-form button / .tour-actions button
   / .browse-actions button — this outline button shipped with a static rule
   and zero hover/focus/active feedback next to its filled sibling .connect-login. */
.connect-test {
  font: inherit; font-size: var(--text-sm); cursor: pointer;
  padding: var(--space-2) var(--space-3); border-radius: var(--shape-extra-small);
  border: 1px solid var(--color-border); background: transparent; color: var(--color-text);
  transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard);
}
.connect-test:not(:disabled):hover, .connect-test:not(:disabled):focus-visible { border-color: var(--color-accent); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.connect-test:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.connect-sep { border: none; border-top: 1px solid var(--color-border); margin: var(--space-1) 0; }
.notify-enable { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); color: var(--color-text-muted); cursor: pointer; }
.notify-enable input { accent-color: var(--color-accent); cursor: pointer; }
/* Checkbox-label trio designed states (COCKPIT 6/6): .notify-enable /
   .github-sync-public / .release-ghrelease each wrap a native checkbox in a
   muted-text label with zero hover/focus feedback on the label itself. Focus
   lands on the child <input>, not the label, so this follows the
   .fly-flight / .card idiom (:hover, :focus-within) rather than
   :focus-visible, brightening text the same "plain content" way
   .card-link / .back a already do. */
.notify-enable:hover, .notify-enable:focus-within,
.github-sync-public:hover, .github-sync-public:focus-within,
.release-ghrelease:hover, .release-ghrelease:focus-within { color: var(--color-text); }
.notify-quiet { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); }
.notify-quiet label { color: var(--color-text-muted); }
.notify-quiet input[type='time'] { font: inherit; font-size: var(--text-sm); padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); }

/* M3 filled-button interaction: state-layer overlay (hover/focus/press) + elevation lift. */
.connect-form button::after, .connect-login::after, .task-add button::after, .inbox-add button::after, .soul-editor-form button::after {
  content: ''; position: absolute; inset: 0; background: var(--color-accent-text); opacity: 0; pointer-events: none;
  transition: opacity var(--duration-short2) var(--easing-standard);
}
.connect-form button:hover::after, .connect-login:hover::after, .task-add button:hover::after, .inbox-add button:hover::after, .soul-editor-form button:hover::after { opacity: var(--state-hover); }
.connect-form button:focus-visible::after, .connect-login:focus-visible::after, .task-add button:focus-visible::after, .inbox-add button:focus-visible::after, .soul-editor-form button:focus-visible::after { opacity: var(--state-focus); }
.connect-form button:active::after, .connect-login:active::after, .task-add button:active::after, .inbox-add button:active::after, .soul-editor-form button:active::after { opacity: var(--state-pressed); }
.connect-form button:hover, .connect-form button:focus-visible, .connect-login:hover, .connect-login:focus-visible, .task-add button:hover, .task-add button:focus-visible, .inbox-add button:hover, .inbox-add button:focus-visible, .soul-editor-form button:hover, .soul-editor-form button:focus-visible { box-shadow: var(--elevation-level-2); }
.connect-form button:active, .connect-login:active, .task-add button:active, .inbox-add button:active, .soul-editor-form button:active { box-shadow: var(--elevation-level-0); }
.connect-form button:disabled, .connect-login:disabled, .task-add button:disabled, .inbox-add button:disabled, .soul-editor-form button:disabled { box-shadow: none; }

.totals {
  display: flex; flex-wrap: wrap; gap: var(--space-5);
  padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--color-border);
}
.total { display: flex; flex-direction: column; gap: 2px; border-radius: var(--radius-sm); }
/* Hero number (COCKPIT 3/6): the fleet home's first, most-glanced-at
   figures get real scale-contrast against their quiet labels below — the
   M3 headline role, not the ad hoc --text-xl scale.ts step, is the first
   consumer of the type-scale tokens m3Vars() has emitted since COCKPIT 1/6. */
.total-n { font-size: var(--type-headline-medium-size); line-height: var(--type-headline-medium-line-height); font-weight: 700; font-variant-numeric: tabular-nums; }
.total-l { font-size: var(--text-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }

/* Fleet-wide "who's flying now" rollup (backlog web-mssn106m-bqvxi8) — a
   thin chip strip between the raw-count totals and the derived-rate stat
   tiles, hidden outright when nothing is flying (see renderLiveWorkers). */
.live-workers {
  display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
  padding: var(--space-3) var(--space-5); border-bottom: 1px solid var(--color-border);
}
.live-workers-label { font-size: var(--text-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }

/* M3 elevated stat cards (bento grid) for the fleet's performance metrics —
   distinct from the plain .total count row above: these are derived rates,
   not raw counts, and read better as their own visual tier. */
.stat-tiles {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--space-3); padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
}
.stat-tile {
  display: flex; flex-direction: column; gap: 2px;
  background: var(--color-surface-raised); border-radius: var(--shape-medium);
  padding: var(--space-4); box-shadow: var(--elevation-level-1);
  transition: box-shadow var(--duration-short4) var(--easing-standard);
}
.stat-tile:hover, .stat-tile:focus-visible { box-shadow: var(--elevation-level-2); outline: none; }
.stat-tile-n { font-size: var(--text-2xl); font-weight: 700; font-variant-numeric: tabular-nums; }
.stat-tile-l { font-size: var(--text-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }

.flightbar { padding: var(--space-3) var(--space-5); border-bottom: 1px solid var(--color-border); background: var(--color-surface-raised); }
.fly-form { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.fly-form label { font-size: var(--text-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.fly-form input { font: inherit; font-size: var(--text-sm); padding: var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); }
#fly-folder { flex: 1 1 260px; min-width: 200px; font-family: var(--font-mono); }
#fly-firings { width: 68px; }
#fly-budget { width: 76px; }
#fly-total { width: 76px; }
#fly-mode { font: inherit; font-size: var(--text-sm); background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); border-radius: var(--shape-extra-small); padding: 2px var(--space-1); }
.visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
/* 🍀 I'm-feeling-lucky: a square icon sibling in #fly-go's MX shape-morph
   family, voiced in --color-success (the clover's own semantic green — ≥4.5:1
   on every theme's surfaces per the contrast matrix) instead of the CTA
   accent, so it reads "advisory roll" next to the "spend" button. The SVG
   inherits currentColor, so both themes (and terminal) restyle it for free;
   hover/focus fill with success + accent-text (≥4.5:1 on the success fill in
   all three themes) and spin the four-fold-symmetric clover a quarter turn —
   it lands exactly on itself, luck spun. The global reduced-motion block
   collapses the spin to static. */
#fly-lucky { display: inline-flex; align-items: center; justify-content: center; font: inherit; font-size: var(--text-sm); cursor: pointer; padding: var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-success); background: transparent; color: var(--color-success); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard), background var(--duration-short2) var(--easing-standard), color var(--duration-short2) var(--easing-standard); }
#fly-lucky svg { width: 1.35em; height: 1.35em; transition: transform var(--duration-short2) var(--easing-standard); }
#fly-lucky:disabled { cursor: default; opacity: 0.6; }
#fly-lucky:not(:disabled):hover, #fly-lucky:not(:disabled):focus-visible { background: var(--color-success); color: var(--color-accent-text); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
#fly-lucky:not(:disabled):hover svg, #fly-lucky:not(:disabled):focus-visible svg { transform: rotate(90deg); }
#fly-lucky:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
#fly-go { font: inherit; font-size: var(--text-sm); font-weight: 600; cursor: pointer; padding: var(--space-2) var(--space-4); border-radius: var(--shape-extra-small); border: 1px solid var(--color-accent); background: var(--color-accent); color: var(--color-accent-text); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
#fly-go:disabled { cursor: default; opacity: 0.6; }
#fly-go:not(:disabled):hover, #fly-go:not(:disabled):focus-visible { border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
#fly-go:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
#fly-stop { font: inherit; font-size: var(--text-sm); font-weight: 600; cursor: pointer; padding: var(--space-2) var(--space-4); border-radius: var(--shape-extra-small); border: 1px solid var(--color-sev-high); background: transparent; color: var(--color-sev-high); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
#fly-stop:disabled { cursor: default; opacity: 0.6; }
#fly-stop:not(:disabled):hover, #fly-stop:not(:disabled):focus-visible { border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
#fly-stop:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
#fly-pause { font: inherit; font-size: var(--text-sm); font-weight: 600; cursor: pointer; padding: var(--space-2) var(--space-4); border-radius: var(--shape-extra-small); border: 1px solid var(--color-sev-medium); background: transparent; color: var(--color-sev-medium); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
#fly-pause:disabled { cursor: default; opacity: 0.6; }
#fly-pause:not(:disabled):hover, #fly-pause:not(:disabled):focus-visible { border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
#fly-pause:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
/* Browse… outline chip (COCKPIT 6/6): the same MX shape-morph + elevation
   hover/active pair its fly-bar siblings #fly-go/#fly-stop/#fly-pause carry.
   Never disabled, so no :not(:disabled) guard — the pairing pin tracks the
   bare selector. Rest gains only the transition — rest-state pixels do not move. */
#fly-browse-btn { font: inherit; font-size: var(--text-sm); cursor: pointer; padding: var(--space-2) var(--space-3); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-muted); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
#fly-browse-btn:hover, #fly-browse-btn:focus-visible { color: var(--color-text); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
#fly-browse-btn:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
/* 🍀 I'm-feeling-lucky button (COCKPIT 6/6): the ONLY fly-bar control with no
   stylesheet rule at all — it rendered as a raw UA-default <button> between
   Lanes and Fly it, and escaped every prior audit (the cursor: pointer
   census, the :hover-rule walk) precisely because a control with no rule has
   nothing to find. Same outline-chip idiom as #fly-browse-btn beside it, plus
   #fly-go's :disabled phase — features/fly.ts disables it for the /api/lucky
   round-trip — so the hover/active pair sits behind :not(:disabled). */
#fly-lucky { font: inherit; font-size: var(--text-sm); cursor: pointer; padding: var(--space-2) var(--space-3); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: transparent; color: var(--color-text); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
#fly-lucky:disabled { cursor: default; opacity: 0.6; }
#fly-lucky:not(:disabled):hover, #fly-lucky:not(:disabled):focus-visible { border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
#fly-lucky:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.pill-paused { color: var(--color-sev-medium); border-color: var(--color-sev-medium); }
.fly-status { font-size: var(--text-sm); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.fly-status.fly-ok { color: var(--color-success); font-weight: 600; }
.fly-status.fly-err { color: var(--color-sev-high); font-weight: 600; }
.fly-hint { flex-basis: 100%; margin: 0; font-size: var(--text-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.fly-progress-label { flex-basis: 100%; margin: 0; font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
#fly-progress-bar { flex-basis: 100%; }
.fly-flights { display: flex; flex-direction: column; gap: var(--space-2); }
.fly-flights:not(:empty) { margin: var(--space-2) var(--space-5) 0; }
/* Flight cards (COCKPIT 3/6): same elevation-on-hover/focus-within language
   as .card (fleet home's project cards) and the same MX shape-morph
   hover/active language the fly-bar CTAs (#fly-go/-stop/-pause) already
   carry — a live flight row was the one interactive surface left with no
   designed states at all. */
.fly-flight { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--shape-extra-small); background: var(--color-surface); font-size: var(--text-sm); font-variant-numeric: tabular-nums; box-shadow: var(--elevation-level-0); transition: box-shadow var(--duration-short4) var(--easing-standard); }
.fly-flight:hover, .fly-flight:focus-within { box-shadow: var(--elevation-level-1); }
.fly-flight-actions { display: flex; gap: var(--space-2); }
.fly-flight-actions button { font: inherit; font-size: var(--text-xs); font-weight: 600; cursor: pointer; padding: var(--space-1) var(--space-3); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: transparent; color: var(--color-text); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.fly-flight-actions button:disabled { cursor: default; opacity: 0.6; }
.fly-flight-actions button:not(:disabled):hover, .fly-flight-actions button:not(:disabled):focus-visible { border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.fly-flight-actions button:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.fly-flight-actions .fly-flight-stop { border-color: var(--color-sev-high); color: var(--color-sev-high); }
.fly-flight-actions .fly-flight-pause { border-color: var(--color-sev-medium); color: var(--color-sev-medium); }

.searchbar { padding: var(--space-3) var(--space-5); border-bottom: 1px solid var(--color-border); }
.search-form { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.search-form label { font-size: var(--text-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.search-form select, .search-form input { font: inherit; font-size: var(--text-sm); padding: var(--space-2); border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); }
#search-q { flex: 1 1 260px; min-width: 200px; }
/* search/ask CTA designed states (COCKPIT 6/6): the pair joins the MX
   shape-morph treatment their structural twin #fly-go already carries —
   rest radius swaps --radius-sm for --shape-extra-small (both 4px) so the
   state tokens pair with their own rest value. */
#search-go { font: inherit; font-size: var(--text-sm); font-weight: 600; cursor: pointer; padding: var(--space-2) var(--space-4); border-radius: var(--shape-extra-small); border: 1px solid var(--color-accent); background: var(--color-accent); color: var(--color-accent-text); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
#search-go:not(:disabled):hover, #search-go:not(:disabled):focus-visible { border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
#search-go:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
#ask-go { font: inherit; font-size: var(--text-sm); font-weight: 600; cursor: pointer; padding: var(--space-2) var(--space-4); border-radius: var(--shape-extra-small); border: 1px solid var(--color-accent); background: transparent; color: var(--color-accent); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
#ask-go:not(:disabled):hover, #ask-go:not(:disabled):focus-visible { border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
#ask-go:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
#ask-go:disabled { cursor: default; opacity: 0.6; }
.ask-answer:empty { display: none; }
.ask-answer { margin-top: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--color-accent); border-radius: var(--radius-sm); background: var(--color-surface-raised); font-size: var(--text-sm); word-break: break-word; }
.ask-answer > :first-child { margin-top: 0; }
.ask-answer p { margin: var(--space-2) 0; white-space: pre-wrap; }
.ask-answer h1, .ask-answer h2, .ask-answer h3, .ask-answer h4, .ask-answer h5, .ask-answer h6 { margin: var(--space-3) 0 var(--space-1); font-size: var(--text-sm); font-weight: 700; }
.ask-answer ul, .ask-answer ol { margin: var(--space-2) 0; padding-inline-start: var(--space-5); }
.ask-answer li { margin: 2px 0; }
.ask-answer pre { margin: var(--space-2) 0; padding: var(--space-2) var(--space-3); overflow-x: auto; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.ask-answer code { font-family: var(--font-mono); font-size: var(--text-xs); }
.ask-answer pre code { white-space: pre; }
.ask-answer table { margin: var(--space-2) 0; border-collapse: collapse; }
.ask-answer th, .ask-answer td { border: 1px solid var(--color-border); padding: 2px var(--space-2); text-align: start; font-size: var(--text-xs); }
.ask-sources { display: block; margin-top: var(--space-2); font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted); }
.search-results:empty { display: none; }
.search-results { margin-top: var(--space-3); }
.search-empty { margin: 0; font-size: var(--text-sm); color: var(--color-text-muted); }
.search-hits { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.search-hit { display: flex; flex-direction: column; gap: 2px; padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface-raised); }
.search-path { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--color-accent); }
.search-snippet { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted); white-space: pre-wrap; word-break: break-word; }

main { padding: var(--space-5); display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); }
/* THE grid-blowout guard (operator: page breaks above 80% zoom): grid/flex
   children default to min-width:auto, so one wide row inside a card forces its
   whole column past the viewport. min-width:0 lets every card shrink; inner
   text already ellipsizes/wraps. */
main > * { min-width: 0; }
.card {
  background: var(--color-surface-raised); border: 1px solid var(--color-border);
  border-radius: var(--shape-medium); padding: var(--space-4);
  display: flex; flex-direction: column; gap: var(--space-3);
  box-shadow: var(--elevation-level-1);
  transition: box-shadow var(--duration-short4) var(--easing-standard);
}
.card:hover, .card:focus-within { box-shadow: var(--elevation-level-2); }
.card-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); }
.card-title { margin: 0; font-size: var(--text-lg); }
.pill { font-size: var(--text-xs); padding: 2px var(--space-2); border-radius: var(--radius-full); border: 1px solid var(--color-border); color: var(--color-text-muted); white-space: nowrap; }
.pill-flying { color: var(--color-accent-text); background: var(--color-accent); border-color: var(--color-accent); }
.pill-needs_you { color: var(--color-needs-you); border-color: var(--color-needs-you); }
.card-meta, .card-stats { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.chip { font-size: var(--text-xs); color: var(--color-text-muted); border: 1px solid var(--color-border); border-radius: var(--shape-extra-small); padding: 2px var(--space-2); }
.chip-proposed { color: var(--color-needs-you); border-color: var(--color-needs-you); }
.chip-anomaly { color: var(--color-needs-you); border-color: var(--color-needs-you); }
.chip-runaway { color: var(--color-needs-you); border-color: var(--color-needs-you); }
.chip-inbox { color: var(--color-accent); border-color: var(--color-accent); }
.chip-backlog { color: var(--color-needs-you); border-color: var(--color-needs-you); }
.soul-review-btn { font: inherit; font-size: var(--text-xs); cursor: pointer; padding: 2px var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-needs-you); background: transparent; color: var(--color-needs-you); white-space: nowrap; transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.soul-review-btn:not(:disabled):hover, .soul-review-btn:not(:disabled):focus-visible { background: color-mix(in srgb, var(--color-needs-you) 15%, transparent); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.soul-review-btn:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.soul-review-btn:disabled { opacity: 0.6; cursor: default; }
.card-head-badges { display: flex; align-items: baseline; gap: var(--space-2); flex-wrap: wrap; }
.card-stats { gap: var(--space-4); }
.stat { display: flex; flex-direction: column; }
.stat-n { font-weight: 600; font-variant-numeric: tabular-nums; }
.stat-l { font-size: var(--text-xs); color: var(--color-text-muted); }
.gauge-label { display: flex; justify-content: space-between; font-size: var(--text-xs); margin-bottom: 4px; font-variant-numeric: tabular-nums; }
.gauge { display: flex; gap: 3px; height: 8px; }
.gauge .seg { border-radius: var(--radius-sm); min-width: 3px; }
.seg-critical { background: var(--color-sev-critical); }
.seg-high { background: var(--color-sev-high); }
.seg-medium { background: var(--color-sev-medium); }
.seg-low { background: var(--color-sev-low); }
.seg-clear { background: var(--color-border); }
.hotfiles { margin: 0; padding-inline-start: var(--space-4); font-size: var(--text-xs); color: var(--color-text-muted); }
.muted { color: var(--color-text-muted); }
.card-link { color: inherit; text-decoration: none; }
/* Link pairing (COCKPIT 6/6): the firing-236 audit's last hover-only
   stragglers — a keyboard operator tabbing to these links gets the same
   accent/underline feedback a mouse operator gets, layered on the global
   :focus-visible ring. */
.card-link:hover, .card-link:focus-visible { color: var(--color-accent); text-decoration: underline; }
.back { grid-column: 1 / -1; margin: 0; font-size: var(--text-sm); }
.back a { color: var(--color-accent); text-decoration: none; }
.back a:hover, .back a:focus-visible { text-decoration: underline; }
/* The inside page is ONE full-width column — boards need room, not card cells. */
main.project-mode { grid-template-columns: 1fr; }
.act-label { margin: 0 0 var(--space-1); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); }
.act-label-live { color: var(--color-accent); }
.docs-panel { border: 1px solid var(--color-border); border-radius: var(--shape-medium); padding: var(--space-3) var(--space-4); box-shadow: var(--elevation-level-1); }
.docs-title { margin: 0 0 var(--space-2); font-size: var(--text-base); }
.dora-panel { border: 1px solid var(--color-border); border-radius: var(--shape-medium); box-shadow: var(--elevation-level-1); overflow: hidden; }
.dora-title { margin: 0; padding: var(--space-3) var(--space-4) 0; font-size: var(--text-base); }
.dora-panel .stat-tiles { border-bottom: none; }
.gate-parallel-panel { border: 1px solid var(--color-border); border-radius: var(--shape-medium); box-shadow: var(--elevation-level-1); overflow: hidden; }
.gate-parallel-title { margin: 0; padding: var(--space-3) var(--space-4) 0; font-size: var(--text-base); }
.gate-parallel-panel .stat-tiles { border-bottom: none; }
.evolution-panel { border: 1px solid var(--color-border); border-radius: var(--shape-medium); box-shadow: var(--elevation-level-1); overflow: hidden; }
.evolution-title { margin: 0; padding: var(--space-3) var(--space-4) 0; font-size: var(--text-base); }
.evolution-panel .stat-tiles { border-bottom: none; }
.docs-list { list-style: none; margin: 0 0 var(--space-3); padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
/* Docs-file chips (COCKPIT 6/6): the same MX shape-morph + elevation
   hover/active pair .task-delete-btn / .replay-nav-btn carry. Rest radius
   swaps --radius-sm for --shape-extra-small (both 4px) so the state tokens
   pair with their own rest value — rest-state pixels do not move. The .on
   rule stays AFTER the hover pair so the open doc keeps its accent through
   hover/press. */
.docs-file { font: inherit; font-size: var(--text-xs); cursor: pointer; padding: 2px var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: none; color: var(--color-text-muted); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.docs-file:hover, .docs-file:focus-visible { border-color: var(--color-accent); color: var(--color-text); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.docs-file:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.docs-file.on { border-color: var(--color-accent); color: var(--color-accent); }
.docs-viewer-path { margin: 0 0 var(--space-2); font-size: var(--text-sm); color: var(--color-text-muted); }
.docs-viewer-body { max-height: 32rem; overflow-y: auto; font-size: var(--text-sm); }
.docs-viewer-body pre { background: var(--color-surface-raised); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); overflow-x: auto; }
.docs-viewer-body svg { max-width: 100%; height: auto; display: block; margin: var(--space-2) 0; }
.docs-viewer-body svg [data-tip] { cursor: default; }
.console-panel { border: 1px solid var(--color-border); border-radius: var(--shape-medium); box-shadow: var(--elevation-level-1); }
.console-details { padding: var(--space-3) var(--space-4); }
.console-title { margin: 0; font-size: var(--text-base); cursor: pointer; border-radius: var(--shape-extra-small); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.console-title:hover, .console-title:focus-visible { background: var(--color-surface-raised); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.console-title:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.console-body { margin-top: var(--space-2); }
.console-lines { max-height: 24rem; overflow-y: auto; margin: 0; padding: var(--space-2) var(--space-3); background: var(--color-surface-raised); border-radius: var(--radius-md); font-size: var(--text-xs); white-space: pre-wrap; overflow-wrap: anywhere; }
.start-over { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px dashed var(--color-border); border-radius: var(--radius-lg); }
/* Start-over + github-sync CTAs (COCKPIT 6/6): the MX shape-morph + elevation
   hover/active pair their sibling chips carry. Rest radius swaps --radius-md
   for --shape-small (both 8px — the .flight-head precedent) so the state
   tokens pair; the sync button is disabled mid-request, so states guard with
   :not(:disabled). */
.start-over button { background: none; border: 1px solid var(--color-border); border-radius: var(--shape-small); color: var(--color-text-muted); padding: var(--space-1) var(--space-3); cursor: pointer; font: inherit; font-size: var(--text-sm); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.start-over button:not(:disabled):hover, .start-over button:not(:disabled):focus-visible { color: var(--color-text); border-color: var(--color-accent); border-radius: var(--shape-small-hover); box-shadow: var(--elevation-level-1); }
.start-over button:not(:disabled):active { border-radius: var(--shape-small-pressed); box-shadow: none; }
.start-over .muted { font-size: var(--text-sm); }
.github-sync { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px dashed var(--color-border); border-radius: var(--radius-lg); }
.github-sync button { background: none; border: 1px solid var(--color-border); border-radius: var(--shape-small); color: var(--color-text-muted); padding: var(--space-1) var(--space-3); cursor: pointer; font: inherit; font-size: var(--text-sm); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.github-sync button:not(:disabled):hover, .github-sync button:not(:disabled):focus-visible { color: var(--color-text); border-color: var(--color-accent); border-radius: var(--shape-small-hover); box-shadow: var(--elevation-level-1); }
.github-sync button:not(:disabled):active { border-radius: var(--shape-small-pressed); box-shadow: none; }
.github-sync button:disabled { opacity: 0.6; cursor: default; }
.github-sync .muted { font-size: var(--text-sm); }
.github-sync-public { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); color: var(--color-text-muted); cursor: pointer; }
.github-sync-public input { accent-color: var(--color-accent); cursor: pointer; }
.github-sync-result { font-size: var(--text-sm); }
.github-sync-result:empty { display: none; }
.github-sync-result-ok { color: var(--color-success); }
.github-sync-result-fail { color: var(--color-sev-critical); }
.github-pr { padding: var(--space-3) var(--space-4); border: 1px dashed var(--color-border); border-radius: var(--radius-lg); }
.github-pr-summary { font-size: var(--text-sm); font-weight: 600; cursor: pointer; border-radius: var(--shape-extra-small); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.github-pr-summary:hover, .github-pr-summary:focus-visible { color: var(--color-text); background: var(--color-surface-raised); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.github-pr-summary:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.github-pr-result { font-size: var(--text-sm); }
.github-pr-result:empty { display: none; }
.github-pr-result-ok { color: var(--color-success); }
.github-pr-result-fail { color: var(--color-sev-critical); }
.inbox-details { margin-top: var(--space-2); }
.inbox-summary { font-size: var(--text-sm); font-weight: 600; cursor: pointer; border-radius: var(--shape-extra-small); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.inbox-summary:hover, .inbox-summary:focus-visible { color: var(--color-text); background: var(--color-surface-raised); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.inbox-summary:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.flight-summary { background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--shape-medium); padding: var(--space-3) var(--space-4); box-shadow: var(--elevation-level-1); }
.flight-summary-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.flight-summary-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2); font-size: var(--text-sm); }
.flight-summary-headline { flex: 1 1 16rem; min-width: 0; overflow-wrap: anywhere; font-weight: 600; }
.flight-summary-cost { font-variant-numeric: tabular-nums; color: var(--color-text-muted); }
.flight-summary-task { font-size: var(--text-xs); padding: 0 var(--space-2); border-radius: var(--radius-full); color: var(--color-accent-text); background: var(--color-success); }
.flight-summary-ago { font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
.landing-panel { background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--shape-medium); padding: var(--space-3) var(--space-4); box-shadow: var(--elevation-level-1); }
.landing-title { margin: 0 0 var(--space-2); font-size: var(--text-base); }
.landing-branch { margin: 0 0 var(--space-2); font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
.landing-branch-name, .landing-base-name { font-weight: 600; }
.landing-branch-arrow { color: var(--color-text-muted); padding: 0 var(--space-1); }
.flight-debrief { margin: 0 0 var(--space-3); padding-bottom: var(--space-3); border-bottom: 1px solid var(--color-border); }
.flight-debrief-title { margin: 0 0 var(--space-2); font-size: var(--text-sm); }
.flight-debrief-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0 0 var(--space-2); }
.flight-debrief-ship { color: var(--color-success); border-color: var(--color-success); }
.flight-debrief-death { color: var(--color-sev-critical); border-color: var(--color-sev-critical); }
.flight-debrief-best, .flight-debrief-worst { margin: 0 0 var(--space-1); font-size: var(--text-sm); }
.flight-debrief-label { font-weight: 600; }
.flight-debrief-notable { margin: var(--space-1) 0 0; font-size: var(--text-xs); }
.landing-overlaps { list-style: none; margin: 0 0 var(--space-3); padding: var(--space-2) var(--space-3); display: flex; flex-direction: column; gap: var(--space-1); border: 1px solid var(--color-sev-medium); border-radius: var(--shape-extra-small); background: color-mix(in srgb, var(--color-sev-medium) 12%, transparent); }
.landing-overlap { font-size: var(--text-sm); color: var(--color-sev-medium); }
.landing-worktree-divergence { margin: 0 0 var(--space-3); padding: var(--space-2) var(--space-3); font-size: var(--text-sm); color: var(--color-sev-high); border: 1px solid var(--color-sev-high); border-radius: var(--shape-extra-small); background: color-mix(in srgb, var(--color-sev-high) 12%, transparent); }
.landing-diffstat { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0 0 var(--space-3); }
.landing-ins { color: var(--color-success); border-color: var(--color-success); }
.landing-del { color: var(--color-sev-critical); border-color: var(--color-sev-critical); }
.landing-commits { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.landing-commit { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2); font-size: var(--text-sm); }
.landing-commit-sha { font-variant-numeric: tabular-nums; color: var(--color-text-muted); }
.landing-commit-subject { flex: 1 1 16rem; min-width: 0; overflow-wrap: anywhere; }
.landing-commit-files { font-size: var(--text-xs); }
.landing-commit-group { display: flex; flex-direction: column; gap: var(--space-1); }
/* COCKPIT 6/6 (epic 0005): the collapsed commit-group toggle joins the MX
   designed-states family with the exact idiom its structural twin
   .flight-head (the flight log's own group-row toggle — same full-width
   borderless button, same border + surface-raise hover wash) carries:
   shape-morph + --elevation-level-1 lift on hover/focus-visible, pressed-flat
   on active. Rest radius swaps --radius-md for --shape-small (both 8px) so
   the state tokens pair with their own rest value — rest-state pixels do not
   move. Never disabled, so no :not(:disabled) guard. Pinned by
   landing-group-toggle-designed-states.test.ts. */
.landing-group-toggle { display: flex; align-items: baseline; gap: var(--space-2); width: 100%; background: none; border: 1px solid transparent; border-radius: var(--shape-small); padding: 3px var(--space-2); font: inherit; font-size: var(--text-sm); color: inherit; cursor: pointer; text-align: start; transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.landing-group-toggle:hover, .landing-group-toggle:focus-visible { border-color: var(--color-border); background: var(--color-surface-raised); border-radius: var(--shape-small-hover); box-shadow: var(--elevation-level-1); }
.landing-group-toggle:active { border-radius: var(--shape-small-pressed); box-shadow: none; }
.landing-group-label { font-weight: 600; }
.landing-group-count { font-size: var(--text-xs); }
.landing-commit-nested { list-style: none; margin: 0; padding-inline-start: var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); border-inline-start: 1px solid var(--color-border); }
.landing-actions { display: flex; justify-content: flex-end; margin-top: var(--space-3); }
.landing-execute { font: inherit; font-size: var(--text-sm); cursor: pointer; padding: var(--space-1) var(--space-3); border-radius: var(--shape-extra-small); border: 1px solid var(--color-accent); background: var(--color-accent); color: var(--color-accent-text); }
.landing-execute:disabled { opacity: 0.6; cursor: default; }
.landing-result { margin-top: var(--space-2); font-size: var(--text-sm); text-align: end; }
.landing-result:empty { display: none; }
.landing-result-ok { color: var(--color-success); }
.landing-result-fail { color: var(--color-sev-critical); }
.round-panel { background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--shape-medium); padding: var(--space-3) var(--space-4); box-shadow: var(--elevation-level-1); }
.round-title { margin: 0 0 var(--space-2); font-size: var(--text-base); }
.round-line { margin: 0 0 var(--space-2); font-size: var(--text-sm); }
.round-stats { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0; }
.backlog-panel { background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--shape-medium); padding: var(--space-3) var(--space-4); box-shadow: var(--elevation-level-1); }
.backlog-title { margin: 0 0 var(--space-2); font-size: var(--text-base); }
.backlog-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.backlog-item { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2); font-size: var(--text-sm); }
.backlog-match { color: var(--color-text-muted); font-size: var(--text-xs); }
.coordination-panel { background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--shape-medium); padding: var(--space-3) var(--space-4); box-shadow: var(--elevation-level-1); }
.coordination-title { margin: 0 0 var(--space-2); font-size: var(--text-base); }
.coordination-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.coordination-line { font-size: var(--text-sm); font-family: var(--font-mono); white-space: pre-wrap; word-break: break-word; }
.coordination-line-claim { font-weight: 600; }
.pipeline-section { background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--shape-medium); padding: var(--space-3) var(--space-4); box-shadow: var(--elevation-level-1); }
.pipeline-title { margin: 0 0 var(--space-2); font-size: var(--text-base); }
.pipeline-controls { display: flex; flex-wrap: wrap; gap: var(--space-3); margin: 0 0 var(--space-3); }
.pipeline-panel { display: flex; align-items: flex-start; gap: var(--space-3); }
.pipeline-tree { flex: 0 1 32%; min-width: 12em; display: flex; flex-direction: column; gap: var(--space-2); font-size: var(--text-sm); }
.pipeline-lane { display: flex; flex-direction: column; gap: var(--space-1); }
.pipeline-lane-label { color: var(--color-text-muted); font-size: var(--text-xs); font-family: var(--font-mono); }
/* Pipeline tree rows (COCKPIT 6/6): the role="treeitem" rows are structural
   twins of .phase / .report-ctx-menu-item (transparent-bordered rows that
   recolor their border on hover) and now share their MX idiom — shape-morph
   + --elevation-level-1 lift on hover/focus-visible, pressed-flat active,
   the radius/shadow transition at rest. Rest radius was already
   --shape-extra-small, so rest-state pixels do not move. The
   [aria-selected] / [data-connected] rules stay AFTER the hover pair so a
   selected row keeps its surface fill through hover/press. */
.pipeline-item { cursor: pointer; padding: var(--space-1) var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid transparent; transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.pipeline-item:hover, .pipeline-item:focus-visible { border-color: var(--color-accent); outline: none; border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.pipeline-item:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.pipeline-item[aria-selected='true'] { border-color: var(--color-accent); background: var(--color-surface); }
.pipeline-item[data-connected='true'] { background: color-mix(in srgb, var(--color-accent) 12%, transparent); }
/* flex-grow 0, NOT 1: the svg carries its natural width/height attributes
   (1 viewBox unit = 1px) and must render at that size — growing it to fill
   the panel row re-inflates the preserved aspect ratio until one node fills
   a whole screen (the 43-lane single-column flight the operator caught).
   max-width + height:auto still SHRINK a canvas wider than the panel. */
.pipeline-canvas { flex: 0 1 auto; min-width: 0; max-width: 100%; height: auto; }
.pipeline-empty { color: var(--color-text-muted); font-size: var(--text-sm); margin: 0; }
/* Canvas status colors mirror .spark-shipped/-errored/-no's OTLP status→token mapping exactly —
   one status vocabulary, not a second one invented for the node-graph lens. */
.pipeline-node rect { fill: var(--color-surface-raised); stroke: var(--color-border); stroke-width: 1.5px; }
.pipeline-node[data-status='ok'] rect { stroke: var(--color-success); }
.pipeline-node[data-status='error'] rect { stroke: var(--color-sev-high); }
.pipeline-node[data-connected='true'] rect { fill: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface-raised)); }
.pipeline-node[data-selected='true'] rect { stroke: var(--color-accent); stroke-width: 2.5px; }
.pipeline-node text { fill: var(--color-text); font-size: var(--text-xs); text-anchor: middle; dominant-baseline: middle; pointer-events: none; }
.pipeline-edge { fill: none; stroke: var(--color-border); stroke-width: 1.5px; }
.pipeline-edge[data-connected='true'] { stroke: var(--color-accent); stroke-width: 2px; }
.release-panel { background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--shape-medium); padding: var(--space-3) var(--space-4); box-shadow: var(--elevation-level-1); }
.release-title { margin: 0 0 var(--space-2); font-size: var(--text-base); }
.release-line { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0; }
.release-milestone { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-3); }
.release-milestone label { font-size: var(--text-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.release-milestone-input { width: 6em; font: inherit; font-size: var(--text-sm); padding: var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); }
.release-ghrelease { display: inline-flex; align-items: center; gap: var(--space-2); margin-top: var(--space-3); font-size: var(--text-sm); color: var(--color-text-muted); cursor: pointer; }
.release-ghrelease input { accent-color: var(--color-accent); cursor: pointer; }
/* RELEASE PHASE row (release/maturity.ts): structural twin of
   .release-milestone — same uppercase micro-label, same field chrome — with
   a one-line hint underneath spelling out the auto-detection's reasoning so
   the --prerelease decision is never a silent guess. */
.release-maturity { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-3); }
.release-maturity label { font-size: var(--text-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.release-maturity-select { font: inherit; font-size: var(--text-sm); padding: var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); cursor: pointer; }
.release-maturity-hint { margin: var(--space-1) 0 0; font-size: var(--text-xs); color: var(--color-text-muted); }
.release-actions { display: flex; justify-content: flex-end; margin-top: var(--space-3); }
.release-execute { font: inherit; font-size: var(--text-sm); cursor: pointer; padding: var(--space-1) var(--space-3); border-radius: var(--shape-extra-small); border: 1px solid var(--color-accent); background: var(--color-accent); color: var(--color-accent-text); }
.release-execute:disabled { opacity: 0.6; cursor: default; }
.release-result { margin-top: var(--space-2); font-size: var(--text-sm); text-align: end; }
.release-result:empty { display: none; }
.release-result-ok { color: var(--color-success); }
.release-result-fail { color: var(--color-sev-critical); }
.pr-review-panel { background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--shape-medium); padding: var(--space-3) var(--space-4); box-shadow: var(--elevation-level-1); margin-bottom: var(--space-3); }
.pr-review-title { margin: 0 0 var(--space-2); font-size: var(--text-base); }
.pr-review-item { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2) 0; border-top: 1px solid var(--color-border); }
.pr-review-item:first-of-type { border-top: none; }
.pr-review-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2); }
.pr-review-number { font-family: var(--font-mono); color: var(--color-text-muted); }
.pr-review-pr-title { margin: 0; font-size: var(--text-sm); }
.pr-review-badge-merge { color: var(--color-success); border-color: var(--color-success); }
.pr-review-badge-request-changes { color: var(--color-sev-high); border-color: var(--color-sev-high); }
.pr-review-badge-queue-for-human { color: var(--color-needs-you); border-color: var(--color-needs-you); }
.pr-review-actions { display: flex; justify-content: flex-end; margin-top: var(--space-1); }
.pr-review-execute { font: inherit; font-size: var(--text-sm); cursor: pointer; padding: var(--space-1) var(--space-3); border-radius: var(--shape-extra-small); border: 1px solid var(--color-accent); background: var(--color-accent); color: var(--color-accent-text); }
.pr-review-execute:disabled { opacity: 0.6; cursor: default; }
.pr-review-result { margin-top: var(--space-1); font-size: var(--text-sm); text-align: end; }
.pr-review-result:empty { display: none; }
.pr-review-result-ok { color: var(--color-success); }
.pr-review-result-fail { color: var(--color-sev-critical); }
.issue-triage-panel { background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--shape-medium); padding: var(--space-3) var(--space-4); box-shadow: var(--elevation-level-1); }
.issue-triage-title { margin: 0 0 var(--space-2); font-size: var(--text-base); }
.issue-triage-list { display: flex; flex-direction: column; }
.issue-triage-item { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2) 0; border-top: 1px solid var(--color-border); }
.issue-triage-item:first-of-type { border-top: none; }
.issue-triage-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2); }
.issue-triage-number { font-family: var(--font-mono); color: var(--color-text-muted); }
.issue-triage-issue-title { margin: 0; font-size: var(--text-sm); }
.issue-triage-badge-accept { color: var(--color-success); border-color: var(--color-success); }
.issue-triage-badge-duplicate { color: var(--color-text-muted); border-color: var(--color-border); }
.issue-triage-badge-skip { color: var(--color-text-muted); border-color: var(--color-border); opacity: 0.7; }
.issue-triage-actions { display: flex; justify-content: flex-end; margin-top: var(--space-2); }
.issue-triage-execute { font: inherit; font-size: var(--text-sm); cursor: pointer; padding: var(--space-1) var(--space-3); border-radius: var(--shape-extra-small); border: 1px solid var(--color-accent); background: var(--color-accent); color: var(--color-accent-text); }
.issue-triage-execute:disabled { opacity: 0.6; cursor: default; }
/* Panel execute CTAs (COCKPIT 4/6): the landing/release/PR-review/issue-triage
   "Execute" buttons — the project-page panels' primary actions — were the last
   controls whose hover was an off-system brightness-filter recolor. One combined
   block (the .connect-form-button state-layer group sets the precedent) gives
   all four the same MX shape-morph + elevation hover/active pair as #fly-go,
   the fly bar's filled-accent CTA, guarded by :not(:disabled) like .task-move.
   Rest declarations only gain the transition — rest-state pixels do not move. */
.landing-execute, .release-execute, .pr-review-execute, .issue-triage-execute, .pool-client-execute, .report-execute, .pool-client-fly { transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.landing-execute:not(:disabled):hover, .landing-execute:not(:disabled):focus-visible, .release-execute:not(:disabled):hover, .release-execute:not(:disabled):focus-visible, .pr-review-execute:not(:disabled):hover, .pr-review-execute:not(:disabled):focus-visible, .issue-triage-execute:not(:disabled):hover, .issue-triage-execute:not(:disabled):focus-visible, .pool-client-execute:not(:disabled):hover, .pool-client-execute:not(:disabled):focus-visible, .report-execute:not(:disabled):hover, .report-execute:not(:disabled):focus-visible, .pool-client-fly:not(:disabled):hover, .pool-client-fly:not(:disabled):focus-visible { border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.landing-execute:not(:disabled):active, .release-execute:not(:disabled):active, .pr-review-execute:not(:disabled):active, .issue-triage-execute:not(:disabled):active, .pool-client-execute:not(:disabled):active, .report-execute:not(:disabled):active, .pool-client-fly:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.issue-triage-result { margin-top: var(--space-1); font-size: var(--text-sm); text-align: end; }
.issue-triage-result:empty { display: none; }
.issue-triage-result-ok { color: var(--color-success); }
.issue-triage-result-fail { color: var(--color-sev-critical); }
.report-panel { border: 1px solid var(--color-border); border-radius: var(--shape-medium); box-shadow: var(--elevation-level-1); margin-top: var(--space-3); }
.report-details { padding: var(--space-3) var(--space-4); }
.report-title { margin: 0; font-size: var(--text-base); cursor: pointer; border-radius: var(--shape-extra-small); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.report-title:hover, .report-title:focus-visible { background: var(--color-surface-raised); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.report-title:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.report-body { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-2); }
.report-body label { font-size: var(--text-xs); color: var(--color-text-muted); }
.report-desc, .report-action { font: inherit; font-size: var(--text-sm); padding: var(--space-2); border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); resize: vertical; }
.report-preview {
  font: inherit; font-size: var(--text-sm); cursor: pointer; align-self: flex-start;
  padding: var(--space-2) var(--space-3); border-radius: var(--shape-extra-small);
  border: 1px solid var(--color-border); background: transparent; color: var(--color-text);
  transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard);
}
.report-preview:not(:disabled):hover, .report-preview:not(:disabled):focus-visible { color: var(--color-text); border-color: var(--color-accent); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.report-preview:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.report-preview:disabled { opacity: 0.6; cursor: default; }
.report-plan:empty, .report-result:empty { display: none; }
.report-summary { margin: 0 0 var(--space-2); font-size: var(--text-sm); }
.report-execute { font: inherit; font-size: var(--text-sm); cursor: pointer; padding: var(--space-1) var(--space-3); border-radius: var(--shape-extra-small); border: 1px solid var(--color-accent); background: var(--color-accent); color: var(--color-accent-text); align-self: flex-start; }
.report-execute:disabled { opacity: 0.6; cursor: default; }
.report-result { margin-top: var(--space-1); font-size: var(--text-sm); }
.report-result-ok { color: var(--color-success); }
.report-result-fail { color: var(--color-sev-critical); }
/* REPORT UNIFICATION 1/2 (epic 0015, operator course correction): the single
   right-click "📮 Report from here" custom context menu + hidden dialog
   (web/features/report-menu.ts) — additive, alongside the eight
   .report-panel forms above until REPORT UNIFICATION 2/2 removes them. The
   dialog reuses .report-desc/.report-action/.report-preview/.report-plan/
   .report-result/.report-summary/.report-execute verbatim (same preview/
   execute UX, different container), so only the menu popup and the dialog
   shell itself need new rules here. */
.report-ctx-menu {
  position: fixed; z-index: 60; min-width: 200px; padding: var(--space-1);
  background: var(--color-surface-raised); border: 1px solid var(--color-border);
  border-radius: var(--shape-medium); box-shadow: var(--elevation-level-2);
}
.report-ctx-menu-item {
  display: block; width: 100%; text-align: start; font: inherit; font-size: var(--text-sm);
  cursor: pointer; padding: var(--space-2) var(--space-3); border-radius: var(--shape-extra-small);
  border: 1px solid transparent; background: transparent; color: var(--color-text);
  transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard);
}
.report-ctx-menu-item:hover, .report-ctx-menu-item:focus-visible { background: var(--color-surface); border-color: var(--color-border); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.report-ctx-menu-item:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.report-ctx-menu-head { font-family: var(--font-mono, monospace); font-size: var(--text-xs, 11px); color: var(--color-text-muted); padding: var(--space-1) var(--space-2); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.report-ctx-menu-sep { border-top: 1px solid var(--color-border); margin: var(--space-1) 0; }
.report-dialog-overlay {
  position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center; padding: var(--space-4);
}
.report-dialog-overlay[hidden] { display: none; }
.report-dialog {
  position: relative; width: 100%; max-width: 560px; max-height: 85vh; overflow-y: auto;
  background: var(--color-surface-raised); border: 1px solid var(--color-border);
  border-radius: var(--shape-medium); padding: var(--space-5); box-shadow: var(--elevation-level-2);
  display: flex; flex-direction: column; gap: var(--space-2);
}
.report-dialog-title { margin: 0 var(--space-6) 0 0; font-size: var(--text-lg); }
.report-dialog-capture {
  margin: 0; max-height: 30vh; overflow: auto; white-space: pre-wrap; word-break: break-word;
  font-size: var(--text-xs); color: var(--color-text-muted); background: var(--color-surface);
  border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: var(--space-2);
}
/* Report dialog ✕ (COCKPIT 6/6): the same MX shape-morph + elevation
   hover/active pair its outline-chip siblings #fly-browse-btn / .docs-file
   carry, keeping its surface wash. Never disabled, so no guard. */
.report-dialog-close {
  position: absolute; top: var(--space-3); inset-inline-end: var(--space-3); font: inherit; font-size: var(--text-sm);
  cursor: pointer; width: 28px; height: 28px; line-height: 1; border-radius: var(--shape-extra-small);
  border: 1px solid var(--color-border); background: transparent; color: var(--color-text-muted);
  transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard);
}
.report-dialog-close:hover, .report-dialog-close:focus-visible { color: var(--color-text); background: var(--color-surface); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.report-dialog-close:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.pool-client-panel { background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--shape-medium); padding: var(--space-3) var(--space-4); box-shadow: var(--elevation-level-1); margin-bottom: var(--space-3); }
.pool-client-title { margin: 0 0 var(--space-2); font-size: var(--text-base); }
.pool-client-item { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2) 0; border-top: 1px solid var(--color-border); }
.pool-client-item:first-of-type { border-top: none; }
.pool-client-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2); }
.pool-client-number { font-family: var(--font-mono); color: var(--color-text-muted); }
.pool-client-issue-title { margin: 0; font-size: var(--text-sm); }
.pool-client-badge-claim { color: var(--color-success); border-color: var(--color-success); }
.pool-client-badge-skip { color: var(--color-text-muted); border-color: var(--color-border); opacity: 0.7; }
.pool-client-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-1); }
.pool-client-project { font: inherit; font-size: var(--text-sm); padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); }
/* .pool-client-fly (COCKPIT 6/6): the post-claim "Fly" button
   features/pool-client.ts appends to the item after a claim that queued a
   local board task (disabled for its /api/fly round-trip) had NO rule at all —
   a raw UA-default <button> stretched across the item column, right where the
   styled Claim CTA had just been. Its className is assigned two statements
   after createElement, so the grep-adjacent rule-less-control audit saw an
   anonymous button. It IS a panel execute CTA, so it SHARES the Claim rules
   (rest, :disabled, and a seat in the execute-CTA family block above) rather
   than copying their bodies; its only own declaration parks it at the column
   end, where the Claim row's flex-end actions row sat. */
.pool-client-execute, .pool-client-fly { font: inherit; font-size: var(--text-sm); cursor: pointer; padding: var(--space-1) var(--space-3); border-radius: var(--shape-extra-small); border: 1px solid var(--color-accent); background: var(--color-accent); color: var(--color-accent-text); }
.pool-client-execute:disabled, .pool-client-fly:disabled { opacity: 0.6; cursor: default; }
.pool-client-fly { align-self: flex-end; }
.pool-client-result { margin-top: var(--space-1); font-size: var(--text-sm); text-align: end; }
.pool-client-result:empty { display: none; }
.pool-client-result-ok { color: var(--color-success); }
.pool-client-result-fail { color: var(--color-sev-critical); }
.publicity-panel { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3); }
.publicity-link { font-size: var(--text-sm); padding: var(--space-1) var(--space-3); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: var(--color-surface-raised); color: var(--color-text); text-decoration: none; }
/* Publicity anchor chips (COCKPIT 6/6): the live affordance links are
   outline chips — structural twins of .docs-file (same --shape-extra-small
   rest radius, same accent-border hover) — and now share its MX idiom:
   shape-morph + --elevation-level-1 lift on hover/focus-visible, pressed-flat
   active, the radius/shadow transition at rest. An <a href> takes its
   pointer cursor from the UA, which is how it escaped the cursor: pointer
   audit. The transition sits on the -live class, NOT the shared base, so the
   dormant aria-disabled <span> stays state-free. */
.publicity-link-live { transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.publicity-link-live:hover, .publicity-link-live:focus-visible { border-color: var(--color-accent); color: var(--color-accent); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.publicity-link-live:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.publicity-link-dormant { color: var(--color-text-muted); cursor: default; opacity: 0.7; }
/* The affordance's live GitHub count (stars/watchers/forks), served by
   /api/publicity so the number lives IN the page instead of only behind the
   link — tabular-nums like .phase-count so a rolling count never jitters
   the chip's width, and inherit-colored so the -live hover's accent voice
   recolors the badge together with its label. */
.publicity-count { margin-inline-start: var(--space-2); padding: 0 var(--space-2); border: 1px solid var(--color-border); border-radius: var(--shape-extra-small); font-size: var(--text-xs); font-variant-numeric: tabular-nums; color: inherit; background: var(--color-surface); }
.heatmap-wrap { background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--shape-medium); padding: var(--space-3) var(--space-4); box-shadow: var(--elevation-level-1); }
.heatmap-grid { display: block; margin-top: var(--space-2); }
.heat-cell { cursor: default; }
.heat-cell:hover, .heat-cell:focus-visible { stroke: var(--color-accent); stroke-width: 2px; }
.heat-empty { fill: var(--color-border); }
.heat-other { fill: var(--color-sev-medium); opacity: 0.55; }
.heat-death { fill: var(--color-sev-high); }
.heat-ship-1 { fill: var(--color-success); opacity: 0.4; }
.heat-ship-2 { fill: var(--color-success); opacity: 0.65; }
.heat-ship-3 { fill: var(--color-success); opacity: 0.85; }
.heat-ship-4 { fill: var(--color-success); opacity: 1; }
.heatmap-legend { margin: var(--space-2) 0 0; font-size: var(--text-xs); }
.eval-trend-wrap { background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--shape-medium); padding: var(--space-3) var(--space-4); box-shadow: var(--elevation-level-1); }
.eval-trend-grid { display: block; margin-top: var(--space-2); max-width: 24rem; }
.eval-trend-bar { cursor: default; }
.eval-trend-bar:hover, .eval-trend-bar:focus-visible { stroke: var(--color-accent); stroke-width: 2px; }
/* Verdict-free week: a flat baseline marker in the shared no-data neutral
   (.heat-empty/.spark-no convention) — without this rule the rect painted in
   the SVG default fill, black, in BOTH themes. Focusable like its bar
   siblings, so it carries the same designed ring. */
.eval-trend-empty { fill: var(--color-border); cursor: default; }
.eval-trend-empty:hover, .eval-trend-empty:focus-visible { stroke: var(--color-accent); stroke-width: 2px; }
.eval-approve { fill: var(--color-success); }
.eval-reject { fill: var(--color-sev-high); }
.eval-trend-legend { margin: var(--space-2) 0 0; font-size: var(--text-xs); }
.tasks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
/* flex-wrap + a growing title (min ~16rem before wrapping) — a long task title
   fills the row and wraps as TEXT, never collapses to one-character columns
   (overflow-wrap:anywhere makes min-content ≈ 1ch, so the title must GROW). */
.task { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2); font-size: var(--text-sm); }
.task-title { flex: 1 1 16rem; min-width: 0; overflow-wrap: anywhere; color: var(--color-text); }
.task-queued { color: var(--color-text-muted); }
.task-in_progress { color: var(--color-accent-text); background: var(--color-accent); border-color: var(--color-accent); }
.task-done { color: var(--color-success); border-color: var(--color-success); }
.task-needs_approval { color: var(--color-needs-you); border-color: var(--color-needs-you); }
.chip.sev-critical { color: var(--color-sev-critical); border-color: var(--color-sev-critical); }
.chip.sev-high { color: var(--color-sev-high); border-color: var(--color-sev-high); }
.task-focused { border-inline-start: 3px solid var(--color-accent); padding-inline-start: var(--space-2); background: color-mix(in srgb, var(--color-accent) 8%, transparent); border-radius: var(--shape-extra-small); }
.task-dimmed { opacity: 0.45; }
.task-drag-handle { cursor: grab; color: var(--color-text-muted); font-size: var(--text-sm); padding: 0 2px; user-select: none; touch-action: none; }
.task[draggable="true"]:active { cursor: grabbing; }
.task-dragging { opacity: 0.4; }
.focus-note { margin: 0 0 var(--space-2); font-size: var(--text-xs); font-weight: 600; color: var(--color-accent); }
.task-move { font: inherit; font-size: var(--text-xs); cursor: pointer; padding: 0 6px; border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-muted); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.task-move:not(:disabled):hover, .task-move:not(:disabled):focus-visible { color: var(--color-text); border-color: var(--color-text-muted); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.task-move:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.task-focus-btn { font: inherit; font-size: var(--text-xs); cursor: pointer; padding: 0 5px; border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: transparent; filter: grayscale(1); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.task-focus-btn.on { filter: none; border-color: var(--color-accent); background: color-mix(in srgb, var(--color-accent) 15%, transparent); }
.task-focus-btn:not(:disabled):hover, .task-focus-btn:not(:disabled):focus-visible { border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.task-focus-btn:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.task-done-btn { margin-inline-start: auto; font: inherit; font-size: var(--text-xs); cursor: pointer; padding: 2px var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-success); background: transparent; color: var(--color-success); white-space: nowrap; transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.task-done-btn:not(:disabled):hover, .task-done-btn:not(:disabled):focus-visible { color: var(--color-accent-text); background: var(--color-success); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.task-done-btn:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.task-done-btn:disabled { opacity: 0.6; cursor: default; }
.task-approve-btn { border-color: var(--color-accent); color: var(--color-accent); }
.task-approve-btn:not(:disabled):hover, .task-approve-btn:not(:disabled):focus-visible { background: var(--color-accent); color: var(--color-accent-text); }
.task-delete-btn { font: inherit; font-size: var(--text-xs); cursor: pointer; padding: 2px var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-muted); white-space: nowrap; transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.task-delete-btn:not(:disabled):hover, .task-delete-btn:not(:disabled):focus-visible { border-color: var(--color-sev-critical); color: var(--color-sev-critical); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.task-delete-btn:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.task-delete-btn:disabled { opacity: 0.6; cursor: default; }
.task-add { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-3); }
.task-add label { font-size: var(--text-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.task-add input { flex: 1; min-width: 120px; font: inherit; font-size: var(--text-sm); padding: var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); }
.task-add button { font: inherit; font-size: var(--text-sm); font-weight: 600; cursor: pointer; padding: var(--space-2) var(--space-3); border-radius: var(--shape-extra-small); border: 1px solid var(--color-accent); background: var(--color-accent); color: var(--color-accent-text); position: relative; overflow: hidden; box-shadow: var(--elevation-level-1); transition: box-shadow var(--duration-short4) var(--easing-standard); }
.task-add button:disabled { opacity: 0.6; cursor: default; }
.inbox-add { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); margin-top: var(--space-3); }
.inbox-add label { font-size: var(--text-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.inbox-add textarea { width: 100%; box-sizing: border-box; resize: vertical; font: inherit; font-size: var(--text-sm); padding: var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); }
.inbox-add button { font: inherit; font-size: var(--text-sm); font-weight: 600; cursor: pointer; padding: var(--space-2) var(--space-3); border-radius: var(--shape-extra-small); border: 1px solid var(--color-accent); background: var(--color-accent); color: var(--color-accent-text); position: relative; overflow: hidden; box-shadow: var(--elevation-level-1); transition: box-shadow var(--duration-short4) var(--easing-standard); }
.inbox-add button:disabled { opacity: 0.6; cursor: default; }
.card-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; margin-top: var(--space-1); }
.card-remove { font: inherit; font-size: var(--text-xs); cursor: pointer; padding: 2px var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-muted); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.card-remove:not(:disabled):hover, .card-remove:not(:disabled):focus-visible { color: var(--color-accent-text); background: var(--color-sev-high); border-color: var(--color-sev-high); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.card-remove:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.card-remove:disabled { opacity: 0.6; cursor: default; }
.soul-proposal { width: 100%; margin-bottom: var(--space-2); border: 1px solid var(--color-needs-you); border-radius: var(--shape-extra-small); padding: var(--space-2); }
/* SOUL-surface controls (COCKPIT 4/6): the same MX shape-morph + elevation
   hover/active pair the board's task buttons and the flight-log toggles
   carry. The summary and ratify button keep --color-needs-you through hover
   (magenta = needs the operator — a meaning, so it may not wash out on
   state); ratify strengthens with a translucent needs-you wash, the same
   color-mix pattern .task-focus-btn.on uses with accent, never a solid fill
   (needs-you is contrast-verified as TEXT, not as a backdrop). Rest
   declarations only gain their transition — rest-state pixels do not move. */
.soul-proposal-summary { font-size: var(--text-xs); color: var(--color-needs-you); cursor: pointer; border-radius: var(--shape-extra-small); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.soul-proposal-summary:hover, .soul-proposal-summary:focus-visible { background: var(--color-surface-raised); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.soul-proposal-summary:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.soul-proposal-text { white-space: pre-wrap; word-break: break-word; font-size: var(--text-xs); max-height: 16rem; overflow: auto; margin: var(--space-2) 0; }
.soul-proposal-row { display: flex; gap: var(--space-2); }
.soul-ratify-btn, .soul-dismiss-btn { font: inherit; font-size: var(--text-xs); cursor: pointer; padding: 2px var(--space-2); border-radius: var(--shape-extra-small); background: transparent; transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.soul-ratify-btn { border: 1px solid var(--color-needs-you); color: var(--color-needs-you); }
.soul-dismiss-btn { border: 1px solid var(--color-border); color: var(--color-text-muted); }
.soul-ratify-btn:not(:disabled):hover, .soul-ratify-btn:not(:disabled):focus-visible { background: color-mix(in srgb, var(--color-needs-you) 15%, transparent); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.soul-dismiss-btn:not(:disabled):hover, .soul-dismiss-btn:not(:disabled):focus-visible { color: var(--color-text); border-color: var(--color-text-muted); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.soul-ratify-btn:not(:disabled):active, .soul-dismiss-btn:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.soul-ratify-btn:disabled, .soul-dismiss-btn:disabled { opacity: 0.6; cursor: default; }
.soul-unratify-row { width: 100%; display: flex; justify-content: flex-end; margin-bottom: var(--space-2); }
.soul-unratify-btn { font: inherit; font-size: var(--text-xs); cursor: pointer; padding: 2px var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-muted); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.soul-unratify-btn:not(:disabled):hover, .soul-unratify-btn:not(:disabled):focus-visible { color: var(--color-text); border-color: var(--color-text-muted); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.soul-unratify-btn:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.soul-unratify-btn:disabled { opacity: 0.6; cursor: default; }
.soul-editor { width: 100%; margin-bottom: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--shape-extra-small); padding: var(--space-2); }
.soul-editor-summary { font-size: var(--text-xs); color: var(--color-text-muted); cursor: pointer; border-radius: var(--shape-extra-small); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.soul-editor-summary:hover, .soul-editor-summary:focus-visible { color: var(--color-text); background: var(--color-surface-raised); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.soul-editor-summary:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.soul-editor-form { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); margin-top: var(--space-2); }
.soul-editor-form label { font-size: var(--text-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.soul-editor-form textarea { width: 100%; box-sizing: border-box; resize: vertical; font: inherit; font-size: var(--text-xs); padding: var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); }
.soul-editor-form button { font: inherit; font-size: var(--text-sm); font-weight: 600; cursor: pointer; padding: var(--space-2) var(--space-3); border-radius: var(--shape-extra-small); border: 1px solid var(--color-accent); background: var(--color-accent); color: var(--color-accent-text); position: relative; overflow: hidden; box-shadow: var(--elevation-level-1); transition: box-shadow var(--duration-short4) var(--easing-standard); }
.soul-editor-form button:disabled { opacity: 0.6; cursor: default; }

.control-proposal { width: 100%; margin-bottom: var(--space-2); border: 1px solid var(--color-needs-you); border-radius: var(--shape-extra-small); padding: var(--space-2); }
.control-proposal-summary { font-size: var(--text-xs); color: var(--color-needs-you); }
.control-proposal-text { white-space: pre-wrap; word-break: break-word; font-size: var(--text-xs); max-height: 16rem; overflow: auto; margin: var(--space-2) 0; }
.control-proposal-row { display: flex; gap: var(--space-2); }
/* ARCHITECT confirm CTA (COCKPIT 6/6): the needs-you outline-chip twin of
   .soul-ratify-btn, which shipped with zero hover/focus/active feedback on the
   one button that authorizes a possibly destructive action. Same treatment as
   its twin — translucent needs-you wash (never a solid fill: needs-you is
   contrast-verified as TEXT, not a backdrop) + MX shape-morph + elevation on
   hover/focus-visible, pressed-flat active. Rest gains only the transition —
   rest-state pixels do not move. */
.control-proposal-confirm { font: inherit; font-size: var(--text-xs); cursor: pointer; padding: 2px var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-needs-you); background: transparent; color: var(--color-needs-you); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.control-proposal-confirm:not(:disabled):hover, .control-proposal-confirm:not(:disabled):focus-visible { background: color-mix(in srgb, var(--color-needs-you) 15%, transparent); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.control-proposal-confirm:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.control-proposal-confirm:disabled { opacity: 0.6; cursor: default; }
.control-proposal-status { font-size: var(--text-xs); color: var(--color-text-muted); }

.detail { margin-top: var(--space-1); }
/* Project-card "Details" disclosure (COCKPIT 4/6): the same MX shape-morph +
   elevation hover/active pair .soul-editor-summary and the flight-log toggles
   carry. Rest gains only border-radius + transition — no background/border at
   rest, so rest-state pixels (and the checked-in visual baselines) do not move. */
.detail summary { cursor: pointer; font-size: var(--text-sm); color: var(--color-text-muted); border-radius: var(--shape-extra-small); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.detail summary:hover, .detail summary:focus-visible { color: var(--color-text); background: var(--color-surface-raised); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.detail summary:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.detail-body { margin-top: var(--space-2); display: flex; flex-direction: column; gap: var(--space-2); }
.detail-h { margin: var(--space-2) 0 0; font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); font-weight: 600; }
/* One patchable subsection (heading + content) inside .detail-body — see
   updateDetailPanel in shell.ts. Same nested flex/gap as .detail-body so
   wrapping a heading with its content changes nothing visually. */
.detail-section { display: flex; flex-direction: column; gap: var(--space-2); }
.facts { display: grid; grid-template-columns: auto 1fr; gap: 2px var(--space-3); margin: 0; font-size: var(--text-xs); }
.facts dt { color: var(--color-text-muted); }
.facts dd { margin: 0; font-family: var(--font-mono); }
.langbar { display: flex; gap: 2px; height: 6px; border-radius: var(--radius-sm); overflow: hidden; }
.langseg { min-width: 3px; background: var(--color-accent); }
.legend { margin: 0; padding-inline-start: var(--space-4); font-size: var(--text-xs); color: var(--color-text-muted); }
.flightlog { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; font-size: var(--text-xs); }
.flight { display: flex; flex-direction: column; gap: 0; }
/* Flight-log toggles (COCKPIT 4/6): the same MX shape-morph + elevation
   hover/active pair the phase-rail segments, board buttons, and fly-bar CTAs
   carry. Rest radius swaps --radius-md for --shape-small (both 8px) so the
   state tokens pair with their own rest value — rest-state pixels do not
   move. The .flight-open rule stays AFTER the hover pair so an open row
   keeps its accent border through hover/press. */
.flight-head { display: flex; align-items: center; gap: var(--space-2); width: 100%; background: none; border: 1px solid transparent; border-radius: var(--shape-small); padding: 3px var(--space-2); font: inherit; color: inherit; cursor: pointer; text-align: start; transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.flight-head:hover, .flight-head:focus-visible { border-color: var(--color-border); background: var(--color-surface-raised); border-radius: var(--shape-small-hover); box-shadow: var(--elevation-level-1); }
.flight-head:active { border-radius: var(--shape-small-pressed); box-shadow: none; }
.flight-open .flight-head { border-color: var(--color-accent); }
.flight-dot { width: 8px; height: 8px; border-radius: var(--radius-full); flex: none; }
/* Flight-row hierarchy (COCKPIT 4/6): the same content-over-chrome pair the
   firing rows carry (.firing-toggle muted, .firing-headline full) — the
   headline is the content, explicit at full strength; cost/turns/ago are
   chrome and read muted like .flight-sha already did. */
.flight-item { font-size: var(--text-sm); color: var(--color-text); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1 1 auto; }
.flight-slice-chip { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-accent); border-color: var(--color-accent); }
.flight-autoformat-chip { flex: none; }
.flight-guard-chip { flex: none; }
.flight-group .flight-item { font-weight: 600; }
.flight-group-members { list-style: none; margin-block: 2px var(--space-2); margin-inline: var(--space-4) 0; padding-inline-start: var(--space-3); display: flex; flex-direction: column; gap: 2px; border-inline-start: 2px solid var(--color-border); }
.flight-group-member { display: flex; align-items: center; gap: var(--space-2); padding: 2px var(--space-2); font-size: var(--text-xs); }
.flight-group-member .flight-item { font-size: var(--text-xs); opacity: 0.85; }
.flight-detail { margin-block: 2px var(--space-2); margin-inline: var(--space-4) 0; padding: var(--space-2) var(--space-3); border-inline-start: 2px solid var(--color-accent); }
.flight-detail-title { margin: 0 0 var(--space-1); font-size: var(--text-sm); }
.flight-detail p { margin: 0 0 2px; font-size: var(--text-xs); }
.flight-more { font: inherit; font-size: var(--text-xs); font-variant-numeric: tabular-nums; cursor: pointer; margin-top: var(--space-1); padding: 2px var(--space-3); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: none; color: var(--color-text-muted); transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.flight-more:hover, .flight-more:focus-visible { border-color: var(--color-accent); color: var(--color-text); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.flight-more:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.flight-verdict { padding: 0 6px; border-radius: var(--radius-full); font-size: var(--text-xs); }
.flight-shipped { color: var(--color-accent-text); background: var(--color-success); }
.flight-reverted { color: var(--color-accent-text); background: var(--color-sev-high); }
.flight-no { color: var(--color-text-muted); border: 1px solid var(--color-border); }
.flight-dot.flight-no { background: var(--color-border); border: 0; }
/* NOOP→VERDICT (lever 6): a no-commit firing that still named a verdict via
   PROPOSALS reads as real information, not the same waste as a silent
   no-commit — distinct accent color instead of collapsing into .flight-no. */
.flight-verdict-carrying { color: var(--color-accent-text); background: var(--color-accent); }
.flight-turn-capped, .flight-timed-out, .flight-errored { color: var(--color-accent-text); background: var(--color-sev-high); }
.flight-unverified, .flight-checkpointed { color: var(--color-accent-text); background: var(--color-sev-medium); }
.flight-reason { font-style: italic; }
.flight-sha { font-family: var(--font-mono); color: var(--color-text-muted); }
.flight-cost { font-family: var(--font-mono); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
/* Cost semantics v3 (epic 0013): the real, subscription-apportioned cost sits
   next to (never replaces) the list-price .flight-cost figure — smaller and
   italic marks it as the secondary, derived number. */
.flight-real-cost { font-family: var(--font-mono); font-size: var(--text-xs); font-style: italic; color: var(--color-text-muted); opacity: 0.75; font-variant-numeric: tabular-nums; }
.flight-turns { font-family: var(--font-mono); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.flight-ago { margin-inline-start: auto; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.metrics { display: flex; flex-direction: column; gap: var(--space-2); }
.model-mix { display: flex; align-items: baseline; gap: var(--space-2); flex-wrap: wrap; }
.chip-model { font-family: var(--font-mono); }
.spark { width: 100%; height: 34px; display: block; }
.spark-shipped { fill: var(--color-success); }
.spark-reverted, .spark-turn-capped, .spark-timed-out, .spark-errored { fill: var(--color-sev-high); }
.spark-unverified, .spark-checkpointed { fill: var(--color-sev-medium); }
.spark-no { fill: var(--color-border); }
.spark-verdict-carrying { fill: var(--color-accent); }
.spark-bar { cursor: pointer; }
.spark-bar:hover, .spark-bar:focus-visible { stroke: var(--color-accent); stroke-width: 2px; }
/* FLIGHT TIMELINE strip: same verdict-color rects as .spark, but width (not
   height) encodes each firing's relative duration across the whole flight. */
.timeline-strip { width: 100%; height: 14px; display: block; margin-top: var(--space-2); }
/* Per-firing PROGRESS bar (live worker card): elapsed vs. this project's own
   average firing duration — a single fill, unlike .gauge's multi-segment
   composition. .live-progress-over recolors the fill when a firing is
   running longer than its own history, an informational cue, not an alarm.
   The fill animates scaleX, not width (compositor-only motion contract);
   width-based growth followed inline-start for free, a transform needs the
   :dir(rtl) origin flip to keep it. */
.live-progress, .fly-progress { width: 100%; height: 6px; border-radius: var(--radius-sm); background: var(--color-border); overflow: hidden; margin-top: 4px; }
.live-progress-fill, .fly-progress-fill { height: 100%; background: var(--color-accent); border-radius: var(--radius-sm); transform: scaleX(0); transform-origin: left; transition: transform var(--duration-normal) var(--ease); }
.live-progress-fill:dir(rtl), .fly-progress-fill:dir(rtl) { transform-origin: right; }
.live-progress-over .live-progress-fill { background: var(--color-sev-medium); }
/* Shared tooltip primitive: any [data-tip] element gets a focus ring + the
   same hover/focus tooltip as the spark bars (see showTip/hideTip below). */
[data-tip]:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
.spark-tip { position: fixed; z-index: 60; max-width: 240px; padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-raised); color: var(--color-text); font-size: var(--text-xs); line-height: 1.4; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3); pointer-events: none; }
.spark-tip-title { display: block; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spark-tip-meta { font-family: var(--font-mono); color: var(--color-text-muted); }
.activity { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; font-size: var(--text-xs); }
.act { display: flex; gap: var(--space-2); align-items: center; min-width: 0; }
.act-tool { font-weight: 600; padding: 0 5px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); white-space: nowrap; }
.act-command { color: var(--color-accent-text); background: var(--color-accent); border-color: var(--color-accent); }
.act-file { color: var(--color-sev-low); border-color: var(--color-sev-low); }
.act-search { color: var(--color-sev-medium); border-color: var(--color-sev-medium); }
.act-target { font-family: var(--font-mono); color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.act-icon { width: 14px; height: 14px; flex: none; color: var(--color-text-muted); }
.act-icon path, .act-icon circle, .act-icon rect { fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
.act-sentence { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.act-wrap-row { display: flex; flex-direction: column; gap: 2px; }
.act-reason { margin: 0; padding-inline-start: 22px; font-style: italic; white-space: normal; }
.act-meta { margin: 0; padding-inline-start: 22px; font-family: var(--font-mono); font-size: 0.85em; }
.act-wrap { display: flex; flex-direction: column; gap: var(--space-2); }
.phaserail { display: flex; align-items: center; gap: 4px; }
/* Phase-rail segments (COCKPIT 4/6): the same MX shape-morph + elevation
   hover/active pair the board's .task-move/.task-focus-btn buttons and the
   fly-bar CTAs already carry. Rest radius swaps --radius-sm for
   --shape-extra-small so the hover/pressed shape tokens pair with their own
   rest value — both are 4px, so rest-state pixels (and the checked-in visual
   baselines) do not move. The [aria-expanded="true"] rule stays LAST so an
   expanded segment keeps its inset accent indicator through hover/press. */
.phase { display: flex; flex-direction: column; align-items: center; padding: 2px var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); color: var(--color-text-muted); min-width: 46px; background: none; font: inherit; cursor: pointer; transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.phase:hover, .phase:focus-visible { border-color: var(--color-accent); color: var(--color-text); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.phase:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.phase[aria-expanded="true"] { border-color: var(--color-accent); color: var(--color-text); box-shadow: inset 0 -2px 0 var(--color-accent); }
.phase-detail { margin-top: var(--space-2); padding: var(--space-2) var(--space-3); border: 1px dashed var(--color-border); border-radius: var(--radius-md); }
.phase-detail-title { margin: 0 0 var(--space-1); font-size: var(--text-xs); font-variant-numeric: tabular-nums; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); }
.phase-acts { max-height: 14rem; overflow-y: auto; }
.phase-on { color: var(--color-accent-text); background: var(--color-accent); border-color: var(--color-accent); }
.phase-name { text-transform: uppercase; letter-spacing: 0.04em; font-size: 9px; }
.phase-count { font-weight: 700; font-variant-numeric: tabular-nums; font-size: var(--text-sm); color: var(--color-text); }
.phase-on .phase-count { color: var(--color-accent-text); }
.phase-arrow { color: var(--color-text-muted); }
.flightmap { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px; }
.fnode { display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-mono); font-size: var(--text-xs); padding: 2px var(--space-2); border-radius: var(--radius-sm); border: 1px solid var(--color-border); color: var(--color-text-muted); max-width: 100%; }
.fnode-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fnode-count { font-weight: 700; font-variant-numeric: tabular-nums; }
.fnode-do { color: var(--color-sev-low); border-color: var(--color-sev-low); }
.fnode-gate { color: var(--color-sev-medium); border-color: var(--color-sev-medium); }
.fnode-commit { color: var(--color-accent-text); background: var(--color-accent); border-color: var(--color-accent); }
.firing-timeline { display: flex; flex-direction: column; gap: 4px; }
.firing-toggle { display: flex; align-items: center; gap: var(--space-2); width: 100%; text-align: start; padding: 3px var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: none; font: inherit; font-size: var(--text-xs); color: var(--color-text-muted); cursor: pointer; transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.firing-toggle:hover, .firing-toggle:focus-visible { border-color: var(--color-accent); color: var(--color-text); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.firing-toggle:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.firing-toggle[aria-expanded="true"] { border-color: var(--color-accent); color: var(--color-text); }
.firing-headline { font-family: var(--font-mono); color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1 1 auto; }
.firing-count { font-variant-numeric: tabular-nums; }
.firing-ago { margin-inline-start: auto; font-variant-numeric: tabular-nums; }
.firing-detail { margin-block: 0 var(--space-2); margin-inline-start: var(--space-3); padding-inline-start: var(--space-3); border-inline-start: 2px solid var(--color-border); }
.diff-toggle { display: inline-flex; align-items: center; margin-block: 0 var(--space-2); margin-inline-start: var(--space-3); padding: 2px var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: none; font: inherit; font-size: var(--text-xs); color: var(--color-text-muted); cursor: pointer; transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.diff-toggle:hover, .diff-toggle:focus-visible { border-color: var(--color-accent); color: var(--color-text); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.diff-toggle:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.diff-toggle[aria-expanded="true"] { border-color: var(--color-accent); color: var(--color-text); }
.firing-diff { margin-block: 0 var(--space-2); margin-inline-start: var(--space-3); padding: var(--space-2); border-inline-start: 2px solid var(--color-border); background: var(--color-surface-raised); font-family: var(--font-mono); font-size: var(--text-xs); overflow-x: auto; white-space: pre; }
.firing-diff-empty { margin-block: 0 var(--space-2); margin-inline-start: var(--space-3); }
/* Designed loading state (COCKPIT 5/6): the "Loading full trace…"/"Loading
   diff…" indicators shipped as bare .muted text with no rule — an undesigned
   loading state that read like any other muted caption. They now share their
   firing-replay siblings' indentation and breathe via the shared live-pulse
   opacity animation so the panel reads as ACTIVELY fetching; the global
   prefers-reduced-motion block (below) collapses that breath to static. */
.firing-trace-loading { margin-block: 0 var(--space-2); margin-inline-start: var(--space-3); animation: live-pulse 1.6s ease-in-out infinite; }
.diff-add { color: var(--color-success); }
.diff-remove { color: var(--color-sev-high); }
.diff-hunk, .diff-meta { color: var(--color-text-muted); }
.diff-file { color: var(--color-text-muted); font-weight: 700; }
.diff-context { color: var(--color-text); }
.firing-replay-single { border-inline-start-color: var(--color-accent); }
.replay-nav { display: flex; align-items: center; gap: var(--space-2); margin-block: 0 var(--space-2); margin-inline-start: var(--space-3); }
/* Replay prev/next (COCKPIT 4/6): the same MX shape-morph + elevation
   hover/active pair their flight-log siblings .firing-toggle and .diff-toggle
   carry, guarded by :not(:disabled) — replay pins prev/next disabled at the
   ends of the firing list. */
.replay-nav-btn { display: inline-flex; align-items: center; padding: 2px var(--space-2); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); background: none; font: inherit; font-size: var(--text-xs); color: var(--color-text-muted); cursor: pointer; transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.replay-nav-btn:hover:not(:disabled), .replay-nav-btn:focus-visible:not(:disabled) { border-color: var(--color-accent); color: var(--color-text); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.replay-nav-btn:active:not(:disabled) { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.replay-nav-btn:disabled { opacity: 0.4; cursor: default; }
.replay-nav-label { font-size: var(--text-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
/* Replay exit (COCKPIT 4/6): a link-style tertiary control, so its MX pair is
   the surface-raise treatment .detail summary and .soul-editor-summary carry
   (borderless text controls raise a surface instead of recoloring a border),
   with the same shape-morph + elevation hover/active as its .replay-nav-btn
   siblings. Never disabled, so no :not(:disabled) guard. */
.replay-nav-exit { display: inline-flex; align-items: center; margin-inline-start: auto; padding: 2px var(--space-2); border-radius: var(--shape-extra-small); border: none; background: none; font: inherit; font-size: var(--text-xs); color: var(--color-text-muted); cursor: pointer; text-decoration: underline; transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard); }
.replay-nav-exit:hover, .replay-nav-exit:focus-visible { color: var(--color-text); background: var(--color-surface-raised); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.replay-nav-exit:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }

.live-worker { display: flex; flex-direction: column; gap: 4px; padding: var(--space-2) var(--space-3); border: 1px solid var(--color-accent); border-radius: var(--radius-md); background: var(--color-surface-raised); box-shadow: var(--elevation-level-1); }
.live-worker-head { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); }
.live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-accent); flex-shrink: 0; animation: live-pulse 1.6s ease-in-out infinite; }
@keyframes live-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.live-worker-label { font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-accent); }
.live-worker-narrator { margin: 0; font-size: var(--text-sm); color: var(--color-text); min-width: 0; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
.live-worker-line { margin: 0; font-size: var(--text-xs); display: flex; gap: var(--space-2); align-items: baseline; flex-wrap: wrap; }
.live-worker-guess { color: var(--color-text-muted); font-style: italic; }
.live-worker-count, .live-worker-turns { margin: 0; font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
.live-phase-do { color: var(--color-sev-low); border-color: var(--color-sev-low); }
.live-phase-gate { color: var(--color-sev-medium); border-color: var(--color-sev-medium); }
.live-phase-commit { color: var(--color-accent-text); background: var(--color-accent); border-color: var(--color-accent); }

.office-map-wrap { margin: var(--space-2) 0; }
.office-map { width: 100%; max-width: 320px; height: auto; display: block; }
.office-zone { fill: var(--color-surface); stroke: var(--color-border); stroke-width: 1; }
.office-zone-active { fill: var(--color-accent); stroke: var(--color-accent); }
.office-zone-label { font-size: 8px; letter-spacing: 0.04em; text-transform: uppercase; fill: var(--color-text-muted); font-family: var(--font-sans); }
.office-zone-label-active { fill: var(--color-accent-text); }
.office-dot { fill: var(--color-accent); stroke: var(--color-surface); stroke-width: 1.5; }
.office-dot-idle { fill: var(--color-text-muted); opacity: 0.6; }
.office-satellite { fill: var(--color-accent); opacity: 0.55; stroke: var(--color-surface); stroke-width: 1; }

.empty { grid-column: 1 / -1; text-align: center; padding: var(--space-6) var(--space-4); color: var(--color-text-muted); }
.empty h2 { margin: 0 0 var(--space-2); color: var(--color-text); }
.empty .cmd { display: inline-block; margin-top: var(--space-3); font-family: var(--font-mono); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); }
.hint { padding: 0 var(--space-5) var(--space-5); color: var(--color-text-muted); font-size: var(--text-sm); }

/* Accessibility: keyboard skip-link, visible focus, respect reduced motion. */
.skip-link {
  position: absolute; inset-inline-start: -9999px; top: var(--space-2); z-index: 100;
  background: var(--color-accent); color: var(--color-accent-text);
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
}
.skip-link:focus { inset-inline-start: var(--space-3); }
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
main:focus { outline: none; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
}

/* First-run guided tour — a dismissible dialog explaining core vocabulary
   (firing/slice/gate/flight), opened via the masthead "Tour" button. */
.tour-btn {
  font: inherit; font-size: var(--text-sm); cursor: pointer;
  padding: var(--space-1) var(--space-3); border-radius: var(--radius-full);
  color: var(--color-text-muted); background: transparent; border: 1px solid var(--color-border);
  transition: box-shadow var(--duration-short2) var(--easing-standard);
}
.tour-btn:hover, .tour-btn:focus-visible { color: var(--color-text); box-shadow: var(--elevation-level-1); }
.tour-btn:active { box-shadow: none; }
.tour-overlay {
  position: fixed; inset: 0; z-index: 50; background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center; padding: var(--space-4);
}
/* The explicit display beats the hidden attribute's UA default — without this
   rule, closeTour() cleared the dialog but the full-screen backdrop stayed,
   leaving the whole page dimmed (field report, 2026-08-14). */
.tour-overlay[hidden] { display: none; }
.tour-dialog {
  width: 100%; max-width: 420px; background: var(--color-surface-raised);
  border: 1px solid var(--color-border); border-radius: var(--shape-medium);
  padding: var(--space-5); box-shadow: var(--elevation-level-2);
  display: flex; flex-direction: column; gap: var(--space-3);
}
.tour-dialog h2 { margin: 0; font-size: var(--text-lg); }
.tour-dialog p { margin: 0; color: var(--color-text-muted); font-size: var(--text-sm); line-height: 1.5; }
.tour-dots { display: flex; gap: var(--space-2); justify-content: center; }
.tour-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-border); }
.tour-dot[aria-current='true'] { background: var(--color-accent); }
.tour-actions { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
.tour-nav { display: flex; gap: var(--space-2); }
/* Tour CTA designed states (COCKPIT 6/6): the same MX shape-morph + elevation
   hover/active pair .fly-flight-actions button carries. Rest radius swaps
   --radius-sm for --shape-extra-small (both 4px) so the state tokens pair
   with their own rest value — rest-state pixels do not move. The group rule
   also reaches the filled .tour-next: its !important border/background win,
   but radius + shadow pass through (the .landing-execute treatment). */
.tour-actions button {
  font: inherit; font-size: var(--text-sm); cursor: pointer;
  padding: var(--space-2) var(--space-3); border-radius: var(--shape-extra-small);
  border: 1px solid var(--color-border); background: transparent; color: var(--color-text);
  transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard);
}
.tour-actions button:not(:disabled):hover, .tour-actions button:not(:disabled):focus-visible { border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.tour-actions button:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.tour-next {
  border-color: var(--color-accent) !important; background: var(--color-accent) !important;
  color: var(--color-accent-text) !important; font-weight: 600;
}

/* FLY-BAR folder UX, second slice (BOARD web-msrhr2d9-xxwa3a): the
   server-backed browse-a-folder modal. Same fixed-overlay/dialog shape as
   .tour-overlay/.tour-dialog (including the explicit [hidden] display:none —
   see the 2026-08-14 field report above), scoped to its own .browse-* classes
   rather than sharing the tour's since the two dialogs evolve independently. */
.browse-overlay {
  position: fixed; inset: 0; z-index: 50; background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center; padding: var(--space-4);
}
.browse-overlay[hidden] { display: none; }
.browse-dialog {
  width: 100%; max-width: 480px; max-height: 80vh; background: var(--color-surface-raised);
  border: 1px solid var(--color-border); border-radius: var(--shape-medium);
  padding: var(--space-5); box-shadow: var(--elevation-level-2);
  display: flex; flex-direction: column; gap: var(--space-3);
}
.browse-dialog h2 { margin: 0; font-size: var(--text-lg); }
.browse-path { margin: 0; color: var(--color-text-muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.browse-drives { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.browse-list { display: flex; flex-direction: column; gap: var(--space-1); overflow-y: auto; max-height: 40vh; }
.browse-entry, .browse-drive {
  font: inherit; font-size: var(--text-sm); text-align: start; cursor: pointer;
  padding: var(--space-2) var(--space-3); border-radius: var(--shape-extra-small);
  border: 1px solid transparent; background: transparent; color: var(--color-text);
  transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard);
}
/* Browse-row designed states (COCKPIT 6/6): the firing-236 hover/focus pairing
   shipped twice — byte-identical rules with shuffled selector order, a
   union-merge sync-back artifact — collapsed here to one rule and joined to
   the .flight-head row-button idiom: shape-morph + lift on hover/focus-visible,
   pressed radius flat on active. */
.browse-entry:hover, .browse-entry:focus-visible, .browse-drive:hover, .browse-drive:focus-visible { background: var(--color-surface); border-color: var(--color-border); border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.browse-entry:active, .browse-drive:active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.browse-drive { border-color: var(--color-border); font-variant-numeric: tabular-nums; }
.browse-up { color: var(--color-text-muted); }
.browse-empty { margin: 0; }
.browse-actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
/* Browse CTA designed states (COCKPIT 6/6): same pair as .tour-actions button
   above; radius + shadow reach the filled .browse-use through its !important
   border/background overrides. */
.browse-actions button {
  font: inherit; font-size: var(--text-sm); cursor: pointer;
  padding: var(--space-2) var(--space-3); border-radius: var(--shape-extra-small);
  border: 1px solid var(--color-border); background: transparent; color: var(--color-text);
  transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard);
}
.browse-actions button:not(:disabled):hover, .browse-actions button:not(:disabled):focus-visible { border-radius: var(--shape-extra-small-hover); box-shadow: var(--elevation-level-1); }
.browse-actions button:not(:disabled):active { border-radius: var(--shape-extra-small-pressed); box-shadow: none; }
.browse-use {
  border-color: var(--color-accent) !important; background: var(--color-accent) !important;
  color: var(--color-accent-text) !important; font-weight: 600;
}

/* BE-RIGHT-BACK overlay (BOARD web-msqgho43-yeqne3): a full-screen card shown
   on sustained /api/state loss (see web/shell.ts's refresh()/brbFailStreak),
   healing the instant a poll succeeds again. Same fixed-overlay shape as
   .tour-overlay, including its [hidden] fix (field report, 2026-08-14) — an
   explicit display:none beats the hidden attribute's UA default here too. */
.brb-overlay {
  position: fixed; inset: 0; z-index: 70; background: var(--color-surface);
  display: flex; align-items: center; justify-content: center; padding: var(--space-4);
}
.brb-overlay[hidden] { display: none; }
.brb-card { display: flex; flex-direction: column; align-items: center; gap: var(--space-3); text-align: center; }
.brb-plane { font-size: 2.5rem; display: inline-block; animation: brb-bob 2.4s ease-in-out infinite; }
@keyframes brb-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
.brb-title { margin: 0; font-size: var(--text-lg); font-weight: 600; color: var(--color-text); }
.brb-sub { margin: 0; color: var(--color-text-muted); font-size: var(--text-sm); }
.brb-progress {
  width: 160px; height: 4px; border-radius: var(--radius-full); overflow: hidden;
  background: var(--color-border);
}
.brb-progress span {
  display: block; width: 40%; height: 100%; border-radius: var(--radius-full);
  background: var(--color-accent); animation: brb-progress 1.4s ease-in-out infinite;
}
@keyframes brb-progress {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}
`.trim();
}
