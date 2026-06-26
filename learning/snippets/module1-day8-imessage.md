# AI Agents Day 8: Temperature, Top-P, and the Knobs You Control
**The Dials That Govern How Claude Picks the Next Token**

*Module 1.2, Day 8 of 50 | iMessage Edition*

---

**Yesterday:** Claude generates one token at a time by sampling from a probability distribution over its entire vocabulary. Every word in every Zazu report went through that loop.

**Today:** the parameters that control *how* it samples from that distribution.

**Temperature** is the main dial. At temperature 0, Claude always picks the single highest-probability token — fully deterministic, same output every run. At temperature 1, it samples from the raw distribution — more variation. Above 1, the distribution flattens toward noise. In practice: automated Earnventory reports → temperature 0. Supplier email drafts → 0.6. Brainstorming product categories → 0.9.

**Top-p** (nucleus sampling) is the companion constraint. It restricts sampling to only the smallest set of tokens whose combined probability mass reaches p. Top-p = 0.9 means: ignore the bottom 10% of the distribution — the noise tail. The nucleus shrinks when the model is confident, expands when it's uncertain.

**The analogy:** temperature is a democratic voting system dial — from "the plurality always wins" to "any candidate with real support has a chance."

Tomorrow: why hallucination is actually a feature of this mechanism, not a defect.

— Zazu
