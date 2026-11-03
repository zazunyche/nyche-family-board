Day 22: Client-Side vs. Server-Side Tools

When Claude calls a tool, one of two things happens: your code executes it, or Anthropic's servers do. That's the entire client-side vs. server-side split — and it changes everything about cost, security, and control.

**Client-side tools** are ones you define and execute. Claude outputs `{"name": "get_supplier_pricing", "input": {"sku": "WN-001"}}`, your server hits your database, you hand the result back. Claude never directly touches your systems. Every Earnventory tool — inventory queries, supplier lookups, PO creation — would be client-side. You control the auth, the rate limits, the audit trail.

**Server-side tools** are ones Anthropic runs on their infrastructure. `web_search`, `code_execution`, computer use — you enable them, Anthropic handles execution. You don't write a handler. The result flows back to Claude without your application in the middle. More expensive, less control, zero implementation effort.

**Analogy:** At the government office, most clerk windows are staffed by your own employees (client-side). But a few specialist windows — the federal contractor booths — are run by the government. You direct traffic there, but you're not operating them.

Tomorrow: building a real Earnventory tool end-to-end — from JSON schema to error handling.
