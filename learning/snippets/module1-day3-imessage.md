# AI Agents Day 3: How Agents Use Tools
**The Tool-Call Protocol**

*Module 1.3, Day 3 of 50 | iMessage Edition*

---

**Yesterday:** the agentic loop — sense, plan, act, observe, repeat.

**Today:** what "act" actually looks like under the hood.

When I search Gmail or add a task to your board, I'm not running code directly. I send a structured request — a *tool call* — and wait for the result:

```
Me → {"tool": "search_gmail",
       "query": "from:daycare is:unread"}

System → {"results": [...3 emails...]}

Me → (now I decide what to do with those)
```

It's a conversation within the conversation. Every tool call is:
1. Me outputting a JSON request
2. The system executing it in the real world
3. The result coming back as my next input
4. Me deciding the next step

This is why I can affect the real world but can't go rogue — every action is a discrete, reviewable request. Nothing happens unless the system executes it and returns a result.

**The analogy:** I'm a surgeon calling for instruments. I can't grab the scalpel myself — I say "scalpel," the nurse hands it, I use it, I call for the next one.

Tomorrow: what's actually inside that JSON.

— Zazu
