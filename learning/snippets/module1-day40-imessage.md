**Day 40 of 50 — The Claude Agent SDK: What It Buys You**

Yesterday you implemented the agentic loop from scratch: call → check → parse → execute → append → repeat. Today: what changes when you hand that entire loop to the SDK.

The Claude Agent SDK (called "Managed Agents" in the API) adds four things you'd otherwise build yourself:

1. **Runs the loop** — You define an Agent (model, tools, system prompt) and start a Session. Anthropic's servers run the sense→act→observe cycle on their infrastructure.
2. **Session state** — Conversation history, tool results, context tracking — the session holds it all. No manual message-building.
3. **Built-in tools** — bash, read, write, glob, web_search are ready out of the box. No handler code.
4. **Auto-compaction** — When context grows large, the SDK summarizes earlier history server-side so the session keeps going.

The tradeoff: you give up fine-grained control for speed. When something breaks, you're debugging at a higher abstraction layer. That's why Day 39 mattered — you know what's underneath.

**Analogy:** The SDK is pre-assembled furniture. The raw loop is the kit with screws and instructions. Same table. Very different experience when a leg wobbles.

Tomorrow: which model should your Earnventory agent use — and why that choice matters more than most people think.
