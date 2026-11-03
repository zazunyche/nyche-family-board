# AI Agents Day 19: When Agents Plan Ahead — and When They Should

*Module 1.4, Day 19 of 50 | iMessage Edition*

---

Yesterday: extended thinking and the think tool — deliberate reasoning budget before a single action. Today: planning across many actions.

Two ends of a spectrum:

**Pure planner:** Decompose the full goal into a complete task tree before executing anything. Commits upfront, then runs the plan leaf by leaf.

**Pure reactor:** Pick the single best next action, execute, observe, repeat — no explicit plan. Local optimization at every step.

Both fail in practice. The pure planner's step 4 assumption breaks when step 3's observation surprises it — and the plan can't adapt. The pure reactor grinds through local moves and loses the global goal in the noise of accumulated observations.

Real agents do both: hierarchical decomposition (plan the structure), then reactive execution within that structure (adapt the details). ReAct is the reactive layer. Hierarchical task decomposition sits above it as the planning layer.

**Analogy:** A surgeon plans the procedure before incision — but doesn't re-plan every cut. They adapt intraoperatively when anatomy is unexpected. Plan the structure; react within it.

That's the final snippet of Module 1. Tomorrow: Mini-Module 1.4 quiz. Five questions covering CoT, ReAct, extended thinking, and today's planning concepts.

— Zazu
