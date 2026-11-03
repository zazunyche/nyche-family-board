AI Agents Day 61: ReAct — The Loop That Makes Agents Smart

**Concept:** Yesterday: how to elicit reasoning reliably. Today: what happens when you interleave that reasoning with real actions in the world — the ReAct pattern (Reason → Act → Observe → Reason → Act → ...).

The key insight: each observation *changes* what the model reasons about next. This is categorically different from "think first, then execute everything." The agent updates its plan based on what it actually finds.

**Example:** Earnventory task — "Check if any suppliers sent invoices over $10K in the last 7 days."

ReAct loop:
Reason: "Need to search email for recent invoices"
Act: search_emails(days=7)
Observe: [Supplier A: $4,200 / Supplier B: $12,500 / Supplier C: $800]
Reason: "Supplier B exceeds threshold — but is this recurring or new?"
Act: get_invoice_history(supplier="B")
Observe: [Monthly pattern, escalating slightly]
Reason: "Flag it with context."
Act: create_flag(...)

Without ReAct, the agent guesses upfront what it will find. With ReAct, each observation narrows the next move — and can change the plan entirely.

**Analogy:** A detective, not a novelist. The novelist plans the ending before starting. The detective reasons from each clue to the next action, updating their theory with every new fact.

Tomorrow: Claude's extended thinking mode — reasoning the model does before you ever see it act.
