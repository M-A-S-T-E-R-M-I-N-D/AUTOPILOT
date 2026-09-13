<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Pocket calculator — materials

Everything I have collected for the calculator I want. No code yet; this folder is the brief.

## What it must do

- A classic pocket calculator that opens as `index.html` in any browser and just works.
- Sequential evaluation like a real pocket calculator: `2 + 3 × 4 =` shows `20`, not `14`. State it on the page.
- Works by mouse AND keyboard: digits, `.`, `+ - * /`, `Enter` or `=` evaluates, `Escape` clears, `Backspace` deletes.
- Divide by zero shows `Error` and recovers on the next input — never a crash, never `Infinity`.
- Zero dependencies, zero build step: one `calc.js` (the pure state machine, no DOM, ≤150 lines), one `index.html`, one `style.css`.
- Tests first: `npm test` runs acceptance tests in `calc.test.js` against `calc.js` alone. The tests are the endpoint.

## Look

- Big display on top, right-aligned, monospace digits; keys in a 4-column grid below (see `references/keys.md`).
- Dark, quiet, high contrast; the `=` key is the one accent.
- Readable on a phone.

## Not wanted

- No operator precedence, no history tape, no scientific keys, no frameworks.
