AI Agents Day 63: Planning vs. Reactive Execution

**Concept:** Yesterday: agents reason before responding. Today: when should the agent map the *entire* route before taking the first step — and when is upfront planning actually the wrong call?

Two modes. **Upfront planning:** the agent decomposes the full task before executing any step. Steps 1–7 are decided in advance, then executed in order. **Reactive execution (ReAct):** the agent decides each next step based on what it just observed. No map — just the current clue and the next move.

**Example:** Earnventory. "Generate reorder recommendations for all 40 SKUs below threshold" → upfront plan makes sense: the structure is stable, the steps are predictable (lookup → compare → rank → draft order). But "investigate why margin on SKU X dropped 11 points" → reactive wins. You don't know upfront whether you'll find a pricing change, a cost spike, a data error, or a supplier substitution. Each observation shapes the next move.

**Analogy:** Upfront planning is a GPS route — commit before you move, follow it exactly. Reactive execution is following a paper trail — each clue tells you where to look next. GPS fails if the road is closed after you leave. The paper trail fails if there are 40 required stops and you need a guarantee you hit them all.

Tomorrow: synthesis — pulling CoT, ReAct, extended thinking, and planning into one complete reasoning workflow.
