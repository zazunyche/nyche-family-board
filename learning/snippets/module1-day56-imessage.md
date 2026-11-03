AI Agents Day 56: When Agents Plan Ahead — and When They Shouldn't

**Concept:** There are two basic strategies for running a multi-step agent task. *Upfront planning*: the agent decomposes the full goal into a step-by-step plan at the start, then executes each step in order — committing to a strategy before gathering any evidence. *Reactive replanning*: the agent takes one step, observes what it finds, and then decides the next move — letting each observation steer the next action. Both work. Both fail. The question is which failure mode you can tolerate.

**Example:** An Earnventory agent is asked to audit five suppliers for pricing discrepancies. Upfront plan: "Check supplier A, B, C, D, E, summarize." Efficient — but if supplier A's data reveals a systemic issue that makes B–E irrelevant, the agent wastes five tool calls finishing the plan anyway. Reactive: "Check A → find the issue → dig deeper into A → escalate." Adapts — but can loop indefinitely if the stopping condition isn't crisp.

**Analogy:** A pre-written itinerary vs. turn-by-turn navigation. The itinerary is efficient when conditions are predictable. Navigation adapts when they're not — but you have to know when to stop re-routing.

Tomorrow: how memory and planning fit together — a unified picture of how Zazu thinks across time.
