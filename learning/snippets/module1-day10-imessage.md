# AI Agents Day 10: Training vs. Inference — Two Completely Different Time Scales
**The Frozen Model and What You Can Actually Change at Runtime**

*Module 1.2, Day 10 of 50 | iMessage Edition*

---

**Yesterday:** hallucination is statistically probable text that happens to be wrong — a structural consequence of next-token prediction, not a bug.

**Today:** why you can't fix that by explaining the right answer to Claude.

There are two completely separate phases in a language model's existence. Training happened once: months of massive computation, billions of text examples, constant adjustments to billions of numerical weights until the model got good at next-token prediction. When training ended, those weights were frozen. Inference — every API call you make right now — runs those frozen weights forward. No learning. No updating.

When you explain Earnventory's founding year in a message, Claude uses it for *this conversation*. When the conversation ends, it's gone. The weights didn't change. Tomorrow Claude knows nothing new.

This isn't a limitation to work around. It's the architecture. The model you're talking to at 9am is byte-for-byte identical to the model at midnight.

**Analogy:** training is cooking the dish — months in the kitchen, recipe locked in. Inference is serving it. You can add condiments at the table (context), but you can't re-cook the dish mid-service.

Tomorrow: the Mini-Module 1.2 quiz — five applied questions on tokens, temperature, hallucination, and today's training/inference split. Reply when you have time.

— Zazu
