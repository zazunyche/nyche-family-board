# AI Agents Day 38: XML, Few-Shot, and the Prompt Engineering Toolkit

**Day 38 of 50 | Mini-Module 2.3: Building an Agent from Scratch**

---

## Why "Write Better Prompts" Is Bad Advice

Yesterday you built the four-element system prompt: role, constraints, output format, and runtime context injection. You saw the before-and-after — same model, same API call, completely different behavior.

But "write a better prompt" is where most guidance stops, and it's not specific enough to be useful. If your agent is returning malformed JSON on 15% of calls, "try to be clearer" doesn't help you. You need techniques with known mechanisms.

Today is about the three structural tools that actually change what Claude does — and more importantly, *why* they work at the token-generation level. These aren't superstitions or cargo-cult best practices. They map directly to how the model processes and generates text.

The toolkit:
1. **XML tags** — for structure and section disambiguation
2. **Few-shot examples** — for distribution anchoring
3. **Explicit schema, not description** — for deterministic output format

Each one is a different kind of constraint on the model's probability distribution. Let's go through them.

---

## Tool 1: XML Tags

### What They Are

XML tags in prompts look like this:

```
<instructions>
  Analyze inventory levels for the given SKU.
  Flag any stock expected to run out within 14 days.
</instructions>

<constraints>
  - Never recommend orders over $50,000 without flagging for review.
  - If demand data is under 7 days, escalate rather than estimate.
</constraints>

<output_format>
  Return strict JSON. No surrounding text. Schema:
  {"action": "reorder"|"hold"|"escalate", "sku": string, ...}
</output_format>
```

### Why They Work

Claude's training corpus includes massive amounts of HTML, XML, Markdown, and structured documents. The model has learned, across billions of examples, that content between matching tags belongs to a coherent semantic unit — that a `<constraints>` block is a list of rules, that an `<examples>` block is illustrative, that `<output_format>` defines structure rather than describes a goal.

When you don't use tags, a long system prompt is a single undifferentiated stream of prose. Claude has to infer the purpose of each paragraph from context. That inference is usually correct, but "usually" is not what you want in a production agent. Tags eliminate the ambiguity.

Mechanistically: the attention mechanism in a transformer weighs token relationships across the entire context. Tags help because they create explicit anchors — the open tag and close tag become a structural frame that the model attends to as a unit. Content inside `<constraints>` gets attended to differently than content inside `<examples>`.

### How to Use Them in Practice

Structure your system prompt like a document, not a letter:

```
<role>
You are an inventory reorder analyst for Earnventory, a B2B wholesale
platform. Your function is to analyze stock levels and recommend
reorder quantities that achieve a 30-day safety buffer.
</role>

<constraints>
1. Never recommend orders over $50,000 without setting
   requires_human_review: true.
2. If demand history is under 7 days, set action: "escalate".
3. If data is over 4 hours old, set confidence: "low".
4. Do not suggest direct supplier contact. Draft POs only.
</constraints>

<output_format>
Strict JSON, no surrounding text or markdown:
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
</output_format>
```

Three rules for XML tag use:
- **Use consistent, semantic names** — `<constraints>` is better than `<rules>`, `<examples>` is better than `<demos>`. These names carry meaning from training.
- **Don't nest deeply** — one or two levels is fine; more than that starts to lose the structural clarity benefit.
- **Close every tag** — unclosed tags create ambiguity about where a section ends.

---

## Tool 2: Few-Shot Examples

### What They Are

Few-shot examples are input/output pairs embedded in your prompt that show the model exactly what you want — not described, demonstrated.

```
<examples>

<example>
<input>SKU: WIN-1042 | Stock: 8 units | Avg daily demand: 2.3 units | Unit cost: $24.00 | History: 14 days</input>
<output>{"action":"reorder","sku":"WIN-1042","current_stock":8,"days_to_stockout":3.5,"recommended_quantity":69,"estimated_cost_usd":1656.00,"reason":"Stock of 8 units exhausted in ~3.5 days at 2.3 units/day. 69 units achieves 30-day buffer.","confidence":"high","requires_human_review":false}</output>
</example>

<example>
<input>SKU: RIE-0083 | Stock: 112 units | Avg daily demand: 1.1 units | Unit cost: $18.50 | History: 4 days</input>
<output>{"action":"escalate","sku":"RIE-0083","current_stock":112,"days_to_stockout":null,"recommended_quantity":null,"estimated_cost_usd":null,"reason":"Demand history is only 4 days — insufficient for reliable velocity estimate. Provide at least 7 days of demand data.","confidence":"low","requires_human_review":true}</output>
</example>

<example>
<input>SKU: CAB-0021 | Stock: 240 units | Avg daily demand: 3.8 units | Unit cost: $12.75 | History: 21 days</input>
<output>{"action":"hold","sku":"CAB-0021","current_stock":240,"days_to_stockout":63.2,"recommended_quantity":0,"estimated_cost_usd":0,"reason":"Current stock covers 63 days at demand velocity. No reorder needed. Review at 30-day threshold.","confidence":"high","requires_human_review":false}</output>
</example>

</examples>
```

### Why They Work

This is where the mechanistic explanation is most interesting.

LLMs generate text by predicting: "given everything before this position, what token comes next?" That prediction is a probability distribution over the entire vocabulary. When you add few-shot examples to your prompt, you are conditioning that distribution — you are adding evidence about what "correct" output looks like in this specific context.

Think of it as Bayesian updating. Before the examples, the model has a prior: "JSON with this schema could look like many things." After three examples, the prior is updated: "JSON in this context looks like *exactly* this, with null fields rather than missing fields, with reason strings of this length and this pattern, with costs formatted as floats." The posterior distribution is sharply peaked around the demonstrated pattern.

This is why three examples reliably outperform a paragraph describing the format. Descriptions are indirect — the model has to translate your description into a behavioral pattern. Examples are direct evidence.

### The Three-Example Rule and What to Show

Three to five examples is the sweet spot for most tasks. More is rarely better; it consumes context and yields diminishing returns.

What to demonstrate in your examples:
- **The common case** — a normal input with a clean output
- **An edge case** — the "escalate" path, the error path, the low-confidence case
- **A boundary condition** — the case right at the constraint threshold (e.g., a $49,800 order that does *not* require human review, vs. a $50,100 order that does)

The boundary condition example is the most valuable. Without it, the model has to infer where your thresholds are from the constraint text alone, which introduces error. Showing it eliminates ambiguity.

### When Few-Shot Is Especially Valuable

- **Unusual output formats** — any format Claude wouldn't see often in training data
- **Domain-specific patterns** — Earnventory SKU codes, supplier IDs, internal terminology
- **Subtle behavioral distinctions** — the difference between "hold" and "escalate" that your constraints describe but examples make concrete
- **High-stakes consistency requirements** — when the application code downstream is parsing the output and variation causes exceptions

---

## Tool 3: Explicit Schema, Not Description

### The Failure Mode of Description

"Respond in JSON format with an action field, a reason, and a confidence score."

This is a description of an output. The model will comply — loosely. You might get:

```json
{ "action": "reorder", "reason": "Low stock detected", "confidence": 0.87 }
```

Or:

```json
{ "action": "REORDER", "reason_text": "Current inventory is below threshold", "confidence_level": "high" }
```

Or:

```json
{
  "recommendation": {
    "action": "reorder"
  },
  "reason": "...",
  "confidence": "High"
}
```

All three are technically JSON. All three have an action, a reason, and a confidence score. All three will break `response["action"]` in different ways.

### What Schema-First Looks Like

Show the exact structure. Every field. Every allowed value. Every type. Then add constraints about what is not allowed:

```
OUTPUT FORMAT — return this exact JSON structure, no surrounding text, no markdown:
{
  "action": "reorder" | "hold" | "escalate",
  "sku": "<string, e.g. 'WIN-1042'>",
  "current_stock": <integer>,
  "days_to_stockout": <number or null if action is 'hold'>,
  "recommended_quantity": <integer, 0 if action is 'hold' or 'escalate'>,
  "estimated_cost_usd": <float with 2 decimal places, 0.00 if action is 'hold' or 'escalate'>,
  "reason": "<1-2 sentences, present tense, specific to this SKU>",
  "confidence": "high" | "medium" | "low",
  "requires_human_review": <boolean>
}

Do not include any text before or after the JSON object. Do not use markdown code fences.
```

The two lines at the end — "no text before or after" and "no code fences" — address the two most common sources of parsing failures. Without them, Claude will frequently add "Here is the analysis:" before the JSON, or wrap it in triple backticks. Both of which cause `json.loads()` to throw.

---

## Putting the Toolkit Together

Here's what a complete, production-ready Earnventory system prompt looks like with all three tools applied:

```
<role>
You are an inventory reorder analyst for Earnventory, a B2B wholesale
platform. Analyze current stock levels and recommend reorders targeting
a 30-day safety stock buffer.
</role>

<context>
Today: {current_date}
Warehouse: {warehouse_name}
Data as of: {data_timestamp}
Analyst: {user_name} ({user_role})
</context>

<constraints>
1. Orders over $50,000: set requires_human_review: true.
2. Demand history under 7 days: set action: "escalate".
3. Data over 4 hours old: set confidence: "low".
4. Stock covering 30+ days: set action: "hold".
5. Unknown inputs: set action: "escalate", describe what is missing.
</constraints>

<examples>
<example>
<input>SKU: WIN-1042 | Stock: 8 | Daily demand: 2.3 | Cost: $24.00/unit | History: 14d</input>
<output>{"action":"reorder","sku":"WIN-1042","current_stock":8,"days_to_stockout":3.5,"recommended_quantity":69,"estimated_cost_usd":1656.00,"reason":"8 units exhausted in 3.5 days at current velocity. 69 units achieves 30-day buffer.","confidence":"high","requires_human_review":false}</output>
</example>
<example>
<input>SKU: RIE-0083 | Stock: 112 | Daily demand: 1.1 | Cost: $18.50/unit | History: 4d</input>
<output>{"action":"escalate","sku":"RIE-0083","current_stock":112,"days_to_stockout":null,"recommended_quantity":null,"estimated_cost_usd":null,"reason":"Only 4 days of demand history — insufficient for reliable velocity estimate. Provide 7+ days.","confidence":"low","requires_human_review":true}</output>
</example>
</examples>

<output_format>
Strict JSON only. No surrounding text. No markdown code fences.
{
  "action": "reorder" | "hold" | "escalate",
  "sku": "<string>",
  "current_stock": <integer>,
  "days_to_stockout": <number or null>,
  "recommended_quantity": <integer>,
  "estimated_cost_usd": <float, 2 decimal places>,
  "reason": "<1-2 sentences>",
  "confidence": "high" | "medium" | "low",
  "requires_human_review": <boolean>
}
</output_format>
```

Notice the layering:

```
XML tags      → tell Claude how to parse the prompt
Examples      → show Claude what correct output looks like
Schema        → eliminate ambiguity about field names, types, values
```

Each tool addresses a different failure mode. Together, they drive output consistency from "sometimes right" to "reliably right."

---

## How These Techniques Scale

One useful way to think about this: each technique constrains a different part of the model's generation process.

```
PROMPT ELEMENT        WHAT IT CONSTRAINS
─────────────────────────────────────────────────────────────
XML structure         How Claude parses and attends to the prompt
Few-shot examples     What patterns the output should match
Schema                Which field names and value types are valid
Role definition       What "job" the model is doing
Constraints           What decisions are within or outside scope
Context injection     What facts the model can assume are true
─────────────────────────────────────────────────────────────
```

Each element reduces variance. For a simple, low-stakes task — "summarize this email" — you need few of them. For a production agent making business decisions — "analyze this SKU and draft a purchase order" — you want all of them. The cost is prompt length (tokens); the benefit is reliability.

The one mistake to avoid: layering all six elements on a trivial task. A system prompt that treats "what day of the week is it?" with the same engineering rigor as "recommend a $200K purchase order" is wasted. Calibrate the toolkit to the stakes.

---

## Diagnostic Heuristic for Inconsistent Output

When you're getting inconsistent responses despite a detailed system prompt, run through this checklist:

```
1. Missing XML structure?
   → Long unstructured prose = Claude guessing section boundaries.
   Fix: wrap sections in semantic tags.

2. No examples?
   → Format described but not demonstrated.
   Fix: add 2-3 input/output pairs that cover normal, edge, and boundary cases.

3. Schema described, not shown?
   → "Return JSON with these fields" = field names vary.
   Fix: show the exact schema with allowed values for each field.

4. No explicit anti-patterns?
   → Missing "no markdown" / "no surrounding text" directives.
   Fix: state what you don't want as explicitly as what you do.

5. Template variables not injected?
   → {current_date} appearing as literal string instead of today's date.
   Fix: check your .format() / f-string substitution before the API call.
```

The first three are almost always the culprit.

---

## Free Resources

1. **Anthropic's prompt engineering guide — Use XML tags** — the canonical explanation of why XML structure works for Claude and how to apply it: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags

2. **Anthropic's guide on few-shot prompting** — when examples outperform instructions alone, how many to include, and what to show: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/multishot-prompting

---

## Tomorrow

Day 39 is where the prompt engineering you've built meets the runtime: building the agentic tool-use loop by hand. The sequence is `call → parse tool_use → execute → append tool_result → call again → until stop_reason: end_turn`. You'll see what each step looks like in code, and why the loop structure matters for multi-turn tool interactions. This is the mechanical core of everything an agent does.

---

*Day 38 of 50 | Mini-Module 2.3: Building an Agent from Scratch | AI Agents Curriculum — Designed by Abeiku for Dad*
