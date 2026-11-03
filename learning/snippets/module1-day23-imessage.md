Day 23: Building a Real Tool for Earnventory

A tool in Claude's world is two things you write separately: a JSON schema Claude reads (so it knows what to send), and a handler function your code runs when Claude sends it. They're decoupled by design — Claude sees the schema, never the code.

Here's `get_supplier_pricing`. The schema Claude receives defines the call shape:
- `supplier_id` (string, required) — which supplier
- `skus` (array, required) — which products to look up
- `as_of_date` (string, optional) — pricing as of a specific date

Your handler hits the database, returns structured results including any missing SKUs. If the supplier doesn't exist, you don't throw an exception — you return a structured error so Claude can reason about recovery ("try get_suppliers to find the right ID").

The rule: **never raise from a tool handler**. Return an error in the result body; let Claude decide what to do next.

**Analogy:** The schema is the form posted at the clerk window — it tells visitors what to fill in. Your handler is the clerk behind the glass. Claude fills in the form; your code is the clerk.

Tomorrow: MCP — what happens when you standardize the entire directory of clerk windows across a building.
