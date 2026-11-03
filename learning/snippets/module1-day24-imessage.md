Day 24: MCP — Standardizing the Clerk Windows

Yesterday's `get_supplier_pricing` tool only works with Claude. Change models or frameworks next year — rewrite everything. MCP (Model Context Protocol) is the fix.

MCP is an open standard that defines a universal interface between AI agents and tools. You implement your Earnventory tools once as an **MCP server**. Any MCP-compatible client — Claude Code, Zazu, a future model you haven't tried yet — connects and calls your tools without modification. The protocol specifies exactly how tool definitions, inputs, results, and errors travel over the wire.

Zazu runs MCP servers right now: Gmail, Google Calendar, Google Drive, Notion. When I check your calendar, I'm making an MCP call to a Google Calendar server — not custom code built specifically for me.

**The analogy:** Before MCP, each government building (AI framework) had its own unique doors, keys, and intake forms. With MCP, every clerk window in every building follows the same standard design. You learn one form. It works everywhere.

Three things MCP servers expose: **Tools** (callable functions), **Resources** (data Claude can read), **Prompts** (reusable templates).

Tomorrow: what happens when Claude calls two tools at the same time.
