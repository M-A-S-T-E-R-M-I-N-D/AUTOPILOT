<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Epic 0028 — Busy states: the ritual scrim

**Status:** slice 1 shipped (2026-09-13). **Owner:** dashboard.

## The ask

Operator, 2026-09-13: spinners and progress bars while we wait; blur and hold the
screen while the AI writes, sends to GitHub, or performs an action — or let the user
minimize, with a warning that the software may not respond while the update runs.
"Very important for the user."

## What the field says

- **Material Design 3, progress indicators and the loading indicator.** Determinate
  when the percentage is detectable, indeterminate otherwise; one indicator per
  operation; a linear indicator fills from 0 to 100 and never decreases; for several
  operations in sequence, show the whole, not each. The Expressive loading indicator
  is for waits under about five seconds; longer waits get the thicker linear or
  circular indicator. Modal surfaces scrim what is behind them and are interruptive
  by design, so they are used sparingly, and a modal that cannot be dismissed is a
  deliberate exception.
- **Apple HIG, progress indicators and the Loading pattern.** Prefer determinate;
  switch from indeterminate to determinate the moment the duration becomes known;
  never show inaccurate progress just to look busy; put a label above the indicator
  that says what is happening, not "loading"; progress bars are non-interactive but
  usually sit beside a button that cancels the operation; show content as soon as
  possible and keep work in the background where you can.
- **The loading-UX literature.** Do not block the whole screen for long processes;
  run them in the background with visible progress and a way out; overlay only for
  critical actions; acknowledge a user-triggered action immediately; keep the
  button's width while it shows its loading state; under ten seconds a looped
  animation is fine, past it a determinate indicator keeps trust.

## The doctrine, as shipped

1. **Acknowledge at once.** The pressed button keeps its text and width and goes
   `aria-busy`; the scrim is up in the same frame.
2. **Determinate when knowable, never fake.** The landing job already reports its
   real gate steps (`landing/job.ts`: step N of M, each with its verdict and
   duration). The scrim paints them: a progress bar with `aria-valuenow`, the step
   list with pass/fail/running marks, the job's own note. Every other ritual is
   honestly indeterminate: a sweep, an elapsed clock, the note.
3. **Block only outward, irreversible work.** A merge and push (landing), a tag and
   release, a comment/assign/label on GitHub (claim, PR review, issue triage, mirror
   pass, discussions triage, report), an issue opened in the fleet's name, the model
   composing text about to be sent, the self-update. One modal scrim
   (`role="dialog" aria-modal`), every sibling of it `inert`; reads keep flowing
   beneath it — the SSE stream still paints. Fleet launches are not rituals: a
   flight is a background process and the fly bar already shows its state.
4. **Always an escape, never a lie.** Minimize (or Escape) collapses the scrim to a
   corner pill with the clock and the words "writes paused", and un-freezes the
   page. Every OTHER write button stays dimmed and refuses with a spoken reason (a
   status toast) until the ritual ends: that is the operator's "minimize, but the
   software may not respond" warning, made precise — reads flow, writes wait. There
   is no Cancel: the server-side action cannot be recalled once sent, and a Cancel
   that did nothing would be dishonest.
5. **Settle honestly.** Done reads the response (`ok`, `details`) and lingers just
   long enough to be read; failed stays until closed, with the server's own message.
   A dropped request fails a plain ritual; a followed one (landing) only notes
   "reconnecting", because the job outlives a self-restart and its poller resolves
   the truth.
6. **Reduced motion and transparency.** The sheet's global kill switch stops the
   spinner and the sweep; the words carry the state. Under
   `prefers-reduced-transparency` the glass field becomes a solid scrim.

## Where it lives

- `apps/dashboard/src/web/features/busy.ts` — the scrim, the pill, the toast, the
  capture-phase write lock, `ritualFetch` (a drop-in for `fetch`),
  `ritualFollowLandingJob`. Core chunk.
- The hooks: one call-site change per ritual (`fetch(` → `ritualFetch(kind, …)`) in
  landing, release, pool-client, pr-review, issue-triage, mirror-pass (all four),
  discussions-triage, report-menu (compose + execute), connect (compose + issue),
  update.
- `packages/tokens/src/strings.ts` — every word, English and Hebrew.
- `apps/dashboard/src/web/layout-css.ts` — the scrim block above the reduced-motion
  kill switch.
- Tests: `apps/dashboard/test/web/features/busy.test.ts` (the laws in the real
  bundle under jsdom).

## Open slices

- Determinate progress for the release ritual (it runs the same gate; expose its
  steps the way the landing job does).
- Per-button inline spinner (M3 "loading button") for the short waits that never
  reach the scrim — the previews and reads.
- Visual regression at the four breakpoints, both themes, minimized and maximized.
