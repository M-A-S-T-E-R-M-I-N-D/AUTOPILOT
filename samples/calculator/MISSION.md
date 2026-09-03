# MISSION — a simple, beautiful calculator

This file is the whole brief. An operator drops a mission like this, points
AUTOPILOT at the folder, and the flight is DONE when — and only when — every
box below is checked. No hidden goals, no moving target: **the failing tests
in `calc.test.js` ARE the endpoint**, written before any implementation
exists (the same tests-first ritual AUTOPILOT applies to itself).

## The goal

A classic pocket calculator: `index.html` opens in any browser and just
works. Sequential evaluation like a real pocket calculator (`2 + 3 × 4 = 20`,
not 14 — no operator precedence; state it, don't surprise anyone).

## The defined endpoint — 100% means all of these

- [ ] `npm test` — **every acceptance test in `calc.test.js` passes** (they
      are all red at seed time, on purpose).
- [ ] `index.html` works by mouse AND keyboard (digits, `+ - * /`, `Enter`
      `=`, `Escape` clears, `Backspace` deletes).
- [ ] Divide by zero shows `Error` and recovers on the next input — never a
      crash, never `Infinity`.
- [ ] Zero dependencies, zero build step: one `calc.js` (the pure state
      machine, ≤150 lines), one `index.html`, one `style.css`.
- [ ] The pure logic (`calc.js`) never touches the DOM — `index.html` wires
      it; that separation is what makes the tests honest.
- [ ] It looks intentional: the seed `style.css` carries the design tokens —
      keep its character, don't flatten it to defaults.

## Prior art (inspiration, not source)

Pocket-calculator behavior is folklore; good open references to study —
never to copy from — include MDN's web components examples and the classic
freeCodeCamp calculator exercise. All code here must be original to this
flight.

## Why this sample exists

It is the smallest possible demonstration of a full autonomous arc: a
human-readable mission, a machine-checkable endpoint, and a visible artifact
(open `index.html`) anyone can judge in ten seconds. When AUTOPILOT flies
this folder to green, the flight log + this checklist are the whole story.
