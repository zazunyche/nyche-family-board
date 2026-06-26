# AI Agents Day 7: Predicting the Next Word Is Not What You Think
**Autoregressive Generation and Probability Distributions Over the Vocabulary**

*Module 1.2, Day 7 of 50 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | June 18, 2026*

---

## The Short Version

Yesterday opened Mini-Module 1.2 with the smallest unit of the model's reality: tokens, not words. Today we go one level deeper and answer the question that Day 6 left open — what does Claude *do* with those tokens once it has them?

The answer: **it predicts the next one, then the one after that, then the one after that — left to right, one token at a time, with no ability to look ahead — until it decides to stop.** That is the complete generation mechanism. Everything you observe in Claude's output — coherent paragraphs, correct code, structured reports, well-reasoned tool calls — is an emergent consequence of repeating that single operation very many times, with a model that has internalized an enormous amount of structure about language, logic, and knowledge from its training data.

This sounds simple. It isn't. Understanding it mechanically changes how you interpret Claude's outputs, explains most of its failure modes, and makes the next three days of this mini-module (temperature, hallucination, training vs. inference) click into place.

---

## What "Autoregressive" Actually Means

"Autoregressive" comes from time-series statistics. It means: the current output is a function of (regresses on) all previous outputs. Applied to text generation:

- **Auto:** the model feeds its own outputs back as inputs at each step
- **Regressive:** each new token is computed from (depends on) the full sequence of tokens that came before it

The name is technical but the concept is accessible. At every step, Claude has access to the complete context — system prompt, conversation history, tool results, everything it has already generated — and uses all of that to compute a probability score for every possible next token in its vocabulary. It then selects one token from that distribution. That token joins the context. The process repeats.

There is no planning step. No drafting. No outline that gets filled in. Just: context in, probability distribution over vocabulary, token selected, context extended by one token, repeat.

---

## The Probability Distribution: What's Actually Happening at Each Step

Claude's vocabulary contains tens of thousands of possible tokens. At each generation step, the model assigns a probability score to every one of them — a distribution that sums to 1.0. Higher scores mean that token is more likely to continue the sequence coherently given the full context.

Here's a simplified example. Suppose Claude is midway through writing a quarterly margin summary for Earnventory:

```
Context so far:
  "The gross margin on SKU A104 for Q2 was"

Token probabilities at this step (illustrative):
  P("approximately")  = 0.28
  P("around")         = 0.19
  P("about")          = 0.14
  P("roughly")        = 0.09
  P("38")             = 0.07
  P("below")          = 0.05
  P("unchanged")      = 0.04
  ... (tens of thousands of other tokens, each near zero)
```

Say the model selects "approximately." Now the context is extended:

```
Context: "The gross margin on SKU A104 for Q2 was approximately"

New distribution:
  P("38")   = 0.21
  P("42")   = 0.17
  P("35")   = 0.13
  P("40")   = 0.11
  P("the")  = 0.03
  ...
```

Say it selects "38." Now:

```
Context: "...was approximately 38"

New distribution:
  P("%")        = 0.91   ← almost certain, given a bare number
  P("percent")  = 0.07
  P(".")        = 0.01
  ...
```

Three observations that matter for how you think about Claude as a system:

**1. Each step is fresh, not remembered.** When the model selected "approximately," it did not "plan" to say "38%" next. It selected "38" at the next step because "38" was highly probable *given a context that now included "approximately"*. The coherence of the phrase emerges from each step being locally consistent with the context so far — not from any global plan.

**2. The distribution is not a spike; it's a distribution.** At step 1, the model gave "approximately" 28%, but also gave "around" 19% and "about" 14%. These alternatives were real options. Which one actually gets selected depends on the sampling process — and that sampling process is controlled by parameters you can set. Low temperature collapses sampling toward the highest-probability token; higher temperature opens it up to less-likely but potentially richer completions. (Tomorrow's full topic.)

**3. Later tokens are conditioned on earlier choices.** By the time Claude is generating the 300th token of a report, it's conditioned on 299 tokens it has already chosen. Any error, drift, or inconsistency in those 299 tokens is now baked into the context that constrains token 300. There's no going back, no revision, no editing pass. This is why very long outputs can drift in ways that feel strange — the generation process is fundamentally committed and irreversible at each step.

---

## Why This Is More Than "Autocomplete"

Calling it "autocomplete" is accurate as a mechanism and undersells it as a capability. The difference between Claude and your iPhone keyboard is not the architecture — it's three factors: the size of the model (billions of parameters vs. millions), the size and diversity of the training data (essentially all written human knowledge vs. your personal message history), and the depth of the context window it can attend to (hundreds of thousands of tokens vs. the last few words).

These differences are not incidental. They mean the completion operation is being performed by a model that has internalized vast amounts of structure: logical relationships, syntactic patterns, domain-specific conventions, causal chains, factual associations, stylistic registers, programming language semantics, and more. When Claude generates the next token, it is doing so conditioned on all of that learned structure, plus all of your current context.

The result looks like understanding. It often is *functionally analogous* to understanding — the model reliably produces outputs that would require understanding to produce, in most cases. But the mechanism is completion, not comprehension in the traditional sense. This distinction matters for Day 9 (hallucination) and Day 10 (training vs. inference).

---

## The Full Generation Pipeline, Visualized

```
INPUT: full context as a sequence of tokens
[system prompt tokens | conversation tokens | tool result tokens | prior output tokens]

                    |
                    v

          TRANSFORMER MODEL
  (each layer attends to all preceding tokens,
   building up increasingly rich representations)

                    |
                    v

  PROBABILITY DISTRIBUTION over vocabulary
  (a score for every possible next token, softmaxed to sum to 1.0)

                    |
                    v

     SAMPLING (controlled by temperature / top-p / top-k)
     "Which token do we actually pick from this distribution?"

                    |
                    v

       ONE TOKEN APPENDED TO CONTEXT
       (e.g., the word "approximately")

                    |
                    v

     IS THIS A STOP TOKEN OR AT MAX LENGTH?
          /             \
        YES              NO
         |                |
       DONE           LOOP BACK TO TOP
                    (context now includes
                     the token just appended)
```

The loop runs until either a stop token is generated (Claude decides it's done) or a hard token limit is reached. Every single token in the output went through this loop once.

---

## Worked Example: Zazu Writing a Supplier Report

When you send Zazu the task "summarize the last 90 days of transactions with Rosario & Co. and flag margin concerns," and Zazu delegates part of this to a query tool and then synthesizes a written report — every sentence of that report was generated by this loop.

The structural choices Claude makes — opening with a summary sentence, organizing by time period, flagging the margin concern in a dedicated section — aren't because Claude planned a report structure. They're because, given a system prompt that establishes Zazu's role, a tool result containing transaction data, and an instruction that says "summarize... and flag," the highest-probability continuations happen to produce report-shaped text. Claude has processed enough business summaries and reports in training that the patterns — topic sentence, supporting data, conclusion, flags — are deeply embedded in its probability distributions for this kind of context.

This is not magic. It's very deep, very well-trained pattern completion. But knowing that's what's happening gives you useful handles:

- If you want a specific report structure, specify it explicitly in your system prompt or instruction. You're shaping the context that constrains the distribution, making your desired structure the high-probability path.
- If a report drifts or goes off-format midway through, it's because earlier tokens created a context that made the drift high-probability. Prevention is upstream: better context, clearer instructions, shorter outputs where possible.
- If you rerun the same task and get a slightly different structure, it's because the sampling at each step isn't deterministic — different paths through the distribution space, all locally plausible.

---

## The Analogy, Unpacked

The iMessage used: **Claude is the world's most sophisticated autocomplete, trained on essentially all human writing.**

One extension worth adding: unlike your phone keyboard, which sees only the last few words, Claude's "autocomplete" operates over a context window that can hold your entire conversation, your system prompt, tool definitions, and tool results simultaneously. At each generation step, the model is not just asking "what word follows X?" It's asking "what token follows this 50,000-token context, given all the structure I learned during training?"

That's why the outputs cohere across paragraphs, why Claude can maintain a persona across a long conversation, why tool calls reference parameters that were defined 20 turns ago. The context window is doing a lot of work — which is exactly why Mini-Module 1.3 (starting Sunday) is devoted entirely to it.

---

## What This Changes About Reading Claude's Outputs

A few concrete implications now that you know the mechanism:

**Confident errors are not lies.** When Claude states something incorrect with confidence, it generated tokens that were statistically likely given its training and context. The model has no internal fact-checker that runs before tokens are emitted. High probability doesn't imply truth.

**Different runs, different results.** Rerunning the same prompt doesn't guarantee the same output, because sampling from a probability distribution introduces variance. If you need deterministic outputs for Earnventory (say, automated reports that should be identical across runs), you suppress this variance by setting temperature to 0 or near 0.

**Long outputs are more fragile.** Every token is conditioned on all prior tokens. In a 1,000-token output, token 900 was selected to fit a context that included 899 prior choices. If any of those earlier choices introduced a subtle inconsistency, later tokens inherit it. This is why shorter, more targeted outputs are often more reliable — there's less accumulated context for errors to compound in.

**Prompting is context engineering.** Every word you put in a system prompt, every example you provide, every piece of structure you add to your instruction is extending the context that constrains Claude's probability distributions. The reason well-crafted prompts work is not that Claude "understands" your instructions more deeply — it's that your instructions shape the context such that the high-probability completions are the outputs you want.

---

## What's Next

Tomorrow (Day 8, "Temperature, top-p, and the knobs you control") we cover the sampling parameters: what temperature does to the probability distribution at each step, how top-p constrains which tokens can even be sampled, and when to set each. Now that you know what the distribution is, those parameters will make mechanical sense.

Day 9 (hallucination) will follow naturally: hallucination is what happens when the most statistically probable continuation happens to be factually wrong. Day 10 (training vs. inference) closes the mini-module by explaining where the probability distributions came from in the first place — and why you can't fix a wrong distribution by explaining the correct answer during inference.

---

## Free Resources

1. **"How LLM Token Prediction Works (A Simple Guide for Developers)"** — covers tokenization (Day 6) and autoregressive generation (today) in a single readable walkthrough, developer-oriented. A good companion piece to this email.
   https://medium.com/@pavani.singamshetty/how-llm-token-prediction-works-a-simple-guide-for-developers-b7b4ef634154

2. **Andrej Karpathy's "State of GPT"** (YouTube, free) — the clearest practitioner explanation of the full LLM pipeline, including the generation mechanism. The section on autoregressive decoding is directly relevant today. (Verify it's still live before clicking — talks like this occasionally get reposted or moved.)
   https://www.youtube.com/watch?v=bZQun8Y4L2A

---

## One Sentence to Carry Forward

Claude doesn't think, then write — it writes *by* thinking one token at a time, each choice conditioned on everything before it, and the coherence you see in its outputs is an emergent property of doing that a few hundred times in a row, very well.

---

*Day 7 of 50 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu at 9am*
*Next: June 19 — "Temperature, Top-P, and the Knobs You Control"*
