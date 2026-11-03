# AI Agents Day 36: Your First API Call to Claude

**Day 36 of 50 | Mini-Module 2.3: Building an Agent from Scratch**

---

## Where We Are

Thirty-five days of mental models. You know what an agent is architecturally — model, tools, context, loop. You know how tokens work and why temperature matters. You understand the context window as finite RAM, the four memory types, how RAG retrieves facts the model doesn't have in weights. You've traced the ReAct loop, dissected the tool-use protocol, walked through multi-agent orchestration from orchestrator to subagent to handoff.

Today we stop explaining and start building.

Mini-Module 2.3 is about constructing agents with your own hands — starting from the raw API, understanding every parameter, then building up to the agentic loop, the Agent SDK, model selection, structured outputs, and finally a complete working Earnventory agent. Eight days, application-first throughout.

We start with the smallest possible working unit: a single API call.

---

## The Minimal Viable Call

Here is the entire minimum viable Claude API call in Python:

```python
import anthropic

client = anthropic.Anthropic()   # reads ANTHROPIC_API_KEY from environment

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system="You are a helpful inventory assistant for Earnventory.",
    messages=[
        {"role": "user", "content": "What is safety stock?"}
    ]
)

print(response.content[0].text)           # the generated text
print(response.stop_reason)               # "end_turn"
print(response.usage.input_tokens)        # tokens you sent
print(response.usage.output_tokens)       # tokens you received
```

Four parameters. One response object. Everything else in this mini-module — tools, loops, multi-turn conversations, streaming — is built on top of this foundation. Let's go through each parameter precisely.

---

## The Four Parameters

### 1. `model` — Which Claude

The model ID determines which Claude you're calling. As of July 2026, the three production tiers are:

| Model | ID | Intelligence | Speed | Cost tier |
|---|---|---|---|---|
| Haiku 4.5 | `claude-haiku-4-5-20251001` | Good | Fastest | Lowest |
| Sonnet 4.6 | `claude-sonnet-4-6` | Very good | Fast | Mid |
| Opus 4.8 | `claude-opus-4-8` | Best | Slower | Highest |

For most Earnventory tasks — summarizing supplier invoices, drafting reorder emails, answering inventory questions — **Sonnet is the right default**. You reach for Opus when reasoning quality matters more than speed or cost: complex negotiation analysis, multi-step financial modeling, tasks where an error has real dollar consequences. You reach for Haiku when you're running high-volume, simple transformations: classifying 10,000 product descriptions overnight, extracting structured fields from invoices in bulk.

Day 41 covers model selection in depth. For now, default to Sonnet and move on.

### 2. `max_tokens` — Output Budget

`max_tokens` is a hard cap on the *output* length. It has nothing to do with how long your input can be — that's the context window (which you covered on Day 11). Claude stops generating when it hits `max_tokens`, even mid-sentence.

Common values and when to use them:

| Value | Good for |
|---|---|
| `256` | Classifications, yes/no with rationale, short extractions |
| `1024` | Most conversational responses, brief summaries |
| `4096` | Detailed analysis, longer-form writing |
| `8192+` | Extended reports, code generation, complex reasoning chains |

One important nuance: you pay for tokens *generated*, not for the budget you set. Setting `max_tokens=4096` on a call that only produces 200 tokens costs the same as setting `max_tokens=200`. The budget is a ceiling, not a commitment. Set it conservatively for predictable tasks (classification), generously for open-ended ones (code generation).

### 3. `system` — Identity and Constraints

The system prompt runs before your first user message and defines who Claude is for this conversation. It's the most important text you write — more on this tomorrow. For today, know that it accepts a plain string and that it's treated with higher authority than user messages.

A minimal but functional system prompt for Earnventory:

```python
system = """You are an invoice analysis assistant for Earnventory, a wholesale inventory management platform.

You help buyers analyze supplier pricing, flag margin risks, and draft purchase order communications.

You respond in clear, direct language. You never fabricate pricing data — if the information isn't in the invoice, say so explicitly."""
```

Compare this to "You are a helpful assistant." Same underlying model. Dramatically different behavior — which is the point of tomorrow's snippet.

### 4. `messages` — Conversation History

`messages` is a list of conversation turns, each with a `role` (`"user"` or `"assistant"`) and `content` (text). For a single-turn call, this is just one user message:

```python
messages = [
    {"role": "user", "content": "Summarize this invoice: [invoice text here]"}
]
```

For multi-turn conversations — a supplier negotiation assistant that remembers earlier context, for example — you append the assistant's previous responses and the next user message:

```python
messages = [
    {"role": "user", "content": "Summarize our Q2 supplier invoices."},
    {"role": "assistant", "content": "Here is the Q2 summary: ..."},
    {"role": "user", "content": "Which supplier had the highest invoice total?"}
]
```

This is how you maintain conversational context. The API is completely stateless — it has no memory of previous calls. Every call starts fresh. You pass the entire conversation history each time, and the model reasons from it.

This statelessness is why context engineering (Day 14) is a first-class engineering discipline: you decide what goes into `messages`, and you're paying for every token in that list on every call.

---

## Reading the Response

The response object is a structured Python object with several fields worth knowing:

```
response
├── id               → unique request ID (useful for logging and debugging)
├── model            → which model was actually invoked
├── stop_reason      → "end_turn" | "tool_use" | "max_tokens" | "stop_sequence"
├── content          → list of content blocks
│   └── [0]
│       ├── type     → "text" (or "tool_use" when Claude wants a tool)
│       └── text     → the generated text (only present when type == "text")
└── usage
    ├── input_tokens  → tokens consumed from your input (system + messages)
    └── output_tokens → tokens generated in the response
```

### `stop_reason` Is the Most Important Field for Agents

`stop_reason` tells you *why* Claude stopped generating. For a simple chat interface, you only care about `end_turn`. Once you introduce tools, `tool_use` becomes the branch that drives your entire agentic loop — which you'll build from scratch on Day 39.

| stop_reason | Meaning | What your code does |
|---|---|---|
| `end_turn` | Claude is done, no tool needed | Use `response.content[0].text`; optionally continue |
| `tool_use` | Claude wants to call a tool | Parse the tool_use block, execute the tool, return result, call again |
| `max_tokens` | Hit the output budget | Increase `max_tokens` or handle truncation gracefully |
| `stop_sequence` | Hit a custom stop string | Rare; only if you set `stop_sequences` parameter |

In production code, always check `stop_reason` before accessing `response.content[0].text`. If `stop_reason` is `"tool_use"`, the content list may not contain a text block — it contains a tool_use block instead.

---

## The Round-Trip Visualized

```
Your Python Code
      │
      │  client.messages.create(
      │    model="claude-sonnet-4-6",
      │    system="...",
      │    messages=[{"role": "user", "content": "..."}],
      │    max_tokens=1024
      │  )
      │
      │  (one HTTPS POST request)
      │
      ▼
┌─────────────────────────────────────┐
│         Anthropic API               │
│                                     │
│  1. Authenticate (API key)          │
│  2. Tokenize all input              │
│  3. Route to model                  │
│  4. Generate tokens until stop      │
│     condition (end_turn, tool_use,  │
│     max_tokens, stop_sequence)      │
│  5. Detokenize output               │
│  6. Return response object          │
└─────────────────────────────────────┘
      │
      │  response.content[0].text
      │  response.stop_reason
      │  response.usage.input_tokens
      │  response.usage.output_tokens
      │
      ▼
Your Python Code
```

The round-trip is a single HTTPS request. There is no persistent connection, no server-side session, no memory maintained between calls on Anthropic's end. Every call is stateless. You bring all the context; Anthropic provides the inference.

---

## Streaming: When It Matters

The default API call blocks until the full response is ready, then returns it. For user-facing features where you want responses to appear word-by-word — as you see in Claude.ai — use the streaming interface:

```python
with client.messages.stream(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system="You are an Earnventory assistant.",
    messages=[{"role": "user", "content": "Analyze this invoice..."}]
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
```

Streaming yields tokens as they're generated. For an Earnventory supplier chat interface or a real-time negotiation assistant, streaming dramatically improves perceived responsiveness — the user sees output appear after 200ms rather than waiting 3+ seconds for the full response. For batch jobs processing invoices overnight, the non-streaming API is simpler and fine.

---

## Common First-Call Mistakes

**1. Missing `ANTHROPIC_API_KEY`.**
The SDK reads it from the environment automatically. If it's not set, you get an `AuthenticationError`. Store it in a `.env` file and load it with `python-dotenv` — never hardcode it in source.

```python
from dotenv import load_dotenv
load_dotenv()
# Now os.environ["ANTHROPIC_API_KEY"] is set, and the SDK picks it up
```

**2. Treating `response.content` as a string.**
`response.content` is a *list* of content blocks. Always use `response.content[0].text`. For responses with multiple content blocks (text + tool calls), you need to iterate.

**3. Not checking `stop_reason`.**
If `max_tokens` is too low, Claude truncates mid-sentence and sets `stop_reason = "max_tokens"`. If you access `response.content[0].text` without checking, you'll silently process truncated output. In production, always validate.

```python
if response.stop_reason == "max_tokens":
    # handle truncation: increase max_tokens, chunk the request, or log for review
    raise ValueError(f"Response truncated. Increase max_tokens above {max_tokens}.")
```

**4. Assuming the API maintains state.**
It doesn't. If you want Claude to remember earlier turns, include them in `messages`. This is the most common conceptual error for developers coming from chat interfaces where state is managed invisibly.

---

## A Working Earnventory Starting Point

Here's a real-world starting point — not toy code, but something you could actually ship:

```python
import anthropic
import json
import os

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

def analyze_supplier_invoice(invoice_text: str) -> dict:
    """Extract structured data from a supplier invoice."""
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system="""You are an invoice analysis assistant for Earnventory.

Extract the following from supplier invoices and return as valid JSON:
{
  "supplier_name": "string",
  "invoice_date": "YYYY-MM-DD",
  "invoice_number": "string",
  "total_amount": number,
  "currency": "string",
  "line_items": [
    {"description": "string", "quantity": number, "unit_price": number, "total": number}
  ],
  "payment_terms": "string"
}

Return only the JSON object, no explanation or markdown.""",
        messages=[
            {"role": "user", "content": f"<invoice>\n{invoice_text}\n</invoice>"}
        ]
    )

    if response.stop_reason == "max_tokens":
        raise ValueError("Invoice too long — response truncated")

    return json.loads(response.content[0].text)
```

Notice what's happening here:

- The system prompt gives Claude a specific, constrained job (extract → return JSON). It specifies the exact schema, eliminating ambiguity.
- The user message wraps the invoice in XML tags. This is a Day 38 technique that you'll learn in depth — XML tags give the model clear delimiters for what's "data" vs. "instructions."
- The function validates `stop_reason` before accessing content.
- It returns a parsed dict, not raw text — the interface is typed and usable.

This is production-quality structure from the first day. No toy examples, no "print the answer" scripts. You start with something you'd actually ship.

---

## What the Four Parameters Unlock

```
model         →  intelligence level, speed, cost tier
max_tokens    →  output budget (ceiling, not commitment)
system        →  identity, constraints, output format expectations
messages      →  conversation history (you manage it; API is stateless)

response
├── content[0].text   →  what Claude said
├── stop_reason       →  why Claude stopped (drives your loop logic)
└── usage             →  cost accounting (track in production)
```

Every agent feature you've seen in Zazu — the daily learning snippet delivery, the morning digest, the nightly analytics — starts with a call structured exactly like this. The complexity comes from what surrounds the call: the system prompt you've engineered, the message history you've accumulated, the tools you've added, the loop you've wrapped around it.

But the core call is always four parameters and one response object. That's the atom. Everything else is chemistry.

---

## Tomorrow

Same call. Completely different behavior. Day 37 is about system prompts — what makes them actually work. You'll see a before/after comparison that shows how dramatically the same model, messages, and max_tokens can produce different quality output based entirely on the system prompt. The difference between a weak system prompt and a strong one is larger than the difference between Haiku and Opus for most tasks.

---

## Free Resources

1. **Anthropic Messages API reference** — the canonical parameter reference: every field in the request and response, all error types, rate limits, and versioning. Bookmark this; you'll return to it constantly: https://docs.anthropic.com/en/api/messages

2. **Claude Cookbook** — practical, working code examples for common patterns: streaming, tool use, structured output, multi-turn conversations, and more. The cookbook is what you reach for when you know the concept and want working code: https://platform.claude.com/cookbook/

---

*Day 36 of 50 | Mini-Module 2.3: Building an Agent from Scratch | AI Agents Curriculum — Designed by Abeiku for Dad*
