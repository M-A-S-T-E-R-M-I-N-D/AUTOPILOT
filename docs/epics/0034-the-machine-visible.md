<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0034. THE MACHINE, VISIBLE — the live answer, and the cockpit's motion language

Status: **Specified, not started.** Operator directive, 2026-09-17.

The Ask answer is, in the operator's words, *"סופר חשוב ונכון ומיוחד וקריטי"* —
and it arrives as a wall of text that appears all at once, with no sign anyone
was ever on the other end. This epic is about the other half of that answer:
making the machine's work **visible while it happens**, in a motion and sound
language that belongs to this cockpit and to no other product.

> "צריך להביא אותו גם לתצוגה ברמת SOTA שזה ממש ירגיש כמו קוד שנכתב, וגם שכל
> הטקסט יכתב בלייב… אפקט של עדשה כזה שמבריק על כל החלון כמו המשקפיים/משקפות
> קרב של הטייס… כאילו ההודעה בצד השני נכתבת, כשהיא נכתבת היא מתגלה בצורה
> מגניבה כאילו כמו קוד מטריקס… אפקט זול מבחינת משאבים אבל מקסימום ויזואלי…
> לאפשר למשתמש לראות 'מבעד למכונה' ולהבין יותר את התהליכים שמתרחשים… לכל
> THEME יהיה בעצם את הריצוף שלו… המשתמש יוכל בהגדרות להגדיר מה להפעיל, מה
> לכבות, לקבוע HUE והכל."

## 1. The measured blocker, which changes the whole design

**The Deep tier does not stream.** Measured 2026-09-17 against the live server,
`POST /api/ask/stream` with `deep: true`:

| Frames | Count |
|---|---|
| `delta` | **0** |
| `activity` | 12 |
| `done` (whole answer at once) | 1 |

Duration 49s. The non-Deep tier *does* stream (2 deltas, measured the same
day). So the answers that matter most — the researched, tool-using, genuinely
valuable ones — are precisely the ones that arrive as one block after 49
seconds of nothing but tool chips.

**No amount of client-side animation fixes that honestly.** A typewriter effect
replaying an answer that already arrived is theatre: it shows writing that
already finished, and it *delays* information the user already paid for. So
this epic has a server half and a client half, and the server half comes first.

- **Slice 1 (server): make the escalated tier emit `delta` frames.** The text
  is generated progressively upstream; the relay currently only forwards it at
  the end. This is the actual fix for "שכל הטקסט יכתב בלייב", and every visual
  slice below is downstream of it.
- **Slice 2 (client): reveal what arrives, as it arrives.** Never pace-limit
  below the arrival rate. The animation is a *reveal of new tokens*, not a
  gate on old ones.

If slice 1 turns out to be impossible for a tier, the fallback is stated
plainly in the UI ("researched for 49s, answered at once") rather than faked.

## 2. Principles

1. **Never fake latency.** Motion may reveal what is arriving; it may never
   withhold what has arrived. A progress illusion that outlasts the work is a
   lie the user can feel.
2. **Cheap by construction.** Compositor-only, per COCKPIT 6/6: `transform` and
   `opacity`. Effects that cannot be expressed that way get measured before they
   ship, or do not ship. The bundle budget is real and currently tight — the
   core chunk has **0.9KB** of raw headroom; effect code belongs in the deferred
   and project chunks, and in CSS, which the JS budget does not count.
3. **Zero cost once finished.** The streaming-reveal wrapper spans are removed
   when the message completes, leaving plain DOM behind. A finished answer must
   animate nothing — this is the single biggest performance decision here.
4. **Reduced motion is the safe default, not the exception.** Progressive
   opt-in: the base stylesheet is the calm one, effects are added under
   `@media (prefers-reduced-motion: no-preference)`. Anything that loops or
   blinks also gets an explicit off switch, because `prefers-reduced-motion`
   satisfies WCAG 2.3.3 but not 2.2.2's pause/stop/hide.
5. **Sound is opt-in, always.** Default off, never autoplays, always
   keyboard-reachable, never the sole carrier of meaning (WCAG 1.4.2, 1.4.7).
6. **Original, or nothing.** The operator's "להשאר פרש" — the reference set is
   research, not a moodboard to copy. Terminal-lineage aesthetics are a shared
   heritage; a recognisable imitation of a specific product's signature is not
   something this project ships.

## 3. The visual language

Four named effects, one vocabulary, each with a defined cheap implementation.

### 3.1 THE WRITE — text as it is typed

Word-level, not character-level: each newly-arrived word mounts with a short
`opacity` + small `translateY` transition and is then **unwrapped**. Character-
level costs a DOM node per glyph for a barely-different read; word-level is the
technique the current streaming-UI consensus has settled on, and it keeps the
node count proportional to the answer, not to its length in characters.

Markdown structure is preserved — the existing `renderMarkdown` DOM builder
stays the renderer, and the reveal decorates its output. It never becomes a
second parser.

### 3.2 THE DECODE — the matrix reveal

The operator's *"כמו קוד מטריקס נכתב"*, done honestly and cheaply: a newly
arrived word settles through a **very short** scramble (2–3 frames, a fixed
glyph pool) before resolving to its real characters. Strictly bounded — it is
punctuation on arrival, not a screensaver — and it is per-word, so it cannot
compound into a long delay. Disabled entirely under reduced motion, where the
word simply fades in.

### 3.3 THE VISOR — the lens sweep

The operator's *"עדשה שמבריקה על כל החלון כמו משקפות קרב של הטייס"*: a single
translating gradient band across the surface, on `transform` only, fired on
**state change** — the answer beginning, a flight starting, a landing going
green. A sweep is an event marker. It never idles, never loops.

### 3.4 THE GLITCH — chromatic aberration, used as grammar

Channel-split displacement and a brief slip, reserved for **one meaning**: the
machine hit something wrong — an error, a refusal, a red gate. Colour-shift is
the most attention-grabbing effect here, so it gets the narrowest vocabulary; a
glitch that fires on success teaches the user nothing. Never on text being
read, and never flashing faster than 3Hz (WCAG 2.3.1 — a hard line).

### 3.5 Seeing through the machine

The tool-activity chips already show real Read/Grep/Glob calls — that is the
"מבעד למכונה" surface, and it is already true data. This epic upgrades its
*rendering*, not its honesty: a stroke icon per tool kind from the existing
Lucide set, the target elided intelligently (the path fix from the pipeline
work applies here too — chips currently render raw absolute Windows paths), and
a small generative mark whose seed is the trace id, so a given firing has a
visual identity that is its own and not decorative noise.

## 4. Theme-coupled effect and sound sets

Each theme carries its own set, swapped as one unit with the theme:

| Theme | Motion character | Sound character |
|---|---|---|
| `terminal` | the fullest expression: decode, scanline, phosphor decay | mechanical key clicks |
| `dark` | restrained: write + visor, glitch on error only | soft, low |
| `light` | quietest: write, no decode, no glitch | near-silent or off |

Implemented as **token sets**, not per-theme branches in effect code — the
existing `@autopilot/tokens` layer is the authority, and an effect reads
duration/easing/intensity tokens the theme supplies. One effect implementation,
three configurations. Anything else re-creates the double-duty token defect this
cockpit has already been burned by once.

## 5. Settings — the operator's switchboard

A single **Motion & sound** panel in the existing settings surface (epic 0029):

- Master: **Full · Reduced · Off**, defaulting to the OS preference and
  overriding it in both directions when set.
- Per-effect toggles: write, decode, visor, glitch.
- **Hue** — a single accent-hue control, applied through the token layer so it
  reaches every surface at once rather than being a per-effect knob.
- Sound: master off by default, per-event volume, per-theme set.
- Everything persists per profile and is reachable by keyboard alone.

**The rule that keeps this honest:** every effect must be independently
switchable off, and with everything off the cockpit must remain fully usable
and visually coherent — not a stripped carcass of a design that assumed motion.

## 6. Keyboard absolutism

The operator's ask for *"אפשרויות אבסולוטיות להפעלה במקלדת"*:

- Every action reachable by keyboard, with no pointer-only path anywhere.
- The command palette (epic 0015's D3) is the universal entry point.
- A discoverable shortcut sheet, and a visible focus style that survives every
  theme and every effect state.
- Roving tabindex where this repo already uses it — the chip and row patterns
  are established and this epic follows them rather than inventing a third.

Sounds and motion are *feedback*, never the mechanism. Turning them all off must
not remove a single capability.

## 7. Acceptance criteria

1. A Deep answer's text appears **as it is produced**, not after it.
2. A completed message animates nothing and carries no wrapper spans.
3. With `prefers-reduced-motion: reduce` and no explicit setting, nothing
   scrambles, sweeps, or glitches — text still fades in and remains readable.
4. Nothing anywhere flashes above 3Hz.
5. Every effect is independently switchable; all-off is coherent and complete.
6. Sound never plays without an explicit opt-in.
7. The three themes are visibly different in motion character, from tokens
   rather than from branches in effect code.
8. Bundle budgets stay green; effect code lands outside the core chunk. Measured
   before and after, not asserted.
9. Every surface stays axe-clean across themes and locales, as this repo already
   requires of every UI slice.

## 8. Out of scope

- No animation framework, no new runtime dependency — the no-framework decision
  stands (`docs/ECOSYSTEM-RESEARCH.md` §1).
- No canvas or WebGL for chat text.
- No per-character DOM for the reveal.
- No motion on a completed, resting message.
- No recognisable imitation of another product's signature interaction.
- No sound on by default, ever.

## 9. Related

- Measured 2026-09-17: Deep streams 0 deltas — `apps/dashboard/test/web/ask-sheet-deep-answer.test.ts`
  pins the frame shape that forced slice 1.
- `apps/dashboard/src/web/ask-stream.ts` — the frame decoder slice 1 extends.
- `apps/dashboard/src/web/features/search.ts` — `renderAnswer`/`renderActivity`.
- Epic 0015 — COCKPIT 6/6's compositor-only rule, the palette, the token layer.
- Epic 0029 — the settings surface this epic's panel joins.
- `docs/COCKPIT-BASELINE.md` — where the before/after numbers go.

## 10. Sources consulted

- [AI Chat UI best practices](https://thefrontkit.com/blogs/ai-chat-ui-best-practices) — typing indicators, avoiding per-token layout thrash.
- [Streamdown: animation](https://streamdown.ai/docs/animation) — word-level fade on mount, and removing the animation wrapper once streaming ends so completed messages carry zero DOM overhead. This is the source of §2's third principle.
- [MDN: using media queries for accessibility](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Using_for_accessibility) and [prefers-reduced-transparency](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency).
- [Meeting 2.2.2 with prefers-reduced-motion](https://hidde.blog/meeting-2-22-pause-stop-hide-with-prefers-reduced-motion/) — why the media query alone is not sufficient and explicit controls are still required.
- [Accessible web animation: the WCAG on animation explained](https://css-tricks.com/accessible-web-animation-the-wcag-on-animation-explained/) — 2.3.1 and the opt-in framing.
