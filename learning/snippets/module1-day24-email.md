# AI Agents Day 24: MCP: Standardizing the Clerk Windows

**Mini-Module 2.1 — Tools and Function Calling | Day 5 of 8**

---

Yesterday you built `get_supplier_pricing` end-to-end: the JSON schema, the handler function, error discipline, the `tool_result` format. It works. But there's a catch buried in how you built it: every piece of that tool is written against Claude's specific API format — the `input_schema` structure, the `tool_result` message type, the `tool_use_id` convention. If someone on the Earnventory team wants to wire the same tool to a different model next year — or to Claude Code instead of the raw API — they have to rewrite it from scratch.

This is not a hypothetical problem. In 2023–2024, every AI framework had its own proprietary format for tool definitions. LangChain tools looked different from OpenAI function calls, which looked different from Anthropic's tool-use blocks, which looked different from dozens of other competing frameworks. Every tool you wrote was tied to the framework you wrote it for. Portability was zero.

**Model Context Protocol (MCP)** is the answer Anthropic shipped in November 2024. Today we're going to understand what it is, how it works architecturally, and why it matters specifically for how you'll build Earnventory's agent capabilities.

---

## The One-Sentence Definition

MCP is an open protocol that standardizes how AI models and agents connect to tools, data sources, and services — so that a tool defined once can be used by any MCP-compatible client without modification.

Anthropic designed it as an industry standard, not a proprietary Anthropic feature. The goal is for every major AI provider to adopt it — which is already happening. That's what makes the portability argument real rather than theoretical.

---

## The Architecture: Two Roles, One Protocol

MCP defines two roles:

**MCP Servers** expose capabilities — tools, data, and templates. An MCP server is a program that says: "Here is what I can do. Here is how to call me. Here is what I'll return." The server doesn't know or care which AI model or framework is calling it.

**MCP Clients** are the AI applications that connect to servers and make calls. Claude Code is an MCP client. Zazu (running inside Claude Code) is an MCP client. An Earnventory agent you build on any MCP-compatible SDK will also be an MCP client.

The protocol runs over two transports:

- **stdio** — server runs as a child process, client sends/receives JSON over standard input/output. Fast, simple, used for local tools running on the same machine.
- **HTTP + SSE** — server runs as a network service, client connects over HTTP. Used for remote tools, shared infrastructure, and multi-user deployments.

The wire format is JSON-RPC 2.0 — a simple request/response convention where every message has a method name, parameters, and an ID for matching responses to requests.

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   MCP CLIENT (Zazu / Claude Code / your Earnventory agent)      │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │                                                          │  │
│   │  "What tools are available?"  ──────────────────────►   │  │
│   │  ◄──────────────────────────  [list of tool schemas]    │  │
│   │                                                          │  │
│   │  "Call get_supplier_pricing({                           │  │
│   │     supplier_id: 'SUP-1042',                            │  │
│   │     skus: ['WN-001']                                    │  │
│   │   })"  ─────────────────────────────────────────────►  │  │
│   │  ◄──────────────────────────  {pricing: [...]}          │  │
│   │                                                          │  │
│   └──────────────────────────────────────────────────────────┘  │
│              │   MCP Protocol (JSON-RPC 2.0)   ▲                │
│              │   stdio or HTTP+SSE              │                │
│              ▼                                  │                │
│   MCP SERVER (Earnventory / Gmail / Calendar)                   │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │  Exposes: Tools · Resources · Prompts                    │  │
│   │  Doesn't know or care which model is calling             │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

The client first discovers what the server offers — by calling `tools/list`, `resources/list`, and `prompts/list`. Then it calls what it needs: `tools/call`, `resources/read`. Discovery is dynamic: as you add tools to the server, clients pick them up automatically without any code change on the client side.

---

## The Three Primitives

MCP servers expose three types of capabilities:

**1. Tools** — callable functions the model can invoke. This is the direct analogy to what you built yesterday. The difference: an MCP tool definition is written in the MCP schema format, which any MCP-compatible client can read — not just Claude. The `get_supplier_pricing` tool from Day 23, rewritten as an MCP tool, works with Claude, GPT-4o, Gemini, or any future model that speaks MCP. The handler code doesn't change; only the wrapping format does.

**2. Resources** — data sources the model can read, addressed by URI. Examples: a file (`file:///earnventory/catalog.csv`), a database record (`earnventory://suppliers/SUP-1042`), a live feed (`earnventory://inventory/low-stock`). Resources are read-only — they let the model access context data without invoking a function. Where tools are "do this," resources are "read this."

**3. Prompts** — reusable prompt templates the model can request by name. A prompt is a standard workflow stored on the server: "draft a purchase order," "summarize supplier invoice," "flag margin risk." The server defines the template; the model retrieves and inserts it. Useful for enforcing consistent task structure across many agent invocations.

Most production deployments — including all of Zazu's current MCP integrations — use only Tools. Resources and Prompts are available but optional depending on your use case.

---

## Before MCP vs. After MCP

Here's the concrete difference for an Earnventory scenario. Suppose you want to expose five business operations as AI-callable tools: check inventory, get supplier pricing, draft purchase order, send supplier email, generate margin report.

**Before MCP:**

```
For Claude (Anthropic raw API):
  → Write 5 tool schemas in Anthropic's input_schema format
  → Write 5 handlers returning Anthropic-compatible tool_result objects

For Claude Code (direct integration):
  → Rewrite 5 tool schemas in Claude Code's format
  → Rewrite 5 handlers for Claude Code's calling convention

For a different model/framework next year:
  → Rewrite again. And again.

5 tools × N clients = 5N implementations to maintain in parallel.
```

**After MCP:**

```
Earnventory MCP Server:
  → Write 5 tool schemas once in MCP format
  → Write 5 handlers once returning MCP-standard results

Any MCP client connects and uses them unchanged:
  Claude Code       ──► Earnventory MCP Server ◄── Future Framework X
  Raw API agent     ──►          │              ◄── Internal tool Y
                                 │
                         [same 5 tools, zero duplication]

5 tools × any number of clients = 5 implementations total.
```

The MCP server is the single source of truth for Earnventory's agent capabilities. New clients connect; nothing changes on the server side.

---

## How Zazu Uses MCP Today

Right now, when Zazu checks your Gmail, reads your calendar, accesses Drive files, or looks at a Notion page — all of those are MCP calls. The tool names you'd see in a Zazu conversation (mcp__gmail__*, mcp__google-calendar__*, mcp__notion__*) are MCP tools served by MCP servers that Claude Code connects to at startup.

Here's what that looks like structurally:

```
Claude Code (MCP Client)
    │
    ├── stdio ──► Gmail MCP Server
    │               Tools: search_threads, get_message, send_email,
    │                      create_draft, label_thread, ...
    │
    ├── stdio ──► Google Calendar MCP Server
    │               Tools: list_events, create_event, update_event,
    │                      delete_event, suggest_time, ...
    │
    ├── stdio ──► Google Drive MCP Server
    │               Tools: search_files, read_file_content,
    │                      get_file_metadata, create_file, ...
    │
    └── stdio ──► Notion MCP Server
                    Tools: notion-search, notion-fetch,
                           notion-create-pages, notion-query-database, ...
```

When I run a task like "check the family calendar for this week," the sequence is:

1. The model (Claude) decides it needs calendar data
2. Claude Code (the MCP client) calls `list_events` on the Google Calendar MCP server
3. The server hits the Google Calendar API, returns the events
4. Claude Code passes the result back to the model as a tool result
5. The model generates the response you read

The model never speaks to Google Calendar directly. It speaks to Claude Code (the client), which speaks to the Calendar MCP server (the intermediary), which speaks to Google's API. The layers are cleanly separated: model reasoning, protocol translation, actual execution. Each layer has one job.

---

## Why This Matters for Earnventory

If you build Earnventory's agent tools as an MCP server, you get three things for free:

**Model independence.** Your tools work with whatever model you're using today and whatever you switch to next year. The business logic — the handler code that queries your database, validates inputs, formats results — lives in the MCP server and never changes regardless of what's calling it.

**Cross-client reuse.** The same Earnventory MCP server can be used by your personal Claude Code setup, a production agent running on a server, a colleague's environment, and any future internal tools your team builds. One implementation, many consumers.

**Dynamic discoverability.** MCP clients query the server for what's available (`tools/list`) before deciding what to call. This means agents can adapt to your expanding toolkit without requiring system prompt updates. Add a new Earnventory tool to the server — any connected client sees it immediately.

The practical starting point: when you build the next Earnventory tool handler, wrap it in the MCP tool format rather than a Claude-specific definition. The Python SDK for MCP (from Anthropic) makes this about the same amount of code as writing it directly for the raw API, and you get portability as a side effect.

---

## The Clerk Window Analogy, Extended

Yesterday the analogy was: the JSON schema is the posted form at the clerk window; your handler is the clerk. That window served one customer: Claude.

With MCP, the building gets standardized. Every window in every government building follows the same architectural specification — same counter height, same form design, same intake procedure, same response envelope. A visitor who learns how to use one window can use any window in any building.

Your Earnventory MCP server is one wing of the building. The clerk windows (tools) accept standard forms (MCP requests). Any visitor who speaks the standard form language (any MCP client) can walk in and use them. The clerk behind the glass doesn't know and doesn't care whether the visitor came from Claude Code, a custom Python agent, or a framework that didn't exist when you wrote the handler.

Before MCP: every agency had its own proprietary door, its own key, its own unique form that worked nowhere else. You trained separately for each building you needed access to. Your forms didn't transfer.

After MCP: one form, one protocol, every building. You build Earnventory's clerk windows once. Every agent speaks the same language to reach them.

---

## Free Resources

- **MCP official documentation** — https://modelcontextprotocol.io/introduction  
  The canonical reference for the protocol. Start with the introduction and the "Core architecture" page, then read "Building MCP servers" for practical implementation. The Python and TypeScript quickstarts show a minimal working MCP server in about 50 lines — a good way to see the full structure without getting lost in detail. If you're going to build Earnventory tools, this is the first bookmark.

- **Anthropic's MCP announcement** — https://www.anthropic.com/news/model-context-protocol  
  The original technical announcement from Anthropic explaining why MCP exists and what problem it solves at the industry level. Anthropic is explicit that MCP is designed as an open standard, not a proprietary lock-in mechanism — they're actively working to get other major AI providers to adopt it. Worth reading for the motivation, not just the mechanics: understanding why something was designed the way it was helps you use it correctly.

---

*Day 25 tomorrow: parallel tool calls — what happens when Claude decides to invoke multiple tools in a single turn, why that matters for latency and efficiency, and how to design your tool set to make parallel execution possible.*
