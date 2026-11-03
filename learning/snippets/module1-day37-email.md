# AI Agents Day 37: Writing a System Prompt That Actually Works

**Day 37 of 50 | Mini-Module 2.3: Building an Agent from Scratch**

---

## The Problem With "Be Helpful"

Yesterday you made your first API call to Claude: four parameters, one response object, a clean stateless round-trip. The call itself is trivial. What you put into the `system` parameter is where the real engineering happens.

Most people treat the system prompt as a greeting. They write "You are a helpful assistant" and move on. This is the equivalent of hiring someone, handing them a business card that says "Employee," and expecting them to know their job, their constraints, their reporting authority, and how to format their deliverables.

A system prompt is not a greeting. It is runtime configuration.

The difference between a system prompt that works and one that doesn't is larger than the difference between Haiku and Opus for most tasks. You can take a mediocre model and give it a precise, well-structured system prompt and get production-quality output. You can take the smartest model and give it a vague one-liner and get a chatbot that guesses at its job every turn.

Today you'll learn exactly what makes the difference — and see it in a side-by-side comparison built around Earnventory.

---

## What Is a System Prompt, Really?

When you call the Claude API, your input has two conceptual layers:

- **System** — who Claude is, what it knows, what it can do, how it behaves
- **Messages** — the conversation: user inputs, assistant outputs, tool results

The system prompt runs before any message in the conversation. It sets up the model's operating environment for the entire session — like environment variables at the OS level, or the `__init__` method of a class. Every token Claude generates is conditioned on it.

```
┌─────────────────────────────────────────────────────┐
│                 CLAUDE API REQUEST                  │
│                                                     │
│  system: [your configuration]  ← persistent anchor │
│                                                     │
│  messages: [                                        │
│    { role: "user",      content: "..." },           │
│    { role: "assistant", content: "..." },           │
│    { role: "tool",      content: "..." },           │
│  ]                              ← conversation      │
└─────────────────────────────────────────────────────┘
```

This matters for three architectural reasons:

**1. It's persistent.** Unlike messages that come and go, the system prompt anchors every response in the session. Claude doesn't forget it mid-conversation.

**2. It has higher conceptual authority.** The model treats the system prompt as its operating specification. User messages can ask Claude to deviate from it, but a well-written system prompt defines constraints that Claude actively maintains.

**3. It's where you spend your engineering time.** The API call itself takes an hour to learn. The system prompt takes weeks to get right — and that's appropriate, because it's where the behavior lives.

---

## The Four Elements of a Strong System Prompt

Every strong system prompt has four components. Weak ones are missing at least two.

### 1. Precise Role Definition

Not "helpful assistant." A specific role with explicit scope: what decisions this agent makes, what domain it works in, what its primary output is.

**Weak:**
```
You are a helpful assistant.
```

**Strong:**
```
You are an inventory reorder analyst for Earnventory, a B2B wholesale 
platform. Your primary function is to analyze current stock levels, 
identify SKUs that will hit zero inventory within 14 days at current 
demand velocity, and recommend reorder quantities that achieve a 30-day 
safety stock buffer.
```

The weak version tells Claude nothing about what job it's doing. The strong version tells it: (a) the business context, (b) the specific analytical task, (c) the decision criteria (14-day threshold), and (d) the optimization target (30-day buffer). Claude now has a complete mental model of its job. Its first response will look completely different.

### 2. Explicit Constraints

This is the element most people skip — and it's the one that makes an agent safe to deploy.

Constraints are not limitations on capability. They are the rules that define what the agent is allowed to do autonomously versus what it must escalate. Without them, an agent optimizing for "be helpful" will make decisions that seem locally reasonable but are organizationally unacceptable.

**No constraints:**
Claude recommends a $200,000 purchase order because that's what the math says. It's correct. It's also a catastrophic business decision to execute without a VP sign-off.

**With constraints:**
```
CONSTRAINTS:
- Never recommend a purchase order exceeding $50,000 without setting 
  requires_human_review: true and flagging the reason explicitly.
- If inventory data is older than 4 hours, set confidence: "low" 
  regardless of calculation quality — note the data timestamp.
- Do not suggest contacting suppliers directly. Output purchase order 
  drafts only; a human initiates all supplier communication.
- If demand velocity cannot be calculated (fewer than 7 days of history), 
  set action: "escalate" and describe what data is missing.
```

Notice that the last constraint creates a graceful degradation path: instead of Claude guessing when it lacks sufficient data, it escalates with a clear explanation. This is the difference between an agent that fails silently and one that fails transparently.

### 3. Strict Output Format

LLMs are probabilistic. Without explicit format instructions, output structure varies from call to call. Sometimes that's fine — for prose summaries, variation is acceptable. For any application code that parses Claude's output, variation is a bug.

**No format specification:**
```
Based on my analysis, I'd recommend ordering approximately 150 units 
of SKU-4421. The current stock of 23 units is likely to run out in 
about 8-10 days given the recent demand pattern, so a reorder makes 
sense soon.
```

Your application code now has to parse natural language. This is fragile, expensive, and wrong.

**With format specification:**
```
OUTPUT FORMAT (strict JSON, no surrounding text or markdown):
{
  "action": "reorder" | "hold" | "escalate",
  "sku": "<string>",
  "current_stock": <integer>,
  "days_to_stockout": <number>,
  "recommended_quantity": <integer>,
  "estimated_cost_usd": <number>,
  "reason": "<1-2 sentences>",
  "confidence": "high" | "medium" | "low",
  "requires_human_review": <boolean>
}
```

Now `json.loads(response.content[0].text)` works reliably. Your application gets a typed dict every time. The downstream code that routes high-value orders to a manager approval queue can read `requires_human_review` without regex or NLP.

One practical addition: include "no surrounding text or markdown" in the instruction. Without it, Claude will sometimes wrap the JSON in triple backticks or precede it with "Here is the analysis:" — both of which break `json.loads`.

### 4. Runtime Context Injection

Static information that doesn't change goes in the system prompt body. Dynamic information — things that are different every time the agent runs — gets injected at call time via template substitution.

The model has no access to the real world at runtime. It cannot check what day it is. It cannot look up the warehouse location. It cannot know the current user's role or permissions. You have to tell it.

**No context injection:**
```
You are an inventory analyst for Earnventory.
```

Claude doesn't know what date "this week" refers to. It doesn't know which warehouse it's analyzing. It doesn't know whether the user has authority to approve large orders.

**With context injection:**
```python
system_template = """You are an inventory reorder analyst for Earnventory.

CURRENT CONTEXT:
- Today's date: {current_date}
- Warehouse: {warehouse_name} ({warehouse_location})
- Analyst: {user_name} (Role: {user_role})
- Data as of: {data_timestamp}
- Base currency: USD

[...rest of system prompt...]"""

system = system_template.format(
    current_date=date.today().isoformat(),
    warehouse_name=user.warehouse.name,
    warehouse_location=user.warehouse.location,
    user_name=user.full_name,
    user_role=user.role,
    data_timestamp=last_sync.isoformat()
)
```

The model now has everything it needs to reason accurately. "Data as of" lets Claude apply the staleness constraint from element 2 correctly. The user's role lets Claude calibrate which decisions to escalate — a warehouse manager and a CFO have different authority levels.

---

## Before and After: The Complete Comparison

Here's the full system prompt comparison for an Earnventory reorder analyst. Same model, same user message, completely different output quality.

**BEFORE (weak):**
```
system = "You are a helpful inventory assistant. Help users with their inventory questions."
```

Call it with "Check SKU-4421." You get:

```
Sure! To check SKU-4421, you'd typically look at your inventory 
management system. Based on what you've shared, you may want to 
consider reordering if stock is low. Would you like me to help 
you think through the reorder decision?
```

No action. No data. No format. No useful signal. And notice: it's asking *you* to think through the decision — the assistant outsourced the task back to the user.

**AFTER (strong):**

```
system = """You are an inventory reorder analyst for Earnventory, a B2B 
wholesale platform. Analyze current stock levels, identify SKUs 
approaching stockout within 14 days, and recommend reorder quantities 
targeting a 30-day safety stock buffer.

CONSTRAINTS:
- Never recommend orders over $50,000 without requires_human_review: true
- If data is older than 4 hours, set confidence: "low"
- Draft purchase orders only — do not suggest direct supplier contact
- If demand history is under 7 days, set action: "escalate"

CURRENT CONTEXT:
- Today: 2026-07-29
- Warehouse: Atlanta DC (Atlanta, GA)
- Analyst: Emmanuel Nyche (Role: Buyer)
- Data as of: 2026-07-29T06:00:00Z

OUTPUT (strict JSON, no surrounding text):
{
  "action": "reorder" | "hold" | "escalate",
  "sku": "<string>",
  "current_stock": <integer>,
  "days_to_stockout": <number>,
  "recommended_quantity": <integer>,
  "estimated_cost_usd": <number>,
  "reason": "<1-2 sentences>",
  "confidence": "high" | "medium" | "low",
  "requires_human_review": <boolean>
}"""
```

Same call with "Check SKU-4421 — current stock is 23 units, average daily demand 4.1 units, unit cost $18.50":

```json
{
  "action": "reorder",
  "sku": "SKU-4421",
  "current_stock": 23,
  "days_to_stockout": 5.6,
  "recommended_quantity": 150,
  "estimated_cost_usd": 2775.00,
  "reason": "Current stock of 23 units will be exhausted in ~5.6 days at 4.1 units/day. Ordering 150 units achieves 36.6 days of safety stock at the Atlanta DC.",
  "confidence": "high",
  "requires_human_review": false
}
```

Now your application can check `days_to_stockout < 7` to triage urgency, route `requires_human_review: true` to a manager queue, and feed `recommended_quantity` into your PO drafting workflow. The downstream code is clean because the upstream format is clean.

---

## The Architecture View

Connecting this to the API call from Day 36:

```python
import anthropic
import json
from datetime import date

client = anthropic.Anthropic()

def analyze_sku(sku: str, stock_data: str) -> dict:
    system = build_system_prompt(   # ← this is where today's work lives
        current_date=date.today().isoformat(),
        warehouse_name="Atlanta DC",
        user_name="Emmanuel Nyche",
        user_role="Buyer"
    )

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        system=system,              # ← your four-element specification
        messages=[
            {"role": "user", "content": f"Check {sku}: {stock_data}"}
        ]
    )

    if response.stop_reason == "max_tokens":
        raise ValueError("Response truncated — increase max_tokens")

    return json.loads(response.content[0].text)
```

The API call is 10 lines. `build_system_prompt()` is where you spend your engineering time — constructing the role definition, constraints, context injection, and output format. The ratio of effort will feel backward at first: the "important" API call is trivial; the "just a string" system prompt takes hours. That ratio is correct.

---

## How Zazu's System Prompt Is Built

You interact with Zazu daily, so you've seen what a well-engineered system prompt produces in practice. Zazu's system prompt includes:

**Role:** "You are Zazu, the Nyche family AI house manager." Not "helpful assistant" — a specific role with a specific household context.

**Constraints:** Zazu doesn't send email to people outside an allowlist without confirmation. It doesn't take irreversible actions (deleting calendar events, sending external messages) without flagging. These constraints run silently every time you interact with Zazu.

**Context injection:** Today's date, the current family members present, the day's schedule, recent memory — all injected at runtime from the MEMORY.md system and session state.

**Output format:** Different formats for different task types. Conversational replies are prose. Task output is structured. Digest emails have a defined template.

The reason Zazu feels consistent is because the system prompt is tight. When you notice Zazu behaving unexpectedly, the root cause is almost always in the system prompt: a constraint that wasn't specified, a context variable that wasn't injected, a role definition that left room for ambiguity.

---

## Common System Prompt Mistakes

**1. Burying constraints in prose**

"You are helpful and knowledgeable and should always do your best to assist users with inventory decisions, but if an order seems very large you might want to flag it for review."

Claude parses this as an emphasis on helpfulness. The constraint is soft and buried. It might apply the review flag, it might not. Use a `CONSTRAINTS:` header with a numbered or bulleted list.

**2. Relative time references**

"Check invoices from the last 7 days." The model cannot determine what "the last 7 days" means without knowing today's date. Inject `{current_date}` and say "Check invoices from {seven_days_ago} to {current_date}."

**3. Describing format instead of showing it**

"Respond in JSON format with an action field and a reason." This is ambiguous: what are the allowed values for action? Is reason a string or an object? Show the exact schema with example values for each field.

**4. No explicit escalation path**

If you don't specify what to do for edge cases, Claude will make a decision — and it might be wrong, confident, and hard to catch. Add a catch-all: "If you are uncertain about any input parameter, set action: 'escalate' and describe what information is missing in the reason field."

**5. Static context**

"The warehouse is in Atlanta." What if the user's warehouse changes? What if you're building for multiple warehouses? Anything that changes based on who's asking or when they're asking should be injected at runtime, not hardcoded.

---

## A Diagnostic Heuristic

When an agent produces wrong or unexpected output, ask these four questions in order:

```
1. Is the ROLE definition precise enough?
   → Too vague = Claude guesses its job

2. Are the CONSTRAINTS explicit enough?  
   → Missing = Claude makes unconstrained decisions

3. Is the OUTPUT FORMAT specified?
   → Unspecified = structure varies per call

4. Is the CONTEXT complete?
   → Missing variables = Claude reasons from wrong assumptions
```

The answer is almost always one of those four. If you've checked all four and the output is still wrong, the issue is more subtle: competing instructions, ambiguous constraint boundaries, or the model's prior training pulling against your specification. Those cases are Day 38 territory.

---

## Free Resources

1. **Anthropic's prompt engineering guide** — the canonical reference for Claude-specific techniques, including system prompt structure, role definition, and output formatting: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview

2. **"Be Clear, Direct, and Detailed"** — Anthropic's core guidance on writing effective prompts, with worked examples of weak-to-strong transformations: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/be-clear-and-direct

---

## Tomorrow

Day 38 is the prompt engineering toolkit: XML tags for structure, few-shot examples for consistency, and explicit output format instructions. Today you learned *what* goes in a system prompt. Tomorrow you'll learn *how* to structure it so Claude parses it reliably — and why those techniques work mechanistically, not just as cargo-cult best practices.

---

*Day 37 of 50 | Mini-Module 2.3: Building an Agent from Scratch | AI Agents Curriculum — Designed by Abeiku for Dad*
