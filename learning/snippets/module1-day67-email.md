# AI Agents Day 67: Designing Tools Claude Can Actually Use

**Module 2, Mini-Module 2.1 — Tools and Function Calling | Day 67 of the Nyche AI Curriculum**

---

## Where We Are

Yesterday established the foundational mechanic: Claude never executes anything. It outputs a `tool_use` block — a structured text description of what it wants to do — and your application does the actual work. That boundary is the architecture.

Today goes one level deeper: if Claude's behavior is driven by reading your tool description, then the quality of your tool description *is* the quality of your agent's judgment. This is one of the most underappreciated insights in applied agent development. Engineers spend hours tuning prompts and selecting models, then define tools in five words and wonder why the agent makes wrong calls.

The tool description is not documentation. It is an instruction to the model. Everything Claude knows about when to use a tool, what to put in it, and when *not* to use it comes entirely from what you write in that description field.

---

## How Claude Picks a Tool

When Claude is mid-task and needs external information or action, it does not try each tool to see what happens. It reads the list of tool definitions you have provided — names, descriptions, and parameter schemas — and selects the one that best matches what it needs to do next.

This selection is driven by the same next-token prediction mechanism underlying everything else Claude does. The model generates a `tool_use` block by predicting, given the conversation so far plus the tool definitions, what structured output is most likely correct. Descriptions that are precise, relevant, and unambiguous push the probability distribution toward correct selection. Descriptions that are vague, overlapping, or missing context produce wrong selections.

There is no error-checking at this stage. Claude does not look up whether a tool exists or what it actually does. It reads what you told it and acts on that.

```
Tool Definitions (what you write)
        |
        v
Claude reads descriptions at each turn
        |
        v
Selects best-matching tool based on
current task + description text
        |
        v
Outputs tool_use block with name + inputs
        |
        v
Your app executes, returns tool_result
        |
        v
Claude reads result, continues reasoning
```

The selection step — the second box — is entirely dependent on description quality. Everything downstream of it inherits whatever errors are introduced there.

---

## The Anatomy of a Tool Definition

A Claude tool definition has three components. All three affect behavior.

**`name`** — The identifier Claude uses in the `tool_use` block. This should be a precise, readable verb-noun phrase. Claude also uses the name as a cue about the tool's purpose, so `get_inventory_level` gives more signal than `gi` or `getData`. Keep it snake_case, keep it specific.

**`description`** — The primary behavioral instruction. This is where you tell Claude what the tool does, when to use it, and when not to. This field is read at every turn where Claude might call a tool. It should be a paragraph of 2–5 sentences, not a single line. More on structure below.

**`input_schema`** — A JSON Schema object defining the parameters the tool accepts. Each parameter gets its own description, which Claude reads when deciding what value to put in. The parameter descriptions are just as important as the top-level tool description.

Here is what a complete, well-formed tool definition looks like:

```json
{
  "name": "get_inventory_level",
  "description": "Returns the current stock count and reorder threshold for a single Earnventory SKU. Use this when you need to determine whether a product is approaching or below its reorder point before generating a purchase order recommendation. Do not use for bulk queries across multiple SKUs — call this once per SKU and aggregate results yourself. Returns null for unknown SKUs.",
  "input_schema": {
    "type": "object",
    "properties": {
      "sku_id": {
        "type": "string",
        "description": "The Earnventory SKU identifier, e.g. 'SKU-482'. Must be an exact match — no partial strings or wildcards."
      }
    },
    "required": ["sku_id"]
  }
}
```

Notice what the description does: it states the purpose, specifies the trigger condition, gives a negative constraint (don't use for bulk), and documents the edge case (null for unknowns). The parameter description adds a usage note that prevents a common input error (partial strings).

---

## Weak vs. Strong: A Direct Comparison

The difference between a weak and strong tool description is not stylistic. It is functional. Here are two descriptions for the same Earnventory tool.

**Weak:**
```json
{
  "name": "check_stock",
  "description": "Checks stock levels.",
  "input_schema": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "description": "The ID."
      }
    },
    "required": ["id"]
  }
}
```

**Strong:**
```json
{
  "name": "get_inventory_level",
  "description": "Returns current stock count and reorder threshold for a single Earnventory SKU. Call this before deciding whether to generate a purchase order for a product. Use one call per SKU. If the SKU is unknown, the tool returns null — treat this as a data error, not a zero-stock result.",
  "input_schema": {
    "type": "object",
    "properties": {
      "sku_id": {
        "type": "string",
        "description": "Exact Earnventory SKU identifier in the format 'SKU-NNN'. Do not pass product names, partial IDs, or warehouse codes."
      }
    },
    "required": ["sku_id"]
  }
}
```

The weak version will cause three predictable failures: Claude may call it at the wrong time (it doesn't know when), may pass the wrong value for `id` (it doesn't know the format), and may misinterpret a null return (it doesn't know what null means here). None of these are model failures. They are description failures. The model is doing exactly what you told it.

---

## The Five Failure Modes of Bad Tool Descriptions

**1. Vague trigger conditions.** When the description doesn't say when to call the tool, Claude infers from the name alone. A tool called `get_data` might be called for anything. Fix: write an explicit trigger sentence — "Call this when..." or "Use this to determine whether..."

**2. Overlapping scope between tools.** If you have `get_invoice` and `get_billing_record` and neither description distinguishes them, Claude will pick between them somewhat randomly. When two tools do similar things, the description must state the exact distinction: "Use `get_invoice` for supplier invoices from the past 90 days. Use `get_billing_record` for customer-facing transactions and historical data beyond 90 days."

**3. Ambiguous parameter formats.** If `sku_id` could be `"SKU-482"`, `"482"`, or `"earnventory/sku/482"` and you don't say, Claude will guess. Always specify the exact expected format in the parameter description, and give an example.

**4. Missing edge case documentation.** What does the tool return when a record doesn't exist? When the API times out? When the input is malformed? If you don't document it, Claude will treat unexpected results as ambiguous and may hallucinate an interpretation. Document the edge cases explicitly in the tool description.

**5. Undersized descriptions.** One-sentence descriptions are almost always insufficient. A paragraph of 3–4 sentences — trigger condition, scope, exclusions, edge cases — is the baseline for a tool Claude will use reliably.

---

## Applied to Earnventory: A Practical Tool Set

Imagine an Earnventory agent that monitors supplier pricing, checks current inventory, and drafts reorder recommendations. Here are three tools with descriptions calibrated for reliability:

```
get_inventory_level(sku_id)
  "Returns stock count and reorder threshold for one SKU.
   Call before deciding whether to recommend a reorder.
   Returns null for unknown SKUs — log and skip, don't treat as zero."

get_supplier_price(sku_id, supplier_id)
  "Returns the current unit price from a specific supplier for a SKU.
   Use when you have already identified the SKU needs reordering and
   need to compare supplier costs. Requires both identifiers — do not
   pass only one. Returns the most recent confirmed price, not a quote."

list_low_stock_skus(threshold_multiplier)
  "Returns all SKUs currently at or below threshold_multiplier × their
   reorder point. Use at the start of a reorder analysis run, not for
   individual SKU checks. threshold_multiplier defaults to 1.0 (at or
   below threshold). Pass 1.2 to catch SKUs approaching threshold."
```

With these three tools, Claude has enough information to: (a) identify what's low-stock, (b) look up supplier pricing for each, (c) decide whether a reorder is warranted, and (d) draft a recommendation. The descriptions eliminate the main failure modes for each tool. That's what good tool design buys you — reliability, not magic.

---

## The Minimal Surface Principle (Preview)

One thing to note before we go further into the toolset: the best tool set is the smallest one that enables the task. Each additional tool adds scope for wrong selection, especially when tools overlap. If you can combine two tools without losing precision, do it. If you add a tool for every possible action, you create a decision space so large that even good descriptions produce occasional wrong calls.

This is the minimal tool surface principle, and it has a security dimension too — more on that in Day 70 (trust, permissions, and prompt injection). For now: define only the tools the agent needs for this task, defined as precisely as you can.

---

## What This Looks Like in Code

In the Anthropic Python SDK, tools are passed as a list of dictionaries to the `tools` parameter:

```python
import anthropic

client = anthropic.Anthropic()

tools = [
    {
        "name": "get_inventory_level",
        "description": (
            "Returns current stock count and reorder threshold for a single "
            "Earnventory SKU. Call before deciding whether to generate a "
            "purchase order. Returns null for unknown SKUs — treat as a data "
            "error, not zero stock."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_id": {
                    "type": "string",
                    "description": "Exact SKU identifier, e.g. 'SKU-482'."
                }
            },
            "required": ["sku_id"]
        }
    }
]

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    tools=tools,
    messages=[
        {"role": "user", "content": "Is SKU-482 running low?"}
    ]
)
```

Claude will read the tool description at inference time and decide whether to call it. If the description is good, the right call happens. If not, Claude guesses — and may guess wrong.

---

## Summary

| Component | What Claude uses it for | Common mistake |
|-----------|------------------------|----------------|
| `name` | Identifies the tool in tool_use output | Too generic (`get_data`) |
| `description` | Decides when and whether to call | Too short, no trigger condition |
| Parameter `description` | Determines what value to pass | Missing format examples |
| Edge case documentation | Interprets unusual return values | Undocumented null/error cases |

The throughline: Claude is reading, not running. Every behavioral decision comes from text you write. Good tool descriptions are not courtesy to a reader — they are instructions to the model.

---

## Resources

- **Anthropic tool use documentation — defining tools:** https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview — the official reference for tool definition format, including input_schema structure and best practices
- **"Writing effective tool descriptions" — Anthropic engineering blog:** https://www.anthropic.com/engineering/writing-tools-for-agents — deeper treatment of description structure, failure mode taxonomy, and reliability testing approaches

---

*Day 68 covers client-side vs. server-side tools — the architecture distinction between tools your code executes and tools Anthropic's infrastructure executes, and why it matters for trust, cost, and capability.*
