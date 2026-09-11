<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Epic 0021 — The app shell: subjects, a rail, and a phone-first cockpit

**Operator directive, 2026-09-10/11:** *"ליישם באופן מלא את עדכון ה-UX/I
עכשיו לא בטיסות אלא כאן... MOBILE FIRST, TABLET ברמה גבוהה, והדסקטופ
בתצורה הכי אופטימאלית"* and then, widening it: *"Think app, think
workspace, think node based workflows user can manipulate and edit, think
modular UX/I, think tabs, think subjects, think pages, think applicative
and interactive, think immersive."*

Epic 0017 owns the chrome (masthead → icon cluster, palette, side rail).
Epic 0018 owns the center (stability laws, tabs, many-lanes grid). Neither
owns the SHAPE of the page across window sizes, and neither names the fact
that the dashboard is a long stack of sections rather than an application
with places in it. This epic owns that shape. It is the frame 0017's rail
and 0018's tabs slot into.

## The diagnosis, measured (2026-09-11, HEAD `1909ebe8`)

Measured on the live dashboard with a real Chromium, not inferred:

1. **Zero responsive breakpoints.** `layout-css.ts` (1,333 lines) carries
   exactly one media query, `prefers-reduced-motion`. Every token is a
   fixed `rem`; no `clamp()` anywhere. Nothing in the stylesheet knows what
   width it is rendering at.
2. **The page is a flat stack of fourteen body-level siblings**, in this
   order at 375px: masthead (143px, sticky — 17.6% of the viewport, gone
   permanently) → totals (240) → live-workers → stat-tiles (444) → PR review
   → pool (413) → good-first-issues (460) → publicity → standing (475) →
   fleet-wisdom → **flightbar (272)** → searchbar (195) → `main#fleet`
   (the project cards). The FLY action — the pair epic 0017 says must stay
   "visually dominant" — is reached after ~2,300px of scrolling on a phone.
   `main#fleet` holds only the cards; its `auto-fill` grid was never the
   problem.
3. **`.contributor-issue-list-panel` has zero CSS rules.** It renders with
   browser-default blue links at x=0, no surface, no padding — at every
   width. Not a responsive defect; a missing stylesheet. It made the whole
   page read as broken.
4. **Body-level panels are flush to the viewport edge** (Pool, standing,
   publicity carry `margin-bottom` only), while `main` pads by `--space-5`.
   Two different left edges on one page.
5. **Tap targets:** buttons are padded `--space-1` vertically — ~22–26px
   tall against WCAG 2.5.8's 24px AA floor and the 44/48px platform
   guidance. The masthead's popover triggers and every `Claim` button are
   under the floor on a phone.
6. **Pool items are a three-row card** whose action row is pushed to the
   far right — on a 1440px desktop the `Claim` button sits ~1,200px from
   its own title.
7. `.pipeline-panel` is a two-column flex that never stacks;
   `.lane-grid`'s `minmax(220px, 1fr)` cannot shrink below 220px.

Horizontal overflow was **0px at every width** — the 320px spec
(`e2e/responsive.spec.ts`) was green throughout. It measures the one thing
that was fine.

## What the frontier converged on (research, 2026-09-11)

- **Window-size-driven, never device-driven.** Material 3's canonical
  layouts (compact / medium / expanded; list-detail and supporting-pane
  scaffolds), iPadOS 26's freely resizable windows, and Android's
  "never rely on physical rotation" guidance all say the same thing: the
  layout reads its own width. Compact → bottom navigation bar, one place
  at a time; medium → rail; expanded → rail plus everything visible.
  ([M3 canonical layouts](https://m3.material.io/foundations/layout/canonical-examples/overview),
  [M3 navigation rail](https://m3.material.io/components/navigation-rail/guidelines),
  [Android adaptive navigation](https://developer.android.com/develop/adaptive-apps/guides/build-adaptive-navigation),
  [iPadOS 26 windowing](https://www.apple.com/newsroom/2025/06/ipados-26-introduces-powerful-new-features-that-push-ipad-even-further/))
- **The 2026 agent console is "a small Kubernetes dashboard, not a chat
  window."** Cursor 3's Agents Window tiles one card per agent (its own
  conversation, diff, environment), streams tool calls with elapsed time,
  and routes approvals through an inbox that carries the agent's
  accumulated context. Plan visibility before execution; step-level
  pause/skip; classified errors; artifacts for verification.
  ([Cursor 3 Agents Window](https://www.digitalapplied.com/blog/cursor-3-agents-window-complete-guide),
  [Agentic UX patterns](https://zylos.ai/research/2026-05-28-agentic-ux-frontend-design-patterns-ai-agents/),
  [Orchestration dashboards / HITL inbox](https://www.lowcode.agency/blog/how-to-build-an-ai-agent-orchestration-dashboard-for-complex-workflows))
  AUTOPILOT already owns every one of those primitives — lanes, the flight
  log, KEEPER, queue-for-human, gate steps. They are stacked, not placed.
- **Node editors converged** on palette / canvas / properties with
  progressive disclosure; DOM-rendered nodes (ComfyUI's Nodes 2.0 left
  Canvas2D for exactly this); schema-driven property panels; deterministic
  auto-layout (dagre/ELK, never force-directed); tap-tap-to-connect and
  enlarged handles on touch; contextual zoom; undo/redo, autosave,
  read-only mode as table stakes.
  ([n8n UX deep dive](https://n8n.spot/n8n-ui-ux-deep-dive-how-thoughtful-design-streamlines-visual-automation/),
  [ComfyUI Nodes 2.0](https://blog.comfy.org/p/comfyui-node-2-0),
  [React Flow touch](https://reactflow.dev/examples/interaction/touch-device),
  [awesome-node-based-uis](https://github.com/xyflow/awesome-node-based-uis))
- **Docked beats floating for dense technical work.** Figma shipped UI3
  with floating panels and reversed for Figma Design; floating stayed the
  default only in the whiteboard products. Focus mode is opt-in.
  ([Figma on UI3](https://www.figma.com/blog/our-approach-to-designing-ui3/),
  [why the floating panels fell short](https://bitskingdom.com/blog/why-figmas-floating-panels-ux-lesson/),
  [tldraw focus mode](https://tldraw.dev/examples/focus-mode))
- **The shell is rail + content + context rail; ⌘K is table stakes.**
  "A shell sells its slots, not its furniture."
  ([app-shell blocks](https://reui.io/blocks/application/app-shell),
  [command palette design](https://destiner.io/blog/post/designing-a-command-palette/),
  [VS Code custom layout](https://code.visualstudio.com/docs/configure/custom-layout))
- **Phones: bottom bar, 3–5 destinations, thumb zone, 44–48px targets,
  primary action in the bottom third, not a shrunken desktop.**
  ([mobile-first dashboards](https://www.fanruan.com/en/blog/top-admin-dashboard-design-ideas-inspiration),
  [thumb zone](https://timgraf.com/ux-design/designing-for-the-thumb-zone-a-modern-guide-to-mobile-ux-that-respects-human-anatomy/),
  [touch targets](https://www.uxpin.com/studio/blog/responsive-design-touch-devices-key-considerations/))
- **Liquid Glass**: one floating functional layer above content; capsule
  on phones, concentric on tablets and desktops.
  ([WWDC25 design system](https://developer.apple.com/videos/play/wwdc2025/356/))

## The model

### Subjects

A **subject** is a place in the app. Every body-level section belongs to
exactly one, declared in markup (`data-subject`), so the assignment is a
fact the shell can read rather than a client-side guess:

| subject | sections | what it is |
| --- | --- | --- |
| `fleet` (`project` on `/p/<id>`) | `#totals` `#live-workers` `#stat-tiles` `main#fleet` | the squadron board — who is flying, what shipped |
| `fly` | `#flightbar` `#searchbar` | the primary action, one tap away on every width |
| `keeper` | `#pr-review-panel` `#pool-client-panel` `#fleet-wisdom` | the human-in-the-loop inbox: PRs, pool, proposals |
| `community` | `#contributor-issue-list-panel` `#publicity-panel` `#contributor-standing-panel` | the visitor-facing face |

Later slices add `plan` (the node canvas) and, on project pages, 0018's
tabs (`board` · `log` · `docs` · `data`) as subjects of the same shell.

### Breakpoints (window width, `rem`, min-width only)

| name | width | shell |
| --- | --- | --- |
| compact (base) | < 48rem | top bar (two rows max) + **bottom subject bar**; one subject visible at a time; own scroll per subject |
| medium | ≥ 48rem | **left rail** (icon + label); one subject at a time |
| expanded | ≥ 64rem | left rail; **every subject stacked** in DOM order; the rail is a scroll-spy of section jumps (0017 slice 5's mobile-to-desktop continuity) |

Base styles ARE the phone. Wider windows add. The single exception is the
one-subject-at-a-time rule, expressed as a range (`width < 64rem`) because
it is a rule about narrowness, not a decoration added at width.

### Tokens

Fluid where fluidity carries meaning, fixed where density does:

- `TYPE.base` stays `1rem` — a dense cockpit on desktop, and 16px is the
  floor below which iOS Safari zooms a focused input. `xs`/`sm` stay fixed.
  `lg`…`3xl` become `clamp()` — display sizes shrink on a phone.
- `SPACE` 0–4 stay fixed (micro rhythm inside components); `5`, `6`, `8`
  become `clamp()` (section rhythm breathes with the window).
- **At ≥ 1280px every clamp resolves to today's exact value.** Desktop
  pixels do not move for token reasons; only the narrow end tightens.
- `--page-inline`: one inline padding every body-level section shares —
  `--space-3` at compact, `--space-5` from medium. One left edge.
- `BREAKPOINT` + `mediaMin()` live in `@autopilot/tokens` so the widths
  are a fact the stylesheet, the tests, and the e2e specs all read from
  one place.

### Laws (tests enforce, not taste)

1. **Mobile-first, min-width only.** No `max-width` media query in
   `layout-css.ts`, and no width-keyed hide rule either: an inactive
   subject leaves the page through one state attribute
   (`data-subject-inactive`) that only the nav module sets, so the subject
   set is the nav's business and a page without the script shows
   everything.
2. **24px floor everywhere, 44px under a coarse pointer** (WCAG 2.5.8 AA;
   Apple/Google). Inputs render at ≥ 1rem under a coarse pointer.
3. **Switching subjects never reflows another subject** (0018 law 1 by
   construction: the inactive subject is `display: none`, the active one
   owns the scroll; per-subject scroll position is kept and restored).
4. **DOM order is the desktop order.** The nav reorders nothing — compact
   and medium hide, expanded shows all. Screen-reader order and the
   masthead census stay exactly what they were.
5. **Deep links land on the right subject.** A `#section-id` in the URL
   activates the subject that owns it before the first paint the user
   sees — the legible-surface doctrine (0020) extended to the shell.
6. **A subject with nothing to show says so** (disabled-with-reason law):
   one empty-state line, never a blank page.
7. **Visual baselines cover compact and expanded.** A Playwright `mobile`
   project (coarse pointer, touch) runs the shell spec and a phone
   baseline beside the desktop ones.

## Slices

| # | slice | status |
| --- | --- | --- |
| 1 | **Foundation**: fluid tokens + `BREAKPOINT`; `--page-inline`; compact masthead; tap-target floors; the unstyled panel fixed; Pool rows; pipeline/lane/tile stacking | in this epic's first landing |
| 2 | **Subject shell**: `data-subject` on body + sections; bottom bar / rail / scroll-spy; per-subject scroll; deep-link activation; empty state; `mobile` Playwright project + phone baseline | in this epic's first landing |
| 3 | **Plan canvas** (the node workflow): the gate pipeline / flight plan as an editable graph — palette · canvas · properties; pan/zoom, drag, tap-tap connect on touch, deterministic auto-layout, undo/redo, autosave to config, read-only for visitors. Grows from `pipeline-panel.ts`'s SVG canvas + tree; no new dependencies | queued |
| 4 | **Keeper as an inbox**: one queue of everything waiting on a human — PR verdicts, triage, approvals, proposals — each item carrying the accumulated context (what ran, what this step does, what comes next), settled items collapsing to a badge history (0018 slice 3's Keeper tab, done as a subject) | queued |
| 5 | **Project-page subjects**: 0018's tabs become subjects of this shell — Overview · Board · Keeper · Plan · Docs · Data, one at a time at every width, each section tagged by `renderProjectPage` | **shipped** — `shell-html.ts` `subjectNavHtml`, `subject-nav.ts` inactive marking |
| 6 | **Context rail at expanded**: the supporting pane — live lanes + the Keeper queue beside whatever subject is open (M3 supporting-pane canonical layout) | queued |
| 7 | **⌘K** (0017 slice 4) registers subjects, projects, fly, theme, language — the power-user spine that keeps the bar minimal | queued |
| 8 | **Focus mode**: hide chrome, keep the canvas (opt-in, the Figma lesson) | queued |

## Constraints carried forward

- No new runtime dependencies (0017). Inline SVG icons; CSS on the
  designed-states system; vanilla client modules through the splice
  manifest.
- The shell's client module rides the **deferred** chunk: it
  self-initializes and nothing in core calls it. The one-subject rule keys
  on `body[data-nav="on"]`, which only that module sets at boot — so
  before it executes (or without it) every subject is on the page and the
  nav is plain `href="#id"` anchors that scroll the stack. Nothing hides
  behind an attribute no script wrote.
- Bundle budgets are raised only by what the slice measures, documented in
  `scripts/ci/check-bundle-size.mjs` and its mirror test, as every prior
  bump was.
- Logical properties only (`find-rtl-hazards`, `layout-css.test.ts`); the
  rail and bar mirror under RTL for free.
- Visual baselines refresh once, deliberately, from the CI runner's own
  render (the `e2e-visual-actuals` artifact), never from a local machine.
