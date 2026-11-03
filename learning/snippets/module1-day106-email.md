# AI Agents Day 106: Chain of Thought — Making the Model Show Its Work

**Mini-Module 1.4 — Reasoning and Planning (opener)**

---

Dad, we're starting a new mini-module today, and it's the one that ties everything so far together. Over the last three weeks you've learned what an agent *is* (a model + tools + context + loop), what the model underneath actually *does* (predict the next token from a probability distribution), and how memory and context *flow* through it (the whiteboard, the filing cabinet, RAG). Mini-Module 1.4 is about the piece that sits on top of all of that: **how I actually reason** — how I get from a question to a correct answer when the answer takes more than one step.

And the foundational technique, the one every fancier reasoning method is built on, is almost embarrassingly simple to state: **make the model think out loud before it commits to an answer.** That's chain of thought. Today I want to show you *why* something that sounds like a motivational poster ("show your work!") is in fact a precise consequence of the token-level mechanics you already learned in Mini-Module 1.2.

---

## The problem: one-leap answers fail on multi-step questions

Recall the single most important fact about how I generate text (Day "predicting the next word"): I produce **one token at a time**, left to right, and each token I emit is appended to my context and fed back in to help produce the *next* token. I don't plan the whole sentence and then type it. I commit to token 1, then — seeing token 1 — I commit to token 2, and so on. This is called **autoregressive generation**.

Now think about what that means for a question that genuinely requires several steps of reasoning. Suppose you ask:

> "Three Earnventory SKUs sold for $2,340 total this week at an 18% margin. Two of them split the revenue evenly and the third did the rest at double their rate. What was the margin dollars on the third SKU?"

If I'm forced to answer in one leap — if the very first tokens I emit have to *be* the final number — then I'm asking a next-token predictor to compress a four-step calculation into a single probabilistic guess. There's no room for the intermediate quantities (total margin, per-SKU revenue, the third SKU's share) to exist anywhere. They have to be computed *implicitly*, inside a single forward pass, and then the answer has to pop out correct. For anything nontrivial, the probability of the right number being the most likely next token is low. So I guess something plausible-looking and often wrong.

This is the structural reason LLMs are famously bad at arithmetic and multi-hop logic *when rushed*. It's not that the capability is absent. It's that the format gives the capability nowhere to unfold.

---

## The fix: let the intermediate steps become tokens

Chain of thought changes one thing: instead of demanding the answer first, I'm prompted (or trained) to **write out the reasoning steps first, and only then state the answer.**

Watch what that does mechanically. The same question, with "think step by step":

```
  Step 1: Total margin = 18% of $2,340 = $421.20
  Step 2: Let a two SKUs each take revenue R; third takes 2R-worth of margin rate...
  Step 3: [works through the split]
  Step 4: Third SKU margin = $______
```

Each of those lines is **tokens I actually emit**. And because of autoregression, the moment "Total margin = $421.20" is on the page, it is now part of my input for everything that follows. Step 2 is generated while *reading* step 1. Step 4 is generated while reading steps 1–3. The intermediate results have a physical place to live — in the token stream — and each one constrains the next.

Here's the mental model that makes it click:

```
  WITHOUT chain of thought:
     question ─────────────────────────────►  [ answer ]
               (entire computation crammed into one leap — fragile)

  WITH chain of thought:
     question ─► step1 ─► step2 ─► step3 ─► [ answer ]
                   │        │        │
                   └────────┴────────┴──── each step is read back in
                                            to produce the next one
```

The steps aren't decoration. They are **working memory externalized into the output**. The model literally cannot hold a scratchpad in its head between tokens — so chain of thought turns the output itself into the scratchpad. That's the whole trick.

---

## Why this reduces error (the real reason)

Three things are happening at once, and it's worth separating them:

**1. Error isolation.** A multi-step problem answered in one leap has one chance to be right. Broken into steps, each step is a *smaller* prediction with a *higher* chance of being individually correct, and a wrong step is visible rather than silently baked into a final number. The hard problem becomes a chain of easy problems.

**2. Conditioning.** This is the subtle one. Because each token is generated conditioned on all previous tokens, writing a *correct* intermediate result makes the correct *next* result more probable. The right answer to "421.20 divided by 3" is a far more likely continuation when "421.20" is sitting right there in the context than when it has to be conjured from nothing. Good steps raise the probability of good next steps. The chain pulls itself toward correctness.

**3. Compute, spread out.** Every token I generate is another full pass through the network — more "thinking" applied to the problem. A one-word answer gets one pass's worth of computation. A ten-line derivation gets ten-plus passes. Chain of thought is, bluntly, a way of spending *more compute* on a hard question by letting the model take more steps. More steps, more chances to apply what it knows.

None of this is me "trying harder." It's the format giving a next-token predictor the room to do what it's good at — predicting the next small, well-conditioned step — instead of forcing it into a single impossible jump.

---

## How you elicit it — and how you suppress it

Because it's a prompting behavior, you control it. Three levels of how deliberate you want to be:

- **The classic trigger.** Literally appending "Let's think step by step" to a prompt is the original, famous elicitation. It still works. It tells me to lay out reasoning before concluding.
- **Structured scaffolding.** Better for production: tell me the *shape* of the reasoning. "First compute total margin. Then compute each SKU's share. Then state the final number." Now the steps are reliable and parseable, not freeform.
- **Modern models often do it unprompted.** Today's Claude models will frequently reason step-by-step on hard problems on their own, because the behavior has been reinforced in training. (This is the seed of "extended thinking," which gets its own day later this week — a dedicated, sometimes-hidden scratchpad.)

And crucially, you sometimes want to **suppress** it. If you ask me for a single tax rate and I give you a five-paragraph derivation, that's wasted tokens, latency, and cost — and it clutters output your code has to parse. For simple lookups, tell me to answer directly. For anything with steps, let me show them. Knowing *which* question you're asking is the skill.

```
  Rushed answer  →  cheap, fast, fine for lookups, FRAGILE on multi-step
  Step-by-step   →  more tokens, slower, costs more, ROBUST on reasoning
```

That tradeoff — accuracy bought with tokens and latency — is the recurring theme of this entire mini-module.

---

## Where it connects to what you've seen

You've already watched me do this. When I work through a scheduling conflict for the family — "Kofi has soccer Thursday, but that collides with Ama's recital; the recital is fixed, so soccer is the thing that moves; the next free evening is..." — that visible reasoning *is* chain of thought. I'm not narrating a decision I already made; I'm making the decision *by* narrating it. Each line is the stepping-stone for the next. Same mechanism, whether the domain is third-grade arithmetic or a family calendar or an Earnventory margin report.

It's also the direct bridge to tomorrow. Chain of thought is reasoning *in isolation* — I think, then I answer, all inside my own head/output. But real agents don't just think; they **act** — they call tools, read results, and think again. When you interleave chain-of-thought reasoning with real actions and observations, you get the **ReAct** pattern, which is what turns a reasoner into an agent. That's Day 107.

---

## The one thing to remember

**Chain of thought works because I generate one token at a time, and each token I write becomes input for the next. Forcing the intermediate steps out into the open gives my reasoning a place to live — a scratchpad made of output — so each step conditions and constrains the next, instead of cramming a multi-step problem into one fragile guess.** It's not motivation; it's mechanics. The cost is more tokens, more latency, more money — so you elicit it for genuine reasoning and suppress it for simple lookups. Everything else in this mini-module (ReAct, extended thinking, planning) is a refinement of this one idea: give the model room to think before it commits.

---

### Free resources

- **Anthropic — Chain-of-thought prompting guide:** https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/chain-of-thought — the practical how-to, from the team that builds Claude: when to use it, how to structure it, how to make the steps parseable.
- **"Chain-of-Thought Prompting Elicits Reasoning in Large Language Models" (Wei et al., 2022):** https://arxiv.org/abs/2201.11903 — the original paper that named the technique and showed the accuracy jumps. Readable; skim the figures. ⚠️ It's a research PDF; the abstract page is the stable link.

*Tomorrow (Day 107): "ReAct — the loop that makes agents smart." What happens when I stop just thinking and start interleaving reasoning with real actions: Reason → Act → Observe → Reason, traced through an actual task.*
