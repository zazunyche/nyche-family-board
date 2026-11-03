# AI Agents Day 64: The Complete Reasoning Workflow

**Mini-Module 1.4 — Reasoning and Planning | Day 64 of the Nyche AI Curriculum**

---

## Where We Are

Mini-Module 1.4 built a four-part toolkit for agent reasoning:

- **Day 59:** chain-of-thought — why generating intermediate tokens improves outputs, and how it fails
- **Day 60:** controlled CoT — how to elicit reasoning reliably without runaway verbosity
- **Day 61:** the ReAct pattern — reason, act, observe, reason again, across multiple loop iterations
- **Day 62:** extended thinking — the hidden scratchpad that runs before the model commits to output
- **Day 63:** planning vs. reactive execution — when to map the route upfront vs. when to follow the trail

Today is the synthesis. Each of those mechanisms targets a *different scope* of reasoning — a different level of granularity in the agent's work. The key insight this email aims to leave you with: **they aren't alternatives. They compose.** A well-designed agent uses all four simultaneously, each one operating at the scale it's actually suited for.

---

## The Four Mechanisms — Brief Recap

Before composing them, let's be precise about what each one actually is.

**Chain-of-thought (CoT):** A prompting strategy that causes the model to generate intermediate reasoning tokens before producing a final answer. Those intermediate tokens become part of the context that constrains subsequent generation — they make the reasoning path explicit within a single inference. CoT is a *within-step* mechanism.

**ReAct (Reason + Act):** An execution pattern for the agentic loop where the model explicitly reasons before each tool call and after each observation. The reasoning is visible in the conversation history and shapes future decisions. Unlike CoT, ReAct operates *across loop iterations* — it's reasoning distributed across time, not just within a single generation.

**Extended thinking:** An API-level feature where the model allocates a private scratchpad before generating visible output. The scratchpad content is internal and not shown to the user. This allows deeper pre-planning than standard CoT because the model can explore without committing — it can reason about what *not* to say. Extended thinking is a *pre-output* mechanism.

**Planning:** A strategic decision about the structure of work before execution begins. Planning can be explicit (a model generates a structured plan that is then executed step by step) or implicit (the system architecture encodes the structure). Planning is a *pre-execution* mechanism, distinct from the above three because it governs how the agent loop is *organized*, not just how individual steps within the loop are reasoned.

The four mechanisms are orthogonal. You can have ReAct with or without extended thinking. Planning can generate a plan using CoT or not. Subagents can use ReAct regardless of whether the orchestrator used extended thinking to decide to dispatch them. This orthogonality is what allows them to compose cleanly.

---

## How They Compose

The best way to see the composition is through scope: each mechanism handles reasoning at a different level of granularity.

```
SCOPE HIERARCHY — smallest to largest:
───────────────────────────────────────────────────────────────────────

[SINGLE INFERENCE STEP]
  Chain-of-thought (CoT)
  — Reasoning within one generation: intermediate tokens before the answer
  — Scope: one model call
  — Purpose: make a single reasoning step more reliable

      ↑ operates inside ↑

[LOOP ITERATION]
  ReAct reasoning step
  — Reasoning before one act, and after one observation
  — Scope: one turn of the agentic loop
  — Purpose: use the result of the last action to decide the next one

      ↑ operates inside ↑

[BEFORE COMMITTING TO OUTPUT]
  Extended thinking (scratchpad)
  — Private reasoning before the model's first visible token
  — Scope: one API call (but before any output)
  — Purpose: complex pre-planning that shouldn't be surfaced to the user

      ↑ operates inside ↑

[BEFORE EXECUTION BEGINS]
  Planning
  — Structural decomposition of the full task
  — Scope: the full agent workflow
  — Purpose: decide what work exists and how to organize it before any
             of it starts executing

───────────────────────────────────────────────────────────────────────
```

From the outside — from the user's perspective — none of these inner mechanisms is directly visible. What's visible is: the user sends a message, and eventually the agent produces an output. Every one of these mechanisms operates inside that interval.

---

## A Complete Walkthrough: Earnventory Quarterly Supplier Review

Let's trace a single, realistic task through all four layers. This is what a well-designed agent actually does when working on complex problems.

**Task:** "Prepare the Q3 2026 supplier review — performance, pricing trends, and risk flags for our top 12 suppliers. I need it before the board call Friday."

---

### Layer 1: Planning (pre-execution)

Before any tools are called or subagents dispatched, the orchestrator needs to understand the structure of this task. This might happen via an explicit planning model call, or through a planning-aware system prompt.

```
PLANNING PHASE (orchestrator):

  Input: "Q3 supplier review — 12 suppliers, 3 dimensions"
  
  Extended thinking (silent): 
    — This is a batch task with predictable structure across suppliers
    — But within each dimension, the analysis may branch based on findings
    — Three natural components: performance, pricing, risk
    — 12 suppliers × 3 components = candidate for parallel fan-out
    — Risk flags are the most variable — some suppliers may need deep dives
    — Need a synthesis step after subagents complete

  Plan (output — upfront):
    Component A: Performance analysis (all 12 suppliers)
    Component B: Pricing trend assessment (all 12 suppliers)
    Component C: Risk flag identification (all 12 suppliers)
    Component D: Synthesis and executive summary
    
  Decision: Fan-out A, B, C in parallel to subagents.
             D executes after all three complete.
```

Notice: extended thinking was used *inside the planning phase* to help the orchestrator reason about the structure of the task. Planning and extended thinking are nested here — extended thinking helps the model produce a better plan.

---

### Layer 2: Extended Thinking (pre-output, per subagent invocation)

The orchestrator dispatches three subagents. Take the Risk subagent. Before it generates any output or calls any tools, it uses extended thinking to reason about its approach:

```
RISK SUBAGENT — extended thinking (not visible in output):

  "My task is to identify risk flags for 12 suppliers.
  
  Risk has multiple dimensions: financial health, concentration risk,
  geopolitical exposure, delivery reliability, quality history.
  
  I don't know upfront which suppliers will have flags. I should start
  broad (check each supplier's top risk signal) and go deep only where
  flags appear. This is a reactive approach within an upfront structure.
  
  I'll use a two-pass approach:
    Pass 1: quick health check on all 12 (fast tool calls, low token cost)
    Pass 2: deep dive on any that raise flags in pass 1
    
  This is more efficient than deep-diving all 12."
```

The subagent now starts executing — with a clearer approach than if it had just started calling tools immediately.

---

### Layer 3: ReAct (across loop iterations, within the subagent)

The Risk subagent runs its loop. Each iteration follows the Reason → Act → Observe → Reason cycle:

```
RISK SUBAGENT — ReAct execution loop:

  REASON: Start pass 1. Get overall risk score for Supplier 1.
  ACT: get_supplier_risk_profile(supplier_id=1, period="Q3-2026")
  OBSERVE: Risk score 72/100 — elevated. Flag: concentration risk
           (42% of industrial fastener volume from one source).
  
  REASON: Concentration risk at 42% warrants deeper investigation —
          above the 35% threshold that triggers review. Need to
          understand what alternatives exist before flagging severity.
  ACT: get_alternative_suppliers(category="industrial_fasteners")
  OBSERVE: 3 qualified alternatives on file, but all have 8–12 week
           qualification lead times.
  
  REASON: No short-term alternative. Concentration risk is HIGH —
          not just elevated. Flag this as a board-level item.
          Continue to Supplier 2.
  ACT: get_supplier_risk_profile(supplier_id=2, period="Q3-2026")
  OBSERVE: Risk score 31/100 — low. No flags.
  
  REASON: Supplier 2 clean. Move on.
  ACT: get_supplier_risk_profile(supplier_id=3, period="Q3-2026")
  OBSERVE: Risk score 58/100 — moderate. Flag: late payment dispute
           from August — unresolved.
  
  REASON: Payment dispute is unresolved — need context. Is this a
          system error or a genuine disagreement?
  ACT: get_dispute_details(supplier_id=3, dispute_type="payment")
  OBSERVE: PO #8243 — amount disputed by $4,200. Root cause:
           unit price discrepancy (their invoice vs. our system).
           Status: awaiting vendor response as of Aug 15.
  
  REASON: Dollar amount is material but not critical. Flag as MEDIUM —
          needs resolution before next PO cycle. Note in report.
  ...
  
  [continues for remaining suppliers]
  
  REASON: All 12 suppliers processed. 2 HIGH flags, 3 MEDIUM flags,
          7 clean. Compile summary for return to orchestrator.
  ACT: [output structured risk report]
```

Each ReAct cycle is one iteration of the agentic loop. The model reasons based on what it just observed, decides the next action, and the result of that action becomes the new observation. The path through suppliers 1–12 is not predetermined — Supplier 1's flags triggered a deeper dive that didn't happen for Supplier 2.

---

### Layer 4: Chain-of-Thought (within individual reasoning steps)

Inside any of those ReAct reasoning steps, the model may use chain-of-thought to produce a reliable inference. This is most visible when the reasoning step involves a non-trivial judgment:

```
RISK SUBAGENT — ReAct REASON step (with CoT visible):

  OBSERVE: Supplier 7's delivery on-time rate: 61% in Q3 (vs. 89% in Q2)
           All 3 major delays in July.

  REASON (with CoT):
    "The drop from 89% to 61% is significant — 28 percentage points.
     The concentration in July is interesting. July delays might be:
     (1) a structural issue that persists — supplier capacity or reliability
     (2) a one-time event — weather, logistics disruption, internal crisis
     
     If (1), this is a HIGH risk flag — pattern likely to repeat.
     If (2), this is MEDIUM at most — flag, note the month, monitor Q4.
     
     The data I have right now doesn't distinguish (1) from (2).
     I need one more data point: were there any documented disruptions
     for this supplier or their region in July?
     
     Decision: check logistics notes before classifying severity."
  
  ACT: get_logistics_notes(supplier_id=7, month="2026-07")
```

The CoT inside the reasoning step made the model's judgment explicit — and that explicitness revealed that a single data point wasn't sufficient to make the right call. Without CoT, the model might have classified the risk immediately based on the on-time rate alone, without noticing the temporal concentration that warranted further investigation.

---

## The Composed System — ASCII Diagram

```
FULL REASONING ARCHITECTURE (all four layers):
───────────────────────────────────────────────────────────────────────────

USER REQUEST
    ↓
ORCHESTRATOR
  [Extended thinking: how to structure this task?]
    ↓
  [Planning: decompose into components, decide fan-out]
    ↓
  ┌──────────────┬───────────────┬──────────────────┐
  │ Subagent A   │  Subagent B   │   Subagent C     │
  │ (Performance)│  (Pricing)    │   (Risk)         │
  │              │               │                  │
  │ [Extended    │ [Extended     │ [Extended        │
  │  thinking:   │  thinking:    │  thinking:       │
  │  approach]   │  approach]    │  approach]       │
  │              │               │                  │
  │ ReAct loop:  │ ReAct loop:   │ ReAct loop:      │
  │  REASON      │  REASON       │  REASON          │
  │  (CoT inside)│  (CoT inside) │  (CoT inside)    │
  │    ACT       │    ACT        │    ACT           │
  │    OBS       │    OBS        │    OBS           │
  │  REASON      │  REASON       │  REASON          │
  │    ACT       │    ACT        │    ACT           │
  │    ...       │    ...        │    ...           │
  │  [output]    │  [output]     │  [output]        │
  └──────────────┴───────────────┴──────────────────┘
          ↓               ↓               ↓
  ORCHESTRATOR: collect subagent outputs
  [Extended thinking: how do these fit together? any contradictions?]
    ↓
  [Synthesis: draft executive summary]
    ↓
USER RECEIVES: Q3 Supplier Review

───────────────────────────────────────────────────────────────────────────

LAYERS VISIBLE AT DIFFERENT SCOPES:
  Planning     ──  full workflow (before any execution)
  Ext. thinking──  before each API call (hidden from user)
  ReAct        ──  across loop iterations (visible as tool calls)
  CoT          ──  within a single reasoning step (visible in text)
```

---

## When to Use Which Layer — And When to Skip One

These mechanisms aren't mandatory. A simple task may only need one or two layers. The question is what the task's complexity demands at each scope.

| Layer | Skip it when... | Use it when... |
|-------|-----------------|----------------|
| Planning | Task is a single step or clearly linear | Multi-component, parallelizable, or high completeness requirements |
| Extended thinking | Response is low-stakes or fast | Complex judgment, irreversible action, or ambiguous task framing |
| ReAct | Task is a single tool call with no branching | Investigation, multi-step with observation-dependent path |
| CoT | Straightforward lookup or classification | Non-obvious judgment where intermediate steps prevent wrong conclusions |

The practical heuristic: **the higher the cost of a wrong decision at any scope, the more reasoning you want at that scope.** Planning mistakes cost the most (they corrupt the entire workflow). Extended thinking mistakes corrupt a single agent's contribution. ReAct mistakes corrupt one loop iteration. CoT mistakes corrupt one inference step.

---

## The Mental Model to Take Forward

Here is the complete picture, stated as simply as possible:

**Agents reason at four scopes. Each scope needs the right mechanism.**

Before the work is structured: use planning.
Before each output is committed: use extended thinking.
Across the execution loop: use ReAct.
Within each reasoning step: use chain-of-thought.

These aren't competing approaches. They're a nesting structure. The outer ones set the stage for the inner ones to operate correctly. A plan that's wrong makes all the ReAct and CoT inside it useless. Extended thinking that's shallow produces a plan that's brittle. ReAct without CoT inside its reasoning steps produces plausible-looking but unreliable step-by-step logic.

The failure mode you want to avoid: **treating these as options when they're actually layers**. Every sophisticated agent workflow — including the agents running in Zazu, and the ones you'll build in Earnventory — is using all four, whether or not the design explicitly named them.

Now you can see them. That's what Mini-Module 1.4 was for.

---

## What's Next

Tomorrow is the Mini-Module 1.4 quiz — five questions that pull on the full reasoning arc from Days 59–64. Expect to trace a ReAct loop, weigh planning vs. reactive for a specific scenario, and explain why extended thinking costs more but sometimes earns it. These questions are meant to be answered from first principles, not recalled from memory.

---

**Free Resources:**
- Anthropic's guide to extended thinking: https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
- "Building effective agents" — Anthropic engineering blog: https://www.anthropic.com/engineering/building-effective-agents

---

*AI Agents curriculum by Abeiku | Delivered by Zazu | Day 64 of 50 — Mini-Module 1.4: Reasoning and Planning*
