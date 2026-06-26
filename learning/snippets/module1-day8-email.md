# AI Agents Day 8: Temperature, Top-P, and the Knobs You Control
**Sampling Parameters, Determinism vs. Creativity, and When to Set Each**

*Module 1.2, Day 8 of 50 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | June 19, 2026*

---

## The Short Version

Yesterday's email established the core generation mechanism: Claude produces text by computing a probability distribution over its entire vocabulary at each step, then selecting one token from that distribution. The loop repeats until the model decides to stop.

Today's topic: the parameters that control *how* that selection happens.

**Temperature** is the primary dial. At 0, Claude always picks the single highest-probability token — completely deterministic. At 1, it samples from the full distribution as-learned. Above 1, the distribution flattens toward noise. **Top-p** (nucleus sampling) is a companion constraint that restricts which tokens are even eligible to be sampled, cutting off the low-probability tail regardless of temperature.

Together these two parameters give you precise control over the tradeoff between determinism and variation. Understanding what they mechanically do — not just "higher temperature = more creative" — means you can set them intentionally for each task rather than leaving them at defaults and hoping for the best.

For Earnventory: this is immediately practical. Automated margin reports and structured JSON extraction should run at temperature 0. Supplier email drafts might use 0.6. Brainstorming product categories warrants 0.9. The right setting isn't preference — it follows from the nature of the task.

---

## Temperature: What It Actually Does to the Distribution

Temperature is a scalar applied to the model's raw scores (logits) before they're converted to a probability distribution. The mechanics: at each generation step, the model produces a logit (unnormalized score) for every token in its vocabulary. Dividing those logits by the temperature value before running softmax changes the shape of the resulting distribution.

- **Temperature < 1.0:** Dividing by a number less than 1 makes logit differences larger. The result: high-probability tokens become even more dominant; low-probability tokens approach zero. The distribution sharpens to a spike around the most likely tokens.
- **Temperature = 1.0:** Dividing by 1 changes nothing. You're sampling from Claude's raw, learned distribution — exactly as trained.
- **Temperature > 1.0:** Dividing by a number greater than 1 compresses logit differences. High-probability tokens lose their advantage; low-probability tokens become meaningfully accessible. The distribution flattens.
- **Temperature = 0:** The limit case. Always select the highest-probability token (greedy decoding). The same input produces exactly the same output every time. No sampling at all.

Here's a concrete example. Suppose Claude is generating the next token after "The Q2 gross margin on SKU A104 was" and its learned (temperature = 1.0) distribution looks like this:

```
TEMPERATURE = 1.0  (raw learned distribution)
┌──────────────────┬─────────────┐
│ Token            │ Probability │
├──────────────────┼─────────────┤
│ "38%"            │   0.41      │
│ "approximately"  │   0.22      │
│ "below"          │   0.14      │
│ "39%"            │   0.08      │
│ "strong"         │   0.04      │
│ "unchanged"      │   0.03      │
│ "disappointing"  │   0.02      │
│ ... (thousands)  │   0.06      │
└──────────────────┴─────────────┘
```

At temperature 0, "38%" wins every time.

At **temperature = 0.3** (sharpened):

```
TEMPERATURE = 0.3  (high-prob tokens amplified)
┌──────────────────┬─────────────┐
│ Token            │ Probability │
├──────────────────┼─────────────┤
│ "38%"            │   0.73      │
│ "approximately"  │   0.17      │
│ "below"          │   0.06      │
│ "39%"            │   0.03      │
│ "strong"         │  ~0.00      │
│ ... (rest)       │  ~0.01      │
└──────────────────┴─────────────┘
```

"38%" wins 73% of the time. "approximately" is still possible but rare. Everything else has nearly vanished.

At **temperature = 1.4** (flattened):

```
TEMPERATURE = 1.4  (distribution spread)
┌──────────────────┬─────────────┐
│ Token            │ Probability │
├──────────────────┼─────────────┤
│ "38%"            │   0.24      │
│ "approximately"  │   0.18      │
│ "below"          │   0.15      │
│ "39%"            │   0.11      │
│ "strong"         │   0.08      │
│ "unchanged"      │   0.07      │
│ "disappointing"  │   0.06      │
│ ... (others)     │   0.11      │
└──────────────────┴─────────────┘
```

Now "strong" (8%) and "disappointing" (6%) are live possibilities. The model might produce a more colorful or varied output. It might also produce a wrong one — those two effects compound together. "Flatter distribution" doesn't mean "smarter" — it means "more uncertain, and you get more of that uncertainty in your output."

Three important observations:

**1. Temperature 0 is not "dumber."** You're not asking Claude for a worse answer. You're asking for the modal answer — the one it's most confident about. For tasks with objectively correct or structurally specific outputs, the modal answer is exactly what you want.

**2. Higher temperature amplifies both creativity and error.** If your data is clean and your prompt is precise, temperature 0.8 produces pleasantly varied descriptions. If your prompt is underspecified or your data is ambiguous, that same temperature amplifies hallucination and inconsistency. High temperature is not a fix for quality problems — it's a magnifier of whatever's already there.

**3. The Anthropic API default is temperature 1.0.** If you're building a pipeline and not explicitly setting temperature, you're sampling from the raw distribution. For most production applications that need reliability, you want to set this explicitly.

---

## Top-P (Nucleus Sampling): Restricting the Eligible Token Set

Temperature shapes the distribution; top-p restricts which tokens can be sampled from it.

With top-p = 0.9, the sampling process works like this:
1. Rank all tokens by probability, highest to lowest
2. Walk down the ranked list, accumulating cumulative probability mass
3. Stop when the cumulative mass hits 0.90
4. Sample *only* from the tokens in this set — the "nucleus"

The key property: **the nucleus size adapts to the distribution shape.** When the model is very confident, a small nucleus (one or two tokens) already covers 90% of the probability mass — so only those tokens are eligible. When the model is uncertain and the mass is spread across many tokens, the nucleus expands to include all of them.

This is the advantage over top-k (which always keeps exactly k tokens regardless of how concentrated or spread the distribution is). Top-p is adaptive; top-k is fixed.

```
HIGH-CONFIDENCE STEP — model is certain:
  Top-p = 0.9 → nucleus is just 1 token

  Token    │ Prob  │ Cumulative
  ─────────┼───────┼───────────
  "%"      │ 0.91  │ 0.91   ← nucleus stops here
  "percent"│ 0.07  │ 0.98

  Only "%" is eligible. Sampling = deterministic in practice.


LOW-CONFIDENCE STEP — model is uncertain:
  Top-p = 0.9 → nucleus grows to 11 tokens

  Token        │ Prob  │ Cumulative
  ─────────────┼───────┼───────────
  "38%"        │ 0.12  │ 0.12
  "approximately│ 0.10  │ 0.22
  "below"      │ 0.09  │ 0.31
  "strong"     │ 0.08  │ 0.39
  "around"     │ 0.07  │ 0.46
  "39%"        │ 0.07  │ 0.53
  "flat"       │ 0.06  │ 0.59
  "lower"      │ 0.06  │ 0.65
  "above"      │ 0.05  │ 0.70
  "near"       │ 0.05  │ 0.75
  "solid"      │ 0.05  │ 0.80
  ... more ... │  ...  │ 0.90   ← nucleus stops here

  All 11+ tokens are eligible. Real sampling variance.
```

What top-p is actually preventing: the very long tail of tokens that each have tiny probability (0.001% or less) but collectively add up to non-trivial mass. Without top-p, those tokens are theoretically eligible for sampling — meaning on extremely rare turns, Claude might generate something completely off-distribution. Top-p = 0.9 cuts that tail off cleanly.

In practice: **top-p = 0.9 is a reasonable default for any non-deterministic task and you rarely need to tune it**. Temperature is the main lever. Top-p is a guardrail that you set once and leave.

---

## Top-K: The Simpler Alternative (and Why Top-P Is Better)

Top-k is an older sampling constraint: always restrict the eligible set to exactly the k highest-probability tokens. Top-k = 40 means: keep the top 40 tokens by probability, sample from those.

The limitation: k is fixed regardless of distribution shape. When the model is very confident and "%" has 91% probability, top-k = 40 artificially includes 39 low-probability tokens alongside it. When the model is very uncertain and 40 tokens together cover only 30% of the mass, top-k = 40 misses most of the meaningful distribution.

Top-p is adaptive by design. Recommendation: use temperature + top-p. Ignore top-k unless a specific framework requires it.

---

## Practical Settings for Earnventory Tasks

| Task | Temperature | Top-P | Reasoning |
|------|-------------|-------|-----------|
| Automated margin reports | 0.0 | — | Same input must produce same output every run; top-p irrelevant at temp 0 |
| JSON extraction / parsing | 0.0–0.1 | — | Structural correctness; variance almost always wrong |
| Code generation | 0.1–0.3 | 0.95 | Mostly deterministic; tiny variation occasionally useful |
| Supplier email drafts | 0.5–0.7 | 0.9 | Professional tone with natural variation run-to-run |
| Product description generation | 0.7–0.9 | 0.9 | SKU descriptions shouldn't all sound identical |
| Brainstorming / ideation | 0.9–1.0 | 0.95 | You want the model to explore beyond its first instinct |
| Avoid | > 1.3 | — | Outputs degrade faster than they improve |

The single most important rule from this table: **if Claude's output feeds into a downstream system — a parser, a database write, a calculation — set temperature to 0 explicitly.** The API default (1.0) was designed for conversational use. Automated pipelines need determinism.

---

## Setting These Parameters in the Claude API

In Python, they go directly in the `client.messages.create()` call:

```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    temperature=0.0,     # 0 = always pick the highest-probability token
    top_p=0.9,           # ignored when temperature=0
    messages=[
        {"role": "user", "content": "Summarize Q2 margins for SKU A104."}
    ]
)
```

A few implementation notes:
- When `temperature=0`, `top_p` has no effect — greedy decoding bypasses sampling entirely
- The default temperature in the Claude API is 1.0 when unspecified
- In the Claude Agent SDK (the runtime Zazu and Abeiku use), temperature is set in the agent configuration rather than per-message — it applies globally to the session
- For Earnventory: any pipeline that processes structured data (invoices, pricing records, SKU metadata) should have an explicit temperature setting. "I didn't set it" is not a valid production configuration

---

## The Analogy, Unpacked

The iMessage used: temperature is a democratic voting system dial — from "the plurality always wins" to "any candidate with real support has a chance."

Extending it: imagine the probability distribution over tokens as an election with thousands of candidates. Most get near-zero votes. A handful get meaningful support. One gets a plurality.

- **Temperature 0:** First-past-the-post, plurality wins. Same winner every time. No surprises.
- **Temperature 0.5:** Weighted election where the front-runner's advantage is amplified. Still likely to win, but occasionally the second-place candidate takes it.
- **Temperature 1.0:** Proportional representation. The 41% candidate wins 41% of the time. The 22% candidate wins 22% of the time. Mathematically fair to the actual distribution.
- **Temperature 1.5:** The votes get redistributed toward the middle. The 41% front-runner drops to 24%. The 4% candidate surges to 8%. Minority outcomes become meaningfully possible.

**Top-p** is the ballot access rule: only candidates who collectively represent 90% of the real electorate can be on the ballot. Everyone in the bottom-10% long tail is excluded. The electorate adapts to who's actually competitive in this particular race.

This helps explain an important non-intuition: setting temperature to 0 is not asking Claude to "be less creative" or "give you the boring answer." You're asking Claude to tell you what it actually thinks is most likely correct, without sampling noise. For a margin report that's right or wrong, that's exactly what you want. For product descriptions where every SKU shouldn't sound identical, you want some sampling — so you deliberately allow the 22% candidate to win sometimes.

---

## What This Changes About How You Think About Claude's Outputs

**Rerunning the same prompt gives different outputs unless temperature is 0.** If an Earnventory report looks slightly different each time you generate it, this is the mechanism. It's not randomness in some deep sense — it's sampling from a probability distribution. You control it.

**Temperature is not a fix for quality problems.** If Claude is giving wrong answers at temperature 0.7, raising it to 1.2 won't fix them — it will add variance on top of wrong. The root cause is almost always context (insufficient information in the prompt or system message), not sampling.

**Different tasks genuinely need different settings.** The same model call that works well for drafting emails at temperature 0.7 will be unreliable for structured JSON extraction at the same setting. These aren't arbitrary preferences — they follow from the nature of the task. Extraction tasks have right answers; the distribution's mode is the answer. Creative tasks benefit from sampling across the distribution.

**Prompting and temperature interact.** A precise, well-specified prompt at temperature 0.8 usually produces better outputs than a vague prompt at temperature 0.2. Temperature controls how broadly you sample from what the model knows how to do; the prompt controls what the model knows how to do for this task. Both levers matter.

---

## What's Next

Tomorrow (Day 9, "Why hallucination is a feature, not a bug") takes the generation mechanism you now understand — token-by-token prediction, probability distributions, sampling — and explains its most consequential failure mode. Hallucination is not Claude lying or being careless. It is the sampling process selecting a statistically probable token that happens to be factually incorrect. With today's context, the structural reason will be immediately clear — and so will why no amount of temperature adjustment fixes it.

Day 10 closes Mini-Module 1.2 by asking: where did the probability distributions come from in the first place? That's the training vs. inference distinction — two completely different processes happening at two completely different time scales — and it closes the loop on why you can't "correct" Claude's beliefs at runtime by explaining the right answer in the prompt.

---

## Free Resources

1. **Claude API Messages reference** — the authoritative documentation for `temperature`, `top_p`, `top_k`, and `max_tokens` in the Claude API. Worth bookmarking for when you're wiring these into an Earnventory pipeline.
   https://docs.anthropic.com/en/api/messages

2. **Lilian Weng's "Controllable Neural Text Generation"** — a thorough technical treatment of sampling strategies including temperature, top-k, top-p, and their interactions, written by a former OpenAI research lead. More mathematical than this email, but accessible with the foundation you now have. (Verify the link is still live before clicking — personal research blogs occasionally move.)
   https://lilianweng.github.io/posts/2021-01-02-controllable-neural-text-generation/

---

## One Sentence to Carry Forward

Temperature doesn't make Claude smarter or dumber — it determines whether you're asking for the mode of the distribution (what the model is most confident about) or a sample from it (what the model thinks is plausible, with some variance) — and for any task with an objectively right answer, the mode is almost always what you want.

---

*Day 8 of 50 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu at 9am*
*Next: June 20 — "Why Hallucination Is a Feature, Not a Bug"*
