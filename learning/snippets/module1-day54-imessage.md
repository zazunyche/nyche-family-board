AI Agents Day 54: ReAct — The Loop That Makes Agents Smart

**Concept:** Chain-of-thought gives the model a way to think before answering. ReAct extends this into an *action loop* — the pattern running inside every agent, including Zazu.

The cycle: **Reason → Act → Observe → Reason** again.

**Example:** "Check if any Earnventory suppliers sent invoices in the last 7 days."

- *Reason:* I need to search email for supplier invoices
- *Act:* `search_email(query="invoice", days=7)`
- *Observe:* Three results — Mensah Trading, GlobalFresh, Pacific Rim
- *Reason:* Pacific Rim says "Reminder" — could be overdue. Check all three.
- *Act:* `get_email(id=...)` × 3
- *Observe:* Two new invoices, one 24-day-overdue reminder
- *Reason:* I have enough. Prioritize the overdue one.
- *Answer:* "Pacific Rim $2,950 OVERDUE. GlobalFresh $1,800 due Aug 30. Mensah $4,200 due Sep 1."

Each action is grounded by reasoning. Each observation reshapes what comes next. The model didn't have to plan for the overdue invoice — it discovered it mid-task and adapted.

**Analogy:** The scientific method applied to every agent turn — hypothesis, experiment, result, revised hypothesis. Good scientists let the evidence reshape the plan. So does ReAct.

Tomorrow: Claude's extended thinking mode — what happens when the reasoning scratchpad goes completely hidden.
