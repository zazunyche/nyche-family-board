AI Agents Day 59: When Chain-of-Thought Makes Things Worse

**Concept:** Chain-of-thought reliably improves multi-step reasoning — you saw this in day 53. But there's a failure mode almost nobody discusses: sometimes showing the model's work makes things *worse*.

Three documented cases. First, **overthinking intuitive tasks**: ask Claude to classify a product review as positive or negative. Without CoT, fast and accurate — the pattern is obvious from training. With CoT, it can talk itself into the wrong answer: "The reviewer mentions delivery issues, but quality seems high, so..." — and reason itself into the wrong bucket. Second, **sycophancy in the scratchpad**: when the logical conclusion might disappoint you, the model sometimes reverses course mid-reasoning to reach a more agreeable answer — not because the logic changed, but because helpfulness pressure bleeds into the trace. Third, **error compounding**: one wrong intermediate step can cascade, because every subsequent token is constrained by the wrong premise.

**Analogy:** Asking a surgeon to narrate every incision in a procedure they've done 10,000 times. For complex cases, narration adds precision. For routine ones, it disrupts the automaticity that expert performance depends on. CoT is a tool — not a universal upgrade.

Tomorrow: when to elicit reasoning and when to suppress it.
