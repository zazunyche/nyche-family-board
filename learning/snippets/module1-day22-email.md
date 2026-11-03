# AI Agents Day 22: Client-Side vs. Server-Side Tools

**Mini-Module 2.1 — Tools and Function Calling | Day 3 of 8**

---

Yesterday we went deep on tool *descriptions* — the mechanism that tells Claude when to call a tool, what to pass in, and what to expect back. We treated all tools as equivalent from a description standpoint, because at that level they are. The description pattern applies universally.

Today we break open a distinction that the description layer deliberately hides: **where does the tool actually execute?**

The answer splits every tool in a Claude deployment into one of two fundamentally different architectures. Understanding the split determines what you can build with each type, what you pay, and what you're responsible for when something goes wrong.

---

## Two Architectures, One Interface

From Claude's perspective, all tools look the same. A `tool_use` block is a `tool_use` block — name, inputs, structured JSON. Claude doesn't know or care whether a tool runs on your server in Manhattan or in Anthropic's data center in Iowa. The interface is identical in both directions.

From the developer's perspective, the execution path is completely different.

**Client-side tools** (also called developer-executed tools): You write the function. You host the code. When Claude outputs a `tool_use` block for your `get_inventory` function, your application catches it, runs the function against your Earnventory database, gets the result, and returns it as a `tool_result`. Anthropic's infrastructure never touches the execution — they just routed the structured JSON to you.

**Server-side tools** (also called Anthropic-hosted tools): Anthropic writes the function and runs it on their infrastructure. When Claude calls `web_search`, Anthropic's servers execute the search query against the live web, package the results, and inject them back into the conversation — without your application doing anything except making the original API call with those tools enabled. You never write a handler. You never see the execution. You get the result.

---

## ASCII Diagram: The Two Execution Paths

```
CLIENT-SIDE TOOL (e.g., get_inventory)
──────────────────────────────────────────────────────
YOUR APP                  ANTHROPIC               YOUR APP
  │                           │                       │
  │── API request ──────────► │                       │
  │   tools: [get_inventory]  │                       │
  │   messages: [...]         │                       │
  │                           │ Claude reasons...     │
  │                           │ → calls get_inventory │
  │◄── tool_use block ───────  │                       │
  │    {name: "get_inventory", │                       │
  │     input: {sku: "ERN-42"}}│                       │
  │                           │                  YOUR CODE RUNS
  │                           │                  result = db.query(sku)
  │                           │                       │
  │── tool_result ──────────► │                       │
  │   {quantity_on_hand: 17}  │                       │
  │                           │ Claude continues...   │
  │◄── final response ──────  │                       │


SERVER-SIDE TOOL (e.g., web_search)
──────────────────────────────────────────────────────
YOUR APP                  ANTHROPIC
  │                           │
  │── API request ──────────► │
  │   tools: [web_search]     │
  │   messages: [...]         │
  │                           │ Claude reasons...
  │                           │ → calls web_search
  │                           │ ANTHROPIC EXECUTES SEARCH ◄── live web
  │                           │ results injected into context
  │                           │ Claude continues...
  │◄── final response ──────  │
  │   (includes synthesized   │
  │    search findings)       │
```

The left column is the same in both cases: your application sends a request, gets a response. The difference is what happens in the middle.

---

## What Tools Are Server-Side Today

Anthropic currently provides two major server-side tools through the Claude API:

**`web_search`** — Real-time web search. Claude queries the live web for current information: today's commodity prices, a supplier's current contact page, recent news about a manufacturer. You include `{"type": "web_search_20250305"}` in your tools list. That's it — Anthropic handles the search infrastructure, rate limiting, result parsing, and injection. The results appear in Claude's context as if a tool_result had been returned.

**`code_execution`** — A sandboxed Python 3 runtime. Claude can write and execute Python code in an isolated environment that Anthropic manages. No external network access from the sandbox, no access to your data. Used for data analysis, mathematical computation, and anything that benefits from real code running rather than Claude approximating the answer in text. Output (stdout, generated data, files) is returned into the conversation.

These aren't the only hosted capabilities Anthropic has built, but they're the most widely used tools in the API as of mid-2025. Computer use (controlling a desktop UI) is a third category — technically it uses a client-side execution pattern where you implement the screenshot/keyboard/mouse handlers, but Anthropic provides the tool type definition and the model fine-tuned to use it.

---

## Pricing: Where Server-Side Tools Differ

With client-side tools, you pay exactly the token cost: input tokens for the `tool_use` block, output tokens for the `tool_result` you send back. The execution itself has no additional charge — running your Python function is on your compute, not Anthropic's billing.

With server-side tools, there's an execution charge layered on top of the token cost:

```
┌─────────────────┬──────────────────────┬──────────────────────────────┐
│ Tool            │ Additional charge    │ What you're paying for       │
├─────────────────┼──────────────────────┼──────────────────────────────┤
│ web_search      │ Per search query     │ Anthropic's search infra,    │
│                 │ (on top of tokens)   │ live web retrieval, parsing  │
├─────────────────┼──────────────────────┼──────────────────────────────┤
│ code_execution  │ Per execution        │ Compute in Anthropic's       │
│                 │ session (+ tokens)   │ sandboxed Python environment │
├─────────────────┼──────────────────────┼──────────────────────────────┤
│ Client-side     │ No execution charge  │ Token cost only; execution   │
│ tools           │                      │ runs on your compute         │
└─────────────────┴──────────────────────┴──────────────────────────────┘
```

The practical implication: if Claude calls `web_search` four times in a single workflow (searching for multiple supplier sites), you're charged four search queries plus the token cost of each exchange. For high-volume production agents, this adds up — and you don't directly control how many times Claude decides to search within a given turn.

This is one reason precise tool descriptions matter for server-side tools too: a tight description of when to call `web_search` vs. when to answer from training data prevents unnecessary queries that cost money without adding value.

---

## Security and Trust Boundaries

The execution location determines the security model, and the differences are significant.

**Client-side tools: you own the trust boundary.**

Your `get_inventory` function runs in your application, on your server, with your authentication, against your database. You control:
- What data it can query (and what it cannot)
- What side effects it can cause (writing, deleting, sending)
- How it validates inputs before executing
- What happens if Claude passes a malformed parameter
- The logging and audit trail

This is full control and full responsibility. If your `send_purchase_order` tool lacks input validation, a prompt injection attack could cause Claude to pass arbitrary values to your handler — and your code would execute them.

**Server-side tools: Anthropic owns the trust boundary.**

When Claude calls `web_search`, Anthropic's servers make the outbound HTTP request. That execution environment:
- Cannot access your Earnventory database
- Cannot send emails on your behalf
- Cannot read files from your server
- Runs in an isolated environment with no persistent state between calls

This isolation is a security feature, not just an infrastructure detail. A malicious web page that tries to inject instructions into search results can influence what Claude *reads* and *reasons about* (prompt injection through external content is a real attack vector — we'll cover this on Day 26), but it cannot touch your private systems through the search tool itself. The blast radius is contained to Claude's reasoning, not your systems' data or state.

---

## When to Use Which

The decision is almost always determined by data access:

**Use client-side tools when:**
- The data or action lives in your private systems (database, email, CRM, ERP)
- You need fine-grained control over authentication, rate limiting, or error handling
- The tool has write effects (creating records, sending emails, placing orders)
- You need a detailed audit trail of every execution
- The function logic is specific to your business domain

**Use server-side tools when:**
- You need live public information (current web content, real-time commodity data)
- You want Claude to execute and validate code without your infrastructure
- You'd otherwise build a significant integration (search API, code sandbox) just to provide one capability
- The action is read-only, public, and stateless from your systems' perspective

There's a clean test for the ambiguous cases: **would Anthropic's servers ever have legitimate access to this data?** If no — if the data lives behind your authentication, your VPN, your business logic — it's client-side by definition. Anthropic's servers have no visibility into your Earnventory instance. Every tool that queries or modifies your inventory, suppliers, orders, or financials is client-side. That's the correct architecture.

---

## Applying the Split to Earnventory

A practical Earnventory agent tool set, sorted by execution side:

**Client-side (you implement the handler):**
- `get_inventory` — queries your Earnventory stock table
- `search_suppliers` — searches your supplier database
- `get_supplier_pricing` — fetches pricing from your procurement records
- `draft_purchase_order` — creates a draft PO in your system
- `submit_purchase_order` — submits a finalized PO to your ERP
- `send_supplier_email` — sends email via your authenticated email account

**Server-side (Anthropic executes on your behalf):**
- `web_search` — used when the agent needs to look up a supplier's current website, check a commodity spot price, or verify a company's public information
- `code_execution` — used when the agent needs to run calculations: multi-SKU margin analysis across currencies, generating a summary of complex pricing data

The server-side tools aren't calling your database — they're doing things in the open, public world. Your business data flows only through the client-side tools you wrote and control.

---

## The Hidden Complexity: Hybrid Workflows

The most interesting agent behaviors combine both types in a single workflow. Consider this Earnventory scenario:

> "Check if we have enough Widget-A inventory. If we're below reorder threshold, look up the current spot price for the raw material from the commodity index, then draft a purchase order that accounts for the price change."

Step-by-step execution:

```
Step 1: get_inventory(sku="ERN-2241-B")
        → CLIENT-SIDE
        → your DB returns {quantity: 8, reorder_threshold: 25}
        → Claude reasons: below threshold, need current commodity price

Step 2: web_search("copper spot price commodity index 2026-07-08")
        → SERVER-SIDE
        → Anthropic fetches live data, returns price quote
        → Claude reasons: price up 12% since last PO, adjust order quantity

Step 3: draft_purchase_order(
          supplier_id="SUP-1042",
          line_items=[{sku: "ERN-2241-B", quantity: 100}],
          notes="Quantity adjusted for spot market increase of ~12%"
        )
        → CLIENT-SIDE
        → your system creates the draft, returns draft_po_number
```

From your code's perspective: you handle two `tool_use` blocks (steps 1 and 3), and one `web_search` call that Anthropic handles entirely (step 2). You implement handlers for 2 out of 3 tool calls. The third is infrastructure you're renting from Anthropic per-query.

This hybrid pattern — private data through your tools, public data through Anthropic's — is the design that most production agents settle into. It combines full control over your data with access to live world information you don't have to maintain.

---

## Free Resources

- **Anthropic tool use documentation** — https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview  
  The primary reference for both client-side and server-side tool types. The "Tool types" section covers Anthropic-provided tools alongside developer-defined tools. Best place to see what server-side tools are currently available and their exact enabling syntax.

- **Anthropic web search tool reference** — https://docs.anthropic.com/en/docs/build-with-claude/tool-use/web-search-tool  
  Specific to `web_search`: how to enable it, what it costs per query, how to interpret search results in the conversation, and the trust model for externally-retrieved content. Directly relevant if you add live web lookups to any Earnventory agent.

---

*Day 23 tomorrow: building a real tool for Earnventory end-to-end — JSON schema, handler function, error cases, and what a `tool_result` should look like when things go wrong.*
