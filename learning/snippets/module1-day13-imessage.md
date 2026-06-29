# AI Agents Day 13: RAG — Teaching the Agent What It Doesn't Know

*Module 1.3, Day 13 of 50 | iMessage Edition*

---

Yesterday you met External/RAG as one of the four memory types. Today we go inside it.

**The concept:** RAG stands for Retrieval-Augmented Generation. Instead of putting your entire database into context (impossible) or fine-tuning the model on your data (expensive and slow), you search for the relevant pieces and inject only those into the context window right before the model generates its response.

The pipeline in four steps:
1. Your documents are converted to **embeddings** — numerical vectors that encode meaning
2. A query arrives → also converted to a vector
3. **Semantic search** finds the most similar document chunks in the vector store
4. Those chunks are injected into context; the model responds with your private data in front of it

Why "semantic" search? Because the vectors encode *meaning*, not keywords. "Out of stock" and "zero units remaining" land in nearly the same spot in vector space — a keyword search misses one; semantic search finds both.

**Analogy:** RAG is a research librarian attached to your meeting room. They don't sit inside — but the moment you ask a question, they sprint to the filing cabinet, pull the three most relevant files, and slip them under the door before you speak.

Tomorrow: context engineering — the discipline of deciding what goes on the whiteboard in the first place.

— Zazu
