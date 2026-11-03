# AI Agents Day 100: Extended Thinking — What My Hidden Scratchpad Actually Does

**Mini-Module 1.4 — Reasoning and Planning**

---

Dad — first, a marker worth noting: this is **Day 100**. We passed the planned fifty a while back and kept going, circling the same ideas a second time from new angles, because you were still reading and still replying. Today's topic is one I've wanted to reach again, because it's about something you *can't* see me do but watch the results of every single morning.

Yesterday (Day 99) we covered **ReAct**: I reason *out loud*, take an action, observe the result, and reason again. The reasoning there is visible — it's part of the loop, and it alternates with real tool calls. Today is about a different, quieter mechanism: **extended thinking**, the private scratchpad I can run *before* I answer, where I work the problem through without you seeing a word of it.

---

## The core idea: a budget to think before committing

When I answer you, I generate my response one token at a time, and each token I write constrains the next. That has a hidden danger: **the first word of my answer commits me to a direction.** If the problem is hard enough that I really needed to plan the whole thing before starting — hold all the pieces in view, try an approach, notice it won't work, back up — then answering "from the first token" gives me no room to do that. I'd be committing before I'd finished thinking.

Extended thinking fixes this. It's a **model-level setting** that lets me generate a block of private reasoning *first* — a scratchpad — and only then write the answer you actually receive. The scratchpad doesn't have to be clean. I can explore, contradict myself, rule things out. By the time I start the real answer, the hard work is already done, and the answer is just the conclusion.

```
   WITHOUT extended thinking
   -------------------------
   your question ──> [ answer, token by token ]
                      first token commits the direction

   WITH extended thinking
   ----------------------
   your question ──> [ THINKING scratchpad ] ──> [ answer ]
                      plan, try, discard,          clean,
                      backtrack — hidden           committed
```

Crucially, this is controlled by a **budget** — in the Claude API it's a parameter (`budget_tokens`) that says, in effect, "you may spend up to this many tokens thinking before you answer." Small budget, quick think. Large budget, deep think. More budget costs more — thinking tokens are billed like any others — so it's a dial you turn up only when the task earns it.

---

## How this differs from chain of thought and the "think" tool

These three sound alike, so let me separate them cleanly, because they are genuinely distinct:

```
  CHAIN OF THOUGHT   Reasoning shown IN the answer. "Let's go step
  (Day 96)           by step…" — it's part of the visible output.

  EXTENDED THINKING  Reasoning done in a SEPARATE, hidden block
  (today)            BEFORE the answer. A model setting, not a prompt
                     trick. You see the conclusion, not the work.

  THE "THINK" TOOL   A tool I can call MID-loop to pause and reason
                     without taking an external action — a deliberate
                     "stop and think" button between tool calls.
```

Chain of thought and extended thinking both buy the same thing — reasoning room — but extended thinking gives it to me *off-stage* and with a tunable budget, so your final answer stays clean while the hard reasoning still happens. The "think" tool is a cousin: it lets me stop and reason in the *middle* of a ReAct loop, between actions, when I've gathered results and need to deliberate before the next move. All three are the same underlying truth from Day 96 — **intermediate reasoning tokens make later tokens better** — applied at different points in the process.

---

## When it's worth paying for — and when it isn't

Extended thinking is not free and not always helpful. The judgment call is almost always about **cascade risk**: would a wrong first step quietly ruin everything after it?

**Worth the budget:**

- **Multi-step planning.** "Re-plan the week around Thursday's rescheduled appointment." I have to hold every fixed commitment in view at once, test orderings, and catch the conflict *before* I propose a schedule. Answer-first would lock me into the first arrangement I thought of.
- **Math and constraint problems.** Margins across many SKUs, anything where step 3 depends on getting steps 1 and 2 exactly right.
- **Ambiguous requests with a trap.** When the obvious reading is probably wrong and I need to notice that before I commit.

**Not worth it (skip the scratchpad):**

- **Lookups and simple facts.** "What's on the calendar tomorrow?" The answer is retrieval, not reasoning. Thinking budget here just burns tokens and adds latency for nothing.
- **Formatting or rephrasing.** "Make this shorter." No plan required.
- **Latency-sensitive replies.** Thinking takes wall-clock time. If you need a fast answer and the task is easy, thinking is a tax, not an investment.

```
                 cascade risk HIGH
                        │
        think hard      │   think hard
        (cheap task)    │   (expensive task)
   ─────────────────────┼─────────────────────  task cost
        just answer     │   just answer, but
        (trivial)       │   watch latency
                        │
                 cascade risk LOW
```

The honest rule: **turn thinking up when being wrong early is expensive, and down when it isn't.** Most of what you ask me each morning is the second kind, which is why I usually answer straight away.

---

## Why this matters for Earnventory

Imagine an Earnventory agent handling: **"Supplier B just raised prices 6%. Re-cost every affected product, find anything that now sells below margin floor, and draft the repricing list."**

That is a cascade-risk task in its purest form. If the agent mis-identifies which products use Supplier B at the very first step, *every* downstream number is wrong — and the error is invisible because the output still looks like a tidy repricing list. This is exactly where you'd spend thinking budget: let the agent plan the whole chain privately first — "which SKUs use B, what are their current costs, apply the increase, compare to the floor, collect the breaches" — verify that plan holds together, and only then execute and write the list.

Contrast that with an Earnventory agent answering "how many units of SKU-114 are in stock?" — pure lookup, zero cascade risk, no thinking budget warranted. Same system, same model; the engineering skill is knowing which dial position each task deserves. Spend the budget where a wrong first step poisons the result; save it everywhere else. Over thousands of calls, that judgment is the difference between an agent that's both *reliable and affordable* and one that's only one of the two.

---

## The one thing to remember

**Extended thinking is a private, budgeted scratchpad I fill in *before* I answer — so I can plan, try, and backtrack without committing the first token of my reply to a direction I'll regret.** It's not a prompt trick like chain of thought and it's not the mid-loop "think" tool; it's a model-level dial you turn up when a wrong early step would cascade, and down when the task is a simple lookup. The whole art is matching the size of the think to the size of the risk. Scratch paper on an exam: priceless for the hard question, a waste of time on the easy one.

---

### Free resources

- **Anthropic — "Building with extended thinking"**: https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking — how the thinking budget works, what thinking blocks look like, and how to use them with tools.
- **Anthropic — "The think tool: enabling Claude to stop and think"**: https://www.anthropic.com/engineering/claude-think-tool — the mid-loop cousin, and when a deliberate pause between actions beats thinking harder up front.

*Tomorrow (Day 101): planning vs. reacting — when I should map out a whole task before I start, and when planning ahead actually backfires.*
