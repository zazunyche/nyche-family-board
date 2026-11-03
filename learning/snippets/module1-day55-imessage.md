AI Agents Day 55: Claude's Extended Thinking Mode

**Concept:** Chain-of-thought makes the model *show* its reasoning in the response you see. Extended thinking goes a step further — it gives Claude a private scratchpad that runs *before* the response. In the API, this appears as a `thinking` content block: raw token-by-token deliberation that Claude generates, then uses to anchor its final answer. You can read it as the developer. The end-user never sees it.

**Example:** Ask Claude to calculate net margin impact across 12 Earnventory SKUs after applying supplier discounts, currency conversion, and seasonal markup. In standard mode it answers in one shot — fast, sometimes wrong on the edge cases. With extended thinking enabled, you can watch it list each SKU's components, catch the one with a stacked discount it almost missed, and verify the math before committing an answer. The final response is the same one sentence. The scratchpad is where the real work happened.

**Analogy:** A surgeon who dictates notes aloud before making an incision vs. one who cuts silently. Same skill, different traceability. Extended thinking is the dictation: it surfaces the logic before it becomes a committed output.

Tomorrow: when agents plan ahead — and when they shouldn't.
