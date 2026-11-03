# AI Agents Day 71: Parallel Tool Calls and Multi-Step Tool Chains

The basic tool-use loop is clean: Claude outputs a `tool_use` block, your code executes the handler, you return a `tool_result`, Claude continues. The problem is that many real agent tasks require multiple pieces of information before Claude can make a decision — and if every piece requires its own round trip, latency compounds fast.

An agent that needs five independent facts, fetched sequentially, waits through five full API exchanges before it starts composing an answer. Claude's tool-use protocol has two mechanisms to handle this: **parallel tool calls** for independent information, and **sequential tool chains** for dependent information. Understanding when each applies, and how to design tool sets that enable them, is one of the more concrete skills in production agent development.

---

## Part 1: Parallel Tool Calls

### What they are

When Claude determines that two or more tool calls are independent — neither result affects what the other asks — it can issue them simultaneously in a single response. Your code receives multiple `tool_use` blocks in one API response, runs them concurrently, and returns multiple `tool_result` blocks in the next turn. Claude then reasons from all results at once.

At the API level:

```
Claude → [tool_use: get_inventory_level(sku="SKU-482"),
           tool_use: get_supplier_lead_time(sku="SKU-482", supplier="SUP-019")]

Your code → [both handlers execute concurrently]

You → [tool_result: {"stock": 12, "reorder_point": 50},
        tool_result: {"lead_time_days": 14, "min_order_qty": 100}]

Claude → "Stock is 38 units below reorder point. With a 14-day lead time,
          we should order at least 100 units now..."
```

One round trip. Both facts. Claude composes the decision.

### How Claude decides to parallelize

Claude infers parallelism from semantic dependency. "Check stock AND lead time for SKU-482" — those are independent, and Claude will typically call them in parallel. "Find which supplier carries SKU-482, then check that supplier's pricing" — the second call depends on the first result, so Claude issues them sequentially.

You don't configure this explicitly. The model infers it. Your job is to write clear tool names and descriptions so that the dependency (or lack of it) is obvious from context.

### The latency math

An Earnventory reorder decision needs:
- Current inventory level
- Supplier lead time
- Current commodity spot price (web search)
- Historical demand average from the last 90 days

Sequential, at roughly 800ms per API round trip: **~3.2 seconds** before Claude starts reasoning.

Parallel, with all four calls independent: **~800ms** total. Then Claude composes.

For a single decision that's already a 4x difference. For an agent running this check across 50 SKUs, the arithmetic shifts further. Parallel tool calls aren't a performance optimization — they're a workflow design choice that determines whether an agent is usable in practice.

### Designing for parallelism

The key principle: **narrow, composable tools enable parallelism; wide tools collapse it.**

A single `get_all_supplier_data(supplier_id)` that returns inventory, pricing, lead time, and payment terms is convenient to write. But it can't be called in parallel with itself to get different facets of the same supplier — you get everything or nothing. A set of narrow tools — `get_supplier_pricing`, `get_supplier_lead_time`, `get_supplier_payment_terms` — can be called simultaneously whenever their results are independent, which in most workflows they are.

Wide tools feel efficient in the short run. Narrow tools make the agent faster at runtime, fail more cleanly when one fact is unavailable, and give Claude more granular control over what it fetches and why.

---

## Part 2: Sequential Tool Chains

### What they are

Some tasks genuinely require sequential calls: step N's result determines what step N+1 asks for. This is a tool chain, and it's the correct structure when dependency is real.

A concrete Earnventory example of a 3-step chain:

**Step 1** — Find suppliers for a category:
```
tool_use: search_suppliers(category="glass_bottles")
tool_result: ["SUP-019", "SUP-031", "SUP-044"]
```

**Step 2** — Once you have the IDs, fetch pricing in parallel:
```
tool_use: get_supplier_pricing(supplier="SUP-019", sku="SKU-482")
tool_use: get_supplier_pricing(supplier="SUP-031", sku="SKU-482")
tool_use: get_supplier_pricing(supplier="SUP-044", sku="SKU-482")

tool_result: {price: 4.20, lead_time: 14}   [SUP-019]
tool_result: {price: 3.95, lead_time: 21}   [SUP-031]
tool_result: {price: 4.50, lead_time: 10}   [SUP-044]
```

**Step 3** — After reasoning about the results, draft the order:
```
tool_use: draft_purchase_order(supplier="SUP-044", quantity=200)
tool_result: {draft_id: "PO-2026-0441", status: "ready_for_review"}
```

Three turns. One sequential dependency (step 1 → step 2), one parallel batch within step 2, one action in step 3. This is what production agentic workflows look like: chains where necessary, parallelism where possible, within a single coherent loop.

### Full loop, schematically

```
Turn 1: Claude calls search_suppliers
         You return supplier IDs

Turn 2: Claude calls get_supplier_pricing × 3 in parallel
         You return all three pricing results

Turn 3: Claude reasons, calls draft_purchase_order
         You return draft confirmation

Turn 4: Claude summarizes and asks for approval
```

Four turns total. An agent that ran these sequentially — one pricing call per turn — would take six turns for the same workflow. The difference is just whether Claude recognizes that the three pricing calls in step 2 are independent of each other (they are) and issues them together.

---

## Part 3: Error Propagation in Chains

In a sequential chain, failure in step N cascades. If `search_suppliers` returns an empty list, step 2 has nothing to iterate over — and if your tool handlers return opaque errors, Claude may stall, retry incorrectly, or hallucinate a workaround.

The design rule: **every tool result should be self-describing, including failures.**

Not:
```json
{"error": true, "code": 404}
```

But:
```json
{
  "error": "No approved suppliers found for category 'glass_bottles'. 
            3 suppliers were found but are currently on hold: SUP-019 (payment dispute), 
            SUP-031 (quality audit), SUP-044 (contract expired). 
            Consider checking unapproved vendor list or broadening category."
}
```

That second format gives Claude enough context to reason about the failure — it can surface the information to you, suggest alternatives, or ask a clarifying question. The first format gives Claude a dead end.

The same principle applies to partial results. If your pricing handler returns data for two suppliers but times out on the third, return a partial result with a clear note: `{"result": [...two results...], "partial": true, "missing": ["SUP-044"], "reason": "timeout after 5s"}`. Claude can reason about a partial result. It can't usefully reason about a silent failure.

---

## Part 4: What This Means for Earnventory

An Earnventory reorder agent with well-designed tools can handle a full workflow in four to five turns:

```
Turn 1 [parallel]: Check inventory levels for all monitored SKUs simultaneously
Turn 2 [no tool]:  Claude identifies which SKUs are below threshold
Turn 3 [parallel]: For each low-stock SKU, fetch supplier options simultaneously  
Turn 4 [sequential]: For each, draft a purchase order with the preferred supplier
Turn 5 [no tool]:  Claude summarizes all drafted orders and requests review
```

That's 50 SKUs checked, 8 below threshold, 8 purchase orders drafted, in roughly 3-4 seconds of API time — assuming the handlers are fast. The same workflow, run naively with one tool call per turn, would be 60+ turns and potentially minutes of latency.

The difference is entirely in tool design and whether the agent can parallelize where the data dependencies allow it.

---

## Summary

```
PARALLEL tool calls
  When: two tool calls whose inputs don't depend on each other's outputs
  How:  Claude issues multiple tool_use blocks in a single response
  Why:  reduces round-trip count; 5 independent facts = 1 turn, not 5

SEQUENTIAL tool chains  
  When: step N+1's input depends on step N's output
  How:  Claude issues one tool_use, receives result, issues the next
  Why:  dependency is real; you can't skip steps

MIXED (most real workflows)
  Sequential between dependent steps
  Parallel within each step where calls are independent

KEY DESIGN RULE
  Narrow, composable tools → parallelism possible
  Wide, all-in-one tools   → parallelism collapsed, failures less informative

ERROR DESIGN RULE
  Tool results must be self-describing, including failures
  Give Claude enough context to reason about what went wrong
```

---

Tomorrow: trust, permissions, and why giving your agent the minimum tools it needs isn't just a security principle — it's the correct architectural default for keeping agent behavior predictable and auditable.

---

**Free resources:**
- Anthropic tool use guide (parallel tool calls): https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview
- "Building Effective Agents" — Anthropic Engineering: https://www.anthropic.com/engineering/building-effective-agents
