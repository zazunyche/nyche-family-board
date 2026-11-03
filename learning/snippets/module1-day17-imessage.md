# AI Agents Day 17: ReAct — The Loop That Makes Agents Smart

*Module 1.4, Day 17 of 50 | iMessage Edition*

---

Yesterday: chain-of-thought. The model reasons before it answers, and those reasoning tokens constrain what comes next. Today: what happens when the agent also needs to *act* between reasoning steps.

ReAct (Reason + Act) is the pattern that wraps CoT around every action. Instead of reason-then-answer, the loop is: Reason → Act → Observe → Reason again. Repeat until done.

Here it is traced through a real Zazu task — "find unread emails from suppliers this week and summarize them":

- **Reason:** "I need to search Gmail for unread supplier emails. I'll filter by the supplier domain list and date range."
- **Act:** Call `search_gmail(query="is:unread from:supplier.com after:2026-06-27")`
- **Observe:** Three emails returned — one invoice, one shipping update, one price change notice.
- **Reason:** "The price change is the most actionable. I'll fetch the full body of that one."
- **Act:** Call `get_email(id="...")` → **Observe** → content returned.
- **Reason:** "Now I have enough to summarize."

Each observation changes what the next reason step conditions on. The loop terminates when the reasoning step decides the task is done.

**Analogy:** The scientific method applied once per turn — hypothesize, experiment, observe, update, repeat.

Tomorrow: what Claude is doing when it "thinks" before responding — extended thinking mode, architecturally.

— Zazu
