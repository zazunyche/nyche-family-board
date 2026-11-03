# AI Agents Day 43: Putting It Together — an Earnventory Agent in 200 Lines

Eight days ago you made your first API call to Claude. Since then you've covered:

- How to write a system prompt that actually constrains and guides the model (Day 37)
- XML structure, few-shot examples, and output format instructions (Day 38)
- How to implement the agentic loop by hand — call → parse → execute → repeat (Day 39)
- What the Claude Agent SDK adds over the raw API (Day 40)
- When to use Opus vs. Sonnet vs. Haiku (Day 41)
- How to enforce consistent structured JSON output (Day 42)

Today, all of that assembles into a single working agent. Not a toy. Not a demo. A functional Earnventory agent that checks inventory levels, identifies reorder candidates, and drafts supplier emails — in approximately 200 lines of Python.

We're going to walk through every section of that code and trace exactly which concept from the past 7 days is doing the work at each point.

---

## The Agent's Job

The Earnventory low-stock agent has one mission: given a list of SKUs, check which ones are below their reorder threshold, and for each one, draft a reorder email to the appropriate supplier.

**Inputs:**
- A list of SKUs to audit
- A reorder threshold (default: 20 units)

**Outputs:**
- A structured summary of SKUs below threshold
- Staged draft emails for each (not sent — drafted for human review)

**Constraints:**
- The agent should not send emails autonomously — only draft them
- Output must be concise and action-oriented
- If inventory data is unavailable for a SKU, note it and move on

---

## Section 1: The System Prompt

```python
SYSTEM_PROMPT = """
You are an inventory monitoring agent for Earnventory, a wholesale inventory
management platform. Your job is to audit SKU inventory levels and identify
items that need reordering.

You have two tools:
- get_inventory: Call this for each SKU to retrieve current stock level,
  reorder threshold, and supplier information.
- draft_reorder_email: When a SKU is below its threshold, call this to stage
  a reorder draft. Do NOT send emails — only draft them.

Work through the SKU list systematically. For each SKU:
1. Call get_inventory to get current data
2. If stock <= threshold, call draft_reorder_email
3. If inventory data is unavailable, note it and continue

When finished, output a concise summary in this exact format:
<summary>
AUDITED: {n} SKUs
BELOW THRESHOLD: {list of SKUs with current stock / threshold}
DRAFTED: {n} reorder emails
UNAVAILABLE: {list of SKUs with no data}
</summary>
"""
```

**What's doing the work here:**

- Role + mission statement → Day 37 (a strong system prompt defines who the agent is and what it's for)
- Numbered step-by-step instructions → Day 38 (explicit procedural format reduces ambiguity and guides the model's reasoning sequence)
- The `<summary>` XML tag → Day 38 (XML structure enforces consistent output format; Claude treats tagged sections as structured slots to fill)
- "Do NOT send emails — only draft them" → the reversibility principle (agents should not take irreversible actions without human review — we'll cover this formally tomorrow in Module 2.4)

The system prompt is the agent's operating parameters. If this is wrong, no amount of clever looping fixes it.

---

## Section 2: The Tool Definitions

```python
tools = [
    {
        "name": "get_inventory",
        "description": (
            "Retrieves current inventory data for a single SKU. "
            "Returns stock level, reorder threshold, supplier name, and supplier email. "
            "Call this once per SKU before deciding whether to reorder."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sku": {
                    "type": "string",
                    "description": "The SKU identifier, e.g. 'SKU-4821'"
                }
            },
            "required": ["sku"]
        }
    },
    {
        "name": "draft_reorder_email",
        "description": (
            "Stages a reorder email draft to a supplier. Does NOT send the email. "
            "Call this only when a SKU is confirmed below its reorder threshold. "
            "Returns a draft_id confirming the draft was saved."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sku": {
                    "type": "string",
                    "description": "The SKU to reorder"
                },
                "supplier_email": {
                    "type": "string",
                    "description": "Supplier email address from get_inventory output"
                },
                "quantity": {
                    "type": "integer",
                    "description": "Number of units to reorder"
                },
                "note": {
                    "type": "string",
                    "description": "Optional note to include for the supplier"
                }
            },
            "required": ["sku", "supplier_email", "quantity"]
        }
    }
]
```

**What's doing the work here:**

- Detailed `description` fields → Day 37 (the description is what the model reads to decide *when and how* to call the tool — "Call this once per SKU before deciding" is not documentation, it's a behavioral directive)
- Clear parameter names + per-field descriptions → Day 37 (Claude reads these to construct valid inputs; vague names produce garbage inputs)
- `required` array → Day 42 (strict schemas catch malformed calls before they hit your handler)
- "Does NOT send the email" in the draft tool description → belt-and-suspenders safety (the system prompt says it too; for irreversible actions, redundancy is correct)

---

## Section 3: The Tool Handlers

```python
import time

def execute_tool(tool_name: str, tool_input: dict) -> str:
    if tool_name == "get_inventory":
        sku = tool_input["sku"]
        # In production: query your inventory database
        inventory_db = {
            "SKU-4821": {
                "stock": 12, "threshold": 20,
                "supplier": "Riverside Wholesale",
                "supplier_email": "orders@riverside.com"
            },
            "SKU-9034": {
                "stock": 45, "threshold": 20,
                "supplier": "Metro Supply Co.",
                "supplier_email": "purchasing@metrosupply.com"
            },
            "SKU-1102": {
                "stock": 8, "threshold": 25,
                "supplier": "Riverside Wholesale",
                "supplier_email": "orders@riverside.com"
            },
        }
        if sku not in inventory_db:
            return f"No inventory data found for {sku}"
        data = inventory_db[sku]
        return (
            f"SKU: {sku} | Stock: {data['stock']} units | "
            f"Threshold: {data['threshold']} | "
            f"Supplier: {data['supplier']} ({data['supplier_email']})"
        )

    elif tool_name == "draft_reorder_email":
        sku = tool_input["sku"]
        email = tool_input["supplier_email"]
        qty = tool_input["quantity"]
        note = tool_input.get("note", "")
        draft_id = f"DRAFT-{sku}-{int(time.time())}"
        # In production: save to drafts queue or email system
        print(f"  [DRAFT SAVED] {draft_id}: Reorder {qty}x {sku} → {email}")
        return f"Draft saved. draft_id: {draft_id}"

    return f"Unknown tool: {tool_name}"
```

**What's doing the work here:**

The handlers are pure Python — completely independent of Claude. This is the core architectural insight from Day 20 (Mini-Module 2.1, "Tool calls are structured text, not magic"): Claude outputs a `tool_use` block with a name and JSON input, *your code* executes the actual logic. The model never enters the back room. You are the clerk; Claude filled out the form.

Error handling is intentional: returning `"No inventory data found for {sku}"` gives Claude a clear, readable string. It will note the SKU as unavailable and move on, because the system prompt told it to. You don't need special error codes — plain English in `tool_result` is what the model reads.

---

## Section 4: The Agentic Loop

```python
import anthropic

client = anthropic.Anthropic()

def run_inventory_agent(skus: list[str]) -> str:
    messages = [
        {
            "role": "user",
            "content": f"Audit the following SKUs for low stock: {', '.join(skus)}"
        }
    ]

    while True:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=tools,
            messages=messages
        )

        # Append Claude's response to the conversation
        messages.append({
            "role": "assistant",
            "content": response.content
        })

        if response.stop_reason == "end_turn":
            for block in response.content:
                if block.type == "text":
                    return block.text
            return "Agent completed with no text output."

        elif response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    print(f"  [TOOL CALL] {block.name}({block.input})")
                    result = execute_tool(block.name, block.input)
                    print(f"  [TOOL RESULT] {result}")
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result
                    })

            # Feed all results back in a single user turn, then loop
            messages.append({
                "role": "user",
                "content": tool_results
            })

        else:
            return f"Unexpected stop_reason: {response.stop_reason}"
```

This is the beating heart of the agent. Let's trace the full execution flow for three SKUs:

```
USER: "Audit SKU-4821, SKU-9034, SKU-1102"
        |
        v
[CALL 1] stop_reason = "tool_use"
  Claude calls: get_inventory(sku="SKU-4821")
  Claude calls: get_inventory(sku="SKU-9034")   <- parallel, same turn
  Claude calls: get_inventory(sku="SKU-1102")
        |
        v
[EXECUTE] all three handlers run
[APPEND] tool_results → messages
        |
        v
[CALL 2] stop_reason = "tool_use"
  Claude calls: draft_reorder_email(sku="SKU-4821", qty=30, ...)
  Claude calls: draft_reorder_email(sku="SKU-1102", qty=50, ...)
  (SKU-9034 is at 45/20 — no draft needed)
        |
        v
[EXECUTE] both draft handlers run
[APPEND] tool_results → messages
        |
        v
[CALL 3] stop_reason = "end_turn"
  Claude outputs the <summary> block
        |
        v
[RETURN] summary text to caller
```

**What's doing the work here:**

- The `while True` loop with `stop_reason` branching → Day 39 ("Building the agentic loop by hand") — this is exactly the 30-line pattern from that day
- Claude calling all three `get_inventory` tools in one turn → Day 25 (Mini-Module 2.1, "Parallel tool calls") — the API supports multiple tool calls per turn; Claude decides to batch them because it's more efficient
- `model="claude-sonnet-4-6"` → Day 41 ("Model selection") — Sonnet is the right call here: it reliably makes correct tool-call decisions, handles multi-step reasoning, and costs a fraction of Opus; Haiku is too lightweight for reliable tool chaining across 6+ turns
- Appending `response.content` directly to `messages` → the conversation history is the agent's working memory; every turn the model sees the full record of what it did

---

## Running It

```python
if __name__ == "__main__":
    skus_to_audit = ["SKU-4821", "SKU-9034", "SKU-1102", "SKU-7777"]
    result = run_inventory_agent(skus_to_audit)
    print("\n=== AGENT OUTPUT ===")
    print(result)
```

**Example terminal output:**

```
  [TOOL CALL] get_inventory({'sku': 'SKU-4821'})
  [TOOL RESULT] SKU: SKU-4821 | Stock: 12 units | Threshold: 20 | Supplier: Riverside Wholesale (orders@riverside.com)
  [TOOL CALL] get_inventory({'sku': 'SKU-9034'})
  [TOOL RESULT] SKU: SKU-9034 | Stock: 45 units | Threshold: 20 | Supplier: Metro Supply Co. (purchasing@metrosupply.com)
  [TOOL CALL] get_inventory({'sku': 'SKU-1102'})
  [TOOL RESULT] SKU: SKU-1102 | Stock: 8 units | Threshold: 25 | Supplier: Riverside Wholesale (orders@riverside.com)
  [TOOL CALL] get_inventory({'sku': 'SKU-7777'})
  [TOOL RESULT] No inventory data found for SKU-7777
  [TOOL CALL] draft_reorder_email({'sku': 'SKU-4821', 'supplier_email': 'orders@riverside.com', 'quantity': 30})
  [DRAFT SAVED] DRAFT-SKU-4821-1753920000: Reorder 30x SKU-4821 → orders@riverside.com
  [TOOL CALL] draft_reorder_email({'sku': 'SKU-1102', 'supplier_email': 'orders@riverside.com', 'quantity': 50})
  [DRAFT SAVED] DRAFT-SKU-1102-1753920001: Reorder 50x SKU-1102 → orders@riverside.com

=== AGENT OUTPUT ===
<summary>
AUDITED: 4 SKUs
BELOW THRESHOLD: SKU-4821 (12/20), SKU-1102 (8/25)
DRAFTED: 2 reorder emails
UNAVAILABLE: SKU-7777
</summary>
```

The agent made 6 tool calls across 2 turns, then stopped. Total: 3 API calls (2 tool turns + 1 end_turn). On Sonnet, that's roughly $0.003 in API costs for a complete inventory audit. Run it against 200 SKUs and you're still well under a dollar.

---

## What This Code Deliberately Doesn't Have

This is a working agent — but it's missing everything from Module 2.4, which starts tomorrow.

**No error handling for API failures.** If the Anthropic API returns a 5xx or your network drops, this crashes. Production agents need retry logic with exponential backoff.

**No token accounting.** `response.usage` is available on every response object and contains `input_tokens` and `output_tokens`. Nothing here accumulates them. After 200 SKUs, you won't know what it cost.

**No logging.** You have no durable record of what the agent decided, which tool calls it made, or what results it received. If it drafts a wrong reorder quantity, you can't trace why.

**No eval.** You can't verify this is correct without manually testing it against known inputs. Real deployments need a test suite that runs the agent against fixture data and checks the output.

**No human checkpoint.** The agent decides autonomously which SKUs to reorder. For a low-stakes internal tool, that's fine. For a system that eventually connects to actual purchase orders, you want a review gate before any draft becomes a sent email.

Each of those missing pieces is a day in Module 2.4. The code above is the foundation they protect.

---

## Free Resources

- **Anthropic Cookbook**: https://github.com/anthropics/anthropic-cookbook — Working Python examples for tool use, multi-turn conversations, and common agent patterns
- **Anthropic Python SDK**: https://github.com/anthropics/anthropic-sdk-python — The library itself, with type stubs; reading the source for `client.messages.create` and the response types is worth 15 minutes

---

*AI Agents Day 43 of 50 | Mini-Module 2.3: Building an Agent from Scratch | Designed by Abeiku for the Nyche family learning system*
