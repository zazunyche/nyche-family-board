# Board Analytics & Execution Intelligence System — Plan v1

**Author:** Abeiku (Nyche Research Agent) + Zazu (nightly refinements)
**Created:** 2026-06-10
**Review target:** Dad, Saturday June 13 at 4pm
**Status:** Final draft — nightly refinements complete

### Change Log

| Date | Change |
|---|---|
| 2026-06-10 | Initial draft by Abeiku |
| 2026-06-11 | Added `resistanceScore` field; expanded reflection layer Sunday cadence; clarified `completionQuality` definitions |
| 2026-06-12 | Added `EXTERNAL_EVENT` taskType with auto-close rule; added `startedAt` field; updated dedup status (already completed — 16 tasks archived, 47→31 open); added nightly git commit infrastructure; refined Week 1 rollout to reflect completed work |

---

## Executive Summary

The Nyche family board already captures enough raw timestamped data to answer basic throughput questions, but lacks the fields required to answer the more interesting ones: why certain tasks stall, which category types get executed quickly vs. abandoned, and what the family's natural execution disposition actually looks like by workload type. This plan proposes three layers of instrumentation — schema additions to the task object, a structured stage-transition log, and a lightweight Zazu-driven reflection protocol — that together build the dataset needed to make meaningful inferences over 60–90 days. The approach is fully backward-compatible; no existing task data is broken, and all new fields are opt-in. The payoff is a system that moves from "what is on the board" to "how the family executes, where it gets stuck, and why."

---

## Current State Assessment

### What we already have

The existing schema captures more than it might appear. A careful read of `board-data.json` yields:

| Data point | Where it lives | What it can tell us today |
|---|---|---|
| `createdAt` + `completedAt` | Task fields | Total lead time (creation → done) for the ~20 completed tasks |
| `stage` at snapshot time | Task field | Current stage distribution (snapshot of board state) |
| `history[]` array | Per-task audit log | Stage transitions with timestamp and actor, but only where Zazu or UI wrote them — not systematically |
| `source` field | Task field (`manual`, `imessage`, `email`) | Ingest channel breakdown — already useful |
| `category` + `owner` + `priority` | Task fields | Category-level and owner-level completion rate, once enough DONE tasks accumulate |
| `briefCount` + `lastBriefed` | Task fields | Zazu engagement signal — high brief count on an incomplete task is a drag/resistance indicator |
| `snoozedUntil` | Task field | Explicit deferral signal |
| `recurrence` | Task field | Distinguishes recurring obligations from one-off projects |
| `blockedBy` | Task field | Dependency tracking (currently always null) |

### What it can tell us right now (without any schema changes)

Running a script against the current data today would yield:

- **Completion rate by category**: HOME tasks complete fastest (insurance/recall tasks closed same-day); ADMIN tasks linger; GOALS tasks have near-zero closures
- **Lead time spread**: Completed tasks range from <1 hour (same-session closures) to 14+ months (t_001, t_003 created April 2025, completed June 2026) — but the <1 hour cohort is largely duplicate/bulk-close artifacts from email ingestion, not genuine execution
- **Source channel analysis**: `email`-sourced tasks close faster on average than `manual`-sourced tasks (emails tend to be time-bounded; manual tasks tend to be projects)
- **Snooze signal**: Only 1 task has `snoozedUntil` set, but this field is already meaningful
- **Brief pressure**: `t_8gak2bf` (tax docs) has `briefCount: 3` with no completion — highest resistance signal currently visible

### Critical gaps

1. **No per-stage entry/exit timestamps.** The `history` array captures transitions, but only when Zazu happened to log them. There is no guaranteed `stageEnteredAt` per stage, making cycle time per phase impossible to compute reliably.
2. **No effort signal.** There is no distinction between a task that took 10 minutes and one that took 10 hours. `completedAt - createdAt` conflates wait time with work time.
3. **No task type / effort shape tag.** "Submit tax docs" and "build a backyard shed" are both `category: ADMIN` / `category: YARD` but are entirely different kinds of work.
4. **No origin signal.** Tasks are created reactively (email/iMessage triage) or proactively (intentional planning). These behave differently and should be separated in analysis.
5. **No completion quality signal.** Did "done" mean fully resolved, or parked? The board currently has no way to distinguish a genuine close from a premature mark-done.
6. **No effort estimate.** Without a T-shirt size or time estimate attached at creation, there is no way to measure estimation accuracy over time.
7. **No resistance capture.** Tasks that stall get briefed repeatedly but there is no structured field for "I looked at this and consciously deferred it" vs. "I forgot about it."
8. **Duplicate task noise.** ~~The board has significant duplicate tasks (7+ Acrisure insurance variants, 5+ WYZE recall variants, 3+ Redfin CMA variants). This inflates task count and corrupts completion rate metrics. Deduplication is a prerequisite for clean analytics.~~ **RESOLVED Jun 11:** 16 duplicate tasks archived, board reduced from 47 → 31 open tasks. Dedup is complete; analytics baseline is now clean. Going forward, Zazu will check for existing tasks before adding new ones from email triage.

---

## Proposed Schema Additions

All fields are **optional at creation** and can be populated by Zazu, the board UI, or reflection. Existing tasks that lack them are simply excluded from analyses that require them — no migration needed.

| Field name | Type | Purpose | Who populates |
|---|---|---|---|
| `stageHistory` | `Array<{stage, enteredAt, exitedAt, durationMs}>` | Precise per-stage time tracking for cycle time analysis | Zazu (on every stage write) |
| `effortTag` | `enum: XS, S, M, L, XL` | T-shirt effort estimate — set at creation or after first reflection | Dad/Mom via iMessage, or Zazu prompt |
| `taskType` | `enum: ERRAND, PROJECT, DECISION, RESEARCH, MAINTENANCE, EVENT, EXTERNAL_EVENT, HABIT` | Execution shape — distinguishes a phone call from a multi-week project | Zazu inference + human confirm |
| `intentOrigin` | `enum: REACTIVE, PROACTIVE, DELEGATED` | Was this created in response to something (email, external trigger) or planned? | Auto-derived from `source` field with manual override |
| `resistanceScore` | `integer 0–5` | Explicit signal of friction — set during reflection when a task was seen but not acted on | Zazu writes after reflection response |
| `completionQuality` | `enum: FULL, PARTIAL, PARKED, DELEGATED_OUT` | Was done actually done? | Human confirms at close, Zazu prompts if not set |
| `energyContext` | `enum: HIGH_FOCUS, LOW_FOCUS, PHYSICAL, COORDINATION` | What kind of energy does this task require? | Zazu prompt at creation (optional) |
| `linkedGoalId` | `string` | Foreign key to `goals[]` array | Zazu or human at creation |
| `effortActualHours` | `number` | Self-reported actual time spent — collected via reflection | Dad via iMessage after completion |
| `tags` | `Array<string>` | Freeform labels (e.g., `contractor`, `Child_1`, `financial`, `seasonal`) | Human or Zazu at creation |
| `nextActionType` | `enum: CALL, EMAIL, PURCHASE, SCHEDULE, RESEARCH, BUILD, WAIT` | GTD-style next action — what is the literal next physical action? | Zazu prompt when moving to ACTIVE |
| `stalledAt` | `ISO8601 timestamp` | Set when a task has been in the same stage past the stale threshold without a snooze | Zazu (nightly stale detection script) |
| `startedAt` | `ISO8601 timestamp` | When Dad or Mom *first actively worked* on a task — distinct from `createdAt` (board entry) and stage transitions. Self-reported via iMessage ("started on the shed today") or set explicitly at ACTIVE entry | Human via reflection, or Zazu on ACTIVE stage transition |

### The `EXTERNAL_EVENT` taskType — a special case

`EXTERNAL_EVENT` is the most operationally important addition to the `taskType` enum. It covers tasks that are fundamentally time-bounded external occurrences: school events, community happenings, scheduled observations, invitations. The key behavioral rule:

> **When a task of type `EXTERNAL_EVENT` reaches its `dueDate` and is still in any stage except DONE, Zazu auto-archives it nightly.** The event passed — the family either attended or didn't, but rescheduling isn't an option.

Example: "Water Play Wednesday at Primrose (Jun 11)" — once June 11 passed, the task was done regardless of whether it was marked complete. Auto-archiving this prevents calendar-event noise from accumulating in the active board and corrupting stall-time analytics.

**Operational rule for Zazu:** When creating tasks from calendar events, school notices, or invitations, default `taskType` to `EXTERNAL_EVENT` and set `dueDate` explicitly. The nightly board cleanup script will handle auto-closure.

**Analytics implication:** EXTERNAL_EVENT tasks should be excluded from cycle time, completion rate, and resistance analyses — their closure is date-driven, not execution-driven. They are tracked separately as an `event_attendance_log` (future Tier 3 addition).

### Priority additions (implement first)

These three unlock the most analysis with the least implementation cost:

1. **`stageHistory`** — Zero user friction; Zazu writes this automatically on every stage transition. Unlocks all phase-level timing analysis.
2. **`effortTag`** — One question at task creation ("Quick task or bigger project? XS/S/M/L/XL"). Unlocks estimation accuracy and category velocity normalization.
3. **`taskType`** — One enum at creation, Zazu can infer most values from title + category. Unlocks the "natural disposition" analysis Dad asked about. The `EXTERNAL_EVENT` subtype should be prioritized as it has an immediate operational benefit (auto-close nightly).

---

## Phase Transition Tracking Design

### The problem with the current `history` array

The existing `history[]` entries are unstructured strings. Example:
```json
{"timestamp": "...", "actor": "ZAZU", "change": "stage: ACTIVE → DONE | completedAt set"}
```
This is parseable but fragile — a regex on `change` strings is not a data model.

### Proposed `stageHistory` structure

```json
"stageHistory": [
  {
    "stage": "IDEA",
    "enteredAt": "2026-06-07T02:44:42.892Z",
    "exitedAt": "2026-06-07T11:30:00.000Z",
    "durationMs": 31517108,
    "exitActor": "ZAZU"
  },
  {
    "stage": "RESEARCH",
    "enteredAt": "2026-06-07T11:30:00.000Z",
    "exitedAt": null,
    "durationMs": null,
    "exitActor": null
  }
]
```

**Rules:**
- Zazu appends a new entry to `stageHistory` on every stage write (same code path that already writes `history`)
- `exitedAt` and `durationMs` on the previous stage entry are filled at the moment the task moves forward
- For tasks created before `stageHistory` was implemented, Zazu reconstructs what it can from the `history` array on first encounter (a one-time migration script)
- `durationMs: null` on the current stage means "still in this stage" — scripts compute elapsed time as `now - enteredAt`

### Key metrics this enables

| Metric | Formula | Insight |
|---|---|---|
| **Lead time** | `completedAt - createdAt` | Total time from idea to done |
| **Cycle time** | Sum of `durationMs` for ACTIVE + ASSIGNED stages | Active work time only, excluding wait |
| **Wait ratio** | `(lead time - cycle time) / lead time` | What fraction of task life is idle |
| **Stage velocity** | Median `durationMs` per stage per category | Where each category type gets stuck |
| **IDEA decay rate** | % of tasks that exit IDEA within 14 days | Are ideas converting or dying on the vine? |
| **RESEARCH stall rate** | % of tasks in RESEARCH > 30 days | Research phase is the common execution bottleneck |

---

## Reflection Layer Design

### Purpose

Raw timestamps tell you *that* something stalled. Reflections tell you *why*. The goal is a lightweight, Zazu-mediated weekly check-in that enriches board data with qualitative context without requiring Dad or Mom to open a laptop.

### Cadence

- **Nightly micro-check (Zazu-initiated, Mon–Fri):** Zazu selects 1–2 tasks that moved or stalled that day and asks a single yes/no or short-answer question via iMessage. Example: "Quick one — you had a call about the shed contractor today. Did that move forward or still waiting on quotes?"
- **Weekly reflection (Sunday evening, ~5 min):** Zazu sends a structured 4–5 question debrief covering the prior week's active tasks. Responses are parsed and written back to task fields.
- **Completion debrief (triggered on DONE):** When a task is marked done, Zazu asks two questions: "How long did that actually take?" and "Anything that made it harder than expected?" Responses populate `effortActualHours` and `resistanceScore` retroactively.

### Weekly reflection question set (Sunday, 8pm)

```
Zazu: Quick Sunday review — takes about 5 min.

1. This week's wins: which tasks did you finish that felt good? 
   (Just name them or say "none")

2. Stuck tasks: anything you saw on the board but didn't touch — 
   what's the real blocker?

3. Effort check: for any task you completed, roughly how long did 
   it take? (e.g., "shed quotes took about 2 hours total")

4. New tasks in the queue: anything you know is coming next week 
   that isn't on the board yet?

5. Energy scan: when did you get the most done this week — 
   mornings, evenings, or weekends?
```

### How Zazu stores reflection responses

Responses are parsed (Zazu reads the iMessage thread, extracts entities) and written back:
- Task names mentioned in Q1 → validate DONE status or set `completionQuality`
- Blockers mentioned in Q2 → append to `zazuNotes`, increment `resistanceScore` if persistent
- Time estimates in Q3 → populate `effortActualHours`
- New tasks from Q4 → create tasks in IDEA stage with `intentOrigin: PROACTIVE`
- Energy context in Q5 → stored in a separate weekly `reflections[]` array (see below)

### New top-level `reflections[]` array in board-data.json

```json
"reflections": [
  {
    "id": "ref_001",
    "weekStarting": "2026-06-08",
    "respondent": "DAD",
    "capturedAt": "2026-06-14T20:15:00.000Z",
    "tasksCompleted": ["t_001", "t_005"],
    "blockerTaskIds": ["t_8gak2bf"],
    "blockerNotes": "tax docs — kept finding new items to gather",
    "energyPeak": "weekend_morning",
    "rawResponse": "...",
    "processedByZazu": true
  }
]
```

---

## Analytics Scripts Roadmap

Listed in implementation priority order. All scripts consume `board-data.json` directly and output to stdout (JSON or markdown table) or write to `analytics/outputs/`.

### Tier 1 — Build now (no schema changes required)

| Script | File | Output | Question answered |
|---|---|---|---|
| `board-health.js` | `analytics/scripts/` | Markdown summary | How many tasks are active, stale, overdue, duplicated? |
| `completion-rate.js` | `analytics/scripts/` | Rate by category, owner, source | What % of tasks reach DONE, broken down by category and owner |
| `lead-time-basic.js` | `analytics/scripts/` | Histogram + median by category | **DONE (Jun 30):** wired into `analytics-refresh.sh`. How long do tasks take from creation to done, by category |
| `brief-pressure.js` | `analytics/scripts/` | Ranked list of high-brief incomplete tasks | **SUPERSEDED (Jun 30):** `board-health.js` already has a "High Brief Count" + "Resistance Flagged" section covering this exact question — a standalone script would be redundant. Not building separately. Which tasks are Zazu briefing repeatedly with no action — drag signal |
| `dedup-detector.js` | `analytics/scripts/` | List of likely duplicate task clusters | **DONE (Jun 30):** wired into `analytics-refresh.sh`, Jaccard title-similarity. Identify duplicate tasks for cleanup (WYZE, insurance, CMA variants) |

### Tier 2 — Build after `stageHistory` is implemented (Week 2)

| Script | File | Output | Question answered |
|---|---|---|---|
| `cycle-time.js` | `analytics/scripts/` | Cycle time per stage, per category | **DONE:** wired into `analytics-refresh.sh`. Where in the pipeline does each category type actually stall? |
| `stage-funnel.js` | `analytics/scripts/` | Funnel chart data (IDEA→RESEARCH→ACTIVE→DONE) | **DONE:** wired into `analytics-refresh.sh`. What % of tasks drop out at each stage? |
| `wait-ratio.js` | `analytics/scripts/` | Wait ratio per task and category average | **DONE (Jun 30):** wired into `analytics-refresh.sh`. How much of each task's life is active work vs. idle waiting? |
| `snooze-pattern.js` | `analytics/scripts/` | Snooze frequency by owner, day-of-week | When do people defer, and do they come back? |

### Tier 3 — Build after 30+ days of reflection data

| Script | File | Output | Question answered |
|---|---|---|---|
| `disposition-map.js` | `analytics/scripts/` | Scatter of taskType vs completion rate | What task shapes does the family naturally execute on vs. avoid? |
| `effort-accuracy.js` | `analytics/scripts/` | Estimated vs. actual hours by effortTag | Are L tasks actually L, or are they always XL in practice? |
| `energy-correlation.js` | `analytics/scripts/` | Energy context vs. task completion day | Do tasks tagged HIGH_FOCUS complete faster on weekends? |
| `resistance-predictor.js` | `analytics/scripts/` | Linear regression on resistanceScore vs. lead time | Does early resistance signal predict eventual abandonment? |
| `goal-progress.js` | `analytics/scripts/` | % of linked tasks done per goal | Are stated goals actually being worked toward? |

### Tier 4 — Dashboard feeds (Month 2+)

| Script | Output |
|---|---|
| `weekly-digest.js` | JSON payload for a Zazu Sunday brief: velocity, wins, stalls |
| `trend-report.js` | Month-over-month: throughput, lead time trend, category velocity trend |
| `dashboard-api.js` | Express endpoint serving analytics JSON to a future React dashboard |

---

## Insight Categories

These are the specific patterns the system is being built to surface. Listed in order of likely value.

### 1. Natural Disposition Profile

**Question:** For which task types does the family have high natural execution velocity, and for which does it consistently slow, stall, or never complete?

**How detected:** Cross `taskType` against median cycle time and completion rate. Example hypothesis: MAINTENANCE tasks (HVAC, registration) complete fast because they have clear next actions; PROJECT tasks (shed, home automation) stall in RESEARCH indefinitely.

**Current preview from raw data:** ADMIN deadline tasks with external accountability (CPA, insurance) complete within days. GOALS-category tasks have near-zero completions. YARD multi-step projects have been open 14+ months.

### 2. Stage-Specific Drag

**Question:** Which pipeline stage is the reliable bottleneck for each category?

**How detected:** `stageHistory` median `durationMs` by stage and category. Hypothesis: the RESEARCH stage is where most projects die — once tasks reach ACTIVE, they tend to complete.

**Early signal:** t_002 (Build Backyard Shed) has been in RESEARCH since April 2025 — 14+ months. No `stageHistory` yet, but `createdAt` + current stage gives a floor estimate.

### 3. Brief Pressure / Resistance Signals

**Question:** Which tasks are being repeatedly surfaced by Zazu with no action — indicating real resistance rather than forgetting?

**How detected:** `briefCount` >= 3 on non-done tasks. Currently, t_8gak2bf (tax docs, briefCount: 3) is the clearest live example.

**Why it matters:** High brief-count tasks are not forgotten — they are consciously or unconsciously avoided. These need a different intervention than a reminder.

### 4. Source Channel Velocity

**Question:** Do tasks originating from email, iMessage, or manual entry complete at different rates?

**How detected:** Group completed tasks by `source`, compute median lead time. Hypothesis: `email`-sourced tasks (external trigger, concrete context) close faster than `manual`-sourced tasks (internal intent, less defined).

**Current preview:** Email-sourced tasks in this dataset close same-day in many cases (insurance, recalls) — but this is partly a deduplication artifact. Needs clean data.

### 5. Owner Execution Patterns

**Question:** Are Dad and Mom executing on different task types? Are BOTH-owner tasks systematically slower (coordination overhead)?

**How detected:** Completion rate and cycle time by `owner`. Hypothesis: `BOTH`-owner tasks are slower because they require coordination that never gets explicitly scheduled.

**Current preview:** Several BOTH-owner active tasks (home automation, travel plans, clearout) have no history entries beyond creation — no movement visible.

### 6. Proactive vs. Reactive Task Ratios

**Question:** What fraction of board tasks are proactively planned vs. reactively captured from external inputs?

**How detected:** `intentOrigin` field. A board skewed heavily reactive is in triage mode; a board with significant PROACTIVE tasks reflects intentional planning.

**Current preview (inferred):** >60% of tasks appear reactive (email/iMessage sourced). Manual-sourced tasks are a mix of proactive planning and things that surfaced in conversation.

### 7. Estimation Accuracy

**Question:** When tasks are estimated (effortTag), how accurate are the estimates in practice?

**How detected:** `effortTag` vs. `effortActualHours` vs. task type and category. Requires 60+ days of reflection data to be meaningful.

### 8. Goal-to-Task Alignment

**Question:** Are the stated goals in `goals[]` actually getting worked toward, or are they aspirational labels with no task throughput?

**How detected:** `goal-progress.js` script — % of `linkedTaskIds` per goal that have reached DONE. Currently only 2 goals defined, with linked tasks mostly not done (backyard, admin deadlines).

---

## Phased Rollout Plan

### Week 1 (June 10–16): Instrumentation and cleanup

**Goal:** Get clean data flowing without breaking anything.

1. ~~**Deploy `dedup-detector.js`**~~ **DONE (Jun 11):** 16 duplicate tasks identified and archived manually. Board cleaned from 47 → 31 open tasks. Analytics baseline is now clean. Future dedup detection will be script-assisted, but the one-time cleanup is complete.
2. **Implement `stageHistory` writing** — modify the Zazu board-write code path so that every stage transition appends to `stageHistory`. One-time script to reconstruct partial `stageHistory` from existing `history` entries where possible.
3. **Add `taskType` inference** — Zazu infers `taskType` from title + category for all new tasks. Rule set: `category: ADMIN + contains "renew" → MAINTENANCE`; `category: GOALS → PROJECT`; `calendar event / school notice → EXTERNAL_EVENT`; `email triage action item → ERRAND`. Dad confirms or overrides via iMessage.
4. **Deploy `board-health.js` and `completion-rate.js`** — run nightly, output to `analytics/outputs/daily-health.md`. Zazu reads this file during morning briefing prep.
5. **Begin Sunday reflection protocol** — first check-in Sunday June 15. Keep it short (3 questions max in Week 1).
6. **Nightly git commits** ✅ — established Jun 11. Board state is now version-controlled. Every change Zazu makes to `board-data.json` is committed nightly with a summary message. This creates a historical record that can backfill `stageHistory` and provides a time-series dataset for trend analysis independent of real-time field tracking.

### Week 2 (June 17–23): Phase tracking live

1. **Add `effortTag` prompt** — Zazu asks one question when creating new tasks via iMessage: "Quick or bigger project? Reply XS, S, M, L, or XL." No prompt for email-sourced tasks (too noisy); Zazu infers from task type.
2. **Deploy `cycle-time.js` and `stage-funnel.js`** — first real cycle time data begins accumulating.
3. **Add `resistanceScore` writes** — Zazu increments `resistanceScore` on tasks where it has briefed 3+ times with no stage movement. Surfaces these in Sunday reflection.
4. **Add `intentOrigin` auto-classification** — derive from `source`: `email` → REACTIVE, `imessage` → REACTIVE, `manual` → PROACTIVE (with override).

### Month 2 (July): Reflection data + trend analysis

1. **Add `effortActualHours` collection** — Zazu asks on task completion: "Roughly how long did that take? Just a number in hours is fine."
2. **Add `completionQuality` confirmation** — when Zazu marks a task done via briefing, it asks: "Is that fully done, or just parking it for now?" (one-word response).
3. **Deploy `disposition-map.js`** — first real "natural disposition" data by end of July if Week 1–2 rollout is complete.
4. **Define additional goal entries** — add 3–5 meaningful goals with `linkedTaskIds` to enable goal progress tracking.
5. **Weekly digest to Zazu morning brief** — `weekly-digest.js` feeds into Sunday night or Monday morning brief message.

### Month 3+ (August): Dashboard and intelligence

1. **`dashboard-api.js`** — serve analytics JSON for a future React/Next.js family dashboard. This is a stretch goal; the raw scripts are the priority.
2. **`resistance-predictor.js`** — enough data by August to attempt a simple linear regression on resistance signals vs. lead time outcomes.
3. **Trend reporting** — month-over-month velocity, stall rates, category throughput trend.
4. **Review with Dad** — structured 30-minute review of Month 1–2 insights. Refine tracking fields based on what proved useful vs. noise.

---

## Open Questions for Dad

These require human judgment to proceed:

1. ~~**Duplicate task cleanup**~~ **RESOLVED:** 16 duplicate tasks archived Jun 11. Board is at 31 open tasks. Going forward, Zazu checks for existing tasks before adding email-triage items.

2. **Effort tagging friction tolerance:** The `effortTag` prompt (XS/S/M/L/XL) adds one iMessage exchange per new task. Is that acceptable, or would you prefer Zazu auto-infer it silently and you only correct outliers during the weekly reflection?

3. **Reflection timing:** Sunday evening is proposed for the weekly reflection. Does that timing work, or would a different day/time (e.g., Friday afternoon) fit better with how your week actually ends?

4. **GOALS category:** You have 2 goals (Earnventory, HBAR calculator) and a third likely forming. Goals behave differently from household tasks — they may warrant a separate execution model (milestones, sprint-style check-ins) rather than the standard IDEA→DONE funnel. Worth discussing whether GOALS tasks should be tracked differently.

5. **Mom's participation:** The reflection layer is designed primarily for Dad as the primary iMessage user. Should Mom get a parallel reflection prompt, or is the Sunday check-in a shared one (one response covers both)?

6. **Privacy/sensitivity:** Some tasks contain financial details (tax docs, property addresses, account numbers) in the `notes` field. The analytics scripts will process these but not display them in output summaries. Confirming this boundary is correct — analytics outputs should never include PII from notes.

7. **"Done" definition hygiene:** Several tasks were bulk-marked DONE in session (insurance and recall duplicates) that weren't actually executed — they were just board cleanup. Going forward, should DONE require a `completionQuality` value, making the close a 2-step confirmation rather than a one-tap? This would eliminate the "bulk close" noise from analytics.

---

---

## Zazu's Nightly Observations (Jun 10–12)

Patterns noted during active board management this week that informed plan refinements:

**Jun 10:** Tax task (t_8gak2bf) briefCount reached 3 with no stage movement. First real live `resistanceScore > 0` candidate. Task has external accountability (CPA waiting) but internal friction (document gathering is tedious, non-delegatable). This is the prototype case for the reflection layer — a brief pressure script would surface it, a Sunday reflection would capture the "why."

**Jun 11:** Water Play Wednesday task closed after the event date passed. Confirmed the `EXTERNAL_EVENT` auto-close rule is operationally useful — this task would have sat on the board indefinitely without the rule, adding noise to stall metrics.

**Jun 12:** Three distinct task types active simultaneously: Kojo wedding RSVP (DECISION with hard deadline), Techstars application (PROJECT with external deadline), Child_1 Newsletter (PROJECT with no hard deadline). These behave entirely differently in the funnel — deadline-driven DECISION tasks close fast; open-ended PROJECT tasks drift. The `taskType` + `dueDate` combination will be the strongest predictor of task velocity once the dataset builds.

**Ongoing signal:** Board is skewed heavily toward ADMIN and FAMILY tasks with near-zero YARD and GOALS throughput. The shed (t_002, YARD) has been in RESEARCH since April 2025. GOALS tasks (Earnventory, HBAR) have board presence but no sub-task decomposition — they are goals masquerading as tasks. This is likely a primary contributor to low GOALS completion rates.

---

*Nightly refinements complete. Final version ready for Saturday June 13 4pm review.*
