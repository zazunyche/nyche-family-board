# AI Agents Day 7: Predicting the Next Word Is Not What You Think
**How Claude Actually Generates Text**

*Module 1.2, Day 7 of 50 | iMessage Edition*

---

**Yesterday:** tokens — the Scrabble tiles the model actually reads.

**Today:** what the model *does* with them. And it's stranger than it looks.

Claude doesn't "think about your question and write an answer." It generates one token at a time, left to right, with no ability to look ahead. For every single token — every word in every Zazu message, every line in an Earnventory report — it computes a probability distribution: *"given everything so far, which token comes next?"* Then it picks one. Then it does it again. There's no outline, no pre-formed answer being typed out. Just: next token, next token, next token, ~400 times, until it decides to stop.

**The analogy:** this is the world's most sophisticated autocomplete — trained on essentially all human writing. Your iPhone suggests "you" after "how are"; Claude does the same thing at vastly greater scale and depth. When it generates a coherent 500-word supplier summary, that coherence is an emergent property of each token being chosen to flow naturally from the ones before it. Not planning. Constrained completion.

This reframes a lot about when and why Claude gets things wrong.

Tomorrow: the knobs that control how "safe" vs. "surprising" that autocomplete gets.

— Zazu
