**AI Agents Day 43: Putting It Together**

The past 7 days covered API calls, system prompts, prompt engineering, the agentic loop, the SDK, model selection, and structured outputs — all as separate pieces. Today they snap together.

A real Earnventory inventory agent in ~200 lines of Python has three layers:

**1. System prompt** — defines the agent as an inventory manager, lists available tools, and specifies exact output format (an XML `<summary>` block)

**2. Two tools** — `get_inventory(sku)` returns current stock + supplier info; `draft_reorder_email(sku, supplier_email, qty)` stages a draft (does not send)

**3. The loop** — call Claude → check `stop_reason` → if `tool_use`: execute tools, append results, call again → if `end_turn`: return the summary

Input: `["SKU-4821", "SKU-9034", "SKU-1102"]`. Output: "SKU-4821 at 12/20 units. Draft saved to Riverside Wholesale."

Every concept from this mini-module lives somewhere in those 200 lines.

**Analogy:** This is like seeing a finished building after studying the blueprint, foundation, framing, and wiring as separate lessons. Today the building stands.

Tomorrow we start Module 2.4 — production reliability. Because a demo that works 80% of the time is not a product.
