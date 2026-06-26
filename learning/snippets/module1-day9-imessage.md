# AI Agents Day 9: Why Hallucination Is a Feature, Not a Bug
**The Structural Reason Claude Generates Confident, Fluent, Wrong Text**

*Module 1.2, Day 9 of 50 | iMessage Edition*

---

**Yesterday:** Claude samples the next token from a probability distribution. Temperature controls how it samples.

**Today:** what happens when the sampled token is statistically probable but factually wrong — hallucination.

Hallucination is not a bug. It's not lying, carelessness, or confusion. It's the core generation mechanism working exactly as designed, in situations where the training data's "what comes next" and reality's "what's actually true" diverge.

Concrete example: you ask Claude when Earnventory was founded. Earnventory appears nowhere in its training data. Claude has no specific knowledge of it — but it still generates a confident founding year. Why? Because the slot "Earnventory was founded in ___" looks like "startup X was founded in ___," and Claude has seen thousands of those. It samples from general startup founding patterns. The output is fluent, confident, and fabricated.

The mechanism that makes Claude useful — generalizing from patterns to novel contexts — is the exact same mechanism that produces hallucination. You cannot have one without the risk of the other.

**Analogy:** the world-class autocomplete finishes your sentence with something it's heard in similar contexts — plausible, fluent, and occasionally just wrong.

Tomorrow: why you can't fix this by explaining the right answer in your prompt — training vs. inference.

— Zazu
