# AI Agents Day 21: Designing Tools Claude Can Actually Use

**Mini-Module 2.1 — Tools and Function Calling | Day 2 of 8**

---

Yesterday we traced the full mechanical sequence: Claude outputs a `tool_use` JSON block, your application executes it, you return a `tool_result`, Claude continues reasoning. The architecture is clean. The boundary is crisp.

Today we go to the place where most tool-using agents actually fail: **the description field**.

The description is what Claude reads to decide *whether* to call a tool, *when* to call it, and *how to fill in the parameters*. It is the primary interface between your intent as a developer and the model's decision-making. Get it wrong, and Claude will call the wrong tool at the wrong time with the wrong input — silently, without any error — and you will spend hours debugging behavior that looks random but is actually deterministic from the model's perspective.

---

## The Description Is Not Documentation. It Is Instruction.

Most developers think of the tool description the way they think of a docstring — something for humans to read later. This mental model is wrong, and it causes bad agent design.

The description is read by Claude at every single inference step where tools are available. It is part of the prompt. It consumes tokens. It shapes the model's probability distribution over which tool to call next.

Here is the same underlying function with two different descriptions:

**Weak:**
```
name: get_inventory
description: Get inventory information
parameters:
  - sku (string): Product ID
```

**Strong:**
```
name: get_inventory
description: Return current stock count and reorder threshold for a specific 
  Earnventory SKU. Use when the user asks about availability, stock levels, 
  or reorder status for a known product. Returns: quantity_on_hand (int), 
  reorder_threshold (int), warehouse_bin (string), last_updated (ISO 8601 
  timestamp). If the SKU is unknown, use search_products first to find it.
parameters:
  - sku (string, required): Earnventory product identifier, format ERN-XXXX-X, 
    e.g. "ERN-2241-B". Case-sensitive.
```

These are the same Python function underneath. The difference is entirely in what Claude knows about it. The weak version leaves Claude to infer: *What does "inventory information" mean? When should I use this? What will I get back? What if I only have a product name?* The strong version answers all of those questions before Claude has to ask them.

---

## Four Things Every Good Tool Description Does

Break down what makes a description effective and you get four distinct jobs it needs to do:

**1. Says precisely what it does**

Not "gets data" — *what* data, from where, in what shape. Claude uses this to predict what the tool will return so it can plan the next step *before* it calls the current one. If Claude knows `get_inventory` returns a `quantity_on_hand` field, it can reason: "I'll call this, check that field against the reorder threshold, and if it's below, call `draft_purchase_order` next." Without knowing the return shape, that forward planning is impossible.

**2. Says when to use it (and when not to)**

If you have multiple tools, Claude needs to know which one to pick for a given situation. The description should include disambiguation — explicit guidance about the adjacent cases where a different tool is correct.

> "Use when the user asks about stock levels for a **known** product. For searching by keyword, category, or partial name, use `search_products` instead."

That single sentence eliminates an entire class of wrong tool calls.

**3. Describes failure cases**

Tools fail. If Claude doesn't know what failure looks like and what to do about it, it will either hallucinate a recovery plan or get stuck. A good description includes: "Returns an error with `code: 'NOT_FOUND'` if the SKU does not exist in the catalog."

**4. Names parameters with intent**

Parameter names and descriptions are read at call time when Claude is constructing the input JSON. Descriptive names carry semantic weight — Claude has seen billions of lines of API documentation and code, and it has strong priors about what `q`, `id`, `sku`, `product_code`, and `search_query` mean respectively.

---

## ASCII Diagram: Where the Description Is Actually Read

```
API REQUEST (your application → Anthropic)
  |
  ├── messages: [conversation history]
  ├── system: "You are Zazu..."
  └── tools: [
        {
          name: "get_inventory",
          description: "...",    <── Claude reads this BEFORE deciding
          input_schema: {...}    <── Claude reads this to CONSTRUCT the call
        },
        { name: "search_products", description: "...", ... },
        { name: "draft_purchase_order", description: "...", ... }
      ]
          |
          v
     CLAUDE REASONS:
     "User asked about stock for ERN-2241-B.
      get_inventory handles known SKUs. ✓
      I have the SKU. ✓
      Calling with sku='ERN-2241-B'."
          |
          v
API RESPONSE (Anthropic → your application)
  └── content: [
        {
          type: "tool_use",
          name: "get_inventory",
          input: { "sku": "ERN-2241-B" }  <── Claude generated this
        }
      ]
```

The descriptions are part of the prompt. They consume tokens. They are not metadata — they are the mechanism.

---

## Parameter Naming Is Semantic

Parameter names are not just labels for your application. Claude reads them during generation. The name you choose sets a prior on what values are acceptable.

Compare these three names for the same string field:

| Parameter name | What Claude infers |
|---|---|
| `q` | A search query string (Google-style) |
| `id` | Some opaque identifier (ambiguous type/format) |
| `product_sku` | A stock-keeping unit in a product catalog |
| `earnventory_sku` | A SKU specifically in the Earnventory system |

`product_sku` and `q` produce different behavior from Claude even if both accept the same type. The name shapes what Claude considers a valid value.

The parameter description refines this further. When Claude is filling in the JSON, it reads the description:

```json
{
  "sku": {
    "type": "string",
    "description": "Earnventory SKU identifier. Format: ERN-XXXX-X where XXXX 
      is a 4-digit number and X is a letter suffix. Example: ERN-2241-B. 
      Case-sensitive. Do not include spaces."
  }
}
```

Now Claude knows the format, an example, and two constraints it might otherwise violate. This is not over-engineering — it is the difference between a tool that works and one that occasionally passes malformed input and fails with a cryptic error at 2am.

---

## A Complete Tool Definition: `draft_purchase_order`

Here is a fully designed tool definition for an Earnventory context. Notice every element is doing work:

```json
{
  "name": "draft_purchase_order",
  "description": "Create a draft purchase order for a supplier in Earnventory. 
    This does NOT send or submit the order — it creates a draft that must be 
    reviewed and submitted separately via submit_purchase_order. Use this when 
    the user wants to prepare an order, not when they want to send one. 
    Returns: draft_po_number (string), line_item_count (int), 
    estimated_total_usd (float), created_at (ISO 8601).",
  "input_schema": {
    "type": "object",
    "properties": {
      "supplier_id": {
        "type": "string",
        "description": "Earnventory supplier identifier (e.g. SUP-1042). 
          Use search_suppliers if you only have a supplier name."
      },
      "line_items": {
        "type": "array",
        "description": "Items to order. Minimum 1 item required.",
        "items": {
          "type": "object",
          "properties": {
            "sku": {
              "type": "string",
              "description": "Earnventory SKU of the item to order (ERN-XXXX-X format)."
            },
            "quantity": {
              "type": "integer",
              "description": "Number of units to order. Must be a positive integer."
            }
          },
          "required": ["sku", "quantity"]
        }
      },
      "requested_delivery_date": {
        "type": "string",
        "description": "Preferred delivery date in YYYY-MM-DD format. Optional. 
          If omitted, supplier's default lead time applies."
      },
      "notes": {
        "type": "string",
        "description": "Optional notes to include on the purchase order for 
          the supplier. Plain text, max 500 characters."
      }
    },
    "required": ["supplier_id", "line_items"]
  }
}
```

Notice the key design decisions embedded here:

- The description says "does NOT send" — this prevents Claude from using this tool when the user says "send an order." That goes to `submit_purchase_order`. The disambiguation is in the description.
- `supplier_id` description says what to do when you only have a name: use `search_suppliers` first. This enables multi-step chaining.
- `quantity` says "positive integer" — Claude won't accidentally pass 0 or a float.
- `requested_delivery_date` is clearly optional with a description of what happens if omitted.

Every sentence is load-bearing.

---

## The Single-Responsibility Principle for Tools

A recurring temptation in tool design is the multi-mode tool: one function with a `mode` parameter that handles different operations.

```
❌ manage_inventory(mode: "get" | "search" | "update" | "delete", ...)
```

The appeal is obvious — one function, fewer tools. The problem is that Claude now has to:
1. Know that `manage_inventory` exists
2. Infer which `mode` applies to the current situation
3. Provide the right parameters for that specific mode (which vary by mode)
4. Handle confusion between modes that seem similar

Versus four separate tools with precise descriptions — `get_inventory`, `search_products`, `update_stock`, `delete_sku` — where Claude reads each description and picks the right one. The parameters for each are relevant to exactly that operation. The description for each can be specific.

The token cost of more tools is real — each definition adds tokens to your context on every API call. For most applications (5–15 tools), this cost is negligible compared to the reliability gain. If you have so many tools that token cost becomes a concern, the right answer is to curate which tools are included per-request based on context — not to collapse them into multi-mode functions.

---

## The Three Silent Failure Modes

When tool descriptions are weak, agents fail in ways that produce no explicit error. These are the hardest failures to debug:

**Silent wrong tool selection.** Claude calls `search_products` when it should have called `get_inventory` because the descriptions didn't distinguish them clearly. The tool executes successfully, returns plausible-looking data, and Claude generates a confidently wrong answer. No exception is thrown.

**Silent parameter hallucination.** Claude fills in a parameter it doesn't have with a plausible-looking value. `sku: "ERN-0000-A"` — a format-valid SKU that doesn't exist. Your tool returns a not-found error, which propagates into Claude's reasoning and causes downstream failures.

**Silent tool omission.** Claude decides *not* to call a tool because the description didn't make it obvious the tool applies to the current situation. It answers from training data instead. For Earnventory — where you need live stock data, not Claude's best guess — this is a critical failure mode.

All three are caused by descriptions that leave Claude guessing. All three are fixed by descriptions that answer the question before Claude has to ask it.

---

## Applying This to Earnventory

When designing your first tool set for Earnventory, run through this checklist for each tool before writing a line of handler code:

1. **One thing:** Can I describe what this tool does in one sentence without "and"? If not, split it.
2. **When to use:** Does the description tell Claude the specific situation that calls for this tool?
3. **When not to use:** If there's a similar-looking tool, does the description say what to use instead?
4. **Return shape:** Does the description name the fields Claude will need to reason about next?
5. **Parameter semantics:** Are names descriptive? Do descriptions include format, example, and constraints?
6. **Failure:** Does the description tell Claude what a failed result looks like and what to do about it?

A tool description that passes this checklist takes about 10 minutes to write. It will save you hours of debugging wrong tool calls and prevent a class of silent failures that are notoriously hard to identify in production.

---

## Free Resources

- **Anthropic's tool use best practices** — https://docs.anthropic.com/en/docs/build-with-claude/tool-use/best-practices  
  Anthropic's canonical guidance on writing effective tool descriptions, with before/after examples. The "Writing good descriptions" section maps directly to what we covered today.

- **JSON Schema: Getting Started Step by Step** — https://json-schema.org/learn/getting-started-step-by-step  
  The `input_schema` field in every tool definition is a JSON Schema object. Understanding `type`, `properties`, `required`, `enum`, and nested schemas is essential for building tools with constraints Claude can actually follow. Short read, high leverage.

---

*Day 22 tomorrow: client-side vs. server-side tools — the architectural distinction between tools you execute and tools Anthropic executes, and why it matters for cost, security, and what's possible.*
