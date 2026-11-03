# AI Agents Day 70: MCP — Standardizing the Clerk Windows

**Module 2, Mini-Module 2.1 — Tools and Function Calling | Day 70 of the Nyche AI Curriculum**

---

Over the last four days you've built a complete mental model of how tools work: Claude outputs structured text, your code executes, you return a result. You've seen how description quality determines whether Claude calls the right tool, how client-side and server-side tools split the execution responsibility, and what a production-quality handler looks like end to end.

There's one problem with everything you've built so far: it's glued to your specific application.

Your `get_supplier_pricing` schema lives inside your Earnventory agent's initialization code. If you build a second agent — say, one focused on supplier relationship management — you'd copy that schema over and maintain two copies. If you build a third agent, three copies. When Earnventory's pricing table schema changes, you update in three places and probably miss one.

This is the problem MCP solves.

---

## What Is MCP?

**MCP (Model Context Protocol)** is an open standard, proposed by Anthropic and now broadly adopted, that defines a portable interface between agents and tools. Instead of embedding tool definitions inside your application code, you run a separate small service — an **MCP server** — that advertises what it can do. Any **MCP client** (any agent runtime that speaks the protocol) can connect to that server, discover its tools, and call them.

The protocol specifies:
- How a client asks a server "what tools do you have?"
- How those tools are described in a standard format
- How a client invokes a tool with arguments
- How the server returns a result

That's it. It's deliberately minimal. The insight is that if the interface is standardized, every compliant agent automatically gains access to every compliant tool server — today, and as new tools or new agents are built in the future.

---

## The Architecture in Plain Terms

```
                    WITHOUT MCP
    ┌─────────────────────────────────────┐
    │   Earnventory Agent                 │
    │                                     │
    │   tools = [                         │
    │     get_supplier_pricing(...),      │  ← hardcoded schemas
    │     get_inventory_level(...),       │
    │     draft_purchase_order(...)       │
    │   ]                                 │
    └─────────────────────────────────────┘

    If you build a second agent → copy/paste the schemas
    If the API changes → update in N places
    If you want another framework to use these tools → rewrite them


                     WITH MCP
    ┌─────────────────────────────────────┐
    │   Earnventory MCP Server            │
    │                                     │
    │   Exposes:                          │
    │     - get_supplier_pricing          │  ← defined once
    │     - get_inventory_level           │
    │     - draft_purchase_order          │
    └──────────────────┬──────────────────┘
                       │  MCP protocol
           ┌───────────┼───────────────────┐
           │           │                   │
    ┌──────┴──┐  ┌─────┴──────┐  ┌────────┴───┐
    │ Purchase│  │ Supplier   │  │ Future     │
    │ Order   │  │ Relations  │  │ Agent #3   │
    │ Agent   │  │ Agent      │  │            │
    └─────────┘  └────────────┘  └────────────┘
```

The key architectural shift: **tools become a service, not a dependency**. Any agent that needs pricing data connects to the Earnventory MCP server and gets it. No copy-paste, no coordination overhead, no drift between versions.

---

## How MCP Actually Works at the Protocol Level

When an agent starts up and connects to an MCP server, it sends a `tools/list` request. The server responds with all the tools it exposes, in a format structurally identical to what you'd pass to the Claude API directly:

```json
// MCP server responds to tools/list with:
{
  "tools": [
    {
      "name": "get_supplier_pricing",
      "description": "Returns unit price and lead time from a specific supplier for a given SKU. Call before generating purchase orders.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "sku": {"type": "string", "description": "Earnventory SKU, e.g. 'SKU-482'"},
          "supplier_id": {"type": "string", "description": "Supplier ID, e.g. 'SUP-019'"}
        },
        "required": ["sku", "supplier_id"]
      }
    }
  ]
}
```

The agent runtime takes this list, formats it however the underlying model expects (Claude's API format, OpenAI's format, whatever), and injects it into the conversation context. When the model calls the tool, the agent runtime sends a `tools/call` request to the MCP server:

```json
// Agent sends to MCP server:
{
  "name": "get_supplier_pricing",
  "arguments": {
    "sku": "SKU-482",
    "supplier_id": "SUP-019"
  }
}

// MCP server executes the handler and responds:
{
  "content": [
    {
      "type": "text",
      "text": "{\"sku\": \"SKU-482\", \"unit_price\": 14.72, \"lead_days\": 21, \"currency\": \"USD\"}"
    }
  ]
}
```

The agent runtime takes that response and formats it as a `tool_result` for the model. The model never knows it went through a separate server — it just sees the result.

This is the full cycle. From the model's perspective, nothing changed. From your architecture's perspective, everything changed.

---

## How Zazu Uses MCP Today

This isn't theoretical for you — you're already using it.

Every tool Zazu has access to is delivered via an MCP server:
- **Gmail** — `search_threads`, `send_message`, `get_thread`, and dozens more are exposed by the Gmail MCP server. When Zazu starts a conversation, it connects, discovers the tools, and they're available for use.
- **Google Calendar** — same pattern: separate MCP server, tools like `list_events` and `create_event` discovered at startup.
- **iMessage** — an MCP server running locally that exposes messaging tools.
- **Notion** — workspace queries and page operations via another MCP server.

None of these are embedded in Zazu's prompt or application code. They're services Zazu connects to. That's why, when Abeiku (the research subagent) runs, it gets its own set of tools appropriate for its role — it connects to its own set of MCP servers, or a subset of Zazu's. Each agent gets what it needs; no more.

This is also why Zazu can be updated, swapped, or run in a different context without touching the tool definitions. The tools live with the data they access, not with the agent that uses them.

```
                  THE NYCHE HOUSEHOLD MCP ARCHITECTURE
    ┌────────────────────────────────────────────────────────┐
    │                 Zazu (Orchestrator)                    │
    │            Claude Agent SDK runtime                    │
    └───────────────┬────────────────┬──────────────────────┘
                    │ connects to    │
          ┌─────────┴──────┐   ┌────┴──────────┐
          │  Gmail MCP     │   │  Calendar MCP  │
          │  Server        │   │  Server        │
          ├────────────────┤   ├────────────────┤
          │ search_threads │   │ list_events    │
          │ send_message   │   │ create_event   │
          │ get_thread     │   │ update_event   │
          │ create_draft   │   │ search_events  │
          └────────────────┘   └────────────────┘
                    │
          ┌─────────┴──────┐   ┌────────────────┐
          │  iMessage MCP  │   │  Notion MCP    │
          │  Server        │   │  Server        │
          ├────────────────┤   ├────────────────┤
          │ send_message   │   │ search         │
          │ read_messages  │   │ create_page    │
          └────────────────┘   └────────────────┘
```

---

## MCP vs. Direct Tool Definitions: When to Use Each

MCP adds a network hop and a small amount of operational complexity (you need to run and maintain the server). For simple, single-agent deployments, that overhead may not be worth it. Here's the honest tradeoff:

**Use direct tool definitions (hardcoded schemas) when:**
- You have one agent and it will stay one agent
- The tools are trivial to implement inline (no shared state, no external APIs)
- You're prototyping and want to move fast without setting up infrastructure
- You need the lowest possible latency and every millisecond matters

**Use MCP when:**
- Multiple agents need the same tools (avoid N copies of the same schema)
- The tools access a system with real state (a database, an API) that should be owned by one service
- You want to change tool implementations without redeploying agents
- You're thinking about longevity: tools defined in MCP servers can outlive the specific agents that use them today

For Earnventory, the moment you have more than one Claude-powered feature, MCP becomes worth the overhead. Your pricing lookup, inventory query, and purchase order tools will be used by at least three different agents (purchase ordering, supplier relations, financial reporting). That's the inflection point.

---

## Earnventory: A Practical MCP Design

Here's what a minimal Earnventory MCP server could look like — one file, four tools, consumable by any agent:

```python
# earnventory_mcp_server.py
from mcp.server import Server
from mcp.server.models import InitializationOptions
import mcp.types as types

server = Server("earnventory")

@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="get_inventory_level",
            description="Returns current stock count and reorder threshold for a SKU.",
            inputSchema={
                "type": "object",
                "properties": {
                    "sku": {"type": "string", "description": "Earnventory SKU"}
                },
                "required": ["sku"]
            }
        ),
        types.Tool(
            name="get_supplier_pricing",
            description="Returns unit price and lead time from a specific supplier for a SKU. Call before generating purchase orders.",
            inputSchema={
                "type": "object",
                "properties": {
                    "sku": {"type": "string"},
                    "supplier_id": {"type": "string"}
                },
                "required": ["sku", "supplier_id"]
            }
        ),
        # ... more tools
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    if name == "get_inventory_level":
        result = db.query_inventory(arguments["sku"])
        return [types.TextContent(type="text", text=json.dumps(result))]
    elif name == "get_supplier_pricing":
        result = db.query_pricing(arguments["sku"], arguments["supplier_id"])
        return [types.TextContent(type="text", text=json.dumps(result))]
    # ...
```

You start this server once. Every Claude Code session, every Claude agent you build, every external tool that speaks MCP — they all connect to it. The Earnventory data layer is now a first-class service, not implementation detail copied into each agent.

---

## The Bigger Picture: MCP as an Ecosystem

Anthropic published the MCP specification as an open standard in late 2024. By mid-2025, major tool providers started publishing their own MCP servers: GitHub, Slack, Linear, Notion, Google Workspace. This is the ecosystem effect the USB-C analogy is pointing at.

If you're building an Earnventory agent and you want it to read supplier invoices from Gmail, you don't need to write a Gmail integration. You connect to the already-running Gmail MCP server. Same for Google Sheets pricing data, Slack notifications to your warehouse team, GitHub issues for engineering requests. The integrations exist; you consume them via a standardized port.

That's the long-term value proposition: MCP shifts the question from "how do I build a Gmail integration for my agent?" to "which MCP server exposes Gmail, and how do I connect?" The answer is often: someone already built it.

---

## Free Resources

- **MCP Specification and official documentation** — the canonical reference for the Model Context Protocol, including the full schema specification and transport options: https://modelcontextprotocol.io/docs
- **Anthropic's MCP introduction** — the original announcement and architectural overview from Anthropic explaining the design rationale and ecosystem vision: https://www.anthropic.com/news/model-context-protocol

---

Tomorrow: **parallel tool calls** — when Claude reaches for multiple tools in a single turn, what happens architecturally? How do you handle two (or ten) tool_use blocks coming back at once, and how do you design your tool set to enable Claude to work in parallel rather than sequentially?
