# AI Agents Day 39: Building the Agentic Loop by Hand

**Day 39 of 50 | Mini-Module 2.3: Building an Agent from Scratch**

---

## Where We Are

Day 36: you made your first API call and read a response.
Day 37: you wrote a system prompt with role, constraints, format, context.
Day 38: you learned the structural toolkit — XML tags, few-shot examples, strict schemas.

Today those three pieces converge into the thing that makes an agent actually *agentic*: the tool-use loop. This is the runtime core. Everything else — the system prompt, the tool definitions, the structured output — exists to support this loop.

By the end of this email you'll have the loop implemented in Python, understand exactly what happens at each step, and know the two mistakes that break it silently.

---

## What the Loop Is

An agent isn't a single API call. It's a sequence of calls where each one can trigger work your code does, which feeds into the next call. The loop is what coordinates that sequence.

The structure:

```
START
  │
  ▼
[1] Call Claude API (with tools defined)
  │
  ▼
[2] Check stop_reason
  ├── "end_turn" ──────────────────────► DONE. Return final text.
  └── "tool_use" ──────────────────────► continue ↓
  │
  ▼
[3] Parse tool_use block
    (extract: tool name, input arguments)
  │
  ▼
[4] Execute the tool in your application code
    (query DB, call API, read file, whatever)
  │
  ▼
[5] Append to conversation:
    - The assistant's message (including the tool_use block)
    - A tool_result message with the execution output
  │
  └──────────────────────────────────────► back to [1]
```

That's it. Everything an agent does — checking inventory, reading emails, drafting purchase orders, querying supplier databases — runs through this loop.

---

## What Each Step Looks Like in Code

Here's the loop implemented in Python using the Anthropic SDK. This is real, runnable code. Read through it once before I explain each piece.

```python
import anthropic
import json

client = anthropic.Anthropic()

# Tool definition — same format you'd use in an Earnventory agent
tools = [
    {
        "name": "get_inventory_level",
        "description": "Returns current stock level for a given SKU.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sku": {
                    "type": "string",
                    "description": "The SKU identifier, e.g. 'WIN-1042'"
                }
            },
            "required": ["sku"]
        }
    }
]

# Your tool handler — this is the actual business logic
def get_inventory_level(sku: str) -> dict:
    # In production: query your DB, call your ERP, etc.
    fake_inventory = {
        "WIN-1042": {"stock": 8, "reorder_point": 20, "unit": "cases"},
        "RIE-0083": {"stock": 112, "reorder_point": 30, "unit": "cases"},
    }
    if sku in fake_inventory:
        return fake_inventory[sku]
    return {"error": f"SKU {sku} not found"}

# Tool dispatch — routes tool name to handler function
def execute_tool(tool_name: str, tool_input: dict) -> str:
    if tool_name == "get_inventory_level":
        result = get_inventory_level(tool_input["sku"])
        return json.dumps(result)
    return json.dumps({"error": f"Unknown tool: {tool_name}"})

# The agentic loop
def run_agent(user_message: str) -> str:
    messages = [{"role": "user", "content": user_message}]

    while True:
        # [1] Call the API
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system="You are an inventory analyst for Earnventory. "
                   "Use the get_inventory_level tool to check stock.",
            tools=tools,
            messages=messages
        )

        # [2] Check stop_reason
        if response.stop_reason == "end_turn":
            # Extract the final text response
            for block in response.content:
                if block.type == "text":
                    return block.text
            return ""

        if response.stop_reason != "tool_use":
            # Unexpected stop reason — surface it
            return f"Unexpected stop_reason: {response.stop_reason}"

        # [3] Parse tool_use blocks
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                tool_name = block.name
                tool_input = block.input
                tool_use_id = block.id

                # [4] Execute the tool
                result = execute_tool(tool_name, tool_input)

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": result
                })

        # [5] Append assistant message AND tool results, then loop
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})
        # ↑ tool results go in a "user" role message — this trips people up

# Run it
answer = run_agent("What's the current stock level for WIN-1042? Should we reorder?")
print(answer)
```

Let's walk through each step.

---

## Step-by-Step Breakdown

### Step 1: The API Call

```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system="...",
    tools=tools,        # <-- this is what makes tool use possible
    messages=messages   # <-- this grows with each loop iteration
)
```

The `tools` parameter sends Claude the full tool definitions — name, description, input schema. Without it, Claude can't call tools even if you ask it to. With it, Claude can choose to call a tool rather than responding in text.

`messages` is the full conversation history. It starts as one user message. By iteration three, it might have: user message → assistant message with tool_use → user message with tool_result → assistant message → user follow-up.

### Step 2: Checking stop_reason

```python
if response.stop_reason == "end_turn":
    # Claude finished. Return the text.

if response.stop_reason == "tool_use":
    # Claude wants to call a tool. Continue the loop.
```

These are the only two stop reasons you'll see in a standard tool-use loop. `end_turn` means the model has finished its response. `tool_use` means it generated one or more tool calls and is waiting for the results before continuing.

There's also `max_tokens` (you hit the limit) and `stop_sequence` (a custom stop string matched), but those are edge cases in this context.

### Step 3: Parsing the Tool Use Block

```python
for block in response.content:
    if block.type == "tool_use":
        tool_name = block.name      # e.g. "get_inventory_level"
        tool_input = block.input    # e.g. {"sku": "WIN-1042"}
        tool_use_id = block.id      # e.g. "toolu_01Xb..."
```

`response.content` is a list of content blocks. When `stop_reason` is `tool_use`, that list will contain one or more blocks with `type == "tool_use"`. It can also contain a `text` block — Claude sometimes adds reasoning text before the tool call.

The `id` field matters: you'll need it in Step 5 to tell Claude which tool call each result corresponds to.

### Step 4: Executing the Tool

```python
result = execute_tool(tool_name, tool_input)
```

This is your code. Claude has handed you a request: "please call `get_inventory_level` with `sku='WIN-1042'`." Your application does that — queries the database, calls the external API, reads the file, whatever the tool does. You serialize the result to a string.

The tool execution happens in *your* application, not in Claude's runtime. Claude never touches your database directly. It generates a structured request; you execute it; you return the result.

### Step 5: Appending and Looping

This is where most people get it wrong the first time.

```python
# Append the ASSISTANT's full message (including the tool_use block)
messages.append({"role": "assistant", "content": response.content})

# Append the tool result in a USER role message
messages.append({
    "role": "user",
    "content": [{
        "type": "tool_result",
        "tool_use_id": block.id,   # must match the tool_use block's id
        "content": result           # the string result from your execution
    }]
})
```

Two things that trip people up here:

**First:** You must append the *entire* assistant message — including the tool_use block — before appending the result. Claude needs to see its own tool call to make sense of the result that follows. Skipping this produces incoherent behavior.

**Second:** Tool results go in a `user` role message, not an `assistant` role message. The conversation alternates: user → assistant → user → assistant. Your tool result is you (the user/runtime) responding to Claude's tool call. It goes in the `user` slot.

---

## What the Messages Array Looks Like After One Tool Call

```
messages = [
  {
    "role": "user",
    "content": "What's the stock level for WIN-1042? Should we reorder?"
  },
  {
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "I'll check the current inventory level for WIN-1042."
      },
      {
        "type": "tool_use",
        "id": "toolu_01Xb9ZwK...",
        "name": "get_inventory_level",
        "input": {"sku": "WIN-1042"}
      }
    ]
  },
  {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_01Xb9ZwK...",
        "content": "{\"stock\": 8, \"reorder_point\": 20, \"unit\": \"cases\"}"
      }
    ]
  }
]
```

After the second API call — which sees this full history — Claude responds:

```
WIN-1042 currently has 8 cases in stock with a reorder point of 20 cases.
Stock is critically below threshold (8 vs. 20 minimum). I recommend
placing a reorder immediately. At typical lead times, you may already
be below safe levels by the time the order arrives.
```

And since `stop_reason` is now `end_turn`, the loop exits and returns that text.

---

## Parallel Tool Calls

Claude can call multiple tools in a single turn. If you ask "check inventory for WIN-1042 and RIE-0083," Claude may return two `tool_use` blocks in one response — especially when the calls are independent and don't depend on each other's results.

The loop handles this naturally. You iterate over all blocks in `response.content`, execute each tool, and collect all results into a single `tool_result` array:

```python
tool_results = []
for block in response.content:
    if block.type == "tool_use":
        result = execute_tool(block.name, block.input)
        tool_results.append({
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": result
        })

# One user message contains ALL tool results
messages.append({"role": "user", "content": tool_results})
```

This is more efficient than sequential calls: Claude gets all results in one round-trip and can reason over them together.

---

## The Two Silent Failure Modes

### 1. Forgetting to append the assistant message

If you append only the tool result without the assistant's prior message:

```python
# WRONG — skips the assistant message
messages.append({"role": "user", "content": tool_results})
```

The conversation history has a user message, then immediately a user message with tool results. Claude will either error or produce incoherent output, because it has no record of having made a tool call.

### 2. Mismatching tool_use_id

```python
# WRONG — made-up ID
tool_results.append({
    "tool_use_id": "my-custom-id",   # doesn't match block.id
    "content": result
})
```

Claude uses the `tool_use_id` to match results to tool calls. A mismatch causes undefined behavior — Claude may ignore the result, hallucinate a different result, or error on the API call. Always use `block.id` exactly as returned.

---

## The Earnventory Version

Here's what this loop looks like with a realistic Earnventory tool set — not one tool but four, covering the most common inventory agent workflow:

```
TOOLS:
  get_inventory_level(sku)
  get_supplier_lead_time(supplier_id)
  calculate_reorder_quantity(sku, target_days_stock)
  create_purchase_order_draft(sku, quantity, supplier_id)

USER: "WIN-1042 is running low. Create a draft PO to restock it."

LOOP ITERATION 1:
  → Claude calls get_inventory_level("WIN-1042")
  ← {stock: 8, reorder_point: 20, supplier_id: "SUP-007"}

LOOP ITERATION 2:
  → Claude calls get_supplier_lead_time("SUP-007")
     AND calculate_reorder_quantity("WIN-1042", 30)  [parallel]
  ← {lead_time_days: 5}
  ← {recommended_quantity: 82}

LOOP ITERATION 3:
  → Claude calls create_purchase_order_draft("WIN-1042", 82, "SUP-007")
  ← {draft_id: "PO-2026-1847", status: "draft", total_usd: 1968.00}

LOOP ITERATION 4:
  stop_reason: end_turn
  → "I've created draft PO-2026-1847 for 82 cases of WIN-1042 from supplier
     SUP-007 for $1,968. Current stock is 8 cases (below the 20-case
     reorder point). With a 5-day lead time, I recommend expediting approval."
```

Four iterations, three of which involve tool calls. The loop ran until `end_turn`. This is exactly what production agents do.

---

## Why the Loop Matters Beyond Code

The loop is the reason agents can do things no single prompt can. A single prompt is a one-shot: you give context, you get output. The loop enables:

- **Multi-step reasoning** — Claude can look up facts, compute on them, then act
- **Error recovery** — if a tool returns an error, Claude can try a different approach
- **Conditional logic** — Claude decides which tool to call based on prior results
- **Progressive refinement** — Claude can check its own work by calling a tool twice

Every capability that makes Zazu useful — checking emails, updating calendars, querying memory, running analytics — runs through a version of this loop. It's the mechanical core of everything agents do.

---

## Free Resources

1. **Anthropic's tool use guide — the agentic loop** — the official walkthrough of the messages structure, stop reasons, and multi-turn tool handling: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use

2. **Anthropic cookbook — tool use examples** — practical code examples including parallel tool calls and error handling patterns: https://github.com/anthropics/anthropic-cookbook/tree/main/tool_use

---

## Tomorrow

Day 40 is about what the Claude Agent SDK does so you don't have to manage this loop yourself. You've now implemented the loop by hand — which means you understand every component. Tomorrow you'll see how the SDK abstracts it: built-in session management, automatic context compaction, subagent orchestration, and which abstractions are worth using vs. which ones hide things you still need to control.

---

*Day 39 of 50 | Mini-Module 2.3: Building an Agent from Scratch | AI Agents Curriculum — Designed by Abeiku for Dad*
