# AI Agents Day 68: Client-Side vs. Server-Side Tools

**Module 2, Mini-Module 2.1 — Tools and Function Calling | Day 68 of the Nyche AI Curriculum**

---

## Where We Are

Yesterday established that a tool description is an instruction, not documentation — and that Claude's reliability as a tool-caller is only as good as the text you write in the description field. Today we go one level up in the architecture: not what you write in a tool definition, but where the tool actually executes.

This is a distinction that every developer working with Claude eventually has to internalize. It affects your code architecture, your data privacy model, your billing, and your trust assumptions. And because both types of tools look completely identical to Claude, it's easy to ignore the difference until it bites you.

---

## The Core Distinction

When Claude calls a tool, it outputs a `tool_use` block in its response:

```
{
  "type": "tool_use",
  "id": "toolu_01AbC...",
  "name": "get_inventory_level",
  "input": {
    "sku_id": "SKU-482"
  }
}
```

That block is structured text — an expression of intent. Something has to actually execute the intent. The question is: what, and running where?

**Client-side tools** are executed by your application. When Claude outputs a `tool_use` block for a client-side tool, your code reads the block, runs the corresponding handler function, and returns a `tool_result` with the output. The entire execution lifecycle — network call, database query, computation — happens in your environment, under your control.

**Server-side tools** are executed by Anthropic's infrastructure. When Claude calls a server-side tool like `web_search`, Anthropic's systems handle the execution before the result reaches you. You never write a handler. The result arrives as if it were a normal tool response, but the work happened elsewhere.

```
                CLIENT-SIDE TOOL              SERVER-SIDE TOOL

Claude          Claude outputs tool_use       Claude outputs tool_use
                        |                             |
Your app        Your code runs handler        [Anthropic executes]
                        |                             |
                Returns tool_result           Returns tool_result
                        |                             |
Claude          Reads result, continues       Reads result, continues
```

From Claude's perspective: identical. From your perspective: completely different.

---

## Client-Side Tools in Depth

Every custom tool you build is client-side. The pattern is always the same:

1. You define the tool (name, description, input_schema) and pass it to the API in the `tools` parameter.
2. Claude generates a `tool_use` block when it decides to call it.
3. You detect `stop_reason: "tool_use"` in the response.
4. You extract the tool name and inputs from the response.
5. You dispatch to the appropriate handler function.
6. You call the API again with the `tool_result` appended to the conversation.

Here is the minimal Python loop for a single client-side tool:

```python
import anthropic

client = anthropic.Anthropic()

def get_inventory_level(sku_id: str) -> dict:
    # Your actual database call here
    return {"sku_id": sku_id, "stock": 43, "reorder_threshold": 50}

tools = [
    {
        "name": "get_inventory_level",
        "description": (
            "Returns current stock count and reorder threshold for one SKU. "
            "Call before deciding whether to generate a purchase order. "
            "Returns null for unknown SKUs."
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

messages = [{"role": "user", "content": "Is SKU-482 running low?"}]

while True:
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        tools=tools,
        messages=messages
    )

    if response.stop_reason == "end_turn":
        # Claude is done — print final response
        print(response.content[0].text)
        break

    if response.stop_reason == "tool_use":
        # Collect all tool calls from this response
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                if block.name == "get_inventory_level":
                    result = get_inventory_level(**block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": str(result)
                    })

        # Append Claude's response and all tool results, then loop
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})
```

The key insight: everything inside `get_inventory_level` runs in your process, on your machine, with access to your database credentials, your internal network, your filesystem. You control it completely. You also own the security model: if that function has a bug, you debug it. If it's slow, you optimize it. If it fails, your error handling decides what Claude sees.

---

## Server-Side Tools in Depth

Anthropic currently offers a small set of server-side tools. The most commonly used:

**`web_search`** — Performs a web search and returns results. Anthropic's infrastructure fetches and parses web content. Useful when your agent needs current information that isn't in its training data or your context.

**`code_execution`** (also called computer use in some configurations) — Executes Python code in a sandboxed environment. Claude can write and run code, see the output, and iterate. The sandbox is Anthropic's, not yours.

To use a server-side tool, you include it in your tools list just like a client-side tool — but you set the type field to indicate it's provided by Anthropic:

```python
tools = [
    {
        "type": "web_search_20250305",  # server-side: type field identifies it
        "name": "web_search"
    },
    {
        "name": "get_inventory_level",  # client-side: your handler
        "description": "...",
        "input_schema": {...}
    }
]
```

When Claude calls `web_search`, you don't receive a `stop_reason: "tool_use"` that you handle. The result is injected into the response by Anthropic's infrastructure and you see the finished output as if Claude simply knew the information.

The practical implication: you can mix client-side and server-side tools in the same tool set. An Earnventory agent might use your `get_inventory_level` tool (client-side) alongside `web_search` (server-side) to check whether a commodity price spike is driving a supplier's price change.

---

## When to Use Each

The choice isn't about preference — it follows from what the tool needs to do.

**Use client-side when:**
- The tool accesses private data (your database, your internal APIs, files in your environment)
- You need to control the execution environment (custom libraries, specific credentials)
- The action is stateful or has side effects in your system (writing to a database, sending a notification)
- You need fine-grained error handling or retry logic
- The operation must happen within your security perimeter

**Use server-side (Anthropic-provided) when:**
- The tool's capability is well-defined and Anthropic has already built it reliably (web search, code execution)
- You don't want to build and maintain the infrastructure yourself
- The capability requires significant sandboxing or external access that would be expensive to replicate
- The tool doesn't require access to your private systems

In practice, production agent systems are mostly client-side tools with occasional server-side tools added for specific capabilities. A pure client-side agent is common. A pure server-side agent is rare — server-side tools are supplements, not replacements for custom tool logic.

---

## Pricing and Billing

This is a practical difference worth knowing before you design.

**Client-side tools:** You pay for the input tokens (the tool definition text + conversation history + system prompt) and output tokens (Claude's response + tool_use blocks). The execution of your tool handler costs you whatever your infrastructure charges. No additional Anthropic fees for the tool execution itself.

**Server-side tools:** You pay Anthropic for the tool execution in addition to the token costs. `web_search` has a per-call fee. `code_execution` has usage-based pricing for the sandbox time. The specifics are in the Anthropic pricing page and change as the product evolves — always check current pricing rather than relying on rules of thumb.

The budget implication: if your agent calls `web_search` frequently, it can become the dominant cost line. Client-side tools that call your own cached data can be dramatically cheaper per call if you optimize the handler. This is worth modeling before you commit to a server-side tool for a high-frequency workflow.

---

## Trust and Data Privacy

The trust model is where the client-side/server-side distinction has the most architectural significance.

**Client-side tools** run in your environment. What Claude passes in the `tool_use` input never leaves your system — it stays within your API call and your handler. Your database credentials, your private data, your network are only ever touched by your code. The data flow is: user → Claude (via Anthropic API) → tool_use block → your handler → tool_result → Claude.

**Server-side tools** run in Anthropic's infrastructure. When Claude calls `web_search`, the query goes to Anthropic's systems. Anthropic's privacy policy governs what happens there. If your agent is in a context where the tool inputs might contain sensitive information (a supplier name, a pricing strategy, a customer detail), you need to think about whether that data should be flowing through a server-side tool at all.

For Earnventory specifically: inventory levels, supplier names, pricing margins, and customer order data are confidential business information. All tools that touch that data should be client-side. Web search — for general commodity price lookups, public shipping data, publicly available supplier catalogs — is generally safe as server-side because you're querying public information.

```
                DATA FLOW COMPARISON

Client-side:     Your DB <--> Your Handler <--> Claude
                 (private data never leaves your environment)

Server-side:     Anthropic's Infra <--> Claude
                 (query + result flow through Anthropic's systems)
```

This isn't a reason to avoid server-side tools — it's a reason to be deliberate about which tools handle which data.

---

## Applied to Earnventory

Here is a practical tool set for an Earnventory reorder-analysis agent, annotated by type:

```
CLIENT-SIDE (your handlers, your data):
  get_inventory_level(sku_id)
    → queries your Earnventory DB
    → returns stock count + reorder threshold

  get_supplier_price(sku_id, supplier_id)
    → queries your supplier pricing table
    → returns current confirmed unit price

  draft_purchase_order(sku_id, supplier_id, quantity)
    → writes a draft order to your system
    → returns order_id for review

SERVER-SIDE (Anthropic-executed):
  web_search
    → used for public commodity price trends
    → used for supplier news or shipping delay alerts
    → NOT used for anything touching private Earnventory data
```

The split is intentional and follows from the data sensitivity of each action. Private → client-side. Public lookup → server-side. Side effects (the purchase order draft) → always client-side because you control the error handling and rollback.

---

## Summary

| Dimension | Client-side tools | Server-side tools |
|-----------|------------------|-------------------|
| Who executes | Your application code | Anthropic's infrastructure |
| Handler required | Yes — you write it | No — Anthropic provides it |
| Data access | Your private systems | Publicly accessible or sandboxed |
| Billing | Tokens only | Tokens + per-call fees |
| Privacy | Data stays in your environment | Query flows through Anthropic |
| Use case | Private data, side effects, custom logic | Web search, code execution, generic capabilities |
| Appearance to Claude | Identical | Identical |

The most important line in that table: the last one. Claude cannot tell the difference. The choice of client-side vs. server-side is entirely yours — a design decision, not a capability constraint.

---

## Resources

- **Anthropic server-side tools documentation:** https://docs.anthropic.com/en/docs/build-with-claude/tool-use/computer-use — covers the available server-side tools, their type identifiers, and current pricing
- **Anthropic tool use overview:** https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview — comprehensive reference for the full tool-use protocol, covering both client-side and server-side patterns

---

*Day 69 covers building a real tool for Earnventory — end to end: JSON schema, Python handler, error cases, and what to put in tool_result when things go wrong.*
