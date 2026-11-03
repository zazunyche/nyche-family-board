# AI Agents Day 40: The Claude Agent SDK: What It Buys You

**Day 40 of 50 | Mini-Module 2.3: Building an Agent from Scratch**

---

## Where We Are

Day 36: your first API call.
Day 37: a system prompt with role, constraints, format, context.
Day 38: the structural toolkit — XML tags, few-shot examples, strict schemas.
Day 39: the agentic loop by hand — five steps, repeated, baton-passing.

Today: what happens when you hand that entire loop to Anthropic's infrastructure.

This email is the pivot from "understanding the parts" to "knowing when to use the pre-built version." By the end you'll know exactly what the Agent SDK adds, what it costs you, and how to decide which tier Earnventory's agents belong in.

---

## A Brief Review: What You Built Yesterday

The hand-rolled agentic loop is roughly 50 lines of Python. Its core:

```python
while True:
    response = client.messages.create(
        model="claude-sonnet-4-6",
        tools=tools,
        messages=messages
    )
    if response.stop_reason == "end_turn":
        break
    # parse tool_use blocks
    # execute each tool
    # append assistant message + tool results
    # loop
```

That's powerful and teachable. But it's also entirely your responsibility: the loop itself, the history management, the context overflow detection, the retry logic, the compaction — all of it.

The Claude Agent SDK (formally "Managed Agents" in the API) moves that responsibility to Anthropic's servers.

---

## What the Agent SDK Adds

### 1. The Loop Runs on Their Infrastructure

With the raw API, your process stays alive and drives each iteration. With the SDK, you create an Agent once (a persistent config object) and start a Session per task. Anthropic's servers run the loop:

```python
import anthropic

client = anthropic.Anthropic()

# Create the agent once — store this ID, don't recreate per run
agent = client.beta.agents.create(
    model="claude-opus-4-8",
    name="inventory-manager",
    tools=[{"type": "agent_toolset_20260401"}],
    system="You are an inventory manager for Earnventory. "
           "Analyze inventory levels and recommend reorder actions."
)
print(agent.id)  # agent_abc123 — save this permanently

# Start a session for each task
session = client.beta.sessions.create(
    agent=agent.id,
    environment_id=environment.id
)
```

The agent's loop — call → check → parse → execute → append → repeat — runs on Anthropic's infrastructure. Your process doesn't need to stay alive through each tool call.

### 2. Session State Is Managed Automatically

In the raw loop, you maintain the `messages` array yourself: append the assistant message, append the tool results, grow the array with each iteration. If your process crashes, that state is gone.

With the SDK, the session holds all of it. You can query session state and stream events in real time via SSE:

```
Your Code              Anthropic's Servers
─────────              ──────────────────
session.create() ────► [Session born]
                            │
send message ────────►  [Agent loop running]
                            │ tool calls → built-in tools
                            │ tool results returned
                            │ context compacted if needed
                            │
stream events ◄───────  [SSE event stream]
                            │
                        [Session idle — waiting for next message]
```

The session tracks:
- Full conversation history
- All tool calls and their results
- Current status: `running` → `idle` → `terminated`
- A timestamped event log you can replay

### 3. Built-In Tools, No Handler Code Required

Yesterday's `get_inventory_level` tool was yours to define, dispatch, and handle. You wrote the handler function and the dispatch logic.

The Agent SDK's built-in toolset (`agent_toolset_20260401`) includes eight tools that Anthropic executes in a per-session sandbox container — without a single handler function in your codebase:

| Tool | What it does |
|------|-------------|
| `bash` | Execute shell commands in the container |
| `read` | Read files from the container filesystem |
| `write` | Write files to the container filesystem |
| `edit` | Make targeted text edits to a file |
| `glob` | Pattern-based file matching |
| `grep` | Text search with regex |
| `web_search` | Search the web |
| `web_fetch` | Retrieve a specific URL |

For an Earnventory agent that needs to: download a CSV of supplier pricing, analyze it, search for competitive alternatives, draft a comparison document, and save the output — every one of those steps runs in the container without any handler code on your side.

You can still define **custom tools** that your code executes (like `send_purchase_order` or `query_your_erp`). Those trigger a call-and-respond event: the agent emits "please call this tool," your code receives it via the event stream, runs it, and sends back the result. Built-in tools and custom tools coexist in the same session.

### 4. Context Compaction Happens Automatically

Context windows are finite. In a long-running session — 50 tool calls, hundreds of tool results, thousands of tokens of reasoning — you'd eventually hit the limit. In the raw loop, you'd detect this yourself and implement a rolling window or summarization pass.

The Agent SDK handles this server-side. When a session approaches the context limit, Anthropic's infrastructure automatically summarizes earlier history into a compact form, keeping the session alive and coherent. You can observe compaction events in the event stream; you don't have to manage them.

---

## The Architecture: Agents Are Persistent, Sessions Are Per-Run

This is the most important structural difference from the raw API. In the raw API, you make calls — transient, one-shot. In the SDK, you have two distinct durable objects:

```
agents.create() ──► agent_abc123
                    (stored persistently, versioned)
                    holds: model, system, tools, MCP servers
                         │
                         ├── sessions.create() ──► session_001
                         │       task: "check and reorder WIN-1042"
                         │       isolated container, history, event log
                         │
                         └── sessions.create() ──► session_002
                                 task: "audit March invoices from SUP-007"
                                 isolated container, history, event log
```

**Agents are versioned.** When you update an agent's system prompt or model, a new version is created. Existing in-flight sessions pin to the version they started with; new sessions get the latest. This makes it safe to deploy config changes without disrupting running tasks.

**Sessions are isolated.** Each session has its own container workspace, its own conversation history, and its own event log. Two sessions from the same agent don't share context — you can run ten concurrent sessions off one agent ID safely.

The critical implication: **create the agent once, store the ID, reuse it.** Creating a new agent per session is the most common misuse pattern — it accumulates orphaned configs, bypasses versioning, and defeats the persistence model entirely.

---

## When to Use the SDK vs. the Raw Loop

Neither is universally correct. Here's how to decide:

**Use the raw loop when:**
- You need approval gates before destructive tool calls (e.g., "confirm before placing a PO over $5,000")
- You need fine-grained custom logging at each loop step
- The task is short — just a few tool calls, done in seconds
- You need conditional execution logic: "only call this tool if the previous result was X"
- You're prototyping and want full visibility into each step
- You're on Amazon Bedrock or Google Vertex AI (Managed Agents isn't available there)

**Use the Agent SDK when:**
- The agent runs for minutes or hours across many tool calls
- You want built-in tools without writing handlers
- You need managed context — compaction, session state, event stream
- You're building multi-agent systems (a coordinator agent delegating subtasks to subagents)
- You need per-session file workspaces (upload a CSV, have Claude process it)
- You want versioned, persistent agent configs reused across many tasks

**For Earnventory specifically:**

The quick one-off that checks a single SKU and returns a stock level? Raw loop. Three function calls.

The supplier monitoring agent that: reads incoming invoices, looks up exchange rates, checks historical pricing, searches for competitive alternatives, drafts a recommendation email, and attaches a comparison spreadsheet — and might run for 10 minutes across 30 tool calls? Agent SDK. That's exactly the workload it's built for.

---

## The Abstraction Cost: Debugging at a Higher Layer

One honest tradeoff before we move on.

In the raw loop, failures surface at your level: a 400 from the API, a tool result that wasn't formatted right, a mismatched `tool_use_id`. The stack trace points at your code.

In the Agent SDK, failures can be more opaque. The session shows `terminated`. An event in the stream says `session.error`. The root cause — a malformed tool definition, a container resource limit, a custom tool that timed out — is harder to trace because you don't own the loop.

This is exactly why this mini-module started with the raw loop. You know what the SDK is doing underneath. When a session terminates unexpectedly, you can reason about the loop-that-you-didn't-write: "it must have hit a context limit before compaction triggered, because the session was only idle for two seconds before dying." That reasoning is only possible because you built the loop by hand in Day 39.

The analogy from the beginning of Module 2.3 holds: the SDK is pre-assembled furniture. Faster to set up, fewer decisions to make. But when a leg is wobbly, you need to know what's inside to find the loose bolt.

---

## Free Resources

1. **Anthropic's Managed Agents overview** — the official introduction to agents, sessions, environments, the toolset, and the SSE event stream: https://platform.claude.com/docs/en/managed-agents/overview.md

2. **Managed Agents quickstart** — the minimal end-to-end code path from agent creation to streaming events, in Python and TypeScript: https://platform.claude.com/docs/en/managed-agents/quickstart.md

---

## Tomorrow

Day 41: **Model selection — Opus vs. Sonnet vs. Haiku.** You know how to build an agent. You know when to use the SDK. Now: which model should be inside it? The answer isn't just capability — it's the latency/cost/quality triangle, and where each Earnventory agent lives on that curve. An agent that runs 30 tool calls on Opus 4.8 costs roughly 15× more than the same agent on Haiku 4.5. When that tradeoff makes sense — and when it doesn't — is the next question.

---

*Day 40 of 50 | Mini-Module 2.3: Building an Agent from Scratch | AI Agents Curriculum — Designed by Abeiku for Dad*
