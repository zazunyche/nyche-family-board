# AI Agents Day 25: Parallel Tool Calls and Multi-Step Tool Chains

**Mini-Module 2.1 — Tools and Function Calling | Day 6 of 8**

---

Yesterday you got MCP — the standard protocol that decouples your tool implementations from any specific model or framework. Now we go one layer deeper into how those tools actually get called during a real agentic task.

Every agent workflow that's more than trivial requires multiple tool calls. The question is: in what order, and how many at once? The answer shapes the latency, reliability, and design of everything you build. Today's snippet is about the mechanics of parallel tool calls and sequential tool chains — what they are, when each applies, and how to design your tool set so Claude uses them correctly.

---

## The Latency Problem in Tool-Heavy Agents

Imagine you're building an Earnventory feature: "Every morning, check our three main suppliers for new pricing updates, pull yesterday's sales figures, and draft a margin summary." That's four operations: three pricing checks plus one sales query.

If you architect this naively, the agent might do it like this:

```
Turn 1:  Claude calls get_supplier_pricing(SUP-A)    → waits → result
Turn 2:  Claude calls get_supplier_pricing(SUP-B)    → waits → result
Turn 3:  Claude calls get_supplier_pricing(SUP-C)    → waits → result
Turn 4:  Claude calls get_sales_figures(yesterday)   → waits → result
Turn 5:  Claude drafts the margin summary
```

If each tool call takes 300ms (a realistic external API latency), that's 1,200ms of waiting before the model can write a single word of your summary. Four round trips, each incurring the full network latency.

The better architecture:

```
Turn 1:  Claude calls all four tools simultaneously  → waits → all results arrive together
Turn 2:  Claude drafts the margin summary
```

Same work, 300ms of waiting instead of 1,200ms. That's the value of parallel tool calls: **independent operations that could run simultaneously should run simultaneously.**

---

## How Parallel Tool Calls Work at the API Level

When Claude decides to call multiple tools in one turn, it returns them all in a single response — as a list of `tool_use` blocks, not one at a time. Your application code is responsible for dispatching them concurrently and returning all results before the next model call.

Here's what a parallel response looks like:

```
Claude's response (stop_reason: "tool_use"):
[
  {
    "type": "tool_use",
    "id": "toolu_01",
    "name": "get_supplier_pricing",
    "input": {"supplier_id": "SUP-A"}
  },
  {
    "type": "tool_use",
    "id": "toolu_02",
    "name": "get_supplier_pricing",
    "input": {"supplier_id": "SUP-B"}
  },
  {
    "type": "tool_use",
    "id": "toolu_03",
    "name": "get_supplier_pricing",
    "input": {"supplier_id": "SUP-C"}
  },
  {
    "type": "tool_use",
    "id": "toolu_04",
    "name": "get_sales_figures",
    "input": {"date": "2026-07-10"}
  }
]
```

Your application runs all four concurrently (Python asyncio, JavaScript Promise.all, or similar). When all four complete, you bundle their results and send them back to the model together:

```
Your response to Claude (role: "user"):
[
  {"type": "tool_result", "tool_use_id": "toolu_01", "content": {...}},
  {"type": "tool_result", "tool_use_id": "toolu_02", "content": {...}},
  {"type": "tool_result", "tool_use_id": "toolu_03", "content": {...}},
  {"type": "tool_result", "tool_use_id": "toolu_04", "content": {...}}
]
```

Critically: **Claude waits for all tool results before generating its next token.** You must return all results in a single user message, not one at a time. The model treats the entire batch as one observation step before reasoning about what to do next.

---

## When Claude Chooses to Parallelize

Claude decides whether to call tools in parallel or sequentially based on whether the calls appear to be independent. You can influence this through tool descriptions and prompting, but the model is making the judgment call.

Claude will typically parallelize when:
- Multiple tools are called with different inputs and none obviously depends on the others
- You explicitly indicate independence ("check these three suppliers simultaneously")
- The task is clearly a fan-out pattern: one request, multiple equivalent sub-tasks

Claude will typically serialize when:
- A tool call's input uses the output of the previous call
- The task is described sequentially ("first check X, then based on that, do Y")
- Tool descriptions imply an ordering

The rule of thumb: if you can mentally run the operations in parallel on a whiteboard without ambiguity, Claude will usually try to parallelize them. If one result is a precondition for the next call, Claude will naturally sequence them.

---

## Sequential Tool Chains: When Order Is Required

Sometimes you genuinely cannot parallelize. Sequential chains are when the output of one tool becomes the input of the next:

```
Turn 1:  get_latest_invoice(supplier_id: "SUP-A")
         → returns {invoice_id: "INV-9912", line_items: [...]}

Turn 2:  get_current_pricing(sku_ids: ["WN-001", "WN-003"])
         → uses the SKU IDs extracted from the invoice
         → returns current prices for comparison

Turn 3:  calculate_margin_delta(invoice_prices, current_prices)
         → uses both previous results
         → returns {sku: "WN-001", delta: -0.12, flag: "margin_risk"}
```

This three-step chain cannot be parallelized: you need the invoice to know which SKUs to look up; you need the current prices to calculate the delta. The dependency graph forces the sequence.

Here is the full picture of how parallel and sequential patterns combine in a real workflow:

```
┌──────────────────────────────────────────────────────────────────┐
│             MIXED PARALLEL + SEQUENTIAL WORKFLOW                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STEP 1: Fan-out (parallel — independent, no dependencies)       │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │  get_latest_invoice(SUP-A) ──────────────────────────►  │    │
│  │  get_latest_invoice(SUP-B) ──────────────────────────►  │    │  ← one API round trip
│  │  get_latest_invoice(SUP-C) ──────────────────────────►  │    │
│  │                                                          │    │
│  └──────────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│  STEP 2: Fan-in then fan-out (parallel — same tool, diff inputs) │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  get_current_pricing(skus from SUP-A invoice) ────────►  │    │
│  │  get_current_pricing(skus from SUP-B invoice) ────────►  │    │  ← one API round trip
│  │  get_current_pricing(skus from SUP-C invoice) ────────►  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│  STEP 3: Sequential — reasoning over combined results            │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  draft_margin_summary(all invoice + pricing data)        │    │  ← model generates text
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Total API round trips: 3  (instead of 7 if fully sequential)    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Step 1 is parallel (three independent invoice lookups). Step 2 is also parallel but depends on Step 1 (three pricing lookups, where the inputs come from Step 1's results). Step 3 is a single model generation turn using everything from Steps 1 and 2. Three round trips instead of seven.

---

## Designing Tool Sets for Parallelism

Whether an agent can parallelize effectively depends heavily on how you designed your tools. Two tool design choices matter most:

**1. Narrow, single-entity tools vs. batch tools**

A tool that accepts one SKU at a time (`get_pricing(sku_id)`) invites the model to call it multiple times in parallel. A tool that accepts a list (`get_pricing_batch(sku_ids: [])`) lets the model do the batching internally, which is often faster because it reduces the number of tool call round trips.

For Earnventory: if you expose `get_supplier_pricing(supplier_id)` as a single-supplier tool, Claude can call it three times in parallel for three suppliers. If you expose `get_multiple_supplier_pricing(supplier_ids: [])`, Claude makes one call. The batch tool is usually better for homogeneous operations because even a zero-latency in-process dispatch has overhead; fewer round trips to the model is almost always better.

**2. Granular decomposition vs. compound tools**

The flip side: don't over-compound. A tool called `check_suppliers_then_analyze_margins` is doing two things. When part of it fails, you don't know which part. When the agent only needs the supplier data, it can't get it without also running the margin analysis. Keep tools single-responsibility so the model can compose them flexibly.

The sweet spot: **single-responsibility, batch-capable tools**. One clear job. Accepts lists where the operation is uniform. Returns structured data the model can reason over.

---

## Multi-Step Tool Chains: Keeping Track of State

In a sequential chain, each step's output feeds the next. The model maintains this state in its context window — each tool result is appended to the conversation before the next model call. As chains grow long, you're consuming context budget with intermediate results that may not be needed in the final response.

This is a place where context engineering matters: if a chain produces a large intermediate result that the model only needs one field from, it helps to tell the model (or design your tools so that) it extracts just what's needed before proceeding. A tool that returns a 50-field JSON object when only `invoice_id` is needed downstream wastes context and can obscure the relevant signal.

For Earnventory agent chains: define what each step consumes and produces, and make sure intermediate tools return the minimum data required by the next step, not everything available. You're designing a pipeline, not a firehose.

---

## The Clerk Window Analogy, Continued

The government building from Day 20: the agent is the visitor, tool calls are forms submitted to clerk windows. Parallel tool calls are multiple windows you can visit simultaneously — you hand forms to windows 3, 7, and 11 at the same time, then collect all three responses before deciding your next move.

Sequential chains are the windows with dependencies: window 5 stamps your form, and window 8 explicitly requires window 5's stamp before it will process you. You cannot skip the order.

Designing your tool set is deciding which windows exist and what forms they accept. Well-designed windows: clear intake form (tool description), single purpose (one kind of clerk business), batch-capable (accept multiple forms in one submission when the work is uniform). Poorly designed windows: vague forms that leave the clerk guessing, windows that do two unrelated things, intake requirements so narrow you have to queue individually for every single item.

---

## Free Resources

- **Anthropic's tool use: parallel tool calls** — https://docs.anthropic.com/en/docs/build-with-claude/tool-use/parallel-tool-use  
  The official reference for parallel tool calls in the Claude API. Includes exact JSON examples for multi-tool responses and result batching. Read the "Forcing tool use" and "Handling multiple tool use" sections — these are the patterns you'll implement in the Earnventory agentic loop. The code examples are Python and TypeScript, both idiomatic.

- **"Agentic Design Patterns" by Andrew Ng (DeepLearning.AI)** — https://www.deeplearning.ai/the-batch/agentic-design-patterns-part-1-overview/  
  A four-part series on the patterns that make agents effective: reflection, tool use, planning, and multi-agent. Part 2 (tool use) is directly relevant today. Worth reading the full series if you have 20 minutes — it's concise and the vocabulary maps cleanly to everything this curriculum has covered. Ng coined "agentic design patterns" as a term; understanding the terminology helps when you're reading papers, product docs, or hiring engineers who've used it.

---

*Day 26 tomorrow: trust, permissions, and the minimal-surface principle — why giving an agent too many tools is a security risk, how prompt injection can hijack tool calls, and the single most important constraint to put on any agent before you deploy it.*
