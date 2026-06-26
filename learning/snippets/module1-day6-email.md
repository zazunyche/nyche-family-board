# AI Agents Day 6: What Is a Token, Exactly?
**Tokenization Mechanics and Why They Matter for Cost, Latency, and Behavior**

*Module 1.2, Day 6 of 50 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | June 17, 2026*

---

## The Short Version

Yesterday closed out Mini-Module 1.1 with the question "what differs between Zazu and me, given we run on the same model?" Today we start Mini-Module 1.2, "The Model Underneath," by going one level deeper: what does "the model" actually operate on? Not English words. Not characters. **Tokens** — a vocabulary of subword chunks that every piece of text gets broken into before Claude ever processes it. Tokenization is the most boring-sounding concept in this entire curriculum and one of the most consequential. It determines how much an API call costs, how much of your context window a given piece of text consumes, and even some surprising edge cases in model behavior (it's a large part of why LLMs are historically bad at counting letters in words, for instance). If you're going to build anything on the Claude API for Earnventory, tokenization is the unit of account you'll be reasoning in constantly.

---

## What a Token Actually Is

A token is a chunk of text — could be a whole word, a piece of a word, a punctuation mark, or even a single character — drawn from a fixed vocabulary that the model was trained with. Claude's tokenizer doesn't split text into words; it splits text into the most efficient set of recurring chunks it learned during training, using an algorithm in the same family as **byte-pair encoding (BPE)**. The vocabulary has a fixed size — tens of thousands of possible tokens — and every common word, common prefix, common suffix, and common punctuation pattern gets its own token. Rare or novel words get broken into multiple smaller tokens.

```
Input text:    "Earnventory tracks wine inventory."

Tokenized:     [Earn][vent][ory][ tracks][ wine][ inventory][.]
                 1     2     3     4        5       6          7

7 tokens for 5 "words" — because "Earnventory" alone costs 3 tokens,
while common words like "wine" and "tracks" each cost 1.
```

The exact split depends on the tokenizer's training data, but the general pattern holds everywhere: **common = fewer tokens, rare = more tokens.** "The," "and," "is," "wine" — these appear constantly across the internet text the model trained on, so they each got assigned their own single token. "Earnventory" is a proper noun specific to your company; it never appeared (or appeared rarely) in training data, so the tokenizer has no single chunk for it and has to assemble it out of smaller, more generic pieces it does recognize.

This is also why tokenizers sometimes produce strange-looking splits for technical terms, product names, or non-English text — anything underrepresented in training data gets chopped more finely, which means it costs more tokens for the same amount of meaning.

---

## Why This Isn't Just Trivia: Three Consequences

### 1. Token count is literally what you pay for

Every Claude API call is billed per token — input tokens (what you send) and output tokens (what Claude generates), at different rates. This isn't a proxy metric; it's the actual unit of billing. So when you're estimating the cost of an Earnventory feature — say, generating product descriptions for 10,000 SKUs — the question "how many tokens will this cost" is not a back-of-envelope abstraction, it's the literal line item on your Anthropic invoice. A prompt padded with extra boilerplate, or a product catalog full of proper nouns that tokenize inefficiently, directly costs more money than equivalent text that tokenizes efficiently.

### 2. Token count is what fills your context window

The context window — which we'll spend all of next week on (Mini-Module 1.3, starting Sunday) — is measured in tokens, not words or characters. Claude's context window holds a fixed maximum number of tokens across the entire conversation: system prompt, conversation history, tool definitions, tool results, and the response all compete for the same token budget. A rough English rule of thumb is **about 4 characters per token, or roughly 0.75 tokens per word** — but that's an average across ordinary English prose. Text full of rare proper nouns, code, non-English content, or unusual formatting can tokenize much less efficiently than that rule of thumb suggests, eating a larger share of your budget per unit of actual information than you'd expect.

### 3. Token boundaries shape some surprising model behaviors

Because the model never sees raw characters — it sees tokens — some tasks that feel trivial to a human (count the letters in a word, reverse a string, do precise character-level edits) are structurally harder for an LLM than they look. If "strawberry" is tokenized as a small number of subword chunks rather than ten individual letters, the model has to reason about letter composition *indirectly*, from patterns it picked up during training, rather than directly inspecting characters the way code would. This is the actual mechanical reason behind a famous class of LLM failure (miscounting letters in words) that otherwise seems bizarre for a system this capable. It's a preview of next week's theme: many things that look like "the model is dumb" are actually "the model's representation of the input doesn't match the structure of the task."

---

## Worked Example: Earnventory at Scale

Let's make this concrete with the exact scenario from this mini-module's quiz. Suppose you're generating short product descriptions for 10,000 wine SKUs in Earnventory, and each description averages 150 tokens of output, with a 50-token input prompt per SKU (product name, varietal, region, vintage).

```
Per SKU:        50 input tokens + 150 output tokens  = 200 tokens
Across catalog: 10,000 SKUs × 200 tokens              = 2,000,000 tokens

If "Riesling" tokenizes as 2 tokens and a generic word like "wine"
tokenizes as 1, then a catalog full of varietal names (Riesling,
Gewürztraminer, Tempranillo) will systematically cost MORE tokens
per SKU than a catalog of generic product names — same number of
"words," more tokens, more dollars, more context-window space used.
```

This is why, when you're scoping an LLM feature for Earnventory, "how many words" is the wrong unit to estimate in — "how many tokens, given the actual vocabulary I'm working with" is the right one. Domain-specific vocabulary (varietal names, region names, SKU codes) tends to tokenize less efficiently than everyday English, because it's rarer in the training data the tokenizer was built from.

---

## The Analogy: Scrabble Tiles, Not Words

Today's iMessage used this comparison and it's worth unpacking further: tokens are like **Scrabble tiles, not complete words.** When you play Scrabble, you don't get handed whole words — you get a bag of letter tiles, and some combinations are common enough that you'd reach for them automatically (T-H-E), while building an unusual word requires assembling it tile by tile from smaller pieces. A tokenizer works the same way, except its "tiles" are subword chunks instead of individual letters, and the most common tiles in its bag are entire common words, while rare words get spelled out from smaller, more generic fragments.

The important refinement: unlike a Scrabble bag, the tokenizer's tile set was fixed once, at training time, based on what was common in its training corpus. It doesn't adapt on the fly to your specific vocabulary. If "Earnventory" becomes a word you use constantly, the tokenizer still doesn't get smarter about it mid-conversation — it splits it into `Earn` `vent` `ory` every single time, because that fixed vocabulary was locked in long before your first API call.

---

## What's Next

Tomorrow (Day 7, "Predicting the next word is not what you think") we move from *what the model reads* to *what the model does with it*: the actual generation mechanism, autoregressive next-token prediction, and why understanding this changes how you think about everything Claude outputs — including every tool call discussed in Mini-Module 1.1.

---

## Free Resources for Going Deeper

1. **"How LLM Token Prediction Works (A Simple Guide for Developers)"** — a developer-oriented walkthrough of tokenization and prediction together, useful as a preview of tomorrow's topic too.
   https://medium.com/@pavani.singamshetty/how-llm-token-prediction-works-a-simple-guide-for-developers-b7b4ef634154

2. **Andrej Karpathy's "State of GPT"** — a widely-cited technical talk covering tokenization and the broader LLM pipeline from a builder's perspective. (Worth verifying it's still live before clicking — talks like this sometimes get reposted or moved.)
   https://www.youtube.com/watch?v=bZQun8Y4L2A

---

## One Sentence to Carry Forward

The model never reads your words — it reads tokens from a fixed vocabulary, and that one fact explains a chunk of what you pay, how much context you have, and why some "easy" tasks trip the model up.

---

*Day 6 of 50 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu at 9am*
*Next: June 18 — "Predicting the Next Word Is Not What You Think"*
