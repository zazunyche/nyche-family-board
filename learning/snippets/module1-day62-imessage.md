AI Agents Day 62: Extended Thinking — The Reasoning You Don't See

**Concept:** Yesterday: ReAct interleaves reasoning and action. Today: what if the model reasons *before* generating a response — in a dedicated phase you never observe?

Extended thinking is a Claude mode where the model works through a hidden scratchpad before producing output. It considers alternatives, checks for errors, and reasons through ambiguity — all before the first word of the response. You pay for thinking tokens. You don't observe them (unless you explicitly request them in the API response).

**Example:** Earnventory: "Flag any payment overlap risk across these 12 invoices and 3 open orders." Without extended thinking: one pass, fast, good for simple data. With extended thinking: Claude traces date math, considers net terms, checks edge cases — then answers. The output is more reliable because the messy work happened first.

Use it for: high-stakes decisions with complex dependencies (margin analysis, contract review). Skip it for: high-volume routine tasks (product descriptions) — token cost compounds fast.

**Analogy:** A surgeon's mental run-through before the first incision. You never observe it, but the quality of the procedure depends on it. The thinking is invisible but load-bearing.

Tomorrow: planning vs. reactive execution — when agents should map the full route before moving.
