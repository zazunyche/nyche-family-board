# AI Agents Day 69: Building a Real Earnventory Tool End to End

Three days ago you learned that Claude never executes tools — it outputs structured text and your code does the work. Two days ago you learned how to write descriptions that reliably guide which tool Claude picks. Yesterday you saw the split between tools your code runs and tools Anthropic's infrastructure runs.

Today: what does a complete, production-quality tool actually look like — all the way from the JSON schema declaration to the Python handler to error handling to what Claude receives back?

This is the day you stop thinking about tools abstractly and start building them concretely.

---

## The Three-Part Structure of Every Tool

Every tool in a Claude-powered agent has three distinct pieces that you write:

```
┌──────────────────────────────────────────────────────────┐
│                    WHAT YOU BUILD                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. SCHEMA ──── Sent to Claude at conversation start     │
│     (what the tool is, what inputs it accepts)           │
│                                                          │
│  2. HANDLER ─── Runs in your code when Claude calls it   │
│     (the actual work: DB query, API call, file read)     │
│                                                          │
│  3. RESULT ──── Returned to Claude so it can continue    │
│     (success data, or a readable error Claude can use)   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

These three pieces are physically separate. The schema is declared when you initialize your conversation. The handler lives somewhere in your application backend. The result gets formatted and appended to the conversation thread. Claude only ever sees #1 and #3 — it never touches your handler code.

---

## Part 1: The JSON Schema

The schema is the declaration you include in your API call. It tells Claude: "this tool exists, here's what it does, here's what input it expects."

```json
{
  "name": "get_supplier_pricing",
  "description": "Returns the latest unit price and lead time in days from a specific supplier for a given Earnventory SKU. Call this before generating purchase orders to verify current pricing. Do not call for bulk SKU lookups — this is single-SKU only.",
  "input_schema": {
    "type": "object",
    "properties": {
      "sku": {
        "type": "string",
        "description": "The Earnventory SKU identifier, e.g. 'SKU-482'"
      },
      "supplier_id": {
        "type": "string",
        "description": "The Earnventory supplier ID, e.g. 'SUP-019'"
      }
    },
    "required": ["sku", "supplier_id"]
  }
}
```

Three things worth noticing:

**The description is doing real work.** "Call this before generating purchase orders" tells Claude *when* to reach for this tool. "Do not call for bulk SKU lookups" constrains it. These aren't just documentation comments — they're behavioral instructions Claude follows when deciding which tool to call and whether to call it at all. From Day 67 you know that vague descriptions produce wrong calls; this is where precise descriptions pay off.

**The `required` field determines what Claude must provide.** Parameters in `required` will always be present when Claude calls your handler. Parameters not in `required` might be omitted. Be deliberate: if your handler will crash without a parameter, it belongs in `required`.

**Parameter descriptions guide format, not just type.** Declaring `"type": "string"` tells Claude the data type. Adding `"e.g. 'SKU-482'"` tells it the *format*. Without that, Claude might pass `"482"`, `"sku_482"`, or `"item 482"` — all strings, all wrong for your database lookup.

---

## Part 2: The Handler

The handler is your code. It runs when Claude outputs a `tool_use` block with your tool's name. Here's a complete example in Python:

```python
def handle_get_supplier_pricing(sku: str, supplier_id: str) -> dict:
    try:
        result = db.query(
            "SELECT unit_price, lead_days FROM supplier_pricing "
            "WHERE sku = %s AND supplier_id = %s "
            "ORDER BY effective_date DESC LIMIT 1",
            (sku, supplier_id)
        )

        if not result:
            return {
                "error": (
                    f"No pricing found for SKU {sku} from supplier {supplier_id}. "
                    "Verify the SKU and supplier ID are correct."
                )
            }

        row = result[0]
        return {
            "sku": sku,
            "supplier_id": supplier_id,
            "unit_price": float(row["unit_price"]),
            "lead_days": int(row["lead_days"]),
            "currency": "USD"
        }

    except DatabaseTimeout:
        return {
            "error": "Database timeout — pricing data temporarily unavailable. "
                     "Try again in 30 seconds."
        }
    except Exception as e:
        return {"error": f"Unexpected error retrieving pricing: {str(e)}"}
```

Notice what this handler does *not* do:

- It does not raise exceptions that bubble up past the handler
- It does not return HTTP status codes
- It does not return a Python stack trace

It returns a dictionary in all cases — either with the data, or with a readable error message. That's because of what happens next.

---

## Part 3: The Tool Result

The tool_result is what you send back to Claude after your handler runs. The structure looks like this:

```python
# Append to your messages list and call the API again
{
    "role": "user",
    "content": [
        {
            "type": "tool_result",
            "tool_use_id": tool_use_block["id"],   # Must match Claude's id exactly
            "content": json.dumps(handler_result)   # Serialized handler output
        }
    ]
}
```

The `tool_use_id` field is critical — it must match the `id` from the `tool_use` block Claude generated. This is how Claude correlates which result belongs to which tool call. If you get it wrong, you'll get an API error or undefined behavior. If Claude called two tools in one turn, you'll have two `tool_use` blocks, and you need to return a `tool_result` for each one before calling the API again.

**Why errors should be readable strings, not exceptions:**

When Claude receives your tool result, it reads the content as text and reasons from it. If you return a readable error message, Claude can surface it intelligently to the user:

```
User: What's the current price from supplier SUP-019 for SKU-482?

Claude: [tool_use: get_supplier_pricing, sku="SKU-482", supplier_id="SUP-019"]

Handler returns: {"error": "No pricing found for SKU SKU-482 from supplier SUP-019.
                  Verify the SKU and supplier ID are correct."}

Claude: I wasn't able to pull pricing for SKU-482 from supplier SUP-019 —
        there's no record of that combination in the system. Could you confirm
        whether this supplier carries that SKU? I can also check other
        suppliers if you'd like.
```

Claude turned your error into a helpful response. This only works if the error is readable text. If your handler raises an unhandled exception and the loop crashes, the user gets nothing. If you return `"exception: NoneType has no attribute 'unit_price'"`, Claude gets confused. Invest in readable error messages — they're part of your tool's contract with Claude.

---

## The Complete Request/Response Cycle

Here's the full cycle from initial request to final answer:

```
YOUR APP                                CLAUDE (API)
──────────────────────────────────────────────────────────

1. Send message + tool schemas
   ──────────────────────────────────────────────────►

                                 2. Claude reasons about the request
                                    decides to call get_supplier_pricing
                                    outputs tool_use block:
                                    {name, id, input: {sku, supplier_id}}

3. Response arrives, stop_reason = "tool_use"
   ◄──────────────────────────────────────────────────

4. Parse tool_use block
   Match to handler: handle_get_supplier_pricing
   Call handler(sku, supplier_id)
   Handler queries DB → returns result dict

5. Append tool_result to messages, call API again
   ──────────────────────────────────────────────────►
   {role: "user", content: [{
       type: "tool_result",
       tool_use_id: <id>,
       content: json.dumps(result)
   }]}

                                 6. Claude reads tool result
                                    continues reasoning
                                    generates final response

7. Response arrives, stop_reason = "end_turn"
   ◄──────────────────────────────────────────────────
```

This cycle can repeat multiple times if Claude calls tools in sequence. Each `stop_reason: "tool_use"` means execute and loop. Each `stop_reason: "end_turn"` means you're done. From Day 66, you know Claude never enters the kitchen — it just writes tickets and reads what comes back.

---

## Earnventory Application: A Composable Tool Set

For a purchase order agent in Earnventory, you might design four tools that compose naturally:

```
get_inventory_level(sku)
  → stock count, reorder threshold, days of supply remaining

get_supplier_list(sku)
  → list of supplier IDs that carry this SKU

get_supplier_pricing(sku, supplier_id)
  → unit price, lead time, MOQ

draft_purchase_order(sku, supplier_id, quantity)
  → creates a draft PO, returns PO number
```

An agent reasoning through a reorder might sequence them like this:

1. `get_inventory_level("SKU-482")` → below threshold, need to reorder
2. `get_supplier_list("SKU-482")` → ["SUP-019", "SUP-023"]
3. `get_supplier_pricing("SKU-482", "SUP-019")` + `get_supplier_pricing("SKU-482", "SUP-023")` → compare prices (Claude may call these in parallel in one turn)
4. `draft_purchase_order("SKU-482", "SUP-023", 500)` → cheaper supplier wins

The key design principle: **each tool does one thing**. `draft_purchase_order` doesn't also check pricing. `get_supplier_pricing` doesn't also draft the order. Tools that do one thing are individually testable, individually debuggable, and composable in ways you don't have to anticipate in advance. If your pricing lookup is wrong, you can call `handle_get_supplier_pricing("SKU-482", "SUP-019")` in isolation and inspect the result without running the full agent.

---

## The Error Handling Taxonomy

Handlers encounter three categories of failure, each warranting different treatment:

**Data errors** — the requested data doesn't exist or doesn't match. Return a clear message with enough context for Claude to respond helpfully. *"No pricing found for SKU-482 from supplier SUP-019. Verify the SKU and supplier ID."*

**Transient errors** — temporary service issues that may resolve on retry. Return a message that signals retryability. *"Database timeout — try again in 30 seconds."* Claude can surface this to the user or, if your loop is designed for it, retry automatically.

**Permanent errors** — configuration or permission failures that require human intervention. Return a message that signals this clearly. *"API key invalid — contact your system administrator."* Claude can't fix this by reasoning differently; the user needs to act.

The rule: your handler's job is to translate technical failure modes into text Claude can understand and reason about. The model is your interface to the user — give it the information it needs to be useful even when things go wrong.

---

## Free Resources

- **Anthropic Tool Use documentation** — complete API reference with worked examples, including multi-tool turns and parallel tool calls: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
- **Anthropic Cookbook — tool use examples** — runnable Python notebooks covering the full tool call cycle: https://github.com/anthropics/anthropic-cookbook/tree/main/tool_use

---

Tomorrow: **MCP (Model Context Protocol)** — what if you defined these tool schemas once, in a standard portable format, and any agent, any model, any framework could use them without rewriting the definition each time? That's what MCP is — and it's why Zazu can swap out its underlying model without rewriting its tools.
