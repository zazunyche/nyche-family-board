# AI Agents Day 23: Building a Real Tool for Earnventory

**Mini-Module 2.1 — Tools and Function Calling | Day 4 of 8**

---

For three days we've built up the theory: what tools are (Day 20), how to write descriptions that make Claude call them correctly (Day 21), and where they actually execute — your server vs. Anthropic's (Day 22). Today we build one. End-to-end. From the JSON schema definition through the handler function through error handling through the `tool_result` format.

The tool: `get_supplier_pricing`. A canonical Earnventory operation — query what a specific supplier currently charges for a set of SKUs. Simple enough to follow in full, realistic enough to reveal every pattern that matters in production.

---

## Part 1: The Tool Definition (What Claude Sees)

The tool definition is a JSON document you send in your API request alongside your messages. It is the only thing Claude reads about your tool — your handler code is invisible to it. Claude uses this definition to decide when to call the tool, what arguments to pass, and how to format its inputs.

```json
{
  "name": "get_supplier_pricing",
  "description": "Fetch current pricing from a supplier for one or more SKUs in the Earnventory catalog. Returns unit cost, currency, quantity breaks, and the date pricing was last updated. Use when you need to know what a specific supplier charges before drafting or placing a purchase order.",
  "input_schema": {
    "type": "object",
    "properties": {
      "supplier_id": {
        "type": "string",
        "description": "The supplier's Earnventory ID (e.g. 'SUP-1042'). If you don't have the ID, call get_suppliers first to find it."
      },
      "skus": {
        "type": "array",
        "items": {"type": "string"},
        "description": "List of SKU codes to look up (e.g. ['WN-001', 'WN-002']). Supports batching — passing multiple SKUs returns all pricing in a single call."
      },
      "as_of_date": {
        "type": "string",
        "description": "Optional. Return pricing effective as of this date (ISO 8601, e.g. '2026-07-01'). Defaults to today if omitted."
      }
    },
    "required": ["supplier_id", "skus"]
  }
}
```

Two things the description is doing that aren't obvious:

**1. It tells Claude when to call.** "Use when you need to know what a specific supplier charges before drafting or placing a purchase order" is navigation guidance — it tells Claude this is the right tool for pre-order pricing lookups, not for, say, comparing suppliers generally (that would be a different tool, maybe `compare_supplier_pricing`). Without this guidance Claude will either under-call (not thinking to use the tool when it should) or over-call (using it for tangential questions that don't need live data).

**2. Parameter descriptions encode tool-chaining.** "If you don't have the ID, call get_suppliers first to find it" is a hint about tool sequencing. Claude reads this and knows that when a user asks about "my Winfield Imports supplier" but doesn't give an ID, the correct move is: call `get_suppliers` to find `SUP-1042`, then call `get_supplier_pricing` with that ID. This is multi-step reasoning encoded directly into the tool definition, not in the system prompt.

---

## Part 2: The Handler Function (What Your Code Runs)

When Claude outputs a `tool_use` block for `get_supplier_pricing`, your application's loop catches it and calls this handler. The handler does the actual work.

```python
from datetime import date
import json
import logging

logger = logging.getLogger(__name__)

def handle_get_supplier_pricing(
    supplier_id: str,
    skus: list[str],
    as_of_date: str | None = None
) -> dict:
    """
    Handler for get_supplier_pricing tool.
    Always returns a dict — never raises. Claude reads the return value.
    """
    try:
        # Validate supplier exists before hitting the pricing table
        supplier = db.suppliers.get(supplier_id)
        if supplier is None:
            return {
                "error": True,
                "error_code": "SUPPLIER_NOT_FOUND",
                "message": (
                    f"Supplier '{supplier_id}' not found in Earnventory. "
                    f"Use get_suppliers to search for the correct ID."
                ),
                "supplier_id": supplier_id
            }

        effective_date = as_of_date or date.today().isoformat()

        rows = db.supplier_pricing.query(
            supplier_id=supplier_id,
            skus=skus,
            as_of=effective_date
        )

        found_skus = {row.sku for row in rows}
        missing_skus = [sku for sku in skus if sku not in found_skus]

        return {
            "error": False,
            "supplier_id": supplier_id,
            "supplier_name": supplier.name,
            "as_of_date": effective_date,
            "pricing": [
                {
                    "sku": row.sku,
                    "unit_cost": float(row.unit_cost),
                    "currency": row.currency,
                    "quantity_breaks": row.quantity_breaks,
                    "last_updated": row.updated_at.isoformat()
                }
                for row in rows
            ],
            "missing_skus": missing_skus
        }

    except DatabaseTimeout:
        return {
            "error": True,
            "error_code": "DATABASE_TIMEOUT",
            "message": (
                "The pricing database did not respond in time. "
                "You can retry this call, or proceed without current pricing data."
            ),
            "supplier_id": supplier_id,
            "skus": skus
        }
    except Exception as e:
        logger.error(f"get_supplier_pricing failed: {e}", exc_info=True)
        return {
            "error": True,
            "error_code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred fetching pricing. A log has been recorded.",
            "supplier_id": supplier_id
        }
```

Four design decisions embedded here that apply to every tool you write:

**Never raise an exception from a tool handler.** If your handler throws, the calling loop either crashes or surfaces a generic error that Claude can't reason about. Instead, return a structured error in the result body with an `"error": true` flag. Claude is good at reading structured error payloads and recovering: retrying with different parameters, asking the user to clarify, or explaining the failure in plain language. An exception removes Claude from the recovery loop entirely.

**Return partial results with explicit gaps.** The `missing_skus` field in the success case handles the situation where five SKUs were requested but only four have pricing records. The result says exactly which SKUs are missing. This is better than silently returning four results — Claude might read four results and assume it has complete data. Explicit gaps let Claude reason correctly about what it doesn't know.

**Validate early on high-confidence errors.** Checking whether the supplier exists before querying the pricing table isn't just efficiency — it produces a more useful error message. "Supplier 'SUP-9999' not found" is actionable. "No rows returned" is not.

**Log the real error internally; return a safe message to Claude.** The `except Exception` case captures the real traceback in your server logs but returns a sanitized message to Claude. Stack traces and internal variable names in `tool_result` payloads become part of the conversation context. If that context is cached, logged, or forwarded, you don't want implementation details leaking into it.

---

## Part 3: The Full Loop in ASCII

Here's how `get_supplier_pricing` fits into a live agent interaction:

```
YOUR APP                              ANTHROPIC
   │                                      │
   │── API request ─────────────────────► │
   │   messages: [{                       │
   │     role: "user",                    │
   │     content: "What is SUP-1042       │
   │              charging for WN-001?"   │
   │   }]                                 │
   │   tools: [get_supplier_pricing, ...]  │
   │                                      │
   │                                      │  Claude reasons:
   │                                      │  → need pricing data
   │                                      │  → call get_supplier_pricing
   │◄── response ────────────────────────  │
   │   stop_reason: "tool_use"            │
   │   content: [{                        │
   │     type: "tool_use",                │
   │     id: "tu_abc123",                 │
   │     name: "get_supplier_pricing",    │
   │     input: {                         │
   │       supplier_id: "SUP-1042",       │
   │       skus: ["WN-001"]               │
   │     }                                │
   │   }]                                 │
   │                                      │
   │  [YOUR HANDLER RUNS]                 │
   │  result = handle_get_supplier_pricing│
   │    ("SUP-1042", ["WN-001"])          │
   │  → {error: false, pricing: [...]}    │
   │                                      │
   │── API request (continue) ──────────► │
   │   messages: [                        │
   │     ...previous...,                  │
   │     {role: "assistant",              │
   │      content: [tool_use block]},     │
   │     {role: "user", content: [{       │
   │       type: "tool_result",           │
   │       tool_use_id: "tu_abc123",      │
   │       content: JSON.stringify(result) │
   │     }]}                              │
   │   ]                                  │
   │                                      │
   │◄── final response ────────────────── │
   │   stop_reason: "end_turn"            │
   │   "SUP-1042 (Winfield Imports) is    │
   │    currently charging $4.25/unit     │
   │    for WN-001 as of July 1."         │
```

The `tool_use_id` is the connector — it links the `tool_result` you send back to the specific `tool_use` block that triggered it. Claude may call multiple tools in a single turn; the IDs let it match each result to the right call. Always echo the `id` from the `tool_use` block into `tool_use_id` in your `tool_result`. A mismatch causes the loop to fail.

---

## Part 4: The tool_result Message Structure

The `tool_result` is a specific message type in the Anthropic API. It always goes as a `"user"` role message following the assistant's `tool_use` block:

```python
{
    "role": "user",
    "content": [
        {
            "type": "tool_result",
            "tool_use_id": "tu_abc123",    # must match the tool_use block's id exactly
            "content": json.dumps(result), # your handler's return value as a string
            # optional:
            "is_error": True               # structural signal: the tool call failed
        }
    ]
}
```

The `is_error` flag is separate from the `"error": true` field in your result body, and the distinction matters:

- **`is_error: True`** — tells Claude at a structural level that the tool execution failed. Claude will typically try to recover (retry, ask clarification, report failure). Use this for hard failures: database down, auth error, network timeout.

- **`"error": true` in the body (without `is_error`)** — tells Claude something went wrong in terms Claude can reason about. Use this for business-logic failures: supplier not found, SKU not in catalog, pricing data unavailable. Claude reads the message and decides what to do.

- **Success with `missing_skus`** — no error flags at all. The call succeeded; it just has partial data. Claude reads the gap and decides whether to proceed with partial information or ask for clarification.

The hierarchy from hard failure to soft partial result maps directly to how aggressively you want Claude to recover vs. how much you want it to reason about the result.

---

## Part 5: What Claude Does With Each Error Type

When the supplier doesn't exist, Claude receives:
```json
{"error": true, "error_code": "SUPPLIER_NOT_FOUND",
 "message": "Supplier 'SUP-9999' not found. Use get_suppliers to search for the correct ID."}
```

A Claude agent reading this will typically do one of three things:
1. Call `get_suppliers` to find the right ID (if that tool is available and the description told it to)
2. Ask the user to confirm the supplier ID
3. Tell the user the supplier wasn't found and offer alternatives

This is autonomous recovery without any code path in your application to handle it. You returned a structured, human-readable error. Claude decided what to do with it. This is the right division of responsibility — your handler knows *what* failed; Claude knows *what to do next*.

When partial SKU data comes back, Claude might say: "I found pricing for WN-001 ($4.25) and WN-003 ($7.80), but WN-002 wasn't in SUP-1042's catalog. Want me to check a different supplier for WN-002?" That reasoning came entirely from the `missing_skus` field you returned. You didn't write a line of code to generate that question.

---

## The Four-Part Pattern (Summary)

Every Earnventory tool you build follows the same structure:

```
┌────────────────────────────────────────────────────────┐
│ 1. JSON SCHEMA        — what Claude reads              │
│    name + description + input_schema                   │
│    Description teaches when/how to call                │
├────────────────────────────────────────────────────────┤
│ 2. HANDLER FUNCTION   — what your code runs            │
│    validate → query → return structured dict           │
│    Never raise — always return                         │
├────────────────────────────────────────────────────────┤
│ 3. ERROR DISCIPLINE   — how failures are communicated  │
│    Structured error bodies for business logic failures │
│    is_error: true for hard infrastructure failures     │
│    Partial results for incomplete data (not errors)    │
├────────────────────────────────────────────────────────┤
│ 4. tool_result FORMAT — how the loop passes it back    │
│    tool_use_id must match the tool_use block exactly   │
│    content is your handler's return, JSON-stringified  │
└────────────────────────────────────────────────────────┘
```

This pattern scales directly from `get_supplier_pricing` to every tool in Earnventory's agent toolkit — reading inventory levels, drafting purchase orders, sending supplier emails, checking margin. The schema teaches Claude to call correctly. The handler executes correctly. Error discipline lets Claude recover gracefully without your application writing explicit recovery paths.

---

## Free Resources

- **Anthropic tool use: implementing client tools** — https://docs.anthropic.com/en/docs/build-with-claude/tool-use/implement-tool-use  
  The primary reference for the tool-use loop in the API. Covers the `tool_result` message format in detail, handling multiple tool calls in a single turn, the `is_error` flag, and edge cases like tool calls that return image data. Read this before writing your first production handler.

- **Understanding JSON Schema (readable reference)** — https://json-schema.org/understanding-json-schema/  
  The `input_schema` field in Claude tool definitions follows the JSON Schema specification. This guide is more readable than the formal spec — especially useful for `type`, `properties`, `required`, `enum`, and array definitions with `items`. Knowing this well means knowing exactly how to shape the inputs Claude will send your handler.

---

*Day 24 tomorrow: MCP — Model Context Protocol — what happens when you standardize all the clerk windows so that any agent, any model, and any framework can use them without rewriting your tool code from scratch each time.*
