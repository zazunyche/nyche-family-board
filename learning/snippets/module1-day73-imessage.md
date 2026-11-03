AI Agents Day 73: Tool Use in the Earnventory Context

**Concept:** Designing a tool set is an architecture decision, not a convenience one. Every tool you add widens the blast radius of a mistake. Every tool you omit narrows what the agent can accomplish. Good tool design is the intersection: exactly the tools the role requires, scoped as narrowly as each task needs, with irreversible actions separated from reversible ones. Six days of mechanics — this is what they add up to.

**Example:** An Earnventory reorder-monitoring agent needs four tools: `get_inventory_level`, `get_reorder_threshold`, `get_supplier_pricing`, and `create_draft_purchase_order`. That last one writes a *draft* — not a submitted order. The agent can do everything up to the decision point; a human confirms before money moves. It does *not* get `send_purchase_order`, `delete_inventory_record`, or `get_customer_data` — those are either irreversible, out of scope, or someone else's domain entirely.

**Analogy:** A new employee on their first week gets read access and a notepad for recommendations — not a purchase card. You build trust before you grant spend authority. Your agent earns the same treatment.

Tomorrow: from single-agent to multi-agent — why one well-tooled agent eventually hits a wall, and what comes next.
