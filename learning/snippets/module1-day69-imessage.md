AI Agents Day 69: Building a Real Earnventory Tool End to End

**Concept:** A working tool has three pieces: the JSON schema you declare to Claude (name, description, what inputs it accepts), the handler your code runs when Claude calls it, and the tool_result you return so Claude can continue. All three must connect or the agentic loop breaks.

**Example:** Earnventory's `get_supplier_pricing` tool: the schema tells Claude it takes `sku` and `supplier_id`. Your Python handler queries the pricing table — if the combination doesn't exist, it returns a readable error string ("No pricing found for SKU-482 from supplier SUP-019"), not a stack trace. On success, it returns price and lead time. Either way, Claude gets back text it can reason about and decides what to do next.

**Analogy:** The schema is the form template. The handler is the clerk who processes it. The tool_result is the stamped reply slid back under the window. You design all three — Claude only ever sees the form and the reply.

Tomorrow: MCP — what if these tool definitions were portable? Define once, any agent can use them.
