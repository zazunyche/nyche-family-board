Day 21: Designing Tools Claude Can Actually Use

Yesterday: tool calls are structured text. Claude writes the JSON, your code executes it. Today: the *quality* of that JSON is entirely determined by how you write the tool description — and most agents fail here.

Same function, two descriptions:

❌ `name: get_inventory` — "Get inventory info"
✅ `name: get_inventory` — "Return current stock count and reorder threshold for a specific Earnventory SKU. Use when the user asks about availability or stock levels for a known product. Returns: quantity_on_hand, reorder_threshold, warehouse_bin. For searching by keyword, use search_products instead."

With the weak version, Claude guesses when to call it and what it returns. With the strong version, it knows exactly when, why, and what to expect back — so it can plan the *next* step before it even calls this one.

Parameter names carry meaning too. `q` vs `search_query` vs `supplier_search_query` — Claude reads those names when constructing the input. Descriptive names are free documentation.

Analogy: a tool description is a **job posting**. "Help with things" attracts mismatches. "Process inbound supplier invoices, flag duplicates, escalate over $10K" tells the right candidate exactly what to bring — and turns away everyone else.

Tomorrow: client-side vs. server-side tools — who actually does the work and why it matters.
