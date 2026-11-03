AI Agents Day 68: Client-Side vs. Server-Side Tools

**Concept:** When Claude calls a tool, two very different things can happen depending on the tool type. Client-side tools — like your Earnventory `get_inventory_level` — are executed by YOUR code. Claude outputs the `tool_use` block, your Python handler runs, you return the result. Server-side tools like `web_search` and `code_execution` are executed by Anthropic's infrastructure. You include them in your tools list, Claude calls them, Anthropic's servers do the work, and the result arrives in your conversation stream. You write zero handler code.

**Example:** You're building an Earnventory agent that checks stock levels AND looks up current commodity prices online. `get_inventory_level` is client-side — your database, your code, your compute. `web_search` is server-side — Anthropic fetches the page. Both look identical to Claude. The difference is invisible to the model, but very visible to you: one runs in your environment, one runs in Anthropic's.

**Analogy:** Client-side tools are employees on your payroll — they work in your office, on your systems. Server-side tools are building services — shared infrastructure provided by the landlord. You use both, but you only manage one.

Tomorrow: building a real Earnventory tool end to end — schema, handler, error cases, the works.
