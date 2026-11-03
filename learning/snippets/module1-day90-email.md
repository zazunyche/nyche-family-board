# AI Agents Day 90: Fine-Tuning vs. Prompting — When to Actually Change the Model's Weights

*Mini-Module 1.3 — Context, Memory, and State*

---

## Where this sits in the map

On Day 10 we drew the sharp line between **training** (how the model learned — months, enormous compute, billions of examples) and **inference** (what happens at runtime — milliseconds per request). On Day 12 we named the four kinds of memory an agent can have, and one of them was **in-weights** memory: the knowledge and behavior physically encoded in the model's parameters during training. Everything since — RAG (Day 13), context engineering (Day 14), context rot (Day 88), prompt caching (Day 89) — has lived on the *inference* side: cheap, fast, per-request levers that leave the model itself untouched.

Today we cross back over the line. **Fine-tuning** is the one tool in this whole mini-module that actually reaches in and edits the weights. It is powerful, it is expensive, and — this is the part most people get wrong — it is the *wrong* answer far more often than it's the right one. The goal of this email is to give you a crisp decision rule for when to reach for it and when prompting, RAG, or caching is the smarter move.

---

## What fine-tuning actually is

A base model like Claude Opus 4.8 or Sonnet 4.6 arrives with its weights already set — the result of Anthropic's training run over a vast corpus. **Fine-tuning** takes that finished model and runs *additional* training on a smaller, curated dataset of your own examples. Each example nudges the weights a little, so that the behavior you demonstrated becomes the model's new default.

Crucially, fine-tuning is still **training** — it happens on the training-time side of the Day 10 line:

```
   TRAINING TIME (slow, expensive, permanent)        INFERENCE TIME (fast, cheap, per-request)
  ┌──────────────────────────────────────┐          ┌───────────────────────────────────────┐
  │  base model  +  your examples         │          │  frozen model  +  your prompt / context │
  │        │                              │          │        │                              │
  │        ▼  (gradient updates)          │          │        ▼  (no weight change at all)   │
  │  new weights  ──►  behavior baked in  │          │  same weights ──► behavior steered    │
  └──────────────────────────────────────┘          │                   by what's on the     │
     happens ONCE, up front                          │                   whiteboard this turn  │
                                                      └───────────────────────────────────────┘
      ^ fine-tuning                                       ^ prompting, RAG, caching
```

Once you've fine-tuned, every request to that custom model gets the baked-in behavior for free — you don't have to re-explain it in the prompt each time. That's the appeal. The catch is that *changing* the behavior means training again.

---

## The one rule: tune for behavior, not facts

Here is the single most useful heuristic in this entire topic:

> **Fine-tune to change *how* the model behaves. Use RAG or the prompt to change *what* the model knows.**

Fine-tuning is excellent at teaching a **stable pattern** — a format, a tone, a structure, a classification scheme, a house style. It is terrible at teaching **facts that change**, because the only way to update a fact baked into weights is to retrain.

Apply it to Earnventory:

| You want the agent to…                                   | Right tool        | Why |
|----------------------------------------------------------|-------------------|-----|
| Always answer in your exact purchase-order format        | **Fine-tune**     | Stable pattern; worth baking in |
| Adopt your terse, numbers-first house tone               | **Fine-tune**     | Style is behavior, and it rarely changes |
| Classify supplier emails into your 8 internal categories | **Fine-tune**     | A fixed scheme you can show with examples |
| Know this week's supplier prices                         | **RAG**           | Changes constantly; retraining is absurd |
| Know your current pricing rules and margin thresholds    | **Prompt / RAG**  | Changes; must be exact and auditable |
| Know a supplier's last three invoices                    | **RAG / tools**   | Live data, fetched at request time |

If the information has a "last updated" date, it does not belong in the weights. Full stop.

---

## Why prompting almost always wins first

For the overwhelming majority of application needs, the cheaper inference-time levers get you there — and you should exhaust them before you even consider fine-tuning:

1. **Prompting / system prompts (Day 4).** A well-written system prompt with clear role, constraints, and output format handles a shocking amount of "behavior" work. Few-shot examples — showing the model two or three input→output pairs right in the prompt — can pull format and tone most of the way to where a fine-tune would, with zero training and the ability to change it in seconds.
2. **RAG (Day 13).** For anything factual or frequently-updated, retrieval beats fine-tuning decisively: update the source document and the next query reflects it instantly, with no retraining and with traceability back to the source.
3. **Caching (Day 89).** If the reason you wanted to "bake in" a big stable preamble was cost, prompt caching already gives you ~90% off the repeated part — no custom model required.

The economics are lopsided. Prompting and RAG are iterate-in-seconds, change-your-mind-for-free. Fine-tuning is a project: you need a **quality dataset** (often hundreds to thousands of clean examples), a training run, evaluation to confirm it didn't regress, and a commitment to re-run the whole thing whenever the behavior needs to change. You also take on a maintenance burden — a custom model is one more versioned artifact to track against base-model updates.

---

## When fine-tuning genuinely earns its keep

It's not never. Reach for it when **all** of these are true:

- **The behavior is stable** — a format, tone, or task that won't change week to week.
- **Prompting has hit a wall** — you've tried a strong system prompt and few-shot examples and the model still isn't consistent enough, *or* the examples needed are so long they're eating your context budget and inflating every request.
- **You have the data** — a clean, representative set of input→output examples demonstrating exactly the behavior you want.
- **The volume justifies it** — you're running enough traffic that shaving prompt tokens (no more giant few-shot block on every call) and gaining consistency actually pays back the training and maintenance cost.

The classic win is a **high-volume, narrow, stylistically-rigid task**: "turn these 10,000 raw SKU descriptions into our exact catalog format, every day." A fine-tune can bake the format in so you stop paying to re-teach it on every request. Even then, the honest first move is to try it with Haiku-tier + a few-shot prompt and measure — you may find you never need the fine-tune at all.

---

## The spectrum, from cheapest to most permanent

Think of your options as a ladder. Climb only as high as the problem forces you to:

```
  cheapest / most flexible                                    most expensive / most permanent
  ─────────────────────────────────────────────────────────────────────────────────────────►
  prompt   →   few-shot      →   RAG            →   prompt         →   fine-tune
  only         examples          (retrieval)        caching            (edit the weights)
  │            │                 │                  │                  │
  steer        show the          inject live        make the stable    bake behavior
  behavior     pattern in        facts at           part cheap to      in permanently
  in words     the prompt        request time       re-send
```

Most real Earnventory features never need to pass the RAG rung. The art — this is context engineering again, Day 14 — is matching the lever to the problem: *behavior that's stable and proven un-promptable* climbs to fine-tuning; *facts* stay on the RAG rung; *everything else* is a prompt.

---

## The Zazu connection

Zazu is not fine-tuned. It is a base Claude model (the exact tier shows up in your `~/.zazu-config`) steered entirely by inference-time tools: a large, stable system prompt (identity, house rules, this curriculum), a memory file it reads at the start of a session (Day 15), and context assembled per task. That is a deliberate design choice, and it maps directly to today's rule.

Why no fine-tune? Because almost everything that makes Zazu *Zazu* is either **behavior that's already well-handled by the system prompt** (its persona, its constraints, how it writes these emails) or **facts that must stay current** (who's in the family, what's on the board this week, what it delivered yesterday). Facts in particular are exactly what you must *never* bake into weights — they'd be frozen at training time and go stale immediately. Keeping Zazu on a base model means we can change its behavior by editing a prompt file, and change what it knows by editing a memory file, both in seconds and both fully auditable. A fine-tuned Zazu would trade all of that flexibility for a consistency it doesn't actually need.

---

## Key takeaways

- **Fine-tuning edits the weights** — it's training, on the slow/expensive/permanent side of the Day 10 line. Everything else (prompt, RAG, caching) leaves the weights frozen and works at inference time.
- **Tune for behavior, not facts.** Stable patterns — format, tone, classification — can be baked in. Anything with a "last updated" date belongs in RAG or the prompt.
- **Exhaust the cheap levers first.** A strong system prompt + few-shot examples handles most "behavior" needs; RAG handles facts; caching handles the cost of a big stable preamble.
- **Fine-tune only when all four hold:** the behavior is stable, prompting has provably hit a wall, you have a clean dataset, and the volume pays back the training + maintenance cost.
- **Zazu is deliberately not fine-tuned** — its persona lives in a prompt and its knowledge lives in a memory file, so both can change in seconds and stay auditable.

---

## Free resources

1. **Anthropic — Prompt engineering overview** (the levers to exhaust *before* you ever fine-tune): https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
2. **IBM — "RAG vs. Fine-Tuning"** (a clear side-by-side on when each wins for knowledge vs. behavior): https://www.ibm.com/think/topics/rag-vs-fine-tuning

---

*Tomorrow: the memory tool — how an agent can read and write its own long-term memory directory, turning the "filing cabinet" from Day 12 into something the agent manages itself.*
