# Proposal 4: Resistance Cap & Batch Triage — stop nagging into the void

**Goal:** Stop daily-nudging tasks that have provably stopped responding to nudges, and replace the noise with one easy "clear these" decision.
**Why:** Four tasks have absorbed ~460 combined reminders with zero board movement. More daily nudges won't help — and they train everyone to ignore *all* Zazu messages, which is the real cost.
**Needs:** Your go-ahead. This changes what Zazu sends you, so I won't implement it unilaterally.

---

## The evidence (from `board-health.js`, Nov 1 2026)

| ID | Task | Owner | Resistance | Briefings | Stalled |
|----|------|-------|-----------|-----------|---------|
| t_insure01 | Review Acrisure home insurance renewal | DAD | 5/5 | 122 | 148 days |
| t_15sig01 | 15 Sigourney — neighbor repair cost-share | DAD | 5/5 | 122 | 139 days |
| t_r1908t7 | Renew British passport | DAD | 5/5 | 91 | 98 days |
| t_q5wnyq5 | Finish open financial-planning docs | MOM | 4/5 | 31 | 30 days |

Each already has a one-click friction-removal guide (`docs/guides/`). The blocker isn't information — it's that daily nudging has flatlined. `resistanceScore` is already computed and already maxed; today nothing *uses* that signal to change behavior.

---

## The problem with the status quo

`board-reminders.sh` and the morning brief surface these every day at full volume. `staleness-triage.js` correctly flags them as "probably closeable / needs a status call" — but only into a markdown file nobody opens. So the recommendation to *close* never reaches the one person who can close them, while the nag to *do* them keeps firing.

Net effect: the louder we get on dead tasks, the less signal every live task carries.

---

## Proposed change (two small, independent parts)

### Part A — Resistance cap (volume control)
When a task hits `resistanceScore === 5` **and** `briefCount > 60`, `board-reminders.sh` stops including it in the *daily* nudge and moves it to a **weekly** digest line instead. It stays fully active on the board; it just stops shouting daily. Any human edit (stage change, note, snooze) resets it to normal cadence.

- Implementation: a filter in `board-reminders.sh` + a once-weekly digest block. ~30 lines, no schema change (`resistanceScore`/`briefCount` already exist).

### Part B — Batch triage (the decision that actually clears them)
Once, Zazu sends **one** message with the table above and asks for a one-word reply per item:

> `DONE` (already handled — I'll archive it) · `CLOSE` (not doing it — I'll drop it) · `KEEP` (still live — stays, but off daily nudge)

This is the one thing no current channel does: it offers to *remove* work, not just repeat it. If it clears even two of the four, the daily board gets materially quieter.

---

## Why this is safe

- No task is ever deleted or auto-closed — closing is always your explicit one-word call.
- Capped tasks stay on the board and in the weekly digest, so nothing is forgotten.
- Both parts are reversible by reverting a small script change; Part B is a single send.

---

## To approve

Reply with which parts you want — **A**, **B**, both, or neither. If you give the word, implementation is a single heartbeat session (Part A) plus one message (Part B). Until then, nothing changes.

_Drafted by Zazu, 2026-11-01. Source: `analytics/scripts/board-health.js`, `analytics/scripts/staleness-triage.js`._
