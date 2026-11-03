# AI Agents Day 32: Handoffs — What Transfers and What Doesn't

**Day 32 of 50 | Mini-Module 2.2: Multi-Agent Systems**

---

## The Moment of Delegation

You've already seen the multi-agent patterns: orchestrator directing subagents, pipelines passing results forward, fan-out dispatching parallel work. But there's a moment we've been circling around without examining directly — **the handoff itself**.

When Zazu decides to delegate a research task to Abeiku, something very specific happens at the protocol level. It's not telepathy. It's not a shared brain. It's a message — a structured text payload that Zazu constructs and delivers to Abeiku as a fresh conversation.

That construction decision is one of the most consequential choices in multi-agent system design. Get it wrong in one direction and your subagent fails because it lacks context. Get it wrong in the other direction and you're burning tokens, exposing sensitive data, and confusing the model with irrelevant history.

Today we break down exactly what moves across that boundary — and what doesn't.

---

## What a Handoff Looks Like at the API Level

In the Claude API, there's no special "delegate to subagent" call. A handoff is just... a new API request. The orchestrator constructs a `messages` array and a `system` prompt for the subagent, then initiates a fresh conversation.

That means the orchestrator has complete, explicit control over what the subagent sees. It can include a custom system prompt scoping the subagent's role, a user turn with the specific task and pre-gathered context, tool definitions the subagent is allowed to use, and the required output format. Anything not included simply doesn't exist for the subagent.

Here's what that looks like schematically:

```
ORCHESTRATOR CONTEXT (full, accumulated)
┌────────────────────────────────────────────────────────────────┐
│ System: You are Zazu, the Nyche family house manager...        │
│ User: Find me supplier invoices from the last 7 days           │
│ Assistant: [reasoning, tool calls, observations...]            │
│ ... 40 more turns of conversation history ...                  │
│ Assistant: I need deep pricing analysis. Delegating to Abeiku. │
└────────────────────────────────────────────────────────────────┘
                          │
                          │  HANDOFF (what gets constructed)
                          │  [orchestrator decides every byte]
                          ▼
SUBAGENT CONTEXT (scoped, fresh)
┌────────────────────────────────────────────────────────────────┐
│ System: You are Abeiku, a pricing analyst. Return structured   │
│         JSON. No other tasks in scope.                         │
│ User: Analyze the margin impact of these 3 invoices:           │
│       [invoice data passed explicitly]                         │
│       Current EUR/USD rate: 1.08                               │
│       Output: {"sku": ..., "margin_delta_pct": ...}            │
└────────────────────────────────────────────────────────────────┘
```

The subagent doesn't know about the 40-turn orchestrator conversation. It doesn't know what Zazu knows about the family's preferences. It doesn't know it *is* a subagent. It just sees the task it was given.

---

## What Transfers in a Handoff

The orchestrator decides everything. But principled design follows consistent rules about what *should* transfer:

### 1. The Task Instruction (Always)

The subagent needs a specific, unambiguous assignment. The quality of this instruction is the single biggest determinant of subagent output quality. Vague handoffs produce vague results — and the subagent has no way to ask for clarification mid-task unless you've explicitly given it a tool to do so (which is itself a design choice).

**Weak handoff instruction:**
```
"Analyze supplier pricing."
```

**Strong handoff instruction:**
```
"Analyze the margin impact of the 3 invoices below given current EUR/USD
at 1.08. For each SKU, compute (cost_increase / current_price) × 100.
Return JSON array: [{sku, old_margin_pct, new_margin_pct, delta_pct}].
Flag any SKU where delta_pct exceeds 5%."
```

The second version leaves no room for interpretation. The subagent can execute deterministically.

### 2. Necessary Context (Curated, Not Dumped)

Raw facts the subagent can't retrieve on its own and needs to complete the task. The key word is *necessary*. You extract the relevant slice from your full context — not the whole thing.

If Abeiku is doing invoice analysis, you pass the invoice data. You do not pass the full family calendar, the morning weather briefing, the conversation history about school pickups, and Zazu's complete system prompt. Those are irrelevant to this task and will dilute the model's attention.

### 3. Tool Definitions (Scoped to Task)

What tools is this subagent allowed to use? You define the minimum set needed for its specific assignment. If it's a read-only analysis task, don't include tools that write to databases or send emails. This is both a reliability optimization (fewer choices leads to cleaner tool selection) and a security boundary (limits blast radius if the subagent behaves unexpectedly or gets prompt-injected).

### 4. Output Format Requirements

Explicitly define what format the subagent should return results in. If the orchestrator is going to parse structured JSON, the subagent needs to know that upfront — not infer it from context. Ambiguous output requirements produce inconsistent outputs that break downstream processing.

---

## What Doesn't Transfer (and Why)

The more instructive list:

### 1. The Orchestrator's Full Conversation History

Passing everything is expensive: if the orchestrator has accumulated 40,000 tokens of context, including all of it in the subagent's context approximately doubles your token spend for that call. More importantly, irrelevant context adds noise. The model's attention mechanism is probabilistic — if 80% of the context is about family logistics and only 20% is about the pricing task, the pricing analysis will be degraded by the noise. Relevance matters more than completeness.

### 2. Other Subagents' Internal Reasoning

In a fan-out pattern, five subagents work in parallel. Agent A's reasoning process is not relevant to Agent B's task. You may eventually pass Agent A's *output* to the orchestrator for synthesis — but Agent A's step-by-step chain of thought (which consumed tokens during its own execution) does not need to travel forward. Results travel. Process doesn't.

### 3. User Data Not Relevant to This Task

This is a security principle as much as an efficiency one. The orchestrator knows everything about the user's context. If a subagent only needs invoice data, it shouldn't receive the user's email history, contact list, or financial records. Minimum viable context is minimum viable exposure — if the subagent gets prompt-injected through a malicious tool result, limiting its context limits what the attacker can access or manipulate.

### 4. The Orchestrator's Full System Prompt and Identity

This may surprise you. Zazu's system prompt — the Nyche family context, broad permissions, full persona — is not handed to Abeiku. Abeiku gets its own, purpose-scoped system prompt: narrower mandate, tighter constraints, no access to Zazu's full authority. The subagent is not the orchestrator. It shouldn't be given the orchestrator's keys.

---

## The Minimum Viable Handoff Principle

Across all of the above, there's a single underlying design principle:

> **Pass the minimum context the subagent needs to succeed at its specific task — and nothing more.**

This principle has three compounding benefits:

**Cost.** Token usage is the primary runtime cost in LLM systems. Every token in the subagent's context window costs money and adds latency. Tight handoffs keep costs proportional to task complexity rather than to the size of the orchestrator's accumulated history.

**Reliability.** Models perform better with focused, relevant context. A 2,000-token scoped handoff often produces better results than a 40,000-token dump of everything. Attention is finite and probabilistic — the more signal you give, the more noise you suppress.

**Security.** Each handoff is a trust boundary. You're handing a task to a system that will execute tool calls, potentially read and write data, and interact with external services. Limiting context limits the potential impact of unexpected behavior — whether from a model edge case or from an adversarially crafted prompt injection embedded in retrieved content.

---

## The Zazu → Abeiku Handoff: A Concrete Walk-Through

When Zazu delegated to Abeiku to research and write this curriculum, the handoff looked approximately like this:

```
Zazu constructs the subagent call:

├── system (Abeiku's, not Zazu's):
│   "You are Abeiku, a research analyst for the Nyche family.
│    Your task is to research and write a complete AI agents
│    curriculum. Return it as structured markdown files..."
│   [~300 tokens, purpose-specific]
│
├── user turn:
│   "Research and write a complete 8-module AI agents curriculum
│    for Dad. Requirements: MIT CS level, application-first,
│    delivered daily, 50 snippets, iMessage + email format...
│    [detailed specification]"
│   [~500 tokens of scoped requirements]
│
└── tools: [WebSearch, WebFetch, Write, Read]
    [research tools only — not calendar, not email, not memory write]
```

What Zazu did NOT include in this handoff:
- The family board's full conversation context
- Previous conversations with the Nyche family about schedules
- The MEMORY.md file contents
- Zazu's own system prompt (Abeiku got its own)
- Any other in-progress tasks Zazu was managing

Abeiku had exactly what it needed to produce the curriculum — and nothing more.

---

## Earnventory Application: Three-Agent Pipeline

Imagine an Earnventory orchestrator that handles a monthly supplier reconciliation:

```
User: "Run the monthly supplier reconciliation."
                        │
                        ▼
            ┌──────────────────────┐
            │    ORCHESTRATOR      │
            │  (full context)      │
            └──────────┬───────────┘
                       │
          ┌────────────┴────────────────────────────────┐
          │ HANDOFF A                                   │
          │ Task: "Pull all invoices from the last 30   │
          │ days from the ERP system."                  │
          │ Tools: [get_invoices, get_exchange_rates]   │
          │ Output format: invoice_data[]               │
          ▼                                             │
┌──────────────────────┐                               │
│  DATA RETRIEVAL      │  Returns: invoice_data[]       │
│  SUBAGENT            │ ────────────────────────────► │
└──────────────────────┘                               │
                                                       │
          ┌────────────────────────────────────────────┤
          │ HANDOFF B                                  │
          │ Task: "Analyze margin impact."             │
          │ Context: invoice_data[] (from step above)  │
          │ Tools: [none — calculation only]           │
          │ Output format: margin_report{}             │
          ▼                                            │
┌──────────────────────┐                              │
│  PRICING ANALYSIS    │  Returns: margin_report{}    │
│  SUBAGENT            │ ───────────────────────────► │
└──────────────────────┘                              │
                                                      │
          ┌───────────────────────────────────────────┤
          │ HANDOFF C                                 │
          │ Task: "Draft summary email for CFO."      │
          │ Context: margin_report{} (from step above)│
          │ Tools: [none — write only]                │
          │ Output format: email_draft (plain text)   │
          ▼                                           │
┌──────────────────────┐                             │
│  DRAFTING SUBAGENT   │  Returns: email_draft       │
└──────────────────────┘ ───────────────────────────►│
                                                      │
                        Orchestrator delivers to user ┘
```

Notice what's happening at each boundary: each handoff is a **narrowing**. The drafting subagent never sees raw invoices. The pricing subagent never sees email templates. The data retrieval subagent never knows a draft will be written. Each agent gets exactly the slice of context it needs for its task.

---

## The Failure Mode: Over-Transferring

It's tempting to just pass everything. "If I include more context, the subagent will have what it needs." This intuition is wrong in three ways:

**Token waste at scale.** A system making 100 subagent calls per day with 30,000-token handoffs is spending 3,000,000 tokens on context transfer alone — most of it irrelevant to the task. That's real money and real latency.

**Attention dilution.** When critical information is buried in a massive, unrelated context, the model may not weight it appropriately. Focused contexts produce sharper reasoning than sprawling ones, even when the sprawling one technically "contains" everything needed.

**Security exposure.** Over-transferring context means a prompt injection attack in one retrieved document could potentially influence or access information from unrelated parts of the system. The blast radius of a compromised subagent is directly proportional to how much context it was given.

The minimum viable handoff isn't just efficient — it's architecturally principled.

---

## Summary: The Handoff Checklist

Before constructing a handoff, ask:

```
✓ Does the task instruction leave any ambiguity about what to do?
✓ Is every piece of context I'm passing actually needed for this task?
✓ Am I including any user data the subagent doesn't need?
✓ Are the tool definitions scoped to this task, or am I giving broader access?
✓ Have I specified the output format explicitly?
✗ Am I tempted to just pass my full conversation history to be safe?
```

If any box is unchecked, tighten the handoff before you send it.

---

## What's Next

Tomorrow: trust between agents. You now know what transfers in a handoff. The next question is: *should the orchestrator trust what comes back?* The answer is more nuanced than "yes" — and the failure mode of uncritical trust between agents is one of the most dangerous patterns in multi-agent system design.

---

## Free Resources

1. **Anthropic's multi-agent systems guide** — covers orchestration architecture, context isolation between agents, and trust design in production systems:
   https://platform.claude.com/docs/en/agents-and-tools/agents

2. **"Multi-Agent Orchestration: 5 Patterns That Work"** — practical walkthrough of handoff design and information flow across the core multi-agent topologies:
   https://www.digitalapplied.com/blog/multi-agent-orchestration-5-patterns-that-work

---

*Day 32 of 50 | Mini-Module 2.2: Multi-Agent Systems | AI Agents Curriculum — Designed by Abeiku for Dad*
