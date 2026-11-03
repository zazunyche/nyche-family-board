# AI Agents Day 66: Tool Calls Are Structured Text, Not Magic

**Module 2, Mini-Module 2.1 — Tools and Function Calling | Day 66 of the Nyche AI Curriculum**

---

## Where We Are

Module 1 is complete. Over more than fifty days, you built a precise mental model of what agents are: decision-making loops (Mini-Module 1.1), running on probabilistic next-token prediction (Mini-Module 1.2), constrained by a finite context window and four types of memory (Mini-Module 1.3), and equipped with reasoning mechanisms — chain-of-thought, ReAct, extended thinking, and planning — that let them think before, during, and across their work (Mini-Module 1.4).

Module 2 is different in character. Module 1 was about the internal world of agents: how they represent knowledge, reason about problems, and maintain state. Module 2 is about the external world: how agents reach out and *act* — calling functions, querying databases, sending emails, coordinating with other agents, and ultimately getting deployed in production systems where reliability matters.

We start at the most foundational piece: the tool call. Every subsequent topic in Module 2 — tool design, MCP, multi-agent orchestration, agentic loop construction, production reliability — builds on understanding this mechanism exactly right. Get this one wrong and the rest will stay fuzzy. Get it right and everything else clicks into place.

---

## The Misconception to Unlearn First

When most people hear that Claude can "call a function" or "use a tool," they picture something like a plugin that runs inside the model — Claude pressing an internal button, directly reaching into a database, executing code in real-time as part of its generation process.

That is not what happens. Not even close.

Claude is a text-in, text-out system. What it receives is text. What it outputs is text. The model cannot directly write to a database, make an HTTP request, read a file, run Python, or perform any action in the world. It generates tokens — that is the entirety of what happens inside the model.

What we call "tool calls" are a structured text convention: a specific format the model has been trained to produce when it decides it wants external information or wants an action taken on its behalf. Your application reads that formatted text, does the actual work, and feeds the result back into the conversation as more text. The model then continues generating from the updated conversation.

Tools are not plugins. They are a protocol — a structured way for the model to request that your code do something.

This distinction is not pedantic. It has direct consequences for how you design agents, how you think about security, and how you debug when things go wrong.

---

## What Actually Happens: The Complete Cycle

Here is the full sequence when Claude "calls a tool," step by step:

```
You (App)                    Claude (Model)              Your Tool Code
    |                              |                           |
    |--- messages +                |                           |
    |    tool_definitions -------> |                           |
    |                              |  (generates response)     |
    |                              |  stop_reason: "tool_use"  |
    | <--- tool_use block -------- |                           |
    |   {name, id, input: {...}}   |                           |
    |                              |                           |
    |--- executes tool ------------|-------------------------> |
    |                              |                 (runs the function)
    | <------- result -------------|-------------------------- |
    |                              |                           |
    |--- appends tool_result       |                           |
    |    to messages               |                           |
    |                              |                           |
    |--- messages (updated) -----> |                           |
    |                              |  (continues generating)   |
    | <--- final response -------- |                           |
```

Step by step in plain language:

**Step 1 — You send the initial request.** You include the conversation messages and a list of tool definitions: what tools are available, what each one does, and what inputs it accepts. This is how Claude learns what tools exist.

**Step 2 — Claude decides to use a tool.** If Claude determines it needs external data or wants an action taken, it stops generating with `stop_reason: "tool_use"` and includes a `tool_use` content block in its response containing the tool name and its desired inputs.

**Step 3 — Your application reads the tool_use block.** Your code inspects the response, identifies which tool was requested, and extracts the inputs.

**Step 4 — Your application executes the tool.** This is the only moment anything actually happens in the world — your code queries a database, calls an API, reads a file, or performs whatever the tool does.

**Step 5 — You append a tool_result block.** You take the output of your execution and add it to the conversation as a `tool_result` message, referencing the `id` from the original tool_use block so Claude can match them up.

**Step 6 — You send the updated conversation back to Claude.** Claude reads the tool result as if it were real-world data — because it is — and continues generating its response from that point.

The model is never in the execution path. It writes a structured request; your code fulfills it.

---

## Anatomy of the Tool_Use Block

When Claude decides to use a tool, the content block in its response looks like this:

```json
{
  "type": "tool_use",
  "id": "toolu_01ABC123",
  "name": "get_inventory",
  "input": {
    "sku": "SKU-482",
    "warehouse": "NJ-01"
  }
}
```

Four fields:

- **type:** Always `"tool_use"`. This tells your application this is a tool invocation, not regular text output.
- **id:** A unique identifier for this specific call instance. You reference this ID when returning the result so Claude can match result to request.
- **name:** Which tool Claude wants to invoke — must exactly match a tool name in the definitions you provided. If Claude generates a name you didn't define, your application simply has no handler for it.
- **input:** A JSON object with the arguments Claude wants to pass, structured according to the schema you defined for that tool.

Your application executes the function with those inputs, then returns:

```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_01ABC123",
  "content": "{\"stock\": 14, \"threshold\": 20, \"status\": \"below_threshold\"}"
}
```

This `tool_result` is appended to the conversation messages. When Claude receives the next request, it reads this result just like it reads any other message — as text in the conversation. It then reasons about that data and decides what to say or do next.

---

## A Worked Earnventory Example

Suppose you've built a Claude-powered Earnventory agent and given it access to a `check_inventory` tool. Here's what the full exchange looks like at the message level:

**Your initial request:**
```
System: You are an Earnventory inventory assistant. Use the provided 
        tools to answer questions about current inventory levels.

User: Which of our active SKUs are below reorder threshold right now?

Tools: [check_inventory definition — see next section for the schema]
```

**Claude's first response:**
```
I'll check your current inventory levels across active SKUs.

[tool_use block]
{
  "type": "tool_use",
  "id": "toolu_01XYZ",
  "name": "check_inventory",
  "input": {"warehouse": "NJ-01", "filter": "active"}
}

stop_reason: "tool_use"
```

**Your application executes check_inventory(warehouse="NJ-01", filter="active"),** gets back a list of SKUs with their stock levels and thresholds, and appends:

```
[tool_result]
{
  "type": "tool_result",
  "tool_use_id": "toolu_01XYZ",
  "content": "[{\"sku\": \"SKU-482\", \"stock\": 14, \"threshold\": 20}, 
               {\"sku\": \"SKU-109\", \"stock\": 3, \"threshold\": 25},
               {\"sku\": \"SKU-301\", \"stock\": 84, \"threshold\": 30}]"
}
```

**Claude's final response:**
```
Two SKUs are currently below their reorder thresholds:

- SKU-482: 14 units in stock (threshold: 20) — moderate urgency
- SKU-109: 3 units in stock (threshold: 25) — critical, needs immediate action

SKU-301 is well-stocked at 84 units (threshold: 30).

Would you like me to draft a reorder email for either of the below-threshold SKUs?
```

Claude never accessed your database. It requested data through structured text, your code fetched it, Claude reasoned from the result. The model handled the decision-making; your application handled the execution.

---

## Why This Architecture Matters

This separation between model intent and application execution is not an implementation detail. It is a foundational design principle with significant consequences.

**Security boundary.** Your code controls what actually executes. The model cannot take actions beyond what you explicitly provide as tools. If Claude generates a `tool_use` block for a tool you didn't define, your application simply has no handler — nothing happens. The tool surface area you expose is the security perimeter of your agent. This is why we spend a full day later this module on the minimal-surface principle: give the agent only the tools it needs for the task, nothing more.

**Auditability.** Because every tool call is explicit structured text in the conversation, you can log every single action the agent intends to take, the inputs it provided, and the result it received. This is trajectory-level observability — you can reconstruct exactly what happened and why. Much harder to achieve if the model were executing code directly.

**Separation of concerns.** The model focuses on what it's good at: reasoning about what information is needed and what action makes sense next. Your application handles execution, error handling, retries, rate limiting, authentication, and the mechanical realities of running against real systems. These concerns stay cleanly separated.

**Operational control.** You define what tools exist and what they actually do. The model has no visibility into your implementation. A tool called `send_reorder_email` could, at your application layer, queue a human-review task rather than sending directly — the model sees the same interface either way. This gives you fine-grained control over what your agent can actually do, independent of what it thinks it can do.

---

## The Two Most Common Engineering Mistakes

**Mistake 1 — Vague or missing tool descriptions.** Claude decides which tool to call and what inputs to provide based primarily on the tool's name and description. If your tool is named `inv` and described as "gets inventory info," the model has to guess what it does and when to use it. Poor descriptions lead to wrong tool selections, malformed inputs, and agents that fail on tasks they should handle easily. Tool description is a craft — Day 67 covers it in depth.

**Mistake 2 — Breaking the loop on stop_reason: "tool_use".** This is the most common agentic loop bug. When Claude responds with `stop_reason: "tool_use"`, your loop must: execute the tool, append the result, and send the updated conversation back to Claude. If your code breaks out of the loop on `"tool_use"` instead of continuing, the agent silently stops mid-task with no error — it just never finishes. The correct pattern: keep looping while `stop_reason == "tool_use"`; only exit on `"end_turn"` or `"max_tokens"`. We build this loop explicitly in a later day.

---

## The Insight to Carry Forward

Tool calls are structured text that your application interprets and acts on. The model produces intent; your code produces action. They never overlap.

This means everything about tool behavior — what actions are available, what inputs are accepted, what results come back, what side effects actually occur — is entirely within your control as the application developer. You are not giving Claude access to your systems. You are giving Claude the ability to *request* that you exercise that access on its behalf, with your code as the gatekeeper at every step.

That framing changes how you think about agent security, reliability, and design. The model is not the risk surface. Your tool implementations are.

---

## Resources

- **Anthropic Tool Use Overview** — the complete protocol reference, including multi-turn tool use, parallel tool calls, and error handling: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
- **Anthropic Cookbook: Tool Use Examples** — runnable Python that walks through the full request → tool_use → tool_result → response cycle with real code: https://github.com/anthropics/anthropic-cookbook/tree/main/tool_use

---

*Tomorrow: Day 67 — Designing tools Claude can actually use. The description field is doing far more work than you think — and there's a craft to writing one that guides the model reliably.*
