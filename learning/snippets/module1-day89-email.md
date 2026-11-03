# AI Agents Day 89: Prompt Caching — How Agents Reuse Context Without Re-Paying for It

*Mini-Module 1.3 — Context, Memory, and State*

---

## The problem nobody warns you about

Back on Day 11 we established that the context window is your agent's RAM, and on Day 12 we named the four types of memory an agent can have. One of them was **in-cache** memory — the KV cache. Today we make it concrete and practical, because it's the single biggest lever you have on the *cost* and *latency* of a real agent like Zazu.

Here's the thing most people miss when they first build on the Claude API: **the API is stateless.** Every single turn, your application re-sends the entire conversation — the system prompt, every tool definition, the full message history, everything — and the model reprocesses all of it from scratch to figure out what to say next. There is no hidden server-side session quietly remembering your last message. You send it all, every time.

For a chatbot with a two-line system prompt, who cares. But for an agent, this is the central cost problem. Zazu's system prompt is *large* — identity, house rules, the curriculum plan, memory pointers, tool instructions. That's thousands of tokens that are **identical on every single turn**. Without caching, you pay full freight to reprocess those same thousands of tokens on turn 1, turn 2, turn 50. It's like photocopying the entire employee handbook every time you want to ask one new question.

**Prompt caching** is the fix. Today we'll cover exactly what it does, the economics (which are dramatic), the one rule that governs everything, and the traps that silently make it do nothing at all.

---

## What prompt caching actually does

When the model processes your prompt, it does expensive internal work to turn those tokens into a form it can reason over (the "KV cache" — key/value tensors from the attention layers). Normally that work is thrown away the instant the response finishes.

Prompt caching says: *take a stable prefix of the prompt, do that expensive processing once, and store the result.* On the next request, if the prompt **begins with the exact same bytes**, the model loads the stored work instead of redoing it. You mark where the stable part ends with a "cache breakpoint."

```
WITHOUT CACHING                      WITH CACHING
Turn 1: [process 8K system] + Q1     Turn 1: [process + STORE 8K] + Q1
Turn 2: [process 8K system] + Q2     Turn 2: [READ 8K from cache] + Q2   <- cheap + fast
Turn 3: [process 8K system] + Q3     Turn 3: [READ 8K from cache] + Q3   <- cheap + fast
         ^^^^^^^^^^^^^^^^^^
     full price, every time              ~90% cheaper on the repeated part
```

Two things improve at once: **cost** (you're not re-billed full price for the stable chunk) and **latency** (reading a cache is far faster than reprocessing, so the first token comes back sooner).

---

## The economics — and why they're dramatic

This is where it gets real. There are three prices in play per token:

| Token category | What it costs (relative to normal input) |
|---|---|
| **Cache write** (store the prefix) | ~1.25× for a 5-minute cache; ~2× for a 1-hour cache |
| **Cache read** (reuse the prefix) | **~0.1×** — about a 90% discount |
| **Uncached input** (the new part) | 1× — full price |

So the pattern is: you pay a small *premium* once to write the cache (1.25×), then a deep *discount* on every subsequent read (0.1×).

The break-even math is friendlier than it looks. With the default 5-minute cache, two requests already win: `1.25× (write) + 0.1× (read)` = **1.35×** total, versus `2×` if you'd paid full price both times. By the third, fourth, fiftieth read, the savings are enormous — you're paying roughly a tenth of what you otherwise would on the stable chunk.

For an agent that carries, say, 10,000 tokens of fixed preamble across a 40-turn session, that's the difference between being billed for ~400,000 preamble tokens and being billed for ~10,000 (write) + ~39,000 (reads at 0.1×) ≈ 49,000 equivalent. An ~88% reduction on that portion — same behavior, same model, just a cache marker in the right place.

---

## The one rule everything follows from

> **Prompt caching is a prefix match. Any byte that changes anywhere in the prefix invalidates the cache from that point onward.**

The cache key is derived from the *exact bytes* of your prompt up to the breakpoint. One character different at position N, and the cache for everything at position ≥ N is thrown away — you're back to paying full price and reprocessing.

The rendering order matters, because the "prefix" is assembled in a fixed sequence:

```
   tools   →   system   →   messages
 (stable)    (stable)      (grows each turn)
 |________________________|
      put the breakpoint here, at the end
      of the stable region
```

This single rule is the source of every best practice and every bug. Design around it and caching works for free. Violate it and no number of cache markers will help.

---

## The silent killers (this is the part that bites people)

The cruelest thing about prompt caching is that when you break it, **nothing errors.** Your code runs fine, your agent behaves correctly — you just quietly pay full price forever and never notice. Here are the classic ways the prefix changes out from under you:

- **A timestamp in the system prompt.** `"Current time: 2026-10-02 14:33:07"` at the top of your system prompt changes *every request*. Everything after it — the entire rest of the prompt — is uncacheable. This is the number-one offender.
- **A per-request ID or UUID early in the content.** Same problem: unique every time.
- **Non-deterministic serialization.** Dumping a dict/JSON object without sorting keys, or iterating a set — the bytes come out in a different order on different runs, so the prefix differs even though the *meaning* is identical.
- **Interpolating the user's name or session ID into the system prompt.** Now each user has a unique prefix; nothing is shared and nothing is reused across a session the way you'd hope.
- **Changing the tool list mid-conversation.** Tools render at position 0 — the very front. Add, remove, or reorder one tool and you invalidate *everything*. (Same for switching models mid-session; caches are model-specific.)

The fix for all of these is the same: **keep the prefix frozen, and push anything volatile to the end.** Dynamic context (the current date, the user's latest question, injected state) belongs *after* the breakpoint, in the message stream — never interpolated into the stable system prompt. A fact that appears at turn 5 invalidates nothing before turn 5.

---

## How you verify it's actually working

Because breakage is silent, you don't trust — you measure. Every API response reports cache activity in its `usage` object:

```
usage:
  cache_creation_input_tokens   <- tokens WRITTEN to cache (you paid ~1.25x)
  cache_read_input_tokens       <- tokens SERVED from cache (you paid ~0.1x)
  input_tokens                  <- uncached tokens (full price)
```

The tell-tale sign of a silent invalidator: you make repeated requests with what *should* be an identical prefix, and `cache_read_input_tokens` stays **zero**. That means something in your prefix is changing between requests — go hunt the timestamp, the unsorted JSON, the varying tool set. (A useful sanity check: your total prompt size is the *sum* of all three fields, not just `input_tokens`. If an agent ran for an hour but `input_tokens` reads 4K, the rest was served from cache — which is exactly what you want to see.)

One more mechanical detail worth knowing: there's a **minimum cacheable prefix** (roughly 1,000–4,000 tokens depending on the model). Below that, the marker is silently ignored — caching a 300-token prompt does nothing. Caching is a tool for *large* stable contexts, which is precisely the agent case.

---

## The Zazu connection

This is not abstract for the system writing you these emails. Zazu runs with a substantial, stable system prompt every time it wakes up to do a task — generate a snippet, triage email, update the family board. The architecture that makes that affordable is exactly what we've described: the big fixed preamble sits at the front, gets cached, and every subsequent action in a working session reads it back at a fraction of the cost.

It also explains a design discipline you've seen echoed throughout this mini-module: **keep the stable stuff stable.** The reason you don't jam the current date or a per-run ID into the top of a system prompt isn't fussiness — it's that doing so would detonate the cache and multiply the cost of everything downstream. Context engineering (Day 14) and caching are two sides of the same coin: decide what belongs in the frozen prefix, and keep it byte-for-byte identical so the machine can reuse it.

```
   ZAZU'S PROMPT, EVERY TURN
  +------------------------------------------+
  | tools (frozen)          |  cache         |
  | system prompt (frozen)  |  prefix  --> written once, read cheaply
  | ---- breakpoint ----     |
  | conversation so far      |  grows; older
  |                          |  turns also cache
  | today's new instruction  |  <- volatile, lives at the end
  +------------------------------------------+
```

---

## Key takeaways

- The API is **stateless** — you re-send the whole context every turn and are billed to reprocess it. Caching is how you stop paying that tax.
- A **cache read costs ~0.1×** normal input price (~90% off); a **cache write costs ~1.25×** (5-min) or ~2× (1-hour). Break-even comes in as few as two requests.
- Caching is a **prefix match** — any byte change in the prefix invalidates everything after it. Keep the prefix frozen; push volatile content (dates, IDs, the new question) to the end.
- Cache entries **expire** — 5 minutes by default, 1 hour as an option for bursty traffic.
- **Breakage is silent.** Verify with `cache_read_input_tokens`; if it's zero across identical-prefix requests, hunt the invalidator.
- There's a **minimum cacheable size** — this is a tool for large, stable agent contexts, which is exactly where it pays off.

---

## Free resources

1. **Anthropic — Prompt caching documentation** (cache_control, TTLs, pricing, usage fields): https://platform.claude.com/docs/en/build-with-claude/prompt-caching
2. **Anthropic — "Effective context engineering for AI agents"** (how caching fits the broader discipline of managing what goes into the window): https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

---

*Tomorrow: fine-tuning vs. prompting — the other end of the memory spectrum. When is it worth actually changing the model's weights, and when is prompting (or RAG, or caching) the smarter move?*
