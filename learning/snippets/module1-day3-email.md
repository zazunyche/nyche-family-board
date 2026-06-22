# AI Agents Day 3: The Surgical Split — How Agents Actually Call Tools

*Module 1, Day 3 of 50 | Deep Reference Edition*

---

## The Big Idea

When I search your Gmail, create a calendar event, or add a task to the family board, you might imagine I'm running code directly — reaching into a database, executing a shell command, calling an API. I'm not. There's a strict architectural boundary between **what I decide** and **what actually happens**. Understanding this split is foundational to understanding both why agents are powerful and why they're safe.

---

## The Architectural Split

Every agent system has two distinct layers:

```
┌─────────────────────────────────────────────────┐
│                  THE MODEL LAYER                 │
│                                                  │
│  Input → Reasoning → Output (text / tool calls)  │
│                                                  │
│  The LLM lives here. It reads. It thinks.        │
│  It outputs structured intent. That's all.       │
└──────────────────────┬──────────────────────────┘
                       │  tool call request
                       │  (JSON)
                       ▼
┌─────────────────────────────────────────────────┐
│                  THE HOST LAYER                  │
│                                                  │
│  Receives tool call → Executes → Returns result  │
│                                                  │
│  Shell, API, database, filesystem — lives here.  │
│  The host decides what tools exist and enforces  │
│  all real-world constraints.                     │
└─────────────────────────────────────────────────┘
```

The model **never** directly executes code, hits an API, or modifies a file. It outputs a request. The host executes it. The result comes back as the model's next input. This cycle is the heartbeat of every agent system.

---

## What a Tool Call Actually Looks Like

When you text me "check my Gmail for anything urgent," here's what passes across that boundary:

**Step 1 — Model outputs a tool call:**
```json
{
  "type": "tool_use",
  "id": "toolu_01XYZ",
  "name": "mcp__claude_ai_Gmail__search_threads",
  "input": {
    "query": "is:unread newer_than:12h",
    "max_results": 20
  }
}
```
This is just text. A structured JSON blob. I output it; I don't execute it.

**Step 2 — Host executes:**
The Claude Code runtime (or whatever is orchestrating the session) sees that tool call, looks up `mcp__claude_ai_Gmail__search_threads` in its registered MCP servers, and calls it. The MCP server makes the real Gmail API request. Nothing in my model layer touches Gmail directly.

**Step 3 — Result comes back as input:**
```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_01XYZ",
  "content": [
    {
      "threadId": "abc123",
      "subject": "Primrose — Spirit Day Thursday",
      "from": "admin@primrose.com",
      "snippet": "This Thursday your child should wear orange..."
    },
    ...
  ]
}
```

**Step 4 — Model decides next action:**
I read the results, reason about them, and either output another tool call (add a board task, send you an iMessage) or compose a final response.

This is the loop. Each tool call is one iteration of: output intent → host executes → receive result → decide next step.

---

## Why This Split Matters

### 1. Safety through discreteness

Because every action is a discrete JSON request that the host executes, every action is in principle reviewable, loggable, and blockable. The host can refuse any tool call that violates policy — even if the model requests it. This is how permission systems work in production agents.

In your setup: the `--dangerously-skip-permissions` flag bypasses the approval prompt for tool calls. Remove that flag and every tool call I make would require your explicit "yes" before execution. That's the safety dial.

### 2. The model is stateless between turns

This is subtle but important. I don't *hold* a reference to your Gmail. I don't have an open database connection. After each tool call completes and I see the result, all state lives in the conversation context — the running text of everything that's been said and returned. The host layer is stateful (your Gmail, your board, your files are persistent). The model layer is stateless (I only know what's in context).

### 3. Tool availability is a host decision

Which tools I can call is entirely determined by what the host exposes — what MCP servers are connected, what tools are registered. If the Gmail MCP server isn't connected to a session, I have no Gmail tool to call regardless of what I reason about. This is why the scheduled `daily-learning.sh` job couldn't send iMessages: the iMessage plugin's MCP server wasn't connected to that session's host layer.

### 4. The model can hallucinate tool calls

If I'm poorly configured or the context gets confused, I might output a tool call for a tool that doesn't exist, or call a tool with wrong parameters. The host catches this — the tool call fails, the error comes back as a tool result, and I have to recover. This is one of the failure modes in real agent systems: cascading tool call errors that the model tries to recover from but makes worse.

---

## The Surgeon Analogy, Extended

The iMessage version used the surgeon analogy. Let's extend it:

| Surgery | Agent System |
|---------|--------------|
| Surgeon | LLM (the model) |
| Surgical instruments | Tools (Gmail, iMessage, board, calendar) |
| Scrub nurse / instrument table | Host layer / MCP servers |
| Surgical protocol | System prompt |
| Patient | The real world being acted on |
| OR record | Tool call log |

The surgeon decides *what* to do and *which* instrument to request. The nurse hands the instrument. The surgeon uses it. The surgeon does not stock the instrument table, sterilize tools, or decide what instruments exist — those are host-layer concerns.

A surgeon who tries to reach past the nurse and grab instruments directly is a liability. The protocol exists for a reason. Same for agents.

---

## Zazu's Tool Inventory

Here's the actual host-layer tool set I operate with in your setup:

```
iMessage delivery
  mcp__plugin_imessage_imessage__reply
  mcp__plugin_imessage_imessage__chat_messages

Gmail
  mcp__claude_ai_Gmail__search_threads
  mcp__claude_ai_Gmail__get_thread
  mcp__claude_ai_Gmail__create_draft
  mcp__claude_ai_Gmail__label_thread / label_message
  mcp__claude_ai_Gmail__list_labels / create_label

Google Calendar
  mcp__claude_ai_Google_Calendar__list_events
  mcp__claude_ai_Google_Calendar__create_event
  mcp__claude_ai_Google_Calendar__update_event / delete_event

Google Drive
  mcp__claude_ai_Google_Drive__read_file_content
  mcp__claude_ai_Google_Drive__create_file / copy_file

Notion
  mcp__claude_ai_Notion__notion-search
  mcp__claude_ai_Notion__notion-create-pages
  mcp__claude_ai_Notion__notion-update-page

Filesystem (via Bash/Read/Write/Edit tools)
  Read, Write, Edit — direct file access on your Mac

Shell execution
  Bash — run arbitrary shell commands (guarded by permissions)

Family board (via shell)
  node board-tools/add.js
  node board-tools/move.js
  node board-tools/done.js
  node board-tools/zazu-context.js
```

None of these are capabilities I *have*. They're capabilities the host exposes to me. Disconnect any MCP server and that row disappears from my tool table.

---

## The Real-World Implication for Earnventory

When you build Abeiku's agent backend, you'll need to answer three questions about the host layer:

1. **What tools does Abeiku need?** (inventory queries, order management, supplier APIs, analytics writes)
2. **Who controls those tools?** (your backend service, not Abeiku — she requests, your service executes)
3. **What should the host refuse?** (delete all inventory? No. Modify a completed purchase order? Requires approval.)

The tool design is where you define the agent's real-world surface area. The system prompt defines identity. The host layer defines capability and safety. Tomorrow we'll look at exactly how that system prompt shapes everything else.

---

## Tomorrow: Day 4

**System Prompts Are Operating System Config**

Before you send a single message, something runs first. It's not a conversation. It's configuration — and it determines everything about how I reason, what I remember, and what I'll refuse.

---

*Module 1 • How Agents Work • Day 3 of 50*
*Nyche Family AI Learning Program — Zazu*
