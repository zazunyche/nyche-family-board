# AI Agents Day 60: Eliciting Reasoning Reliably

**Mini-Module 1.4 — Reasoning and Planning | Day 60 of the Nyche AI Curriculum**

---

## From Failure Modes to Reliable Technique

Yesterday established the three ways chain-of-thought can backfire: overthinking intuitive tasks, sycophancy bleeding into the scratchpad, and error compounding in long chains. The conclusion was that CoT is a tool with a use condition — not a universal upgrade.

Today we flip to the positive case. When you've determined that a task genuinely benefits from explicit reasoning, how do you elicit it reliably? And once elicited, how do you control its shape?

The key insight Day 59 teased: **the way you ask for reasoning determines not just whether the model reasons, but how it reasons.** Those are very different interventions with very different results.

---

## The Three Ways to Elicit Chain-of-Thought

There are three distinct mechanisms available, each with different tradeoffs.

### 1. Natural Language Instruction

The simplest approach: tell the model, in plain language, to reason step-by-step before answering.

**Generic forms:**
```
"Think step by step."
"Work through this carefully before giving your final answer."
"Show your reasoning."
```

This works — the CoT literature consistently shows it improves performance on multi-step tasks. But it's imprecise. The model decides how to decompose the problem, which steps to show, and when to stop reasoning and produce an answer. You're asking for structured thinking without specifying the structure.

**When to use it:** Tasks where the right decomposition is obvious from the content — math problems, logical puzzles, structured comparisons with clear criteria. The model knows how to reason about these, and "step by step" is enough.

**When it's not enough:** Business logic with domain-specific constraints (like Earnventory's margin calculations), multi-condition optimization, or any task where you want the reasoning to be auditable against a specific schema.

### 2. Step-Enumeration Prompting

Instead of asking the model to reason generally, you specify the exact steps you want it to execute, in order. Each step is explicit, and the model commits to each one before proceeding.

**Generic form:**
```
"Complete these steps in order:
1. [Step 1 description]
2. [Step 2 description]
3. [Step 3 description]
Report your result from step 3 as the final answer."
```

**Earnventory example:**
```
"Complete these steps in order before giving your final answer:
1. Convert each supplier's unit price from CAD to USD using rate 0.74.
2. Sum all unit costs to determine if the order total exceeds $15,000.
3. If yes, apply a 7% volume discount to each unit cost.
4. Calculate gross margin for each SKU: (selling_price - unit_cost) / selling_price.
5. Flag any SKU where margin drops below 22%.
Report the flagged SKUs and their margins as your final answer."
```

Now the reasoning isn't just "step by step" in the abstract — it's a specific algorithm. Each step is a checkpoint. If the model skips step 2 and applies the discount incorrectly, you see it in the trace. If the margin calc in step 4 uses the wrong base, it's visible.

This form is structurally safer for high-stakes calculations because:

- **Commitment is forced**: the model can't jump from input to conclusion without producing intermediate outputs.
- **Errors are localized**: when something goes wrong, you know which step it entered on.
- **Auditing is possible**: you or a validation layer can check step 2's output before step 3 proceeds.

### 3. The `think` Tool

The Claude API supports a dedicated `think` tool — a structured reasoning scratchpad that runs before the model produces its final response. Unlike CoT embedded in the response, the `think` tool's output is:

- Separate from the final answer (doesn't appear in user-facing output unless you choose to surface it)
- Explicitly a reasoning space, not a response space
- Fully visible to you as the developer via the API response

Here's what the interaction looks like conceptually:

```
Request includes:
{
  "tools": [
    {
      "name": "think",
      "description": "Use this tool to reason through the problem before responding.",
      "input_schema": {
        "type": "object",
        "properties": { "thought": { "type": "string" } }
      }
    }
  ]
}

Response:
{
  "content": [
    {
      "type": "tool_use",
      "name": "think",
      "input": {
        "thought": "The user wants margin analysis across 6 SKUs.
                    Step 1: convert CAD prices at 0.74...
                    SKU-A: 18.50 × 0.74 = $13.69..."
      }
    },
    {
      "type": "text",
      "text": "Flagged SKUs: SKU-C at 18.4%, SKU-F at 19.1%."
    }
  ]
}
```

The `think` tool gives you the full reasoning trace in a clean, separable form — you can log it, audit it, or suppress it from end-user display, depending on your application.

**`think` tool vs. embedded CoT:**
- Use embedded CoT (reasoning in the response) when the user benefits from seeing the reasoning — explaining a decision, teaching a concept, walking through a calculation for transparency.
- Use the `think` tool when reasoning is internal process — you want accuracy benefits but don't need the scratchpad in user-facing output. Zazu uses this internally on non-trivial planning tasks.

---

## Extended Thinking Mode

For the most complex reasoning tasks, the Claude API supports **extended thinking**: a dedicated pre-response reasoning phase with a configurable token budget.

```python
response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=16000,
    thinking={
        "type": "enabled",
        "budget_tokens": 10000  # tokens reserved for thinking phase
    },
    messages=[{"role": "user", "content": task}]
)
```

During the `budget_tokens` phase, Claude reasons freely — following chains, backtracking, reconsidering premises — before producing the final answer. The thinking content is returned separately in the API response and is fully auditable.

The tradeoff across the four modes:

```
Standard mode:
  [Message] → [Answer]
  Fastest. Lowest token cost. May miss complex chains.

CoT in response:
  [Message] → [Reasoning + Answer]
  Slower. Reasoning tokens billed at output rate.
  Visible to user. Good for transparency.

think tool:
  [Message] → [think scratchpad] → [Answer]
  Reasoning tokens billed. Not in user output.
  Clean separation. Fully auditable in API response.

Extended thinking:
  [Message] → [Budget for free-form reasoning] → [Answer]
  Most thorough. Highest token cost.
  Best for novel, multi-constraint, high-stakes tasks.
```

For Earnventory, extended thinking is worth the cost on genuinely hard decisions — evaluating a complex supplier contract, synthesizing conflicting information from multiple data sources. It's not necessary (or cost-effective) for the majority of tasks.

---

## Controlling Depth and Structure

Once you've decided to elicit reasoning, you often want to control *how much* of it you get. Too little and errors slip through. Too much and you burn tokens on unnecessary analysis, risk more error compounding, and produce verbose output.

**1. Constrain step count explicitly:**
```
"Work through exactly three steps, no more."
"Identify the top two factors and weigh them. Don't enumerate more than two."
```

**2. Constrain output per step:**
```
"Show your calculation for each step in one line."
"For each step: state the input, the operation, and the result. Nothing else."
```

**3. Anchor to a specific output format:**
```
"After reasoning, produce your final answer as:
{
  'flagged_skus': [...],
  'highest_risk': '...',
  'recommendation': '...'
}"
```

This forces the model to eventually terminate reasoning and commit to a structured conclusion. Without a target format, reasoning can meander — especially when the task is ambiguous.

**4. Separate planning from execution:**
```
"First: outline your approach in 2-3 sentences.
Then: execute each step and show the result."
```

Useful when the task is complex enough that you want the model to think about *how* it will reason before diving in — meta-planning before object-level reasoning. This is particularly effective for tasks with structural ambiguity about the right decomposition.

---

## The Observability Dividend

Here's the part that matters most for production Earnventory work: **reasoning traces are not just an accuracy tool — they are an observability tool.**

In a standard API call, you get an answer. If the answer is wrong, you have input and output — two data points. The error could have entered anywhere.

With explicit step-enumeration reasoning:

```
Input: "Analyze margin for supplier batch 27-B"
     ↓
Step 1: "Converting prices: SKU-A $14.20, SKU-B $11.80..."       ✓
     ↓
Step 2: "Order total $23,400 — discount applies"                   ✓
     ↓
Step 3: "Post-discount: SKU-A $13.21, SKU-B $10.97..."            ✓
     ↓
Step 4: "Margin: SKU-A (18.00-13.21)/18.00 = 26.6%
         SKU-B: (16.00-10.97)/16.00 = 31.4%"     ← wrong selling price for SKU-B
     ↓
Answer: "No SKUs flagged."  ✗
```

Without the trace, you know the answer is wrong. With the trace, you know step 4 used the wrong selling price for SKU-B. That's the difference between a debugging session that takes 20 minutes and one that takes 2 hours.

For production agents making financial decisions, **logging the reasoning trace is almost always worth the storage cost.** Think of it as the agent's audit log — not just for catching errors, but for proving to yourself and stakeholders that the reasoning behind a decision was sound.

---

## ASCII Decision Tree: How to Elicit Reasoning

```
Task requires CoT? (Use Day 59's framework to decide)
                │
               YES
                │
                ▼
   Should the user see the reasoning?
                │
      ┌─────────┴──────────┐
     YES                   NO
      │                    │
      ▼                    ▼
 Embed CoT in          Use 'think' tool
 the response          (internal only,
 (transparent)         clean output)
                │
                ▼
  Is decomposition obvious from content?
  (math, logic, clear criteria)
                │
      ┌─────────┴───────────┐
     YES                    NO
      │                     │
      ▼                     ▼
 "Think step by        Step-enumeration
  step" (generic)      prompting
                       (explicit algorithm)
                │
                ▼
  Is task highly complex?
  (multi-constraint, novel, high-stakes)
                │
      ┌─────────┴───────────┐
     YES                    NO
      │                     │
      ▼                     ▼
 Consider extended     Standard CoT
 thinking mode         is sufficient
 (budget_tokens)
```

---

## Practical Prompt Patterns for Earnventory

Ready-to-use templates for the tasks where CoT adds the most value:

**Margin analysis with constraints:**
```
Analyze the following supplier order for margin. Execute these steps in sequence:
1. Convert all unit prices from CAD to USD at rate 0.74.
2. Sum the order total. If > $15,000, apply a 7% volume discount to all unit costs.
3. For each SKU: calculate gross margin = (selling_price - unit_cost) / selling_price.
4. List every SKU where margin < 22%.
Show your work for each step. Report flagged SKUs as your final answer.
```

**Supplier risk scoring:**
```
Score this supplier on risk using the following criteria, in order:
1. Payment terms risk: score 1–5 where 5 = highest risk. State your basis.
2. Lead time variability (last 6 months): score 1–5. State your basis.
3. Quality incident frequency (last 6 months): score 1–5. State your basis.
4. Geographic concentration risk: score 1–5. State your basis.
Final risk score = average of the four. Flag if > 3.5.
Show each score and reasoning before reporting the final score.
```

**Invoice batch exception triage:**
```
Review this batch of invoices for exceptions. For each invoice, check in order:
Step 1: Does the line item total match the reported total? (Yes/No — note discrepancy if No)
Step 2: Is the supplier on the approved vendor list? (Yes/No)
Step 3: Does the invoice date fall within the current fiscal period? (Yes/No)
List only invoices where any step answered No, with the specific step that flagged it.
```

Note the structure in each: steps are numbered, the model is asked to "show work" or "state basis" before answering, and the final answer is constrained to a specific form. These are not prompts that invite open-ended deliberation — they're algorithms written in natural language.

---

## What You Now Know

You can now distinguish three fundamentally different CoT interventions — natural language instruction, step enumeration, and the `think` tool — and know which one to reach for in which situation. You understand that reasoning traces are a debugging and observability primitive, not just an accuracy technique. And you have templates for the Earnventory use cases where this matters most.

The through-line from Day 59 to today: CoT is a powerful tool with clear use conditions, controllable structure, and a side benefit that most developers overlook — it makes agents debuggable at the reasoning level, not just the output level.

---

## Tomorrow

Day 61: The **ReAct pattern** — how reasoning and acting interleave in a full agentic loop. You've now seen chain-of-thought (reasoning in isolation). You've seen tool calls (acting in isolation). ReAct is the synthesis: reason about what to do, act, observe the result, reason again. It's the loop structure that lets Zazu execute non-trivial multi-step tasks without getting lost — and understanding it lets you debug agent behavior at the loop level, not just the output level.

---

## Free Resources

- **Anthropic's chain-of-thought prompting guide:** https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/chain-of-thought — The official reference for CoT elicitation patterns in the Claude API, including the `think` tool.
- **"The 'think' tool: Enabling Claude to stop and think":** https://www.anthropic.com/engineering/claude-think-tool — Anthropic's engineering post on the design, mechanics, and use of the structured reasoning scratchpad.
