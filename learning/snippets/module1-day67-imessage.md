AI Agents Day 67: Designing Tools Claude Can Actually Use

**Concept:** Yesterday Claude was the customer writing an order ticket. Today: how do you write a *menu* that makes Claude order the right thing? The answer is in the tool description — the text you write to tell Claude what a tool does, when to use it, and what each parameter means. Claude doesn't execute code to discover what a tool does; it reads your description and decides from that alone. Vague descriptions produce wrong calls.

**Example:** Compare two versions of the same Earnventory tool. Weak: `name: "get_data", description: "Gets data from the system."` Claude has no idea when to call this or what to put in. Strong: `name: "get_inventory_level", description: "Returns current stock count and reorder threshold for a single Earnventory SKU. Call this when you need to check whether a product is low-stock before generating a purchase order. Do not use for bulk queries."` Now Claude knows exactly when to reach for it and what the call means.

**Analogy:** A tool description is a job posting. A vague posting ("team player, detail-oriented") attracts random applicants. A precise posting ("3 years Python, owns supplier onboarding end-to-end") gets exactly who you need. Claude is the hiring manager — it matches the task to the posting.

Tomorrow: client-side vs. server-side tools — who executes what, and why it matters for trust.
