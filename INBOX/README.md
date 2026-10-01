# INBOX

The operator's own loop (backlog I): drop a file here — a note, a task idea, a
plan — and every firing of a live flight against this repo reads it fresh at
the start, as **optional context**. An empty or missing INBOX changes
nothing; dropping a file here is never a dependency and never blocks a
firing.

## How it works

- Drop any readable text file into this folder (e.g. `INBOX/ship-faster.md`).
- The next firing that starts sees its contents in an `## INBOX` section near
  the top of its prompt, ahead of ORIENT.
- Up to 10 files are read per firing, sorted by name; each is truncated to
  ~1000 characters in the prompt so one huge drop cannot crowd everything
  else out.
- That same firing also auto-triages it: a queued task appears on the board
  (`source: inbox`), and the file moves to `INBOX/.triaged/` so it is never
  triaged twice. Nothing is deleted — the note stays there, archived.
- From then on, the task's board row quotes the note to every firing until the
  task closes. The board's notes share ~8000 characters, top of the board
  first, and every note keeps at least its first ~1000, so a long directive
  reaches the firing that works it whole.
- This file (`README.md`) is the one exception — it is instructions for you,
  the operator, not a note for the agent to read back.

## What this is not

- Not a strict queue: a firing still isn't required to WORK the task a note
  produces ahead of anything else already on the board — auto-triage only
  guarantees the note becomes visible, workable board content.
