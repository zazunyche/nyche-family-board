# AI Agents Day 44: Why 85% Reliable × 10 Steps = 20% Reliable

Mini-Module 2.4: Agent Systems in Production | Day 44 of 50

---

## The Number That Breaks Most Agent Deployments

There's a single mathematical fact responsible for more failed agent deployments than any other, and most engineers don't encounter it until their system is already in production failing quietly.

Here it is: **if your agent has 10 steps and each step is 85% reliable, your end-to-end success rate is approximately 20%.**

The math: 0.85^10 = 0.197.

That's not a rounding error. An agent workflow where every individual step works 85% of the time will complete correctly less than 1 in 5 runs. This is the compounding reliability problem, and it reshapes the entire way you have to think about designing multi-step agents.

---

## The Math: Probability Multiplication

When you chain independent steps together, failure probabilities don't average — they multiply. Each step's reliability is applied against everything that came before it.

```
Step reliability per step: P
Number of steps: N
End-to-end success rate: P^N

At P = 0.85 (85% per step):
  N = 1   →  0.850  (85.0%)
  N = 3   →  0.614  (61.4%)
  N = 5   →  0.444  (44.4%)
  N = 10  →  0.197  (19.7%)
  N = 15  →  0.087   (8.7%)
  N = 20  →  0.039   (3.9%)

At P = 0.90 (90% per step):
  N = 5   →  0.590  (59.0%)
  N = 10  →  0.349  (34.9%)
  N = 20  →  0.122  (12.2%)

At P = 0.95 (95% per step):
  N = 5   →  0.774  (77.4%)
  N = 10  →  0.599  (59.9%)
  N = 20  →  0.358  (35.8%)
```

Notice what 95% per step — genuinely excellent per-step reliability for an LLM system — still produces at 20 steps: **35% end-to-end success.** You're failing more than half the time even with a high-quality system.

This is why agent demos that work beautifully in 3-step scenarios collapse in production when workflows extend to 10 or 15 steps. The math compounds against you.

---

## Why This Is Different From Traditional Software

In conventional software, per-step reliability is often close to 100%. A function either does what it's supposed to do, or it throws an exception your application can catch and handle. You can write exhaustive unit tests, achieve near-complete coverage, and be confident that each step will behave correctly on every run.

LLM-based steps are fundamentally probabilistic. The model might:

- Misparse a supplier email and extract the wrong SKU, quantity, or price
- Make a judgment call about a margin threshold that contradicts your business logic
- Format a purchase order in a slightly different structure than your downstream parser expects
- Decide to call the wrong tool, or call the right tool with subtly incorrect arguments
- Hallucinate a supplier name, a historical price, or a deadline that doesn't exist

None of these produce exceptions. They produce **plausible-looking wrong outputs** that flow downstream through the next step, and the next, and the next. By step 7, you may be looking at a purchase order for the wrong SKU at the wrong price sent to a supplier who didn't request it — and your application reported success at every step along the way.

This is what makes the compounding reliability problem so dangerous: it fails silently.

---

## The Earnventory Case Study

Here's a concrete workflow. You build an Earnventory agent to automate purchase order processing:

```
Step 1:  Read incoming supplier email
Step 2:  Extract SKU, quantity, price from email body
Step 3:  Look up current inventory level for that SKU
Step 4:  Compare inventory against reorder threshold
Step 5:  Verify supplier is on approved list with current terms
Step 6:  Check margin at proposed price
Step 7:  Draft purchase order
Step 8:  Validate PO format against supplier requirements
Step 9:  Send PO via email
Step 10: Update inventory projection in dashboard
```

Ten steps. If each step is 90% reliable — a solid result for an LLM-based system — your end-to-end success rate is:

```
0.90^10 = 0.349 → ~35%
```

**Two-thirds of your purchase orders will fail, corrupt, or go out wrong.** The agent that worked great in your 3-step demo, and even in your 7-step QA run, is now silently breaking real supplier relationships and creating financial exposure.

And "90% reliable per step" is optimistic. If step 2 (extracting SKU, quantity, and price from unstructured email text) is 80% reliable — which is realistic for varied, real-world supplier emails — the picture gets worse:

```
One step at 80%, nine steps at 90%:
0.80 × 0.90^9 = 0.80 × 0.387 = 0.310 → ~31%
```

Roughly 1 in 3 workflows completes correctly.

---

## Three Architectural Responses

Once you see the math, you have three levers to improve end-to-end reliability. Production systems use all three.

### Lever 1: Reduce Step Count

The most powerful intervention is eliminating steps. Every step you remove doesn't just subtract its own failure probability — it removes it from the chain entirely.

```
Before: 10 steps at 90% → 35% success
After:   7 steps at 90% → 48% success
After:   5 steps at 90% → 59% success
```

Ask these questions about every step:
- Can steps 9 and 10 (send PO, update dashboard) be combined into a single atomic operation?
- Can step 5 (verify supplier) be pre-computed and cached rather than checked live on every run?
- Can steps 7 and 8 (draft PO, validate format) be merged into a single structured-output generation call?

Workflow decomposition is an engineering discipline. More steps feel more thorough; fewer steps are actually more reliable.

### Lever 2: Insert Checkpoints Before Irreversible Actions

Checkpoints don't improve per-step reliability, but they prevent error propagation at the moment it matters most: **before the action that can't be undone.**

```
Steps 1–6: Agent runs autonomously
           ↓
           Human reviews:
           "Ready to send PO for SKU-4821 (qty 200 @ $14.50)?
            Supplier: Riverside Wholesale | Margin: 22.3%
            [Approve]  [Edit]  [Cancel]"
           ↓
Steps 7–10: Execute after approval
```

A human reviewing the output at step 6 can catch the SKU extraction error that happened at step 2, before a purchase order goes out the door. The checkpoint is a reset point: it doesn't fix the per-step errors, but it breaks the chain of silent propagation at exactly the right moment.

This is the core of the **minimal footprint principle**, which we'll cover in depth on Day 48. The guiding rule: an agent should prefer to pause and verify before irreversible actions, not discover problems after them.

### Lever 3: Raise Per-Step Reliability

The third lever is improving individual step quality. The leverage is significant:

```
85% per step → 10 steps → 20% success rate
95% per step → 10 steps → 60% success rate
```

A 10-percentage-point improvement per step produces a 3× improvement end-to-end. Techniques:

- **Stricter output schemas:** Rather than asking the model to "extract the SKU," provide a JSON schema with required fields and types that must be populated. Validate the output before passing it to the next step.
- **Validation layers:** At critical steps, run a second, lightweight check: "Does this extracted SKU match the known format? Is this price within a plausible range?" Fail fast rather than propagate.
- **Retry with error feedback:** If step 2 fails schema validation, send the error back to the model in the next turn: "Your extraction was missing the quantity field. Here is the email again — extract all three fields." One retry often recovers.
- **Prompt clarity:** Vague instructions produce variable outputs. "Extract the data" is less reliable than "Extract exactly three values: SKU (alphanumeric, 6-10 chars), quantity (integer), and unit price (decimal, USD). Return them in this JSON schema: {...}."

---

## The Airline Safety Analogy

Commercial aviation has achieved near-perfect system-level reliability from highly complex systems with thousands of individual failure points. The fatal accident rate is approximately 1 per 10 million flights.

Airlines don't achieve this by making every component 99.9999% reliable. They achieve it through **system-level design** that compensates for component imperfection:

```
AVIATION SAFETY PRINCIPLE → AGENT SYSTEM EQUIVALENT
─────────────────────────────────────────────────────
Redundant systems           Fallback paths, retry logic
Pre-flight checklist        Input validation before execution
Hard limits on irreversible Mandatory approval before PO/email/write
Go-around protocol          Abort + surface error vs. guess + proceed
Black box logging           Full trajectory: inputs, tools, results, tokens
Cross-checking (copilot)    Second LLM call to validate critical outputs
```

The analogy extends to culture: airlines do not say "our pilots are highly trained, so we don't need checklists." That exact reasoning — "our model is good, so we don't need validation steps" — is what produces the 35% end-to-end success rate.

The checklist is not an admission that the pilot is unreliable. It's an acknowledgment that even a 98% reliable professional, operating in a complex system, produces compounding error risk — and that a structured verification step costs almost nothing while providing disproportionate protection.

---

## What This Means for How You Design Agents

Three immediate design implications for any agent workflow you build:

**1. Count your steps before you build.** Before writing a single line of code, list every reasoning or action step in the workflow. Calculate the end-to-end success rate at your expected per-step reliability. If it's below 70%, either reduce steps or add checkpoints before you start.

**2. Design for inspection, not just completion.** Every multi-step workflow needs observability into intermediate steps, not just the final output. If you can only see whether the workflow finished, you can't diagnose where errors entered the chain. We'll cover this on Day 47 (observability).

**3. Treat irreversible actions as architectural decisions.** "Send email," "submit PO," "update financial record" are one-way doors. Where you place them in the workflow — and whether you checkpoint before them — is one of the most important architectural decisions you'll make. The agent should never send a PO because "all the prior steps succeeded"; it should send a PO because a human confirmed the output is correct.

---

## Tomorrow: Evals — Your Agent's Test Suite

Day 45 introduces the other half of production reliability: evals. You wouldn't ship a software feature without tests. You shouldn't deploy an agent without evals. Tomorrow: what an eval actually is for an LLM system, how to design one, and how to use it to catch regression before it reaches production.

---

*Resources:*
- "Evaluating AI Agents in 2025: A Practical Guide" — https://www.turingcollege.com/blog/evaluating-ai-agents-practical-guide
- "AI Agent Failure Modes: What Goes Wrong in Production" — https://www.trantorinc.com/blog/ai-agent-failure-modes-what-goes-wrong-design-resilience

---

*AI Agents curriculum designed by Abeiku for the Nyche family learning system · Day 44 of 50 · Mini-Module 2.4: Agent Systems in Production*
