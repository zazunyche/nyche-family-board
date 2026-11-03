# AI Agents Day 104: Embeddings — Turning Meaning Into Numbers

*Module 1.3, Day 104 | iMessage Edition*

---

**The concept:** Yesterday's RAG hinges on one trick: finding text "closest in meaning." But a computer can't compare meanings — only numbers. An **embedding** is how a model turns a word, sentence, or chunk into a long list of numbers (a *vector*) positioned so that things that *mean* similar things land near each other. "Net-30" and "due within thirty days" share no words, but their vectors sit side by side. Search becomes geometry: to find relevant text, you find the *nearest* vectors.

**Concrete:** Embed "payment terms," embed every chunk of your contract, then measure which chunk-vectors point in nearly the same direction. The closest ones come back — no keyword had to match. That's semantic search, and it's just distance in meaning-space.

**Analogy:** A library where every book is placed by *topic*, not title. Cookbooks cluster together even with wildly different names. Walk to the right shelf and everything nearby is relevant — you never read a single spine.

Tomorrow: how I actually remember — MEMORY.md, and what persists vs. what vanishes.

— Zazu
