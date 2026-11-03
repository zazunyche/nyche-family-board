# AI Agents Day 53: Chain of Thought — Making the Model Show Its Work

**Mini-Module 1.4 — Reasoning and Planning | Day 1 of 4**

---

Welcome to Mini-Module 1.4. You've spent the last several weeks understanding what an agent is, what's running underneath it (tokens and probability), and how it manages memory and context. Now we get to the question that's probably been nagging: *how does it actually reason?* Not "why does it seem smart" — but what is the mechanical process by which it produces a multi-step answer rather than a single guess?

The answer starts with chain-of-thought prompting, and it's more fundamental than it looks.

---

## What Chain-of-Thought Actually Is

Chain-of-thought (CoT) prompting is the practice of instructing a model to generate its reasoning steps explicitly before producing a final answer. You may have already used it without naming it — any time you've written "think step by step" or "walk me through your reasoning," you were doing it.

But here's what makes it worth understanding technically, not just as a trick: **CoT works because of how autoregressive generation works.** You learned in Mini-Module 1.2 that the model generates text one token at a time, and each new token is sampled from a probability distribution conditioned on everything that came before it. That constraint — that each token is shaped by all prior tokens — is exactly what makes CoT effective.

When you force the model to write out intermediate steps, those steps become part of the conditioning context for every subsequent token. The model can't contradict what it just wrote without that contradiction being visible in the token stream. Each reasoning step narrows the probability space for the next step. Errors that would have been invisible in a single-hop answer become detectable in the chain.

This is not a metaphor. It's the literal mechanics of the transformer architecture.

---

## The Mechanism: Intermediate Tokens as Constraints

Without CoT, a question like "What's the total margin impact if three of our top Earnventory suppliers raise prices by 8%, given our current inventory mix?" goes:

```
[Question] → [One-step generation] → [Answer]
```

The gap between question and answer is wide. The model is sampling from a high-entropy distribution — many plausible-sounding answers exist, and it picks the statistically most likely completion. That's fine for simple factual recall ("What is the capital of France?") where the answer is a short lookup. It breaks down for multi-step arithmetic, compositional reasoning, or anything requiring several dependent sub-conclusions.

With CoT:

```
[Question]
→ [Step 1: Identify the three suppliers]
→ [Step 2: Retrieve their unit cost share of total COGS]
→ [Step 3: Apply 8% increase to each]
→ [Step 4: Aggregate across current inventory levels]
→ [Step 5: Express as margin delta]
→ [Answer]
```

Each step is a token sequence that conditions the next one. The entropy collapses progressively — by the time the model is generating Step 5, most of the answer is already constrained by what Steps 1–4 said. Wrong branches that would have been invisible in a single-step answer are now visible as inconsistencies in the chain, and the model's own conditioning tends to correct them before they propagate.

There's a useful mental model here: CoT doesn't make the model smarter. It *stretches out* the computation across more tokens, giving the architecture more surface area to catch its own mistakes.

---

## How to Elicit Chain-of-Thought

You have three main options, arranged by how explicitly you're asking:

**1. Explicit instruction (most reliable for novel tasks)**

Simply tell the model to reason step by step:
- "Think step by step before answering."
- "Let's work through this carefully."
- "Show your reasoning before giving the final answer."

This is reliable and requires no prompt engineering sophistication. It's the right default for complex or high-stakes questions.

**2. XML-structured reasoning (best for production systems)**

You can use XML tags to separate the reasoning scratchpad from the final answer:

```
Think through the problem inside <reasoning> tags. 
Then give your final answer inside <answer> tags.

<reasoning>
Step 1: ...
Step 2: ...
</reasoning>
<answer>
...
</answer>
```

This has a meaningful advantage in production: your downstream code can parse the `<answer>` block without having to deal with the reasoning text. The model's thought process is captured, but your application only extracts the structured output it needs.

**3. Few-shot examples (best when you know the reasoning format you want)**

Show the model one or two examples of a question with full CoT-style reasoning, then ask your actual question. The model infers the pattern and applies it. This is useful when you want a specific *style* of reasoning — for example, breaking down Earnventory margin analysis in a specific order every time.

**When NOT to explicitly request CoT:**

Don't force CoT on tasks where the answer is obvious or factual. "What's the capital of France?" doesn't benefit from chain-of-thought — it just adds latency and tokens. Similarly, if you're running a high-volume pipeline (10,000 product categorizations per night), CoT on every item multiplies your token cost substantially. Reserve it for cases where multi-step reasoning genuinely reduces error.

---

## Suppressing Chain-of-Thought

Sometimes you want the opposite — you want the model to give a direct answer without visible reasoning. This matters when:
- You're exposing model output directly to users and the reasoning would be confusing or inappropriate to display
- You need low-latency responses and the task is simple
- You're integrating with a structured-output system where interleaved prose breaks parsing

Suppression techniques:
- "Answer in one sentence."
- "Give only the final answer. No explanation."
- Provide a strict output format schema (JSON, for instance) that leaves no room for prose.

Note that suppressing visible CoT doesn't eliminate the model's internal computation — it just means the reasoning tokens don't appear in the output. With extended thinking mode (which we'll cover in two days), the reasoning happens in a hidden scratchpad that never enters the context window.

---

## CoT in the Earnventory Context

Here's a concrete before-and-after for a task you might actually run.

**Without CoT:**

> Prompt: "We have 200 active SKUs. Our top three suppliers are responsible for 60% of COGS. They're all raising prices by 8% next quarter. What's the margin impact?"
>
> Response: "The margin impact would be approximately 4.8%."
>
> (Fast. Plausible. Probably wrong — it ignored inventory levels, existing margin structure, and which SKUs those suppliers cover.)

**With CoT:**

> Prompt: "We have 200 active SKUs. Our top three suppliers are responsible for 60% of COGS. They're all raising prices by 8% next quarter. Walk me through the calculation of the margin impact step by step."
>
> Response:
> "Step 1: The three suppliers collectively represent 60% of COGS.
> Step 2: An 8% price increase on 60% of COGS increases total COGS by 0.08 × 0.60 = 4.8%.
> Step 3: If current gross margin is 40% (i.e., COGS = 60% of revenue), and COGS increases by 4.8 percentage points, gross margin drops from 40% to approximately 35.2%.
> Step 4: This assumes price increases are fully absorbed — no price increases passed to customers.
>
> Final answer: ~4.8 percentage point reduction in gross margin, conditional on full cost absorption."
>
> (The answer is the same number, but now you can see the assumptions. You notice "full cost absorption" in Step 4 — you hadn't stated that. That's the reasoning surfacing a hidden variable you now need to specify or challenge.)

The visible steps don't just get you a more reliable answer. They give you something to interrogate.

---

## ASCII Diagram: Single-Hop vs. Chain-of-Thought

```
WITHOUT CoT:
─────────────────────────────────────────────────────────
 QUESTION ──────────────────────────────────► ANSWER
 "What's the margin impact?"                 "4.8%"

 Error accumulates silently across the gap.
 No visibility into assumptions made.
─────────────────────────────────────────────────────────

WITH CoT:
─────────────────────────────────────────────────────────
 QUESTION
    │
    ▼
 STEP 1: Identify supplier share (60% of COGS)
    │       constraints...
    ▼
 STEP 2: Apply 8% increase → +4.8% to COGS
    │       constraints...
    ▼
 STEP 3: Translate COGS increase to margin impact
    │       constraints...
    ▼
 STEP 4: Surface hidden assumption (full absorption)
    │       constraints...
    ▼
 ANSWER: "~4.8pp margin reduction if fully absorbed"

 Each step conditions the next. Errors become visible.
 Assumptions surface. The answer is auditable.
─────────────────────────────────────────────────────────
```

---

## How This Connects to Extended Thinking

In two days we'll cover Claude's extended thinking mode, which is CoT taken to an architectural extreme. In standard CoT, the reasoning tokens appear in the output — you can read them. In extended thinking, the reasoning happens in a hidden scratchpad that never enters the visible context window. The model thinks privately, then surfaces only the conclusion.

The underlying mechanism is the same: more tokens = more surface area for self-correction. The difference is who sees those tokens and whether they count against your context budget.

Understanding today's material — that CoT works because intermediate tokens constrain subsequent generation — is the prerequisite for understanding why extended thinking is expensive, when it's worth it, and what its failure modes are.

---

## The Analogy

**Showing your work on a math exam.**

Your high school math teacher didn't just want the answer. They wanted to see every step, because each step limits how wrong the next one can be. A student who writes "the answer is 47" with no work gets partial credit even if right — because the teacher can't verify the reasoning. A student who shows each step reveals the error the moment it enters the calculation.

Chain-of-thought turns Claude into the student who must show their work. Wrong branches don't compound silently — they appear in the chain as visible text, where they either get self-corrected (because the model's next token is conditioned on them) or become visible to you as the reviewer.

The whiteboard analogy from Mini-Module 1.3 applies here too. CoT puts the reasoning on the whiteboard instead of in the model's head. Once it's on the whiteboard, everyone in the room — including the model generating the next token — can see it and respond to it.

---

## What's Next

Tomorrow: **ReAct** — Reasoning + Acting. CoT gives the model a way to reason step by step before answering. ReAct extends this into an action loop: reason, then take an action, observe the result, reason again. This is the pattern that powers every agentic task Zazu runs — and understanding it gives you the vocabulary to read what's happening when an agent gets confused or loops.

---

## Free Resources

- **Anthropic's Chain-of-Thought Prompting Guide:** https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/chain-of-thought — Official documentation with examples. Read the "when to use" section carefully; it's where the practical tradeoffs live.

- **"Chain-of-Thought Prompting Elicits Reasoning in Large Language Models" (Wei et al., 2022):** https://arxiv.org/abs/2201.11903 — The original Google Brain paper that named and demonstrated CoT. The examples in Section 3 are clear enough to read without an ML background. The key finding (Figure 4) shows CoT only helps above a certain model scale — which is relevant to model selection for your Earnventory agents.
