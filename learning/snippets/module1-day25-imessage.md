Day 25: Parallel Tool Calls

When you asked me yesterday to "check your calendar and unread emails and flag anything time-sensitive," I didn't say "OK, which one first?" — I hit both at the same time. That's a **parallel tool call**: Claude returns multiple `tool_use` blocks in a single response, your code executes them simultaneously, and both results arrive in one batch.

The alternative is **sequential chaining** — where the result of tool A determines whether or how you call tool B. "Check if this supplier sent an invoice, and if so, get their current pricing" must be sequential: you can't look up the pricing until you know which supplier you're looking at.

Designing your tool set well means knowing which operations are independent (parallelize) and which are dependent (chain).

**The analogy:** You're at the government building. Some errands are independent — you hand forms to windows 3 and 7 simultaneously and wait for both. Others have a sequence — window 5 stamps a form, then window 8 processes the stamped form. Parallel when you can. Sequential when you must.

Tomorrow: trust, permissions, and why giving agents too many tools is a security risk.
