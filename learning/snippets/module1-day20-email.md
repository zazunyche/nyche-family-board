# AI Agents Day 20: Tool Calls Are Structured Text, Not Magic

**Mini-Module 2.1 — Tools and Function Calling | Day 1 of 8**

---

Welcome to Module 2. You've spent the first 19 days learning how agents think — the loop, the model mechanics, context and memory, chain-of-thought, ReAct. Today we shift to how agents *act*. Specifically, how they reach out and interact with the world.

The most important thing to understand before anything else: **Claude does not execute tools. Your code does.**

Let's make that concrete.

---

## What Actually Happens When an Agent "Calls a Tool"

You ask Zazu: "Are there any unread emails from suppliers?"

Here is the actual sequence of events, step by step.

**Step 1 — Your application sends Claude a message with tool definitions**

You call the Anthropic API. In the request you include:
- The conversation history (the user's question)
- A system prompt defining Zazu's role
- A list of *tool definitions* — a menu of what Claude is allowed to request

The tool definitions tell Claude what's available. They are JSON schemas you write. We will cover how to write good ones tomorrow.

**Step 2 — Claude responds with a `tool_use` content block**

Claude does not respond with "I'll check your email now." It returns a structured block:

```
{
  "type": "tool_use",
  "id": "toolu_01A09q90qw90lq917835lq9",
  "name": "search_email",
  "input": {
    "query": "from:supplier is:unread",
    "max_results": 20
  }
}
```

This is the entire "tool call." It is JSON. It is text. Claude generated it the same way it generates any other output — by predicting tokens, one at a time, until the block was complete. No API call has been made. No email has been touched. Nothing has been executed.

**Step 3 — Your application executes the tool**

Your code reads the `tool_use` block, parses it, and calls the Gmail API (or whatever service). This is regular Python or JavaScript. Claude is not involved. You hold the OAuth credentials. You construct the HTTP request. You get results back.

**Step 4 — You return the result to Claude as a `tool_result`**

Your application appends a new message to the conversation:

```
{
  "type": "tool_result",
  "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
  "content": "Found 3 unread emails from suppliers:\n
    [1] Acme Co — Invoice #4521 (2026-07-05)\n
    [2] Global Parts — Pricing update (2026-07-04)\n
    [3] Meridian Supply — Order confirmation (2026-07-03)"
}
```

**Step 5 — You call the API again; Claude continues**

You make a second API call with the full conversation history now including the tool result. Claude sees the email results in its context window and generates the final user-facing response: "You have 3 unread emails from suppliers. The most recent is an invoice from Acme Co dated yesterday..."

---

## The Full Loop, Visualized

```
Your Application               Anthropic API            External Services
       |                             |                         |
       |--- messages + tools ------> |                         |
       |                             |                         |
       |                        Claude generates               |
       |                        tool_use JSON block            |
       |                             |                         |
       | <-- tool_use response ----- |                         |
       |                             |                         |
       |--- execute tool locally --------------------------> Gmail
       |    (your code, your keys,                             |
       |     your permissions)                                 |
       | <-- results ----------------------------------------- |
       |                             |                         |
       |--- append tool_result ----> |                         |
       |    call API again           |                         |
       |                        Claude reads result            |
       |                        generates final response       |
       |                             |                         |
       | <-- final response -------- |                         |
       |                             |                         |
  Return to user
```

The API boundary is where Claude stops and your application begins. Claude never crosses it. It produces a request. You fulfill the request. You report back.

---

## `stop_reason`: How Your Loop Knows What to Do

Every response from Claude includes a `stop_reason` field. This is the signal your agentic loop acts on.

```
stop_reason: "tool_use"   → Claude needs a tool executed; loop continues
stop_reason: "end_turn"   → Claude is done; return response to user
stop_reason: "max_tokens" → Hit token limit; handle as error
```

The minimal agentic loop in pseudocode:

```python
conversation = [{"role": "user", "content": user_message}]

while True:
    response = anthropic.messages.create(
        model="claude-sonnet-4-6",
        system=system_prompt,
        messages=conversation,
        tools=tool_definitions,
        max_tokens=4096
    )

    if response.stop_reason == "end_turn":
        return extract_text(response.content)  # done

    if response.stop_reason == "tool_use":
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = execute_tool(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result
                })

        # Append Claude's assistant turn AND the tool results
        conversation.append({"role": "assistant", "content": response.content})
        conversation.append({"role": "user", "content": tool_results})
        # Loop back, call API again
```

That is the agentic loop. Everything else — retries, error handling, context compaction — is built on top of this pattern.

---

## Why This Architecture Is Not Accidental

The design where Claude produces structured text and your application executes it is deliberate. It carries significant implications for security, reliability, and control.

**Security boundary.** Claude never has direct access to your systems. The tool definition list is your security perimeter. If you don't define a `delete_all_records` tool, Claude cannot delete records, regardless of what a user asks or what a malicious prompt injection attempts. You control what windows exist at the clerk's office.

**Auditability.** Every tool call is explicit and inspectable. You can log the exact JSON Claude requested and the exact response your system returned. In an Earnventory context — where purchase orders and financial data are involved — this is not optional. You need a full trace of what the agent requested and what it executed.

**Controllability.** You can intercept and validate any tool call before executing it. Require human approval before sending a purchase order? Add a confirmation step between receiving the `tool_use` block and executing. Claude never knows a pause happened. It just receives the result when you're ready. This is how you build human-in-the-loop checkpoints without changing anything in the model.

**Resilience.** Tool calls are retryable. If an external API returns a 500 error, your application can retry and return the result without Claude knowing about the failure. You can also return structured error information as the `tool_result` content, and Claude will reason about what to do next — often it will try an alternative or ask for clarification.

---

## Multiple Tool Calls in One Turn

Claude can request multiple tools in a single response when it determines it can gather information in parallel before reasoning about the combined results.

```
Response content (stop_reason: "tool_use"):
  block 1: tool_use — get_supplier_pricing  (supplier: ACME-001)
  block 2: tool_use — get_inventory_level   (sku: WH-5000)
  block 3: tool_use — get_exchange_rate     (from: EUR, to: USD)
```

When this happens, your application executes all three tools — potentially in parallel — collects all three results, and returns them together in a single `user` message before calling the API again. Claude sees all three results simultaneously on the next turn and can reason across them.

This is efficient: one round-trip to Claude, three data fetches, one synthesis. We will cover parallel tool call design in depth on Day 25.

---

## The Surgeon-Nurse Analogy

Claude is a surgeon dictating orders to a scrub nurse.

"Hand me the 10-blade. Lap pad. Suction. Give 10mg of epinephrine."

The nurse executes each order. The surgeon never touches the IV line directly. The surgeon never opens the supply cabinet. The OR protocols — which drugs the nurse is authorized to administer, which instruments are on the tray — are defined before the procedure begins. They are not renegotiated during the operation.

Your tool definitions are the OR setup. The system prompt is the surgical protocol. Claude is the surgeon. Your application is the scrub nurse. The patient is getting the attention they need, but through a careful division of roles with clear authority and clear accountability at each step.

What makes this analogy precise: the surgeon gives orders in natural language (or surgical shorthand), but the nurse executes them according to actual physical procedures. The surgeon's "give 10mg epinephrine" causes a real injection. Claude's `{"name": "send_email", "input": {...}}` causes a real email. The text is the interface. The execution is yours.

---

## Earnventory Application: Mapping Tools to Actions

For Earnventory, a minimal tool set might look like this:

```
Tool                      What it does                     Who executes
---------------------------------------------------------------------------
get_inventory_level       Returns stock count for a SKU    Your database
get_supplier_pricing      Returns current supplier prices  Supplier API
search_purchase_orders    Returns PO history               Your database
draft_purchase_order      Creates a draft PO (unsent)      Your database
submit_purchase_order     Sends a finalized PO             Your DB + email
get_exchange_rates        Returns current FX rates         External API
search_emails             Finds emails by query            Gmail API
```

Notice the split between `draft_purchase_order` and `submit_purchase_order`. Claude can draft freely; submitting requires an explicit separate action. This gives you a natural checkpoint: run the draft tool automatically, but gate `submit` behind human review or a separate confirmation flow. The irreversible action is isolated into its own tool, which you can wrap with validation or approval logic.

This is the reversibility principle applied to tool design. You will see it come up again in Mini-Module 2.4 (Production Reliability) as one of the most important safety patterns for agentic systems.

---

## What Claude Needs to Call a Tool Correctly

For Claude to generate a correct `tool_use` block, three things must be present in the tool definition:

1. **Name** — used to identify which tool was called; should be clear and specific
2. **Description** — this is what Claude reads to decide *whether* to call this tool and *when*; this is the most important field
3. **Input schema** — a JSON Schema object describing what parameters the tool accepts; Claude fills this in

Tomorrow we will go deep on writing tool descriptions that guide model behavior reliably. The short version: vague descriptions cause Claude to call the wrong tool or hallucinate parameter values — silently, without any error. The quality of your tool definitions is a direct multiplier on the reliability of your agent.

---

## Free Resources

- **Anthropic Tool Use overview** — https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview
  The canonical reference for the tool-use API format, with complete code examples in Python and TypeScript. Read the "How tool use works" section — it matches exactly what we covered today.

- **"How to Build an AI Agent from Scratch Using Claude API"** — https://dev.to/dextralabs/how-to-build-an-ai-agent-from-scratch-using-claude-api-with-full-code-4b40
  A practical walkthrough with real code showing the agentic loop we described above. Good for seeing how the loop looks in a complete working program rather than pseudocode.

---

*Day 21 tomorrow: Designing tools Claude can actually use. What goes in the description field, how to structure parameter schemas, and why a poorly named tool will get called at the wrong time every time.*
