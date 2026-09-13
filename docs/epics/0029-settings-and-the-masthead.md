<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0029. Settings and the masthead — one gear, icons not emoji, AAA within reach, GitHub as a first-class connection

Status: Active (2026-09-13). Slice 1 shipped the same day.

## The asks (operator, 2026-09-13)

- "Just as we have a Claude connection, we must be able to manage the GitHub
  connection settings."
- "As part of the nav bar remake: fewer emoji, icons or symbols, elegant text;
  think about which buttons and icons — settings and so on — go on top and which
  do not; SOTA level; full mobile fit."
- "In the terminal theme the user gets the default greenish-yellow phosphor,
  resettable at any time, and it unlocks a free-to-play HUD bar to play with the
  UX; in accessibility we want to get as close to AAA as possible: other fonts,
  other sizes, more or less relaxed spacing."

## Laws

1. **One gear.** Display and accessibility live in one Settings popover in the
   masthead; nothing about how the page looks is scattered across the chrome.
   The masthead's own icon-only triggers (theme, language, bell, settings,
   foundation) draw the stroke family of epic 0025 — no emoji in the chrome.
2. **A preference is an attribute on `<html>`** that the stylesheet reads
   (`data-text`, `data-font`, `data-density`, `data-motion`, `data-phosphor`).
   A default carries no attribute: a fresh page and a reset page are the same
   page. Saved in one key, applied before the first paint, one Reset.
3. **Toward AAA, honestly.** Text resizes to 125% without loss (WCAG 1.4.4),
   spacing widens (1.4.12), motion can be reduced regardless of the OS (2.3.3),
   every control clears the 24px floor (2.5.8), contrast stays 4.5:1 in every
   theme and phosphor (the oklch census guards it). What AAA asks beyond this —
   7:1 contrast, no timing, sign language — is named, not claimed.
4. **The phone masthead has two rows to give** and nothing more. Below `md` the
   OTLP indicator and the version chip step out; every trigger that stays is a
   44px target; the settings gear is the last control before Tour.
5. **GitHub is a connection, not a status line.** The Connect popover shows the
   GitHub identity (`gh auth status`), and gains the same verbs Claude has:
   log in (the device flow, its one-time code relayed to the screen), switch
   account, log out — each a preview/execute pair under the identity gate,
   never a free-form shell.
6. **The terminal HUD is play, not policy.** Under the terminal theme a floating
   bar offers the phosphor tint, scanlines, glow and the same text/spacing
   choices; every knob is a preference from law 2, so Reset always returns to
   the greenish-yellow default.

## Slices

1. **Shipped 2026-09-13:** the Settings popover (text size, font, density,
   motion, terminal phosphor, Reset), the stroke icons in the masthead's icon
   cluster (palette, globe, bell, gear, heart), the OTLP chip below `md`,
   `web/features/prefs.ts` and its laws in the real bundle under jsdom.
2. GitHub connection management: `gh auth login --web` relayed as a device
   code, switch, log out — `connection/gh-login.ts` + routes + the Connect
   popover's GitHub section.
3. The terminal HUD bar: scanlines and glow as preferences, the bar as a
   floating control under the terminal theme, dismissible, resettable.
4. The masthead census as a design: which controls stay on top on which
   window class, written down and pinned by the mobile/tablet specs.
5. Contrast and target-size census across phosphors and text scales (extend
   the oklch audit).

## Related

Epics 0017 (navigation remake), 0021 (app shell), 0025 (icons), 0028 (busy
states), `docs/CONTRAST-MATRIX.md`.
