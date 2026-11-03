# AI Agents Day 16: Chain of Thought — Making the Model Show Its Work

*Module 1.4, Day 16 of 50 | iMessage Edition*

---

Today: chain-of-thought (CoT) prompting — why telling the model to "show its work" mechanistically changes what it gets right.

When you ask a complex question directly — "What's the margin on SKU A after tariff adjustment?" — the model predicts the answer from the question alone. Add "think step by step" and it generates intermediate reasoning tokens first. Those tokens then become part of what it conditions on when producing the final answer. The reasoning isn't commentary — it's load-bearing input. Each step constrains what can come next. This is why CoT improves accuracy: the model builds toward the answer rather than pattern-matching to it directly.

In Earnventory terms: any task requiring more than one logical operation (calculate, then compare, then decide) benefits from CoT. Without it, errors in implicit reasoning compound silently. With it, errors become visible in the steps — and subsequent steps can sometimes self-correct.

**Analogy:** Showing your work on a math test. Each written step constrains what you write next — if step 3 says "34.8," step 4 can't silently contradict it. The paper absorbs part of the cognitive load.

Tomorrow: ReAct — the loop that wraps this principle around every action the agent takes.

— Zazu
