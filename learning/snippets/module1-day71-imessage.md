AI Agents Day 71: Parallel Tool Calls — Two Clerk Windows at Once

**Concept:** Claude can call multiple tools in a single turn — simultaneously. When two pieces of information don't depend on each other, Claude requests both at once instead of waiting for the first result before asking for the second. This cuts latency in half for those steps.

**Example:** An Earnventory reorder check needs current stock level AND supplier lead time for SKU-482. These are independent facts — neither answer determines what to ask for the other. Claude issues `get_inventory_level` and `get_supplier_lead_time` in the same response. Your code runs both handlers, returns both results, and Claude reasons from both — one round trip instead of two.

The flip side: sequential tool chains. When tool B genuinely depends on tool A's output (you need the supplier ID before you can look up their pricing terms), Claude calls them in order. It infers dependency from context — you don't configure this explicitly.

**Analogy:** Parallel calls are ordering appetizers and drinks at the same time — they're independent, so there's no reason to wait. Sequential calls are ordering dessert only after seeing what's left after dinner — the second decision genuinely depends on the first.

Tomorrow: trust, permissions, and why minimal tool surface area isn't just good security — it's good architecture.
