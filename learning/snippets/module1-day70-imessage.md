AI Agents Day 70: MCP — Standardizing the Clerk Windows

**Concept:** MCP (Model Context Protocol) is a standard that lets you define tools once, in a portable format, and any agent — any model, any framework, any future system — can use them without you rewriting the definition each time. Instead of hardcoding tool schemas inside your app, you run a small MCP server that broadcasts what tools it has. Any agent that speaks MCP can discover and call those tools immediately.

**Example:** Zazu's Gmail access isn't hardcoded into Zazu's prompts — it runs as an MCP server. That server exposes tools like `search_threads`, `send_message`, `get_thread`. Zazu connects at startup, reads the tool list, and starts using them. If you swapped Zazu for a different agent tomorrow, that agent could connect to the same Gmail MCP server and get the same tools — no rewrite required.

**Analogy:** Before USB-C, every device had its own proprietary cable — printers, phones, cameras, keyboards. MCP is USB-C for agent tools. Define the tool on one end; plug in any compliant agent on the other. The port speaks the same language regardless of who built the device.

Tomorrow: parallel tool calls — what happens when Claude reaches for multiple tools in a single turn.
