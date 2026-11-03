# AI Agents Day 18: Claude's "Think" Tool and Extended Thinking Mode

*Module 1.4, Day 18 of 50 | iMessage Edition*

---

Yesterday: ReAct — the agent reasons, acts, observes, repeats. Each observation conditions the next reasoning step. Today: what's happening when Claude *thinks before* any of that begins.

Two related mechanisms, architecturally distinct:

**Extended thinking mode** is a parameter you set at the API level: `thinking: {budget_tokens: 8000}`. Claude generates a hidden `<thinking>` block before its visible response. Those tokens aren't shown to the user, but they're generated and billed. The model uses this budget to plan, self-correct, and resolve ambiguity before committing to output.

**The "think" tool** is different. It's an explicit tool — like `search_gmail` — whose only job is to let Claude reason mid-loop without taking an external action. Claude calls it, writes its reasoning as the input, and the tool returns nothing useful. It adds a deliberate pause before the next real action.

Both cost more tokens. Both slow things down. Both improve accuracy on tasks where an early wrong commitment cascades — complex multi-step plans, ambiguous instructions, calculations where the first wrong step corrupts everything downstream.

**Analogy:** Extended thinking is writing a rough draft before sending the email. The think tool is calling a timeout mid-meeting before you speak.

Tomorrow: when agents plan ahead — and when they shouldn't.

— Zazu
