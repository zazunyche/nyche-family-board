AI Agents Day 60: Eliciting Reasoning Reliably

**Concept:** Yesterday: when CoT makes things worse. Today: how to elicit chain-of-thought *reliably* when you want it — and the key insight that Day 59 teased: *how* you ask for reasoning determines not just whether the model reasons, but what shape that reasoning takes.

**Example:** "Think step by step" elicits CoT but gives no structure — the model decides how to decompose. "First convert unit prices to USD. Then check if total exceeds $15,000 and apply discount. Then compute per-SKU margin. Report only after completing all three steps" forces a *specific* chain with visible checkpoints. For an Earnventory margin calculation, the second form is safer: each step is auditable, and the model can't jump to a convenient conclusion by treating the reasoning as optional.

The reasoning trace is also an observability tool: when a calculation goes wrong, the trace tells you exactly which step the error entered on — not just that the answer is wrong.

**Analogy:** Telling a contractor "do a good job" vs. handing them a phased plan with milestones. Both request work — only one requires auditable stages that catch drift before it compounds.

Tomorrow: the ReAct pattern — how reasoning and acting interleave in a full agentic loop.
