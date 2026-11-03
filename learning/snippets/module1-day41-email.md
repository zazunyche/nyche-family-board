# AI Agents Day 41: Model Selection — Opus vs. Sonnet vs. Haiku

Day 41 of 50 | Mini-Module 2.3: Building an Agent from Scratch

---

## The Core Insight

Choosing a Claude model is an engineering decision, not just a cost decision. The question is never "how do I spend less?" — it's "what's the cheapest model that reliably gets this job done?" Those two questions lead to different answers.

If you always use the cheapest model, some tasks fail silently — the model gives you a plausible-sounding but wrong answer. If you always use the most powerful model, you pay 5–10x more than necessary for tasks any model could handle. The skill is learning to match task complexity to model capability.

---

## The 2026 Model Landscape

Here's where the tier system stands today:

```
CAPABILITY PYRAMID

  ┌─────────────────────────────────────┐
  │         Claude Fable 5              │  $10 / $50 per million tokens
  │         Most capable (GA)           │  1M context, 128K max output
  ├─────────────────────────────────────┤
  │         Claude Opus 4.8             │  $5 / $25 per million tokens
  │         Production powerhouse       │  1M context, 128K max output
  ├─────────────────────────────────────┤
  │         Claude Sonnet 4.6           │  $3 / $15 per million tokens
  │         The production workhorse    │  1M context, 64K max output
  ├─────────────────────────────────────┤
  │         Claude Haiku 4.5            │  $1 / $5 per million tokens
  │         Fast and lean               │  200K context, 64K max output
  └─────────────────────────────────────┘

  (Pricing: input / output per 1 million tokens)
```

Notice the pattern: each tier up approximately doubles the price, but the capability jump is not uniform. Haiku → Sonnet is a significant leap in reasoning quality. Sonnet → Opus buys you more for hard multi-step problems. Opus → Fable 5 is for the most demanding agentic work where you need the absolute frontier.

For most business applications — and for Earnventory — Haiku, Sonnet, and Opus are the three tiers you'll be making real decisions about.

---

## The Three Dimensions

Every model selection decision involves three variables:

**1. Intelligence** — Can this model reliably complete the task? This is binary at the extremes: Haiku will fail at tasks that require nuanced judgment; Opus will succeed at tasks Haiku cannot. In the middle, Sonnet handles most things well but may miss edge cases that Opus catches.

**2. Cost** — What does this task cost at scale? A $0.001 task run once doesn't matter. A $0.001 task run 50,000 times costs $50. The math compounds fast in production systems.

**3. Latency** — How quickly does this need to respond? Haiku is fastest. Opus takes longer because it does more thinking. If you're generating a real-time response for a user, latency matters. If you're running a nightly batch job, it doesn't.

---

## What Each Tier Is Actually For

### Haiku 4.5 — The Assembly Line Worker

Haiku is built for volume. It's fast, cheap, and reliable for tasks with a clear right answer.

**Good fits:**
- Classifying records into categories (paid / unpaid, urgent / routine, domestic / international)
- Extracting structured fields from documents (invoice number, date, amount, vendor name)
- Simple yes/no decisions with well-defined rules
- Generating short, templated text (subject lines, SMS notifications, brief labels)
- Running checks on every item in a large dataset

**Earnventory example:** You have 8,000 purchase orders from the past year. You want to flag every one where the payment terms are "Net 90" or longer — a risk indicator for supplier dependency. Haiku can process that entire dataset overnight for about $0.40. If you used Sonnet, the same job would cost $1.20. Small difference in isolation, but if you run this check weekly, Haiku just saved you $40/month.

### Sonnet 4.6 — The Senior Engineer

Sonnet is the right model for most production work. It has real reasoning ability, handles ambiguity well, and costs about one-third of Opus.

**Good fits:**
- Drafting emails and business correspondence that require judgment and tone
- Summarizing documents and extracting non-obvious insights
- Multi-step reasoning with 2–5 steps
- Code generation and debugging
- Customer-facing responses that need to sound professional

**Earnventory example:** A supplier emails you about a delivery delay. You want to automatically draft a response that acknowledges the delay, asks for the revised delivery date, and escalates to your warehouse team if the delay is more than 14 days. Sonnet handles this comfortably — it understands context, applies business logic, and writes naturally. Haiku might miss the conditional escalation or produce stilted text.

### Opus 4.8 — The Specialist Consultant

Opus is for problems where getting it wrong has real cost. It's slower and more expensive, but it catches things other models miss.

**Good fits:**
- Complex multi-step reasoning with many dependencies
- Analyzing large documents for legal, financial, or contractual risk
- Strategic analysis requiring synthesis across many sources
- Tasks where Sonnet keeps giving slightly-wrong answers
- Agentic loops where the model makes decisions with real consequences

**Earnventory example:** You want to audit your top 20 supplier contracts for clauses that expose you to price escalation risk. Each contract is 40–80 pages. You need the model to read each one, identify relevant clauses, assess risk level, and produce a ranked list with quoted evidence. This is exactly the kind of task where Sonnet will occasionally miss a nested clause or misread a conditional provision. Opus pays for itself by being right.

### Fable 5 — The Principal Architect

Fable 5 is Anthropic's most capable widely released model, designed for the most demanding long-horizon agentic work. It has always-on extended thinking (you can't turn it off) and costs twice what Opus costs.

You won't need Fable 5 often. Use it when you're building an agent that needs to manage a multi-week project, reason across thousands of documents simultaneously, or make high-stakes autonomous decisions. For Earnventory in its current form, Opus is probably the ceiling.

---

## The Fine-Grained Control: Effort Level

Within any model, you have a second lever: the `effort` parameter. This controls how much extended thinking the model applies before it answers.

```
effort levels: low → medium → high → xhigh → max
```

Effort levels are available on Claude Fable 5 and Opus 4.8. The practical implication: sometimes a task isn't quite right for Sonnet but also doesn't need full Opus horsepower. Setting `effort: high` on Sonnet can close a lot of that gap at Sonnet prices. Similarly, `effort: xhigh` on Opus gets you closer to Fable 5 behavior without paying Fable 5 prices.

The mental model: effort is like turning up the thermostat on reasoning. Higher effort = more thinking time = more thorough answer = higher latency and (on Fable 5) higher cost. On Opus 4.8 and below, effort does not increase per-token cost — it only increases latency.

---

## The Math at Scale

Here's what model choice looks like in concrete dollars for an Earnventory scenario:

**Scenario:** Every night, your agent processes 500 incoming documents (invoices, POs, shipping notices). For each document, it:
1. Classifies the document type (~200 input tokens, ~50 output tokens)
2. Extracts 8 structured fields (~500 input tokens, ~200 output tokens)
3. Drafts a follow-up action or flags for review (~800 input tokens, ~300 output tokens)

```
MONTHLY COST COMPARISON (500 docs/night × 30 days = 15,000 docs)

Step 1 — Classification (~250 tokens avg):
  Haiku:  15,000 × 0.000250 × $1.00 = $0.004/month
  Sonnet: 15,000 × 0.000250 × $3.00 = $0.011/month

Step 2 — Extraction (~700 tokens avg):
  Haiku:  15,000 × 0.000700 × $1.00 = $0.011/month
  Sonnet: 15,000 × 0.000700 × $3.00 = $0.032/month

Step 3 — Action drafting (~1,100 tokens avg):
  Sonnet: 15,000 × 0.001100 × $3.00 = $0.050/month
  Opus:   15,000 × 0.001100 × $5.00 = $0.083/month

OPTIMAL ROUTING (Haiku for steps 1–2, Sonnet for step 3):
  Total: ~$0.065/month

USING OPUS FOR EVERYTHING:
  Total: ~$0.249/month

SAVINGS: ~$0.184/month — not dramatic in isolation, but if you scale to
         5,000 docs/night (a realistic growing business), that's $1.84/month
         vs. $2.49/month. Real savings emerge when you hit 50,000+ docs/night.
```

The takeaway: at Earnventory's current scale, the dollar differences are modest. The habit of routing tasks to the right tier pays off as volume grows, and it builds the right engineering instincts from day one.

---

## How to Implement Tier Routing in Practice

In your agent code, model selection is just a variable:

```python
import anthropic

client = anthropic.Anthropic()

# Route based on task complexity
def classify_document(text: str) -> str:
    response = client.messages.create(
        model="claude-haiku-4-5",        # Cheap, fast, good enough
        max_tokens=100,
        messages=[{"role": "user", "content": f"Classify this document as one of: invoice, purchase_order, shipping_notice, other.\n\n{text}"}]
    )
    return response.content[0].text

def draft_supplier_response(context: str) -> str:
    response = client.messages.create(
        model="claude-sonnet-4-6",        # Judgment required
        max_tokens=500,
        messages=[{"role": "user", "content": f"Draft a professional response to this supplier situation:\n\n{context}"}]
    )
    return response.content[0].text

def analyze_contract_risk(contract_text: str) -> str:
    response = client.messages.create(
        model="claude-opus-4-8",          # High-stakes analysis
        max_tokens=2000,
        thinking={"type": "adaptive"},    # Let it think hard
        messages=[{"role": "user", "content": f"Analyze this contract for price escalation and dependency risk:\n\n{contract_text}"}]
    )
    return response.content[0].text
```

Each function chooses the appropriate model for its task complexity. The agent that calls these functions doesn't need to know about pricing — the routing logic is in the function definition.

---

## The Decision Framework

When you're deciding which model to use for a task, ask these four questions in order:

1. **Can Haiku get this right consistently?** If yes, use Haiku.
2. **Does this require judgment, tone, or nuanced reasoning?** If yes, start with Sonnet.
3. **Will errors have real cost (financial, legal, reputational)?** If yes, consider Opus.
4. **Is this a long-horizon agentic task with many interdependent decisions?** If yes, Opus or Fable 5.

The key word is "consistently." It's not whether Haiku can get it right once — it's whether Haiku gets it right 99% of the time at volume. Test your task against each tier. The cheapest tier that passes your quality bar is the right answer.

---

## Free Resources

**1. Anthropic Model Comparison Overview**
Anthropic's official model selection guide — explains the capability differences, recommended use cases, and context window limits for each current model.
URL: https://docs.anthropic.com/en/docs/about-claude/models

**2. Prompt Engineering Guide: Cost and Latency**
Part of Anthropic's prompt engineering documentation that covers how to think about cost-performance tradeoffs, including when extended thinking (effort levels) changes the calculus.
URL: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview

---

## What's Coming Tomorrow

**Day 42: Structured outputs and strict tool use**

Today you learned to choose the right model for a task. Tomorrow you'll learn how to make that model return exactly the data format your code needs — not free-form text, but valid JSON that maps directly to your data structures. This is what makes an agent's output actually usable in a larger system.

---

*Day 41 of 50 | AI Agents for Business Leaders | Nyche Family Learning Program*
