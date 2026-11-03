# AI Agents Day 78: Handoffs — What Travels, What Stays Behind

---

## What You Know Coming In

You've seen why single agents hit a ceiling (Day 73), how orchestrators delegate to subagents with isolated context windows (Day 75), traced the Zazu/Abeiku delegation in concrete terms (Day 76), and mapped three topologies for wiring agents together — pipeline, fan-out, and swarm (Day 77).

Now the question is sharper: when an orchestrator passes work to a subagent, what exactly travels in that handoff? And equally important — what deliberately does not?

This is not a minor implementation detail. The handoff is the seam in your multi-agent system. Get it right and you get modularity, debuggability, and security. Get it wrong and you get token waste, brittle agents, and attack surface you didn't intend to expose.

---

## The Naive Approach: Full Context Transfer

When most people first design a multi-agent system, they think about handoffs like this:

> "The orchestrator knows everything. The subagent needs to understand the full picture. So I should give the subagent everything the orchestrator knows."

This is a natural instinct. It feels safe — more context means the subagent can't fail due to missing information. In practice, it creates several problems.

**Problem 1: Token cost compounds.** Each subagent launch with a full orchestrator context costs tokens proportional to the size of that context. If the orchestrator has accumulated 20,000 tokens of conversation history, task state, and prior tool results, and you fan out to 10 subagents, you've used 200,000 tokens before any subagent has done a single unit of work. For Earnventory, where you might run supplier monitoring agents daily across dozens of SKUs, this compounds into real cost.

**Problem 2: The subagent can't use most of it.** A subagent tasked with "check whether Supplier X sent any invoices in the last 7 days" does not need to know the conversation you had about pricing strategy last Tuesday, or the current state of your kitchen calendar, or which emails are unread. That information is not just useless — it's noise. Noise increases the probability that the subagent reasons about the wrong thing. LLMs are attentive to all context, not just the parts you want them to focus on.

**Problem 3: It expands attack surface.** Any sensitive data in the orchestrator's context — personal information, financial details, credentials passed through earlier tool calls — is now visible to the subagent. More than that: it's visible to whatever tools the subagent calls, and whatever external data those tools retrieve. If a subagent reads from an external source (a supplier website, an email thread, a public database), that source now has an opportunity to inject malicious instructions into a context that contains far more sensitive data than it should.

Full context transfer is not a reasonable default. It's an expensive, fragile, and insecure pattern.

---

## The Minimum Viable Handoff Principle

The principle is simple to state: **give the subagent only what it needs to complete its specific task, and nothing else.**

In practice, this means the orchestrator does a compression step before delegation. It looks at what the subagent actually needs to do its job and composes a brief. That brief is a purpose-built context containing:

```
┌─────────────────────────────────────────┐
│           MINIMUM VIABLE BRIEF          │
│                                         │
│  Task:         What to do               │
│  Inputs:       The relevant data        │
│  Constraints:  What's in/out of scope   │
│  Output format: What to return, and how │
│                                         │
│  Nothing else.                          │
└─────────────────────────────────────────┘
```

That brief becomes the subagent's system prompt, or the first user turn in its context window. The subagent spawns into a clean context. It has no awareness of the orchestrator's conversation history, no access to unrelated household state, no knowledge of what other subagents are doing.

The subagent completes its task, returns a result, and its context is discarded. The orchestrator receives that result and decides what to do next.

---

## What Should Always Travel

Some things belong in every handoff brief. Omit any of these and the subagent fails:

**The task, stated precisely.** Not "check supplier invoices" — that's too vague. "Check whether Supplier GlobalComp has sent any invoices dated between 2026-09-12 and 2026-09-19. Return the invoice numbers and amounts if found, or a clear null result if not." Ambiguity in the task statement is the most common cause of subagent failure. The subagent can't ask clarifying questions in most architectures — it executes from what you give it.

**The inputs it needs.** If the task requires a supplier name, a date range, an SKU list, or a prior output from another agent, include it. Don't assume the subagent can fetch it — either provide it directly or provide explicit instructions for where to retrieve it.

**The output format.** What does a successful result look like? JSON with specific fields? A structured summary with specific headers? A simple boolean? The orchestrator needs to parse and act on the subagent's output — if the format varies, the orchestrator's parsing logic breaks. Specify the format exactly.

**Scope boundaries.** What is explicitly out of scope? "Do not send any emails, only read." "If you find an error, return it — do not attempt to fix it." Explicit scope constraints prevent the subagent from taking actions the orchestrator didn't authorize.

---

## What Should Never Travel

This list matters as much as the one above.

**Conversation history.** The transcript of prior turns between the user and orchestrator is almost never relevant to a subagent's specific task. It's noise + token cost + attack surface.

**Irrelevant tool results.** If the orchestrator earlier called a calendar tool and got back a list of upcoming events, that result doesn't belong in a subagent's brief for checking supplier invoices. Results from prior tool calls should only travel if they are direct inputs to the current subagent's task.

**Credentials and sensitive data by default.** Don't include API keys, passwords, personal information, or financial details unless the subagent explicitly needs them to do its work. Even then, pass the minimum required (a specific API key for a specific purpose, not a master credential).

**The orchestrator's reasoning.** The chain of thought the orchestrator used to decide to delegate this task is useful for the orchestrator's own debugging and logging — it's not useful for the subagent. Don't include it.

**Knowledge of other subagents.** In most architectures, subagents should not know what other subagents exist or what they're doing. This is the isolation property. If Subagent A and Subagent B are running in parallel as part of a fan-out, neither needs to know the other exists. Coupling them through shared knowledge reintroduces coordination complexity the fan-out pattern was designed to eliminate.

---

## The Architecture in Practice

Here's what the handoff looks like for a concrete Earnventory task — "Generate a weekly supplier risk report" — run as a pipeline with three subagents:

```
ORCHESTRATOR
│
│  Goal: "Generate weekly supplier risk report"
│  (Has: full context, all tool access, family state)
│
├──► [SUBAGENT A: Invoice Scanner]
│    Brief: "Retrieve invoices from these 5 suppliers
│            for 2026-09-12 to 2026-09-19.
│            Return: list of {supplier, invoice_id, amount, date}.
│            Format: JSON array."
│
│    Subagent A has: supplier names, date range, Gmail tool
│    Subagent A does NOT have: orchestrator conversation, family state
│
│    Returns: [{supplier: "GlobalComp", invoice_id: "INV-882", ...}, ...]
│
├──► [SUBAGENT B: Margin Analyzer]
│    Brief: "Given this invoice list [paste A's output],
│            and these margin targets [paste relevant rules],
│            flag invoices where margin falls below 12%.
│            Return: {flagged: [...], clean: [...]}"
│
│    Subagent B has: invoice list (from A), margin rules
│    Subagent B does NOT have: A's context, orchestrator state
│
│    Returns: {flagged: ["INV-882 GlobalComp -2.1% below threshold"], clean: [...]}
│
└──► [SUBAGENT C: Report Drafter]
     Brief: "Write a concise weekly risk report for Dad.
             Flagged items: [paste B's flagged list].
             Tone: direct, actionable. Max 300 words.
             Include a recommended action for each flagged item."
     
     Subagent C has: flagged list, tone instructions
     Subagent C does NOT have: raw invoices, margin rules, any prior context
     
     Returns: "Weekly Supplier Risk Report — ..."
```

Each brief is narrow. Each subagent context is clean. The orchestrator is the only entity holding the full picture — and it's not putting that full picture into any subagent's window.

---

## The Compression Step Is Engineering Work

There's no magic that produces a good brief automatically. The orchestrator — which is itself a prompted LLM — needs explicit instructions about how to compose handoff briefs. This is a system prompt engineering problem.

A strong orchestrator system prompt tells it:
- When to delegate vs. handle directly
- What information is required in a brief for each subagent type
- What information is explicitly excluded from all briefs
- What output format each subagent returns

Without these instructions, the orchestrator will default to its natural behavior — which, for a well-trained LLM, often means being helpful by including more context than necessary. You have to design it to be minimal.

This is one reason why multi-agent systems are harder to get right than they look: the hard work is not in the subagents, it's in the orchestrator's compression logic.

---

## The Debugging Payoff

One underappreciated benefit of clean handoffs: when something goes wrong, you can isolate exactly which agent is responsible.

With minimal briefs, each subagent's context is a fixed, inspectable document. If Subagent B returns a bad margin analysis, you look at the brief it received. If the brief was correct and complete, the fault is in Subagent B's own reasoning or tools. If the brief was missing something, the fault is in the orchestrator's compression step. The causal chain is clear.

With full context transfer, the subagent's context is enormous and varies run to run. When it fails, you're debugging a 20,000-token context window looking for what went wrong. The minimum viable handoff principle is also a debuggability principle.

---

## Practical Takeaway for Earnventory

When you design an agent system for Earnventory — whether it's supplier monitoring, invoice processing, or margin analysis — design the handoffs before you design the agents.

For each subagent, ask:
1. What is the single task this agent needs to do?
2. What data does it need and where does it come from?
3. What output format do I need to parse?
4. What should it explicitly not do?

Write those answers down as the brief template. That template is what the orchestrator will populate at runtime. The agents themselves are almost secondary — the briefs are the architecture.

---

## Resources

- **Anthropic's multi-agent systems guide** — covers context isolation and handoff architecture at the SDK level: https://docs.anthropic.com/en/docs/agents-and-tools/agents

- **"Multi-Agent Orchestration: 5 Patterns That Work"** — practical breakdown of how real implementations handle handoffs and context boundaries: https://www.digitalapplied.com/blog/multi-agent-orchestration-5-patterns-that-work

---

*Tomorrow: Day 79 — Trust between agents: why it's architecturally harder than trust between services, what a trust chain actually is, and how prompt injection in a subagent can propagate damage the orchestrator never intended.*
