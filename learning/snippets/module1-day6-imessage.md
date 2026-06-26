# AI Agents Day 6: What Is a Token, Exactly?
**The Unit Claude Actually Reads**

*Module 1.2, Day 6 of 50 | iMessage Edition*

---

**Yesterday:** specialization — same model, different configs, different agents.

**Today:** we open the box. What is the model actually reading?

Not words. Not characters. **Tokens** — subword chunks a tokenizer splits your text into before the model ever sees it. "Earnventory" isn't one unit, it's probably 3-4: `Earn` `vent` `ory`. Common words like "the" or "wine" are usually a single token; rare or compound words get split. Every API call costs money per token, and every model has a fixed token budget (its context window) — so tokenization isn't trivia, it's the unit your cost and your memory are both measured in.

**The analogy:** tokens are like Scrabble tiles, not full words. The model doesn't get a hand of complete English words — it gets a bag of word-fragments and has to recognize which combinations form "Earnventory" the same way you'd recognize T-H-E spells "the." Common fragments are bigger tiles; rare ones get cut into smaller pieces.

Tomorrow: what the model actually *does* with that bag of tiles — predicting the next one, one at a time.

— Zazu
