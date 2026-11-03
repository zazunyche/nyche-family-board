# AI Agents Day 65: Mini-Module 1.4 Quiz — The Complete Reasoning Toolkit

**Mini-Module 1.4 — Reasoning and Planning | Day 65 of the Nyche AI Curriculum**

---

## Where We Are

Mini-Module 1.4 ran six days instead of the original four — and earned every extra day. The content covered four distinct mechanisms for agent reasoning, each operating at a different scope within an agent's work. Here's what each day built:

- **Day 59:** Chain-of-thought — why generating intermediate tokens before the final answer improves accuracy, and the two failure modes (verbose drift, false confidence)
- **Day 60:** Controlled CoT — how to elicit reasoning you can audit, not just reasoning that's present; specific prompt structures vs. vague "step by step"
- **Day 61:** ReAct — the loop that interleaves reasoning and action; why world-observation data reshapes decisions in ways upfront planning cannot
- **Day 62:** Extended thinking — Claude's hidden scratchpad before visible output; what it buys, what it costs, and when to use it
- **Day 63:** Planning vs. reactive execution — when to map the route before moving vs. when to follow the trail; GPS vs. paper trail
- **Day 64:** Synthesis — how CoT, ReAct, extended thinking, and planning compose at different scopes inside a single complex task

Today is the wrap-up: five questions to test whether these mechanisms are distinct mental models or still blurring together.

---

## How to Use This Quiz

Reply to the iMessage with brief answers — bullet points are fine. The goal isn't exhaustiveness; it's precision. Can you distinguish the four mechanisms from each other and apply them to a concrete scenario?

These results calibrate the depth of Module 2. If the reasoning mechanisms are solid, we move fast. If any are fuzzy, we add a brief review before building tools and function calling on top of them.

---

## Question 1 — Chain-of-Thought Mechanics and Auditability

**The setup:** You build an Earnventory feature that calculates quarterly margin across all active SKUs. It gives inconsistent, sometimes wrong answers. You modify the prompt to include "Think step by step" and accuracy improves substantially.

**Q1a:** What mechanistically happened? Why do intermediate reasoning tokens improve final output quality?

**Q1b:** "Think step by step" is a blunt instrument — the model decides how to decompose the problem. How would you improve it to make the reasoning *auditable*: where you can identify exactly which step introduced an error?

**What to look for in a strong answer:**

The mechanistic explanation should center on this: intermediate tokens become part of the context window, and the model's subsequent generation is conditioned on everything that precedes it — including its own reasoning trace. When you force intermediate steps, the model can't jump to a convenient conclusion without generating the steps that would expose its reasoning. The chain constrains what can plausibly come next.

Auditability requires specifying *the steps*, not just requesting reasoning. Compare:

Weak: "Think step by step before answering."

Strong: "First, convert all unit prices to USD using today's exchange rates. Second, apply tier-discount rules for quantities >100 units. Third, subtract COGS from adjusted revenue for each SKU. Report the final margin only after completing all three steps. Show each step explicitly."

The second version creates visible checkpoints a human can read, verify, and pinpoint as the source of error. The first produces reasoning that may look thorough but can't be audited step-by-step.

---

## Question 2 — CoT Failure Modes

**Q2:** Name two ways chain-of-thought prompting makes things *worse*, not better. For each, give a concrete Earnventory example.

**What to look for:**

**Failure mode 1 — Verbose drift:** The model generates so much intermediate reasoning that it loses track of the original question, or buries the answer in noise that downstream systems can't parse. Earnventory example: "Calculate total order value for PO-2251" produces three paragraphs of reasoning about pricing philosophy, supplier relationship history, and alternative ordering strategies before arriving at the arithmetic — and the final number is buried in prose that breaks your JSON parsing.

**Failure mode 2 — False confidence from a wrong chain:** The model reasons step-by-step to an incorrect answer, and the visible chain makes the error *harder* to catch because the work looks thorough. Earnventory example: "Should we reorder SKU-44?" — the model reasons carefully through reorder logic, EOQ formulas, and lead time estimates, but uses a cost figure from an outdated line earlier in context. The reasoning trace looks careful. The answer is wrong. The chain obscures rather than reveals the error source.

A third valid failure mode: CoT makes outputs hard to parse programmatically. If your downstream code expects clean JSON, a reasoning trace embedded in the response breaks the output format — you'd need to post-process or use structured output constraints to strip the reasoning.

---

## Question 3 — Tracing the Full ReAct Loop

**Q3:** Trace the full ReAct cycle for this task: *"Check whether any Earnventory suppliers sent invoices in the last 7 days and flag any that are more than 14 days overdue."*

Write at least 4 turns (Reason → Act → Observe → Reason → ...). Include enough specificity that the loop demonstrates how observations actually reshape subsequent reasoning — not just a list of steps.

**What a strong trace looks like:**

The key architectural feature to demonstrate: reasoning steps that *causally depend on* the previous observation. The Act calls something specific. The Observe step includes realistic data. And the Reason step after Observe changes based on what was actually found — not what was predicted.

```
TASK: "Check if any Earnventory suppliers sent invoices
      in the last 7 days. Flag any overdue >14 days."

─────────────────────────────────────────────────────────────
REASON: I need to retrieve recent supplier emails with
        invoice-related content. Start with a 7-day search.
─────────────────────────────────────────────────────────────
ACT:    search_emails(query="invoice", days_ago=7)
─────────────────────────────────────────────────────────────
OBSERVE: 3 results found:
  Supplier A (Acme Parts):      $4,200  — Aug 23
  Supplier B (Delta Materials): $12,500 — Aug 15
  Supplier C (Folio Packaging): $800    — Aug 25
─────────────────────────────────────────────────────────────
REASON: Supplier B's invoice (Aug 15) is the oldest.
        Today is Aug 29 — that's 14 days since receipt.
        "More than 14 days overdue" requires knowing the
        due date, not just the invoice date. I need
        Supplier B's payment terms to determine if it's
        actually overdue.
─────────────────────────────────────────────────────────────
ACT:    get_supplier_payment_terms(supplier_id="delta_materials")
─────────────────────────────────────────────────────────────
OBSERVE: Terms: Net-30. Invoice date: Aug 15.
         Due date: Sep 14. Not yet overdue.
─────────────────────────────────────────────────────────────
REASON: Supplier B is not overdue — it's 14 days old on a
        Net-30 term, with 16 days remaining. No flags
        required for overdue status. However, the invoice
        is large ($12,500) and within the first half of
        its window. Worth surfacing proactively.
        Supplier A and C: recent and small, no action.
─────────────────────────────────────────────────────────────
ACT:    create_flag(supplier="delta_materials",
                   type="large_upcoming_payment",
                   amount=12500,
                   due_date="2026-09-14",
                   note="Not overdue — flagged for awareness")
─────────────────────────────────────────────────────────────
OBSERVE: Flag created successfully.
─────────────────────────────────────────────────────────────
REASON: Task complete. No overdue invoices. One proactive
        flag created for a large upcoming payment.
        Summary ready.
```

**The architectural lesson this trace demonstrates:** Without ReAct, the agent would have assumed "14 days since invoice = overdue." The observation forced a check on payment terms that changed the conclusion entirely. The plan updated based on real information, not prior assumptions. This is what makes ReAct categorically different from plan-then-execute.

---

## Question 4 — Extended Thinking: When to Use It

**Q4a:** Describe one specific Earnventory task where you would use Claude's extended thinking mode. Explain why.

**Q4b:** Describe one task where you would explicitly *not* use extended thinking. Explain why.

**Q4c:** What is the determining variable — the line between "use it" and "don't use it"?

**What to look for:**

**Use it when:** the task has high decision complexity with interdependencies, the stakes of getting it wrong are significant, latency is acceptable, and the volume is low. A strong Earnventory example: reviewing a supplier contract for unfavorable terms across 40+ clauses, where clause interactions matter (a payment term in section 3 modifies a liability clause in section 12). Extended thinking lets Claude explore the dependency structure before committing to a reading — the scratchpad is where it catches its own misreads before they appear in the output.

**Don't use it when:** the task is high-volume and routine, each instance is independent, and the questions are simple enough that extended thinking adds no discriminating value. A strong Earnventory example: generating product descriptions for 500 SKUs. Each is independent, the task is straightforward, and extended thinking would multiply token cost by 3-4x for no measurable improvement in output quality.

**The determining variable:** task complexity relative to model capability at standard mode. If Claude solves your task correctly 95% of the time in standard mode, extended thinking wastes money. If Claude solves it correctly 60% of the time and the task is genuinely hard (multi-step reasoning, ambiguous tradeoffs, risk of subtle errors), extended thinking can close that gap — and at low volume, the cost is justified by the reliability gain.

A rule of thumb: use extended thinking when you'd want a human expert to pause and think before answering, not just respond fluently.

---

## Question 5 — Composing All Four Mechanisms

**Q5:** Design an Earnventory task that uses all four mechanisms — chain-of-thought, ReAct, extended thinking, and upfront planning — simultaneously. Identify which mechanism operates at which scope.

This is the synthesis question. There's no single right answer, but a strong answer distinguishes the four mechanisms by their scope, not just their name.

**What to look for:**

The four scopes, from widest to narrowest:

- **Extended thinking (pre-output scope):** runs before any visible output, private. The model uses it to map the overall analytical structure before committing to anything.
- **Upfront planning (task scope):** after extended thinking, the model produces an explicit multi-step plan that structures the entire execution. This is visible and informs subagent dispatch.
- **ReAct (loop scope):** within each plan step, the model reasons before each action and updates based on each observation. Distributed across the full execution, not confined to a single moment.
- **CoT (step scope):** within each ReAct reasoning step, the model generates a chain of intermediate tokens to work through the specific logic of that turn's decision.

**Example task:** *"Analyze whether we should renegotiate pricing with our top 5 suppliers, given current margin data, invoice history, and market benchmarks. Produce a ranked recommendation."*

**Extended thinking (pre-output):** Claude receives the task and runs a private scratchpad pass: what analytical framework applies? What data is needed? What are the failure modes (e.g., incomplete invoice history biasing the analysis)? This happens before any visible output or tool call.

**Upfront plan (task scope):** Claude generates: "Step 1: retrieve margin data for each of the top 5 suppliers. Step 2: pull 12-month invoice history. Step 3: retrieve market benchmark data. Step 4: analyze margin gap for each supplier. Step 5: rank by opportunity size and synthesize recommendation." This plan structures the entire work.

**ReAct (loop scope):** For each plan step, Claude reasons before the tool call ("I need margin data — the `get_margin_summary` tool takes supplier_id and date range, I'll use 12 months"), acts, observes the result, then reasons again before the next action. If margin data for Supplier C is missing, ReAct catches it and decides to use invoice history as a proxy rather than treating the step as complete.

**CoT (step scope):** Within a ReAct reasoning step for the gap analysis: "Supplier A's current margin is 18.2%. Industry benchmark for this category is 22.4%. The gap is 4.2 points. On $280K annual spend, that's approximately $11,760 in addressable margin annually. Volume trajectory suggests this is growing. Priority: high." Each intermediate calculation constrains the next token.

The four mechanisms nest cleanly: CoT is inside ReAct reasoning, which executes inside plan steps, which follow the extended thinking pre-pass. They don't compete; they compose.

---

## What's Next: Module 2 Begins

Mini-Module 1.4 closes the first module of the curriculum. Everything so far — the agent loop, token mechanics, context and memory, and reasoning patterns — was *descriptive*: how agents work from the inside.

Module 2 is *constructive*: how to build and operate them.

Mini-Module 2.1 starts tomorrow: **Tools and Function Calling**. This is where agents acquire the ability to actually reach into the world — not just reason about it. We'll cover how the tool-use protocol works at the API level, how to design tool definitions Claude can use reliably, client-side vs. server-side execution, and the security boundaries that matter in production.

The running example throughout will be Earnventory: designing real tools for a real inventory agent, from JSON schema to error handling.

---

## Free Resources

- Anthropic's chain-of-thought prompting guide: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/chain-of-thought
- "The 'think' tool: Enabling Claude to stop and think" (Anthropic Engineering): https://www.anthropic.com/engineering/claude-think-tool
- ReAct: Synergizing Reasoning and Acting in Language Models (Yao et al., 2022) — the original paper, unusually readable: https://arxiv.org/abs/2210.03629
