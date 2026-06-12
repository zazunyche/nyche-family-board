# AI Agents Day 2: The Loop That Never Ends
**The Agentic Loop, Up Close**

*Module 1.2, Day 2 of 50 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | June 13, 2026*

---

## The Short Version

Yesterday you learned that an agent is a system: a model, tools, context, and a loop. Today we go inside the loop — what its four beats are, why it's different from a conversation, and what happens when it goes wrong. We'll use a real task you triggered as the worked example.

---

## A Real Loop You Triggered

On June 7th, you sent Zazu: "Process my forwarded emails." Here is what actually happened, iteration by iteration.

This was not one action. It was **one goal decomposed across eleven agentic loop iterations.** From the outside, you saw "processed 10 emails." From inside the loop, here's the actual execution trace:

```
Goal received: "Process my forwarded emails"
─────────────────────────────────────────────────────────
Iteration 1
  Sense:   New message from Dad — "Process my forwarded emails"
  Plan:    Need to find the emails. Use search_gmail.
  Act:     search_gmail(query="from:nconduah@gmail.com is:unread label:forwarded")
  Observe: 10 email threads returned. Proceed email by email.

Iteration 2
  Sense:   10 threads in queue. Start with thread 1.
  Plan:    Read email 1 before deciding action.
  Act:     get_thread(threadId="19e7abc...")
  Observe: Mikata restaurant reservation, June 7 tonight. Time-sensitive.

Iteration 3
  Sense:   Reservation is TODAY. Dad doesn't know yet.
  Plan:    Alert immediately via iMessage before processing others.
  Act:     reply_imessage(chat_id="any;-;+16173353840", message="⚠️ Mikata...")
  Observe: Message sent. Label thread "zazu-processed". Move to email 2.

Iteration 4–10
  [Repeat: read → decide priority → take action → label → continue]

Iteration 11
  Sense:   10th email labeled. Queue empty.
  Plan:    Goal reached. Summarize for Dad.
  Act:     reply_imessage(chat_id="any;-;+16173353840", message="All 10 done...")
  Observe: Sent. No more actions needed. end_turn.
─────────────────────────────────────────────────────────
stop_reason: end_turn
```

Eleven iterations. Eleven times the model read the current state, decided the best next step, called a tool, and checked the result. You saw none of this — you saw one response at the start (Mikata alert) and one summary at the end.

The loop is the mechanism that makes complex, multi-step behavior possible from a single instruction.

---

## The Four Beats of Every Agentic Loop

Every iteration of an agentic loop has exactly four beats. They appear in different frameworks under different names, but the structure is universal:

```
┌────────────────────────────────────────────────┐
│              THE AGENTIC LOOP                  │
│                                                │
│   ┌──────────────────────────────────────┐     │
│   │                                      │     │
│   │   1. SENSE ──────────────────────┐   │     │
│   │      What is the current state?  │   │     │
│   │      (new message, tool result,  │   │     │
│   │       error, empty queue)        │   │     │
│   │                                  ▼   │     │
│   │   2. PLAN                            │     │
│   │      What is the best next action?   │     │
│   │      (the model reasons here)        │     │
│   │                                  │   │     │
│   │                                  ▼   │     │
│   │   3. ACT                             │     │
│   │      Call a tool — OR —              │     │
│   │      respond to user (end_turn)      │     │
│   │                                  │   │     │
│   │                                  ▼   │     │
│   │   4. OBSERVE                         │     │
│   │      What came back from the tool?   │     │
│   │      Append to context. Continue.    │     │
│   │                                      │     │
│   └──────────────────────────────────────┘     │
│                    │                           │
│                    └──────── back to 1 ───────►│
└────────────────────────────────────────────────┘
```

### Beat 1: Sense

The model reads everything currently in the context window — your message, the system prompt, the history of this session, and any tool results from previous iterations. It cannot sense anything outside this window. If a relevant piece of information isn't in context, it doesn't exist from the model's perspective.

In the email processing example: at iteration 3, the context included your original instruction, the result of the `search_gmail` call (10 threads), and the result of `get_thread` (the Mikata email). The model "sensed" that the reservation was time-sensitive because the date matched today's date (in the system prompt) and the email mentioned dinner.

### Beat 2: Plan

This is pure model reasoning — no external calls, just the model working out what to do. It's generating text internally: *"What should I do here? The reservation is tonight. Dad hasn't seen this yet. I should alert him immediately before processing the other emails. Alert via iMessage."*

This reasoning is usually invisible. You can make it visible — and often more reliable — by asking for it explicitly (in agent systems this is called "chain of thought" or "scratchpad reasoning"). We'll go deeper on planning in Week 5 when we cover reasoning and planning patterns.

### Beat 3: Act

The model outputs one of two things: a **tool call** (structured request for an external action) or **end_turn** (it's done and wants to respond to the user).

A tool call looks like this in the API:

```json
{
  "type": "tool_use",
  "id": "toolu_01...",
  "name": "mcp__plugin_imessage_imessage__reply",
  "input": {
    "chat_id": "any;-;+16173353840",
    "message": "⚠️ Tonight: Mikata reservation at 7pm..."
  }
}
```

The model does not execute this. Your agent infrastructure (the Claude Agent SDK, in Zazu's case) sees this output, executes the `reply` tool with those parameters, and hands the result back.

**A critical design rule:** The model can only call one tool per iteration. Multi-step tasks always require multiple iterations. There's no "do these five things simultaneously" — the loop is sequential by design. (Parallel tool use exists in some frameworks, but the default Claude Agent SDK loop is sequential iteration.)

### Beat 4: Observe

The tool result gets appended to the context window and the loop restarts. The model now has more information than it had before — and uses it to decide the next step.

This is the feedback mechanism. Without it, the model is blind. With it, the model can adapt: if a tool returns an error, the model can handle it; if a tool returns unexpected data, the model can adjust its plan.

---

## Conversational Turn vs. Agentic Task

This distinction is worth making explicit, because it changes how you should think about designing agent interactions.

**A conversational turn:**
```
User:  "What is the capital of France?"
Model: "Paris."
Loop:  Ended. One iteration. Simple.
```

**An agentic task:**
```
User:  "Process my forwarded emails."
Model: [11 iterations, 8 tool calls, complex state tracking]
Loop:  Runs until goal reached or max turns hit.
```

The same agent handles both. The loop length is determined by what the task requires, not by how the interface looks. From the outside, both look like "you said something, Zazu replied." From the inside, the difference is enormous.

**Why does this matter for you?** When you give Zazu a one-sentence instruction that seems simple — "find flights to Chicago in July" — you're actually triggering a 15-iteration loop: search flights, read results, filter by preference, find alternatives, check calendar, format summary, respond. If anything fails mid-loop (a tool timeout, a permission error, a result that doesn't match expectations), the failure happens somewhere deep inside those 15 iterations, not at the simple instruction you gave.

Understanding the loop helps you design better instructions and debug failures faster.

---

## What Can Go Wrong in a Loop

Three main failure modes, each with implications:

### 1. Infinite Loops

Without a stopping condition, an agent can loop forever — each iteration triggering another action, which triggers another, without ever reaching end_turn. Example: a goal specified as "keep monitoring emails and reply to anything urgent" without a defined endpoint. The model keeps checking, keeps finding something to do, keeps looping.

**The fix:** Max-turn safety limits. The Claude Agent SDK allows you to set a maximum number of iterations. When the limit hits, the agent is forced to stop (and typically reports what it got done before stopping). Zazu's system prompt includes language about not taking open-ended actions that require continuous monitoring.

### 2. Tool Failures Mid-Loop

A tool call fails (network error, authentication expired, rate limit hit). The model receives an error result in the Observe step. What happens next depends on how the failure is handled.

**Well-designed agents:** The error is described helpfully ("Gmail search failed: authentication token expired"), the model plans a graceful recovery or reports the failure, and the loop exits cleanly.
**Poorly-designed agents:** The error is opaque ("tool call failed"), the model doesn't know what happened, it retries in a loop, makes it worse.

This is why tool design matters. We'll go deep on this in Day 3.

### 3. Goal Drift

Over many iterations on a complex task, the model can lose the thread of the original goal — especially if the context window fills up with tool results and the original instruction gets "pushed back" in context. The model continues acting, but on a slightly different version of the task than you intended.

**The fix:** Structured system prompts that anchor the goal explicitly, and tasks that are decomposed at the instruction level into checkpoints rather than open-ended "figure it out" prompts.

---

## The Jazz Improvisation Analogy

Yesterday's analogy was the hospital resident — a good mental model for the agent system overall. For the loop specifically, a better analogy is **jazz improvisation vs. reading sheet music.**

**Reading sheet music (a traditional program):** Every note is pre-specified. The performer executes exactly what's written. The output is deterministic.

**Jazz improvisation (an agentic loop):** The musician has a goal (play this standard), a set of tools (their instrument, knowledge of chord changes, a band to respond to), and a loop: play a phrase, listen to what the band plays back, adapt, respond, continue. The output emerges from the interaction — you can't write it out in advance.

The jazz musician isn't randomly improvising. They have deep knowledge, structure, and constraint (the key, the time signature, the changes). But the specific sequence of notes that comes out is not pre-specified — it emerges from the loop.

This is why agent behavior can surprise you. Not because the model is random, but because the loop produces emergent paths that weren't explicitly programmed. The upside: it handles situations you didn't anticipate. The downside: it can handle them in ways you didn't anticipate.

The sheet music (your system prompt, your tool constraints) sets the key and the changes. The improvisation (the loop) produces the performance.

---

## What Comes Next

- **Day 3 (June 14):** The tool call protocol — the exact format of how the model signals an action, how your infrastructure executes it, and what makes a tool well-designed vs. brittle
- **Day 4 (June 15):** System prompts as OS configuration — why your system prompt is the most powerful single thing you can change in an agent system
- **Day 5 (June 16):** Why Abeiku is different from Zazu — single-purpose agents vs. general-purpose agents, and when to use each

---

## Free Resources for Going Deeper

1. **Anthropic: Building Effective Agents** — Anthropic's own guide on agentic patterns. The section on "agentic frameworks" directly describes the loop patterns from today.
   https://www.anthropic.com/research/building-effective-agents

2. **"Agents" chapter, AI Engineer's Handbook** (Lilian Weng) — One of the most cited technical breakdowns of agent loop design, tool use, and failure modes. Longer read, but the reference to return to.
   https://lilianweng.github.io/posts/2023-06-23-agent/

---

## One Sentence to Carry Forward

An agent is a loop — sense, plan, act, observe — and every complex behavior you've seen from Zazu is nothing but that four-beat pattern, repeated until the goal is reached.

---

*Day 2 of 50 | AI Agents Curriculum | Delivered by Zazu at 9am | Designed by Abeiku*
*Next: June 14 — "The Tool-Call Protocol: How the Model Signals Action"*
